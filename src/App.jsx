import { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowUpRightFromSquare,
  faCircleCheck,
  faFloppyDisk,
  faPlus,
  faRotate,
  faTrash,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import './App.css';
import IconButton from './components/IconButton';
import ProjectList from './components/ProjectList';
import ProjectForm from './components/ProjectForm';
import { sanitizeRichTextHtml } from './components/richTextSanitize';
import { API_BASE, apiRequest, imageUrl, jsonRequest } from './lib/api';
import { buildDraftPayload, hydrateDraft, isDraftMeaningful } from './lib/draft';
import { createId, emptyForm, formFromProject, LOCALES, revokePreviews, toPayload, toSlug } from './lib/form';
import { convertPdfToPngFiles, DEFAULT_SPLIT_OVERLAP, isPdfFile, splitTallImageFile, waitNextFrame } from './lib/media';
import { clearCreateDraftFromDb, loadCreateDraftFromDb, saveCreateDraftToDb } from './lib/createDraftIndexedDb';

const SITE_URL = import.meta.env.VITE_SITE_URL || 'http://localhost:4321';
const EMPTY_META = { partners: [], platforms: [], stacks: [], sections: {}, siteRoot: '' };

/** "aurora-tecidos (en): rule -> detail" -> the language it belongs to and the readable part. */
function groupIssues(lines) {
  const grouped = { pt: [], en: [], es: [] };
  for (const line of lines) {
    const match = /^.*? \(([a-z_]+)\): ([\s\S]*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const locale = key.endsWith('_en') || key === 'en' ? 'en' : key.endsWith('_es') || key === 'es' ? 'es' : 'pt';
    grouped[locale].push(key.startsWith('summary') ? `Resumo: ${match[2]}` : match[2]);
  }
  return grouped;
}

/** The same line for a notice: the language and field in words instead of the project id and JSON key. */
function readableIssue(line) {
  const match = /^.*? \(([a-z_]+)\): ([\s\S]*)$/.exec(line);
  if (!match) return line;
  const key = match[1];
  const language = key.endsWith('en') ? 'Inglês' : key.endsWith('es') ? 'Espanhol' : 'Português';
  return `${language}${key.startsWith('summary') ? ', resumo' : ''}: ${match[2]}`;
}

function App() {
  const [meta, setMeta] = useState(EMPTY_META);
  const [projects, setProjects] = useState([]);
  const [mode, setMode] = useState('create');
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [savedPayload, setSavedPayload] = useState('');
  const [measurement, setMeasurement] = useState(null);
  const [draft, setDraft] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [issues, setIssues] = useState({ pt: [], en: [], es: [] });
  const [checking, setChecking] = useState(false);
  const [overlap, setOverlap] = useState(DEFAULT_SPLIT_OVERLAP);
  const [busyText, setBusyText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [consoleStatus, setConsoleStatus] = useState('idle');
  const [deleteText, setDeleteText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const consoleRef = useRef(null);
  const deleteRef = useRef(null);
  const draftReady = useRef(false);
  const draftSignature = useRef('');

  const say = (tone, message, list = []) => setNotice({ tone, message, list });

  const replaceForm = (next) =>
    setForm((previous) => {
      if (previous !== draft) revokePreviews(previous);
      return next;
    });

  const refreshProjects = async () => {
    const result = await apiRequest('/api/projects');
    setProjects(result.projects || []);
  };

  const loadAll = async () => {
    setIsLoading(true);
    draftReady.current = false;
    try {
      const [metaResponse] = await Promise.all([apiRequest('/api/meta'), refreshProjects()]);
      setMeta({ ...EMPTY_META, ...metaResponse });
      const stored = await loadCreateDraftFromDb().catch(() => null);
      const restored = hydrateDraft(stored);
      draftSignature.current = buildDraftPayload(restored.form).filesSignature;
      setDraft(isDraftMeaningful(restored.form) ? restored.form : null);
      setMode('create');
      setSelectedId('');
      setMeasurement(null);
      replaceForm(restored.form);
      setSavedPayload('');
      if (restored.missingFiles) say('warn', `Rascunho restaurado sem ${restored.missingFiles} imagem(ns) que o navegador não guardou.`);
    } catch (error) {
      say('error', `${error.message} A API está rodando em ${API_BASE}?`);
    } finally {
      draftReady.current = true;
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New-project draft: saved to IndexedDB a moment after each change, files only when they change.
  useEffect(() => {
    if (!draftReady.current || mode !== 'create') return undefined;
    if (!isDraftMeaningful(form)) {
      setDraft(null);
      draftSignature.current = '';
      void clearCreateDraftFromDb();
      return undefined;
    }
    setDraft(form);
    const timer = setTimeout(() => {
      const payload = buildDraftPayload(form);
      const filesChanged = payload.filesSignature !== draftSignature.current;
      saveCreateDraftToDb({ snapshot: payload.snapshot, fileEntries: filesChanged ? payload.fileEntries : [], replaceFiles: filesChanged })
        .then(() => {
          if (filesChanged) draftSignature.current = payload.filesSignature;
        })
        .catch((error) => console.warn('[draft]', error?.message || error));
    }, 400);
    return () => clearTimeout(timer);
  }, [form, mode]);

  // The content standard, checked by the API with the site's own rules a moment after the texts change.
  const checkKey = useMemo(
    () => JSON.stringify({ id: form.id, texts: form.texts }),
    [form.id, form.texts]
  );
  useEffect(() => {
    const hasText = LOCALES.some((locale) => form.texts[locale].description || form.texts[locale].summary);
    if (!hasText) {
      setIssues({ pt: [], en: [], es: [] });
      return undefined;
    }
    setChecking(true);
    const timer = setTimeout(() => {
      jsonRequest('/api/check', { payload: { ...toPayload(form), stack: form.stack } })
        .then((result) => setIssues(groupIssues(result.errors || [])))
        .catch(() => {})
        .finally(() => setChecking(false));
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [consoleLogs]);

  const isDirty = mode === 'edit' && savedPayload && JSON.stringify(toPayload(form)) !== savedPayload;
  const issueCount = issues.pt.length + issues.en.length + issues.es.length;

  const confirmLeave = () => !isDirty || window.confirm('Há alterações não salvas neste projeto. Descartar?');

  const startNew = () => {
    if (!confirmLeave()) return;
    setMode('create');
    setSelectedId('');
    setMeasurement(null);
    setNotice(null);
    replaceForm(draft || emptyForm());
  };

  const discardDraft = () => {
    if (!window.confirm('Apagar o rascunho do projeto novo?')) return;
    void clearCreateDraftFromDb();
    draftSignature.current = '';
    setDraft(null);
    if (mode === 'create') replaceForm(emptyForm());
  };

  const openProject = async (id) => {
    if (id === selectedId || !confirmLeave()) return;
    setNotice(null);
    try {
      const data = await apiRequest(`/api/projects/${encodeURIComponent(id)}`);
      const next = formFromProject(data);
      setMode('edit');
      setSelectedId(id);
      setMeasurement(data.measurement);
      replaceForm(next);
      setSavedPayload(JSON.stringify(toPayload(next)));
      document.querySelector('.editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      say('error', error.message);
    }
  };

  const onField = (field, value) =>
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'title' && mode === 'create' && !current.idTouched) next.id = toSlug(value);
      if (field === 'id') {
        next.id = toSlug(value);
        next.idTouched = true;
      }
      if (field === 'url' && !String(value).trim()) next.offline = false;
      if (field === 'offline' && value) next.performance = false;
      return next;
    });

  const onText = (locale, field, value) =>
    setForm((current) => ({
      ...current,
      texts: { ...current.texts, [locale]: { ...current.texts[locale], [field]: value } },
    }));

  const addGalleryFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const items = [];
    const warnings = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        let candidates = [file];
        if (isPdfFile(file)) {
          setBusyText(`Convertendo PDF ${index + 1} de ${files.length}…`);
          try {
            candidates = await convertPdfToPngFiles(file);
          } catch (error) {
            warnings.push(`PDF "${file.name}" não converteu: ${error.message}`);
            continue;
          }
        }
        for (const candidate of candidates) {
          setBusyText(`Preparando ${candidate.name}…`);
          try {
            const result = await splitTallImageFile(candidate, overlap);
            result.files.forEach((part) => items.push({ id: createId(), kind: 'new', name: part.name, file: part, preview: URL.createObjectURL(part) }));
          } catch {
            warnings.push(`"${candidate.name}" entrou inteira (o corte em quadros falhou).`);
            items.push({ id: createId(), kind: 'new', name: candidate.name, file: candidate, preview: URL.createObjectURL(candidate) });
            await waitNextFrame();
          }
        }
      }
    } finally {
      setBusyText('');
    }
    if (items.length) setForm((current) => ({ ...current, gallery: [...current.gallery, ...items] }));
    if (warnings.length) say('warn', 'Algumas imagens precisam de atenção.', warnings);
  };

  const removeImage = (imageId) =>
    setForm((current) => {
      const target = current.gallery.find((image) => image.id === imageId);
      if (target?.kind === 'new' && target.preview) URL.revokeObjectURL(target.preview);
      return { ...current, gallery: current.gallery.filter((image) => image.id !== imageId) };
    });

  const moveImage = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    setForm((current) => {
      const list = [...current.gallery];
      const from = list.findIndex((image) => image.id === fromId);
      const to = list.findIndex((image) => image.id === toId);
      if (from < 0 || to < 0) return current;
      list.splice(to, 0, ...list.splice(from, 1));
      return { ...current, gallery: list };
    });
  };

  const openConsole = () => {
    const dialog = consoleRef.current?.closest('dialog');
    if (dialog && !dialog.open) dialog.showModal();
  };

  const log = (message, level = 'info') =>
    setConsoleLogs((current) => [...current, { id: createId(), time: new Date().toLocaleTimeString('pt-BR', { hour12: false }), level, message: String(message || '') }]);

  const translate = async () => {
    const pt = form.texts.pt;
    const description = sanitizeRichTextHtml(pt.description);
    if (!pt.summary.trim() && !description) {
      say('warn', 'Escreva o resumo ou a descrição em português antes de traduzir.');
      return;
    }
    const filled = ['en', 'es'].some((locale) => form.texts[locale].summary.trim() || form.texts[locale].description.trim());
    const overwrite = !filled || window.confirm('Inglês e espanhol já têm texto. OK substitui tudo; Cancelar preenche só o que está vazio.');

    setIsTranslating(true);
    setConsoleStatus('running');
    setConsoleLogs([]);
    openConsole();
    log('Pedindo a tradução ao Ollama…');
    try {
      const response = await fetch(`${API_BASE}/api/translate/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { summary: pt.summary, descriptionHtml: description, role: form.partner ? pt.role : '' } }),
      });
      if (!response.ok || !response.body) throw new Error('A tradução não começou.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let result = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let lineBreak = buffer.indexOf('\n');
        while (lineBreak >= 0) {
          const line = buffer.slice(0, lineBreak).trim();
          buffer = buffer.slice(lineBreak + 1);
          lineBreak = buffer.indexOf('\n');
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.event === 'log') log(event.message, event.level);
          if (event.event === 'error') throw new Error(event.message);
          if (event.event === 'result') result = event.translations;
        }
      }
      if (!result) throw new Error('A tradução terminou sem resultado.');
      setForm((current) => {
        const textsNext = { ...current.texts };
        for (const locale of ['en', 'es']) {
          const now = current.texts[locale];
          const got = result[locale] || {};
          const pick = (field, value) => (overwrite || !String(now[field] || '').trim() ? value : now[field]);
          textsNext[locale] = {
            summary: pick('summary', got.summary || ''),
            description: pick('description', sanitizeRichTextHtml(got.descriptionHtml || '')),
            role: pick('role', got.role || ''),
          };
        }
        return { ...current, texts: textsNext };
      });
      log('Inglês e espanhol preenchidos. Revise antes de salvar.', 'success');
      setConsoleStatus('success');
      say('success', 'Tradução aplicada em inglês e espanhol. Revise antes de salvar.');
    } catch (error) {
      log(error.message, 'error');
      setConsoleStatus('error');
      say('error', error.message);
    } finally {
      setIsTranslating(false);
    }
  };

  const save = async () => {
    setNotice(null);
    const payload = toPayload(form);
    const body = new FormData();
    body.append('payload', JSON.stringify(payload));
    form.gallery.forEach((image) => {
      if (image.kind === 'new') body.append('galleryFiles', image.file, `${image.id}__${image.file.name}`);
    });
    setIsSaving(true);
    try {
      const result = await apiRequest(mode === 'create' ? '/api/projects' : `/api/projects/${encodeURIComponent(selectedId)}`, {
        method: mode === 'create' ? 'POST' : 'PUT',
        body,
      });
      if (mode === 'create') {
        void clearCreateDraftFromDb();
        draftSignature.current = '';
        setDraft(null);
      }
      await refreshProjects();
      const data = await apiRequest(`/api/projects/${encodeURIComponent(result.id)}`);
      const next = formFromProject(data);
      setMode('edit');
      setSelectedId(result.id);
      setMeasurement(data.measurement);
      replaceForm(next);
      setSavedPayload(JSON.stringify(toPayload(next)));
      say(result.warnings?.length ? 'warn' : 'success', result.message, result.warnings || []);
    } catch (error) {
      say('error', error.message, (error.errors || []).map(readableIssue));
    } finally {
      setIsSaving(false);
    }
  };

  const reorderFeatured = async (orderedIds) => {
    setProjects((current) => current.map((p) => (p.featured ? { ...p, order: orderedIds.indexOf(p.id) } : p)));
    try {
      await jsonRequest('/api/featured/order', { orderedIds });
      say('success', 'Ordem dos destaques salva.');
    } catch (error) {
      say('error', error.message);
    } finally {
      await refreshProjects();
    }
  };

  const remove = async () => {
    if (deleteText !== 'Excluir') return;
    setIsDeleting(true);
    try {
      const result = await apiRequest(`/api/projects/${encodeURIComponent(selectedId)}`, { method: 'DELETE' });
      deleteRef.current?.close();
      setDeleteText('');
      await refreshProjects();
      setMode('create');
      setSelectedId('');
      setMeasurement(null);
      replaceForm(draft || emptyForm());
      say('success', `${result.message} ${result.removedImages} imagem(ns) apagada(s).`);
    } catch (error) {
      deleteRef.current?.close();
      say('error', error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const draftCard = draft
    ? { title: draft.title, cover: draft.gallery[0]?.preview || '' }
    : null;
  const featuredCount = projects.filter((p) => p.featured).length;
  const offlineCount = projects.filter((p) => p.offline).length;

  return (
    <div className="app">
      <a className="skip" href="#editor">
        Ir para o formulário
      </a>
      <header className="topbar">
        <div className="topbar__bar">
          <span className="topbar__brand">
            <img src={imageUrl('/assets/brand/logo-icone.svg')} alt="" width="54" height="22" />
            <span className="topbar__name">Portfolio Uploader</span>
          </span>
          <span className="topbar__site" title={meta.siteRoot}>
            {meta.siteRoot ? `site: ${meta.siteRoot.split(/[\\/]/).slice(-2).join('/')}` : 'site não carregado'}
          </span>
          <div className="topbar__actions">
            <IconButton icon={faRotate} variant="glass" onClick={() => confirmLeave() && loadAll()}>
              Recarregar
            </IconButton>
            <IconButton icon={faPlus} variant="primary" onClick={startNew}>
              Novo projeto
            </IconButton>
          </div>
        </div>
      </header>

      <section className="band lz-band lz-band--brand" aria-label="Resumo do portfólio">
        <svg className="lz-band__mesh" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 1440 200">
          {Array.from({ length: 24 }, (_, i) => (
            <path key={`v${i}`} d={`M${i * 64} 0V200`} />
          ))}
          {Array.from({ length: 5 }, (_, i) => (
            <path key={`h${i}`} d={`M0 ${i * 50}H1440`} />
          ))}
        </svg>
        <div className="lz-band__content band__content">
          <h1 className="lz-section-title lz-section-title--on-brand type-heading">
            <span className="lz-section-title__one">Projetos do</span>
            <span className="lz-section-title__two">portfólio</span>
          </h1>
          <dl className="band__stats">
            <div>
              <dt>projetos</dt>
              <dd>{projects.length}</dd>
            </div>
            <div>
              <dt>destaques</dt>
              <dd>{featuredCount}</dd>
            </div>
            <div>
              <dt>fora do ar</dt>
              <dd>{offlineCount}</dd>
            </div>
          </dl>
        </div>
      </section>

      <main className="workspace">
        <ProjectList
          projects={projects}
          draft={draftCard}
          selectedId={mode === 'edit' ? selectedId : ''}
          isDraftActive={mode === 'create' && Boolean(draft)}
          isLoading={isLoading}
          onSelect={openProject}
          onSelectDraft={startNew}
          onReorderFeatured={reorderFeatured}
        />

        <section className="editor" id="editor" aria-labelledby="editor-title">
          <header className="editor__head">
            <div>
              <p className="editor__kicker">{mode === 'create' ? 'Novo projeto' : 'Editando'}</p>
              <h2 className="editor__title type-heading" id="editor-title">
                {form.title || (mode === 'create' ? 'Sem nome ainda' : selectedId)}
              </h2>
              {form.id ? <p className="editor__path">/cases/{form.id}/</p> : null}
            </div>
            <div className="editor__head-actions">
              {mode === 'edit' ? (
                <a className="icon-btn icon-btn-ghost" href={`${SITE_URL}/cases/${form.id}/`} target="_blank" rel="noreferrer">
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="icon-btn-glyph" />
                  <span>Ver no site</span>
                </a>
              ) : draft ? (
                <IconButton icon={faTrash} variant="ghost" onClick={discardDraft}>
                  Apagar rascunho
                </IconButton>
              ) : null}
            </div>
          </header>

          {notice ? (
            <div className="notice" data-tone={notice.tone} role={notice.tone === 'error' ? 'alert' : 'status'}>
              <FontAwesomeIcon icon={notice.tone === 'success' ? faCircleCheck : faTriangleExclamation} className="notice__icon" />
              <div>
                <p>{notice.message}</p>
                {notice.list?.length ? (
                  <ul>
                    {notice.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <IconButton icon={faXmark} iconOnly variant="ghost" ariaLabel="Fechar aviso" onClick={() => setNotice(null)} />
            </div>
          ) : null}

          <ProjectForm
            form={form}
            mode={mode}
            meta={meta}
            measurement={measurement}
            issues={issues}
            checking={checking}
            onField={onField}
            onText={onText}
            gallery={{ onAdd: addGalleryFiles, onRemove: removeImage, onMove: moveImage, overlap, onOverlapChange: setOverlap, busyText }}
            texts={{
              onTranslate: translate,
              isTranslating,
              onOpenConsole: openConsole,
            }}
          />

          <div className="savebar">
            <p className="savebar__status" aria-live="polite">
              {issueCount
                ? `${issueCount} ${issueCount === 1 ? 'ponto' : 'pontos'} fora do padrão: o site não publica assim.`
                : isDirty
                  ? 'Alterações não salvas.'
                  : mode === 'create'
                    ? 'Rascunho guardado neste navegador.'
                    : 'Tudo salvo.'}
            </p>
            <div className="savebar__actions">
              {mode === 'edit' ? (
                <IconButton icon={faTrash} variant="danger" onClick={() => deleteRef.current?.showModal()}>
                  Excluir
                </IconButton>
              ) : null}
              <IconButton icon={faFloppyDisk} variant="primary" onClick={save} disabled={isSaving || Boolean(busyText)}>
                {isSaving ? 'Salvando…' : mode === 'create' ? 'Criar projeto' : 'Salvar alterações'}
              </IconButton>
            </div>
          </div>
        </section>
      </main>

      <dialog className="sheet console" aria-labelledby="console-title">
        <header className="sheet__head">
          <h2 id="console-title" className="type-subheading">
            Tradução <span className="console__status" data-status={consoleStatus}>{{ idle: 'parada', running: 'rodando', success: 'concluída', error: 'com erro' }[consoleStatus]}</span>
          </h2>
          <IconButton icon={faXmark} iconOnly variant="ghost" ariaLabel="Fechar" onClick={(event) => event.currentTarget.closest('dialog').close()} />
        </header>
        <div className="console__body" ref={consoleRef}>
          {consoleLogs.length ? (
            consoleLogs.map((entry) => (
              <p key={entry.id} className="console__line" data-level={entry.level}>
                <time>{entry.time}</time> {entry.message}
              </p>
            ))
          ) : (
            <p className="console__line">Sem registros. O progresso da tradução aparece aqui.</p>
          )}
        </div>
      </dialog>

      <dialog className="sheet" ref={deleteRef} aria-labelledby="delete-title" onClose={() => setDeleteText('')}>
        <header className="sheet__head">
          <h2 id="delete-title" className="type-subheading">
            Excluir {form.title}?
          </h2>
        </header>
        <p>O projeto sai do site e as imagens dele são apagadas da pasta do site. Não dá para desfazer pelo uploader.</p>
        <label className="field">
          <span className="field__label">
            Digite <strong>Excluir</strong> para confirmar
          </span>
          <input className="input" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} autoComplete="off" />
        </label>
        <div className="sheet__actions">
          <IconButton variant="outline" onClick={() => deleteRef.current?.close()} disabled={isDeleting}>
            Cancelar
          </IconButton>
          <IconButton icon={faTrash} variant="danger" onClick={remove} disabled={deleteText !== 'Excluir' || isDeleting}>
            {isDeleting ? 'Excluindo…' : 'Excluir projeto'}
          </IconButton>
        </div>
      </dialog>
    </div>
  );
}

export default App;
