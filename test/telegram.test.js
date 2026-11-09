const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listarVideos, caminhoDoVideo, nomeDaCapa } = require('../src/main/telegram');

function pasta() {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'pulpito-tg-'));
  const criar = (nome, kb, minutosAtras) => {
    const c = path.join(p, nome);
    fs.writeFileSync(c, Buffer.alloc(kb * 1024));
    const t = new Date(Date.now() - minutosAtras * 60000);
    fs.utimesSync(c, t, t);
  };
  criar('testemunho.mp4', 50, 10);
  criar('video_2026-11-09.MP4', 50, 1);
  criar('foto.jpg', 50, 1);        // não é vídeo
  criar('vazio.mp4', 1, 1);        // pequeno demais
  criar('chegando.mp4', 50, 0);    // acabou de mexer: ainda baixando
  return p;
}

test('Telegram: lista só os vídeos prontos, o mais novo primeiro', () => {
  const p = pasta();
  assert.deepEqual(listarVideos(p).map(v => v.nome), ['video_2026-11-09.MP4', 'testemunho.mp4']);
  assert.deepEqual(listarVideos(path.join(p, 'nao-existe')), []);
});

test('Telegram: só abre vídeo que está na pasta', () => {
  const p = pasta();
  assert.equal(caminhoDoVideo(p, 'testemunho.mp4'), path.join(p, 'testemunho.mp4'));
  assert.equal(caminhoDoVideo(p, '..\\testemunho.mp4'), null);
  assert.equal(caminhoDoVideo(p, '../testemunho.mp4'), null);
  assert.equal(caminhoDoVideo(p, 'foto.jpg'), null);
  assert.equal(caminhoDoVideo(p, 'sumiu.mp4'), null);
});

test('Telegram: imagem do vídeo muda se o arquivo mudar', () => {
  const a = nomeDaCapa({ nome: 'v.mp4', tamanho: 10, quando: 1 });
  assert.equal(a, nomeDaCapa({ nome: 'v.mp4', tamanho: 10, quando: 1 }));
  assert.notEqual(a, nomeDaCapa({ nome: 'v.mp4', tamanho: 11, quando: 1 }));
  assert.match(a, /^[0-9a-f]{20}\.jpg$/);
});

test('celular pega vídeo do Telegram: entra na Biblioteca, na reunião e na TV', async () => {
  const WebSocket = require('ws');
  const { Dados } = require('../src/main/dados');
  const { criarServidor } = require('../src/main/servidor');
  const tg = pasta();
  const capas = fs.mkdtempSync(path.join(os.tmpdir(), 'pulpito-tgcapas-'));
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pulpito-tgdados-'));
  const d = new Dados(base); d.config.porta = 7600 + Math.floor(Math.random() * 300);
  const r = d.criarReuniao({});
  const s = criarServidor({ dados: d, telegram: { pasta: () => tg, pastaCapas: () => capas } });
  await s.iniciar();
  const ws = new WebSocket(`ws://127.0.0.1:${d.config.porta}/ws?t=${s.token}&papel=controle`);
  const recebidos = [];
  ws.on('message', m => recebidos.push(JSON.parse(m)));
  await new Promise(ok => ws.on('open', ok));
  const espera = ms => new Promise(ok => setTimeout(ok, ms));
  const manda = c => ws.send(JSON.stringify(c));
  const ultimo = tipo => recebidos.filter(m => m.tipo === tipo).pop();

  // Sem reunião aberta não coloca nada.
  manda({ cmd: 'colocarTelegram', nome: 'testemunho.mp4' }); await espera(150);
  assert.equal(d.d.biblioteca.length, 0);

  manda({ cmd: 'escolherReuniao', id: r.id }); await espera(100);
  manda({ cmd: 'pedirTelegram' }); await espera(150);
  assert.deepEqual(ultimo('telegram').lista.map(v => [v.nome, v.naReuniao]), [['video_2026-11-09.MP4', false], ['testemunho.mp4', false]]);

  manda({ cmd: 'colocarTelegram', nome: 'testemunho.mp4' }); await espera(200);
  const itens = d.reuniao(r.id).itens;
  assert.equal(itens.length, 1);
  assert.equal(ultimo('estado').estado.tv.itemId, itens[0].id);

  // De novo: não repete na reunião e aparece como "já está".
  manda({ cmd: 'colocarTelegram', nome: 'testemunho.mp4' }); await espera(200);
  assert.equal(d.reuniao(r.id).itens.length, 1);
  manda({ cmd: 'pedirTelegram' }); await espera(150);
  assert.equal(ultimo('telegram').lista.find(v => v.nome === 'testemunho.mp4').naReuniao, true);

  // Arquivo de fora da pasta: não.
  manda({ cmd: 'colocarTelegram', nome: '..\segredo.mp4' }); await espera(150);
  assert.equal(ultimo('telegramSumiu').nome, '..\segredo.mp4');

  // Vídeo pelo endereço só com a senha.
  const porta = d.config.porta;
  assert.equal((await fetch(`http://127.0.0.1:${porta}/telegram/testemunho.mp4?t=errado`)).status, 403);
  const ok = await fetch(`http://127.0.0.1:${porta}/telegram/testemunho.mp4?t=${s.token}`);
  assert.equal(ok.status, 200); await ok.arrayBuffer();

  ws.close(); s.fechar();
  for (const p of [tg, capas, base]) fs.rmSync(p, { recursive: true, force: true });
});
