// Bíblia (ACF e NVI) guardada dentro do programa: funciona sem internet.
// Referência de um versículo: { l: índice do livro (0 a 65), c: capítulo (1...), v: versículo (1...) }.
const fs = require('fs');
const path = require('path');

const VERSOES = ['ACF', 'NVI'];
const PASTA = path.join(__dirname, '..', 'biblia');
const cache = {};

function carregar(versao) {
  versao = VERSOES.includes(versao) ? versao : 'ACF';
  if (!cache[versao]) cache[versao] = JSON.parse(fs.readFileSync(path.join(PASTA, versao.toLowerCase() + '.json'), 'utf8'));
  return cache[versao];
}

const qtdVersos = (versao, l, c) => carregar(versao).livros[l]?.caps[c - 1]?.length || 0;

function existe(versao, r) {
  return !!r && Number.isInteger(r.l) && Number.isInteger(r.c) && Number.isInteger(r.v) && r.v >= 1 && r.v <= qtdVersos(versao, r.l, r.c);
}

function texto(versao, r) {
  return existe(versao, r) ? carregar(versao).livros[r.l].caps[r.c - 1][r.v - 1] : '';
}

const nomeLivro = l => carregar('ACF').livros[l]?.nome || '';
const rotulo = r => `${nomeLivro(r.l)} ${r.c}:${r.v}`;

/** Um versículo para frente ou para trás, passando de capítulo e de livro. null no começo/fim da Bíblia. */
function vizinho(versao, r, d) {
  const livros = carregar(versao).livros;
  let { l, c, v } = r;
  v += d;
  if (v < 1) {
    c -= 1;
    if (c < 1) { l -= 1; if (l < 0) return null; c = livros[l].caps.length; }
    v = livros[l].caps[c - 1].length;
  } else if (v > livros[l].caps[c - 1].length) {
    c += 1; v = 1;
    if (c > livros[l].caps.length) { l += 1; if (l >= livros.length) return null; c = 1; }
  }
  return { l, c, v };
}

/** Lista dos livros com a quantidade de versículos de cada capítulo (para escolher no celular). */
function indice(versao) {
  return carregar(versao).livros.map((x, i) => ({ l: i, nome: x.nome, caps: x.caps.map(c => c.length) }));
}

module.exports = { VERSOES, existe, texto, rotulo, nomeLivro, vizinho, indice, qtdVersos };
