import { useEffect, useMemo, useState } from 'react';
import {
  faArrowDown,
  faArrowUp,
  faCopy,
  faFloppyDisk,
  faPlus,
  faRotate,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import './App.css';
import IconButton from './components/IconButton';
import RichTextEditor from './components/RichTextEditor';
import { sanitizeRichTextHtml } from './components/richTextSanitize';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3333';
const DEFAULT_LOCALES = ['pt', 'en', 'es'];

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const emptyLocales = () => ({
  pt: { title: '', description: '' },
  en: { title: '', description: '' },
  es: { title: '', description: '' },
});

const emptyCommon = () => ({
  initialDate: '',
  endDate: '',
  projectUrlLink: '',
  linkedinUrlLink: '',
  githubUrlLink: '',
  developed: true,
  developingPorcentage: 100,
  compatibility: 3,
  icons: [],
});

const emptyForm = (category = '') => ({
  category,
  assetFolder: '',
  common: emptyCommon(),
  locales: emptyLocales(),
  thumbnail: { kind: 'none', path: '', preview: '', id: '', file: null },
  gallery: [],
});

function revokeObjectUrls(form) {
  if (!form) return;
  if (form.thumbnail?.kind === 'new' && form.thumbnail.preview) {
    URL.revokeObjectURL(form.thumbnail.preview);
  }
  form.gallery?.forEach((item) => {
    if (item.kind === 'new' && item.preview) {
      URL.revokeObjectURL(item.preview);
    }
  });
}

function toAssetPreviewUrl(relativePath) {
  if (!relativePath) return '';
  return `${API_BASE}/api/image?path=${encodeURIComponent(relativePath)}`;
}

function getStackIconFileName(iconClass) {
  if (!iconClass) return '';
  if (iconClass === 'c') return 'C.svg';
  return `${iconClass}.svg`;
}

function StackIcon({ iconClass, alt }) {
  const fileName = getStackIconFileName(iconClass);
  const sources = useMemo(() => {
    if (!fileName) return [];
    return [
      `${API_BASE}/api/image?path=${encodeURIComponent(`assets/icons/skills/${fileName}`)}`,
      `/stack-icons/${fileName}`,
    ];
  }, [fileName]);

  const [index, setIndex] = useState(0);

  if (!sources.length || index >= sources.length) return null;
  return (
    <img
      className="stack-icon"
      src={sources[index]}
      alt={alt || iconClass}
      onError={() => setIndex((value) => value + 1)}
    />
  );
}

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Erro na API.');
  }
  return payload;
}

