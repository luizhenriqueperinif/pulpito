// Conta do Telegram ligada ao Altar: o pastor entra uma vez no notebook (número + código)
// e depois escolhe, pelo celular, a conversa e o vídeo. O Altar só LÊ: lista conversas,
// lista os vídeos e baixa o escolhido. Nunca manda mensagem nem mexe em nada da conta.
//
// A parte que fala com o Telegram de verdade fica em `criarAdaptadorGram` (biblioteca GramJS);
// o resto recebe um adaptador, para os testes usarem um falso.
const fs = require('fs');
const path = require('path');

const ERROS = {
  PHONE_NUMBER_INVALID: 'Esse número não parece certo. Digite com o DDD, por exemplo 35 99999-1234.',
  PHONE_NUMBER_BANNED: 'Esse número está bloqueado no Telegram.',
  PHONE_CODE_INVALID: 'Código errado. Confira no Telegram e digite de novo.',
  PHONE_CODE_EXPIRED: 'O código venceu. Toque em "Mandar outro código".',
  PASSWORD_HASH_INVALID: 'Senha errada. É a senha de duas etapas do Telegram.',
  API_ID_INVALID: 'A chave do aplicativo está errada. Confira o api_id e o api_hash no my.telegram.org.',
  API_ID_PUBLISHED_FLOOD: 'A chave do aplicativo foi bloqueada pelo Telegram. Crie outra no my.telegram.org.',
  FLOOD: 'O Telegram pediu para esperar um pouco antes de tentar de novo.',
  SEM_CONTA: 'Esse número não tem conta no Telegram.',
  REDE: 'Sem internet ou o Telegram não respondeu. Confira a internet do notebook.',
};
function mensagemDeErro(e) {
  const m = String((e && (e.errorMessage || e.message)) || '');
  if (/FLOOD/.test(m)) return ERROS.FLOOD;
  for (const k of Object.keys(ERROS)) if (m.includes(k)) return ERROS[k];
  if (/ETIMEDOUT|ENOTFOUND|ECONNREFUSED|ECONNRESET|Not connected|TIMEOUT/i.test(m)) return ERROS.REDE;
  return 'Não deu certo: ' + (m || 'erro desconhecido');
}

/** "35 99999-1234" → "+5535999991234" (sem o +55, coloca o do Brasil). */
function limparNumero(n) {
  let d = String(n || '').replace(/\D/g, '');
  if (!d) return '';
  if (String(n).trim().startsWith('+')) return '+' + d;
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length <= 11) d = '55' + d;
  return '+' + d;
}

/**
 * Título curto para a Biblioteca e os cartões da reunião: a primeira frase da legenda,
 * cortada numa palavra inteira, com "…" quando ficou faltando.
 */
function tituloCurto(t, max = 50) {
  let s = String(t || '').split('\n').map(x => x.trim()).find(Boolean) || '';
  s = s.replace(/\s+/g, ' ').trim();
  const fim = s.search(/[.!?…](\s|$)/);
  if (fim >= 12 && fim < s.length - 1) s = s.slice(0, fim + 1).trim();
  if (s.length <= max) return s;
  let corte = s.lastIndexOf(' ', max - 1);
  if (corte < max * 0.5) corte = max - 1;
  return s.slice(0, corte).replace(/[\s,;:–-]+$/, '') + '…';
}

/** Nome de arquivo seguro para o título do vídeo (vira o título na Biblioteca). */
function nomeSeguro(t) {
  return String(t || 'Vídeo do Telegram').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Vídeo do Telegram';
}

/**
 * @param {object} o
 * @param {string} o.arquivo         onde guardar a chave e a sessão (cifradas)
 * @param {string} o.pastaCache      miniaturas e vídeos baixando
 * @param {(s:string)=>Buffer} o.cifrar
 * @param {(b:Buffer)=>string} o.decifrar
 * @param {(cfg:{apiId:number,apiHash:string,sessao:string})=>object} o.criarAdaptador
 */
