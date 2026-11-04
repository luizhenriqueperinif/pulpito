const test = require('node:test');
const assert = require('node:assert/strict');
const biblia = require('../src/main/biblia');
const { interpretar } = require('../src/web/comum/referencia');

const livros = biblia.indice('ACF');
const L = nome => livros.findIndex(x => x.nome === nome);

test('a Bíblia tem 66 livros nas duas versões', () => {
  assert.equal(biblia.indice('ACF').length, 66);
  assert.equal(biblia.indice('NVI').length, 66);
});

test('textos conhecidos', () => {
  const jo316 = { l: L('João'), c: 3, v: 16 };
  assert.match(biblia.texto('ACF', jo316), /^Porque Deus amou o mundo de tal maneira/);
  assert.match(biblia.texto('NVI', jo316), /Deus tanto amou o mundo/);
  assert.equal(biblia.texto('ACF', { l: L('Salmos'), c: 23, v: 1 }), 'O SENHOR é o meu pastor, nada me faltará.');
  assert.equal(biblia.rotulo(jo316), 'João 3:16');
});

test('versículo que não existe', () => {
  assert.equal(biblia.existe('ACF', { l: L('Salmos'), c: 23, v: 7 }), false);
  assert.equal(biblia.texto('ACF', { l: 99, c: 1, v: 1 }), '');
});

test('navegação livre passa de capítulo e de livro', () => {
  const sl = L('Salmos');
  assert.deepEqual(biblia.vizinho('ACF', { l: sl, c: 23, v: 6 }, 1), { l: sl, c: 24, v: 1 });
  assert.deepEqual(biblia.vizinho('ACF', { l: sl, c: 24, v: 1 }, -1), { l: sl, c: 23, v: 6 });
  assert.deepEqual(biblia.vizinho('ACF', { l: L('Malaquias'), c: 4, v: 6 }, 1), { l: L('Mateus'), c: 1, v: 1 });
  assert.deepEqual(biblia.vizinho('ACF', { l: L('Mateus'), c: 1, v: 1 }, -1), { l: L('Malaquias'), c: 4, v: 6 });
  assert.equal(biblia.vizinho('ACF', { l: 0, c: 1, v: 1 }, -1), null);
  assert.equal(biblia.vizinho('ACF', { l: 65, c: 22, v: 21 }, 1), null);
});

test('cada versão usa a própria contagem de versículos', () => {
  const ap = L('Apocalipse');
  assert.equal(biblia.qtdVersos('ACF', ap, 12), 17);
  assert.equal(biblia.qtdVersos('NVI', ap, 12), 18);
});

test('entende o que a pessoa digita', () => {
  assert.deepEqual(interpretar('João 3:16', livros), { l: L('João'), c: 3, v: 16, ate: 16 });
  assert.deepEqual(interpretar('jo 3 16', livros), { l: L('João'), c: 3, v: 16, ate: 16 });
  assert.deepEqual(interpretar('salmos 23:1-6', livros), { l: L('Salmos'), c: 23, v: 1, ate: 6 });
  assert.deepEqual(interpretar('Sl 23', livros), { l: L('Salmos'), c: 23, v: 1, ate: 1 });
  assert.deepEqual(interpretar('1 cor 13:4-7', livros), { l: L('1 Coríntios'), c: 13, v: 4, ate: 7 });
  assert.deepEqual(interpretar('1jo 4:8', livros), { l: L('1 João'), c: 4, v: 8, ate: 8 });
  assert.deepEqual(interpretar('isaias 41.10', livros), { l: L('Isaías'), c: 41, v: 10, ate: 10 });
  assert.deepEqual(interpretar('fp 4:13', livros), { l: L('Filipenses'), c: 4, v: 13, ate: 13 });
  assert.deepEqual(interpretar('Jó 19:25', livros), { l: L('Jó'), c: 19, v: 25, ate: 25 });
  assert.deepEqual(interpretar('joao 1:1', livros), { l: L('João'), c: 1, v: 1, ate: 1 });
  assert.equal(interpretar('qualquer coisa', livros), null);
  assert.equal(interpretar('jo 3:16-10', livros), null);
});

test('ARC: texto próprio (não é a ACF) e numeração dela em 2 Coríntios 13', () => {
  const biblia = require('../src/main/biblia');
  assert.ok(biblia.VERSOES.includes('ARC'));
  assert.equal(biblia.texto('ARC', { l: 0, c: 1, v: 1 }), 'No princípio, criou Deus os céus e a terra.');
  assert.equal(biblia.texto('ACF', { l: 0, c: 1, v: 1 }), 'No princípio criou Deus o céu e a terra.');
  assert.equal(biblia.qtdVersos('ARC', 46, 13), 13);
  assert.equal(biblia.existe('ARC', { l: 65, c: 22, v: 21 }), true);
});
