// Dados guardados no Notebook: Pastores, Biblioteca (arquivos), Reuniões e configuração.
// Uma Reunião só aponta para os arquivos da Biblioteca; apagar a Reunião não apaga os arquivos.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const biblia = require('./biblia');

const EXT_IMAGEM = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
const EXT_VIDEO = ['mp4', 'm4v', 'mov', 'webm', 'mkv'];
const EXT_AUDIO = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac'];
/** Tipos que "Copiar reunião" leva junto (fotos e vídeos são da semana e não vêm). */
const TIPOS_QUE_SE_REPETEM = ['musica', 'palavra'];
/** Tipos que "Apagar antigos" pode limpar. Músicas e Fundos nunca são apagados por ele. */
const TIPOS_DA_SEMANA = ['imagem', 'video', 'pregacao'];
const DIAS_PARA_ANTIGO = 7;
const VERSOES = ['ACF', 'NVI'];
/** Fundos de versículo que já vêm no programa (desenhados em src/web/comum/fundos.js). */
const FUNDOS_PRONTOS = ['ceu', 'amanhecer', 'trigo', 'noite', 'oceano', 'pergaminho', 'vinho', 'floresta'];
const FUNDO_PADRAO = 'ceu';

function tipoDoArquivo(nome) {
  const ext = path.extname(nome).slice(1).toLowerCase();
  if (EXT_IMAGEM.includes(ext)) return 'imagem';
  if (EXT_VIDEO.includes(ext)) return 'video';
  if (EXT_AUDIO.includes(ext)) return 'musica';
  return null;
}

function tituloDoArquivo(nome) {
  return path.basename(nome, path.extname(nome)).replace(/[_]+/g, ' ').trim();
}

