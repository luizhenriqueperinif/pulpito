const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Dados, tipoDoArquivo } = require('../src/main/dados');

function pastaTemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'auxilio-teste-'));
}

test('reconhece imagens e vídeos pelo nome do arquivo', () => {
  assert.equal(tipoDoArquivo('IMG-20261102-WA0001.jpg'), 'imagem');
  assert.equal(tipoDoArquivo('VID-20261102-WA0003.MP4'), 'video');
  assert.equal(tipoDoArquivo('documento.pdf'), null);
});

test('cria reunião com os arquivos na ordem do WhatsApp e ignora o que não reconhece', () => {
  const origem = pastaTemp();
  for (const n of ['IMG-WA0010.jpg', 'IMG-WA0002.jpg', 'VID-WA0005.mp4', 'leia-me.txt']) {
    fs.writeFileSync(path.join(origem, n), 'x');
  }
  const d = new Dados(pastaTemp());
  const { reuniao, ignorados } = d.criarReuniao('Teste', fs.readdirSync(origem).map(n => path.join(origem, n)));
  assert.deepEqual(reuniao.itens.map(i => i.titulo), ['IMG-WA0002', 'IMG-WA0010', 'VID-WA0005']);
  assert.equal(ignorados, 1);
  for (const it of reuniao.itens) assert.ok(fs.existsSync(path.join(d.pastaMidia, it.arquivo)));
});

test('os dados continuam lá quando o programa abre de novo', () => {
  const pasta = pastaTemp();
  const origem = pastaTemp();
  fs.writeFileSync(path.join(origem, 'a.png'), 'x');
  const d1 = new Dados(pasta);
  d1.criarReuniao('Domingo', [path.join(origem, 'a.png')]);
  const d2 = new Dados(pasta);
  assert.equal(d2.reunioes.length, 1);
  assert.equal(d2.config.token, d1.config.token);
});

test('apagar reunião apaga os arquivos dela', () => {
  const origem = pastaTemp();
  fs.writeFileSync(path.join(origem, 'a.png'), 'x');
  const d = new Dados(pastaTemp());
  const { reuniao } = d.criarReuniao('Domingo', [path.join(origem, 'a.png')]);
  const arq = path.join(d.pastaMidia, reuniao.itens[0].arquivo);
  d.removerReuniao(reuniao.id);
  assert.equal(d.reunioes.length, 0);
  assert.equal(fs.existsSync(arq), false);
});
