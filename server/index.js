const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const slugify = require('slugify');
const dotenv = require('dotenv');
const sharp = require('sharp');
const sanitizeHtml = require('sanitize-html');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = Number(process.env.PORT || 3333);
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 20);
const MAX_UPLOAD_FILES = Number(process.env.MAX_UPLOAD_FILES || 40);
const THUMB_TARGET_WIDTH = Number(process.env.THUMB_TARGET_WIDTH || 248);
const THUMB_CARD_ASPECT_RATIO = Number(process.env.THUMB_CARD_ASPECT_RATIO || (195 / 113));
const GALLERY_MAX_WIDTH = Number(process.env.GALLERY_MAX_WIDTH || 2000);
const WEBP_QUALITY = Number(process.env.WEBP_QUALITY || 82);
const OLLAMA_URL = String(process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = String(process.env.OLLAMA_MODEL || 'llama3.1:70b').trim();
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 300000);
const OLLAMA_MAX_RETRIES = 2;
const THUMB_TARGET_HEIGHT = Math.max(
  1,
  Math.round(THUMB_TARGET_WIDTH / Math.max(0.1, THUMB_CARD_ASPECT_RATIO))
);

const PORTFOLIO_ROOT = path.resolve(
  process.env.PORTFOLIO_ROOT || path.resolve(__dirname, '..', '..', 'Portfolio Produção')
);

const LOCALES = ['pt', 'en', 'es'];
const PROJECTS_FILE_BY_LOCALE = {
  pt: process.env.PROJECTS_PT_PATH || 'data/projects/projects.json',
  en: process.env.PROJECTS_EN_PATH || 'data/projects/projects-en.json',
  es: process.env.PROJECTS_ES_PATH || 'data/projects/projects-es.json',
};

const PROJECTS_ASSETS_DIR = (process.env.PROJECTS_ASSETS_DIR || 'assets/images/projects').replace(/\\/g, '/');
const PROJECTS_THUMBS_DIR = (process.env.PROJECTS_THUMBS_DIR || 'assets/images/projects/thumbs').replace(/\\/g, '/');
const ICONS_FILE_PATH = process.env.ICONS_FILE_PATH || 'js/icons.js';
const ENABLE_INLINE_STYLE = String(process.env.ENABLE_INLINE_STYLE || 'false').toLowerCase() === 'true';

const PROJECT_FIELD_ORDER = [
  'title',
  'description',
  'image',
  'initialDate',
  'endDate',
  'projectUrlLink',
  'linkedinUrlLink',
  'githubUrlLink',
  'developed',
  'developingPorcentage',
  'icons',
  'compatibility',
  'images',
];

let writeQueue = Promise.resolve();
let ollamaModelsCache = {
  loadedAt: 0,
  models: [],
};

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    files: MAX_UPLOAD_FILES,
  },
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

function assertPathInsidePortfolioRoot(targetPath) {
  const root = path.resolve(PORTFOLIO_ROOT);
  const absoluteTarget = path.resolve(targetPath);
  const relative = path.relative(root, absoluteTarget);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path outside portfolio root is not allowed: ${absoluteTarget}`);
  }
  return absoluteTarget;
}

function resolvePortfolioPath(relativePath) {
  return assertPathInsidePortfolioRoot(path.resolve(PORTFOLIO_ROOT, relativePath));
}

function normalizeRelativeAssetPath(input) {
  return String(input || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function isLikelyUrl(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^https?:\/\//i.test(trimmed);
}

function normalizeModalSlug(title) {
  return String(title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function normalizeAssetToken(value, fallback = 'projeto') {
  const normalized = slugify(String(value || ''), {
    lower: true,
    strict: true,
    trim: true,
  });
  return normalized || fallback;
}

function parseTaggedFilename(filename) {
  const index = filename.indexOf('__');
  if (index <= 0) {
    return {
      fileId: null,
      originalName: filename,
    };
  }
  return {
    fileId: filename.slice(0, index),
    originalName: filename.slice(index + 2),
  };
}

function sanitizeProjectDescription(rawHtml) {
  return sanitizeHtml(String(rawHtml || ''), {
    allowedTags: [
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      'span',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'a',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'img',
      'iframe',
      'hr',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      iframe: ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'title'],
      '*': ENABLE_INLINE_STYLE ? ['style'] : [],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedIframeHostnames: ['youtube.com', 'www.youtube.com', 'youtu.be', 'player.vimeo.com', 'vimeo.com'],
    allowProtocolRelative: false,
    parser: {
      lowerCaseTags: true,
    },
    transformTags: {
      a: (tagName, attribs) => {
        const next = { ...attribs };
        if (next.href && /^https?:\/\//i.test(next.href)) {
          next.target = '_blank';
          next.rel = 'noopener noreferrer';
        }
        return { tagName, attribs: next };
      },
    },
  });
}

function parsePayload(rawPayload) {
  if (!rawPayload) {
    throw createHttpError(400, 'Payload ausente. Envie o campo "payload" no multipart/form-data.');
  }
  try {
    return JSON.parse(rawPayload);
  } catch (error) {
    throw createHttpError(400, 'Payload inválido. O campo "payload" precisa ser JSON válido.');
  }
}

function pickCommonFields(project) {
  return {
    initialDate: project.initialDate,
    endDate: project.endDate,
    projectUrlLink: project.projectUrlLink,
    linkedinUrlLink: project.linkedinUrlLink,
    githubUrlLink: project.githubUrlLink,
    developed: project.developed,
    developingPorcentage: project.developingPorcentage,
    compatibility: project.compatibility,
    icons: Array.isArray(project.icons) ? project.icons : [],
  };
}

function orderProjectFields(project) {
  const ordered = {};
  for (const field of PROJECT_FIELD_ORDER) {
    if (field in project) {
      ordered[field] = project[field];
    }
  }
  for (const [key, value] of Object.entries(project)) {
    if (!(key in ordered)) {
      ordered[key] = value;
    }
  }
  return ordered;
}

function buildProjectObject(existingProject, localeInput, commonInput, thumbnailPath, galleryPaths) {
  const base = existingProject ? { ...existingProject } : {};
  const merged = {
    ...base,
    title: localeInput.title.trim(),
    description: sanitizeProjectDescription(localeInput.description),
    image: thumbnailPath,
    initialDate: commonInput.initialDate.trim(),
    endDate: commonInput.endDate.trim(),
    projectUrlLink: commonInput.projectUrlLink.trim(),
    linkedinUrlLink: commonInput.linkedinUrlLink.trim(),
    githubUrlLink: commonInput.githubUrlLink.trim(),
    developed: commonInput.developed,
    developingPorcentage: commonInput.developingPorcentage,
    icons: commonInput.icons.map((icon) => ({
      class: icon.class.trim(),
      tooltip: icon.tooltip.trim(),
    })),
    compatibility: commonInput.compatibility,
    images: galleryPaths,
  };
  return orderProjectFields(merged);
}

function getProjectSlugSummary(localeProjects) {
  const summary = [];
  for (const [category, list] of Object.entries(localeProjects)) {
    list.forEach((project, index) => {
      summary.push({
        slug: normalizeModalSlug(project.title),
        category,
        index,
        title: project.title,
      });
    });
  }
  return summary;
}

function findProjectBySlug(localeProjects, slug) {
  const normalized = normalizeModalSlug(slug);
  for (const [category, list] of Object.entries(localeProjects)) {
    const index = list.findIndex((project) => normalizeModalSlug(project.title) === normalized);
    if (index >= 0) {
      return {
        category,
        index,
        project: list[index],
      };
    }
  }
  return null;
}

async function readJsonFile(relativePath) {
  const absolutePath = resolvePortfolioPath(relativePath);
  const raw = await fsPromises.readFile(absolutePath, 'utf8');
  return JSON.parse(raw);
}

async function readAllProjectsFiles() {
  const [pt, en, es] = await Promise.all(
    LOCALES.map((locale) => readJsonFile(PROJECTS_FILE_BY_LOCALE[locale]))
  );
  return { pt, en, es };
}

async function writeJsonFile(relativePath, value) {
  const absolutePath = resolvePortfolioPath(relativePath);
  const tempPath = `${absolutePath}.tmp`;
  const body = `${JSON.stringify(value, null, 4)}\n`;
  await fsPromises.writeFile(tempPath, body, 'utf8');
  await fsPromises.rename(tempPath, absolutePath);
}

async function writeAllProjectsFiles(projectsByLocale) {
  for (const locale of LOCALES) {
    await writeJsonFile(PROJECTS_FILE_BY_LOCALE[locale], projectsByLocale[locale]);
  }
}

async function getKnownIcons() {
  const iconsAbsolutePath = resolvePortfolioPath(ICONS_FILE_PATH);
  let content = '';
  try {
    content = await fsPromises.readFile(iconsAbsolutePath, 'utf8');
  } catch {
    return [];
  }

  const regex = /^\s*([a-zA-Z0-9_-]+)\s*:\s*['"]assets\/icons\/skills\//gm;
  const icons = new Set();
  let match = regex.exec(content);
  while (match) {
    icons.add(match[1]);
    match = regex.exec(content);
  }
  return Array.from(icons).sort();
}

function collectUploadedFilesMap(filesByField) {
  const map = new Map();
  const allFiles = [
    ...(filesByField?.galleryFiles || []),
    ...(filesByField?.thumbnailFiles || []),
  ];

  for (const file of allFiles) {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      throw createHttpError(400, `Arquivo "${file.originalname}" não é uma imagem válida.`);
    }
    const parsed = parseTaggedFilename(file.originalname);
    if (!parsed.fileId) {
      throw createHttpError(
        400,
        `Arquivo "${file.originalname}" sem identificador interno. Reenvie o upload.`
      );
    }
    if (map.has(parsed.fileId)) {
      throw createHttpError(400, `Arquivo duplicado para id "${parsed.fileId}".`);
    }
    map.set(parsed.fileId, {
      ...file,
      extension: '.webp',
      normalizedOriginalName: parsed.originalName,
    });
  }

  return map;
}

async function fileExists(absolutePath) {
  try {
    await fsPromises.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function processImageToWebp(buffer, width) {
  try {
    return await sharp(buffer)
      .rotate()
      .resize({
        width,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: WEBP_QUALITY,
        effort: 4,
      })
      .toBuffer();
  } catch {
    throw createHttpError(400, 'Nao foi possivel processar a imagem enviada.');
  }
}

async function processThumbnailToWebp(buffer) {
  try {
    return await sharp(buffer)
      .rotate()
      .resize({
        width: THUMB_TARGET_WIDTH,
        height: THUMB_TARGET_HEIGHT,
        fit: 'cover',
        position: 'centre',
      })
      .webp({
        quality: WEBP_QUALITY,
        effort: 4,
      })
      .toBuffer();
  } catch {
    throw createHttpError(400, 'Nao foi possivel processar a thumbnail enviada.');
  }
}

async function processGalleryToWebp(buffer) {
  return processImageToWebp(buffer, GALLERY_MAX_WIDTH);
}

function normalizeHexColor(input, fallback = '#222222') {
  const value = String(input || '').trim();
  const shortMatch = value.match(/^#([a-fA-F0-9]{3})$/);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const fullMatch = value.match(/^#([a-fA-F0-9]{6})$/);
  if (fullMatch) {
    return `#${fullMatch[1].toLowerCase()}`;
  }
  return fallback;
}