function dataLocal(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function somarDias(data, dias) {
  const [a, m, d] = data.split('-').map(Number);
  return dataLocal(new Date(a, m - 1, d + dias));
}

const id = () => crypto.randomUUID();

class Dados {
  /**
   * @param {string} pasta
   * @param {{ hoje?: () => string }} [opcoes] hoje() devolve 'AAAA-MM-DD' (trocável nos testes)
   */
  constructor(pasta, opcoes = {}) {
    this.pasta = pasta;
    this.hoje = opcoes.hoje || (() => dataLocal());
    this.arquivo = path.join(pasta, 'dados.json');
    this.pastaMidia = path.join(pasta, 'midia');
    fs.mkdirSync(this.pastaMidia, { recursive: true });
    this.d = this._carregar();
  }

  // ---------- arquivo dados.json ----------

  _carregar() {
    let d;
    try {
      d = JSON.parse(fs.readFileSync(this.arquivo, 'utf8'));
    } catch {
      d = {
        versao: 2,
        config: { token: crypto.randomBytes(16).toString('hex'), porta: 7420, telaEspera: null, telaTv: null },
        pastores: [],
        biblioteca: [],
        reunioes: [],
        recentes: {},
      };
      this.d = d;
      this.salvar();
      return d;
    }
    if (d.versao === 1) {
      d = migrarDaVersao1(d);
      this.d = d;
      this.salvar();
    }
    d.recentes ??= {};
    if (juntarVersiculosNaPalavra(d)) { this.d = d; this.salvar(); }
    return d;
  }

  salvar() {
    const tmp = this.arquivo + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.d, null, 2));
    fs.renameSync(tmp, this.arquivo);
  }

  get config() { return this.d.config; }

  // ---------- Últimos versículos usados (de cada pastor) ----------

  lembrarVersiculo(pastorId, ref) {
    const chave = pastorId || 'geral';
    const igual = x => x.l === ref.l && x.c === ref.c && x.v === ref.v;
    const lista = (this.d.recentes[chave] || []).filter(x => !igual(x));
    this.d.recentes[chave] = [{ l: ref.l, c: ref.c, v: ref.v }, ...lista].slice(0, 6);
    this.salvar();
  }

  recentes(pastorId) {
    return this.d.recentes[pastorId || 'geral'] || [];
  }

  // ---------- Pastores ----------

  get pastores() { return this.d.pastores; }
  pastor(pid) { return this.d.pastores.find(p => p.id === pid); }

  salvarPastor({ id: pid, nome, versao }) {
    nome = String(nome || '').trim();
    if (!nome) throw new Error('O nome do pastor está vazio.');
    if (!VERSOES.includes(versao)) versao = 'ACF';
    let p = pid && this.pastor(pid);
    if (p) Object.assign(p, { nome, versao });
    else { p = { id: id(), nome, versao }; this.d.pastores.push(p); }
    this.salvar();
    return p;
  }

  removerPastor(pid) {
    this.d.pastores = this.d.pastores.filter(p => p.id !== pid);
    this.salvar();
  }

  // ---------- Biblioteca ----------

  get biblioteca() { return this.d.biblioteca; }
  arquivoDaBiblioteca(bid) { return this.d.biblioteca.find(b => b.id === bid); }

  /** Copia os arquivos para a Biblioteca, na ordem do nome (a ordem em que o WhatsApp salvou). */
  importarArquivos(caminhos, { comoFundo = false } = {}) {
    // Fundo de versículo só pode ser imagem.
    const tipo = c => (comoFundo ? (tipoDoArquivo(c) === 'imagem' ? 'fundo' : null) : tipoDoArquivo(c));
    const aceitos = caminhos
      .filter(c => tipo(c))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'pt-BR', { numeric: true }));
    const novos = aceitos.map(c => {
      const nome = id() + path.extname(c).toLowerCase();
      fs.copyFileSync(c, path.join(this.pastaMidia, nome));
      return { id: id(), tipo: tipo(c), titulo: tituloDoArquivo(c), arquivo: nome, criadoEm: this.hoje() };
    });
    this.d.biblioteca.push(...novos);
    this.salvar();
    return { novos, ignorados: caminhos.length - aceitos.length };
  }

  /**
   * Pregação: várias imagens (as que o bispo mandou) guardadas juntas, na ordem do nome.
   * Fica na Biblioteca como uma coisa só.
   */
  criarPregacao(caminhos, { titulo } = {}) {
    const imagens = caminhos
      .filter(c => tipoDoArquivo(c) === 'imagem')
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'pt-BR', { numeric: true }));
    if (!imagens.length) return null;
    const arquivos = imagens.map(c => {
      const nome = id() + path.extname(c).toLowerCase();
      fs.copyFileSync(c, path.join(this.pastaMidia, nome));
      return nome;
    });
    const hoje = this.hoje();
    const b = {
      id: id(),
      tipo: 'pregacao',
      titulo: String(titulo || '').trim() || `Pregação de ${hoje.slice(8, 10)}/${hoje.slice(5, 7)}`,
      arquivo: arquivos[0],
      arquivos,
      criadoEm: hoje,
    };
    this.d.biblioteca.push(b);
    this.salvar();
    return { pregacao: b, ignorados: caminhos.length - imagens.length };
  }

  renomearArquivo(bid, titulo) {
    const b = this.arquivoDaBiblioteca(bid);
    titulo = String(titulo || '').trim();
    if (!b || !titulo) return;
    b.titulo = titulo;
    this.salvar();
  }

  /** Quantas reuniões usam este arquivo. */
  usos(bid) {
    return this.d.reunioes.filter(r => r.fundo === bid || r.itens.some(i => i.bibliotecaId === bid)).length;
  }

  /** Apaga o arquivo e o tira das reuniões que o usam. */
  removerDaBiblioteca(bid) {
    const b = this.arquivoDaBiblioteca(bid);
    if (!b) return;
    this.d.biblioteca = this.d.biblioteca.filter(x => x.id !== bid);
    for (const r of this.d.reunioes) {
      r.itens = r.itens.filter(i => i.bibliotecaId !== bid);
      if (r.fundo === bid) r.fundo = null;
    }
    for (const a of b.arquivos || [b.arquivo]) fs.rmSync(path.join(this.pastaMidia, a), { force: true });
    this.salvar();
  }

  /**
   * Arquivos da semana (imagens, vídeos, pregações) que não foram usados nos últimos 7 dias
   * e não estão em nenhuma reunião de hoje em diante.
   */
  antigos() {
    const hoje = this.hoje();
    const limite = somarDias(hoje, -DIAS_PARA_ANTIGO);
    return this.d.biblioteca.filter(b => {
      if (!TIPOS_DA_SEMANA.includes(b.tipo)) return false;
      const datas = this.d.reunioes.filter(r => r.itens.some(i => i.bibliotecaId === b.id)).map(r => r.data);
      if (datas.some(d => d >= hoje)) return false;
      const ultimoUso = [b.criadoEm, ...datas].sort().pop();
      return ultimoUso < limite;
    });
  }

  apagarAntigos() {
    const lista = this.antigos();
    for (const b of lista) this.removerDaBiblioteca(b.id);
    return lista.length;
  }

  // ---------- Reuniões ----------

  get reunioes() { return this.d.reunioes; }
  reuniao(rid) { return this.d.reunioes.find(r => r.id === rid); }

  criarReuniao({ pastorId, data, hora, nome, copiarDe, fundo } = {}) {
    const r = {
      id: id(),
      nome: String(nome || '').trim(),
      data: data || this.hoje(),
      hora: hora || '19:00',
      pastorId: pastorId || null,
      fundo: fundo || null,
      itens: [],
    };
    const origem = copiarDe && this.reuniao(copiarDe);
    if (origem) {
      for (const it of origem.itens) {
        const tipo = it.tipo || this.arquivoDaBiblioteca(it.bibliotecaId)?.tipo;
        if (!TIPOS_QUE_SE_REPETEM.includes(tipo)) continue;
        const copia = { ...structuredClone(it), id: id() };
        if (copia.passagens) copia.passagens = copia.passagens.map(p => ({ ...p, id: id() }));
        r.itens.push(copia);
      }
      if (!r.nome) r.nome = origem.nome;
      if (!r.fundo) r.fundo = origem.fundo || null;
    }
    this.d.reunioes.push(r);
    this.salvar();
    return r;
  }

  editarReuniao(rid, campos) {
    const r = this.reuniao(rid);
    if (!r) return;
    if ('nome' in campos) r.nome = String(campos.nome || '').trim();
    if (campos.data) r.data = campos.data;
    if (campos.hora) r.hora = campos.hora;
    if ('pastorId' in campos) r.pastorId = campos.pastorId || null;
    if ('fundo' in campos) r.fundo = campos.fundo || null;
    this.salvar();
  }

  /**
   * Versículo preparado: entra na Palavra da reunião (um item só, com as passagens em ordem).
   * Se a reunião ainda não tem Palavra, ela é criada no fim.
   * @param {{ ref: {l,c,v}, ate?: number, versao?: 'ACF'|'NVI'|null }} v
   * @returns a passagem criada
   */
  adicionarVersiculo(rid, { ref, ate, versao }) {
    const r = this.reuniao(rid);
    if (!r || !ref) return null;
    let palavra = r.itens.find(i => i.tipo === 'palavra');
    if (!palavra) { palavra = { id: id(), tipo: 'palavra', passagens: [] }; r.itens.push(palavra); }
    const p = {
      id: id(),
      ref: { l: Number(ref.l), c: Number(ref.c), v: Number(ref.v) },
      ate: Math.max(Number(ate) || Number(ref.v), Number(ref.v)),
      versao: VERSOES.includes(versao) ? versao : null,
    };
    palavra.passagens.push(p);
    this.salvar();
    return p;
  }

  _palavra(rid) { return this.reuniao(rid)?.itens.find(i => i.tipo === 'palavra'); }

  moverPassagem(rid, passagemId, delta) {
    const pal = this._palavra(rid);
    if (!pal) return;
    const i = pal.passagens.findIndex(p => p.id === passagemId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= pal.passagens.length) return;
    const [p] = pal.passagens.splice(i, 1);
    pal.passagens.splice(j, 0, p);
    this.salvar();
  }

  /** Tira uma passagem. Se era a última, a Palavra sai da reunião. */
  removerPassagem(rid, passagemId) {
    const r = this.reuniao(rid);
    const pal = this._palavra(rid);
    if (!pal) return;
    pal.passagens = pal.passagens.filter(p => p.id !== passagemId);
    if (!pal.passagens.length) r.itens = r.itens.filter(i => i !== pal);
    this.salvar();
  }

  /** Apaga a reunião. Os arquivos continuam na Biblioteca. */
  removerReuniao(rid) {
    this.d.reunioes = this.d.reunioes.filter(r => r.id !== rid);
    this.salvar();
  }

  adicionarItens(rid, bibliotecaIds) {
    const r = this.reuniao(rid);
    if (!r) return;
    for (const bid of bibliotecaIds) {
      if (this.arquivoDaBiblioteca(bid)) r.itens.push({ id: id(), bibliotecaId: bid });
    }
    this.salvar();
  }

  moverItem(rid, itemId, delta) {
    const r = this.reuniao(rid);
    if (!r) return;
    const i = r.itens.findIndex(x => x.id === itemId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= r.itens.length) return;
    const [item] = r.itens.splice(i, 1);
    r.itens.splice(j, 0, item);
    this.salvar();
  }

  removerItem(rid, itemId) {
    const r = this.reuniao(rid);
    if (!r) return;
    r.itens = r.itens.filter(x => x.id !== itemId);
    this.salvar();
  }

  /** Item da reunião já com tipo, título e arquivo vindos da Biblioteca. */
  item(rid, itemId) {
    const it = this.reuniao(rid)?.itens.find(i => i.id === itemId);
    return it && this._resolver(it);
  }

  _resolver(it) {
    if (it.tipo === 'palavra') {
      const passagens = it.passagens.map(p => {
        const { l, c, v } = p.ref;
        const titulo = `${biblia.nomeLivro(l)} ${c}:${v}${p.ate > v ? '-' + p.ate : ''}`;
        return { id: p.id, titulo, ref: { ...p.ref }, ate: p.ate, versao: p.versao || null };
      });
      return { id: it.id, tipo: 'palavra', titulo: 'Palavra', passagens };
    }
    const b = this.arquivoDaBiblioteca(it.bibliotecaId);
    if (!b) return null;
    const r = { id: it.id, bibliotecaId: b.id, tipo: b.tipo, titulo: b.titulo, arquivo: b.arquivo };
    if (b.arquivos) r.arquivos = [...b.arquivos];
    return r;
  }

  /** Reunião pronta para as telas: com o pastor, a versão, o fundo e os itens resolvidos. */
  reuniaoCompleta(rid) {
    const r = this.reuniao(rid);
    if (!r) return null;
    const p = this.pastor(r.pastorId);
    return {
      ...r,
      pastor: p ? p.nome : null,
      versao: p ? p.versao : 'ACF',
      fundo: this.fundo(r.fundo),
      fundoId: r.fundo || FUNDO_PADRAO,
      itens: r.itens.map(i => this._resolver(i)).filter(Boolean),
    };
  }

  /**
   * Fundo dos versículos: um dos que já vêm no programa ({ pronto: 'ceu' })
   * ou uma imagem da Biblioteca ({ arquivo }). Se sumiu, volta para o padrão.
   */
  fundo(fid) {
    const arq = fid && this.arquivoDaBiblioteca(fid);
    if (arq) return { arquivo: arq.arquivo };
    return { pronto: FUNDOS_PRONTOS.includes(fid) ? fid : FUNDO_PADRAO };
  }

  /** Lista de reuniões em ordem de dia e horário. */
  resumoReunioes() {
    return [...this.d.reunioes]
      .sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora))
      .map(r => {
        const c = this.reuniaoCompleta(r.id);
        return { id: r.id, nome: r.nome, data: r.data, hora: r.hora, pastor: c.pastor, qtd: c.itens.length };
      });
  }

  // ---------- Tela de espera ----------

  trocarTelaEspera(origem) {
    const antiga = this.d.config.telaEspera;
    const nome = id() + path.extname(origem).toLowerCase();
    fs.copyFileSync(origem, path.join(this.pastaMidia, nome));
    this.d.config.telaEspera = nome;
    this.salvar();
    if (antiga) fs.rmSync(path.join(this.pastaMidia, antiga), { force: true });
  }
}

