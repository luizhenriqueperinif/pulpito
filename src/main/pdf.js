// PDF (palestra) → uma imagem por página, para virar uma Pregação.
// Quem desenha as páginas é uma janela escondida com o leitor de PDF (pdf.js), a mesma peça do Firefox.
const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const LIMITE_PDF = 150 * 1024 * 1024;   // 150 MB
const LIMITE_PAGINAS = 300;
const ESPERA_PAGINA = 60000;            // uma página nunca pode travar a importação

const comLimite = (promessa, ms, o_que) => Promise.race([
  promessa,
  new Promise((_, falhar) => setTimeout(() => falhar(new Error(`PDF: demorou demais (${o_que})`)), ms)),
]);

/** urlDaPagina(): endereço da página que desenha o PDF (servida pelo próprio programa). */
function criarLeitorPdf({ urlDaPagina }) {
  let fila = Promise.resolve();

  async function converter(caminho, pasta) {
    if (fs.statSync(caminho).size > LIMITE_PDF) throw new Error('PDF grande demais');
    const janela = new BrowserWindow({ show: false, width: 800, height: 600, webPreferences: { backgroundThrottling: false } });
    try {
      await comLimite(janela.loadURL(urlDaPagina()), ESPERA_PAGINA, 'abrir o leitor');
      const js = codigo => janela.webContents.executeJavaScript(codigo, true);
      const paginas = await comLimite(js(`window.abrirPdf(${JSON.stringify(fs.readFileSync(caminho).toString('base64'))})`), ESPERA_PAGINA, 'abrir o arquivo');
      const feitas = [];
      for (let n = 1; n <= Math.min(paginas, LIMITE_PAGINAS); n++) {
        const imagem = await comLimite(js(`window.paginaPdf(${n})`), ESPERA_PAGINA, `página ${n}`);
        const arquivo = path.join(pasta, String(n).padStart(4, '0') + '.jpg');
        fs.writeFileSync(arquivo, Buffer.from(String(imagem).split(',')[1] || '', 'base64'));
        feitas.push(arquivo);
      }
      return feitas;
    } finally {
      if (!janela.isDestroyed()) janela.destroy();
    }
  }

  /** Um PDF por vez (cada um abre a sua janela escondida). */
  function paraImagens(caminho, pasta) {
    const vez = fila.then(() => converter(caminho, pasta));
    fila = vez.catch(() => {});
    return vez;
  }

  return { paraImagens };
}

module.exports = { criarLeitorPdf };
