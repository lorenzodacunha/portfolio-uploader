import DOMPurify from 'dompurify';

const SANITIZE_CONFIG = {
  ADD_TAGS: ['iframe'],
  ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'target', 'rel', 'style'],
};

function sanitizeRichTextHtml(html) {
  return DOMPurify.sanitize(html || '', SANITIZE_CONFIG);
}

export { sanitizeRichTextHtml };
