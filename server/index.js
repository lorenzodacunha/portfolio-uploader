// Portfolio Uploader API: reads and writes the portfolio's own content (site/src/data/projects.json, one file with the
// three languages as field_en and field_es) and its case images (site/public/assets/projects/<id>-<n>.webp plus the
// -640 copy). Every save goes through the site's content standard (site/scripts/description-rules.mjs, the same rules
// the build runs), so a project the uploader saves never breaks `npm run build` of the site.
//
// One server for everything: the API under /api and the interface on the same port. `npm run dev` mounts Vite in
// middleware mode (hot reload); `npm start` serves the build in dist/ (`npm run build`).
import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import sharp from 'sharp';
import sanitizeHtml from 'sanitize-html';
import {
  LOCALES, SUFFIX, TONES, TYPES, assembleProject, byUse, canonicalSections, listItem, measurementSummary, normalizeFeaturedOrder,
  placeFeatured, plainText, projectDetail, tidyDescription, validatePayload,
} from '../shared/project.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV = process.argv.includes('--dev');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

const app = express();
const PORT = Number(process.env.PORT || 3333);
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 20);
const MAX_UPLOAD_FILES = Number(process.env.MAX_UPLOAD_FILES || 40);
const IMAGE_WIDTH = Number(process.env.IMAGE_WIDTH || 1280);
const IMAGE_SMALL_WIDTH = Number(process.env.IMAGE_SMALL_WIDTH || 640);
const WEBP_QUALITY = Number(process.env.WEBP_QUALITY || 82);
const OLLAMA_URL = String(process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = String(process.env.OLLAMA_MODEL || 'llama3.1:70b').trim();
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 300000);
const OLLAMA_MAX_RETRIES = 2;

const SITE_ROOT = path.resolve(ROOT, process.env.SITE_ROOT || path.join('..', 'site'));
const SITE_URL = String(process.env.SITE_URL || 'http://localhost:4321').replace(/\/+$/, '');
const FILES = {
  projects: process.env.PROJECTS_FILE || 'src/data/projects.json',
  profile: process.env.PROFILE_FILE || 'src/data/profile.json',
  home: process.env.HOME_FILE || 'src/data/home.json',
  performance: process.env.PERFORMANCE_FILE || 'src/data/performance.json',
  rules: process.env.RULES_FILE || 'scripts/description-rules.mjs',
};
const PUBLIC_DIR = 'public';
const ASSETS_DIR = (process.env.ASSETS_DIR || 'public/assets/projects').replace(/\\/g, '/');

const NO_BREAK_SPACE = new RegExp(`&nbsp;|${String.fromCharCode(160)}`, 'g');
let writeQueue = Promise.resolve();
let rulesModule = null;
let ollamaModelsCache = { loadedAt: 0, models: [] };

