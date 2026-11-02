# Electron no Notebook, com um servidor local que serve o Controle, o Telão e o Painel

O programa do Notebook é um app Electron. O processo principal guarda o estado da Reunião e roda um servidor HTTP + WebSocket na porta 7420. As três telas são páginas web comuns servidas por ele: o Telão (janela sem borda em tela cheia na TV), o Painel (janela na tela do notebook) e o Controle (navegador do celular). Assim o celular e a TV usam exatamente o mesmo caminho, e o celular não precisa instalar nada (ver ADR 0001). Escolhemos Electron em vez de Tauri porque o servidor fica em Node no mesmo processo e o Chromium embutido toca os vídeos MP4/H.264 do WhatsApp sem depender do que está instalado no Windows.

## Consequences

- O acesso é protegido por uma chave aleatória que vai no QR code. Quem está no Wi-Fi sem a chave não controla a TV nem baixa os arquivos.
- O endereço gravado no celular contém o IP do notebook. Se o roteador der outro IP ao notebook, o pastor precisa ler o QR code de novo. Para evitar isso, reserve um IP fixo para o notebook no roteador.
- Na primeira vez, o Windows pergunta se o programa pode usar a rede. É preciso clicar em "Permitir" (rede privada).
