// Condução da Reunião: o que está no Telão e o que está tocando.
// Funções puras: recebem o estado e um comando e devolvem o novo estado
// (ou o mesmo objeto, quando o comando não muda nada).

const VOLUME_MAX = 10;

function estadoInicial(volume = 7) {
  return { reuniaoId: null, tv: { tipo: 'espera' }, tvAntesPreto: null, video: null, volume };
}

/**
 * @param {object} e  estado atual
 * @param {object} cmd  { cmd: string, ... }
 * @param {{ item(reuniaoId, itemId): object|undefined, reuniaoExiste(id): boolean }} ctx
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
      const jaNaTv = e.tv.tipo === 'item' && e.tv.itemId === it.id;
      // Toque repetido no que já está na TV não faz nada (um vídeo não recomeça sem querer).
      if (jaNaTv) return e;
      const inicio = (e.video?.inicio ?? 0) + 1;
      return {
        ...e,
        tv: { tipo: 'item', itemId: it.id },
        tvAntesPreto: null,
        video: it.tipo === 'video'
          ? { itemId: it.id, tocando: true, t: 0, dur: null, terminou: false, inicio }
          : null,
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

module.exports = { estadoInicial, aplicar, VOLUME_MAX };
