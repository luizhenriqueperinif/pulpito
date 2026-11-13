// Ponte entre o Painel (página) e o Notebook (janelas de escolher arquivo, monitores).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('notebook', {
  importarDialogo: (reuniaoId, comoFundo) => ipcRenderer.invoke('importar-dialogo', { reuniaoId, comoFundo }),
  /** Arquivos arrastados para a janela. */
  importarArquivos: (arquivos, reuniaoId, comoFundo) =>
    ipcRenderer.invoke('importar-caminhos', { caminhos: Array.from(arquivos, f => webUtils.getPathForFile(f)), reuniaoId, comoFundo }),
  importarPregacao: reuniaoId => ipcRenderer.invoke('importar-pregacao', { reuniaoId }),
  /** Imagens arrastadas para a aba Pregações: viram uma pregação só. */
  importarPregacaoArquivos: arquivos =>
    ipcRenderer.invoke('importar-pregacao', { caminhos: Array.from(arquivos, f => webUtils.getPathForFile(f)) }),
  trocarTelaEspera: () => ipcRenderer.invoke('trocar-tela-espera'),
  telaEsperaDoPrograma: () => ipcRenderer.invoke('tela-espera-do-programa'),
  atualizarEndereco: () => ipcRenderer.invoke('atualizar-endereco'),
  trocarTelas: () => ipcRenderer.invoke('trocar-telas'),
  opcoes: () => ipcRenderer.invoke('opcoes'),
  escolherLogo: () => ipcRenderer.invoke('escolher-logo'),
  tirarLogo: () => ipcRenderer.invoke('tirar-logo'),
  mudarOpcao: (nome, valor) => ipcRenderer.invoke('mudar-opcao', { nome, valor }),
  listarJanelas: () => ipcRenderer.invoke('listar-janelas'),
  escolherPastaTelegram: () => ipcRenderer.invoke('escolher-pasta-telegram'),
  tgEstado: () => ipcRenderer.invoke('tg-estado'),
  tgAcao: (acao, a, b) => ipcRenderer.invoke('tg-acao', { acao, a, b }),
  aoMudarTelegram: f => ipcRenderer.on('telegram-mudou', () => f()),
  /** Atualização automática do programa (src/main/atualizacao.js). */
  atualizacao: () => ipcRenderer.invoke('atualizacao-estado'),
  buscarAtualizacao: () => ipcRenderer.invoke('atualizacao-buscar'),
  instalarAtualizacao: () => ipcRenderer.invoke('atualizacao-instalar'),
  aoMudarAtualizacao: f => ipcRenderer.on('atualizacao-mudou', (_e, estado) => f(estado)),
});
