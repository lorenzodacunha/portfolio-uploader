// The project form: its empty state, the payload the API saves and the period preview (the API formats the stored
// period the same way, from the start and end months).
import { imageUrl, smallSrc } from './api';

export const LOCALES = ['pt', 'en', 'es'];
export const LOCALE_LABEL = { pt: 'Português', en: 'English', es: 'Español' };

export const TONES = [
  { value: '', label: 'Automático' },
  { value: 'brand', label: 'Laranja' },
  { value: 'light', label: 'Amarelo' },
  { value: 'strong', label: 'Vermelho' },
  { value: 'dark', label: 'Escuro' },
];

const MONTHS = {
  pt: ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'],
};

export const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const emptyTexts = () =>
  Object.fromEntries(LOCALES.map((locale) => [locale, { summary: '', description: '', role: '' }]));

export const emptyForm = () => ({
  id: '',
  idTouched: false,
  title: '',
  platform: 'Shopify',
  type: 'loja',
  tone: '',
  start: '',
  end: '',
  url: '',
  offline: false,
  featured: false,
  adult: false,
  performance: false,
  partner: '',
  stack: [],
  texts: emptyTexts(),
  gallery: [],
});

/** "Aurora Tecidos" -> "aurora-tecidos": the case address (/cases/<id>/). */
export function toSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function periodPreview(start, end) {
  if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end) || start > end) return null;
  const [y1, m1] = start.split('-').map(Number);
  const [y2, m2] = end.split('-').map(Number);
  return LOCALES.map((locale) => {
    const a = MONTHS[locale][m1 - 1];
    const b = MONTHS[locale][m2 - 1];
    const of = locale === 'en' ? ' ' : ' de ';
    const to = locale === 'en' ? ' to ' : ' a ';
    if (y1 === y2 && m1 === m2) return `${a}${of}${y1}`;
    if (y1 === y2) return `${a}${to}${b}${of}${y1}`;
    return `${a}${of}${y1}${to}${b}${of}${y2}`;
  });
}

/** The stored project (GET /api/projects/:id) as form state. */
export function formFromProject(data) {
  return {
    ...emptyForm(),
    id: data.id,
    idTouched: true,
    title: data.title,
    platform: data.platform,
    type: data.type,
    tone: data.tone || '',
    start: data.start,
    end: data.end,
    url: data.url,
    offline: data.offline,
    featured: data.featured,
    adult: data.adult,
    performance: data.performance,
    partner: data.partner,
    stack: data.stack,
    texts: data.texts,
    gallery: (data.images || []).map((image) => ({
      id: createId(),
      kind: 'existing',
      src: image.src,
      width: image.width,
      height: image.height,
      name: image.src.split('/').at(-1),
      preview: imageUrl(smallSrc(image.src)),
      file: null,
    })),
  };
}

/** What the API saves: the form without its local state, the gallery as a plan (existing src or new file id). */
export function toPayload(form) {
  return {
    id: form.id,
    title: form.title,
    platform: form.platform,
    type: form.type,
    tone: form.tone,
    start: form.start,
    end: form.end,
    url: form.url.trim(),
    offline: form.offline,
    featured: form.featured,
    adult: form.adult,
    performance: form.performance && !form.offline,
    partner: form.partner,
    stack: form.stack,
    texts: form.texts,
    gallery: form.gallery.map((image) =>
      image.kind === 'existing' ? { kind: 'existing', src: image.src } : { kind: 'new', fileId: image.id }
    ),
  };
}

export function revokePreviews(form) {
  form?.gallery?.forEach((image) => {
    if (image.kind === 'new' && image.preview) URL.revokeObjectURL(image.preview);
  });
}
