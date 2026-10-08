import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export const A4_PAGE = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 15,
} as const;

/** Limite prudente pour éviter un canvas entièrement blanc (Chrome ~16k px). */
const MAX_CANVAS_DIMENSION = 8192;

const PAGE_CAPTURE_TIMEOUT_MS = 45_000;
const MAX_PAGES = 500;
const JPEG_QUALITY = 0.88;

export interface PdfExportProgress {
  current: number;
  total: number;
}

export interface PdfExportOptions {
  scale?: number;
  onProgress?: (progress: PdfExportProgress) => void;
  signal?: AbortSignal;
}

/** CSS injecté dans le template assemblé pour les sauts de page à l'impression / PDF. */
export const PAGE_BREAK_STYLES = `
@page {
  size: A4;
  margin: 8mm;
}
html, body, .tpl-root, .tpl-header, .tpl-body, .tpl-footer {
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 !important;
  box-sizing: border-box !important;
}
body {
  height: auto !important;
  padding: 0 !important;
}
table {
  width: 100% !important;
  max-width: 100% !important;
  table-layout: auto;
}
img {
  max-width: 100% !important;
  height: auto;
}
.WordSection1,
div[class*="WordSection"] {
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 !important;
}
@media print {
  .tpl-root {
    break-inside: auto;
  }
  .tpl-table tr,
  .tpl-header,
  .invoice-section {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .page-break,
  .page-break-before {
    break-before: page;
    page-break-before: always;
  }
  .page-break-after {
    break-after: page;
    page-break-after: always;
  }
}
`;

interface ExportViewport {
  wrapper: HTMLDivElement;
  viewport: HTMLDivElement;
  root: HTMLElement;
  pageWidthPx: number;
  pageHeightPx: number;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Export PDF annulé.', 'AbortError');
  }
}

function computeSafeScale(sliceHeightPx: number, requestedScale: number): number {
  const projected = sliceHeightPx * requestedScale;
  if (projected <= MAX_CANVAS_DIMENSION) {
    return requestedScale;
  }
  return Math.max(1, Math.floor(MAX_CANVAS_DIMENSION / sliceHeightPx));
}

function pickExportScale(totalPages: number, requestedScale: number): number {
  if (totalPages > 20) return 1;
  if (totalPages > 5) return Math.min(requestedScale, 1.5);
  return requestedScale;
}