async function processLogoColorThumbnailToWebp(logoBuffer, backgroundColor, paddingPercent) {
  const safePadding = Math.max(0, Math.min(40, Number.isFinite(paddingPercent) ? paddingPercent : 15));
  const color = normalizeHexColor(backgroundColor, '#222222');
  const base = sharp({
    create: {
      width: THUMB_TARGET_WIDTH,
      height: THUMB_TARGET_HEIGHT,
      channels: 4,
      background: color,
    },
  });

  const minDimension = Math.min(THUMB_TARGET_WIDTH, THUMB_TARGET_HEIGHT);
  const paddingPx = Math.round((minDimension * safePadding) / 100);
  const maxLogoWidth = Math.max(1, THUMB_TARGET_WIDTH - paddingPx * 2);
  const maxLogoHeight = Math.max(1, THUMB_TARGET_HEIGHT - paddingPx * 2);

  let logoRaster;
  try {
    logoRaster = await sharp(logoBuffer, { density: 300 })
      .rotate()
      .resize({
        width: maxLogoWidth,
        height: maxLogoHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch {
    throw createHttpError(400, 'Nao foi possivel processar a logo para gerar a thumbnail.');
  }

  return base
    .composite([
      {
        input: logoRaster,
        gravity: 'center',
      },
    ])
    .webp({
      quality: WEBP_QUALITY,
      effort: 4,
    })
    .toBuffer();
}

async function saveNewImageFile({
  file,
  targetRelativeDir,
  baseName,
  useNumericSequence,
  numericStart = 1,
  processedBuffer,
}) {
  const absoluteDir = resolvePortfolioPath(targetRelativeDir);
  await fsPromises.mkdir(absoluteDir, { recursive: true });

  let index = numericStart;
  let candidateRelativePath = '';
  let candidateAbsolutePath = '';
  let candidateName = '';

  if (useNumericSequence) {
    while (true) {
      candidateName = `${baseName}${index}${file.extension}`;
      candidateRelativePath = normalizeRelativeAssetPath(path.posix.join(targetRelativeDir, candidateName));
      candidateAbsolutePath = resolvePortfolioPath(candidateRelativePath);
      if (!(await fileExists(candidateAbsolutePath))) {
        break;
      }
      index += 1;
    }
  } else {
    let suffix = '';
    let attempt = 1;
    while (true) {
      candidateName = `${baseName}${suffix}${file.extension}`;
      candidateRelativePath = normalizeRelativeAssetPath(path.posix.join(targetRelativeDir, candidateName));
      candidateAbsolutePath = resolvePortfolioPath(candidateRelativePath);
      if (!(await fileExists(candidateAbsolutePath))) {
        break;
      }
      attempt += 1;
      suffix = `-${attempt}`;
    }
  }

  await fsPromises.writeFile(candidateAbsolutePath, processedBuffer || file.buffer);

  return {
    relativePath: candidateRelativePath,
    nextIndex: useNumericSequence ? index + 1 : numericStart,
  };
}

function validatePayloadShape(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    errors.push('Payload precisa ser um objeto JSON.');
    return errors;
  }

  if (!payload.category || typeof payload.category !== 'string') {
    errors.push('Campo "category" é obrigatório.');
  }

  if (!payload.assetFolder || typeof payload.assetFolder !== 'string') {
    errors.push('Campo "assetFolder" é obrigatório.');
  }

  if (!payload.common || typeof payload.common !== 'object') {
    errors.push('Campo "common" é obrigatório.');
  }

  if (!payload.locales || typeof payload.locales !== 'object') {
    errors.push('Campo "locales" é obrigatório.');
  }

  if (!Array.isArray(payload.galleryPlan) || payload.galleryPlan.length === 0) {
    errors.push('Campo "galleryPlan" precisa ter ao menos 1 imagem.');
  }

  if (!payload.thumbnailPlan || typeof payload.thumbnailPlan !== 'object') {
    errors.push('Campo "thumbnailPlan" é obrigatório.');
  }

  if (errors.length > 0) {
    return errors;
  }

  const common = payload.common;

  if (typeof common.initialDate !== 'string' || !common.initialDate.trim()) {
    errors.push('Campo "initialDate" é obrigatório.');
  }
  if (typeof common.endDate !== 'string' || !common.endDate.trim()) {
    errors.push('Campo "endDate" é obrigatório.');
  }
  if (typeof common.projectUrlLink !== 'string' || !isLikelyUrl(common.projectUrlLink)) {
    errors.push('Campo "projectUrlLink" deve ser vazio ou URL começando com http(s).');
  }
  if (typeof common.linkedinUrlLink !== 'string' || !isLikelyUrl(common.linkedinUrlLink)) {
    errors.push('Campo "linkedinUrlLink" deve ser vazio ou URL começando com http(s).');
  }
  if (typeof common.githubUrlLink !== 'string' || !isLikelyUrl(common.githubUrlLink)) {
    errors.push('Campo "githubUrlLink" deve ser vazio ou URL começando com http(s).');
  }
  if (typeof common.developed !== 'boolean') {
    errors.push('Campo "developed" deve ser booleano.');
  }
  if (
    typeof common.developingPorcentage !== 'number' ||
    !Number.isFinite(common.developingPorcentage) ||
    common.developingPorcentage < 0 ||
    common.developingPorcentage > 100
  ) {
    errors.push('Campo "developingPorcentage" deve ser um número entre 0 e 100.');
  }
  if (![1, 2, 3].includes(Number(common.compatibility))) {
    errors.push('Campo "compatibility" deve ser 1, 2 ou 3.');
  }

  if (!Array.isArray(common.icons) || common.icons.length === 0) {
    errors.push('Campo "icons" precisa ter ao menos 1 item.');
  } else {
    common.icons.forEach((icon, iconIndex) => {
      if (!icon || typeof icon !== 'object') {
        errors.push(`Icone #${iconIndex + 1} inválido.`);
        return;
      }
      if (!icon.class || typeof icon.class !== 'string' || !icon.class.trim()) {
        errors.push(`Icone #${iconIndex + 1} precisa de "class".`);
      }
      if (!icon.tooltip || typeof icon.tooltip !== 'string' || !icon.tooltip.trim()) {
        errors.push(`Icone #${iconIndex + 1} precisa de "tooltip".`);
      }
    });
  }

  for (const locale of LOCALES) {
    const localeData = payload.locales[locale];
    if (!localeData || typeof localeData !== 'object') {
      errors.push(`Locale "${locale}" está ausente.`);
      continue;
    }
    if (typeof localeData.title !== 'string' || !localeData.title.trim()) {
      errors.push(`Locale "${locale}" precisa de "title".`);
    }
    if (typeof localeData.description !== 'string' || !localeData.description.trim()) {
      errors.push(`Locale "${locale}" precisa de "description".`);
    }
  }

  payload.galleryPlan.forEach((item, index) => {
    if (!item || typeof item !== 'object') {
      errors.push(`galleryPlan[${index}] inválido.`);
      return;
    }
    if (!['new', 'existing'].includes(item.kind)) {
      errors.push(`galleryPlan[${index}] precisa de kind "new" ou "existing".`);
      return;
    }
    if (item.kind === 'new' && (!item.fileId || typeof item.fileId !== 'string')) {
      errors.push(`galleryPlan[${index}] com kind "new" precisa de fileId.`);
    }
    if (item.kind === 'existing' && (!item.path || typeof item.path !== 'string')) {
      errors.push(`galleryPlan[${index}] com kind "existing" precisa de path.`);
    }
  });

  if (!['new', 'existing'].includes(payload.thumbnailPlan.kind)) {
    errors.push('thumbnailPlan.kind precisa ser "new" ou "existing".');
  } else if (
    payload.thumbnailPlan.kind === 'new' &&
    (!payload.thumbnailPlan.fileId || typeof payload.thumbnailPlan.fileId !== 'string')
  ) {
    errors.push('thumbnailPlan.fileId é obrigatório quando kind é "new".');
  } else if (
    payload.thumbnailPlan.kind === 'existing' &&
    (!payload.thumbnailPlan.path || typeof payload.thumbnailPlan.path !== 'string')
  ) {
    errors.push('thumbnailPlan.path é obrigatório quando kind é "existing".');
  }

  if (payload.thumbnailConfig !== undefined && typeof payload.thumbnailConfig !== 'object') {
    errors.push('thumbnailConfig deve ser um objeto quando enviado.');
  }

  const thumbnailMode = payload.thumbnailConfig?.mode || 'image';
  if (!['image', 'logoColor'].includes(thumbnailMode)) {
    errors.push('thumbnailConfig.mode deve ser "image" ou "logoColor".');
  }

  if (thumbnailMode === 'logoColor' && payload.thumbnailPlan.kind === 'new') {
    if (
      payload.thumbnailConfig?.logoFileId !== undefined &&
      typeof payload.thumbnailConfig.logoFileId !== 'string'
    ) {
      errors.push('thumbnailConfig.logoFileId inválido.');
    }
    if (
      typeof payload.thumbnailConfig?.backgroundColor !== 'string' ||
      !payload.thumbnailConfig.backgroundColor.trim()
    ) {
      errors.push('thumbnailConfig.backgroundColor é obrigatório no modo logoColor.');
    }
    if (
      payload.thumbnailConfig?.paddingPercent !== undefined &&
      (!Number.isFinite(Number(payload.thumbnailConfig.paddingPercent)) ||
        Number(payload.thumbnailConfig.paddingPercent) < 0 ||
        Number(payload.thumbnailConfig.paddingPercent) > 40)
    ) {
      errors.push('thumbnailConfig.paddingPercent deve estar entre 0 e 40.');
    }
  }

  return errors;
}

async function ensureExistingAssetPath(relativeAssetPath) {
  const normalized = normalizeRelativeAssetPath(relativeAssetPath);
  const absolute = resolvePortfolioPath(normalized);
  const exists = await fileExists(absolute);
  if (!exists) {
    throw createHttpError(400, `Arquivo de imagem não encontrado: ${normalized}`);
  }
  return normalized;
}

async function materializeMediaPlan(payload, uploadedFilesMap, allowExistingReferences) {
  const assetFolder = normalizeAssetToken(payload.assetFolder, 'projeto');
  if (assetFolder === 'thumbs') {
    throw createHttpError(400, 'assetFolder "thumbs" não é permitido.');
  }

  const galleryTargetDir = normalizeRelativeAssetPath(path.posix.join(PROJECTS_ASSETS_DIR, assetFolder));
  const galleryPaths = [];
  let nextNumericName = 1;

  for (const item of payload.galleryPlan) {
    if (item.kind === 'existing') {
      if (!allowExistingReferences) {
        throw createHttpError(400, 'galleryPlan com path existente só é permitido em edição.');
      }
      const existingPath = await ensureExistingAssetPath(item.path);
      galleryPaths.push(existingPath);
      continue;
    }

    const file = uploadedFilesMap.get(item.fileId);
    if (!file) {
      throw createHttpError(400, `Arquivo para gallery fileId "${item.fileId}" não foi enviado.`);
    }
    const galleryBuffer = await processGalleryToWebp(file.buffer);
    const saved = await saveNewImageFile({
      file,
      targetRelativeDir: galleryTargetDir,
      baseName: assetFolder,
      useNumericSequence: true,
      numericStart: nextNumericName,
      processedBuffer: galleryBuffer,
    });
    nextNumericName = saved.nextIndex;
    galleryPaths.push(saved.relativePath);
  }

  let thumbnailPath = '';
  if (payload.thumbnailPlan.kind === 'existing') {
    if (!allowExistingReferences) {
      throw createHttpError(400, 'thumbnailPlan com path existente só é permitido em edição.');
    }
    thumbnailPath = await ensureExistingAssetPath(payload.thumbnailPlan.path);
  } else {
    const thumbnailMode = payload.thumbnailConfig?.mode || 'image';
    const thumbnailFileId =
      thumbnailMode === 'logoColor'
        ? payload.thumbnailConfig?.logoFileId || payload.thumbnailPlan.fileId
        : payload.thumbnailPlan.fileId;
    const file = uploadedFilesMap.get(thumbnailFileId);
    if (!file) {
      throw createHttpError(
        400,
        `Arquivo para thumbnail fileId "${thumbnailFileId}" não foi enviado.`
      );
    }
    const thumbBuffer =
      thumbnailMode === 'logoColor'
        ? await processLogoColorThumbnailToWebp(
            file.buffer,
            payload.thumbnailConfig?.backgroundColor,
            Number(payload.thumbnailConfig?.paddingPercent ?? 15)
          )
        : await processThumbnailToWebp(file.buffer);
    const saved = await saveNewImageFile({
      file,
      targetRelativeDir: PROJECTS_THUMBS_DIR,
      baseName: assetFolder,
      useNumericSequence: false,
      processedBuffer: thumbBuffer,
    });
    thumbnailPath = saved.relativePath;
  }

  return {
    galleryPaths,
    thumbnailPath,
    assetFolder,
  };
}

function validateCategoryExists(projectsByLocale, category) {
  const missing = LOCALES.filter((locale) => !(category in projectsByLocale[locale]));
  if (missing.length > 0) {
    throw createHttpError(
      400,
      `Categoria "${category}" não existe nos arquivos de locale: ${missing.join(', ')}.`
    );
  }
}

function assertUniqueSlugForCreate(projectsByLocale, payload) {
  for (const locale of LOCALES) {
    const newSlug = normalizeModalSlug(payload.locales[locale].title);
    const allSlugs = getProjectSlugSummary(projectsByLocale[locale]);
    if (allSlugs.some((entry) => entry.slug === newSlug)) {
      throw createHttpError(
        409,
        `Slug duplicado no locale "${locale}": "${newSlug}". Ajuste o título para manter unicidade.`
      );
    }
  }
}

function assertUniqueSlugForEdit(projectsByLocale, payload, targetsByLocale) {
  for (const locale of LOCALES) {
    const newSlug = normalizeModalSlug(payload.locales[locale].title);
    const allSlugs = getProjectSlugSummary(projectsByLocale[locale]);
    const target = targetsByLocale[locale];
    if (
      allSlugs.some(
        (entry) =>
          entry.slug === newSlug &&
          !(entry.category === target.category && entry.index === target.index)
      )
    ) {
      throw createHttpError(
        409,
        `Slug duplicado no locale "${locale}": "${newSlug}". Ajuste o título para manter unicidade.`
      );
    }
  }
}

function resolveEditTargetsByLocale(projectsByLocale, baseSlug, baseLocale) {
  const baseReference = findProjectBySlug(projectsByLocale[baseLocale], baseSlug);
  if (!baseReference) {
    throw createHttpError(404, `Projeto "${baseSlug}" não foi encontrado no locale "${baseLocale}".`);
  }

  const targets = {};
  for (const locale of LOCALES) {
    const direct = findProjectBySlug(projectsByLocale[locale], baseSlug);
    if (direct) {
      targets[locale] = direct;
      continue;
    }

    const fallback = projectsByLocale[locale]?.[baseReference.category]?.[baseReference.index];
    if (!fallback) {
      throw createHttpError(
        409,
        `Não foi possível localizar o projeto no locale "${locale}". Verifique consistência dos JSONs.`
      );
    }
    targets[locale] = {
      category: baseReference.category,
      index: baseReference.index,
      project: fallback,
    };
  }

  return targets;
}

function inferAssetFolderFromProject(project) {
  const allImages = [project.image, ...(Array.isArray(project.images) ? project.images : [])].filter(Boolean);
  for (const imagePath of allImages) {
    const segments = normalizeRelativeAssetPath(imagePath).split('/');
    const projectsIndex = segments.findIndex((segment) => segment === 'projects');
    if (projectsIndex >= 0 && segments[projectsIndex + 1] && segments[projectsIndex + 1] !== 'thumbs') {
      return segments[projectsIndex + 1];
    }
  }
  return normalizeAssetToken(project.title, 'projeto');
}

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function collectProjectAssetPaths(project) {
  const paths = [];
  if (project?.image) {
    paths.push(normalizeRelativeAssetPath(project.image));
  }
  if (Array.isArray(project?.images)) {
    project.images.forEach((item) => {
      if (item) paths.push(normalizeRelativeAssetPath(item));
    });
  }
  return Array.from(new Set(paths.filter(Boolean)));
}

async function removeAssetFileIfExists(relativeAssetPath) {
  const normalized = normalizeRelativeAssetPath(relativeAssetPath);
  if (!normalized) return false;
  const absolutePath = resolvePortfolioPath(normalized);
  if (!(await fileExists(absolutePath))) {
    return false;
  }
  await fsPromises.unlink(absolutePath);
  return true;
}

async function removeAssetDirectoryIfExists(relativeDirPath) {
  const normalized = normalizeRelativeAssetPath(relativeDirPath);
  if (!normalized) return false;
  const absolutePath = resolvePortfolioPath(normalized);
  if (!(await fileExists(absolutePath))) {
    return false;
  }
  await fsPromises.rm(absolutePath, { recursive: true, force: true });
  return true;
}

function normalizeModelId(modelName) {
  return String(modelName || '').trim().toLowerCase().replace(/:latest$/, '');
}

function getHtmlTagTokens(html) {
  const tokens = [];
  const regex = /<\/?([a-z0-9]+)\b[^>]*>/gi;
  let match = regex.exec(String(html || ''));
  while (match) {
    const fullTag = match[0];
    const name = String(match[1] || '').toLowerCase();
    tokens.push(fullTag.startsWith('</') ? `/${name}` : name);
    match = regex.exec(String(html || ''));
  }
  return tokens;
}

function getHtmlUrls(html) {
  const urls = [];
  const regex = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let match = regex.exec(String(html || ''));
  while (match) {
    urls.push(match[1]);
    match = regex.exec(String(html || ''));
  }
  return urls;
}

function assertHtmlStructurePreserved(sourceHtml, translatedHtml, targetLang) {
  const sourceTokens = getHtmlTagTokens(sourceHtml);
  const translatedTokens = getHtmlTagTokens(translatedHtml);
  if (sourceTokens.join('|') !== translatedTokens.join('|')) {
    throw new Error(`Estrutura HTML alterada no locale "${targetLang}".`);
  }

  const sourceUrls = getHtmlUrls(sourceHtml);
  const translatedUrls = getHtmlUrls(translatedHtml);
  if (sourceUrls.length !== translatedUrls.length) {
    throw new Error(`Quantidade de URLs alterada no locale "${targetLang}".`);
  }
  for (let index = 0; index < sourceUrls.length; index += 1) {
    if (sourceUrls[index] !== translatedUrls[index]) {
      throw new Error(`URL alterada no locale "${targetLang}" na posicao ${index + 1}.`);
    }
  }
}

function normalizeTranslateRequest(payload) {
  if (!payload || typeof payload !== 'object') {
    throw createHttpError(400, 'Payload invalido para traducao.');
  }

  const sourceLang = String(payload.sourceLang || '').trim().toLowerCase();
  if (sourceLang !== 'pt') {
    throw createHttpError(400, 'sourceLang deve ser "pt".');
  }

  const targets = Array.isArray(payload.targets)
    ? payload.targets
        .map((item) => String(item || '').trim().toLowerCase())
        .filter((item) => LOCALES.includes(item) && item !== sourceLang)
    : [];

  if (!targets.length) {
    throw createHttpError(400, 'Informe ao menos um locale de destino em "targets".');
  }

  const uniqueTargets = Array.from(new Set(targets));

  const content = payload.content;
  if (!content || typeof content !== 'object') {
    throw createHttpError(400, 'Campo "content" e obrigatorio.');
  }

  const title = typeof content.title === 'string' ? content.title.trim() : '';
  const descriptionHtml = typeof content.descriptionHtml === 'string' ? content.descriptionHtml : '';
  const iconsTooltips = Array.isArray(content.iconsTooltips)
    ? content.iconsTooltips.map((item) => String(item || ''))
    : [];

  if (!title && !descriptionHtml.trim() && iconsTooltips.length === 0) {
    throw createHttpError(400, 'Nada para traduzir. Preencha title, descriptionHtml ou iconsTooltips.');
  }

  return {
    sourceLang,
    targets: uniqueTargets,
    content: {
      title,
      descriptionHtml,
      iconsTooltips,
    },
  };
}

async function ollamaRequest(pathname, options = {}) {
  if (typeof fetch !== 'function') {
    throw createHttpError(500, 'Seu Node.js nao possui suporte a fetch nativo.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  const method = String(options.method || 'POST').toUpperCase();
  const body = options.body;

  try {
    const response = await fetch(`${OLLAMA_URL}${pathname}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const ollamaMessage = payload.error || payload.message || `HTTP ${response.status}`;
      if (String(ollamaMessage).toLowerCase().includes('model')) {
        throw createHttpError(
          404,
          `Modelo do Ollama indisponivel: ${ollamaMessage}. Ajuste OLLAMA_MODEL no .env.`
        );
      }
      throw createHttpError(502, `Falha no Ollama: ${ollamaMessage}`);
    }
    return payload;
  } catch (error) {
    if (error?.status) throw error;
    if (error?.name === 'AbortError') {
      throw createHttpError(504, `Timeout ao chamar Ollama (${OLLAMA_TIMEOUT_MS}ms).`);
    }
    throw createHttpError(503, 'Ollama nao esta acessivel. Verifique se esta rodando localmente.');
  } finally {
    clearTimeout(timeout);
  }
}

async function ollamaGenerateRawResponse({ model, prompt, onTokenProgress }) {
  if (typeof fetch !== 'function') {
    throw createHttpError(500, 'Seu Node.js nao possui suporte a fetch nativo.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
        format: 'json',
        options: {
          temperature: 0.1,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const ollamaMessage = payload.error || payload.message || `HTTP ${response.status}`;
      if (String(ollamaMessage).toLowerCase().includes('model')) {
        throw createHttpError(
          404,
          `Modelo do Ollama indisponivel: ${ollamaMessage}. Ajuste OLLAMA_MODEL no .env.`
        );
      }
      throw createHttpError(502, `Falha no Ollama: ${ollamaMessage}`);
    }

    if (!response.body) {
      throw createHttpError(502, 'Ollama respondeu sem stream de dados.');
    }

    const decoder = new TextDecoder('utf-8');
    let chunkBuffer = '';
    let rawResponse = '';
    let tokenCounter = 0;
    let lastProgressAt = Date.now();

    // `response.body` e AsyncIterable no Node moderno (fetch nativo).
    for await (const chunk of response.body) {
      chunkBuffer += decoder.decode(chunk, { stream: true });
      let lineBreakIndex = chunkBuffer.indexOf('\n');

      while (lineBreakIndex >= 0) {
        const line = chunkBuffer.slice(0, lineBreakIndex).trim();
        chunkBuffer = chunkBuffer.slice(lineBreakIndex + 1);
        lineBreakIndex = chunkBuffer.indexOf('\n');

        if (!line) continue;

        let parsedLine;
        try {
          parsedLine = JSON.parse(line);
        } catch {
          continue;
        }

        if (typeof parsedLine.response === 'string') {
          rawResponse += parsedLine.response;
          tokenCounter += parsedLine.response.length;
          const now = Date.now();
          if (typeof onTokenProgress === 'function' && now - lastProgressAt >= 1200) {
            onTokenProgress(tokenCounter);
            lastProgressAt = now;
          }
        }

        if (parsedLine.done) {
          return rawResponse;
        }
      }
    }

    if (chunkBuffer.trim()) {
      try {
        const last = JSON.parse(chunkBuffer.trim());
        if (typeof last.response === 'string') {
          rawResponse += last.response;
        }
      } catch {
        // Ignora sobra invalida no buffer.
      }
    }

    return rawResponse;
  } catch (error) {
    if (error?.status) throw error;
    if (error?.name === 'AbortError') {
      throw createHttpError(504, `Timeout ao chamar Ollama (${OLLAMA_TIMEOUT_MS}ms).`);
    }
    throw createHttpError(503, 'Ollama nao esta acessivel. Verifique se esta rodando localmente.');
  } finally {
    clearTimeout(timeout);
  }
}

async function getInstalledOllamaModels() {
  const now = Date.now();
  if (now - ollamaModelsCache.loadedAt < 30000 && ollamaModelsCache.models.length > 0) {
    return ollamaModelsCache.models;
  }

  const payload = await ollamaRequest('/api/tags', { method: 'GET' });
  const models = Array.isArray(payload.models)
    ? payload.models
        .map((model) => (typeof model?.name === 'string' ? model.name : ''))
        .filter(Boolean)
    : [];

  ollamaModelsCache = {
    loadedAt: now,
    models,
  };

  return models;
}

function pickOllamaModel(installedModels) {
  if (!Array.isArray(installedModels) || installedModels.length === 0) {
    throw createHttpError(404, 'Nenhum modelo Ollama encontrado. Rode "ollama pull <modelo>".');
  }

  const preferred = [
    OLLAMA_MODEL,
    'llama3.1:70b',
    'llama3.1:8b',
    'qwen2.5:7b-instruct',
    'qwen2.5:7b',
    'mistral:7b-instruct',
    'phi4',
  ].filter(Boolean);

  for (const candidate of preferred) {
    const normalizedCandidate = normalizeModelId(candidate);
    const direct = installedModels.find((model) => model.toLowerCase() === candidate.toLowerCase());
    if (direct) return direct;
    const relaxed = installedModels.find((model) => normalizeModelId(model) === normalizedCandidate);
    if (relaxed) return relaxed;
  }

  return installedModels[0];
}

function buildTranslatePrompt(requestPayload) {
  const source = {
    title: requestPayload.content.title,
    descriptionHtml: requestPayload.content.descriptionHtml,
    iconsTooltips: requestPayload.content.iconsTooltips,
  };
  const targetsText = requestPayload.targets.join(', ');

  return [
    'Voce e um tradutor tecnico de conteudo de portfolio.',
    `Traduza do portugues (pt) para os idiomas: ${targetsText}.`,
    'Regras obrigatorias:',
    '- Retorne SOMENTE JSON valido.',
    '- Preserve exatamente a estrutura HTML de descriptionHtml: mesmas tags, mesma ordem e mesmos atributos.',
    '- Traduza apenas texto visivel dentro do HTML.',
    '- Nao altere links, URLs, src, href, caminhos de arquivo.',
    '- Nao traduza nomes de tecnologias/stacks: HTML, CSS, JavaScript, TypeScript, React, Next.js, Shopify, Node, Express, MongoDB, PostgreSQL, MySQL, Tailwind, Vite, Git, API, GraphQL.',
    '- Nao traduza nomes proprios, marcas e produtos.',
    '- Nao adicione explicacoes fora do JSON.',
    'Formato EXATO da resposta:',
    '{',
    '  "en": { "title": "...", "descriptionHtml": "...", "iconsTooltips": ["..."] },',
    '  "es": { "title": "...", "descriptionHtml": "...", "iconsTooltips": ["..."] }',
    '}',
    'Entrada:',
    JSON.stringify(source),
  ].join('\n');
}

function parseAndValidateTranslationResponse(rawResponse, requestPayload) {
  const parsed = JSON.parse(rawResponse);

  for (const locale of requestPayload.targets) {
    const localeResult = parsed?.[locale];
    if (!localeResult || typeof localeResult !== 'object') {
      throw new Error(`Locale "${locale}" ausente na resposta.`);
    }

    if (typeof localeResult.title !== 'string') {
      throw new Error(`Locale "${locale}" sem "title" valido.`);
    }

    if (typeof localeResult.descriptionHtml !== 'string') {
      throw new Error(`Locale "${locale}" sem "descriptionHtml" valido.`);
    }

    if (!Array.isArray(localeResult.iconsTooltips)) {
      localeResult.iconsTooltips = [];
    }

    if (
      requestPayload.content.iconsTooltips.length > 0 &&
      localeResult.iconsTooltips.length !== requestPayload.content.iconsTooltips.length
    ) {
      throw new Error(`Locale "${locale}" retornou quantidade invalida em iconsTooltips.`);
    }

    assertHtmlStructurePreserved(
      requestPayload.content.descriptionHtml,
      localeResult.descriptionHtml,
      locale
    );

    localeResult.descriptionHtml = sanitizeProjectDescription(localeResult.descriptionHtml);
    localeResult.title = localeResult.title.trim();
    localeResult.iconsTooltips = localeResult.iconsTooltips.map((item) => String(item || '').trim());
  }

  return parsed;
}

async function translateContentWithOllama(requestPayload, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const notify = (message, level = 'info') => {
    if (!onProgress) return;
    onProgress(message, level);
  };

  notify('Validando modelos disponiveis no Ollama...');
  const installedModels = await getInstalledOllamaModels();
  const model = pickOllamaModel(installedModels);
  notify(`Modelo selecionado: ${model}`);
  const basePrompt = buildTranslatePrompt(requestPayload);

  let lastError = null;

  for (let attempt = 0; attempt <= OLLAMA_MAX_RETRIES; attempt += 1) {
    const correctionPrompt =
      attempt === 0
        ? basePrompt
        : `${basePrompt}\n\nA resposta anterior estava invalida. Retorne SOMENTE JSON valido, sem texto extra.`;

    try {
      notify(`Tentativa ${attempt + 1} de ${OLLAMA_MAX_RETRIES + 1}: gerando traducao...`);
      const rawResponse = await ollamaGenerateRawResponse({
        model,
        prompt: correctionPrompt,
        onTokenProgress: (tokenCounter) =>
          notify(`LLM em execucao... ${tokenCounter} caracteres recebidos.`),
      });
      notify('Resposta recebida. Validando JSON e estrutura HTML...');

      const parsed = parseAndValidateTranslationResponse(rawResponse, requestPayload);
      notify('Traducoes validadas com sucesso.', 'success');
      return parsed;
    } catch (error) {
      lastError = error;
      notify(`Falha na tentativa ${attempt + 1}: ${error.message}`, 'warn');
      if (error?.status && error.status >= 500) {
        break;
      }
    }
  }

  if (lastError?.status) {
    throw lastError;
  }
  throw createHttpError(
    502,
    `Nao foi possivel traduzir com o Ollama. Detalhe: ${lastError?.message || 'resposta invalida.'}`
  );
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    root: PORTFOLIO_ROOT,
  });
});

app.get(
  '/api/meta',
  asyncHandler(async (req, res) => {
    const projectsByLocale = await readAllProjectsFiles();
    const categories = Object.keys(projectsByLocale.pt);
    const knownIcons = await getKnownIcons();
    res.json({
      categories,
      knownIcons,
      locales: LOCALES,
      schemaFields: PROJECT_FIELD_ORDER,
      portfolioRoot: PORTFOLIO_ROOT,
      files: PROJECTS_FILE_BY_LOCALE,
      imageDirs: {
        galleryBase: PROJECTS_ASSETS_DIR,
        thumbs: PROJECTS_THUMBS_DIR,
      },
    });
  })
);

app.get(
  '/api/projects',
  asyncHandler(async (req, res) => {
    const lang = LOCALES.includes(req.query.lang) ? req.query.lang : 'pt';
    const categoryFilter = typeof req.query.category === 'string' ? req.query.category : 'all';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    const localeProjects = await readJsonFile(PROJECTS_FILE_BY_LOCALE[lang]);
    const projects = [];

    for (const [category, list] of Object.entries(localeProjects)) {
      list.forEach((project, index) => {
        projects.push({
          slug: normalizeModalSlug(project.title),
          category,
          index,
          title: project.title,
          image: project.image,
          initialDate: project.initialDate,
          endDate: project.endDate,
          developed: project.developed,
          compatibility: project.compatibility,
          icons: Array.isArray(project.icons) ? project.icons : [],
        });
      });
    }

    const filtered = projects.filter((project) => {
      if (categoryFilter !== 'all' && project.category !== categoryFilter) {
        return false;
      }
      if (!search) return true;
      return (
        project.title.toLowerCase().includes(search) ||
        project.slug.includes(search) ||
        project.category.toLowerCase().includes(search)
      );
    });

    res.json({
      lang,
      total: filtered.length,
      projects: filtered,
    });
  })
);

app.post(
  '/api/projects/reorder',
  asyncHandler(async (req, res) => {
    const lang = LOCALES.includes(req.query.lang) ? req.query.lang : 'pt';
    const category = typeof req.body?.category === 'string' ? req.body.category : '';
    const orderedSlugs = Array.isArray(req.body?.orderedSlugs)
      ? req.body.orderedSlugs.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
      : [];

    if (!category) {
      throw createHttpError(400, 'Campo "category" é obrigatório para reordenar.');
    }
    if (orderedSlugs.length === 0) {
      throw createHttpError(400, 'Campo "orderedSlugs" precisa conter a ordem completa.');
    }

    await withWriteLock(async () => {
      const projectsByLocale = await readAllProjectsFiles();
      validateCategoryExists(projectsByLocale, category);

      const baseList = projectsByLocale[lang][category];
      if (!Array.isArray(baseList) || baseList.length === 0) {
        throw createHttpError(400, `Categoria "${category}" não possui projetos para reordenar.`);
      }

      const currentSlugs = baseList.map((project) => normalizeModalSlug(project.title));
      if (orderedSlugs.length !== currentSlugs.length) {
        throw createHttpError(
          400,
          'A ordem enviada não bate com a quantidade total de projetos da categoria.'
        );
      }

      const seen = new Set();
      for (const slug of orderedSlugs) {
        if (seen.has(slug)) {
          throw createHttpError(400, `Slug repetido no reorder: "${slug}".`);
        }
        seen.add(slug);
      }

      for (const slug of currentSlugs) {
        if (!seen.has(slug)) {
          throw createHttpError(
            400,
            `A ordem enviada está incompleta. Slug ausente: "${slug}".`
          );
        }
      }

      const oldIndexBySlug = new Map();
      currentSlugs.forEach((slug, index) => oldIndexBySlug.set(slug, index));
      const reorderedIndices = orderedSlugs.map((slug) => oldIndexBySlug.get(slug));

      for (const locale of LOCALES) {
        const localeList = projectsByLocale[locale][category];
        projectsByLocale[locale][category] = reorderedIndices.map((index) => localeList[index]);
      }

      await writeAllProjectsFiles(projectsByLocale);
    });

    res.json({
      message: `Ordem da categoria "${category}" atualizada com sucesso.`,
      category,
      total: orderedSlugs.length,
    });
  })
);

app.get(
  '/api/projects/:slug',
  asyncHandler(async (req, res) => {
    const baseLocale = LOCALES.includes(req.query.lang) ? req.query.lang : 'pt';
    const targetSlug = req.params.slug;

    const projectsByLocale = await readAllProjectsFiles();
    const targetsByLocale = resolveEditTargetsByLocale(projectsByLocale, targetSlug, baseLocale);
    const baseTarget = targetsByLocale[baseLocale];

    const localesPayload = {};
    for (const locale of LOCALES) {
      localesPayload[locale] = {
        title: targetsByLocale[locale].project.title,
        description: targetsByLocale[locale].project.description,
      };
    }

    const baseProject = baseTarget.project;
    res.json({
      slug: normalizeModalSlug(baseProject.title),
      category: baseTarget.category,
      index: baseTarget.index,
      assetFolder: inferAssetFolderFromProject(baseProject),
      common: pickCommonFields(baseProject),
      locales: localesPayload,
      image: baseProject.image,
      images: Array.isArray(baseProject.images) ? baseProject.images : [],
    });
  })
);

app.get(
  '/api/image',
  asyncHandler(async (req, res) => {
    const relativePath = normalizeRelativeAssetPath(req.query.path || '');
    if (!relativePath || !relativePath.startsWith('assets/')) {
      throw createHttpError(400, 'Path de imagem inválido.');
    }
    const absolutePath = resolvePortfolioPath(relativePath);
    const exists = await fileExists(absolutePath);
    if (!exists) {
      throw createHttpError(404, 'Imagem não encontrada.');
    }
    res.sendFile(absolutePath);
  })
);

app.post(
  '/api/translate',
  asyncHandler(async (req, res) => {
    const requestPayload = normalizeTranslateRequest(req.body);
    const translated = await translateContentWithOllama(requestPayload);

    const responsePayload = {};
    for (const locale of requestPayload.targets) {
      responsePayload[locale] = {
        title: translated[locale].title,
        descriptionHtml: translated[locale].descriptionHtml,
        iconsTooltips: translated[locale].iconsTooltips,
      };
    }

    res.json(responsePayload);
  })
);

app.post('/api/translate/stream', async (req, res) => {
  const writeEvent = (event, payload = {}) => {
    res.write(`${JSON.stringify({ event, ...payload })}\n`);
  };

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const heartbeat = setInterval(() => {
    writeEvent('ping', { ts: Date.now() });
  }, 5000);

  try {
    const requestPayload = normalizeTranslateRequest(req.body);
    writeEvent('log', { level: 'info', message: 'Payload validado. Preparando traducao...' });

    const translated = await translateContentWithOllama(requestPayload, {
      onProgress: (message, level = 'info') => {
        writeEvent('log', { level, message });
      },
    });

    const responsePayload = {};
    for (const locale of requestPayload.targets) {
      responsePayload[locale] = {
        title: translated[locale].title,
        descriptionHtml: translated[locale].descriptionHtml,
        iconsTooltips: translated[locale].iconsTooltips,
      };
    }

    writeEvent('result', { translations: responsePayload });
  } catch (error) {
    const status = error?.status || 500;
    const message = error?.message || 'Erro interno do servidor.';

    if (status >= 500) {
      console.error('[ERROR]', error);
    } else {
      console.warn('[WARN]', message);
    }

    writeEvent('error', { status, message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

app.post(
  '/api/projects',
  upload.fields([
    { name: 'galleryFiles', maxCount: MAX_UPLOAD_FILES },
    { name: 'thumbnailFiles', maxCount: 3 },
  ]),
  asyncHandler(async (req, res) => {
    const payload = parsePayload(req.body.payload);
    const errors = validatePayloadShape(payload);
    if (errors.length > 0) {
      throw createHttpError(400, errors.join(' '));
    }

    const uploadedFilesMap = collectUploadedFilesMap(req.files);

    const result = await withWriteLock(async () => {
      const projectsByLocale = await readAllProjectsFiles();
      validateCategoryExists(projectsByLocale, payload.category);
      assertUniqueSlugForCreate(projectsByLocale, payload);

      const mediaResult = await materializeMediaPlan(payload, uploadedFilesMap, false);

      for (const locale of LOCALES) {
        const project = buildProjectObject(
          null,
          payload.locales[locale],
          {
            ...payload.common,
            compatibility: Number(payload.common.compatibility),
          },
          mediaResult.thumbnailPath,
          mediaResult.galleryPaths
        );
        projectsByLocale[locale][payload.category].push(project);
      }

      await writeAllProjectsFiles(projectsByLocale);

      return {
        slug: normalizeModalSlug(payload.locales.pt.title),
        category: payload.category,
        assetFolder: mediaResult.assetFolder,
      };
    });

    res.status(201).json({
      message: 'Projeto criado com sucesso.',
      ...result,
    });
  })
);

app.put(
  '/api/projects/:slug',
  upload.fields([
    { name: 'galleryFiles', maxCount: MAX_UPLOAD_FILES },
    { name: 'thumbnailFiles', maxCount: 3 },
  ]),
  asyncHandler(async (req, res) => {
    const payload = parsePayload(req.body.payload);
    const errors = validatePayloadShape(payload);
    if (errors.length > 0) {
      throw createHttpError(400, errors.join(' '));
    }

    const uploadedFilesMap = collectUploadedFilesMap(req.files);
    const baseSlug = req.params.slug;
    const baseLocale = LOCALES.includes(req.query.lang) ? req.query.lang : 'pt';

    const result = await withWriteLock(async () => {
      const projectsByLocale = await readAllProjectsFiles();
      const targetsByLocale = resolveEditTargetsByLocale(projectsByLocale, baseSlug, baseLocale);
      validateCategoryExists(projectsByLocale, payload.category);
      assertUniqueSlugForEdit(projectsByLocale, payload, targetsByLocale);

      const mediaResult = await materializeMediaPlan(payload, uploadedFilesMap, true);

      for (const locale of LOCALES) {
        const target = targetsByLocale[locale];
        const category = target.category;
        const index = target.index;

        if (category !== payload.category) {
          projectsByLocale[locale][category].splice(index, 1);
          const updated = buildProjectObject(
            target.project,
            payload.locales[locale],
            {
              ...payload.common,
              compatibility: Number(payload.common.compatibility),
            },
            mediaResult.thumbnailPath,
            mediaResult.galleryPaths
          );
          projectsByLocale[locale][payload.category].push(updated);
        } else {
          const updated = buildProjectObject(
            target.project,
            payload.locales[locale],
            {
              ...payload.common,
              compatibility: Number(payload.common.compatibility),
            },
            mediaResult.thumbnailPath,
            mediaResult.galleryPaths
          );
          projectsByLocale[locale][category][index] = updated;
        }
      }

      await writeAllProjectsFiles(projectsByLocale);

      return {
        slug: normalizeModalSlug(payload.locales.pt.title),
        category: payload.category,
        assetFolder: mediaResult.assetFolder,
      };
    });

    res.json({
      message: 'Projeto atualizado com sucesso.',
      ...result,
    });
  })
);

app.delete(
  '/api/projects/:slug',
  asyncHandler(async (req, res) => {
    const baseSlug = req.params.slug;
    const baseLocale = LOCALES.includes(req.query.lang) ? req.query.lang : 'pt';

    const result = await withWriteLock(async () => {
      const projectsByLocale = await readAllProjectsFiles();
      const targetsByLocale = resolveEditTargetsByLocale(projectsByLocale, baseSlug, baseLocale);
      const baseProject = targetsByLocale[baseLocale].project;
      const assetFolder = inferAssetFolderFromProject(baseProject);

      const referencedAssetPaths = new Set();
      for (const locale of LOCALES) {
        const project = targetsByLocale[locale].project;
        collectProjectAssetPaths(project).forEach((assetPath) => referencedAssetPaths.add(assetPath));
      }

      for (const locale of LOCALES) {
        const target = targetsByLocale[locale];
        projectsByLocale[locale][target.category].splice(target.index, 1);
      }

      await writeAllProjectsFiles(projectsByLocale);

      let removedFiles = 0;
      let missingFiles = 0;
      const removeWarnings = [];

      for (const relativePath of referencedAssetPaths) {
        try {
          const removed = await removeAssetFileIfExists(relativePath);
          if (removed) {
            removedFiles += 1;
          } else {
            missingFiles += 1;
          }
        } catch (error) {
          removeWarnings.push(`Falha ao remover arquivo "${relativePath}": ${error.message}`);
        }
      }

      let removedFolder = false;
      if (assetFolder && assetFolder !== 'thumbs') {
        const galleryDir = normalizeRelativeAssetPath(path.posix.join(PROJECTS_ASSETS_DIR, assetFolder));
        try {
          removedFolder = await removeAssetDirectoryIfExists(galleryDir);
        } catch (error) {
          removeWarnings.push(`Falha ao remover pasta "${galleryDir}": ${error.message}`);
        }
      }

      return {
        slug: normalizeModalSlug(baseProject.title),
        assetFolder,
        removedFiles,
        missingFiles,
        removedFolder,
        removeWarnings,
      };
    });

    res.json({
      message: 'Projeto deletado com sucesso.',
      ...result,
    });
  })
);

app.use((error, req, res, next) => {
  const status = error.status || 500;
  const message = error.message || 'Erro interno do servidor.';

  if (status >= 500) {
    console.error('[ERROR]', error);
  } else {
    console.warn('[WARN]', message);
  }

  res.status(status).json({
    message,
    status,
  });
});

async function bootstrap() {
  assertPathInsidePortfolioRoot(PORTFOLIO_ROOT);
  for (const locale of LOCALES) {
    resolvePortfolioPath(PROJECTS_FILE_BY_LOCALE[locale]);
  }
  resolvePortfolioPath(PROJECTS_ASSETS_DIR);
  resolvePortfolioPath(PROJECTS_THUMBS_DIR);

  app.listen(PORT, () => {
    console.log('[uploader-api] running on http://localhost:' + PORT);
    console.log('[uploader-api] portfolio root:', PORTFOLIO_ROOT);
    console.log('[uploader-api] image profile:', {
      thumbWidth: THUMB_TARGET_WIDTH,
      thumbHeight: THUMB_TARGET_HEIGHT,
      thumbAspect: THUMB_CARD_ASPECT_RATIO,
      galleryWidth: GALLERY_MAX_WIDTH,
      webpQuality: WEBP_QUALITY,
    });
    console.log('[uploader-api] ollama:', {
      url: OLLAMA_URL,
      modelPreference: OLLAMA_MODEL,
      timeoutMs: OLLAMA_TIMEOUT_MS,
    });
  });
}

bootstrap().catch((error) => {
  console.error('[startup-error]', error);
  process.exit(1);
});