app.use(express.json({ limit: '2mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024, files: MAX_UPLOAD_FILES },
});

function withWriteLock(task) {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function createHttpError(status, message, errors) {
  const error = new Error(message);
  error.status = status;
  if (errors) error.errors = errors;
  return error;
}

function resolveSitePath(relativePath) {
  const absolute = path.resolve(SITE_ROOT, relativePath);
  const relative = path.relative(SITE_ROOT, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw createHttpError(400, `Caminho fora da pasta do site: ${relativePath}`);
  }
  return absolute;
}

async function fileExists(absolutePath) {
  try {
    await fsPromises.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(relativePath, fallback) {
  try {
    return JSON.parse(await fsPromises.readFile(resolveSitePath(relativePath), 'utf8'));
  } catch (error) {
    if (fallback !== undefined && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(relativePath, value, indent = 2) {
  const absolute = resolveSitePath(relativePath);
  const temp = `${absolute}.tmp`;
  await fsPromises.writeFile(temp, `${JSON.stringify(value, null, indent)}\n`, 'utf8');
  await fsPromises.rename(temp, absolute);
}

async function getRules() {
  if (!rulesModule) rulesModule = await import(pathToFileURL(resolveSitePath(FILES.rules)).href);
  return rulesModule;
}

// ---------- content ----------

/** The standard allows p, h2, ul, ol, li, strong and em, with no attributes; the editor's markup is folded into it. */
function normalizeDescription(rawHtml) {
  const html = sanitizeHtml(String(rawHtml || '').replace(NO_BREAK_SPACE, ' '), {
    allowedTags: ['p', 'h2', 'ul', 'ol', 'li', 'strong', 'em'],
    allowedAttributes: {},
    transformTags: { b: 'strong', i: 'em', h1: 'h2', h3: 'h2', h4: 'h2', div: 'p' },
  });
  return tidyDescription(html);
}

function parsePayload(raw) {
  if (!raw) throw createHttpError(400, 'Payload ausente: envie o campo "payload".');
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw createHttpError(400, 'Payload inválido: o campo "payload" precisa ser JSON.');
  }
}

async function contentErrors(project) {
  const { checkProject } = await getRules();
  return checkProject(project);
}

// ---------- images ----------

function smallSrc(src) {
  return String(src || '').replace(/\.webp$/, `-${IMAGE_SMALL_WIDTH}.webp`);
}

/** Image stems the home mosaic uses (home.json "mosaic": "aurora-tecidos-2"...): those files are never deleted. */
async function mosaicStems() {
  const home = await readJson(FILES.home, {});
  return new Set((home.mosaic || []).flat());
}

function stemOf(src) {
  return path.posix.basename(String(src || ''), '.webp');
}

async function nextImageNumber(projectId) {
  const dir = resolveSitePath(ASSETS_DIR);
  await fsPromises.mkdir(dir, { recursive: true });
  const pattern = new RegExp(`^${projectId}-(\\d+)\\.webp$`);
  let max = 0;
  for (const name of await fsPromises.readdir(dir)) {
    const match = pattern.exec(name);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

async function writeCaseImage(buffer, projectId, number) {
  const name = `${projectId}-${number}.webp`;
  const dir = resolveSitePath(ASSETS_DIR);
  let large;
  let small;
  try {
    const source = sharp(buffer).rotate();
    large = await source.clone().resize({ width: IMAGE_WIDTH, withoutEnlargement: true }).webp({ quality: WEBP_QUALITY, effort: 4 }).toBuffer({ resolveWithObject: true });
    small = await source.clone().resize({ width: IMAGE_SMALL_WIDTH, withoutEnlargement: true }).webp({ quality: WEBP_QUALITY, effort: 4 }).toBuffer();
  } catch {
    throw createHttpError(400, 'Não foi possível processar uma das imagens enviadas.');
  }
  await fsPromises.writeFile(path.join(dir, name), large.data);
  await fsPromises.writeFile(path.join(dir, name.replace(/\.webp$/, `-${IMAGE_SMALL_WIDTH}.webp`)), small);
  const publicBase = `/${path.posix.relative(PUBLIC_DIR, ASSETS_DIR)}`;
  return { src: `${publicBase}/${name}`, width: large.info.width, height: large.info.height };
}

function collectUploads(files) {
  const map = new Map();
  for (const file of files?.galleryFiles || []) {
    if (!String(file.mimetype || '').startsWith('image/')) {
      throw createHttpError(400, `"${file.originalname}" não é uma imagem.`);
    }
    const cut = file.originalname.indexOf('__');
    if (cut <= 0) throw createHttpError(400, `"${file.originalname}" chegou sem identificador. Envie a imagem de novo.`);
    map.set(file.originalname.slice(0, cut), file);
  }
  return map;
}

/** Gallery plan -> the project's images: existing ones keep their file, new ones become <id>-<n>.webp + -640. */
async function materializeGallery(projectId, gallery, uploads, currentImages) {
  const known = new Map((currentImages || []).map((image) => [image.src, image]));
  let number = await nextImageNumber(projectId);
  const images = [];
  for (const item of gallery) {
    if (item.kind === 'existing') {
      const image = known.get(item.src);
      if (!image) throw createHttpError(400, `Imagem ${item.src} não pertence a este projeto.`);
      images.push({ src: image.src, width: image.width, height: image.height });
      continue;
    }
    const file = uploads.get(item.fileId);
    if (!file) throw createHttpError(400, 'Uma imagem nova não chegou ao servidor. Envie de novo.');
    images.push(await writeCaseImage(file.buffer, projectId, number));
    number += 1;
  }
  return images;
}

/** Deletes the files of images that left the gallery, except the ones the home mosaic uses. */
async function removeImages(images) {
  const keep = await mosaicStems();
  const warnings = [];
  for (const image of images) {
    if (keep.has(stemOf(image.src))) {
      warnings.push(`${stemOf(image.src)} saiu do case mas o arquivo ficou: o mosaico da home (home.json) usa essa imagem.`);
      continue;
    }
    for (const src of [image.src, smallSrc(image.src)]) {
      const absolute = resolveSitePath(path.posix.join(PUBLIC_DIR, src));
      await fsPromises.rm(absolute, { force: true });
    }
  }
  return warnings;
}

// ---------- translation (local Ollama) ----------

function normalizeModelId(modelName) {
  return String(modelName || '').trim().toLowerCase().replace(/:latest$/, '');
}

function getHtmlTagTokens(html) {
  return [...String(html || '').matchAll(/<\/?([a-z0-9]+)\b[^>]*>/gi)].map((match) =>
    match[0].startsWith('</') ? `/${match[1].toLowerCase()}` : match[1].toLowerCase()
  );
}

function assertHtmlStructurePreserved(sourceHtml, translatedHtml, targetLang) {
  if (getHtmlTagTokens(sourceHtml).join('|') !== getHtmlTagTokens(translatedHtml).join('|')) {
    throw new Error(`Estrutura HTML alterada em "${targetLang}".`);
  }
}

function normalizeTranslateRequest(payload) {
  if (!payload || typeof payload !== 'object') throw createHttpError(400, 'Payload inválido para tradução.');
  const content = payload.content || {};
  const summary = plainText(content.summary);
  const descriptionHtml = normalizeDescription(content.descriptionHtml);
  const role = plainText(content.role);
  if (!summary && !descriptionHtml && !role) {
    throw createHttpError(400, 'Nada para traduzir: preencha o resumo ou a descrição em português.');
  }
  return { targets: ['en', 'es'], content: { summary, descriptionHtml, role } };
}

async function ollamaRequest(pathname, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const method = String(options.method || 'POST').toUpperCase();
  try {
    const response = await fetch(`${OLLAMA_URL}${pathname}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(options.body || {}),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const ollamaMessage = payload.error || payload.message || `HTTP ${response.status}`;
      throw createHttpError(502, `Falha no Ollama: ${ollamaMessage}`);
    }
    return payload;
  } catch (error) {
    if (error?.status) throw error;
    if (error?.name === 'AbortError') throw createHttpError(504, `O Ollama não respondeu em ${OLLAMA_TIMEOUT_MS} ms.`);
    throw createHttpError(503, 'O Ollama não está acessível. Confira se ele está rodando nesta máquina.');
  } finally {
    clearTimeout(timeout);
  }
}

async function ollamaGenerateRawResponse({ model, prompt, onTokenProgress }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: true, format: 'json', options: { temperature: 0.1 } }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw createHttpError(502, `Falha no Ollama: ${payload.error || payload.message || `HTTP ${response.status}`}`);
    }
    if (!response.body) throw createHttpError(502, 'O Ollama respondeu sem dados.');

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let raw = '';
    let lastProgressAt = Date.now();
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let lineBreak = buffer.indexOf('\n');
      while (lineBreak >= 0) {
        const line = buffer.slice(0, lineBreak).trim();
        buffer = buffer.slice(lineBreak + 1);
        lineBreak = buffer.indexOf('\n');
        if (!line) continue;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (typeof parsed.response === 'string') {
          raw += parsed.response;
          if (onTokenProgress && Date.now() - lastProgressAt >= 1200) {
            onTokenProgress(raw.length);
            lastProgressAt = Date.now();
          }
        }
        if (parsed.done) return raw;
      }
    }
    return raw;
  } catch (error) {
    if (error?.status) throw error;
    if (error?.name === 'AbortError') throw createHttpError(504, `O Ollama não respondeu em ${OLLAMA_TIMEOUT_MS} ms.`);
    throw createHttpError(503, 'O Ollama não está acessível. Confira se ele está rodando nesta máquina.');
  } finally {
    clearTimeout(timeout);
  }
}

async function getInstalledOllamaModels() {
  if (Date.now() - ollamaModelsCache.loadedAt < 30000 && ollamaModelsCache.models.length > 0) {
    return ollamaModelsCache.models;
  }
  const payload = await ollamaRequest('/api/tags', { method: 'GET' });
  const models = (payload.models || []).map((model) => model?.name).filter(Boolean);
  ollamaModelsCache = { loadedAt: Date.now(), models };
  return models;
}

function pickOllamaModel(installedModels) {
  if (!installedModels.length) throw createHttpError(404, 'Nenhum modelo no Ollama. Rode "ollama pull <modelo>".');
  const preferred = [OLLAMA_MODEL, 'llama3.1:70b', 'llama3.1:8b', 'qwen2.5:7b-instruct', 'qwen2.5:7b', 'mistral:7b-instruct', 'phi4'];
  for (const candidate of preferred.filter(Boolean)) {
    const found = installedModels.find((model) => normalizeModelId(model) === normalizeModelId(candidate));
    if (found) return found;
  }
  return installedModels[0];
}

async function buildTranslatePrompt(request) {
  const { SECTIONS } = await getRules();
  const sectionList = (key) => SECTIONS[key].map((name) => name.replace('?', '')).join(' | ');
  return [
    'Você é tradutor de estudos de caso de um portfólio de desenvolvimento Shopify.',
    'Traduza do português do Brasil para inglês (en) e para espanhol neutro da América Latina (es).',
    'Regras obrigatórias:',
    '- Retorne SOMENTE JSON válido, sem texto fora dele.',
    '- descriptionHtml: mantenha exatamente as mesmas tags, na mesma ordem, sem atributos; traduza só o texto.',
    `- Títulos de seção (<h2>) usam estes nomes fixos, na mesma posição. pt: ${sectionList('description')}. en: ${sectionList('description_en')}. es: ${sectionList('description_es')}.`,
    '- Subtítulos e rótulos em negrito terminam com dois-pontos e só a primeira palavra (e nomes próprios) em maiúscula.',
    '- Sem travessão (— ou –) e sem emoji: use vírgula, dois-pontos ou parênteses.',
    '- Não traduza nomes de marcas, lojas, plataformas e tecnologias (Shopify, Liquid, Yampi, WBuy, Tray, Nuvemshop, WordPress, GreatPages, HTML, CSS, JavaScript, JSON, Node.js, Figma).',
    '- Evite decalques do português: em inglês "look" ou "design" (não "visual" como substantivo), em espanhol "vitrina" e "estética" (não "escaparate" nem "un visual").',
    'Formato exato da resposta:',
    '{ "en": { "summary": "...", "descriptionHtml": "...", "role": "..." }, "es": { "summary": "...", "descriptionHtml": "...", "role": "..." } }',
    'Entrada:',
    JSON.stringify(request.content),
  ].join('\n');
}

async function parseTranslation(raw, request) {
  const parsed = JSON.parse(raw);
  const result = {};
  for (const locale of request.targets) {
    const item = parsed?.[locale];
    if (!item || typeof item !== 'object') throw new Error(`Idioma "${locale}" ausente na resposta.`);
    const descriptionHtml = normalizeDescription(item.descriptionHtml);
    if (request.content.descriptionHtml) assertHtmlStructurePreserved(request.content.descriptionHtml, descriptionHtml, locale);
    result[locale] = {
      summary: plainText(item.summary),
      descriptionHtml: canonicalSections((await getRules()).SECTIONS, request.content.descriptionHtml, descriptionHtml, locale),
      role: plainText(item.role),
    };
  }
  return result;
}

async function translateWithOllama(request, onProgress = () => {}) {
  onProgress('Conferindo os modelos instalados no Ollama...');
  const model = pickOllamaModel(await getInstalledOllamaModels());
  onProgress(`Modelo: ${model}`);
  const basePrompt = await buildTranslatePrompt(request);
  let lastError = null;
  for (let attempt = 0; attempt <= OLLAMA_MAX_RETRIES; attempt += 1) {
    const prompt = attempt === 0 ? basePrompt : `${basePrompt}\n\nA resposta anterior era inválida. Retorne SOMENTE o JSON pedido.`;
    try {
      onProgress(`Tentativa ${attempt + 1} de ${OLLAMA_MAX_RETRIES + 1}: traduzindo...`);
      const raw = await ollamaGenerateRawResponse({
        model,
        prompt,
        onTokenProgress: (count) => onProgress(`Recebendo a tradução... ${count} caracteres.`),
      });
      onProgress('Resposta recebida. Conferindo o JSON e a estrutura do texto...');
      const result = await parseTranslation(raw, request);
      onProgress('Tradução conferida.', 'success');
      return result;
    } catch (error) {
      lastError = error;
      onProgress(`Tentativa ${attempt + 1} falhou: ${error.message}`, 'warn');
      if (error?.status && error.status >= 500) break;
    }
  }
  if (lastError?.status) throw lastError;
  throw createHttpError(502, `O Ollama não devolveu uma tradução válida. ${lastError?.message || ''}`.trim());
}

// ---------- routes ----------

app.get('/api/health', (req, res) => {
  res.json({ ok: true, siteRoot: SITE_ROOT });
});

app.get(
  '/api/meta',
  asyncHandler(async (req, res) => {
    const [projects, profile, rules] = await Promise.all([readJson(FILES.projects), readJson(FILES.profile), getRules()]);
    res.json({
      siteRoot: SITE_ROOT,
      siteUrl: SITE_URL,
      partners: Object.entries(profile.partners || {}).map(([key, partner]) => ({ key, name: partner.name, logo: `/${partner.logo}` })),
      platforms: byUse(projects.map((p) => p.platform)),
      stacks: byUse(projects.flatMap((p) => p.stack || [])),
      sections: Object.fromEntries(LOCALES.map((locale) => [locale, rules.SECTIONS[`description${SUFFIX[locale]}`]])),
      types: TYPES,
      tones: TONES,
    });
  })
);

app.get(
  '/api/projects',
  asyncHandler(async (req, res) => {
    const [projects, measured, { checkProject }] = await Promise.all([readJson(FILES.projects), readJson(FILES.performance, {}), getRules()]);
    res.json({
      projects: projects.map((p) => listItem(p, {
        measured: measured[p.id],
        issues: checkProject(p).length,
        cover: p.images?.[0] ? smallSrc(p.images[0].src) : '',
      })),
    });
  })
);

app.get(
  '/api/projects/:id',
  asyncHandler(async (req, res) => {
    const [projects, measured] = await Promise.all([readJson(FILES.projects), readJson(FILES.performance, {})]);
    const project = projects.find((p) => p.id === req.params.id);
    if (!project) throw createHttpError(404, `Projeto "${req.params.id}" não encontrado.`);
    res.json(projectDetail(project, { measurement: measurementSummary(measured[project.id]) }));
  })
);

app.get(
  '/api/image',
  asyncHandler(async (req, res) => {
    const src = String(req.query.src || '');
    if (!/^\/assets\/[\w./-]+\.(webp|png|jpe?g|svg)$/i.test(src) || src.includes('..')) {
      throw createHttpError(400, 'Imagem inválida.');
    }
    const absolute = resolveSitePath(path.posix.join(PUBLIC_DIR, src));
    if (!(await fileExists(absolute))) throw createHttpError(404, 'Imagem não encontrada.');
    res.sendFile(absolute);
  })
);

// Checks the texts of the form against the content standard without saving.
app.post(
  '/api/check',
  asyncHandler(async (req, res) => {
    const payload = parsePayload(req.body?.payload);
    const projects = await readJson(FILES.projects);
    const existing = projects.find((p) => p.id === payload.id) || null;
    const project = assembleProject(existing, payload, normalizeDescription);
    res.json({ errors: await contentErrors(project) });
  })
);

app.post(
  '/api/featured/order',
  asyncHandler(async (req, res) => {
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds.map(String) : [];
    await withWriteLock(async () => {
      const projects = await readJson(FILES.projects);
      const featured = projects.filter((p) => p.featured);
      if (orderedIds.length !== featured.length || !featured.every((p) => orderedIds.includes(p.id))) {
        throw createHttpError(400, 'A nova ordem precisa ter todos os destaques, uma vez cada.');
      }
      featured.forEach((p) => { p.order = orderedIds.indexOf(p.id); });
      await writeJson(FILES.projects, projects);
    });
    res.json({ message: 'Ordem dos destaques salva.' });
  })
);

app.post('/api/translate/stream', async (req, res) => {
  const writeEvent = (event, payload = {}) => res.write(`${JSON.stringify({ event, ...payload })}\n`);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  const heartbeat = setInterval(() => writeEvent('ping', { ts: Date.now() }), 5000);
  try {
    const request = normalizeTranslateRequest(req.body);
    writeEvent('log', { level: 'info', message: 'Texto em português recebido. Preparando a tradução...' });
    const translations = await translateWithOllama(request, (message, level = 'info') => writeEvent('log', { level, message }));
    writeEvent('result', { translations });
  } catch (error) {
    const status = error?.status || 500;
    if (status >= 500) console.error('[translate]', error);
    writeEvent('error', { status, message: error?.message || 'Erro interno do servidor.' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

async function saveProject(req, res, mode) {
  const payload = parsePayload(req.body.payload);
  if (mode === 'edit') {
    if (payload.id && payload.id !== req.params.id) throw createHttpError(400, 'O endereço do case não muda depois de criado.');
    payload.id = req.params.id;
  }
  const uploads = collectUploads(req.files);

  const result = await withWriteLock(async () => {
    const [projects, profile] = await Promise.all([readJson(FILES.projects), readJson(FILES.profile)]);
    const fieldErrors = validatePayload(payload, profile.partners);
    if (fieldErrors.length) throw createHttpError(400, 'Confira os campos do formulário.', fieldErrors);

    const index = projects.findIndex((p) => p.id === payload.id);
    if (mode === 'create' && index >= 0) throw createHttpError(409, `Já existe um projeto com o endereço "${payload.id}".`);
    if (mode === 'edit' && index < 0) throw createHttpError(404, `Projeto "${payload.id}" não encontrado.`);
    const existing = index >= 0 ? projects[index] : null;

    // The texts are checked before any image is written, so a refused save leaves no files behind.
    const draft = assembleProject(existing, payload, normalizeDescription);
    const errors = await contentErrors({ ...draft, images: [] });
    if (errors.length) throw createHttpError(422, 'Os textos não seguem o padrão das descrições.', errors);

    const previousImages = existing?.images || [];
    draft.images = await materializeGallery(payload.id, payload.gallery, uploads, previousImages);
    placeFeatured(projects, draft, Boolean(existing?.featured));
    if (mode === 'create') projects.push(draft);
    else projects[index] = draft;
    normalizeFeaturedOrder(projects);
    await writeJson(FILES.projects, projects);

    const kept = new Set(draft.images.map((image) => image.src));
    const warnings = await removeImages(previousImages.filter((image) => !kept.has(image.src)));
    return { id: draft.id, warnings };
  });

  res.status(mode === 'create' ? 201 : 200).json({
    message: mode === 'create' ? 'Projeto criado.' : 'Alterações salvas.',
    ...result,
  });
}

const galleryUpload = upload.fields([{ name: 'galleryFiles', maxCount: MAX_UPLOAD_FILES }]);
app.post('/api/projects', galleryUpload, asyncHandler((req, res) => saveProject(req, res, 'create')));
app.put('/api/projects/:id', galleryUpload, asyncHandler((req, res) => saveProject(req, res, 'edit')));

app.delete(
  '/api/projects/:id',
  asyncHandler(async (req, res) => {
    const result = await withWriteLock(async () => {
      const projects = await readJson(FILES.projects);
      const index = projects.findIndex((p) => p.id === req.params.id);
      if (index < 0) throw createHttpError(404, `Projeto "${req.params.id}" não encontrado.`);
      const project = projects[index];
      const keep = await mosaicStems();
      const inMosaic = (project.images || []).map((image) => stemOf(image.src)).filter((stem) => keep.has(stem));
      if (inMosaic.length) {
        throw createHttpError(409, `O mosaico da home usa imagens deste projeto (${inMosaic.join(', ')}). Troque essas imagens em home.json antes de excluir.`);
      }
      projects.splice(index, 1);
      normalizeFeaturedOrder(projects);
      await writeJson(FILES.projects, projects);
      const measured = await readJson(FILES.performance, null);
      if (measured && measured[project.id]) {
        delete measured[project.id];
        await writeJson(FILES.performance, measured, 1);
      }
      await removeImages(project.images || []);
      return { id: project.id, removedImages: (project.images || []).length };
    });
    res.json({ message: 'Projeto excluído.', ...result });
  })
);

app.use((error, req, res, next) => {
  const status = error.status || (error.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  const message = error.code === 'LIMIT_FILE_SIZE' ? `Imagem acima de ${MAX_FILE_SIZE_MB} MB.` : error.message || 'Erro interno do servidor.';
  if (status >= 500) console.error('[error]', error);
  res.status(status).json({ message, status, errors: error.errors || [] });
});

app.use('/api', (req, res) => res.status(404).json({ message: 'Rota da API inexistente.', status: 404, errors: [] }));

/** The interface on the same port as the API: Vite in development, the build in dist/ otherwise. */
async function mountInterface() {
  if (DEV) {
    const { createServer } = await import('vite');
    const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
    return;
  }
  const dist = path.join(ROOT, 'dist');
  if (!(await fileExists(path.join(dist, 'index.html')))) {
    throw new Error('Interface não compilada: rode npm run build antes de npm start (ou use npm run dev).');
  }
  app.use(express.static(dist));
}

async function bootstrap() {
  for (const file of [FILES.projects, FILES.profile, FILES.rules]) {
    if (!(await fileExists(resolveSitePath(file)))) throw new Error(`Arquivo do site não encontrado: ${resolveSitePath(file)}. Confira SITE_ROOT no .env.`);
  }
  await getRules();
  await mountInterface();
  app.listen(PORT, () => {
    console.log(`[uploader] http://localhost:${PORT}${DEV ? ' (desenvolvimento)' : ''}`);
    console.log('[uploader] site:', SITE_ROOT);
    console.log('[uploader] ollama:', { url: OLLAMA_URL, model: OLLAMA_MODEL });
  });
}

bootstrap().catch((error) => {
  console.error('[startup-error]', error.message);
  process.exit(1);
});
