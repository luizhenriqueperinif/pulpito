// Programa do Notebook: abre o Painel na tela do notebook e o Telão na TV.
const { app, BrowserWindow, screen, dialog, ipcMain, powerSaveBlocker, nativeImage, nativeTheme, desktopCapturer } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFile, execFileSync } = require('child_process');
const { Dados, EXT_IMAGEM, EXT_VIDEO, EXT_AUDIO } = require('./dados');
const { criarServidor } = require('./servidor');
const { criarTeclas } = require('./teclas');

// Os dados ficam sempre na mesma pasta, rodando pelo código (npm start) ou instalado (.exe).
app.setPath('userData', path.join(app.getPath('appData'), 'auxilio-reuniao'));

if (!app.requestSingleInstanceLock()) { app.quit(); }

// Um erro inesperado nunca pode abrir janela de erro no meio da reunião:
// fica anotado em "erros.log" (na pasta de dados) e o programa continua.
function anotarErro(tipo, e) {
  const texto = `[${new Date().toLocaleString('pt-BR')}] ${tipo}: ${(e && e.stack) || e}\n\n`;
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'erros.log'), texto); } catch {}
  console.error(texto);
}
process.on('uncaughtException', e => anotarErro('Erro', e));
process.on('unhandledRejection', e => anotarErro('Erro (promessa)', e));

let dados, servidor, painel, telao;

/**
 * Modo de teste: rodando pelo código (npm start), o Telão abre numa janela pequena no canto
 * e o programa não mexe no Windows (monitores, notificações, tela apagar).
 * O programa instalado (.exe) ou "npm run tv" funcionam como na igreja.
 */
const TESTE = !app.isPackaged && !process.argv.includes('--tv');

function urlLocal(pagina) {
  return `http://127.0.0.1:${servidor.porta}/${pagina}/?t=${servidor.token}`;
}

/**
 * A TV é a tela escolhida no Painel ("Trocar TV ⇄ notebook").
 * Sem escolha salva, é qualquer tela que não seja a principal do Windows.
 */
function telaDaTv() {
  const telas = screen.getAllDisplays();
  if (telas.length < 2) return null;
  const escolhida = telas.find(d => d.id === dados.config.telaTv);
  if (escolhida) return escolhida;
  const principal = screen.getPrimaryDisplay();
  return telas.find(d => d.id !== principal.id);
}

/** O Painel fica numa tela que não seja a da TV. */
function moverPainelParaFora(tv) {
  if (!painel || !tv) return;
  const destino = screen.getAllDisplays().find(d => d.id !== tv.id);
  const atual = screen.getDisplayMatching(painel.getBounds());
  if (!destino || atual.id !== tv.id) return;
  const maximizado = painel.isMaximized();
  if (maximizado) painel.unmaximize();
  const a = destino.workArea;
  const [w, h] = painel.getSize();
  painel.setBounds({
    x: a.x + Math.max(0, Math.round((a.width - w) / 2)),
    y: a.y + Math.max(0, Math.round((a.height - h) / 2)),
    width: Math.min(w, a.width), height: Math.min(h, a.height),
  });
  if (maximizado) painel.maximize();
}

function abrirTelao() {
  if (telao && !telao.isDestroyed()) telao.destroy();
  if (TESTE) return abrirTelaoDeTeste();
  const tv = telaDaTv();
  const opcoes = {
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    webPreferences: { autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false },
  };
  if (tv) {
    Object.assign(opcoes, {
      x: tv.bounds.x, y: tv.bounds.y, width: tv.bounds.width, height: tv.bounds.height,
      frame: false, fullscreen: true, skipTaskbar: true, title: 'Telão',
    });
  } else {
    // Sem TV ligada: abre numa janela comum, só para testar no notebook.
    Object.assign(opcoes, { width: 960, height: 540, title: 'Telão (TV não encontrada)' });
  }
  telao = new BrowserWindow(opcoes);
  if (tv) telao.setAlwaysOnTop(true, 'screen-saver');
  telao.once('ready-to-show', () => { telao.showInactive(); if (tv) telao.setFullScreen(true); });
  telao.loadURL(urlLocal('telao'));
  telao.on('closed', () => { telao = null; });
  moverPainelParaFora(tv);
  servidor.definirTv(tv ? 'tv' : 'janela', screen.getAllDisplays().length);
}

