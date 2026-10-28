const DB_NAME = 'portfolio_uploader_local_db';
const DB_VERSION = 1;
const DRAFTS_STORE = 'drafts';
const FILES_STORE = 'draft_files';
const FILES_BY_DRAFT_INDEX = 'by_draft_key';
const CREATE_DRAFT_KEY = 'create_draft';

let dbPromise = null;

function supportsIndexedDb() {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDatabase() {
  if (!supportsIndexedDb()) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        db.createObjectStore(DRAFTS_STORE, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(FILES_STORE)) {
        const store = db.createObjectStore(FILES_STORE, { keyPath: 'compoundKey' });
        store.createIndex(FILES_BY_DRAFT_INDEX, 'draftKey', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir IndexedDB.'));
  });

  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Erro no IndexedDB.'));
  });
}

async function getDraftFileRecords(tx, draftKey) {
  const filesStore = tx.objectStore(FILES_STORE);
  const index = filesStore.index(FILES_BY_DRAFT_INDEX);
  const range = IDBKeyRange.only(draftKey);
  const records = await requestToPromise(index.getAll(range));
  return Array.isArray(records) ? records : [];
}

export async function loadCreateDraftFromDb() {
  const db = await openDatabase();
  if (!db) return null;

  const tx = db.transaction([DRAFTS_STORE, FILES_STORE], 'readonly');
  const draftStore = tx.objectStore(DRAFTS_STORE);
  const draftRecord = await requestToPromise(draftStore.get(CREATE_DRAFT_KEY));
  if (!draftRecord?.snapshot) return null;

  const fileRecords = await getDraftFileRecords(tx, CREATE_DRAFT_KEY);
  const filesByKey = new Map();
  fileRecords.forEach((record) => {
    const blob = record?.blob;
    if (!blob) return;
    const file = new File([blob], record.name || 'arquivo.bin', {
      type: record.type || blob.type || 'application/octet-stream',
      lastModified: Number(record.lastModified || Date.now()),
    });
    filesByKey.set(record.fileKey, file);
  });

  return {
    snapshot: draftRecord.snapshot,
    filesByKey,
    updatedAt: draftRecord.updatedAt || 0,
  };
}

export async function saveCreateDraftToDb({
  snapshot,
  fileEntries = [],
  replaceFiles = false,
}) {
  const db = await openDatabase();
  if (!db || !snapshot) return;

  const tx = db.transaction([DRAFTS_STORE, FILES_STORE], 'readwrite');
  const draftsStore = tx.objectStore(DRAFTS_STORE);
  draftsStore.put({
    key: CREATE_DRAFT_KEY,
    snapshot,
    updatedAt: Date.now(),
  });

  if (replaceFiles) {
    const filesStore = tx.objectStore(FILES_STORE);
    const currentRecords = await getDraftFileRecords(tx, CREATE_DRAFT_KEY);
    const currentByKey = new Map(currentRecords.map((item) => [item.fileKey, item]));
    const nextKeys = new Set(fileEntries.map((item) => item.fileKey));

    for (const record of currentRecords) {
      if (!nextKeys.has(record.fileKey)) {
        filesStore.delete(record.compoundKey);
      }
    }

    for (const entry of fileEntries) {
      if (!entry?.fileKey || !entry?.file) continue;
      const existing = currentByKey.get(entry.fileKey);
      const unchanged =
        existing &&
        existing.name === entry.file.name &&
        existing.type === entry.file.type &&
        Number(existing.lastModified) === Number(entry.file.lastModified) &&
        Number(existing.size) === Number(entry.file.size);

      if (unchanged) continue;

      filesStore.put({
        compoundKey: `${CREATE_DRAFT_KEY}:${entry.fileKey}`,
        draftKey: CREATE_DRAFT_KEY,
        fileKey: entry.fileKey,
        name: entry.file.name,
        type: entry.file.type,
        lastModified: entry.file.lastModified,
        size: entry.file.size,
        blob: entry.file,
        updatedAt: Date.now(),
      });
    }
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Falha ao salvar draft no IndexedDB.'));
    tx.onabort = () => reject(tx.error || new Error('Transacao abortada ao salvar draft.'));
  });
}

export async function clearCreateDraftFromDb() {
  const db = await openDatabase();
  if (!db) return;

  const tx = db.transaction([DRAFTS_STORE, FILES_STORE], 'readwrite');
  const draftsStore = tx.objectStore(DRAFTS_STORE);
  draftsStore.delete(CREATE_DRAFT_KEY);

  const filesStore = tx.objectStore(FILES_STORE);
  const currentRecords = await getDraftFileRecords(tx, CREATE_DRAFT_KEY);
  currentRecords.forEach((record) => {
    filesStore.delete(record.compoundKey);
  });

  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Falha ao limpar draft do IndexedDB.'));
    tx.onabort = () => reject(tx.error || new Error('Transacao abortada ao limpar draft.'));
  });
}
