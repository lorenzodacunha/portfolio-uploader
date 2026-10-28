// Gallery helpers that run in the browser: PDF pages become PNG images (pdf.js, loaded only when a PDF arrives) and
// tall screenshots are cut into 1920x1080 frames with an overlap, so every case image has the 16:9 shape of the site.

export const SPLIT_FRAME_WIDTH = 1920;
export const SPLIT_FRAME_HEIGHT = 1080;
export const DEFAULT_SPLIT_OVERLAP = 120;
const MAX_PDF_PAGES = 80;

export const waitNextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
let pdfRuntimePromise = null;

async function getPdfRuntime() {
  if (!pdfRuntimePromise) {
    pdfRuntimePromise = (async () => {
      const pdfModule = await import('pdfjs-dist/legacy/build/pdf');
      const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfModule.GlobalWorkerOptions.workerSrc = workerModule.default;
      return pdfModule;
    })();
  }
  return pdfRuntimePromise;
}

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

export function isPdfFile(file) {
  const fileName = String(file?.name || '').toLowerCase();
  return file?.type === 'application/pdf' || fileName.endsWith('.pdf');
}

export async function convertPdfToPngFiles(file) {
  const { getDocument } = await getPdfRuntime();
  const fileBaseName = String(file.name || 'documento').replace(/\.[^/.]+$/, '');
  const bytes = await file.arrayBuffer();
  const pdf = await getDocument({ data: bytes }).promise;

  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new Error(`PDF com ${pdf.numPages} paginas excede o limite de ${MAX_PDF_PAGES}.`);
  }

  const pageFiles = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const renderScale = SPLIT_FRAME_WIDTH / Math.max(1, baseViewport.width);
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Falha ao inicializar canvas para conversao de PDF.');
    }

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    const pageSuffix = String(pageNumber).padStart(3, '0');
    const pageFile = await canvasToPngFile(canvas, `${fileBaseName}__page-${pageSuffix}.png`);
    pageFiles.push(pageFile);
    await waitNextFrame();
  }

  return pageFiles;
}

export async function splitTallImageFile(file, overlapPx) {
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
