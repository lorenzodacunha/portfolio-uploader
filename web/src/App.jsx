import { useEffect, useMemo, useRef, useState } from 'react';
import {
  faFloppyDisk,
  faGripVertical,
  faPlus,
  faRotate,
  faTerminal,
  faTrash,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import './App.css';
import FileUploadDropzone from './components/FileUploadDropzone';
import IconButton from './components/IconButton';
import RichTextEditor from './components/RichTextEditor';
import { sanitizeRichTextHtml } from './components/richTextSanitize';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3333';
const DEFAULT_LOCALES = ['pt', 'en', 'es'];
const SPLIT_FRAME_WIDTH = 1920;
const SPLIT_FRAME_HEIGHT = 1080;
const DEFAULT_SPLIT_OVERLAP = 120;
const THUMB_PREVIEW_WIDTH = 248;
const THUMB_PREVIEW_HEIGHT = Math.round(THUMB_PREVIEW_WIDTH / (195 / 113));
const DEFAULT_LOGO_PADDING_PERCENT = 15;

const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const createProjectPersistentId = () =>
  `prj_${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;

const waitNextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

function readImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error(`Falha ao carregar imagem "${file.name}".`));
    };
    image.src = imageUrl;
  });
}

function canvasToPngFile(canvas, fileName) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Falha ao gerar frame da imagem.'));
        return;
      }
      resolve(
        new File([blob], fileName, {
          type: 'image/png',
          lastModified: Date.now(),
        })
      );
    }, 'image/png');
  });
}

async function splitTallImageFile(file, overlapPx) {
  const image = await readImageFromFile(file);
  const shouldSplit = image.naturalHeight > SPLIT_FRAME_HEIGHT;
  if (!shouldSplit) {
    return {
      didSplit: false,
      files: [file],
    };
  }

  const scale = SPLIT_FRAME_WIDTH / image.naturalWidth;
  const scaledHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  if (scaledHeight <= SPLIT_FRAME_HEIGHT) {
    return {
      didSplit: false,
      files: [file],
    };
  }

  const overlap = Number.isFinite(overlapPx)
    ? Math.max(0, Math.min(SPLIT_FRAME_HEIGHT - 1, Math.round(overlapPx)))
    : DEFAULT_SPLIT_OVERLAP;
  const step = Math.max(1, SPLIT_FRAME_HEIGHT - overlap);

  const frameTops = [];
  for (let top = 0; top + SPLIT_FRAME_HEIGHT < scaledHeight; top += step) {
    frameTops.push(top);
  }
  const anchoredLastTop = Math.max(0, scaledHeight - SPLIT_FRAME_HEIGHT);
  if (frameTops.length === 0 || frameTops[frameTops.length - 1] !== anchoredLastTop) {
    frameTops.push(anchoredLastTop);
  }

  const sourceSliceHeight = SPLIT_FRAME_HEIGHT / scale;
  const frameFiles = [];
  const fileBaseName = file.name.replace(/\.[^/.]+$/, '');

  for (let index = 0; index < frameTops.length; index += 1) {
    const sourceY = frameTops[index] / scale;
    const canvas = document.createElement('canvas');
    canvas.width = SPLIT_FRAME_WIDTH;
    canvas.height = SPLIT_FRAME_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Falha ao inicializar canvas para split da imagem.');
    }

    ctx.drawImage(
      image,
      0,
      sourceY,
      image.naturalWidth,
      sourceSliceHeight,
      0,
      0,
      SPLIT_FRAME_WIDTH,
      SPLIT_FRAME_HEIGHT
    );

    const paddedNumber = String(index + 1).padStart(3, '0');
    const frameName = `${fileBaseName}__${paddedNumber}.png`;
    // Mantem o app responsivo durante split de imagens muito altas.
    await waitNextFrame();
    const frameFile = await canvasToPngFile(canvas, frameName);
    frameFiles.push(frameFile);
  }

  return {
    didSplit: true,
    files: frameFiles,
  };
}

async function generateLogoThumbnailPreviewFile(logoFile, backgroundColor, paddingPercent) {
  const image = await readImageFromFile(logoFile);
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_PREVIEW_WIDTH;
  canvas.height = THUMB_PREVIEW_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Falha ao gerar preview da thumb.');
  }

  ctx.fillStyle = backgroundColor || '#1f1f1f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const minDimension = Math.min(canvas.width, canvas.height);
  const safePadding = Math.max(0, Math.min(40, Number(paddingPercent) || DEFAULT_LOGO_PADDING_PERCENT));
  const paddingPx = Math.round((minDimension * safePadding) / 100);
  const maxLogoWidth = Math.max(1, canvas.width - paddingPx * 2);
  const maxLogoHeight = Math.max(1, canvas.height - paddingPx * 2);

  const logoScale = Math.min(maxLogoWidth / image.naturalWidth, maxLogoHeight / image.naturalHeight, 1);
  const drawWidth = Math.max(1, Math.round(image.naturalWidth * logoScale));
  const drawHeight = Math.max(1, Math.round(image.naturalHeight * logoScale));
  const offsetX = Math.round((canvas.width - drawWidth) / 2);
  const offsetY = Math.round((canvas.height - drawHeight) / 2);

  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  return canvasToPngFile(canvas, 'thumb-logo-preview.png');
}

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
  id: createProjectPersistentId(),
  category,
  common: emptyCommon(),
  locales: emptyLocales(),
  thumbnail: {
    mode: 'image',
    kind: 'none',
    path: '',
    preview: '',
    id: '',
    file: null,
    logo: { id: '', file: null, name: '' },
    backgroundColor: '#1f1f1f',
    paddingPercent: DEFAULT_LOGO_PADDING_PERCENT,
  },
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
  if (form.thumbnail?.mode === 'logoColor' && form.thumbnail?.preview) {
    URL.revokeObjectURL(form.thumbnail.preview);
  }
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
  const [selectedId, setSelectedId] = useState('');
  const [activeLocale, setActiveLocale] = useState('pt');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [draggingGalleryId, setDraggingGalleryId] = useState('');
  const [draggingProjectId, setDraggingProjectId] = useState('');
  const [isReorderingProjects, setIsReorderingProjects] = useState(false);
  const [isSplittingGallery, setIsSplittingGallery] = useState(false);
  const [splitProgressText, setSplitProgressText] = useState('');
  const [gallerySplitOverlap, setGallerySplitOverlap] = useState(DEFAULT_SPLIT_OVERLAP);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [consoleStatus, setConsoleStatus] = useState('idle');
  const consoleBodyRef = useRef(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

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

  useEffect(() => {
    if (!isConsoleOpen || !consoleBodyRef.current) return;
    consoleBodyRef.current.scrollTop = consoleBodyRef.current.scrollHeight;
  }, [consoleLogs, isConsoleOpen]);

  useEffect(() => {
    let canceled = false;

    const syncLogoPreview = async () => {
      if (form.thumbnail.mode !== 'logoColor' || !form.thumbnail.logo?.file) {
        if (form.thumbnail.mode === 'logoColor') {
          setForm((current) => {
            if (current.thumbnail.mode !== 'logoColor' || !current.thumbnail.preview) return current;
            if (current.thumbnail.preview.startsWith('blob:')) {
              URL.revokeObjectURL(current.thumbnail.preview);
            }
            return {
              ...current,
              thumbnail: {
                ...current.thumbnail,
                preview: '',
              },
            };
          });
        }
        return;
      }

      try {
        const previewFile = await generateLogoThumbnailPreviewFile(
          form.thumbnail.logo.file,
          form.thumbnail.backgroundColor,
          form.thumbnail.paddingPercent
        );
        if (canceled) return;
        const previewUrl = URL.createObjectURL(previewFile);
        setForm((current) => {
          if (current.thumbnail.mode !== 'logoColor') {
            URL.revokeObjectURL(previewUrl);
            return current;
          }
          if (current.thumbnail.preview && current.thumbnail.preview.startsWith('blob:')) {
            URL.revokeObjectURL(current.thumbnail.preview);
          }
          return {
            ...current,
            thumbnail: {
              ...current.thumbnail,
              preview: previewUrl,
            },
          };
        });
      } catch {
        if (!canceled) {
          setError('Nao foi possivel gerar o preview da thumb (Logo + Cor).');
        }
      }
    };

    syncLogoPreview();

    return () => {
      canceled = true;
    };
  }, [
    form.thumbnail.mode,
    form.thumbnail.logo?.file,
    form.thumbnail.backgroundColor,
    form.thumbnail.paddingPercent,
  ]);

  const appendConsoleLog = (message, level = 'info') => {
    const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    setConsoleLogs((current) => [
      ...current,
      {
        id: createId(),
        timestamp,
        level,
        message: String(message || ''),
      },
    ]);
  };

  const filteredProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return projects.filter((project) => {
      if (categoryFilter !== 'all' && project.category !== categoryFilter) {
        return false;
      }
      if (!normalizedSearch) return true;
      return (
        project.title.toLowerCase().includes(normalizedSearch) ||
        (project.id || '').toLowerCase().includes(normalizedSearch) ||
        (project.slug || '').toLowerCase().includes(normalizedSearch)
      );
    });
  }, [projects, search, categoryFilter]);

  const canDragReorderProjects = useMemo(
    () => categoryFilter !== 'all' && !search.trim() && !isLoading,
    [categoryFilter, search, isLoading]
  );

  const reorderProjectsInCategory = (projectIdFrom, projectIdTo) => {
    if (!projectIdFrom || !projectIdTo || projectIdFrom === projectIdTo) {
      return null;
    }

    const categoryProjects = projects.filter((project) => project.category === categoryFilter);
    const fromIndex = categoryProjects.findIndex((project) => project.id === projectIdFrom);
    const toIndex = categoryProjects.findIndex((project) => project.id === projectIdTo);
    if (fromIndex < 0 || toIndex < 0) return null;

    const reorderedCategory = [...categoryProjects];
    const [moved] = reorderedCategory.splice(fromIndex, 1);
    reorderedCategory.splice(toIndex, 0, moved);
    const reorderedIds = reorderedCategory.map((project) => project.id);

    const next = [];
    let pointer = 0;
    for (const project of projects) {
      if (project.category !== categoryFilter) {
        next.push(project);
        continue;
      }
      next.push(reorderedCategory[pointer]);
      pointer += 1;
    }

    setProjects(next);
    return reorderedIds;
  };

  const persistProjectOrder = async (orderedIds) => {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) return;
    setIsReorderingProjects(true);
    setError('');
    try {
      const response = await apiRequest('/api/projects/reorder?lang=pt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: categoryFilter,
          orderedIds,
        }),
      });
      setFeedback(response.message || 'Ordem dos projetos atualizada.');
      await refreshProjects();
    } catch (requestError) {
      setError(requestError.message);
      await refreshProjects();
    } finally {
      setIsReorderingProjects(false);
    }
  };

  const resetForCreate = () => {
    setMode('create');
    setSelectedId('');
    setError('');
    setFeedback('');
    setIsDeleteModalOpen(false);
    setDeleteConfirmText('');
    setIsDeleting(false);
    const defaultCategory = meta.categories[0] || '';
    replaceForm(emptyForm(defaultCategory));
  };

  const loadProjectForEdit = async (projectId) => {
    setError('');
    setFeedback('');
    try {
      const data = await apiRequest(`/api/projects/${encodeURIComponent(projectId)}?lang=pt`);
      const nextForm = {
        id: data.id || projectId,
        category: data.category || '',
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
              mode: 'image',
              kind: 'existing',
              path: data.image,
              preview: toAssetPreviewUrl(data.image),
              id: '',
              file: null,
              logo: { id: '', file: null, name: '' },
              backgroundColor: '#1f1f1f',
              paddingPercent: DEFAULT_LOGO_PADDING_PERCENT,
            }
          : {
              mode: 'image',
              kind: 'none',
              path: '',
              preview: '',
              id: '',
              file: null,
              logo: { id: '', file: null, name: '' },
              backgroundColor: '#1f1f1f',
              paddingPercent: DEFAULT_LOGO_PADDING_PERCENT,
            },
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
      setSelectedId(data.id || projectId);
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

  const toNewGalleryItem = (file, displayName = file.name) => ({
    id: createId(),
    kind: 'new',
    name: displayName,
    file,
    path: '',
    preview: URL.createObjectURL(file),
  });

  const addGalleryFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    setError('');
    setFeedback('');
    setIsSplittingGallery(true);
    const overlap = Number.isFinite(Number(gallerySplitOverlap))
      ? Number(gallerySplitOverlap)
      : DEFAULT_SPLIT_OVERLAP;
    const nextItems = [];
    const splitSummaries = [];
    const warnings = [];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setSplitProgressText(`Splitting... ${index + 1}/${files.length} (${file.name})`);
        try {
          const splitResult = await splitTallImageFile(file, overlap);
          if (splitResult.didSplit) {
            splitSummaries.push(`${file.name} -> ${splitResult.files.length} frames`);
          }
          splitResult.files.forEach((item) => {
            nextItems.push(toNewGalleryItem(item, item.name));
          });
        } catch {
          warnings.push(`Falha no split de "${file.name}". A imagem original foi mantida.`);
          nextItems.push(toNewGalleryItem(file, file.name));
          await waitNextFrame();
        }
      }
    } finally {
      setIsSplittingGallery(false);
      setSplitProgressText('');
    }

    if (nextItems.length > 0) {
      setForm((current) => ({
        ...current,
        gallery: [...current.gallery, ...nextItems],
      }));
    }

    if (splitSummaries.length > 0) {
      setFeedback(`Split concluido: ${splitSummaries.join(' | ')}`);
    }
    if (warnings.length > 0) {
      setError(warnings.join(' '));
    }
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

  const moveGalleryImageByDrag = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    setForm((current) => {
      const fromIndex = current.gallery.findIndex((item) => item.id === fromId);
      const toIndex = current.gallery.findIndex((item) => item.id === toId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const reordered = [...current.gallery];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
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
          ...current.thumbnail,
          mode: 'image',
          kind: 'new',
          id: createId(),
          file,
          path: '',
          preview: URL.createObjectURL(file),
          logo: { id: '', file: null, name: '' },
        },
      };
    });
  };

  const toggleLogoColorThumbnailMode = (enabled) => {
    setForm((current) => {
      const previousPreview = current.thumbnail.preview;
      if (previousPreview && previousPreview.startsWith('blob:')) {
        URL.revokeObjectURL(previousPreview);
      }
      if (enabled) {
        return {
          ...current,
          thumbnail: {
            ...current.thumbnail,
            mode: 'logoColor',
            kind: 'none',
            path: '',
            id: '',
            file: null,
            preview: '',
          },
        };
      }

      return {
        ...current,
        thumbnail: {
          ...current.thumbnail,
          mode: 'image',
          kind: 'none',
          path: '',
          id: '',
          file: null,
          preview: '',
          logo: { id: '', file: null, name: '' },
        },
      };
    });
  };

  const setLogoThumbnailFile = (file) => {
    if (!file) return;
    setForm((current) => ({
      ...current,
      thumbnail: {
        ...current.thumbnail,
        mode: 'logoColor',
        kind: 'new',
        id: createId(),
        file,
        path: '',
        logo: {
          id: createId(),
          file,
          name: file.name,
        },
      },
    }));
  };

  const clearThumbnail = () => {
    setForm((current) => {
      if (current.thumbnail.kind === 'new' && current.thumbnail.preview) {
        URL.revokeObjectURL(current.thumbnail.preview);
      }
      return {
        ...current,
        thumbnail: {
          ...current.thumbnail,
          kind: 'none',
          path: '',
          preview: '',
          id: '',
          file: null,
          logo: { id: '', file: null, name: '' },
        },
      };
    });
  };

  const translatePtToOtherLocales = async () => {
    setError('');
    setFeedback('');

    const ptTitle = (form.locales.pt?.title || '').trim();
    const ptDescription = sanitizeRichTextHtml(form.locales.pt?.description || '');
    if (!ptTitle && !ptDescription.trim()) {
      setError('Preencha titulo ou descricao em PT antes de traduzir.');
      return;
    }

    const hasContentInTargets = ['en', 'es'].some((locale) => {
      const localeData = form.locales[locale] || {};
      return (localeData.title || '').trim() || (localeData.description || '').trim();
    });

    let shouldOverwrite = true;
    if (hasContentInTargets) {
      shouldOverwrite = window.confirm(
        'EN/ES ja possuem conteudo. Clique OK para sobrescrever tudo. Clique Cancelar para preencher apenas campos vazios.'
      );
    }

    setIsTranslating(true);
    setIsConsoleOpen(true);
    setConsoleStatus('running');
    setConsoleLogs([]);
    appendConsoleLog('Iniciando traducao com Ollama...', 'info');
    try {
      const response = await fetch(`${API_BASE}/api/translate/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceLang: 'pt',
          targets: ['en', 'es'],
          content: {
            title: ptTitle,
            descriptionHtml: ptDescription,
            iconsTooltips: [],
          },
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'Falha ao iniciar traducao.');
      }

      if (!response.body) {
        throw new Error('Nao foi possivel acompanhar o progresso da traducao.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let streamError = null;
      let translatedPayload = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let lineBreak = buffer.indexOf('\n');
        while (lineBreak >= 0) {
          const rawLine = buffer.slice(0, lineBreak).trim();
          buffer = buffer.slice(lineBreak + 1);
          lineBreak = buffer.indexOf('\n');

          if (!rawLine) continue;

          let eventPayload;
          try {
            eventPayload = JSON.parse(rawLine);
          } catch {
            continue;
          }

          if (eventPayload.event === 'ping') {
            continue;
          }

          if (eventPayload.event === 'log') {
            appendConsoleLog(eventPayload.message || 'Processando...', eventPayload.level || 'info');
            continue;
          }

          if (eventPayload.event === 'error') {
            streamError = new Error(eventPayload.message || 'Falha na traducao via Ollama.');
            break;
          }

          if (eventPayload.event === 'result') {
            translatedPayload = eventPayload.translations || null;
          }
        }

        if (streamError) break;
      }

      if (streamError) {
        throw streamError;
      }

      if (!translatedPayload) {
        throw new Error('A traducao terminou sem resultado valido.');
      }

      setForm((current) => {
        const nextLocales = { ...current.locales };

        ['en', 'es'].forEach((locale) => {
          const translated = translatedPayload?.[locale];
          if (!translated) return;
          const currentLocale = current.locales[locale] || { title: '', description: '' };
          const translatedTitle = String(translated.title || '').trim();
          const translatedDescription = sanitizeRichTextHtml(
            String(translated.descriptionHtml || '')
          );

          nextLocales[locale] = {
            title:
              shouldOverwrite || !String(currentLocale.title || '').trim()
                ? translatedTitle
                : currentLocale.title,
            description:
              shouldOverwrite || !String(currentLocale.description || '').trim()
                ? translatedDescription
                : currentLocale.description,
          };
        });

        return {
          ...current,
          locales: nextLocales,
        };
      });

      appendConsoleLog('Traducoes aplicadas em EN/ES.', 'success');
      setConsoleStatus('success');
      setFeedback('Traducoes geradas com IA. Revise EN e ES antes de salvar.');
    } catch (requestError) {
      appendConsoleLog(requestError.message || 'Erro inesperado durante a traducao.', 'error');
      setConsoleStatus('error');
      setError(requestError.message);
    } finally {
      setIsTranslating(false);
    }
  };

  const validateBeforeSave = () => {
    const validationErrors = [];

    if (!form.category) validationErrors.push('Selecione uma categoria.');
    if (!form.id || !String(form.id).trim()) validationErrors.push('ID do projeto nao pode ficar vazio.');

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
    if (form.thumbnail.mode === 'logoColor') {
      if (form.thumbnail.kind !== 'new' || !form.thumbnail.logo?.file) {
        validationErrors.push('No modo Logo + Cor, envie uma logo para gerar a thumbnail.');
      }
      if (!/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(String(form.thumbnail.backgroundColor || ''))) {
        validationErrors.push('Selecione uma cor de fundo valida para a thumbnail.');
      }
      if (
        !Number.isFinite(Number(form.thumbnail.paddingPercent)) ||
        Number(form.thumbnail.paddingPercent) < 0 ||
        Number(form.thumbnail.paddingPercent) > 40
      ) {
        validationErrors.push('Padding da logo deve ficar entre 0 e 40%.');
      }
    } else if (form.thumbnail.kind === 'none') {
      validationErrors.push('Selecione uma thumbnail do projeto.');
    }

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
      id: form.id,
      category: form.category,
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
          : {
              kind: 'new',
              fileId: form.thumbnail.mode === 'logoColor' ? form.thumbnail.logo.id : form.thumbnail.id,
            },
      thumbnailConfig:
        form.thumbnail.mode === 'logoColor'
          ? {
              mode: 'logoColor',
              logoFileId: form.thumbnail.logo.id,
              backgroundColor: form.thumbnail.backgroundColor,
              paddingPercent: Number(form.thumbnail.paddingPercent),
            }
          : {
              mode: 'image',
            },
    };

    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));

    form.gallery.forEach((image) => {
      if (image.kind !== 'new') return;
      formData.append('galleryFiles', image.file, `${image.id}__${image.file.name}`);
    });

    if (form.thumbnail.kind === 'new') {
      const thumbnailFile = form.thumbnail.mode === 'logoColor' ? form.thumbnail.logo.file : form.thumbnail.file;
      const thumbnailFileId = form.thumbnail.mode === 'logoColor' ? form.thumbnail.logo.id : form.thumbnail.id;
      if (!thumbnailFile || !thumbnailFileId) {
        setError('Arquivo da thumbnail nao encontrado para upload.');
        return;
      }
      formData.append(
        'thumbnailFiles',
        thumbnailFile,
        `${thumbnailFileId}__${thumbnailFile.name}`
      );
    }

    const endpoint =
      mode === 'create'
        ? '/api/projects'
        : `/api/projects/${encodeURIComponent(selectedId)}?lang=pt`;
    const method = mode === 'create' ? 'POST' : 'PUT';

    setIsSaving(true);
    try {
      const result = await apiRequest(endpoint, {
        method,
        body: formData,
      });
      setFeedback(result.message || 'Projeto salvo.');
      await refreshProjects();
      await loadProjectForEdit(result.id || form.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  };

  const openDeleteModal = () => {
    setDeleteConfirmText('');
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setIsDeleteModalOpen(false);
    setDeleteConfirmText('');
  };

  const deleteProject = async () => {
    if (!selectedId || mode !== 'edit') return;
    if (deleteConfirmText !== 'Deletar') return;

    setError('');
    setFeedback('');
    setIsDeleting(true);
    try {
      const result = await apiRequest(`/api/projects/${encodeURIComponent(selectedId)}?lang=pt`, {
        method: 'DELETE',
      });

      setIsDeleteModalOpen(false);
      setDeleteConfirmText('');
      await refreshProjects();
      resetForCreate();
      setFeedback(result.message || 'Projeto deletado com sucesso.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsDeleting(false);
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
            placeholder="Buscar por titulo, id ou slug"
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
            {canDragReorderProjects ? (
              <p className="muted reorder-hint">
                Arraste os cards para reordenar a categoria "{categoryFilter}".
              </p>
            ) : (
              <p className="muted reorder-hint">
                Para reordenar, selecione uma categoria especifica e limpe a busca.
              </p>
            )}
            {isLoading ? <p>Carregando...</p> : null}
            {!isLoading && !filteredProjects.length ? <p>Nenhum projeto encontrado.</p> : null}
            {filteredProjects.map((project) => (
              <button
                key={`${project.category}-${project.id}-${project.index}`}
                type="button"
                draggable={canDragReorderProjects && !isReorderingProjects}
                className={`project-card ${selectedId === project.id ? 'active' : ''} ${
                  draggingProjectId === project.id ? 'is-dragging' : ''
                }`}
                onClick={() => loadProjectForEdit(project.id)}
                onDragStart={(event) => {
                  if (!canDragReorderProjects || isReorderingProjects) {
                    event.preventDefault();
                    return;
                  }
                  setDraggingProjectId(project.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', project.id);
                }}
                onDragOver={(event) => {
                  if (!canDragReorderProjects || isReorderingProjects) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }}
                onDrop={async (event) => {
                  if (!canDragReorderProjects || isReorderingProjects) return;
                  event.preventDefault();
                  const fromId = event.dataTransfer.getData('text/plain') || draggingProjectId;
                  const reorderedIds = reorderProjectsInCategory(fromId, project.id);
                  setDraggingProjectId('');
                  if (reorderedIds) {
                    await persistProjectOrder(reorderedIds);
                  }
                }}
                onDragEnd={() => setDraggingProjectId('')}
              >
                <img src={toAssetPreviewUrl(project.image)} alt={project.title} />
                <div className="project-card-body">
                  <strong>{project.title}</strong>
                  <small>
                    {project.category} 
                  </small>
                </div>
                <div className="project-card-edit project-drag-indicator" aria-hidden="true">
                  <span className="project-drag-glyph">
                    <IconButton
                      icon={faGripVertical}
                      iconOnly
                      ariaLabel={`Arrastar imagem ${project.id}`}
                      className="drag-handle-btn"
                    /> 
                    </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="editor-panel">
          <div className="panel-header">
            <h2>{mode === 'create' ? 'Criar projeto' : `Editar: ${selectedId}`}</h2>
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
              ID (imutavel)
              <input className="input" value={form.id || ''} readOnly />
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
              <div className="locale-actions">
                <IconButton icon={faTerminal} variant="back" iconOnly onClick={() => setIsConsoleOpen(true)}></IconButton>
                <IconButton
                  icon={faWandMagicSparkles}
                  variant="primary"
                  className={isTranslating ? 'is-loading' : ''}
                  onClick={translatePtToOtherLocales}
                  disabled={isTranslating}
                >
                  {isTranslating ? 'Traduzindo...' : 'Traduzir com IA'}
                </IconButton>
              </div>
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

              <div className="field-block">
                <span>Descricao HTML ({activeLocale.toUpperCase()})</span>
                <RichTextEditor
                  value={form.locales[activeLocale]?.description || ''}
                  onChange={(nextHtml) => updateLocaleField(activeLocale, 'description', nextHtml)}
                />
              </div>
            </div>
          </section>

          <section className="block">
            <div className="block-header">
              <h3>Thumbnail</h3>
              <IconButton icon={faTrash} variant="danger" onClick={clearThumbnail}>
                Limpar
              </IconButton>
            </div>

            <label className="thumb-mode-toggle">
              <input
                type="checkbox"
                checked={form.thumbnail.mode === 'logoColor'}
                onChange={(event) => toggleLogoColorThumbnailMode(event.target.checked)}
              />
              Usar Logo + Cor (gerar thumb automaticamente)
            </label>

            {form.thumbnail.mode === 'logoColor' ? (
              <div className="thumb-logo-mode">
                <FileUploadDropzone
                  id="thumbnail-logo-upload"
                  accept="image/*,.svg"
                  title="Arraste e solte a logo"
                  browseLabel="Selecionar logo"
                  helperText="PNG, SVG ou WEBP"
                  onFilesSelected={(files) => setLogoThumbnailFile(files?.[0])}
                />

                <div className="thumb-logo-controls">
                  <label className="thumb-color-field">
                    Cor de fundo
                    <input
                      className="thumb-color-input"
                      type="color"
                      value={form.thumbnail.backgroundColor}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          thumbnail: {
                            ...current.thumbnail,
                            backgroundColor: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="thumb-padding-field">
                    Padding da logo (%)
                    <input
                      className="input thumb-padding-input"
                      type="number"
                      min={0}
                      max={40}
                      value={form.thumbnail.paddingPercent}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          thumbnail: {
                            ...current.thumbnail,
                            paddingPercent: Math.max(0, Math.min(40, Number(event.target.value || 0))),
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            ) : (
              <FileUploadDropzone
                id="thumbnail-upload"
                accept="image/*"
                title="Arraste e solte a thumbnail"
                browseLabel="Procurar"
                helperText="PNG, JPG ou WEBP"
                onFilesSelected={(files) => setNewThumbnail(files?.[0])}
              />
            )}

            {form.thumbnail.preview ? (
              <img className="thumb-preview" src={form.thumbnail.preview} alt="Preview thumbnail" />
            ) : (
              <p className="muted">Nenhuma thumbnail selecionada.</p>
            )}
          </section>

          <section className="block">
            <div className="block-header">
              <h3>Galeria de imagens</h3>
              <label className="split-overlap-control">
                Overlap (px)
                <input
                  className="input split-overlap-input"
                  type="number"
                  min={0}
                  max={1079}
                  value={gallerySplitOverlap}
                  onChange={(event) =>
                    setGallerySplitOverlap(
                      Math.max(0, Math.min(1079, Number(event.target.value || DEFAULT_SPLIT_OVERLAP)))
                    )
                  }
                />
              </label>
            </div>

            <FileUploadDropzone
              id="gallery-upload"
              accept="image/*"
              multiple
              title="Arraste e solte as imagens da galeria"
              browseLabel="Escolher imagens"
              helperText="Split automatico para imagens altas (>1080px)"
              onFilesSelected={addGalleryFiles}
            />

            {isSplittingGallery ? <p className="split-indicator">{splitProgressText || 'Splitting...'}</p> : null}

            <div className="gallery-list">
              {form.gallery.map((image, index) => (
                <article
                  key={image.id}
                  className={`gallery-item ${draggingGalleryId === image.id ? 'is-dragging' : ''}`}
                  draggable
                  onDragStart={(event) => {
                    setDraggingGalleryId(image.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', image.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const fromId = event.dataTransfer.getData('text/plain') || draggingGalleryId;
                    moveGalleryImageByDrag(fromId, image.id);
                    setDraggingGalleryId('');
                  }}
                  onDragEnd={() => setDraggingGalleryId('')}
                >
                  <span className="gallery-drag-handle" aria-hidden="true">
                    <IconButton
                      icon={faGripVertical}
                      iconOnly
                      ariaLabel={`Arrastar imagem ${index + 1}`}
                      className="drag-handle-btn"
                    />
                  </span>
                  <img src={image.preview} alt={image.name || `imagem-${index + 1}`} />
                  <div className="gallery-meta">
                    <strong>{image.name || image.path}</strong>
                    <small>{image.kind === 'new' ? 'nova' : 'existente'}</small>
                  </div>
                  <div className="gallery-actions">
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
            {mode === 'edit' && selectedId ? (
              <IconButton icon={faTrash} variant="danger" onClick={openDeleteModal}>
                Deletar
              </IconButton>
            ) : (
              <span />
            )}
            <IconButton
              icon={faFloppyDisk}
              variant="primary"
              disabled={isSaving || isSplittingGallery}
              onClick={saveProject}
            >
              {isSaving ? 'Salvando...' : mode === 'create' ? 'Criar projeto' : 'Salvar edicao'}
            </IconButton>
          </div>
        </section>
      </main>

      {isDeleteModalOpen ? (
        <div className="delete-modal-backdrop" role="presentation" onClick={closeDeleteModal}>
          <div
            className="delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar exclusao de projeto"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Confirmar exclusao</h3>
            <p>
              Esta acao e irreversivel. O projeto sera removido dos JSONs (PT/EN/ES) e os assets
              relacionados (thumb + pasta de imagens) serao apagados.
            </p>
            <label className="delete-confirm-field">
              Digite exatamente <strong>Deletar</strong> para continuar:
              <input
                className="input"
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                placeholder="Deletar"
              />
            </label>
            <div className="delete-modal-actions">
              <IconButton variant="secondary" onClick={closeDeleteModal} disabled={isDeleting}>
                Cancelar
              </IconButton>
              <IconButton
                icon={faTrash}
                variant="danger"
                onClick={deleteProject}
                disabled={deleteConfirmText !== 'Deletar' || isDeleting}
              >
                {isDeleting ? 'Deletando...' : 'Confirmar Deletar'}
              </IconButton>
            </div>
          </div>
        </div>
      ) : null}

      {isConsoleOpen ? (
        <div className="llm-console-backdrop" role="presentation" onClick={() => setIsConsoleOpen(false)}>
          <div
            className={`llm-console-modal status-${consoleStatus}`}
            role="dialog"
            aria-modal="true"
            aria-label="Console da traducao"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="llm-console-header">
              <strong>OLLAMA CONSOLE</strong>
              <div className="llm-console-header-actions">
                <span className={`llm-console-badge status-${consoleStatus}`}>
                  {consoleStatus === 'running'
                    ? 'RUNNING'
                    : consoleStatus === 'success'
                      ? 'SUCCESS'
                      : consoleStatus === 'error'
                        ? 'ERROR'
                        : 'IDLE'}
                </span>
                <button
                  type="button"
                  className="llm-console-close"
                  onClick={() => setIsConsoleOpen(false)}
                >
                  EXIT
                </button>
              </div>
            </div>
            <div className="llm-console-body" ref={consoleBodyRef}>
              {consoleLogs.length === 0 ? (
                <p className="llm-console-line muted">Aguardando logs...</p>
              ) : (
                consoleLogs.map((entry) => (
                  <p key={entry.id} className={`llm-console-line level-${entry.level || 'info'}`}>
                    <span>[{entry.timestamp}]</span> {entry.message}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