function criarContaTelegram({ arquivo, pastaCache, cifrar, decifrar, criarAdaptador }) {
  let salvo = { apiId: null, apiHash: '', sessao: '', nome: '', numero: '' };
  let etapa = 'semChave';         // semChave | desligado | codigo | senha | ligado
  let erro = '';
  let ad = null;                  // adaptador conectado
  let pedido = null;              // { numero, hash } enquanto espera o código
  let conversasCache = null;      // { quando, lista, entidades: Map }
  let buscandoConversas = null;   // busca em andamento (dois pedidos juntos esperam a mesma)
  const aoMudar = new Set();

  try {
    if (fs.existsSync(arquivo)) salvo = { ...salvo, ...JSON.parse(decifrar(fs.readFileSync(arquivo))) };
  } catch { /* arquivo estragado: começa do zero */ }
  if (salvo.apiId && salvo.apiHash) etapa = salvo.sessao ? 'ligado' : 'desligado';

  function gravar() {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, cifrar(JSON.stringify(salvo)));
  }
  function mudar(nova, msgErro = '') {
    etapa = nova; erro = msgErro;
    for (const f of aoMudar) { try { f(); } catch {} }
  }
  async function adaptador() {
    if (ad) return ad;
    const a = criarAdaptador({ apiId: Number(salvo.apiId), apiHash: salvo.apiHash, sessao: salvo.sessao });
    await a.conectar();
    ad = a;
    return ad;
  }
  async function largar() {
    const a = ad; ad = null; conversasCache = null;
    if (a) { try { await a.desconectar(); } catch {} }
  }

  const conta = {
    estado: () => ({ etapa, erro, nome: salvo.nome, numero: salvo.numero, temChave: !!(salvo.apiId && salvo.apiHash) }),
    aoMudar: f => { aoMudar.add(f); return () => aoMudar.delete(f); },

    /** Na abertura do programa: confere se a sessão guardada ainda vale. */
    async iniciar() {
      if (etapa !== 'ligado') return;
      try {
        const a = await adaptador();
        if (!(await a.autorizado())) { salvo.sessao = ''; gravar(); await largar(); mudar('desligado', 'O Telegram foi desligado (pelo celular ou por tempo). Entre de novo.'); }
        else conta.preCarregar();
      } catch (e) { erro = mensagemDeErro(e); await largar(); }
    },

    definirChave(apiId, apiHash) {
      const id = Number(String(apiId || '').trim());
      const hash = String(apiHash || '').trim();
      if (!Number.isInteger(id) || id <= 0) return mudar(etapa, 'O api_id é só número (por exemplo 1234567).');
      if (!/^[0-9a-f]{32}$/i.test(hash)) return mudar(etapa, 'O api_hash tem 32 letras e números. Copie de novo do my.telegram.org.');
      salvo = { ...salvo, apiId: id, apiHash: hash, sessao: '' };
      gravar(); largar();
      mudar('desligado');
    },

    async enviarNumero(numero) {
      const n = limparNumero(numero);
      if (n.length < 12) return mudar('desligado', 'Digite o número com DDD, por exemplo 35 99999-1234.');
      try {
        await largar(); salvo.sessao = '';
        const a = await adaptador();
        pedido = { numero: n, hash: await a.mandarCodigo(n) };
        salvo.numero = n;
        mudar('codigo');
      } catch (e) { await largar(); mudar('desligado', mensagemDeErro(e)); }
    },

    async enviarCodigo(codigo) {
      if (!pedido || !ad) return mudar('desligado', 'Comece de novo pelo número.');
      const c = String(codigo || '').replace(/\D/g, '');
      if (c.length < 5) return mudar('codigo', 'O código tem 5 números.');
      try {
        const r = await ad.entrar(pedido.numero, pedido.hash, c);
        if (r === 'senha') return mudar('senha');
        await conta._ligou();
      } catch (e) {
        const m = mensagemDeErro(e);
        if (/EXPIRED/.test(String(e && (e.errorMessage || e.message)))) { pedido = null; await largar(); return mudar('desligado', m); }
        mudar('codigo', m);
      }
    },

    async enviarSenha(senha) {
      if (!ad) return mudar('desligado', 'Comece de novo pelo número.');
      try { await ad.entrarComSenha(String(senha || '')); await conta._ligou(); }
      catch (e) { mudar('senha', mensagemDeErro(e)); }
    },

    async _ligou() {
      pedido = null;
      salvo.sessao = ad.sessao();
      try { salvo.nome = await ad.nome(); } catch {}
      gravar();
      mudar('ligado');
      conta.preCarregar();
    },

    /** Começar de novo pelo número (código não chegou, número errado). */
    async voltar() { pedido = null; await largar(); mudar(salvo.apiId ? 'desligado' : 'semChave'); },

    /** Sai da conta: o notebook deixa de ter acesso (some de "Dispositivos" no Telegram). */
    async sair() {
      try { if (salvo.sessao) { const a = await adaptador(); await a.sair(); } } catch {}
      await largar();
      salvo = { ...salvo, sessao: '', nome: '', numero: '' };
      gravar();
      try { fs.rmSync(pastaCache, { recursive: true, force: true }); } catch {}
      mudar(salvo.apiId ? 'desligado' : 'semChave');
    },

    /** Esquece também a chave do aplicativo. */
    async esquecerTudo() {
      await conta.sair();
      salvo = { apiId: null, apiHash: '', sessao: '', nome: '', numero: '' };
      try { fs.rmSync(arquivo, { force: true }); } catch {}
      mudar('semChave');
    },

    ligada: () => etapa === 'ligado',

    /**
     * Conversas que têm vídeo, a mais recente primeiro. Responde na hora com a lista guardada
     * (e, se ela tiver mais de 1 minuto, atualiza por trás para a próxima vez).
     */
    async conversas({ forcar = false } = {}) {
      if (etapa !== 'ligado') return [];
      if (!forcar && conversasCache) {
        if (Date.now() - conversasCache.quando > 60000) conta._buscarConversas().catch(() => {});
        return conversasCache.lista;
      }
      return conta._buscarConversas();
    },

    /** Deixa a lista de conversas pronta antes de o pastor abrir (na abertura e de tempos em tempos). */
    preCarregar() { if (etapa === 'ligado') conta._buscarConversas().catch(() => {}); },

    _buscarConversas() {
      if (!buscandoConversas) buscandoConversas = conta._buscarConversasAgora().finally(() => { buscandoConversas = null; });
      return buscandoConversas;
    },

    async _buscarConversasAgora() {
      const a = await adaptador();
      const dialogos = await a.dialogos(40);
      const entidades = new Map();
      const lista = [];
      // Conta os vídeos de 10 em 10 conversas (o Telegram não gosta de muitos pedidos juntos).
      for (let i = 0; i < dialogos.length; i += 10) {
        const parte = dialogos.slice(i, i + 10);
        const qts = await Promise.all(parte.map(d => a.contarVideos(d.entidade).catch(() => 0)));
        parte.forEach((d, k) => {
          if (!qts[k]) return;
          entidades.set(String(d.id), d.entidade);
          lista.push({ id: String(d.id), nome: d.nome, tipo: d.tipo, qt: qts[k], quando: d.quando });
        });
      }
      conversasCache = { quando: Date.now(), lista, entidades };
      return lista;
    },

    async _entidade(conversaId) {
      if (!conversasCache || !conversasCache.entidades.has(String(conversaId))) await conta.conversas({ forcar: true });
      const e = conversasCache && conversasCache.entidades.get(String(conversaId));
      if (!e) throw new Error('Conversa não encontrada.');
      return e;
    },

    /** Vídeos de uma conversa, o mais novo primeiro. */
    async videos(conversaId, limite = 30) {
      const a = await adaptador();
      const lista = await a.videos(await conta._entidade(conversaId), limite);
      const pasta = path.join(pastaCache, 'miniaturas');
      return lista.map(v => ({ ...v, conversaId: String(conversaId), temMiniatura: fs.existsSync(path.join(pasta, `${conversaId}_${v.id}.jpg`)) }));
    },

    /** Caminho da miniatura do vídeo (baixa na primeira vez). null se o vídeo não tiver. */
    async miniatura(conversaId, msgId) {
      if (!/^-?\d+$/.test(String(conversaId)) || !/^\d+$/.test(String(msgId))) return null;
      const pasta = path.join(pastaCache, 'miniaturas');
      const arq = path.join(pasta, `${conversaId}_${msgId}.jpg`);
      if (fs.existsSync(arq)) return arq;
      const a = await adaptador();
      const buf = await a.miniatura(await conta._entidade(conversaId), Number(msgId));
      if (!buf || !buf.length) return null;
      fs.mkdirSync(pasta, { recursive: true });
      fs.writeFileSync(arq, buf);
      return arq;
    },

    /**
     * Baixa o vídeo para uma pasta própria e devolve o caminho do arquivo (o nome é o título do vídeo).
     * Quem chama importa para a Biblioteca e apaga a pasta depois.
     */
    async baixar(conversaId, msgId, aoProgresso = () => {}) {
      const a = await adaptador();
      const ent = await conta._entidade(conversaId);
      const info = await a.video(ent, Number(msgId));
      if (!info) throw new Error('Esse vídeo não está mais na conversa.');
      const pasta = path.join(pastaCache, 'baixando', `${conversaId}_${msgId}`);
      fs.rmSync(pasta, { recursive: true, force: true });
      fs.mkdirSync(pasta, { recursive: true });
      const arq = path.join(pasta, nomeSeguro(tituloCurto(info.titulo)) + '.' + (info.ext || 'mp4'));
      await a.baixar(ent, Number(msgId), arq, (feito, total) => aoProgresso(total ? Math.min(100, Math.floor((feito / total) * 100)) : 0));
      return { arquivo: arq, pasta, titulo: tituloCurto(info.titulo) };
    },

    async fechar() { await largar(); },
  };
  return conta;
}

