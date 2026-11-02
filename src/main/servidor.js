// Servidor local: entrega as páginas (Controle, Telão, Painel), os arquivos de mídia
// e mantém todos sincronizados pelo WebSocket. Funciona só no Wi-Fi da igreja, sem internet.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const { estadoInicial, aplicar } = require('./conducao');

const RAIZ = path.join(__dirname, '..', '..');
const PASTAS_ESTATICAS = {
  controle: path.join(RAIZ, 'src', 'web', 'controle'),
  telao: path.join(RAIZ, 'src', 'web', 'telao'),
  painel: path.join(RAIZ, 'src', 'web', 'painel'),
  comum: path.join(RAIZ, 'src', 'web', 'comum'),
  fontes: path.join(RAIZ, 'node_modules', '@fontsource', 'atkinson-hyperlegible', 'files'),
};
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.woff2': 'font/woff2',
};

/** Endereço do Notebook no Wi-Fi (o que vai no QR code). */
function ipLocal() {
  const candidatos = [];
  for (const [nome, lista] of Object.entries(os.networkInterfaces())) {
    for (const a of lista || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      let nota = 0;
      if (/wi-?fi|wlan|wireless/i.test(nome)) nota += 2;
      if (/^192\.168\./.test(a.address)) nota += 1;
      if (/virtual|vethernet|vmware|vbox|hyper-v|loopback/i.test(nome)) nota -= 5;
      candidatos.push({ ip: a.address, nota });
    }
  }
  candidatos.sort((a, b) => b.nota - a.nota);
  return candidatos[0]?.ip || '127.0.0.1';
}

function enviarArquivo(req, res, arquivo) {
  fs.stat(arquivo, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end(); return; }
    const tipo = TIPOS[path.extname(arquivo).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      // Vídeos são pedidos em pedaços (Range) para poder pular e começar rápido.
      const inicio = range[1] ? parseInt(range[1], 10) : 0;
      const fim = range[2] ? Math.min(parseInt(range[2], 10), st.size - 1) : st.size - 1;
      if (inicio >= st.size || inicio > fim) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); res.end(); return; }
      res.writeHead(206, {
        'Content-Type': tipo, 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${inicio}-${fim}/${st.size}`, 'Content-Length': fim - inicio + 1,
      });
      fs.createReadStream(arquivo, { start: inicio, end: fim }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    fs.createReadStream(arquivo).pipe(res);
  });
}

function criarServidor({ dados }) {
  const porta = dados.config.porta;
  const token = dados.config.token;
  let estado = estadoInicial();
  let tvStatus = 'procurando';
  let qrSvg = '';
  let url = '';

  const ctx = {
    reuniaoExiste: id => !!dados.reuniao(id),
    item: (rid, iid) => dados.item(rid, iid),
  };

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const partes = u.pathname.split('/').filter(Boolean);

    if (partes.length === 0) { res.writeHead(302, { Location: '/controle/' + u.search }); res.end(); return; }

    if (partes[0] === 'midia') {
      if (u.searchParams.get('t') !== token) { res.writeHead(403); res.end(); return; }
      const nome = path.basename(decodeURIComponent(partes[1] || ''));
      enviarArquivo(req, res, path.join(dados.pastaMidia, nome));
      return;
    }

    const base = PASTAS_ESTATICAS[partes[0]];
    if (!base) { res.writeHead(404); res.end(); return; }
    if (partes.length === 1 && !u.pathname.endsWith('/')) { res.writeHead(302, { Location: u.pathname + '/' + u.search }); res.end(); return; }
    const rel = partes.slice(1).map(decodeURIComponent).join('/') || 'index.html';
    const arquivo = path.normalize(path.join(base, rel));
    if (!arquivo.startsWith(base)) { res.writeHead(403); res.end(); return; }
    enviarArquivo(req, res, arquivo);
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  function celularesConectados() {
    let n = 0;
    for (const c of wss.clients) if (c.papel === 'controle' && !c.local) n++;
    return n;
  }

  function pacote() {
    return JSON.stringify({
      tipo: 'estado',
      estado,
      reunioes: dados.reunioes.map(r => ({ id: r.id, nome: r.nome, data: r.data, hora: r.hora, qtd: r.itens.length })),
      reuniao: estado.reuniaoId ? dados.reuniao(estado.reuniaoId) : null,
      info: { url, qrSvg, tv: tvStatus, celulares: celularesConectados(), telaEspera: dados.config.telaEspera },
    });
  }

  function transmitir() {
    const msg = pacote();
    for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
  }

  function executar(cmd, papel) {
    if (cmd.cmd === 'videoProgresso' && papel !== 'telao') return;
    if (cmd.cmd === 'removerReuniao') {
      if (papel !== 'painel') return;
      if (estado.reuniaoId === cmd.id) estado = estadoInicial(estado.volume);
      dados.removerReuniao(cmd.id);
      transmitir();
      return;
    }
    const novo = aplicar(estado, cmd, ctx);
    if (novo !== estado) { estado = novo; transmitir(); }
  }

  wss.on('connection', (ws, req) => {
    const u = new URL(req.url, 'http://x');
    if (u.searchParams.get('t') !== token) { ws.close(4001, 'token'); return; }
    ws.papel = u.searchParams.get('papel') || 'controle';
    ws.local = u.searchParams.get('local') === '1';
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', raw => {
      let cmd;
      try { cmd = JSON.parse(raw); } catch { return; }
      if (cmd && typeof cmd.cmd === 'string') executar(cmd, ws.papel);
    });
    ws.on('close', () => transmitir());
    transmitir();
  });

  // Derruba conexões mortas (celular que bloqueou a tela) para a contagem ficar certa.
  const batimento = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 10000);
  wss.on('close', () => clearInterval(batimento));

  async function atualizarEndereco() {
    url = `http://${ipLocal()}:${porta}/controle/?t=${token}`;
    qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    transmitir();
  }

  return {
    porta,
    token,
    iniciar: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(porta, '0.0.0.0', async () => { await atualizarEndereco(); resolve(); });
    }),
    atualizarEndereco,
    transmitir,
    definirTv(status) { tvStatus = status; transmitir(); },
    fechar() { wss.close(); server.close(); },
  };
}

module.exports = { criarServidor, ipLocal };
