// Publica a versão do package.json como uma "Release" no GitHub.
// É de lá que os notebooks com o Altar instalado baixam a atualização sozinhos.
//
//   1. suba a "version" no package.json
//   2. npm run publicar            (gera o instalador e publica)
//      npm run publicar -- --so-publicar   (publica o instalador que já está em dist/)
//
// Precisa do GitHub CLI (gh) com login feito: gh auth login

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const { version } = require(path.join(raiz, 'package.json'));
const tag = `v${version}`;
const dist = path.join(raiz, 'dist');
// Os três arquivos que o programa instalado procura: o instalador, o "mapa" (para baixar só o que mudou)
// e o latest.yml (diz qual é a versão mais nova e confere se o download chegou inteiro).
const arquivos = [`Instalar-Altar-${version}.exe`, `Instalar-Altar-${version}.exe.blockmap`, 'latest.yml'].map(n => path.join(dist, n));

function parar(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }
function gh(args, opcoes = {}) { return spawnSync('gh', args, { cwd: raiz, encoding: 'utf8', ...opcoes }); }

if (gh(['--version']).status !== 0) parar('O GitHub CLI (gh) não está instalado ou não está no PATH.');
if (gh(['release', 'view', tag]).status === 0) parar(`A versão ${version} já foi publicada. Suba a "version" no package.json antes de publicar de novo.`);

if (!process.argv.includes('--so-publicar')) {
  console.log(`Gerando o instalador da versão ${version}…`);
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'instalador'], { cwd: raiz, stdio: 'inherit', shell: true });
}

for (const a of arquivos) if (!fs.existsSync(a)) parar(`Faltou o arquivo ${path.relative(raiz, a)}. Rode "npm run instalador" primeiro.`);
const yml = fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8');
if (!yml.includes(`version: ${version}`)) parar(`O dist/latest.yml não é da versão ${version}. Rode "npm run instalador" de novo.`);

console.log(`Publicando ${tag} no GitHub…`);
const r = gh(['release', 'create', tag, ...arquivos, '--title', `Altar ${version}`, '--notes', `Instalador do Altar ${version} para Windows. Os notebooks com o Altar instalado baixam esta versão sozinhos.`, '--latest'], { stdio: 'inherit' });
if (r.status !== 0) parar('O GitHub recusou a publicação (veja a mensagem acima).');
console.log(`\n✔ Versão ${version} publicada. Os notebooks com internet atualizam sozinhos nas próximas horas.`);
