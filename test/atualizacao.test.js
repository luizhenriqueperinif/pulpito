const { test } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { criarAtualizacao, ehFaltaDeInternet } = require('../src/main/atualizacao');

function deMentira() {
  const a = new EventEmitter();
  a.buscas = 0;
  a.instalou = null;
  a.checkForUpdates = () => { a.buscas++; return Promise.resolve(null); };
  a.quitAndInstall = (...args) => { a.instalou = args; };
  return a;
}

function montar() {
  const atualizador = deMentira();
  const vistos = [], erros = [];
  const at = criarAtualizacao({ atualizador, versaoAtual: '1.1.0', aoMudar: e => vistos.push(e), aoErrar: e => erros.push(e), agora: () => 1000 });
  return { atualizador, at, vistos, erros };
}

test('baixa sozinho e instala ao fechar o programa', () => {
  const { atualizador, at } = montar();
  assert.strictEqual(atualizador.autoDownload, true);
  assert.strictEqual(atualizador.autoInstallOnAppQuit, true);
  assert.deepStrictEqual(at.estado(), { fase: 'parada', versao: '1.1.0', nova: null, pct: 0, quando: null, aviso: '' });
});

test('sem versão nova: fica "em dia" e guarda quando procurou', async () => {
  const { atualizador, at } = montar();
  at.buscar();
  assert.strictEqual(at.estado().fase, 'procurando');
  await Promise.resolve();
  assert.strictEqual(atualizador.buscas, 1);
  atualizador.emit('update-not-available', { version: '1.1.0' });
  assert.strictEqual(at.estado().fase, 'emDia');
  assert.strictEqual(at.estado().quando, 1000);
});

test('versão nova: baixando com a porcentagem, depois pronta', () => {
  const { atualizador, at, vistos } = montar();
  at.buscar();
  atualizador.emit('update-available', { version: '1.2.0' });
  assert.strictEqual(at.estado().fase, 'baixando');
  assert.strictEqual(at.estado().nova, '1.2.0');
  atualizador.emit('download-progress', { percent: 41.7 });
  assert.strictEqual(at.estado().pct, 42);
  atualizador.emit('update-downloaded', { version: '1.2.0' });
  assert.strictEqual(at.estado().fase, 'pronta');
  assert.strictEqual(at.estado().pct, 100);
  assert.strictEqual(vistos.at(-1).fase, 'pronta');
});

test('não procura de novo enquanto procura, baixa ou já tem uma pronta', async () => {
  const { atualizador, at } = montar();
  at.buscar(); at.buscar();
  await Promise.resolve();
  assert.strictEqual(atualizador.buscas, 1);
  atualizador.emit('update-available', { version: '1.2.0' });
  at.buscar();
  atualizador.emit('update-downloaded', { version: '1.2.0' });
  at.buscar();
  await Promise.resolve();
  assert.strictEqual(atualizador.buscas, 1);
});

test('só instala quando a versão nova já foi baixada; instala sem janelas e abre de novo', () => {
  const { atualizador, at } = montar();
  assert.strictEqual(at.instalar(), false);
  atualizador.emit('update-available', { version: '1.2.0' });
  assert.strictEqual(at.instalar(), false);
  assert.strictEqual(atualizador.instalou, null);
  atualizador.emit('update-downloaded', { version: '1.2.0' });
  assert.strictEqual(at.instalar(), true);
  assert.deepStrictEqual(atualizador.instalou, [true, true]);
});

test('sem internet: avisa com calma, não anota erro e deixa procurar de novo', async () => {
  const { atualizador, at, erros } = montar();
  at.buscar();
  atualizador.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'));
  assert.strictEqual(at.estado().fase, 'erro');
  assert.match(at.estado().aviso, /Sem internet/);
  assert.strictEqual(erros.length, 0);
  at.buscar();
  await Promise.resolve();
  assert.strictEqual(atualizador.buscas, 2);
});

test('outro erro: anota no registro de erros', () => {
  const { atualizador, at, erros } = montar();
  at.buscar();
  atualizador.emit('error', new Error('sha512 checksum mismatch'));
  assert.strictEqual(at.estado().fase, 'erro');
  assert.strictEqual(erros.length, 1);
});

test('um erro depois não derruba a versão que já está pronta', () => {
  const { atualizador, at } = montar();
  atualizador.emit('update-downloaded', { version: '1.2.0' });
  atualizador.emit('error', new Error('net::ERR_NAME_NOT_RESOLVED'));
  assert.strictEqual(at.estado().fase, 'pronta');
  assert.strictEqual(at.instalar(), true);
});

test('reconhece falta de internet', () => {
  assert.ok(ehFaltaDeInternet(new Error('net::ERR_NAME_NOT_RESOLVED')));
  assert.ok(ehFaltaDeInternet({ code: 'ENOTFOUND' }));
  assert.ok(!ehFaltaDeInternet(new Error('Cannot find latest.yml')));
});