function App() {
  const [meta, setMeta] = useState({
    categories: [],
    knownIcons: [],
    locales: DEFAULT_LOCALES,
  });
  const [projects, setProjects] = useState([]);
  const [mode, setMode] = useState('create');
  const [selectedSlug, setSelectedSlug] = useState('');
  const [activeLocale, setActiveLocale] = useState('pt');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm());

  const replaceForm = (nextForm) => {
    setForm((previous) => {
      revokeObjectUrls(previous);
      return nextForm;
    });
  };

  const refreshProjects = async () => {
    const result = await apiRequest('/api/projects?lang=pt');
    setProjects(result.projects || []);
  };

  const loadMetaAndProjects = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [metaResponse] = await Promise.all([apiRequest('/api/meta'), refreshProjects()]);
      setMeta({
        categories: metaResponse.categories || [],
        knownIcons: metaResponse.knownIcons || [],
        locales: metaResponse.locales || DEFAULT_LOCALES,
      });
      const defaultCategory = (metaResponse.categories || [])[0] || '';
      replaceForm(emptyForm(defaultCategory));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMetaAndProjects();
    return () => {
      revokeObjectUrls(form);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return projects.filter((project) => {
      if (categoryFilter !== 'all' && project.category !== categoryFilter) {
        return false;
      }
      if (!normalizedSearch) return true;
      return (
        project.title.toLowerCase().includes(normalizedSearch) ||
        project.slug.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [projects, search, categoryFilter]);

  const resetForCreate = () => {
    setMode('create');
    setSelectedSlug('');
    setError('');
    setFeedback('');
    const defaultCategory = meta.categories[0] || '';
    replaceForm(emptyForm(defaultCategory));
  };

  const loadProjectForEdit = async (slug) => {
    setError('');
    setFeedback('');
    try {
      const data = await apiRequest(`/api/projects/${encodeURIComponent(slug)}?lang=pt`);
      const nextForm = {
        category: data.category || '',
        assetFolder: data.assetFolder || '',
        common: {
          ...emptyCommon(),
          ...(data.common || {}),
          compatibility: Number(data.common?.compatibility || 3),
          developingPorcentage: Number(data.common?.developingPorcentage || 0),
          icons: Array.isArray(data.common?.icons) ? data.common.icons : [],
        },
        locales: {
          ...emptyLocales(),
          ...(data.locales || {}),
        },
        thumbnail: data.image
          ? {
              kind: 'existing',
              path: data.image,
              preview: toAssetPreviewUrl(data.image),
              id: '',
              file: null,
            }
          : { kind: 'none', path: '', preview: '', id: '', file: null },
        gallery: (data.images || []).map((imagePath) => ({
          id: createId(),
          kind: 'existing',
          path: imagePath,
          preview: toAssetPreviewUrl(imagePath),
          name: imagePath.split('/').at(-1),
          file: null,
        })),
      };
      setMode('edit');
      setSelectedSlug(slug);
      replaceForm(nextForm);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const updateCommon = (field, value) => {
    setForm((current) => ({
      ...current,
      common: {
        ...current.common,
        [field]: value,
      },
    }));
  };

  const updateLocaleField = (locale, field, value) => {
    setForm((current) => ({
      ...current,
      locales: {
        ...current.locales,
        [locale]: {
          ...current.locales[locale],
          [field]: value,
        },
      },
    }));
  };

  const addKnownIcon = (iconClass) => {
    setForm((current) => {
      if (current.common.icons.some((icon) => icon.class === iconClass)) {
        return current;
      }
      return {
        ...current,
        common: {
          ...current.common,
          icons: [...current.common.icons, { class: iconClass, tooltip: iconClass.toUpperCase() }],
        },
      };
    });
  };

  const addCustomIcon = () => {
    setForm((current) => ({
      ...current,
      common: {
        ...current.common,
        icons: [...current.common.icons, { class: '', tooltip: '' }],
      },
    }));
  };

  const updateIcon = (iconIndex, field, value) => {
    setForm((current) => ({
      ...current,
      common: {
        ...current.common,
        icons: current.common.icons.map((icon, index) =>
          index === iconIndex ? { ...icon, [field]: value } : icon
        ),
      },
    }));
  };

  const removeIcon = (iconIndex) => {
    setForm((current) => ({
      ...current,
      common: {
        ...current.common,
        icons: current.common.icons.filter((_, index) => index !== iconIndex),
      },
    }));
  };

  const addGalleryFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setForm((current) => ({
      ...current,
      gallery: [
        ...current.gallery,
        ...files.map((file) => ({
          id: createId(),
          kind: 'new',
          name: file.name,
          file,
          path: '',
          preview: URL.createObjectURL(file),
        })),
      ],
    }));
  };

  const removeGalleryImage = (imageId) => {
    setForm((current) => {
      const target = current.gallery.find((item) => item.id === imageId);
      if (target?.kind === 'new' && target.preview) {
        URL.revokeObjectURL(target.preview);
      }
      return {
        ...current,
        gallery: current.gallery.filter((item) => item.id !== imageId),
      };
    });
  };

  const moveGalleryImage = (imageIndex, direction) => {
    setForm((current) => {
      const nextIndex = imageIndex + direction;
      if (nextIndex < 0 || nextIndex >= current.gallery.length) return current;
      const reordered = [...current.gallery];
      const temp = reordered[imageIndex];
      reordered[imageIndex] = reordered[nextIndex];
      reordered[nextIndex] = temp;
      return {
        ...current,
        gallery: reordered,
      };
    });
  };

  const setNewThumbnail = (file) => {
    if (!file) return;
    setForm((current) => {
      if (current.thumbnail.kind === 'new' && current.thumbnail.preview) {
        URL.revokeObjectURL(current.thumbnail.preview);
      }
      return {
        ...current,
        thumbnail: {
          kind: 'new',
          id: createId(),
          file,
          path: '',
          preview: URL.createObjectURL(file),
        },
      };
    });
  };

  const clearThumbnail = () => {
    setForm((current) => {
      if (current.thumbnail.kind === 'new' && current.thumbnail.preview) {
        URL.revokeObjectURL(current.thumbnail.preview);
      }
      return {
        ...current,
        thumbnail: { kind: 'none', path: '', preview: '', id: '', file: null },
      };
    });
  };

  const copyPtToOtherLocales = () => {
    setForm((current) => ({
      ...current,
      locales: {
        ...current.locales,
        en: {
          title: current.locales.pt.title,
          description: current.locales.pt.description,
        },
        es: {
          title: current.locales.pt.title,
          description: current.locales.pt.description,
        },
      },
    }));
  };

  const validateBeforeSave = () => {
    const validationErrors = [];

    if (!form.category) validationErrors.push('Selecione uma categoria.');
    if (!form.assetFolder.trim()) validationErrors.push('Preencha o identificador da pasta de imagens.');

    const sanitizedLocales = DEFAULT_LOCALES.reduce((accumulator, locale) => {
      const title = (form.locales[locale]?.title || '').trim();
      const description = sanitizeRichTextHtml(form.locales[locale]?.description || '');
      accumulator[locale] = { title, description };
      if (!title) {
        validationErrors.push(`Titulo do locale ${locale.toUpperCase()} eh obrigatorio.`);
      }
      if (!description.trim()) {
        validationErrors.push(`Descricao do locale ${locale.toUpperCase()} eh obrigatoria.`);
      }
      return accumulator;
    }, {});

    if (!form.common.initialDate.trim()) validationErrors.push('Data inicial eh obrigatoria.');
    if (!form.common.endDate.trim()) validationErrors.push('Data final eh obrigatoria.');
    if (!Array.isArray(form.common.icons) || form.common.icons.length === 0) {
      validationErrors.push('Adicione ao menos 1 stack/tecnologia.');
    }

    const normalizedIcons = (form.common.icons || [])
      .map((icon) => ({
        class: (icon.class || '').trim(),
        tooltip: (icon.tooltip || '').trim(),
      }))
      .filter((icon) => icon.class || icon.tooltip);

    if (normalizedIcons.some((icon) => !icon.class || !icon.tooltip)) {
      validationErrors.push('Cada stack precisa de class e tooltip.');
    }

    if (!form.gallery.length) validationErrors.push('Adicione ao menos 1 imagem de galeria.');
    if (form.thumbnail.kind === 'none') validationErrors.push('Selecione uma thumbnail do projeto.');

    if (![1, 2, 3].includes(Number(form.common.compatibility))) {
      validationErrors.push('Compatibilidade precisa ser 1, 2 ou 3.');
    }

    if (
      Number.isNaN(Number(form.common.developingPorcentage)) ||
      Number(form.common.developingPorcentage) < 0 ||
      Number(form.common.developingPorcentage) > 100
    ) {
      validationErrors.push('Porcentagem de desenvolvimento deve ficar entre 0 e 100.');
    }

    return {
      validationErrors,
      normalizedIcons,
      sanitizedLocales,
    };
  };

  const saveProject = async () => {
    setError('');
    setFeedback('');

    const { validationErrors, normalizedIcons, sanitizedLocales } = validateBeforeSave();
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' '));
      return;
    }

    const payload = {
      category: form.category,
      assetFolder: form.assetFolder.trim(),
      common: {
        ...form.common,
        compatibility: Number(form.common.compatibility),
        developingPorcentage: Number(form.common.developingPorcentage),
        icons: normalizedIcons,
      },
      locales: sanitizedLocales,
      galleryPlan: form.gallery.map((image) =>
        image.kind === 'existing'
          ? { kind: 'existing', path: image.path }
          : { kind: 'new', fileId: image.id }
      ),
      thumbnailPlan:
        form.thumbnail.kind === 'existing'
          ? { kind: 'existing', path: form.thumbnail.path }
          : { kind: 'new', fileId: form.thumbnail.id },
    };

    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));

    form.gallery.forEach((image) => {
      if (image.kind !== 'new') return;
      formData.append('galleryFiles', image.file, `${image.id}__${image.file.name}`);
    });

    if (form.thumbnail.kind === 'new') {
      formData.append(
        'thumbnailFiles',
        form.thumbnail.file,
        `${form.thumbnail.id}__${form.thumbnail.file.name}`
      );
    }

    const endpoint =
      mode === 'create'
        ? '/api/projects'
        : `/api/projects/${encodeURIComponent(selectedSlug)}?lang=pt`;
    const method = mode === 'create' ? 'POST' : 'PUT';

    setIsSaving(true);
    try {
      const result = await apiRequest(endpoint, {
        method,
        body: formData,
      });
      setFeedback(result.message || 'Projeto salvo.');
      await refreshProjects();
      await loadProjectForEdit(result.slug);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <header className="topbar">
        <h1>Portfolio Project Uploader</h1>
        <div className="topbar-actions">
          <IconButton icon={faPlus} variant="secondary" onClick={resetForCreate}>
            Novo projeto
          </IconButton>
          <IconButton icon={faRotate} variant="secondary" onClick={loadMetaAndProjects}>
            Recarregar
          </IconButton>
        </div>
      </header>

      {error ? <p className="alert error">{error}</p> : null}
      {feedback ? <p className="alert success">{feedback}</p> : null}

      <main className="layout">
        <aside className="project-list-panel">
          <div className="panel-header">
            <h2>Projetos</h2>
            <p>{projects.length} itens</p>
          </div>

          <input
            className="input"
            type="search"
            placeholder="Buscar por titulo ou slug"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            className="input"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="all">Todas as categorias</option>
            {meta.categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <div className="project-cards">
            {isLoading ? <p>Carregando...</p> : null}
            {!isLoading && !filteredProjects.length ? <p>Nenhum projeto encontrado.</p> : null}
            {filteredProjects.map((project) => (
              <button
                key={`${project.category}-${project.slug}-${project.index}`}
                type="button"
                className={`project-card ${selectedSlug === project.slug ? 'active' : ''}`}
                onClick={() => loadProjectForEdit(project.slug)}
              >
                <img src={toAssetPreviewUrl(project.image)} alt={project.title} />
                <div className="project-card-body">
                  <strong>{project.title}</strong>
                  <small>
                    {project.category} · {project.slug}
                  </small>
                </div>
                <span className="project-card-edit" aria-hidden="true">
                  ✎
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="editor-panel">
          <div className="panel-header">
            <h2>{mode === 'create' ? 'Criar projeto' : `Editar: ${selectedSlug}`}</h2>
          </div>

          <div className="form-grid">
            <label>
              Categoria
              <select
                className="input"
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
              >
                <option value="">Selecione</option>
                {meta.categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Pasta de imagens (assetFolder)
              <input
                className="input"
                value={form.assetFolder}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    assetFolder: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Data inicial (MM/YYYY)
              <input
                className="input"
                value={form.common.initialDate}
                onChange={(event) => updateCommon('initialDate', event.target.value)}
              />
            </label>

            <label>
              Data final (MM/YYYY)
              <input
                className="input"
                value={form.common.endDate}
                onChange={(event) => updateCommon('endDate', event.target.value)}
              />
            </label>

            <label>
              URL do projeto
              <input
                className="input"
                value={form.common.projectUrlLink}
                onChange={(event) => updateCommon('projectUrlLink', event.target.value)}
              />
            </label>

            <label>
              URL do LinkedIn
              <input
                className="input"
                value={form.common.linkedinUrlLink}
                onChange={(event) => updateCommon('linkedinUrlLink', event.target.value)}
              />
            </label>

            <label>
              URL do GitHub
              <input
                className="input"
                value={form.common.githubUrlLink}
                onChange={(event) => updateCommon('githubUrlLink', event.target.value)}
              />
            </label>

            <label>
              Compatibilidade (1-3)
              <select
                className="input"
                value={form.common.compatibility}
                onChange={(event) => updateCommon('compatibility', Number(event.target.value))}
              >
                <option value={1}>1 · Mobile</option>
                <option value={2}>2 · Mobile + Tablet</option>
                <option value={3}>3 · Mobile + Tablet + Desktop</option>
              </select>
            </label>
          </div>

          <div className="inline-controls">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={Boolean(form.common.developed)}
                onChange={(event) => updateCommon('developed', event.target.checked)}
              />
              Projeto concluido
            </label>

            <label>
              Progresso (%)
              <input
                className="input short"
                type="number"
                min={0}
                max={100}
                value={form.common.developingPorcentage}
                onChange={(event) =>
                  updateCommon('developingPorcentage', Number(event.target.value || 0))
                }
              />
            </label>
          </div>

          <section className="block">
            <div className="block-header">
              <h3>Stacks / Tecnologias</h3>
              <IconButton icon={faPlus} variant="secondary" onClick={addCustomIcon}>
                Stack custom
              </IconButton>
            </div>

            <div className="icon-pills">
              {meta.knownIcons.map((iconClass) => (
                <button key={iconClass} type="button" className="pill" onClick={() => addKnownIcon(iconClass)}>
                  <StackIcon key={`known-${iconClass}`} iconClass={iconClass} alt={iconClass} />
                  <span>{iconClass}</span>
                </button>
              ))}
            </div>

            <div className="icon-list">
              {form.common.icons.map((icon, index) => (
                <div key={`icon-${index}`} className="icon-row">
                  <div className="icon-preview">
                    <StackIcon key={`preview-${icon.class}-${index}`} iconClass={icon.class} alt={icon.class || 'stack'} />
                  </div>
                  <input
                    className="input"
                    placeholder="class"
                    value={icon.class}
                    onChange={(event) => updateIcon(index, 'class', event.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="tooltip"
                    value={icon.tooltip}
                    onChange={(event) => updateIcon(index, 'tooltip', event.target.value)}
                  />
                  <IconButton
                    icon={faTrash}
                    variant="danger"
                    iconOnly
                    ariaLabel="Remover stack"
                    onClick={() => removeIcon(index)}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="block">
            <div className="block-header">
              <h3>Conteudo por idioma</h3>
              <IconButton icon={faCopy} variant="secondary" onClick={copyPtToOtherLocales}>
                Copiar PT para EN/ES
              </IconButton>
            </div>

            <div className="locale-tabs">
              {DEFAULT_LOCALES.map((locale) => (
                <button
                  key={locale}
                  type="button"
                  className={`locale-tab ${activeLocale === locale ? 'active' : ''}`}
                  onClick={() => setActiveLocale(locale)}
                >
                  {locale.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="locale-editor">
              <label>
                Titulo ({activeLocale.toUpperCase()})
                <input
                  className="input"
                  value={form.locales[activeLocale]?.title || ''}
                  onChange={(event) => updateLocaleField(activeLocale, 'title', event.target.value)}
                />
              </label>

              <label>
                Descricao HTML ({activeLocale.toUpperCase()})
                <RichTextEditor
                  value={form.locales[activeLocale]?.description || ''}
                  onChange={(nextHtml) => updateLocaleField(activeLocale, 'description', nextHtml)}
                />
              </label>
            </div>
          </section>

          <section className="block">
            <div className="block-header">
              <h3>Thumbnail</h3>
              <IconButton icon={faTrash} variant="danger" onClick={clearThumbnail}>
                Limpar
              </IconButton>
            </div>

            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={(event) => setNewThumbnail(event.target.files?.[0])}
            />

            {form.thumbnail.preview ? (
              <img className="thumb-preview" src={form.thumbnail.preview} alt="Preview thumbnail" />
            ) : (
              <p className="muted">Nenhuma thumbnail selecionada.</p>
            )}
          </section>

          <section className="block">
            <div className="block-header">
              <h3>Galeria de imagens</h3>
            </div>

            <input
              className="input"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => addGalleryFiles(event.target.files)}
            />

            <div className="gallery-list">
              {form.gallery.map((image, index) => (
                <article key={image.id} className="gallery-item">
                  <img src={image.preview} alt={image.name || `imagem-${index + 1}`} />
                  <div className="gallery-meta">
                    <strong>{image.name || image.path}</strong>
                    <small>{image.kind === 'new' ? 'nova' : 'existente'}</small>
                  </div>
                  <div className="gallery-actions">
                    <IconButton
                      icon={faArrowUp}
                      iconOnly
                      ariaLabel="Mover imagem para cima"
                      onClick={() => moveGalleryImage(index, -1)}
                    />
                    <IconButton
                      icon={faArrowDown}
                      iconOnly
                      ariaLabel="Mover imagem para baixo"
                      onClick={() => moveGalleryImage(index, 1)}
                    />
                    <IconButton
                      icon={faTrash}
                      variant="danger"
                      iconOnly
                      ariaLabel="Remover imagem"
                      onClick={() => removeGalleryImage(image.id)}
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="submit-row">
            <IconButton icon={faFloppyDisk} variant="primary" disabled={isSaving} onClick={saveProject}>
              {isSaving ? 'Salvando...' : mode === 'create' ? 'Criar projeto' : 'Salvar edicao'}
            </IconButton>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
