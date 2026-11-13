const test = require('node:test');
const assert = require('node:assert/strict');
const { dividirVersiculo, limiteDaLetra, maxDaLetra, letraValida } = require('../src/main/partes');
const { estadoInicial, aplicar } = require('../src/main/conducao');

const ESTER = 'Então foram chamados os escrivães do rei, naquele mesmo tempo, no terceiro mês, que é o mês de sivã, aos vinte e três dias; e se escreveu conforme tudo quanto ordenou Mardoqueu aos judeus, como também aos sátrapas, e aos governadores, e aos príncipes das províncias, que se estendem da Índia até a Etiópia, cento e vinte e sete províncias, a cada província segundo o seu modo de escrever, e a cada povo conforme a sua língua; como também aos judeus segundo o seu modo de escrever, e conforme a sua língua.';

test('versículo curto fica inteiro numa tela', () => {
  assert.deepEqual(dividirVersiculo('Jesus chorou.', 200), ['Jesus chorou.']);
  assert.deepEqual(dividirVersiculo(ESTER, Infinity), [ESTER]);
  assert.deepEqual(dividirVersiculo('', 200), ['']);
});

test('versículo comprido vira telas parecidas, sem cortar palavra e sem perder texto', () => {
  const telas = dividirVersiculo(ESTER, 200);
  assert.equal(telas.length, Math.ceil(ESTER.length / 200));
  assert.equal(telas.join(' '), ESTER);
  // Uma pontuação por perto pode esticar a tela um pouco além do limite; a TV ajusta a letra.
  assert.ok(telas.every(t => t.length <= 200 * 1.3), telas.map(t => t.length).join(','));
  const tamanhos = telas.map(t => t.length);
  assert.ok(Math.max(...tamanhos) - Math.min(...tamanhos) < 100, tamanhos.join(','));
});

test('prefere quebrar depois de vírgula ou ponto', () => {
  const telas = dividirVersiculo('No princípio criou Deus os céus e a terra, e a terra era sem forma e vazia; e havia trevas sobre a face do abismo.', 60);
  assert.ok(telas.slice(0, -1).every(t => /[.,;:!?]$/.test(t)), JSON.stringify(telas));
});

test('tamanho da letra: o padrão é a letra grande', () => {
  assert.equal(letraValida(undefined), 'grande');
  assert.equal(letraValida('qualquer'), 'grande');
  assert.equal(letraValida('normal'), 'normal');
  assert.equal(limiteDaLetra('normal'), Infinity);
  assert.ok(limiteDaLetra('enorme') < limiteDaLetra('grande'));
  assert.ok(maxDaLetra('normal') < maxDaLetra('grande') && maxDaLetra('grande') < maxDaLetra('enorme'), 'letra maior de verdade, não só nos compridos');
});

// Bíblia de mentira: 10 versículos; o 2 ocupa 3 telas e o 3 ocupa 2.
const ctx = {
  reuniaoExiste: () => true, item: () => undefined, musica: () => undefined, versao: () => 'ACF',
  existe: (_v, r) => r.v >= 1 && r.v <= 10,
  vizinho: (_v, r, d) => (r.v + d >= 1 && r.v + d <= 10 ? { ...r, v: r.v + d } : null),
  partes: (_v, r) => ({ 2: 3, 3: 2 }[r.v] || 1),
};
const V = v => ({ l: 0, c: 1, v });
const passo = (e, delta) => aplicar(e, { cmd: 'passoVersiculo', delta }, ctx);

test('a seta ▶ passa as telas do versículo comprido antes de ir para o próximo', () => {
  let e = aplicar(estadoInicial(), { cmd: 'mostrarVersiculo', ref: V(1) }, ctx);
  const visto = [];
  for (let i = 0; i < 6; i++) { e = passo(e, 1); visto.push(`${e.tv.ref.v}.${e.tv.parte || 0}`); }
  assert.deepEqual(visto, ['2.0', '2.1', '2.2', '3.0', '3.1', '4.0']);
  assert.deepEqual(e.tv, { tipo: 'avulso', ref: V(4) }, 'versículo de uma tela só não guarda a tela');
});

test('a seta ◀ volta as telas e cai na última tela do versículo anterior', () => {
  let e = aplicar(estadoInicial(), { cmd: 'mostrarVersiculo', ref: V(4) }, ctx);
  const visto = [];
  for (let i = 0; i < 6; i++) { e = passo(e, -1); visto.push(`${e.tv.ref.v}.${e.tv.parte || 0}`); }
  assert.deepEqual(visto, ['3.1', '3.0', '2.2', '2.1', '2.0', '1.0']);
});

test('ir para outro versículo começa na primeira tela', () => {
  let e = aplicar(estadoInicial(), { cmd: 'mostrarVersiculo', ref: V(2) }, ctx);
  e = passo(e, 1);
  assert.equal(e.tv.parte, 1);
  e = aplicar(e, { cmd: 'irVersiculo', v: 3 }, ctx);
  assert.deepEqual(e.tv, { tipo: 'avulso', ref: V(3) });
});
