// Dados guardados no Notebook: Pastores, Biblioteca (arquivos), Reuniões e configuração.
// Uma Reunião só aponta para os arquivos da Biblioteca; apagar a Reunião não apaga os arquivos.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EXT_IMAGEM = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
const EXT_VIDEO = ['mp4', 'm4v', 'mov', 'webm', 'mkv'];
/** Tipos que "Copiar reunião" leva junto (fotos e vídeos são da semana e não vêm). */
const TIPOS_QUE_SE_REPETEM = ['musica', 'versiculo'];
/** Tipos que "Apagar antigos" pode limpar. Músicas e Fundos nunca são apagados por ele. */
const TIPOS_DA_SEMANA = ['imagem', 'video', 'pregacao'];
const DIAS_PARA_ANTIGO = 7;
const VERSOES = ['ACF', 'NVI'];

function tipoDoArquivo(nome) {
  const ext = path.extname(nome).slice(1).toLowerCase();
  if (EXT_IMAGEM.includes(ext)) return 'imagem';
  if (EXT_VIDEO.includes(ext)) return 'video';
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
    return d;
  }

  salvar() {
    const tmp = this.arquivo + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.d, null, 2));
    fs.renameSync(tmp, this.arquivo);
  }

  get config() { return this.d.config; }

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
  importarArquivos(caminhos) {
    const aceitos = caminhos
      .filter(c => tipoDoArquivo(c))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'pt-BR', { numeric: true }));
    const novos = aceitos.map(c => {
      const nome = id() + path.extname(c).toLowerCase();
      fs.copyFileSync(c, path.join(this.pastaMidia, nome));
      return { id: id(), tipo: tipoDoArquivo(c), titulo: tituloDoArquivo(c), arquivo: nome, criadoEm: this.hoje() };
    });
    this.d.biblioteca.push(...novos);
    this.salvar();
    return { novos, ignorados: caminhos.length - aceitos.length };
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
    return this.d.reunioes.filter(r => r.itens.some(i => i.bibliotecaId === bid)).length;
  }

  /** Apaga o arquivo e o tira das reuniões que o usam. */
  removerDaBiblioteca(bid) {
    const b = this.arquivoDaBiblioteca(bid);
    if (!b) return;
    this.d.biblioteca = this.d.biblioteca.filter(x => x.id !== bid);
    for (const r of this.d.reunioes) r.itens = r.itens.filter(i => i.bibliotecaId !== bid);
    fs.rmSync(path.join(this.pastaMidia, b.arquivo), { force: true });
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

  criarReuniao({ pastorId, data, hora, nome, copiarDe } = {}) {
    const r = {
      id: id(),
      nome: String(nome || '').trim(),
      data: data || this.hoje(),
      hora: hora || '19:00',
      pastorId: pastorId || null,
      itens: [],
    };
    const origem = copiarDe && this.reuniao(copiarDe);
    if (origem) {
      for (const it of origem.itens) {
        const b = this.arquivoDaBiblioteca(it.bibliotecaId);
        if (b && TIPOS_QUE_SE_REPETEM.includes(b.tipo)) r.itens.push({ ...it, id: id() });
      }
      if (!r.nome) r.nome = origem.nome;
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
    const b = this.arquivoDaBiblioteca(it.bibliotecaId);
    return b ? { id: it.id, bibliotecaId: b.id, tipo: b.tipo, titulo: b.titulo, arquivo: b.arquivo } : null;
  }

  /** Reunião pronta para as telas: com o pastor e os itens resolvidos. */
  reuniaoCompleta(rid) {
    const r = this.reuniao(rid);
    if (!r) return null;
    const p = this.pastor(r.pastorId);
    return {
      ...r,
      pastor: p ? p.nome : null,
      versao: p ? p.versao : 'ACF',
      itens: r.itens.map(i => this._resolver(i)).filter(Boolean),
    };
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

module.exports = { Dados, tipoDoArquivo, tituloDoArquivo, somarDias, dataLocal, EXT_IMAGEM, EXT_VIDEO, VERSOES };
