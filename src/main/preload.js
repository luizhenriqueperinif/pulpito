// Ponte entre o Painel (página) e o Notebook (janelas de escolher arquivo, monitores).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('notebook', {
  importarDialogo: (reuniaoId, comoFundo) => ipcRenderer.invoke('importar-dialogo', { reuniaoId, comoFundo }),
  /** Arquivos arrastados para a janela. */
  importarArquivos: (arquivos, reuniaoId, comoFundo) =>
    ipcRenderer.invoke('importar-caminhos', { caminhos: Array.from(arquivos, f => webUtils.getPathForFile(f)), reuniaoId, comoFundo }),
  trocarTelaEspera: () => ipcRenderer.invoke('trocar-tela-espera'),
  atualizarEndereco: () => ipcRenderer.invoke('atualizar-endereco'),
  trocarTelas: () => ipcRenderer.invoke('trocar-telas'),
});