/** Telão pequeno (16:9) no canto de baixo da tela, que pode ser movido e aumentado. */
function abrirTelaoDeTeste() {
  const area = screen.getPrimaryDisplay().workArea;
  const w = 480, h = 270;
  telao = new BrowserWindow({
    x: area.x + area.width - w - 24, y: area.y + area.height - h - 24,
    width: w, height: h, useContentSize: true, minWidth: 240, minHeight: 135,
    title: 'Telão (teste)', backgroundColor: '#000000', show: false, autoHideMenuBar: true,
    webPreferences: { autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false },
  });
  telao.setAspectRatio(16 / 9);
  telao.once('ready-to-show', () => telao.showInactive());
  telao.loadURL(urlLocal('telao'));
  telao.on('closed', () => { telao = null; });
  servidor.definirTv('janela', screen.getAllDisplays().length);
}

function abrirPainel() {
  painel = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    title: TESTE ? 'Púlpito (modo de teste)' : 'Púlpito',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0e0f12' : '#f4f5f7',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  painel.loadURL(urlLocal('painel'));
  painel.on('closed', () => { painel = null; app.quit(); });
}

/** Põe o Windows no modo "Estender" para o notebook não aparecer duplicado na TV. */
function estenderTelas() {
  if (process.platform !== 'win32') return;
  if (screen.getAllDisplays().length > 1) return;
  execFile(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'DisplaySwitch.exe'), ['/extend'], () => {});
}

let reabrirTimer;
function telasMudaram() {
  clearTimeout(reabrirTimer);
  reabrirTimer = setTimeout(abrirTelao, 1500);
}

/** Copia os arquivos para a Biblioteca e, se veio uma reunião, coloca no fim dela. */
function importar(caminhos, reuniaoId, comoFundo) {
  const { novos, repetidos, ignorados } = dados.importarArquivos(caminhos, { comoFundo: !!comoFundo });
  // Os repetidos não são copiados de novo, mas entram na reunião (se ela ainda não tiver).
  if (reuniaoId && !comoFundo) dados.adicionarItens(reuniaoId, [...novos, ...repetidos].map(b => b.id), { semRepetir: true });
  servidor.transmitir();
  return { qtd: novos.length, repetidos: repetidos.length, ignorados, naReuniao: !!reuniaoId && !comoFundo };
}

