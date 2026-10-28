// The project model of the portfolio, shared by the API (server/index.js) and the browser demonstration
// (src/lib/demo): the period in three languages, the form rules, how a saved form becomes a project of
// site/src/data/projects.json, the featured order and the shapes the interface reads. Plain JavaScript with no Node
// or browser API, so the two sides apply exactly the same rules.

export const LOCALES = ['pt', 'en', 'es'];
export const SUFFIX = { pt: '', en: '_en', es: '_es' };
export const TYPES = ['loja', 'landing'];
export const TONES = ['', 'brand', 'light', 'strong', 'dark'];

// Key order of a new project, the same as the projects imported from the previous site.
const FIELD_ORDER = [
  'id', 'legacyId', 'featured', 'order', 'title', 'platform', 'period', 'period_en', 'period_es', 'sort', 'type',
  'tone', 'summary', 'summary_en', 'summary_es', 'description', 'description_en', 'description_es', 'stack', 'url',
  'offline', 'partner', 'role', 'role_en', 'role_es', 'example', 'adult', 'performance', 'images',
];

export const MONTHS = {
  pt: ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'],
};

export function plainText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

/** After the sanitizer: list items without the editor's <p>, no empty paragraphs, no spacing between tags. */
export function tidyDescription(html) {
  return String(html || '')
    .replace(/<li>\s*<p>/g, '<li>')
    .replace(/<\/p>\s*<\/li>/g, '</li>')
    .replace(/<\/p>\s*<p>(?=[^<]*<\/li>)/g, ' ')
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

/** "2024-08" and "2025-01" -> the period line in each language and the sort key (yyyymm of the end). */
export function formatPeriod(start, end) {
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
export function parsePeriod(period) {
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

/** Field rules of the form; the content standard of the texts runs afterwards on the assembled project. */
export function validatePayload(payload, partners = {}) {
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
  if (payload.partner && !partners[payload.partner]) errors.push(`Parceiro "${payload.partner}" não existe em profile.json.`);
  if (!Array.isArray(payload.stack) || !payload.stack.some((item) => text(item))) errors.push('Adicione ao menos uma tecnologia.');
  if (!Array.isArray(payload.gallery) || payload.gallery.length === 0) errors.push('Adicione ao menos uma imagem.');
  for (const locale of LOCALES) {
    const texts = payload.texts?.[locale] || {};
    if (payload.partner && !text(texts.role)) errors.push(`Minha atuação (${locale.toUpperCase()}) é obrigatória quando há parceria.`);
  }
  return errors;
}

/**
 * Applies the form on top of the stored project (or a new one), keeping fields the form does not edit.
 * normalizeDescription is the side's sanitizer (sanitize-html on the server, DOMPurify in the browser).
 */
export function assembleProject(existing, payload, normalizeDescription) {
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
  project.stack = (payload.stack || []).map(plainText).filter(Boolean);
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
export function normalizeFeaturedOrder(projects) {
  const featured = projects.filter((p) => p.featured).sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  featured.forEach((p, index) => { p.order = index; });
  projects.filter((p) => !p.featured).forEach((p) => { p.order = null; });
}

/** New featured projects join the end of the rail. */
export function placeFeatured(projects, project, wasFeatured) {
  if (project.featured && !wasFeatured) project.order = projects.filter((p) => p.featured && p !== project).length;
}

export function measurementSummary(run) {
  if (!run) return null;
  return {
    mobile: run.mobile?.score ?? null,
    desktop: run.desktop?.score ?? null,
    fetchTime: run.mobile?.fetchTime || run.desktop?.fetchTime || '',
  };
}

/** A project as a card of the catalog (GET /api/projects). cover is the card image, already resolved by the side. */
export function listItem(project, { measured = false, issues = 0, cover = '' } = {}) {
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
    measured: Boolean(measured),
    cover,
    issues,
  };
}

/** A project as the form reads it (GET /api/projects/:id). */
export function projectDetail(project, { images = project.images || [], measurement = null } = {}) {
  const months = parsePeriod(project.period) || { start: '', end: '' };
  return {
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
    images,
    measurement,
  };
}

/** Count of each value, most used first: the platforms and stacks the form suggests. */
export function byUse(list) {
  const counts = new Map();
  list.forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([item]) => item);
}

/** Section titles are fixed names: a translation takes the canonical name of the same section, by position. */
export function canonicalSections(sections, sourceHtml, translatedHtml, locale) {
  const names = (key) => sections[key].map((name) => name.replace('?', ''));
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
