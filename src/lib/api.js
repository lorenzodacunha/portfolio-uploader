// Calls to the uploader API (server/index.js). Errors carry the list of problems the API sends back (form fields or
// the content standard), so the form can show each one next to its section.

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3333';

export async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, options);
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

/** A site image (/assets/...) served by the API from the site's public folder. */
export function imageUrl(src) {
  return src ? `${API_BASE}/api/image?src=${encodeURIComponent(src)}` : '';
}

/** The 640 px copy of a case image, the one the site's cards use. */
export function smallSrc(src) {
  return String(src || '').replace(/\.webp$/, '-640.webp');
}
