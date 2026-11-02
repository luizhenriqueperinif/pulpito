// Condução da Reunião: o que está no Telão e o que está tocando.
// Funções puras: recebem o estado e um comando e devolvem o novo estado
// (ou o mesmo objeto, quando o comando não muda nada).

const VOLUME_MAX = 10;

function estadoInicial(volume = 7) {
  return { reuniaoId: null, tv: { tipo: 'espera' }, tvAntesPreto: null, tvAntesAvulso: null, video: null, audio: null, volume };
}

const refValida = r => r && Number.isInteger(r.l) && Number.isInteger(r.c) && Number.isInteger(r.v);

/**
 * @param {object} e  estado atual
 * @param {object} cmd  { cmd: string, ... }
 * @param {{
 *   item(reuniaoId, itemId): object|undefined,
 *   musica(bibliotecaId): object|undefined,   música da Biblioteca (para tocar avulsa)
 *   reuniaoExiste(id): boolean,
 *   versao(e): string,                       versão da Bíblia do que está na TV
 *   existe(versao, ref): boolean,
 *   vizinho(versao, ref, delta): object|null
 * }} ctx
 */
function aplicar(e, cmd, ctx) {
  switch (cmd.cmd) {
    case 'escolherReuniao': {
      if (!ctx.reuniaoExiste(cmd.id)) return e;
      return { ...estadoInicial(e.volume), reuniaoId: cmd.id };
    }

    case 'mostrar': {
      const it = e.reuniaoId && ctx.item(e.reuniaoId, cmd.itemId);
      if (!it) return e;
      if (it.tipo === 'musica') {
        // Música não tem imagem: a TV continua com o que estava. Tocar de novo na que já toca não recomeça.
        if (e.audio && e.audio.itemId === it.id && !e.audio.terminou) return e;
        return { ...e, audio: novoAudio(e, it.bibliotecaId, it.id), video: e.video ? { ...e.video, tocando: false } : null };
      }
      const jaNaTv = e.tv.tipo === 'item' && e.tv.itemId === it.id;
      // Toque repetido no que já está na TV não faz nada (um vídeo não recomeça,
      // um versículo não volta para o começo).
      if (jaNaTv) return e;
      const inicio = (e.video?.inicio ?? 0) + 1;
      let tv = { tipo: 'item', itemId: it.id };
      if (it.tipo === 'palavra') {
        // A Palavra começa na primeira passagem preparada.
        const p = it.passagens[0];
        if (!p) return e;
        tv = { tipo: 'item', itemId: it.id, passagemId: p.id, ref: { ...p.ref } };
      }
      if (it.tipo === 'pregacao') tv = { tipo: 'item', itemId: it.id, slide: 0 };
      return {
        ...e,
        tv,
        tvAntesPreto: null,
        tvAntesAvulso: null,
        audio: null, // outra coisa foi para a TV: a música para
        video: it.tipo === 'video'
          ? { itemId: it.id, tocando: true, t: 0, dur: null, terminou: false, inicio }
          : null,
      };
    }

    case 'mostrarPassagem': {
      // Dentro da Palavra: pula para uma das passagens preparadas (sempre no começo dela).
      const it = e.reuniaoId && ctx.item(e.reuniaoId, cmd.itemId);
      const p = it && it.tipo === 'palavra' && it.passagens.find(x => x.id === cmd.passagemId);
      if (!p) return e;
      return {
        ...e,
        tv: { tipo: 'item', itemId: it.id, passagemId: p.id, ref: { ...p.ref } },
        tvAntesPreto: null,
        tvAntesAvulso: null,
        video: null,
        audio: null,
      };
    }

    case 'mostrarVersiculo': {
      // Versículo avulso: escolhido na hora, por cima da reunião.
      const ref = cmd.ref && { l: Number(cmd.ref.l), c: Number(cmd.ref.c), v: Number(cmd.ref.v) };
      if (!refValida(ref)) return e;
      const versao = ctx.versao({ ...e, tv: { tipo: 'avulso', ref } });
      if (!ctx.existe(versao, ref)) return e;
      let antes = e.tvAntesAvulso;
      if (e.tv.tipo !== 'avulso') antes = e.tv.tipo === 'preto' ? (e.tvAntesPreto ?? { tipo: 'espera' }) : e.tv;
      return {
        ...e,
        tv: { tipo: 'avulso', ref },
        tvAntesAvulso: antes,
        tvAntesPreto: null,
        video: e.video ? { ...e.video, tocando: false } : null,
      };
    }

    case 'passoVersiculo': {
      // ◀ ▶ livres: valem para o avulso e para o versículo planejado.
      if (!e.tv.ref) return e;
      const prox = ctx.vizinho(ctx.versao(e), e.tv.ref, Number(cmd.delta) || 0);
      if (!prox) return e;
      return { ...e, tv: { ...e.tv, ref: prox } };
    }

    case 'irVersiculo': {
      // Pula para outro versículo (outro número, capítulo ou livro) sem sair da Palavra (ou do avulso).
      // Sem l/c, fica no mesmo livro e capítulo.
      if (!e.tv.ref) return e;
      const ref = { l: cmd.l ?? e.tv.ref.l, c: cmd.c ?? e.tv.ref.c, v: cmd.v ?? 1 };
      for (const k of ['l', 'c', 'v']) ref[k] = Number(ref[k]);
      const igual = ref.l === e.tv.ref.l && ref.c === e.tv.ref.c && ref.v === e.tv.ref.v;
      if (igual || !refValida(ref) || !ctx.existe(ctx.versao(e), ref)) return e;
      return { ...e, tv: { ...e.tv, ref } };
    }

    case 'voltarReuniao': {
      if (e.tv.tipo !== 'avulso') return e;
      return { ...e, tv: e.tvAntesAvulso ?? { tipo: 'espera' }, tvAntesAvulso: null };
    }

    case 'passoSlide':
    case 'irSlide': {
      // Pregação: ◀ ▶ ou tocar na miniatura. Para na primeira e na última imagem.
      const it = e.tv.tipo === 'item' && ctx.item(e.reuniaoId, e.tv.itemId);
      if (!it || it.tipo !== 'pregacao') return e;
      const alvo = cmd.cmd === 'irSlide' ? Number(cmd.n) : e.tv.slide + (Number(cmd.delta) || 0);
      if (!Number.isInteger(alvo) || alvo < 0 || alvo >= it.arquivos.length || alvo === e.tv.slide) return e;
      return { ...e, tv: { ...e.tv, slide: alvo } };
    }

    case 'tocarMusica': {
      // Música avulsa: qualquer música da Biblioteca, escolhida na hora.
      const m = ctx.musica(cmd.bibliotecaId);
      if (!m) return e;
      if (e.audio && e.audio.bibliotecaId === m.id && !e.audio.itemId && !e.audio.terminou) return e;
      return { ...e, audio: novoAudio(e, m.id, null), video: e.video ? { ...e.video, tocando: false } : null };
    }

    case 'audioPausar': {
      if (!e.audio || !e.audio.tocando) return e;
      return { ...e, audio: { ...e.audio, tocando: false } };
    }

    case 'audioContinuar': {
      if (!e.audio || e.audio.tocando) return e;
      if (e.audio.terminou) return { ...e, audio: { ...e.audio, tocando: true, terminou: false, t: 0, inicio: e.audio.inicio + 1 } };
      return { ...e, audio: { ...e.audio, tocando: true } };
    }

    case 'audioParar':
      return e.audio ? { ...e, audio: null } : e;

    case 'audioProgresso': {
      if (!e.audio || cmd.inicio !== e.audio.inicio) return e;
      const terminou = !!cmd.terminou;
      return {
        ...e,
        audio: { ...e.audio, t: Number(cmd.t) || 0, dur: Number(cmd.dur) || e.audio.dur, terminou, tocando: terminou ? false : e.audio.tocando },
      };
    }

    case 'apagar': {
      if (e.tv.tipo === 'preto') return { ...e, tv: e.tvAntesPreto ?? { tipo: 'espera' }, tvAntesPreto: null };
      return { ...e, tvAntesPreto: e.tv, tv: { tipo: 'preto' } };
    }

    case 'videoPausar': {
      if (!e.video || !e.video.tocando) return e;
      return { ...e, video: { ...e.video, tocando: false } };
    }

    case 'videoContinuar': {
      if (!e.video || e.video.tocando) return e;
      if (e.video.terminou) {
        return { ...e, video: { ...e.video, tocando: true, terminou: false, t: 0, inicio: e.video.inicio + 1 } };
      }
      return { ...e, video: { ...e.video, tocando: true } };
    }

    case 'videoProgresso': {
      // Enviado pelo Telão enquanto o vídeo passa.
      if (!e.video || cmd.inicio !== e.video.inicio) return e;
      const terminou = !!cmd.terminou;
      return {
        ...e,
        video: {
          ...e.video,
          t: Number(cmd.t) || 0,
          dur: Number(cmd.dur) || e.video.dur,
          terminou,
          tocando: terminou ? false : e.video.tocando,
        },
      };
    }

    case 'volume': {
      const v = Math.max(0, Math.min(VOLUME_MAX, e.volume + (Number(cmd.delta) || 0)));
      return v === e.volume ? e : { ...e, volume: v };
    }

    case 'encerrar':
      return estadoInicial(e.volume);

    default:
      return e;
  }
}

function novoAudio(e, bibliotecaId, itemId) {
  return { bibliotecaId, itemId, tocando: true, t: 0, dur: null, terminou: false, inicio: (e.audio?.inicio ?? 0) + 1 };
}

module.exports = { estadoInicial, aplicar, VOLUME_MAX };