ipcMain.handle('importar-dialogo', async (_e, { reuniaoId, comoFundo } = {}) => {
  const r = await dialog.showOpenDialog(painel, comoFundo
    ? { title: 'Escolha as imagens de fundo', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Imagens', extensions: EXT_IMAGEM }] }
    : { title: 'Escolha as fotos, vídeos e músicas', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Fotos, vídeos e músicas', extensions: [...EXT_IMAGEM, ...EXT_VIDEO, ...EXT_AUDIO] }] });
  if (r.canceled || r.filePaths.length === 0) return null;
  return importar(r.filePaths, reuniaoId, comoFundo);
});

/** Pregação: o pastor escolhe todas as imagens do bispo de uma vez; viram um item só. */
ipcMain.handle('importar-pregacao', async (_e, { reuniaoId, caminhos } = {}) => {
  if (!Array.isArray(caminhos)) {
    const r = await dialog.showOpenDialog(painel, {
      title: 'Escolha TODAS as imagens da pregação (segure Ctrl ou arraste para marcar várias)',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Imagens', extensions: EXT_IMAGEM }],
    });
    if (r.canceled || r.filePaths.length === 0) return null;
    caminhos = r.filePaths;
  }
  const feito = dados.criarPregacao(caminhos.filter(c => typeof c === 'string'));
  if (!feito) return { qtd: 0, ignorados: caminhos.length };
  if (reuniaoId) dados.adicionarItens(reuniaoId, [feito.pregacao.id], { semRepetir: true });
  servidor.transmitir();
  return { qtd: 1, imagens: feito.pregacao.arquivos.length, ignorados: feito.ignorados, pregacao: true, repetida: !!feito.repetida, titulo: feito.pregacao.titulo };
});

ipcMain.handle('importar-caminhos', (_e, { caminhos, reuniaoId, comoFundo } = {}) => {
  if (!Array.isArray(caminhos) || caminhos.length === 0) return null;
  return importar(caminhos.filter(c => typeof c === 'string'), reuniaoId, comoFundo);
});

// ---------- Logo da igreja ----------

/**
 * Põe a imagem num quadrado (sem esticar), com margem, e devolve com 512 px.
 * fundoBranco: para o ícone do celular (o iPhone pinta de preto o que é transparente).
 * As cores do Electron vêm "pré-multiplicadas" pela transparência, por isso a conta abaixo.
 */
function logoQuadrada(img, { fundoBranco = false, margem = 0 } = {}) {
  const { width: W, height: H } = img.getSize();
  const src = img.toBitmap();
  const Q = Math.ceil(Math.max(W, H) * (1 + margem * 2));
  const out = Buffer.alloc(Q * Q * 4, fundoBranco ? 255 : 0);
  const ox = Math.floor((Q - W) / 2), oy = Math.floor((Q - H) / 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, o = ((y + oy) * Q + (x + ox)) * 4, a = src[i + 3] / 255;
    if (fundoBranco) { for (let c = 0; c < 3; c++) out[o + c] = Math.min(255, Math.round(src[i + c] + 255 * (1 - a))); out[o + 3] = 255; }
    else src.copy(out, o, i, i + 4);
  }
  return nativeImage.createFromBitmap(out, { width: Q, height: Q }).resize({ width: 512, height: 512, quality: 'best' });
}

ipcMain.handle('escolher-logo', async () => {
  const r = await dialog.showOpenDialog(painel, {
    title: 'Escolha a logo da igreja (de preferência PNG com fundo transparente)',
    properties: ['openFile'],
    filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg'] }],
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const img = nativeImage.createFromPath(r.filePaths[0]);
  if (img.isEmpty()) return { ok: false, erro: 'Não consegui abrir essa imagem. Use um arquivo PNG ou JPG.' };
  fs.writeFileSync(path.join(dados.pasta, 'logo.png'), logoQuadrada(img).toPNG());
  fs.writeFileSync(path.join(dados.pasta, 'icone-app.png'), logoQuadrada(img, { fundoBranco: true, margem: 0.12 }).toPNG());
  dados.config.logo = Date.now().toString(36); // muda o endereço, para o celular não usar a antiga guardada
  dados.salvar();
  servidor.transmitir();
  return { ok: true };
});

ipcMain.handle('tirar-logo', () => {
  for (const n of ['logo.png', 'icone-app.png']) fs.rmSync(path.join(dados.pasta, n), { force: true });
  dados.config.logo = null;
  dados.salvar();
  servidor.transmitir();
  return true;
});

ipcMain.handle('trocar-tela-espera', async () => {
  const r = await dialog.showOpenDialog(painel, {
    title: 'Escolha a imagem da Tela de espera',
    properties: ['openFile'],
    filters: [{ name: 'Imagens', extensions: EXT_IMAGEM }],
  });
  if (r.canceled || !r.filePaths[0]) return false;
  dados.trocarTelaEspera(r.filePaths[0]);
  servidor.transmitir();
  return true;
});

ipcMain.handle('tela-espera-do-programa', () => { dados.voltarTelaEsperaDoPrograma(); servidor.transmitir(); return true; });

ipcMain.handle('atualizar-endereco', () => servidor.atualizarEndereco());

// Janelas abertas no notebook que podem aparecer na TV (menos as do próprio Púlpito).
async function listarJanelas(pequeno) {
  const minhas = new Set([painel, telao].filter(w => w && !w.isDestroyed()).map(w => w.getMediaSourceId()));
  const tam = pequeno ? { width: 320, height: 180 } : { width: 480, height: 270 };
  const fontes = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: tam, fetchWindowIcons: !pequeno });
  return fontes
    .filter(f => !minhas.has(f.id) && f.name && !f.thumbnail.isEmpty())
    // Para o celular vai em JPEG, que é bem mais leve pelo Wi-Fi.
    .map(f => ({ id: f.id, nome: f.name, miniatura: pequeno ? 'data:image/jpeg;base64,' + f.thumbnail.toJPEG(70).toString('base64') : f.thumbnail.toDataURL(), icone: !pequeno && f.appIcon && !f.appIcon.isEmpty() ? f.appIcon.toDataURL() : null }));
}
ipcMain.handle('listar-janelas', () => listarJanelas(false));
// O celular também mexe na janela que está na TV (tocar, pausar, adiantar, voltar).
const teclas = criarTeclas();

ipcMain.handle('trocar-telas', () => {
  const telas = screen.getAllDisplays();
  const tv = telaDaTv();
  if (!tv) return false;
  // Passa a TV para a próxima tela (com 2 telas, simplesmente inverte).
  const proxima = telas[(telas.findIndex(d => d.id === tv.id) + 1) % telas.length];
  dados.config.telaTv = proxima.id;
  dados.salvar();
  abrirTelao();
  return true;
});

// ---------- Windows: abrir junto e esconder notificações ----------

/** Abrir sozinho quando o notebook liga. Só vale no programa instalado (.exe). */
function aplicarIniciarComWindows() {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: dados.config.iniciarComWindows !== false });
}

const CHAVE_NOTIF = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications';
const REG = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');

function lerNotificacoes() {
  try {
    const saida = execFileSync(REG, ['query', CHAVE_NOTIF, '/v', 'ToastEnabled'], { encoding: 'utf8', windowsHide: true });
    const m = /ToastEnabled\s+REG_DWORD\s+0x([0-9a-f]+)/i.exec(saida);
    return m ? parseInt(m[1], 16) : 1;
  } catch { return 1; } // sem o valor = notificações ligadas (padrão do Windows)
}

function gravarNotificacoes(valor) {
  try { execFileSync(REG, ['add', CHAVE_NOTIF, '/v', 'ToastEnabled', '/t', 'REG_DWORD', '/d', String(valor), '/f'], { windowsHide: true }); } catch {}
}

/**
 * Enquanto o programa está aberto, os avisos do Windows (e-mail, atualização, WhatsApp...) não aparecem.
 * Guarda como estava antes e devolve ao fechar. Se o programa cair, devolve na próxima vez que fechar.
 */
function esconderNotificacoes() {
  if (process.platform !== 'win32' || dados.config.esconderNotificacoes === false) return;
  if (dados.config.notificacoesAntes == null) {
    dados.config.notificacoesAntes = lerNotificacoes();
    dados.salvar();
  }
  gravarNotificacoes(0);
}

function devolverNotificacoes() {
  if (process.platform !== 'win32' || !dados || dados.config.notificacoesAntes == null) return;
  gravarNotificacoes(dados.config.notificacoesAntes);
  dados.config.notificacoesAntes = null;
  dados.salvar();
}

ipcMain.handle('opcoes', () => ({
  instalado: app.isPackaged,
  iniciarComWindows: dados.config.iniciarComWindows !== false,
  esconderNotificacoes: dados.config.esconderNotificacoes !== false,
}));

ipcMain.handle('mudar-opcao', (_e, { nome, valor } = {}) => {
  if (nome === 'iniciarComWindows') {
    dados.config.iniciarComWindows = !!valor;
    dados.salvar();
    aplicarIniciarComWindows();
  }
  if (nome === 'esconderNotificacoes') {
    dados.config.esconderNotificacoes = !!valor;
    dados.salvar();
    if (valor && !TESTE) esconderNotificacoes(); else devolverNotificacoes();
  }
  return true;
});

// ---------- Capa dos vídeos ----------
// O programa abre o vídeo escondido, vai para o fim e tira uma foto do último quadro:
// é o que fica parado na TV quando o vídeo acaba, e é por ele que o pastor reconhece o vídeo.
function tirarQuadro(url) {
  return new Promise(ok => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.src = url;
    const desiste = setTimeout(() => ok(null), 20000);
    v.onloadedmetadata = () => {
      const d = v.duration;
      v.currentTime = isFinite(d) && d > 0.3 ? d - 0.1 : 0;
    };
    v.onseeked = () => {
      const c = document.createElement('canvas');
      c.width = 640;
      c.height = Math.round(640 * ((v.videoHeight / v.videoWidth) || 9 / 16));
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      clearTimeout(desiste);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    v.onerror = () => { clearTimeout(desiste); ok(null); };
  });
}

let tirandoCapas = false;
const capaNaoDeu = new Set();   // vídeo que o programa não conseguiu abrir: não tenta de novo nesta vez
async function tirarCapas() {
  if (tirandoCapas || !dados || !servidor) return;
  const lista = dados.videosSemCapa().filter(b => !capaNaoDeu.has(b.id));
  if (!lista.length) return;
  tirandoCapas = true;
  let mudou = false;
  const w = new BrowserWindow({ show: false, width: 640, height: 360, webPreferences: { offscreen: true, backgroundThrottling: false } });
  try {
    await w.loadURL(`http://127.0.0.1:${dados.config.porta}/comum/capa.html`);
    for (const b of lista) {
      const url = `/midia/${encodeURIComponent(b.arquivo)}?t=${encodeURIComponent(dados.config.token)}`;
      const foto = await w.webContents.executeJavaScript(`(${tirarQuadro.toString()})(${JSON.stringify(url)})`).catch(() => null);
      if (typeof foto === 'string' && foto.startsWith('data:image/jpeg') && foto.length > 2000) {
        mudou = dados.salvarCapaAutomatica(b.id, Buffer.from(foto.split(',')[1], 'base64')) || mudou;
      } else capaNaoDeu.add(b.id);
    }
  } catch (e) {
    anotarErro('Capa do vídeo', e);
  } finally {
    w.destroy();
    tirandoCapas = false;
  }
  if (mudou) servidor.transmitir();
}

app.on('second-instance', () => { if (painel) { if (painel.isMinimized()) painel.restore(); painel.focus(); } });

app.whenReady().then(async () => {
  dados = new Dados(path.join(app.getPath('userData'), 'dados'));
  servidor = criarServidor({ dados, janelas: { listar: () => listarJanelas(true), apertar: teclas.apertar } });
  try {
    await servidor.iniciar();
  } catch (e) {
    dialog.showErrorBox('Púlpito', `Não foi possível abrir a porta ${dados.config.porta}. O programa já está aberto?\n\n${e.message}`);
    app.quit();
    return;
  }
  abrirPainel();
  // De tempos em tempos vê se chegou vídeo novo sem capa (do notebook ou do celular).
  setTimeout(tirarCapas, 3000);
  setInterval(tirarCapas, 8000);
  if (TESTE) {
    // No modo de teste não mexe no Windows; só devolve as notificações se tinham ficado escondidas.
    devolverNotificacoes();
    abrirTelao();
    return;
  }
  powerSaveBlocker.start('prevent-display-sleep');
  aplicarIniciarComWindows();
  esconderNotificacoes();
  estenderTelas();
  abrirTelao();
  screen.on('display-added', telasMudaram);
  screen.on('display-removed', telasMudaram);
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { devolverNotificacoes(); servidor?.fechar(); teclas.fechar(); });