/**
 * Antes cada versículo era um item solto na reunião. Agora todos ficam dentro
 * de um item "Palavra", no lugar onde estava o primeiro. Devolve true se mudou algo.
 */
function juntarVersiculosNaPalavra(d) {
  let mudou = false;
  for (const r of d.reunioes || []) {
    const soltos = r.itens.filter(i => i.tipo === 'versiculo');
    if (!soltos.length) continue;
    const passagens = soltos.map(x => ({ id: x.id, ref: x.ref, ate: x.ate, versao: x.versao || null }));
    const existente = r.itens.find(i => i.tipo === 'palavra');
    if (existente) existente.passagens.push(...passagens);
    else r.itens.splice(r.itens.indexOf(soltos[0]), 0, { id: id(), tipo: 'palavra', passagens });
    r.itens = r.itens.filter(i => i.tipo !== 'versiculo');
    mudou = true;
  }
  return mudou;
}

/** Versão 1 guardava os arquivos dentro de cada reunião. Agora vão para a Biblioteca. */
function migrarDaVersao1(v1) {
  const biblioteca = [];
  const reunioes = v1.reunioes.map(r => ({
    id: r.id,
    nome: r.nome || '',
    data: r.data,
    hora: r.hora,
    pastorId: null,
    itens: r.itens.map(it => {
      const b = { id: id(), tipo: it.tipo, titulo: it.titulo, arquivo: it.arquivo, criadoEm: r.data };
      biblioteca.push(b);
      return { id: it.id, bibliotecaId: b.id };
    }),
  }));
  return {
    versao: 2,
    config: { telaTv: null, ...v1.config },
    pastores: [],
    biblioteca,
    reunioes,
  };
}

module.exports = { Dados, tipoDoArquivo, tituloDoArquivo, somarDias, dataLocal, EXT_IMAGEM, EXT_VIDEO, EXT_AUDIO, VERSOES, FUNDOS_PRONTOS };
