// Calls to the uploader API (server/index.js, same origin as the interface). In the public demonstration (DEMO, set at
// build time by vite.config.js) the same calls go to lib/demo/server.js, which answers from this browser's storage.
// Errors carry the list of problems the API sends back (form fields or the content standard), so the form can show
// each one next to its section.

export const DEMO = __DEMO__;

export async function apiFetch(endpoint, options = {}) {
  if (DEMO) {
    const { demoFetch } = await import('./demo/server.js');
    return demoFetch(endpoint, options);
  }
  return fetch(endpoint, options);
}

export async function apiRequest(endpoint, options = {}) {
  const response = await apiFetch(endpoint, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || 'A API não respondeu como esperado.');
    error.errors = Array.isArray(payload.errors) ? payload.errors : [];
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function jsonRequest(endpoint, body, method = 'POST') {
  return apiRequest(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** A site image (/assets/...) served by the API from the site's public folder; demo images are URLs already. */
export function imageUrl(src) {
  if (!src) return '';
  if (/^(blob:|data:|https?:)/.test(src)) return src;
  return `/api/image?src=${encodeURIComponent(src)}`;
}

/** The 640 px copy of a case image, the one the site's cards use. */
export function smallSrc(src) {
  return String(src || '').replace(/\.webp$/, '-640.webp');
}

/** Puts the demonstration back to its fictitious projects. */
export async function resetDemo() {
  const { resetDemo: reset } = await import('./demo/server.js');
  await reset();
}
