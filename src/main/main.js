// Programa do Notebook: abre o Painel na tela do notebook e o Telão na TV.
const { app, BrowserWindow, screen, dialog, ipcMain, powerSaveBlocker } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const { Dados, EXT_IMAGEM, EXT_VIDEO } = require('./dados');
const { criarServidor } = require('./servidor');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let dados, servidor, painel, telao;

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

function abrirPainel() {
  painel = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    title: 'Auxílio Reunião',
    backgroundColor: '#e9eef4',
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
function importar(caminhos, reuniaoId) {
  const { novos, ignorados } = dados.importarArquivos(caminhos);
  if (reuniaoId && novos.length) dados.adicionarItens(reuniaoId, novos.map(b => b.id));
  servidor.transmitir();
  return { qtd: novos.length, ignorados };
}

ipcMain.handle('importar-dialogo', async (_e, { reuniaoId } = {}) => {
  const r = await dialog.showOpenDialog(painel, {
    title: 'Escolha as fotos e vídeos',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Fotos e vídeos', extensions: [...EXT_IMAGEM, ...EXT_VIDEO] }],
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  return importar(r.filePaths, reuniaoId);
});

ipcMain.handle('importar-caminhos', (_e, { caminhos, reuniaoId } = {}) => {
  if (!Array.isArray(caminhos) || caminhos.length === 0) return null;
  return importar(caminhos.filter(c => typeof c === 'string'), reuniaoId);
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

ipcMain.handle('atualizar-endereco', () => servidor.atualizarEndereco());

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

app.on('second-instance', () => { if (painel) { if (painel.isMinimized()) painel.restore(); painel.focus(); } });

app.whenReady().then(async () => {
  dados = new Dados(path.join(app.getPath('userData'), 'dados'));
  servidor = criarServidor({ dados });
  try {
    await servidor.iniciar();
  } catch (e) {
    dialog.showErrorBox('Auxílio Reunião', `Não foi possível abrir a porta ${dados.config.porta}. O programa já está aberto?\n\n${e.message}`);
    app.quit();
    return;
  }
  powerSaveBlocker.start('prevent-display-sleep');
  estenderTelas();
  abrirPainel();
  abrirTelao();
  screen.on('display-added', telasMudaram);
  screen.on('display-removed', telasMudaram);
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => servidor?.fechar());
