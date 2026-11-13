// Pregações a partir do que o pastor escolheu ou mandou:
// as imagens soltas viram uma pregação só; cada PDF (palestra) vira outra, com uma imagem por página.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { tituloDoArquivo, marcaDoArquivo } = require('./dados');

const ehPdf = caminho => path.extname(String(caminho)).toLowerCase() === '.pdf';

/**
 * pdfParaImagens(caminhoDoPdf, pasta): devolve os caminhos das imagens das páginas, na ordem.
 * Devolve as pregações feitas (as novas e as que já estavam na Biblioteca) e quantos arquivos ficaram de fora.
 */
async function criarPregacoes(dados, caminhos, { manterOrdem = false, pdfParaImagens = null, aoErrar = () => {} } = {}) {
  const pdfs = caminhos.filter(ehPdf), soltas = caminhos.filter(c => !ehPdf(c));
  const feitas = [];
  let ignorados = 0;
  for (const pdf of pdfs) {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'altar-pdf-'));
    try {
      // O mesmo PDF de novo: usa a pregação que já está na Biblioteca, sem desenhar as páginas outra vez.
      const marca = 'pdf-' + marcaDoArquivo(pdf);
      const jaTem = dados.pregacaoPorMarca(marca);
      if (jaTem) { feitas.push({ pregacao: jaTem, ignorados: 0, repetida: true }); continue; }
      const paginas = pdfParaImagens ? await pdfParaImagens(pdf, pasta) : [];
      const feito = paginas.length ? dados.criarPregacao(paginas, { titulo: tituloDoArquivo(pdf).replace(/\s+/g, ' '), manterOrdem: true, marca }) : null;
      if (feito) feitas.push(feito); else ignorados++;
    } catch (e) {
      ignorados++;
      aoErrar(e);
    } finally {
      fs.rmSync(pasta, { recursive: true, force: true });
    }
  }
  if (soltas.length) {
    const feito = dados.criarPregacao(soltas, { manterOrdem });
    if (feito) { feitas.push(feito); ignorados += feito.ignorados; } else ignorados += soltas.length;
  }
  return { feitas, ignorados };
}

/** O que o Painel e o celular mostram depois: quantas pregações, quantas imagens e se já estavam na Biblioteca. */
function resumoDasPregacoes({ feitas, ignorados }) {
  return {
    qtd: feitas.length,
    novas: feitas.filter(f => !f.repetida).length,
    imagens: feitas.reduce((n, f) => n + f.pregacao.arquivos.length, 0),
    ignorados,
    ids: feitas.map(f => f.pregacao.id),
    pregacao: true,
    repetida: feitas.length > 0 && feitas.every(f => f.repetida),
    titulo: feitas.length ? feitas[0].pregacao.titulo : '',
  };
}

module.exports = { criarPregacoes, resumoDasPregacoes, ehPdf };