/**
 * Baixa um arquivo em pedaços de 512 KB, `juntos` pedaços ao mesmo tempo, gravando cada um no lugar certo.
 * @param {{ total:number, arquivo:string, pedir:(offset:number, limite:number)=>Promise<Buffer>, aoProgresso:(feito:number,total:number)=>void, juntos?:number }} o
 */
async function baixarEmPedacos({ total, arquivo, pedir, aoProgresso = () => {}, juntos = 8 }) {
  const PEDACO = 512 * 1024;
  const partes = Math.ceil(total / PEDACO);
  const fd = fs.openSync(arquivo, 'w');
  let proxima = 0, feito = 0;
  try {
    const trabalhador = async () => {
      while (proxima < partes) {
        const i = proxima++;
        const offset = i * PEDACO;
        const buf = Buffer.from(await pedir(offset, PEDACO));
        const esperado = Math.min(PEDACO, total - offset);
        if (buf.length < esperado) throw new Error('O vídeo veio pela metade. Tente de novo.');
        fs.writeSync(fd, buf, 0, esperado, offset);
        feito += esperado;
        aoProgresso(feito, total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(juntos, partes) }, trabalhador));
  } finally {
    fs.closeSync(fd);
  }
}

// ---------- A parte que fala com o Telegram (GramJS) ----------
function criarAdaptadorGram({ apiId, apiHash, sessao }) {
  const bigInt = require('big-integer');
  const { TelegramClient, Api } = require('telegram');
  const { StringSession } = require('telegram/sessions');
  const { computeCheck } = require('telegram/Password');
  const { Logger } = require('telegram/extensions');
  const client = new TelegramClient(new StringSession(sessao || ''), apiId, apiHash, {
    connectionRetries: 3,
    deviceModel: 'Altar (notebook da igreja)',
    systemVersion: 'Windows',
    appVersion: '1.0.0',
    langCode: 'pt',
    baseLogger: new Logger('none'),
  });

  const tituloDe = m => {
    const doc = m.media && m.media.document;
    const nomeArq = doc && (doc.attributes || []).find(x => x.className === 'DocumentAttributeFilename');
    const legenda = String(m.message || '').split('\n').map(s => s.trim()).find(Boolean);
    if (legenda) return legenda.slice(0, 90);
    if (nomeArq && nomeArq.fileName) return nomeArq.fileName.replace(/\.[^.]+$/, '');
    const d = new Date(m.date * 1000);
    return `Vídeo de ${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };
  const infoDe = m => {
    const doc = m.media && m.media.document;
    if (!doc) return null;
    const vid = (doc.attributes || []).find(x => x.className === 'DocumentAttributeVideo');
    if (!vid) return null;
    const mime = String(doc.mimeType || '');
    const ext = /webm/.test(mime) ? 'webm' : /quicktime/.test(mime) ? 'mov' : /matroska/.test(mime) ? 'mkv' : 'mp4';
    return {
      id: m.id, titulo: tituloDe(m), duracao: Math.round(vid.duration || 0), tamanho: Number(doc.size || 0),
      quando: m.date * 1000, vertical: (vid.h || 0) > (vid.w || 0), ext, temCapa: !!(doc.thumbs && doc.thumbs.length),
    };
  };
  const filtro = () => new Api.InputMessagesFilterVideo();

  return {
    conectar: () => client.connect(),
    desconectar: () => client.disconnect(),
    autorizado: () => client.checkAuthorization(),
    sessao: () => client.session.save(),
    async mandarCodigo(numero) {
      const r = await client.sendCode({ apiId, apiHash }, numero);
      return r.phoneCodeHash;
    },
    async entrar(numero, hash, codigo) {
      try {
        const r = await client.invoke(new Api.auth.SignIn({ phoneNumber: numero, phoneCodeHash: hash, phoneCode: codigo }));
        if (r instanceof Api.auth.AuthorizationSignUpRequired) throw new Error('SEM_CONTA');
        return 'ok';
      } catch (e) {
        if (e && e.errorMessage === 'SESSION_PASSWORD_NEEDED') return 'senha';
        throw e;
      }
    },
    async entrarComSenha(senha) {
      const p = await client.invoke(new Api.account.GetPassword());
      await client.invoke(new Api.auth.CheckPassword({ password: await computeCheck(p, senha) }));
    },
    async nome() {
      const eu = await client.getMe();
      return [eu.firstName, eu.lastName].filter(Boolean).join(' ') || eu.username || '';
    },
    sair: () => client.invoke(new Api.auth.LogOut()),
    async dialogos(limite) {
      const ds = await client.getDialogs({ limit: limite, archived: false });
      return ds.filter(d => d.entity).map(d => ({
        id: String(d.id), nome: d.title || d.name || 'Conversa', entidade: d.inputEntity || d.entity,
        tipo: d.isUser ? 'pessoa' : d.isChannel && !d.isGroup ? 'canal' : 'grupo', quando: (d.date || 0) * 1000,
      }));
    },
    async contarVideos(ent) {
      const r = await client.getMessages(ent, { limit: 1, filter: filtro() });
      return r.total || r.length || 0;
    },
    async videos(ent, limite) {
      const r = await client.getMessages(ent, { limit: limite, filter: filtro() });
      return r.map(infoDe).filter(Boolean);
    },
    async video(ent, id) {
      const [m] = await client.getMessages(ent, { ids: [id] });
      return m ? infoDe(m) : null;
    },
    async miniatura(ent, id) {
      const [m] = await client.getMessages(ent, { ids: [id] });
      const doc = m && m.media && m.media.document;
      if (!doc || !doc.thumbs || !doc.thumbs.length) return null;
      // A maior miniatura de verdade (a primeira costuma ser um borrão minúsculo).
      let melhor = -1, tam = -1;
      doc.thumbs.forEach((t, i) => { const s = t.size || (t.sizes ? Math.max(...t.sizes) : 0) || (t.w || 0) * (t.h || 0); if (t.className !== 'PhotoStrippedSize' && s > tam) { tam = s; melhor = i; } });
      if (melhor < 0) return null;
      return client.downloadMedia(m, { thumb: melhor });
    },
    // Baixa vários pedaços ao mesmo tempo. O jeito normal da biblioteca pede um pedaço por vez e espera a
    // resposta; com os servidores do Telegram longe do Brasil, isso deixava o vídeo muito lento.
    async baixar(ent, id, arquivo, aoProgresso) {
      const [m] = await client.getMessages(ent, { ids: [id] });
      if (!m || !m.media) throw new Error('Esse vídeo não está mais na conversa.');
      const { utils } = require('telegram');
      const { FileMigrateError } = require('telegram/errors');
      const info = utils.getFileInfo(m.media);
      const total = Number(info.size || 0);
      if (!total) throw new Error('O vídeo não baixou. Tente de novo.');
      await baixarEmPedacos({
        total, arquivo, aoProgresso,
        pedir: (() => {
          let dc = info.dcId;
          const pedir = async (offset, limite, tentativa = 0) => {
            const sender = await client.getSender(dc);
            try {
              const r = await client.invokeWithSender(new Api.upload.GetFile({ location: info.location, offset: bigInt(offset), limit: limite, precise: false }), sender);
              return r.bytes;
            } catch (e) {
              if (e instanceof FileMigrateError) { dc = e.newDc; return pedir(offset, limite, tentativa); }
              if (tentativa < 3 && /TIMEOUT|FLOOD_WAIT|Not connected|-503/i.test(String(e.errorMessage || e.message))) {
                const s = Number(e.seconds) || 1;
                await new Promise(ok => setTimeout(ok, Math.min(s, 10) * 1000));
                return pedir(offset, limite, tentativa + 1);
              }
              throw e;
            }
          };
          return pedir;
        })(),
      });
    },
  };
}

module.exports = { criarContaTelegram, criarAdaptadorGram, baixarEmPedacos, limparNumero, nomeSeguro, tituloCurto, mensagemDeErro };
