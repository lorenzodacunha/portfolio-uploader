// The new-project draft survives a reload or a closed tab: the form goes to IndexedDB as a snapshot and the images
// not yet saved go along as files (createDraftIndexedDb.js). Version 3 is the form of the JSON portfolio; older
// drafts (category and icons model) are ignored.
import { createId, emptyForm, LOCALES } from './form';

const VERSION = 3;

export function isDraftMeaningful(form) {
  if (!form) return false;
  if (form.title.trim() || form.url.trim() || form.start || form.end || form.stack.length || form.gallery.length) return true;
  return LOCALES.some((locale) => {
    const texts = form.texts[locale];
    return texts.summary.trim() || texts.description.trim() || texts.role.trim();
  });
}

export function buildDraftPayload(form) {
  const fileEntries = [];
  const signature = [];
  const { gallery, ...fields } = form;
  const snapshot = {
    version: VERSION,
    form: fields,
    gallery: gallery.map((image) => {
      if (image.kind === 'new' && image.file) {
        const fileKey = `gallery:${image.id}`;
        fileEntries.push({ fileKey, file: image.file });
        signature.push(`${fileKey}:${image.file.name}:${image.file.size}:${image.file.lastModified}`);
        return { kind: 'new', id: image.id, name: image.name, fileKey };
      }
      return { kind: 'existing', id: image.id, src: image.src, name: image.name, preview: image.preview };
    }),
  };
  return { snapshot, fileEntries, filesSignature: signature.sort().join('|') };
}

export function hydrateDraft(payload) {
  const base = emptyForm();
  if (payload?.snapshot?.version !== VERSION) return { form: base, missingFiles: 0 };
  const { form, gallery } = payload.snapshot;
  const filesByKey = payload.filesByKey || new Map();
  let missingFiles = 0;
  const restored = {
    ...base,
    ...form,
    texts: { ...base.texts, ...form.texts },
    gallery: (gallery || []).flatMap((image) => {
      if (image.kind === 'existing') return [{ ...image, file: null }];
      const file = filesByKey.get(image.fileKey);
      if (!file) {
        missingFiles += 1;
        return [];
      }
      return [{ id: image.id || createId(), kind: 'new', name: image.name || file.name, file, preview: URL.createObjectURL(file) }];
    }),
  };
  return { form: restored, missingFiles };
}
