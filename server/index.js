// Portfolio Uploader API: reads and writes the portfolio's own content (site/src/data/projects.json, one file with the
// three languages as field_en and field_es) and its case images (site/public/assets/projects/<id>-<n>.webp plus the
// -640 copy). Every save goes through the site's content standard (site/scripts/description-rules.mjs, the same rules
// the build runs), so a project the uploader saves never breaks `npm run build`.
const path = require('path');
const fsPromises = require('fs/promises');
const { pathToFileURL } = require('url');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const sharp = require('sharp');
const sanitizeHtml = require('sanitize-html');

dotenv.config({ path: path.join(__dirname, '.env') });

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

const SITE_ROOT = path.resolve(__dirname, process.env.SITE_ROOT || path.join('..', '..', 'site'));
const FILES = {
  projects: process.env.PROJECTS_FILE || 'src/data/projects.json',
  profile: process.env.PROFILE_FILE || 'src/data/profile.json',
  home: process.env.HOME_FILE || 'src/data/home.json',
  performance: process.env.PERFORMANCE_FILE || 'src/data/performance.json',
  rules: process.env.RULES_FILE || 'scripts/description-rules.mjs',
};
const PUBLIC_DIR = 'public';
const ASSETS_DIR = (process.env.ASSETS_DIR || 'public/assets/projects').replace(/\\/g, '/');

const LOCALES = ['pt', 'en', 'es'];
const SUFFIX = { pt: '', en: '_en', es: '_es' };
const TYPES = ['loja', 'landing'];
const TONES = ['', 'brand', 'light', 'strong', 'dark'];
const NO_BREAK_SPACE = new RegExp(`&nbsp;|${String.fromCharCode(160)}`, 'g');
// Key order of a new project, the same as the projects imported from the previous site.
const FIELD_ORDER = [
  'id', 'legacyId', 'featured', 'order', 'title', 'platform', 'period', 'period_en', 'period_es', 'sort', 'type',
  'tone', 'summary', 'summary_en', 'summary_es', 'description', 'description_en', 'description_es', 'stack', 'url',
  'offline', 'partner', 'role', 'role_en', 'role_es', 'example', 'adult', 'performance', 'images',
];
const MONTHS = {
  pt: ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'],
};

let writeQueue = Promise.resolve();
let rulesModule = null;
let ollamaModelsCache = { loadedAt: 0, models: [] };

app.use(cors());
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
  return sanitizeHtml(String(rawHtml || '').replace(NO_BREAK_SPACE, ' '), {
    allowedTags: ['p', 'h2', 'ul', 'ol', 'li', 'strong', 'em'],
    allowedAttributes: {},
    transformTags: { b: 'strong', i: 'em', h1: 'h2', h3: 'h2', h4: 'h2', div: 'p' },
  })
    .replace(/<li>\s*<p>/g, '<li>')
    .replace(/<\/p>\s*<\/li>/g, '</li>')
    .replace(/<\/p>\s*<p>(?=[^<]*<\/li>)/g, ' ')
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

function plainText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/** "2024-08" and "2025-01" -> the period line in each language and the sort key (yyyymm of the end). */
function formatPeriod(start, end) {
  const [y1, m1] = start.split('-').map(Number);
  const [y2, m2] = end.split('-').map(Number);
  const out = {};
  for (const locale of LOCALES) {
    const a = MONTHS[locale][m1 - 1];
    const b = MONTHS[locale][m2 - 1];
    const of = locale === 'en' ? ' ' : ' de ';
    const to = locale === 'en' ? ' to ' : ' a ';
    if (y1 === y2 && m1 === m2) out[locale] = `${a}${of}${y1}`;
    else if (y1 === y2) out[locale] = `${a}${to}${b}${of}${y1}`;
    else out[locale] = `${a}${of}${y1}${to}${b}${of}${y2}`;
  }
  return { period: out.pt, period_en: out.en, period_es: out.es, sort: y2 * 100 + m2 };
}

/** The Portuguese period line back to its months ("set. a dez. de 2023" -> 2023-09, 2023-12); null if unreadable. */
function parsePeriod(period) {
  const match = /^([a-zç]+)\.(?: de (\d{4}))?(?: a ([a-zç]+)\.)?(?: de (\d{4}))?$/.exec(String(period || '').trim());
  if (!match) return null;
  const month = (token) => MONTHS.pt.indexOf(`${token}.`) + 1;
  const m1 = month(match[1]);
  const m2 = match[3] ? month(match[3]) : m1;
  const y2 = Number(match[4] || match[2]);
  const y1 = Number(match[2] || match[4]);
  if (!m1 || !m2 || !y1 || !y2) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return { start: `${y1}-${pad(m1)}`, end: `${y2}-${pad(m2)}` };
}

function orderKeys(project) {
  const ordered = {};
  for (const key of FIELD_ORDER) if (key in project) ordered[key] = project[key];
  for (const [key, value] of Object.entries(project)) if (!(key in ordered)) ordered[key] = value;
  return ordered;
}

