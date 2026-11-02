// Ponte entre o Painel (página) e o Notebook (janelas de escolher arquivo).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notebook', {
  criarReuniaoTeste: () => ipcRenderer.invoke('criar-reuniao-teste'),
  trocarTelaEspera: () => ipcRenderer.invoke('trocar-tela-espera'),
  atualizarEndereco: () => ipcRenderer.invoke('atualizar-endereco'),
});
