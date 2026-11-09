// Vídeos do Telegram: o Telegram Desktop salva o que o pastor baixa numa pasta
// (normalmente Downloads\Telegram Desktop). O celular mostra os vídeos dessa pasta
// e o escolhido entra na Biblioteca e na reunião, passando no player do próprio Púlpito.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EXT_VIDEO = ['mp4', 'm4v', 'mov', 'webm', 'mkv'];
const ehVideo = nome => EXT_VIDEO.includes(path.extname(nome).slice(1).toLowerCase());

/**
 * Vídeos da pasta, o mais novo primeiro. Pula os que ainda estão chegando
 * (mexidos nos últimos segundos) e os vazios.
 * @returns {{ nome: string, tamanho: number, quando: number }[]}
 */
function listarVideos(pasta, { limite = 40, agora = Date.now() } = {}) {
  let nomes;
  try { nomes = fs.readdirSync(pasta); } catch { return []; }
  const lista = [];
  for (const nome of nomes) {
    if (!ehVideo(nome)) continue;
    let st;
    try { st = fs.statSync(path.join(pasta, nome)); } catch { continue; }
    if (!st.isFile() || st.size < 10 * 1024) continue;
    if (agora - st.mtimeMs < 3000) continue; // ainda baixando
    lista.push({ nome, tamanho: st.size, quando: Math.round(st.mtimeMs) });
  }
  lista.sort((a, b) => b.quando - a.quando);
  return lista.slice(0, limite);
}

/** Caminho do vídeo na pasta, só se for um vídeo que está lá (nada de "..\" nem outras pastas). */
function caminhoDoVideo(pasta, nome) {
  const limpo = path.basename(String(nome || ''));
  if (!limpo || limpo !== nome || !ehVideo(limpo)) return null;
  const c = path.join(pasta, limpo);
  try { return fs.statSync(c).isFile() ? c : null; } catch { return null; }
}

/** Nome do arquivo da imagem de um vídeo (muda se o vídeo for trocado por outro com o mesmo nome). */
function nomeDaCapa(v) {
  return crypto.createHash('sha1').update(`${v.nome}|${v.tamanho}|${v.quando}`).digest('hex').slice(0, 20) + '.jpg';
}

module.exports = { listarVideos, caminhoDoVideo, nomeDaCapa, ehVideo };