async function yieldToMain(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForRender(): Promise<void> {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
  await yieldToMain();
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

/**
 * Copie légère du contenu (innerHTML) — plus rapide que cloneNode sur de gros DOM.
 */
function createExportRoot(source: HTMLElement, pageWidthPx: number): HTMLElement {
  const root = document.createElement('div');
  root.className = source.className;
  root.innerHTML = source.innerHTML;

  const computed = getComputedStyle(source);
  root.style.width = `${pageWidthPx}px`;
  root.style.padding = computed.padding;
  root.style.boxSizing = computed.boxSizing;
  root.style.fontFamily = computed.fontFamily;
  root.style.fontSize = computed.fontSize;
  root.style.color = computed.color;
  root.style.lineHeight = computed.lineHeight;
  root.style.backgroundColor = '#ffffff';
  root.style.backgroundImage = 'none';
  root.style.backgroundSize = 'auto';
  root.style.backgroundRepeat = 'no-repeat';
  root.style.boxShadow = 'none';
  root.style.margin = '0';
  root.style.transform = 'translateY(0)';
  root.style.transformOrigin = 'top left';
  root.style.maxHeight = 'none';
  root.style.minHeight = '0';

  return root;
}

function createExportViewport(source: HTMLElement): ExportViewport {
  const pageWidthPx = source.offsetWidth || Math.round((A4_PAGE.widthMm / 25.4) * 96);
  const pageHeightPx = Math.round(pageWidthPx * (A4_PAGE.heightMm / A4_PAGE.widthMm));

  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'z-index:-1',
    'pointer-events:none',
  ].join(';');

  const viewport = document.createElement('div');
  viewport.style.cssText = [
    `width:${pageWidthPx}px`,
    `height:${pageHeightPx}px`,
    'overflow:hidden',
    'background:#ffffff',
  ].join(';');

  const root = createExportRoot(source, pageWidthPx);
  viewport.appendChild(root);
  wrapper.appendChild(viewport);
  document.body.appendChild(wrapper);

  return { wrapper, viewport, root, pageWidthPx, pageHeightPx };
}

function disposeExportViewport(viewport: ExportViewport): void {
  viewport.wrapper.remove();
}

async function captureViewport(
  viewport: HTMLDivElement,
  pageWidthPx: number,
  sliceHeightPx: number,
  scale: number,
): Promise<HTMLCanvasElement> {
  return withTimeout(
    html2canvas(viewport, {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      width: pageWidthPx,
      height: sliceHeightPx,
      windowWidth: pageWidthPx,
      windowHeight: sliceHeightPx,
      scrollX: 0,
      scrollY: 0,
      ignoreElements: (element) =>
        element.tagName === 'IFRAME' || element.tagName === 'SCRIPT' || element.tagName === 'NOSCRIPT',
    }),
    PAGE_CAPTURE_TIMEOUT_MS,
    'Délai dépassé lors de la capture d\'une page — template trop complexe.',
  );
}

function addCanvasToPdf(pdf: jsPDF, canvas: HTMLCanvasElement, pageIndex: number): void {
  if (pageIndex > 0) {
    pdf.addPage();
  }

  const imgData = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const imgHeightMm = (canvas.height / canvas.width) * A4_PAGE.widthMm;
  pdf.addImage(imgData, 'JPEG', 0, 0, A4_PAGE.widthMm, imgHeightMm);
}

/** Chemin rapide : une seule capture pour les documents courts (≤ ~7 pages A4). */
async function exportSingleCapture(
  exportViewport: ExportViewport,
  totalHeight: number,
  scale: number,
  pdf: jsPDF,
  onProgress?: (progress: PdfExportProgress) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  const { viewport, root, pageWidthPx, pageHeightPx } = exportViewport;
  const safeScale = computeSafeScale(totalHeight, scale);

  if (totalHeight * safeScale > MAX_CANVAS_DIMENSION) {
    return false;
  }

  const totalPages = Math.max(1, Math.ceil(totalHeight / pageHeightPx));
  onProgress?.({ current: 0, total: totalPages });
  assertNotAborted(signal);

  viewport.style.height = `${totalHeight}px`;
  root.style.transform = 'translateY(0)';

  await waitForRender();

  const canvas = await captureViewport(viewport, pageWidthPx, totalHeight, safeScale);
  if (canvas.width === 0 || canvas.height === 0) {
    throw new Error('Échec de capture — canvas vide.');
  }

  const imgData = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const imgWidthMm = A4_PAGE.widthMm;
  const imgHeightMm = (canvas.height / canvas.width) * imgWidthMm;
  const pageHeightMm = A4_PAGE.heightMm;

  let heightLeft = imgHeightMm;
  let position = 0;
  let pageIndex = 0;

  while (heightLeft > 0) {
    assertNotAborted(signal);

    if (pageIndex > 0) {
      pdf.addPage();
    }

    pdf.addImage(imgData, 'JPEG', 0, position, imgWidthMm, imgHeightMm);
    heightLeft -= pageHeightMm;
    position -= pageHeightMm;
    pageIndex += 1;

    onProgress?.({ current: pageIndex, total: totalPages });
    await yieldToMain();
  }

  return true;
}

async function exportPaginated(
  exportViewport: ExportViewport,
  totalHeight: number,
  scale: number,
  pdf: jsPDF,
  onProgress?: (progress: PdfExportProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { viewport, root, pageWidthPx, pageHeightPx } = exportViewport;
  const totalPages = Math.ceil(totalHeight / pageHeightPx);

  if (totalPages > MAX_PAGES) {
    throw new Error(
      `Document trop long (${totalPages} pages). Limite : ${MAX_PAGES} pages. Réduisez le contenu du template.`,
    );
  }

  const effectiveScale = pickExportScale(totalPages, scale);
  let offsetY = 0;
  let pageIndex = 0;

  onProgress?.({ current: 0, total: totalPages });

  while (offsetY < totalHeight) {
    assertNotAborted(signal);

    const sliceHeightPx = Math.min(pageHeightPx, totalHeight - offsetY);
    const safeScale = computeSafeScale(sliceHeightPx, effectiveScale);

    root.style.transform = `translateY(-${offsetY}px)`;
    viewport.style.height = `${sliceHeightPx}px`;

    await waitForRender();

    const canvas = await captureViewport(viewport, pageWidthPx, sliceHeightPx, safeScale);
    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error(`Échec de capture — page ${pageIndex + 1} vide.`);
    }

    addCanvasToPdf(pdf, canvas, pageIndex);

    offsetY += pageHeightPx;
    pageIndex += 1;

    onProgress?.({ current: pageIndex, total: totalPages });
    await yieldToMain();
  }
}

export async function exportElementToPdf(
  element: HTMLElement,
  fileName: string,
  scale = 2,
  options: PdfExportOptions = {},
): Promise<void> {
  const { onProgress, signal } = options;
  const exportViewport = createExportViewport(element);
  const { root, pageHeightPx } = exportViewport;

  try {
    assertNotAborted(signal);
    await waitForRender();

    const totalHeight = Math.max(root.scrollHeight, root.offsetHeight);
    if (totalHeight === 0) {
      throw new Error('Aperçu vide — rien à exporter en PDF.');
    }

    if (pageHeightPx <= 0) {
      throw new Error('Impossible de déterminer la taille de page A4.');
    }

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const usedFastPath = await exportSingleCapture(
      exportViewport,
      totalHeight,
      scale,
      pdf,
      onProgress,
      signal,
    );

    if (!usedFastPath) {
      await exportPaginated(exportViewport, totalHeight, scale, pdf, onProgress, signal);
    }

    assertNotAborted(signal);
    pdf.save(fileName);
  } finally {
    disposeExportViewport(exportViewport);
  }
}
