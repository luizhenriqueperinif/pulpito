// Desenha as páginas de um PDF em imagens do tamanho da TV. Quem chama é o programa do notebook (src/main/pdf.js).
import * as pdfjs from '/pdfjs/build/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/build/pdf.worker.min.mjs';

// A página cabe inteira numa TV Full HD (os slides 16:9 ficam com 1920 × 1080).
const LARGURA = 1920, ALTURA = 1080;
let documento = null;

/** Abre o PDF (em base64) e devolve quantas páginas tem. */
window.abrirPdf = async base64 => {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  documento = await pdfjs.getDocument({
    data: bytes,
    cMapUrl: '/pdfjs/cmaps/', cMapPacked: true,
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/',
    iccUrl: '/pdfjs/iccs/',
  }).promise;
  return documento.numPages;
};

/** Devolve a página n (a primeira é 1) como imagem JPEG. */
window.paginaPdf = async n => {
  const pagina = await documento.getPage(n);
  const natural = pagina.getViewport({ scale: 1 });
  const viewport = pagina.getViewport({ scale: Math.min(LARGURA / natural.width, ALTURA / natural.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  // intent 'print': desenha direto, sem esperar a tela (a janela fica escondida).
  await pagina.render({ canvas, canvasContext: canvas.getContext('2d', { willReadFrequently: true }), viewport, intent: 'print' }).promise;
  pagina.cleanup();
  return canvas.toDataURL('image/jpeg', 0.92);
};
