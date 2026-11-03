const test = require('node:test');
const assert = require('node:assert/strict');
const { estadoInicial, aplicar } = require('../src/main/conducao');

const REUNIAO = {
  id: 'r1',
  itens: [
    { id: 'img', tipo: 'imagem' },
    { id: 'vid', tipo: 'video' },
    { id: 'hino', tipo: 'musica', bibliotecaId: 'b-hino' },
    { id: 'preg', tipo: 'pregacao', arquivos: ['a.png', 'b.png', 'c.png'] },
    { id: 'pal', tipo: 'palavra', passagens: [
      { id: 'p1', ref: { l: 18, c: 23, v: 1 }, ate: 6 },
      { id: 'p2', ref: { l: 18, c: 23, v: 8 }, ate: 8 },
    ] },
  ],
};
// Bíblia de mentira: todo capítulo tem 10 versículos e só existe o capítulo 23 do livro 18.
const ctx = {
  reuniaoExiste: id => id === 'r1',
  item: (rid, iid) => (rid === 'r1' ? REUNIAO.itens.find(i => i.id === iid) : undefined),
  musica: bid => (['b-hino', 'b-oracao'].includes(bid) ? { id: bid } : undefined),
  versao: () => 'ACF',
  existe: (_v, r) => r.l === 18 && r.c === 23 && r.v >= 1 && r.v <= 10,
  vizinho: (_v, r, d) => (r.v + d >= 1 && r.v + d <= 10 ? { ...r, v: r.v + d } : null),
};
const SL = v => ({ l: 18, c: 23, v });
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

test('a Palavra vai para a TV na primeira passagem e anda livre', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'pal' });
  assert.deepEqual(e.tv, { tipo: 'item', itemId: 'pal', passagemId: 'p1', ref: SL(1) });
  e = aplicar(e, { cmd: 'passoVersiculo', delta: 1 }, ctx);
  e = aplicar(e, { cmd: 'passoVersiculo', delta: 1 }, ctx);
  assert.deepEqual(e.tv.ref, SL(3));
  const depois = aplicar(e, { cmd: 'mostrar', itemId: 'pal' }, ctx);
  assert.equal(depois, e, 'tocar de novo no cartão não volta para o começo');
});

test('setas param no começo e no fim da Bíblia', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'pal' });
  const antes = e;
  e = aplicar(e, { cmd: 'passoVersiculo', delta: -1 }, ctx);
  assert.equal(e, antes);
});

test('versículo avulso fica por cima e "Voltar para a reunião" devolve o que estava', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'img' }, { cmd: 'mostrarVersiculo', ref: SL(5) });
  assert.deepEqual(e.tv, { tipo: 'avulso', ref: SL(5) });
  e = aplicar(e, { cmd: 'passoVersiculo', delta: 1 }, ctx);
  e = aplicar(e, { cmd: 'mostrarVersiculo', ref: SL(9) }, ctx); // "Escolher outro versículo"
  assert.deepEqual(e.tv.ref, SL(9));
  e = aplicar(e, { cmd: 'voltarReuniao' }, ctx);
  assert.deepEqual(e.tv, { tipo: 'item', itemId: 'img' });
});

test('versículo avulso com a TV apagada volta para o que estava antes de apagar', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'img' }, { cmd: 'apagar' }, { cmd: 'mostrarVersiculo', ref: SL(1) });
  e = aplicar(e, { cmd: 'voltarReuniao' }, ctx);
  assert.deepEqual(e.tv, { tipo: 'item', itemId: 'img' });
});

test('versículo avulso pausa o vídeo que estava passando', () => {
  const e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'vid' }, { cmd: 'mostrarVersiculo', ref: SL(1) });
  assert.equal(e.video.tocando, false);
});

test('versículo inexistente é ignorado', () => {
  const e1 = run({ cmd: 'escolherReuniao', id: 'r1' });
  assert.equal(aplicar(e1, { cmd: 'mostrarVersiculo', ref: SL(99) }, ctx), e1);
  assert.equal(aplicar(e1, { cmd: 'mostrarVersiculo', ref: { l: 'x' } }, ctx), e1);
});