function parsePayload(raw) {
  if (!raw) throw createHttpError(400, 'Payload ausente: envie o campo "payload".');
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw createHttpError(400, 'Payload inválido: o campo "payload" precisa ser JSON.');
  }
}

/** Field rules of the form; the content standard of the texts runs afterwards on the assembled project. */
function validatePayload(payload, profile) {
  const errors = [];
  const text = (value) => typeof value === 'string' && value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(payload.id || ''))) {
    errors.push('Endereço do case (id): só letras minúsculas, números e hífen, como "aurora-tecidos".');
  }
  if (!text(payload.title)) errors.push('Nome do projeto é obrigatório.');
  if (!text(payload.platform)) errors.push('Plataforma é obrigatória.');
  if (!TYPES.includes(payload.type)) errors.push('Tipo precisa ser Loja ou Landing page.');
  if (!TONES.includes(payload.tone ?? '')) errors.push('Fundo do card inválido.');
  const month = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!month.test(String(payload.start || '')) || !month.test(String(payload.end || ''))) {
    errors.push('Período: informe o mês de início e o de fim.');
  } else if (payload.start > payload.end) {
    errors.push('Período: o início vem antes do fim.');
  }
  if (payload.url && !/^https?:\/\/\S+$/i.test(payload.url)) errors.push('Link da loja precisa começar com http:// ou https://.');
  if (payload.offline && !payload.url) errors.push('"Loja fora do ar" precisa do link da loja (ele fica guardado, sem botão ativo).');
  if (payload.partner && !profile.partners?.[payload.partner]) errors.push(`Parceiro "${payload.partner}" não existe em profile.json.`);
  if (!Array.isArray(payload.stack) || !payload.stack.some((item) => text(item))) errors.push('Adicione ao menos uma tecnologia.');
  if (!Array.isArray(payload.gallery) || payload.gallery.length === 0) errors.push('Adicione ao menos uma imagem.');
  for (const locale of LOCALES) {
    const texts = payload.texts?.[locale] || {};
    if (payload.partner && !text(texts.role)) errors.push(`Minha atuação (${locale.toUpperCase()}) é obrigatória quando há parceria.`);
  }
  return errors;
}

/** Applies the form on top of the stored project (or a new one), keeping fields the form does not edit. */
function assembleProject(existing, payload) {
  const project = existing ? { ...existing } : { id: payload.id, legacyId: '', featured: false, order: null };
  project.featured = Boolean(payload.featured);
  project.title = plainText(payload.title);
  project.platform = plainText(payload.platform);
  if (/^\d{4}-\d{2}$/.test(payload.start) && /^\d{4}-\d{2}$/.test(payload.end)) Object.assign(project, formatPeriod(payload.start, payload.end));
  project.type = payload.type;
  project.tone = payload.tone || '';
  // A text nobody changed keeps its stored form (spacing between tags included), so a save touches only what was edited.
  const keep = (key, value, normalize) => (existing && normalize(existing[key]) === value ? existing[key] : value);
  for (const locale of LOCALES) {
    const texts = payload.texts?.[locale] || {};
    project[`summary${SUFFIX[locale]}`] = keep(`summary${SUFFIX[locale]}`, plainText(texts.summary), plainText);
    project[`description${SUFFIX[locale]}`] = keep(`description${SUFFIX[locale]}`, normalizeDescription(texts.description), normalizeDescription);
  }
  project.stack = payload.stack.map(plainText).filter(Boolean);
  project.url = plainText(payload.url);
  project.offline = Boolean(payload.offline && payload.url);
  project.partner = payload.partner || '';
  project.role = project.partner ? plainText(payload.texts?.pt?.role) : '';
  for (const locale of ['en', 'es']) {
    if (project.partner) project[`role${SUFFIX[locale]}`] = plainText(payload.texts?.[locale]?.role);
    else delete project[`role${SUFFIX[locale]}`];
  }
  if (!('example' in project)) project.example = false;
  project.adult = Boolean(payload.adult);
  // The performance panel never shows for a store that is no longer online.
  project.performance = Boolean(payload.performance) && !project.offline;
  if (!project.images) project.images = [];
  return existing ? project : orderKeys(project);
}

