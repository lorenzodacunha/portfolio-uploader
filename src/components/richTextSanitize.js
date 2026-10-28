import DOMPurify from 'dompurify';

// The case write-up accepts only the tags of the site's content standard (README, "Padrão das descrições"):
// p, h2, ul, ol, li, strong and em, with no attributes. The editor wraps list items in <p>; the site does not.
const NO_BREAK_SPACE = new RegExp(`&nbsp;|${String.fromCharCode(160)}`, 'g');

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ['p', 'h2', 'ul', 'ol', 'li', 'strong', 'em'],
  ALLOWED_ATTR: [],
};

function sanitizeRichTextHtml(html) {
  return DOMPurify.sanitize(String(html || '').replace(NO_BREAK_SPACE, ' '), SANITIZE_CONFIG)
    .replace(/<li>\s*<p>/g, '<li>')
    .replace(/<\/p>\s*<\/li>/g, '</li>')
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

export { sanitizeRichTextHtml };