test('dentro da Palavra o pastor pula entre as passagens preparadas', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'pal' }, { cmd: 'passoVersiculo', delta: 1 });
  e = aplicar(e, { cmd: 'mostrarPassagem', itemId: 'pal', passagemId: 'p2' }, ctx);
  assert.deepEqual(e.tv, { tipo: 'item', itemId: 'pal', passagemId: 'p2', ref: SL(8) });
  e = aplicar(e, { cmd: 'mostrarPassagem', itemId: 'pal', passagemId: 'p1' }, ctx);
  assert.deepEqual(e.tv.ref, SL(1), 'volta para o começo da passagem');
  assert.equal(aplicar(e, { cmd: 'mostrarPassagem', itemId: 'pal', passagemId: 'nao' }, ctx), e);
  assert.equal(aplicar(e, { cmd: 'mostrarPassagem', itemId: 'img', passagemId: 'p1' }, ctx), e);
});

test('versículo escolhido na hora no meio da Palavra: "Voltar" retorna para onde a Palavra estava', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'pal' }, { cmd: 'passoVersiculo', delta: 2 });
  e = aplicar(e, { cmd: 'mostrarVersiculo', ref: SL(10) }, ctx);
  assert.equal(e.tv.tipo, 'avulso');
  e = aplicar(e, { cmd: 'voltarReuniao' }, ctx);
  assert.deepEqual(e.tv, { tipo: 'item', itemId: 'pal', passagemId: 'p1', ref: SL(3) });
});

test('tocar numa passagem preparada sai do versículo avulso', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'img' }, { cmd: 'mostrarVersiculo', ref: SL(5) });
  e = aplicar(e, { cmd: 'mostrarPassagem', itemId: 'pal', passagemId: 'p2' }, ctx);
  assert.equal(e.tv.tipo, 'item');
  assert.equal(e.tvAntesAvulso, null);
});

test('tocar num número do capítulo pula para aquele versículo e continua na Palavra', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'pal' });
  e = aplicar(e, { cmd: 'irVersiculo', v: 5 }, ctx);
  assert.deepEqual(e.tv, { tipo: 'item', itemId: 'pal', passagemId: 'p1', ref: SL(5) });
  assert.equal(aplicar(e, { cmd: 'irVersiculo', v: 99 }, ctx), e, 'versículo que não existe é ignorado');
  assert.equal(run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'irVersiculo', v: 2 }).tv.tipo, 'espera', 'sem versículo na TV não faz nada');
});

test('trocar de capítulo (ou livro) direto, continuando na Palavra', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'pal' });
  const ctx2 = { ...ctx, existe: (_v, r) => r.l === 18 && r.c >= 1 && r.c <= 150 && r.v >= 1 && r.v <= 10 };
  e = aplicar(e, { cmd: 'irVersiculo', c: 24 }, ctx2);
  assert.deepEqual(e.tv, { tipo: 'item', itemId: 'pal', passagemId: 'p1', ref: { l: 18, c: 24, v: 1 } });
  e = aplicar(e, { cmd: 'irVersiculo', c: 91, v: 4 }, ctx2);
  assert.deepEqual(e.tv.ref, { l: 18, c: 91, v: 4 });
  assert.equal(aplicar(e, { cmd: 'irVersiculo', c: 999 }, ctx2), e);
});

test('música toca sem mudar a TV', () => {
  const e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'img' }, { cmd: 'mostrar', itemId: 'hino' });
  assert.deepEqual(e.tv, { tipo: 'item', itemId: 'img' });
  assert.equal(e.audio.itemId, 'hino');
  assert.equal(e.audio.tocando, true);
  assert.equal(aplicar(e, { cmd: 'mostrar', itemId: 'hino' }, ctx), e, 'tocar de novo não recomeça');
});

test('a música para quando outra coisa vai para a TV', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'hino' }, { cmd: 'mostrar', itemId: 'img' });
  assert.equal(e.audio, null);
  e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'hino' }, { cmd: 'mostrar', itemId: 'pal' });
  assert.equal(e.audio, null);
});

test('música continua ao apagar a TV e ao passar versículos', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'pal' }, { cmd: 'mostrar', itemId: 'hino' }, { cmd: 'passoVersiculo', delta: 1 }, { cmd: 'apagar' });
  assert.equal(e.audio.tocando, true);
});

