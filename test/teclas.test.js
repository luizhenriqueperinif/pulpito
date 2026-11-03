const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const { teclaPara, numeroDaJanela } = require('../src/main/teclas');
const { Dados } = require('../src/main/dados');
const { criarServidor } = require('../src/main/servidor');

test('teclas da janela: no YouTube K, J e L; nos outros espaço e setas', () => {
  const yt = 'Testemunho - YouTube';
  assert.equal(teclaPara('playPausa', yt), 0x4b);
  assert.equal(teclaPara('voltar', yt), 0x4a);
  assert.equal(teclaPara('avancar', yt), 0x4c);
  assert.equal(teclaPara('playPausa', 'Telegram'), 0x20);
  assert.equal(teclaPara('voltar', 'Telegram'), 0x25);
  assert.equal(teclaPara('avancar', 'Telegram'), 0x27);
  assert.equal(teclaPara('apagarTudo', yt), null);
  assert.equal(numeroDaJanela('window:460550:0'), '460550');
  assert.equal(numeroDaJanela('screen:0:0'), null);
  assert.equal(numeroDaJanela('window:1;calc:0'), null);
});

test('celular pede as janelas e só mexe na que está na TV', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pulpito-teclas-'));
  const d = new Dados(pasta); d.config.porta = 7600 + Math.floor(Math.random() * 300);
  const apertos = [];
  const janelas = {
    listar: async () => [{ id: 'window:42:0', nome: 'Vídeo - YouTube', miniatura: 'data:,' }],
    apertar: async (fonteId, nome, acao) => { apertos.push([fonteId, nome, acao]); return 'ok'; },
  };
  const s = criarServidor({ dados: d, janelas }); await s.iniciar();
  const ws = new WebSocket(`ws://127.0.0.1:${d.config.porta}/ws?t=${s.token}&papel=controle`);
  const recebidos = [];
  ws.on('message', m => recebidos.push(JSON.parse(m)));
  await new Promise(ok => ws.on('open', ok));
  const espera = ms => new Promise(ok => setTimeout(ok, ms));
  const manda = c => ws.send(JSON.stringify(c));

  manda({ cmd: 'pedirJanelas' }); await espera(150);
  assert.deepEqual(recebidos.find(m => m.tipo === 'janelas').lista.map(j => j.nome), ['Vídeo - YouTube']);

  // Sem janela na TV, não aperta nada.
  manda({ cmd: 'teclaJanela', acao: 'playPausa' }); await espera(150);
  assert.equal(apertos.length, 0);

  manda({ cmd: 'mostrarJanela', fonteId: 'window:42:0', nome: 'Vídeo - YouTube' }); await espera(150);
  manda({ cmd: 'teclaJanela', acao: 'avancar' });
  manda({ cmd: 'teclaJanela', acao: 'desligarPC' }); // botão que não existe: ignora
  await espera(150);
  assert.deepEqual(apertos, [['window:42:0', 'Vídeo - YouTube', 'avancar']]);
  assert.equal(recebidos.filter(m => m.tipo === 'tecla').length, 1);

  ws.close(); s.fechar();
  fs.rmSync(pasta, { recursive: true, force: true });
});
