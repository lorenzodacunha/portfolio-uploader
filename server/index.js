const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const slugify = require('slugify');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = Number(process.env.PORT || 3333);
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 20);
const MAX_UPLOAD_FILES = Number(process.env.MAX_UPLOAD_FILES || 40);

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
    description: localeInput.description.trim(),
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
    const extension = path.extname(parsed.originalName || '').toLowerCase() || '.webp';
    map.set(parsed.fileId, {
      ...file,
      extension,
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

async function saveNewImageFile({
  file,
  targetRelativeDir,
  baseName,
  useNumericSequence,
  numericStart = 1,
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

  await fsPromises.writeFile(candidateAbsolutePath, file.buffer);

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
    const saved = await saveNewImageFile({
      file,
      targetRelativeDir: galleryTargetDir,
      baseName: assetFolder,
      useNumericSequence: true,
      numericStart: nextNumericName,
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
    const file = uploadedFilesMap.get(payload.thumbnailPlan.fileId);
    if (!file) {
      throw createHttpError(
        400,
        `Arquivo para thumbnail fileId "${payload.thumbnailPlan.fileId}" não foi enviado.`
      );
    }
    const saved = await saveNewImageFile({
      file,
      targetRelativeDir: PROJECTS_THUMBS_DIR,
      baseName: assetFolder,
      useNumericSequence: false,
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
  });
}

bootstrap().catch((error) => {
  console.error('[startup-error]', error);
  process.exit(1);
});
