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

/** A TV é qualquer tela que não seja a do próprio notebook. */
function telaDaTv() {
  const principal = screen.getPrimaryDisplay();
  return screen.getAllDisplays().find(d => d.id !== principal.id) || null;
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
  servidor.definirTv(tv ? 'tv' : 'janela');
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

ipcMain.handle('criar-reuniao-teste', async () => {
  const r = await dialog.showOpenDialog(painel, {
    title: 'Escolha as imagens e vídeos da reunião de teste',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Imagens e vídeos', extensions: [...EXT_IMAGEM, ...EXT_VIDEO] }],
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  const qtd = dados.reunioes.length + 1;
  const res = dados.criarReuniao(`Reunião de teste ${qtd}`, r.filePaths);
  servidor.transmitir();
  return { itens: res.reuniao.itens.length, ignorados: res.ignorados };
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
