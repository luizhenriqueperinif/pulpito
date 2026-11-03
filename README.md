# Púlpito

Prepara a reunião no notebook e conduz pelo celular, projetando na TV da igreja. Vocabulário em [GLOSSARY.md](GLOSSARY.md), decisões em [docs/adr](docs/adr).

## Rodar (desenvolvimento)

```
npm install
npm start
```

- Abre o **Painel** no notebook e o **Telão** na TV (se a TV estiver ligada no cabo; senão, numa janela).
- Na primeira vez, o Windows pergunta sobre a rede: clique em **Permitir** (rede privada).
- No celular (mesmo Wi-Fi): leia o QR code do Painel.

## Testes

```
npm test
```

## Etapas

1. **Esqueleto:** TV + celular + reunião de teste com imagens e vídeos, apagar TV, volume, encerrar.
2. Preparar a reunião no notebook (pastores, biblioteca, ordem, copiar reunião).
3. Bíblia ACF/NVI, versículos planejados e avulsos, fundos.
4. **Pregação e Músicas:** pregação com várias imagens e ◀ ▶, músicas da reunião e música avulsa pelo celular.
5. **Envio pelo celular e instalador (atual):** mandar arquivos do celular, abrir com o Windows, esconder avisos do Windows, instalador .exe.

## Instalador (para o notebook da igreja)

1. Gere o instalador: `npm run instalador` (cria `dist/Instalar-Auxilio-Reuniao-<versão>.exe`).
2. Copie o `.exe` para o notebook da igreja (pendrive) e abra.
3. O Windows avisa "O Windows protegeu o computador" (o programa não é assinado): clique em **Mais informações → Executar assim mesmo**.
4. Na primeira vez que o programa abrir, o Firewall pergunta se ele pode usar a rede: clique em **Permitir** (senão o celular não conecta).
5. Pronto: o programa abre sozinho quando o notebook liga (dá para desligar em Configurações → Windows).

Os dados (reuniões, Biblioteca, pastores) ficam em `%APPDATA%auxilio-reuniaodados` e continuam lá ao reinstalar ou atualizar.
Para atualizar o programa: gere um instalador novo (suba a `version` no package.json) e instale por cima.