/** Featured projects form the "Cases em produção" rail in `order` (0, 1, 2...); the others have order null. */
function normalizeFeaturedOrder(projects) {
  const featured = projects.filter((p) => p.featured).sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  featured.forEach((p, index) => { p.order = index; });
  projects.filter((p) => !p.featured).forEach((p) => { p.order = null; });
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

/** Section titles are fixed names: the translation takes the canonical name of the same section, by position. */
async function canonicalSections(sourceHtml, translatedHtml, locale) {
  const { SECTIONS } = await getRules();
  const names = (key) => SECTIONS[key].map((name) => name.replace('?', ''));
  const pt = names('description');
  const target = names(`description${SUFFIX[locale]}`);
  const heads = [...String(sourceHtml).matchAll(/<h2>([\s\S]*?)<\/h2>/g)].map((match) => match[1].trim());
  let index = 0;
  return translatedHtml.replace(/<h2>[\s\S]*?<\/h2>/g, (original) => {
    const at = pt.indexOf(heads[index]);
    index += 1;
    return at >= 0 ? `<h2>${target[at]}</h2>` : original;
  });
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
      descriptionHtml: await canonicalSections(request.content.descriptionHtml, descriptionHtml, locale),
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

function listItem(project, measured, issues) {
  return {
    id: project.id,
    title: project.title,
    platform: project.platform,
    type: project.type,
    period: project.period,
    sort: project.sort,
    featured: Boolean(project.featured),
    order: project.order ?? null,
    offline: Boolean(project.offline),
    adult: Boolean(project.adult),
    performance: Boolean(project.performance),
    partner: project.partner || '',
    example: Boolean(project.example),
    measured: Boolean(measured[project.id]),
    cover: project.images?.[0] ? smallSrc(project.images[0].src) : '',
    issues,
  };
}

function measurementSummary(run) {
  if (!run) return null;
  return {
    mobile: run.mobile?.score ?? null,
    desktop: run.desktop?.score ?? null,
    fetchTime: run.mobile?.fetchTime || run.desktop?.fetchTime || '',
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, siteRoot: SITE_ROOT });
});

app.get(
  '/api/meta',
  asyncHandler(async (req, res) => {
    const [projects, profile, rules] = await Promise.all([readJson(FILES.projects), readJson(FILES.profile), getRules()]);
    const count = (list) => {
      const counts = new Map();
      list.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
      return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([item]) => item);
    };
    res.json({
      siteRoot: SITE_ROOT,
      partners: Object.entries(profile.partners || {}).map(([key, partner]) => ({ key, name: partner.name, logo: `/${partner.logo}` })),
      platforms: count(projects.map((p) => p.platform)),
      stacks: count(projects.flatMap((p) => p.stack || [])),
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
    res.json({ projects: projects.map((p) => listItem(p, measured, checkProject(p).length)) });
  })
);

app.get(
  '/api/projects/:id',
  asyncHandler(async (req, res) => {
    const [projects, measured] = await Promise.all([readJson(FILES.projects), readJson(FILES.performance, {})]);
    const project = projects.find((p) => p.id === req.params.id);
    if (!project) throw createHttpError(404, `Projeto "${req.params.id}" não encontrado.`);
    const months = parsePeriod(project.period) || { start: '', end: '' };
    res.json({
      id: project.id,
      title: project.title,
      platform: project.platform,
      type: project.type,
      tone: project.tone || '',
      start: months.start,
      end: months.end,
      url: project.url || '',
      offline: Boolean(project.offline),
      featured: Boolean(project.featured),
      order: project.order ?? null,
      adult: Boolean(project.adult),
      performance: Boolean(project.performance),
      partner: project.partner || '',
      example: Boolean(project.example),
      stack: project.stack || [],
      texts: Object.fromEntries(LOCALES.map((locale) => [locale, {
        summary: project[`summary${SUFFIX[locale]}`] || '',
        description: project[`description${SUFFIX[locale]}`] || '',
        role: project[`role${SUFFIX[locale]}`] || '',
      }])),
      images: project.images || [],
      measurement: measurementSummary(measured[project.id]),
    });
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
    const project = assembleProject(existing, { ...payload, stack: payload.stack || [] });
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
    const fieldErrors = validatePayload(payload, profile);
    if (fieldErrors.length) throw createHttpError(400, 'Confira os campos do formulário.', fieldErrors);

    const index = projects.findIndex((p) => p.id === payload.id);
    if (mode === 'create' && index >= 0) throw createHttpError(409, `Já existe um projeto com o endereço "${payload.id}".`);
    if (mode === 'edit' && index < 0) throw createHttpError(404, `Projeto "${payload.id}" não encontrado.`);
    const existing = index >= 0 ? projects[index] : null;

    // The texts are checked before any image is written, so a refused save leaves no files behind.
    const draft = assembleProject(existing, payload);
    const errors = await contentErrors({ ...draft, images: [] });
    if (errors.length) throw createHttpError(422, 'Os textos não seguem o padrão das descrições.', errors);

    const previousImages = existing?.images || [];
    draft.images = await materializeGallery(payload.id, payload.gallery, uploads, previousImages);
    if (mode === 'create') {
      if (draft.featured) draft.order = projects.filter((p) => p.featured).length;
      projects.push(draft);
    } else {
      if (draft.featured && !existing.featured) draft.order = projects.filter((p) => p.featured).length;
      projects[index] = draft;
    }
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

async function bootstrap() {
  for (const file of [FILES.projects, FILES.profile, FILES.rules]) {
    if (!(await fileExists(resolveSitePath(file)))) throw new Error(`Arquivo do site não encontrado: ${resolveSitePath(file)}. Confira SITE_ROOT no .env.`);
  }
  await getRules();
  app.listen(PORT, () => {
    console.log(`[uploader-api] http://localhost:${PORT}`);
    console.log('[uploader-api] site:', SITE_ROOT);
    console.log('[uploader-api] ollama:', { url: OLLAMA_URL, model: OLLAMA_MODEL });
  });
}

bootstrap().catch((error) => {
  console.error('[startup-error]', error.message);
  process.exit(1);
});
