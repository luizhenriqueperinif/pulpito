// Servidor local: entrega as páginas (Controle, Telão, Painel), os arquivos de mídia
// e mantém todos sincronizados pelo WebSocket. Funciona só no Wi-Fi da igreja, sem internet.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const { estadoInicial, aplicar } = require('./conducao');
const biblia = require('./biblia');

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

/** Muda a cada vez que o programa abre: as páginas usam para saber que precisam recarregar. */
const INICIO = Date.now().toString(36);

function criarServidor({ dados }) {
  const porta = dados.config.porta;
  const token = dados.config.token;
  let estado = estadoInicial();
  let tvStatus = 'procurando';
  let telas = 1;
  let qrSvg = '';
  let url = '';

  /** Passagem preparada que está na TV (dentro da Palavra), se houver. */
  function passagemNaTv(e) {
    if (e.tv.tipo !== 'item' || !e.tv.passagemId) return null;
    const it = dados.item(e.reuniaoId, e.tv.itemId);
    return it && it.passagens ? it.passagens.find(p => p.id === e.tv.passagemId) || null : null;
  }

  /** Versão da Bíblia do que está na TV: a da passagem preparada, senão a do pastor da reunião. */
  function versaoDe(e) {
    const p = passagemNaTv(e);
    if (p && p.versao) return p.versao;
    const r = e.reuniaoId && dados.reuniaoCompleta(e.reuniaoId);
    return r ? r.versao : 'ACF';
  }

  const ctx = {
    reuniaoExiste: id => !!dados.reuniao(id),
    item: (rid, iid) => dados.item(rid, iid),
    versao: versaoDe,
    existe: (v, r) => biblia.existe(v, r),
    vizinho: (v, r, d) => biblia.vizinho(v, r, d),
  };

  /** Capítulo antes/depois (passa para o livro vizinho no fim do livro). */
  function capituloVizinho(versao, ref, delta) {
    let { l, c } = ref;
    c += delta;
    if (c < 1) { l -= 1; if (l < 0) return null; c = 1; while (biblia.qtdVersos(versao, l, c + 1)) c++; }
    else if (!biblia.qtdVersos(versao, l, c)) { l += 1; c = 1; if (!biblia.qtdVersos(versao, l, c)) return null; }
    return { l, c, rotulo: `${biblia.nomeLivro(l)} ${c}` };
  }

  /** Tudo que a TV e o celular precisam para mostrar o versículo que está na TV. */
  function versiculoNaTv(reuniao) {
    const ref = estado.tv.ref;
    if (!ref) return null;
    const versao = versaoDe(estado);
    const ant = biblia.vizinho(versao, ref, -1);
    const prox = biblia.vizinho(versao, ref, 1);
    let planejado = null;
    const p = passagemNaTv(estado);
    if (p) planejado = { id: p.id, titulo: p.titulo, dentro: ref.l === p.ref.l && ref.c === p.ref.c && ref.v >= p.ref.v && ref.v <= p.ate };
    return {
      ref, versao,
      texto: biblia.texto(versao, ref),
      rotulo: biblia.rotulo(ref),
      capitulo: `${biblia.nomeLivro(ref.l)} ${ref.c}`,
      qtdCap: biblia.qtdVersos(versao, ref.l, ref.c),
      capAnterior: capituloVizinho(versao, ref, -1),
      capProximo: capituloVizinho(versao, ref, 1),
      anterior: ant && biblia.rotulo(ant),
      proximo: prox && biblia.rotulo(prox),
      avulso: estado.tv.tipo === 'avulso',
      planejado,
      fundo: reuniao ? reuniao.fundo : { pronto: 'ceu' },
    };
  }
  // Itens apagados ou fora de ordem durante a reunião não quebram nada:
  // o Telão continua mostrando o que estava até o pastor tocar em outro cartão.

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const partes = u.pathname.split('/').filter(Boolean);

    if (partes.length === 0) { res.writeHead(302, { Location: '/controle/' + u.search }); res.end(); return; }

    if (partes[0] === 'api') {
      if (u.searchParams.get('t') !== token) { res.writeHead(403); res.end(); return; }
      const versao = biblia.VERSOES.includes(u.searchParams.get('v')) ? u.searchParams.get('v') : 'ACF';
      let corpo = null;
      if (partes[1] === 'biblia') corpo = biblia.indice(versao);
      if (partes[1] === 'texto') {
        const l = Number(u.searchParams.get('l')), c = Number(u.searchParams.get('c'));
        const de = Number(u.searchParams.get('de')) || 1, ate = Math.min(Number(u.searchParams.get('ate')) || de, de + 199);
        corpo = [];
        for (let v = de; v <= ate; v++) if (biblia.existe(versao, { l, c, v })) corpo.push({ v, texto: biblia.texto(versao, { l, c, v }) });
      }
      if (!corpo) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'max-age=3600' });
      res.end(JSON.stringify(corpo));
      return;
    }

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

  function pacote(completo) {
    const reuniao = estado.reuniaoId ? dados.reuniaoCompleta(estado.reuniaoId) : null;
    const base = {
      tipo: 'estado',
      estado,
      hoje: dados.hoje(),
      reunioes: dados.resumoReunioes(),
      reuniao,
      versiculo: versiculoNaTv(reuniao),
      recentes: dados.recentes(reuniao?.pastorId).map(r => ({ ...r, rotulo: biblia.rotulo(r) })),
      info: { inicio: INICIO, url, qrSvg, tv: tvStatus, telas, celulares: celularesConectados(), telaEspera: dados.config.telaEspera },
    };
    if (completo) {
      // Só o Painel precisa de tudo para preparar as reuniões.
      base.pastores = dados.pastores;
      base.biblioteca = dados.biblioteca.map(b => ({ ...b, usos: dados.usos(b.id) }));
      base.antigos = dados.antigos().map(b => b.id);
      base.reunioesCompletas = dados.reunioes.map(r => dados.reuniaoCompleta(r.id));
    }
    return JSON.stringify(base);
  }

  function transmitir() {
    let simples, completo;
    for (const c of wss.clients) {
      if (c.readyState !== 1) continue;
      if (c.papel === 'painel') c.send(completo ??= pacote(true));
      else c.send(simples ??= pacote(false));
    }
  }

  // Comandos de preparação: só o Painel (notebook) pode mandar.
  const PREPARO = {
    salvarPastor: c => dados.salvarPastor(c),
    removerPastor: c => dados.removerPastor(c.id),
    criarReuniao: c => dados.criarReuniao(c),
    editarReuniao: c => dados.editarReuniao(c.id, c.campos || {}),
    removerReuniao: c => {
      if (estado.reuniaoId === c.id) estado = estadoInicial(estado.volume);
      dados.removerReuniao(c.id);
    },
    adicionarItens: c => dados.adicionarItens(c.reuniaoId, c.bibliotecaIds || []),
    adicionarVersiculo: c => dados.adicionarVersiculo(c.reuniaoId, c),
    moverPassagem: c => dados.moverPassagem(c.reuniaoId, c.passagemId, Number(c.delta) || 0),
    removerPassagem: c => dados.removerPassagem(c.reuniaoId, c.passagemId),
    moverItem: c => dados.moverItem(c.reuniaoId, c.itemId, Number(c.delta)),
    removerItem: c => dados.removerItem(c.reuniaoId, c.itemId),
    renomearArquivo: c => dados.renomearArquivo(c.id, c.titulo),
    removerDaBiblioteca: c => dados.removerDaBiblioteca(c.id),
    apagarAntigos: () => dados.apagarAntigos(),
  };

  function executar(cmd, papel, ws) {
    if (cmd.cmd === 'videoProgresso' && papel !== 'telao') return;
    const preparo = PREPARO[cmd.cmd];
    if (preparo) {
      if (papel !== 'painel') return;
      let resposta = null;
      try { resposta = preparo(cmd); } catch (e) { ws.send(JSON.stringify({ tipo: 'erro', mensagem: e.message })); return; }
      if (cmd.pedido) ws.send(JSON.stringify({ tipo: 'resposta', pedido: cmd.pedido, resposta }));
      transmitir();
      return;
    }
    const novo = aplicar(estado, cmd, ctx);
    if (novo === estado) return;
    estado = novo;
    // Guarda em "Últimos usados" do pastor o versículo que acabou de abrir.
    if (['mostrarVersiculo', 'mostrar', 'mostrarPassagem'].includes(cmd.cmd) && estado.tv.ref) {
      dados.lembrarVersiculo(dados.reuniao(estado.reuniaoId)?.pastorId, estado.tv.ref);
    }
    transmitir();
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
      if (cmd && typeof cmd.cmd === 'string') executar(cmd, ws.papel, ws);
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
    definirTv(status, qtdTelas) { tvStatus = status; telas = qtdTelas || 1; transmitir(); },
    fechar() { wss.close(); server.close(); },
  };
}

module.exports = { criarServidor, ipLocal };
