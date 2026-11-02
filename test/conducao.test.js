const test = require('node:test');
const assert = require('node:assert/strict');
const { estadoInicial, aplicar } = require('../src/main/conducao');

const REUNIAO = {
  id: 'r1',
  itens: [
    { id: 'img', tipo: 'imagem' },
    { id: 'vid', tipo: 'video' },
  ],
};
const ctx = {
  reuniaoExiste: id => id === 'r1',
  item: (rid, iid) => (rid === 'r1' ? REUNIAO.itens.find(i => i.id === iid) : undefined),
};
const run = (...cmds) => cmds.reduce((e, c) => aplicar(e, c, ctx), estadoInicial());

test('começa na Tela de espera', () => {
  assert.deepEqual(estadoInicial().tv, { tipo: 'espera' });
});

test('escolher reunião mantém a Tela de espera até tocar num item', () => {
  const e = run({ cmd: 'escolherReuniao', id: 'r1' });
  assert.equal(e.reuniaoId, 'r1');
  assert.equal(e.tv.tipo, 'espera');
});

test('reunião inexistente é ignorada', () => {
  const e = run({ cmd: 'escolherReuniao', id: 'nao-existe' });
  assert.equal(e.reuniaoId, null);
});

test('mostrar imagem leva para a TV', () => {
  const e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'img' });
  assert.deepEqual(e.tv, { tipo: 'item', itemId: 'img' });
  assert.equal(e.video, null);
});

test('vídeo começa tocando e fica parado quando termina', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'vid' });
  assert.equal(e.video.tocando, true);
  e = aplicar(e, { cmd: 'videoProgresso', inicio: e.video.inicio, t: 30, dur: 30, terminou: true }, ctx);
  assert.equal(e.video.terminou, true);
  assert.equal(e.video.tocando, false);
  assert.deepEqual(e.tv, { tipo: 'item', itemId: 'vid' }, 'a TV continua no vídeo (último quadro)');
});

test('continuar um vídeo que terminou passa de novo do início', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'vid' });
  const antes = e.video.inicio;
  e = aplicar(e, { cmd: 'videoProgresso', inicio: antes, t: 30, dur: 30, terminou: true }, ctx);
  e = aplicar(e, { cmd: 'videoContinuar' }, ctx);
  assert.equal(e.video.tocando, true);
  assert.equal(e.video.t, 0);
  assert.equal(e.video.inicio, antes + 1);
});

test('tocar de novo no vídeo que está passando não recomeça', () => {
  const e1 = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'vid' });
  const e2 = aplicar(e1, { cmd: 'mostrar', itemId: 'vid' }, ctx);
  assert.equal(e2, e1);
});

test('progresso de um vídeo antigo é ignorado', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'vid' });
  const velho = aplicar(e, { cmd: 'videoProgresso', inicio: e.video.inicio - 1, t: 5, dur: 30 }, ctx);
  assert.equal(velho, e);
});

test('apagar a TV e ligar de novo volta ao que estava', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'img' }, { cmd: 'apagar' });
  assert.equal(e.tv.tipo, 'preto');
  e = aplicar(e, { cmd: 'apagar' }, ctx);
  assert.deepEqual(e.tv, { tipo: 'item', itemId: 'img' });
});

test('mostrar um item com a TV apagada liga a TV nele', () => {
  const e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'apagar' }, { cmd: 'mostrar', itemId: 'img' });
  assert.deepEqual(e.tv, { tipo: 'item', itemId: 'img' });
  assert.equal(e.tvAntesPreto, null);
});

test('volume fica entre 0 e 10', () => {
  let e = estadoInicial(9);
  e = aplicar(e, { cmd: 'volume', delta: 1 }, ctx);
  e = aplicar(e, { cmd: 'volume', delta: 1 }, ctx);
  assert.equal(e.volume, 10);
  e = aplicar(estadoInicial(0), { cmd: 'volume', delta: -1 }, ctx);
  assert.equal(e.volume, 0);
});

test('encerrar volta para a Tela de espera e mantém o volume', () => {
  const e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'volume', delta: -3 }, { cmd: 'mostrar', itemId: 'vid' }, { cmd: 'encerrar' });
  assert.deepEqual(e, estadoInicial(4));
});
