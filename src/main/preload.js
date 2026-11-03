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
  atualizarEndereco: () => ipcRenderer.invoke('atualizar-endereco'),
  trocarTelas: () => ipcRenderer.invoke('trocar-telas'),
  opcoes: () => ipcRenderer.invoke('opcoes'),
  escolherLogo: () => ipcRenderer.invoke('escolher-logo'),
  tirarLogo: () => ipcRenderer.invoke('tirar-logo'),
  mudarOpcao: (nome, valor) => ipcRenderer.invoke('mudar-opcao', { nome, valor }),
  listarJanelas: () => ipcRenderer.invoke('listar-janelas'),
});
