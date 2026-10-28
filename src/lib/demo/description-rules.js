// Copy of site/scripts/description-rules.mjs for the public demonstration, which runs without the site. The local
// uploader always uses the site's own file (RULES_FILE in .env); when a rule changes there, copy the file here again.
/* eslint-disable no-misleading-character-class -- the emoji class of the site's file, kept exactly as it is there */


// Sections in their order; the ones marked optional may be missing (a short case has only the four required ones).
export const SECTIONS = {
  description: ['Visão geral?', 'Contexto e objetivo', 'O desafio', 'A estratégia?', 'O que foi implementado', 'Resultado'],
  description_en: ['Overview?', 'Context and objective', 'The challenge', 'The strategy?', 'What was implemented', 'Result'],
  description_es: ['Visión general?', 'Contexto y objetivo', 'El desafío', 'La estrategia?', 'Lo que se implementó', 'Resultado'],
};
const ALLOWED_TAGS = new Set(['p', 'h2', 'ul', 'ol', 'li', 'strong', 'em']);
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const DASH = /[–—]/;
// Words that keep their capital letter inside a label: brands, platforms, acronyms written as words.
const PROPER = new Set('Shopify Liquid Dawn ELOY Figma Frenet WhatsApp VTEX Yampi Tray Nuvemshop WBuy WordPress Elementor Pro GemPages GreatPages JavaScript Google Meta Instagram Funko Pop Alterego AlterEgo Aurora Tecidos Wee Magazine CervejaBox Adega Paradiso Snugfly SnugFly Loja RO Mundosado Farmarela Economize Capriccio Razzo Vibe Terapias Registrando Marca Imperial Base Forte Thouren Torelly Agomide ALLPRO Pratesia Zayah Garden Silfer Adonai Cantinho Cristão Oliver Essence Solore ESSENC Onli Street Rian Store Dom Patinetes Screw Company Elétrica Niterói Carioca Concept Segredos Marie Apolodog Catnip Mundo Vienne Rouparia Core Web Vitals EUA Workana Illustrator Photoshop OpenAI Codex'.split(' '));

const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();

/** Sentence case: first letter capital, other words lowercase unless proper names, acronyms or numbers. */
function sentenceCase(label) {
  const words = label.replace(/[:()/,.]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length || words[0][0] !== words[0][0].toUpperCase()) return false;
  return words.slice(1).every((w) => w[0] === w[0].toLowerCase() || PROPER.has(w) || w === w.toUpperCase() || /^[A-Z]{2,}s$/.test(w) || /^\d/.test(w));
}

/** A label of a subtitle or list item: sentence case, ends with a colon, no number in front, short. */
function checkLabel(fail, id, key, kind, label) {
  const plain = text(label);
  if (!plain.endsWith(':')) fail(id, key, `${kind} termina com dois-pontos`, plain);
  if (/^\d+[.)]/.test(plain)) fail(id, key, `${kind} sem numeração`, plain);
  if (!sentenceCase(plain)) fail(id, key, `${kind} com maiúscula só na primeira palavra (e em nomes próprios)`, plain);
  if (plain.split(/\s+/).length > 9) fail(id, key, `${kind} com até 9 palavras`, plain);
}

export function checkProject(p) {
  const errors = [];
  const fail = (id, key, rule, detail) => errors.push(`${id} (${key.replace('description', 'pt').replace('pt_', '')}): ${rule}${detail ? ` -> ${detail}` : ''}`);
  const shape = {};
  for (const [key, sections] of Object.entries(SECTIONS)) {
    const html = p[key] ?? '';
    if (!html.trim()) { fail(p.id, key, 'descrição vazia'); continue; }
    for (const m of html.matchAll(/<\/?([a-z0-9]+)/gi)) if (!ALLOWED_TAGS.has(m[1].toLowerCase())) fail(p.id, key, 'só as tags p, h2, ul, ol, li, strong e em', `<${m[1]}>`);
    if (/<[a-z0-9]+\s[^>]*>/i.test(html)) fail(p.id, key, 'tags sem atributos');
    if (EMOJI.test(html)) fail(p.id, key, 'sem emoji', (html.match(new RegExp(`.{0,20}${EMOJI.source}.{0,10}`, 'u')) || [''])[0]);
    if (DASH.test(text(html))) fail(p.id, key, 'sem travessão (— ou –): vírgula, dois-pontos ou parênteses', (text(html).match(/.{0,25}[–—].{0,15}/) || [''])[0]);
    if (!html.startsWith('<h2>')) fail(p.id, key, 'começa por uma seção (<h2>)');

    // Sections: the fixed names, in order, required ones present, plain text only.
    const heads = [...html.matchAll(/<h2>([\s\S]*?)<\/h2>/g)].map((m) => m[1]);
    let last = -1;
    for (const h of heads) {
      if (/</.test(h)) fail(p.id, key, 'título de seção sem negrito ou outra tag', h);
      const at = sections.findIndex((s) => s.replace('?', '') === text(h));
      if (at < 0) fail(p.id, key, `título de seção é um destes: ${sections.map((s) => s.replace('?', '')).join(', ')}`, text(h));
      else if (at <= last) fail(p.id, key, 'seções na ordem do padrão, sem repetir', text(h));
      else last = at;
    }
    for (const s of sections.filter((s) => !s.endsWith('?'))) if (!heads.map(text).includes(s)) fail(p.id, key, 'seção obrigatória', s);

    // Bold only as a subtitle (a paragraph that is all bold) or as the label at the start of a list item.
    const subtitles = [...html.matchAll(/<p><strong>([^<]*)<\/strong><\/p>/g)].map((m) => m[1]);
    const labels = [...html.matchAll(/<li><strong>([^<]*)<\/strong>/g)].map((m) => m[1]);
    subtitles.forEach((s) => checkLabel(fail, p.id, key, 'subtítulo', s));
    labels.forEach((s) => checkLabel(fail, p.id, key, 'rótulo de item', s));
    const bold = (html.match(/<strong>/g) || []).length;
    if (bold !== subtitles.length + labels.length) fail(p.id, key, 'negrito só em subtítulos e rótulos de item, nunca no meio do texto');
    shape[key] = [heads.length, subtitles.length, labels.length, (html.match(/<li>/g) || []).length].join('/');
  }
  // The three languages have the same structure (sections, subtitles, labelled items, items).
  if (new Set(Object.values(shape)).size > 1) fail(p.id, 'description', 'mesma estrutura nos três idiomas (seções/subtítulos/rótulos/itens)', JSON.stringify(shape));

  for (const key of ['summary', 'summary_en', 'summary_es']) {
    const s = p[key] ?? '';
    if (!s.trim()) fail(p.id, key, 'resumo vazio');
    if (EMOJI.test(s) || DASH.test(s)) fail(p.id, key, 'resumo sem emoji nem travessão', s);
    if (/<[^>]+>/.test(s)) fail(p.id, key, 'resumo em texto puro', s);
  }
  return errors;
}