test('música avulsa, pausar, continuar, parar', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'tocarMusica', bibliotecaId: 'b-oracao' });
  assert.deepEqual([e.audio.bibliotecaId, e.audio.itemId], ['b-oracao', null]);
  assert.equal(aplicar(e, { cmd: 'tocarMusica', bibliotecaId: 'nao-existe' }, ctx), e);
  e = aplicar(e, { cmd: 'audioPausar' }, ctx);
  assert.equal(e.audio.tocando, false);
  e = aplicar(e, { cmd: 'audioContinuar' }, ctx);
  assert.equal(e.audio.tocando, true);
  e = aplicar(e, { cmd: 'audioProgresso', inicio: e.audio.inicio, t: 200, dur: 200, terminou: true }, ctx);
  assert.equal(e.audio.terminou, true);
  const de = e.audio.inicio;
  e = aplicar(e, { cmd: 'audioContinuar' }, ctx);
  assert.equal(e.audio.inicio, de + 1, 'terminou: toca de novo do começo');
  e = aplicar(e, { cmd: 'audioParar' }, ctx);
  assert.equal(e.audio, null);
});

test('música pausa o vídeo que estava passando', () => {
  const e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'vid' }, { cmd: 'mostrar', itemId: 'hino' });
  assert.equal(e.video.tocando, false);
});

test('pregação começa na primeira imagem e as setas param nas pontas', () => {
  let e = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'preg' });
  assert.deepEqual(e.tv, { tipo: 'item', itemId: 'preg', slide: 0 });
  assert.equal(aplicar(e, { cmd: 'passoSlide', delta: -1 }, ctx), e);
  e = aplicar(e, { cmd: 'passoSlide', delta: 1 }, ctx);
  e = aplicar(e, { cmd: 'passoSlide', delta: 1 }, ctx);
  assert.equal(e.tv.slide, 2);
  assert.equal(aplicar(e, { cmd: 'passoSlide', delta: 1 }, ctx), e);
  e = aplicar(e, { cmd: 'irSlide', n: 0 }, ctx);
  assert.equal(e.tv.slide, 0);
  assert.equal(aplicar(e, { cmd: 'irSlide', n: 9 }, ctx), e);
  const outra = run({ cmd: 'escolherReuniao', id: 'r1' }, { cmd: 'mostrar', itemId: 'img' });
  assert.equal(aplicar(outra, { cmd: 'passoSlide', delta: 1 }, ctx), outra, 'sem pregação na TV não faz nada');
});

test('janela do notebook na TV: entra, para a música e volta para o que estava', () => {
  const R = { cmd: 'escolherReuniao', id: 'r1' };
  assert.equal(run({ cmd: 'mostrarJanela', fonteId: 'window:1:0', nome: 'Telegram' }).tv.tipo, 'janela', 'funciona sem reunião começada');
  assert.equal(run({ cmd: 'mostrarJanela', fonteId: 'window:1:0' }, { cmd: 'sairJanela' }).tv.tipo, 'espera');
  let e = run(R, { cmd: 'mostrar', itemId: 'img' }, { cmd: 'tocarMusica', bibliotecaId: 'b-hino' },
    { cmd: 'mostrarJanela', fonteId: 'window:1:0', nome: 'Telegram' });
  assert.deepEqual(e.tv, { tipo: 'janela', fonteId: 'window:1:0', nome: 'Telegram' });
  assert.equal(e.audio, null);
  // trocar de janela não esquece o que estava antes
  e = aplicar(e, { cmd: 'mostrarJanela', fonteId: 'window:2:0', nome: 'Univervideo' }, ctx);
  e = aplicar(e, { cmd: 'sairJanela' }, ctx);
  assert.deepEqual(e.tv, { tipo: 'item', itemId: 'img' });
  // tocar num cartão também sai da janela
  e = run(R, { cmd: 'mostrarJanela', fonteId: 'window:1:0' }, { cmd: 'mostrar', itemId: 'vid' });
  assert.equal(e.tv.itemId, 'vid');
  // apagar e acender a TV volta para a janela
  e = run(R, { cmd: 'mostrarJanela', fonteId: 'window:1:0' }, { cmd: 'apagar' }, { cmd: 'apagar' });
  assert.equal(e.tv.tipo, 'janela');
});
