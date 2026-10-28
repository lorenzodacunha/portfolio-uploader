// The uploader API inside the browser, for the public demonstration (built on Vercel, see vite.config.js): the same
// routes and answers as server/index.js, with the projects and the uploaded images kept in this browser's IndexedDB
// instead of the portfolio's files. The first visit gets the fictitious projects of seed.js; "Restaurar
// demonstração" puts them back. Form rules and the content standard are the same as the real uploader's.
import {
  LOCALES, SUFFIX, TONES, TYPES, assembleProject, byUse, listItem, measurementSummary, normalizeFeaturedOrder,
  placeFeatured, projectDetail, tidyDescription, validatePayload,
} from '../../../shared/project.js';
import { checkProject, SECTIONS } from './description-rules.js';
import { MEASUREMENTS, PARTNERS, seedImage, seedProjects } from './seed.js';
import { sanitizeRichTextHtml } from '../../components/richTextSanitize.js';

const DB_NAME = 'portfolio_uploader_demo';
const IMAGE_WIDTH = 1280;
let dbPromise = null;

const normalizeDescription = (html) => tidyDescription(sanitizeRichTextHtml(html));

// ---------- storage ----------

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('projects', { keyPath: 'id' });
        db.createObjectStore('files', { keyPath: 'key' });
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function run(stores, mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    Promise.resolve(work(tx)).then((value) => { result = value; }, reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function readProjects() {
  await ensureSeed();
  const rows = await run(['projects'], 'readonly', (tx) => request(tx.objectStore('projects').getAll()));
  return rows.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(({ position, ...project }) => project);
}

async function writeProjects(projects) {
  await run(['projects'], 'readwrite', (tx) => {
    const store = tx.objectStore('projects');
    store.clear();
    projects.forEach((project, position) => store.put({ ...project, position }));
  });
}

async function ensureSeed() {
  const seeded = await run(['meta'], 'readonly', (tx) => request(tx.objectStore('meta').get('seeded')));
  if (seeded) return;
  await writeProjects(seedProjects());
  await run(['meta'], 'readwrite', (tx) => tx.objectStore('meta').put({ key: 'seeded', at: Date.now() }));
}

/** Back to the fictitious projects: the visitor's changes and uploaded images are erased. */
export async function resetDemo() {
  await run(['projects', 'files', 'meta'], 'readwrite', (tx) => {
    ['projects', 'files', 'meta'].forEach((name) => tx.objectStore(name).clear());
  });
  urls.forEach((url) => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
  urls.clear();
  refs.clear();
}

// ---------- images ----------

// Stored images are references (seed:<project>:<view> or file:<id>); the interface receives URLs.
const urls = new Map();
const refs = new Map();

async function srcOf(ref) {
  if (!urls.has(ref)) {
    let url = '';
    if (ref.startsWith('seed:')) url = seedImage(ref);
    else {
      const row = await run(['files'], 'readonly', (tx) => request(tx.objectStore('files').get(ref)));
      if (row?.blob) url = URL.createObjectURL(row.blob);
    }
    urls.set(ref, url);
    refs.set(url, ref);
  }
  return urls.get(ref);
}

async function resolveImages(images) {
  return Promise.all((images || []).map(async (image) => ({ src: await srcOf(image.ref), width: image.width, height: image.height })));
}

/** The browser's version of the server's sharp step: at most 1280 px wide, WebP. */
async function toWebp(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, IMAGE_WIDTH / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
  return { blob: blob || file, width: canvas.width, height: canvas.height };
}

async function storeImage(file) {
  const ref = `file:${crypto.randomUUID()}`;
  const image = await toWebp(file);
  await run(['files'], 'readwrite', (tx) => tx.objectStore('files').put({ key: ref, blob: image.blob }));
  return { ref, width: image.width, height: image.height };
}

async function dropImages(images) {
  const files = (images || []).filter((image) => image.ref.startsWith('file:'));
  if (!files.length) return;
  await run(['files'], 'readwrite', (tx) => files.forEach((image) => tx.objectStore('files').delete(image.ref)));
  files.forEach((image) => {
    const url = urls.get(image.ref);
    if (url) { URL.revokeObjectURL(url); refs.delete(url); }
    urls.delete(image.ref);
  });
}

// ---------- routes ----------

class HttpError extends Error {
  constructor(status, message, errors = []) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function parseBody(options) {
  if (options.body instanceof FormData) {
    return { payload: JSON.parse(options.body.get('payload') || '{}'), files: options.body.getAll('galleryFiles') };
  }
  const body = options.body ? JSON.parse(options.body) : {};
  return { ...body, payload: typeof body.payload === 'string' ? JSON.parse(body.payload) : body.payload };
}

async function meta() {
  const projects = await readProjects();
  return {
    demo: true,
    siteRoot: '',
    siteUrl: '',
    partners: Object.entries(PARTNERS).map(([key, partner]) => ({ key, name: partner.name, logo: partner.logo })),
    platforms: byUse(projects.map((p) => p.platform)),
    stacks: byUse(projects.flatMap((p) => p.stack || [])),
    sections: Object.fromEntries(LOCALES.map((locale) => [locale, SECTIONS[`description${SUFFIX[locale]}`]])),
    types: TYPES,
    tones: TONES,
  };
}

async function list() {
  const projects = await readProjects();
  return {
    projects: await Promise.all(projects.map(async (p) => listItem(p, {
      measured: MEASUREMENTS[p.id],
      issues: checkProject(p).length,
      cover: p.images?.[0] ? await srcOf(p.images[0].ref) : '',
    }))),
  };
}

async function detail(id) {
  const project = (await readProjects()).find((p) => p.id === id);
  if (!project) throw new HttpError(404, `Projeto "${id}" não encontrado.`);
  return projectDetail(project, { images: await resolveImages(project.images), measurement: measurementSummary(MEASUREMENTS[id]) });
}

async function check({ payload }) {
  const existing = (await readProjects()).find((p) => p.id === payload.id) || null;
  return { errors: checkProject(assembleProject(existing, payload, normalizeDescription)) };
}

async function save(mode, routeId, { payload, files }) {
  if (mode === 'edit') payload.id = routeId;
  const fieldErrors = validatePayload(payload, PARTNERS);
  if (fieldErrors.length) throw new HttpError(400, 'Confira os campos do formulário.', fieldErrors);
  const projects = await readProjects();
  const index = projects.findIndex((p) => p.id === payload.id);
  if (mode === 'create' && index >= 0) throw new HttpError(409, `Já existe um projeto com o endereço "${payload.id}".`);
  if (mode === 'edit' && index < 0) throw new HttpError(404, `Projeto "${payload.id}" não encontrado.`);
  const existing = index >= 0 ? projects[index] : null;

  const draft = assembleProject(existing, payload, normalizeDescription);
  const errors = checkProject({ ...draft, images: [] });
  if (errors.length) throw new HttpError(422, 'Os textos não seguem o padrão das descrições.', errors);

  const uploads = new Map(files.map((file) => [file.name.slice(0, file.name.indexOf('__')), file]));
  const images = [];
  for (const item of payload.gallery) {
    if (item.kind === 'existing') {
      const ref = refs.get(item.src);
      const known = (existing?.images || []).find((image) => image.ref === ref);
      if (!known) throw new HttpError(400, 'Uma imagem não pertence a este projeto.');
      images.push(known);
    } else {
      const file = uploads.get(item.fileId);
      if (!file) throw new HttpError(400, 'Uma imagem nova não chegou. Envie de novo.');
      images.push(await storeImage(file));
    }
  }
  draft.images = images;
  placeFeatured(projects, draft, Boolean(existing?.featured));
  if (mode === 'create') projects.push(draft);
  else projects[index] = draft;
  normalizeFeaturedOrder(projects);
  await writeProjects(projects);
  const kept = new Set(images.map((image) => image.ref));
  await dropImages((existing?.images || []).filter((image) => !kept.has(image.ref)));
  return { message: mode === 'create' ? 'Projeto criado.' : 'Alterações salvas.', id: draft.id, warnings: [] };
}

async function reorder({ orderedIds = [] }) {
  const projects = await readProjects();
  const featured = projects.filter((p) => p.featured);
  if (orderedIds.length !== featured.length || !featured.every((p) => orderedIds.includes(p.id))) {
    throw new HttpError(400, 'A nova ordem precisa ter todos os destaques, uma vez cada.');
  }
  featured.forEach((p) => { p.order = orderedIds.indexOf(p.id); });
  await writeProjects(projects);
  return { message: 'Ordem dos destaques salva.' };
}

async function remove(id) {
  const projects = await readProjects();
  const index = projects.findIndex((p) => p.id === id);
  if (index < 0) throw new HttpError(404, `Projeto "${id}" não encontrado.`);
  const [project] = projects.splice(index, 1);
  normalizeFeaturedOrder(projects);
  await writeProjects(projects);
  await dropImages(project.images);
  return { message: 'Projeto excluído.', id, removedImages: (project.images || []).length };
}

/** The translation runs on a local Ollama, which a public page cannot reach: the console says so step by step. */
function translateStream() {
  const lines = [
    { event: 'log', level: 'info', message: 'Texto em português recebido.' },
    { event: 'log', level: 'warn', message: 'Demonstração: a tradução usa um modelo de IA local (Ollama) na máquina de quem roda o uploader.' },
    { event: 'error', status: 503, message: 'Na demonstração a tradução por IA fica desligada. Os projetos de exemplo já vêm em inglês e espanhol; nos novos, escreva as duas versões à mão.' },
  ];
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      for (const line of lines) {
        await new Promise((resolve) => setTimeout(resolve, 450));
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } });
}

/** fetch() for the demo: same endpoints, methods and answers as the real API. */
export async function demoFetch(endpoint, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const path = endpoint.split('?')[0];
  const projectId = (/^\/api\/projects\/([^/]+)$/.exec(path) || [])[1];
  try {
    if (path === '/api/translate/stream') return translateStream();
    if (path === '/api/meta') return json(await meta());
    if (path === '/api/projects' && method === 'GET') return json(await list());
    if (path === '/api/projects' && method === 'POST') return json(await save('create', '', parseBody(options)), 201);
    if (projectId && method === 'GET') return json(await detail(decodeURIComponent(projectId)));
    if (projectId && method === 'PUT') return json(await save('edit', decodeURIComponent(projectId), parseBody(options)));
    if (projectId && method === 'DELETE') return json(await remove(decodeURIComponent(projectId)));
    if (path === '/api/check') return json(await check(parseBody(options)));
    if (path === '/api/featured/order') return json(await reorder(parseBody(options)));
    throw new HttpError(404, 'Rota da API inexistente.');
  } catch (error) {
    const status = error.status || 500;
    return json({ message: error.message || 'Erro na demonstração.', status, errors: error.errors || [] }, status);
  }
}
