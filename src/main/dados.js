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
const VERSOES = ['ACF', 'ARC', 'NVI'];
/** Fundos de versículo que já vêm no programa (desenhados em src/web/comum/versiculo.js; as fotos ficam em src/web/comum/fundos). */
const FUNDOS_PRONTOS = ['ceu', 'amanhecer', 'trigo', 'noite', 'oceano', 'pergaminho', 'vinho', 'floresta',
  'amanhecer-dourado',
  'biblia-aberta',
  'biblia-luz',
  'deserto-judeia',
  'cruz-paisagem',
  'paisagem',
  'getsemani',
  'mar-galileia',
  'monte-oliveiras',
  'monte-sinai',
  'rio-jordao',
  'vale-jezreel',
];
/**
 * Fotos de fundo que estavam na Biblioteca e passaram a vir no programa (marca do arquivo -> id).
 * Quem já tinha a foto na Biblioteca passa a usar a do programa, sem ficar repetida.
 */
const FUNDOS_QUE_VIRARAM_PRONTOS = {
  'd0b070102159d84930e6c0ffd5f90efd336e325d': 'amanhecer-dourado',
  '688a20ccbbf334eef0b5add9151e81e6c1dce576': 'biblia-aberta',
  '826ae1b4bc58716e91a5683378bec66f2f00a5d3': 'biblia-luz',
  '8a7a445460b8bf789f9082c05fab0317ad30e743': 'deserto-judeia',
  '2536872a4d1c3c3821caeaa129a5e52909414f2d': 'cruz-paisagem',
  'cbb74207d8d053b34ae4dd30f2b38e71690fa0e9': 'paisagem',
  '96779ad573d26434ba9de180bd2f8d727387a092': 'getsemani',
  '2416bf8ff6ef6ca47ce55e1f0a7ed4dfe98abe47': 'mar-galileia',
  '551576b28437e42d85c9b44c478dd391608c8da8': 'monte-oliveiras',
  'ef112609f5bd54f572f1801df1061ddab8c65ddc': 'monte-sinai',
  '9d3111de704f72b264a4788e1d2147a2c43c3c02': 'rio-jordao',
  '715e04710331353d560d556907c4644f12728adb': 'vale-jezreel',
};
const FUNDO_PADRAO = 'ceu';
/** Fundos do programa que são fotos (servem também de tela de espera). */
const FOTOS_PRONTAS = new Set(FUNDOS_PRONTOS.slice(8));

/**
 * "Impressão digital" do arquivo: tamanho + começo + fim do conteúdo.
 * O mesmo arquivo com outro nome (reenviado pelo WhatsApp) dá a mesma marca.
 * Lê só 2 MB, então é rápido até para vídeo grande.
 */
const PEDACO = 1024 * 1024;
function marcaDoArquivo(caminho) {
  const tam = fs.statSync(caminho).size;
  const h = crypto.createHash('sha1').update(String(tam));
  const fd = fs.openSync(caminho, 'r');
  try {
    const ler = (pos, n) => { const b = Buffer.alloc(n); const lidos = fs.readSync(fd, b, 0, n, pos); h.update(b.subarray(0, lidos)); };
    ler(0, Math.min(PEDACO, tam));
    if (tam > PEDACO) ler(Math.max(PEDACO, tam - PEDACO), Math.min(PEDACO, tam - PEDACO));
  } finally { fs.closeSync(fd); }
  return h.digest('hex');
}
/** Marca da pregação: as marcas das imagens, na ordem. */
const marcaDaPregacao = marcas => crypto.createHash('sha1').update(marcas.join('|')).digest('hex');

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
    this.d = d;
    this._fundosQueViraramProntos();
    return d;
  }

  /** Tira da Biblioteca as fotos de fundo que agora já vêm no programa; as reuniões passam a usar a do programa. */
  _fundosQueViraramProntos() {
    let mudou = false;
    for (const b of this.d.biblioteca.filter(x => x.tipo === 'fundo')) {
      const caminho = path.join(this.pastaMidia, b.arquivo);
      let marca = b.marca;
      if (!marca) { try { marca = marcaDoArquivo(caminho); } catch { continue; } }
      const pronto = FUNDOS_QUE_VIRARAM_PRONTOS[marca];
      if (!pronto) continue;
      for (const r of this.d.reunioes) if (r.fundo === b.id) r.fundo = pronto;
      this.d.biblioteca = this.d.biblioteca.filter(x => x.id !== b.id);
      try { fs.unlinkSync(caminho); } catch {}
      mudou = true;
    }
    if (mudou) this.salvar();
  }

  /**
   * Grava em um arquivo temporário e troca pelo de verdade (se a energia cair no meio, o antigo fica inteiro).
   * No Windows, antivírus ou backup às vezes seguram o arquivo por um instante: tenta de novo e,
   * se não der, grava direto. Nunca deixa um erro de gravação parar a reunião.
   */
  salvar() {
    const json = JSON.stringify(this.d, null, 2);
    const tmp = this.arquivo + '.tmp';
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      try {
        fs.writeFileSync(tmp, json);
        fs.renameSync(tmp, this.arquivo);
        return;
      } catch (e) {
        this.ultimoErroAoSalvar = e;
        const ate = Date.now() + 40 * (tentativa + 1);
        while (Date.now() < ate) { /* espera um pouquinho */ }
      }
    }
    try { fs.writeFileSync(this.arquivo, json); } catch (e) { this.ultimoErroAoSalvar = e; console.error('Não deu para salvar os dados:', e.message); }
    try { fs.unlinkSync(tmp); } catch {}
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

  /**
   * O que já está na Biblioteca, pela marca do conteúdo ("tipo|marca" → arquivo).
   * Arquivos de antes desta versão ganham a marca aqui, uma vez só.
   */
  _porMarca() {
    let calculou = false;
    const mapa = new Map();
    for (const b of this.d.biblioteca) {
      if (!b.marca) {
        try {
          b.marca = b.tipo === 'pregacao'
            ? marcaDaPregacao(b.arquivos.map(a => marcaDoArquivo(path.join(this.pastaMidia, a))))
            : marcaDoArquivo(path.join(this.pastaMidia, b.arquivo));
          calculou = true;
        } catch { continue; } // arquivo sumiu da pasta: não dá para comparar
      }
      mapa.set(b.tipo + '|' + b.marca, b);
    }
    if (calculou) this.salvar();
    return mapa;
  }

  /**
   * Copia os arquivos para a Biblioteca, na ordem do nome (a ordem em que o WhatsApp salvou).
   * Arquivo que já está na Biblioteca (mesmo conteúdo, mesmo com outro nome) não é copiado de novo:
   * volta em "repetidos" o que já estava lá.
   */
  importarArquivos(caminhos, { comoFundo = false } = {}) {
    // Fundo de versículo só pode ser imagem.
    const tipo = c => (comoFundo ? (tipoDoArquivo(c) === 'imagem' ? 'fundo' : null) : tipoDoArquivo(c));
    const aceitos = caminhos
      .filter(c => tipo(c))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'pt-BR', { numeric: true }));
    const jaTem = this._porMarca();
    const novos = [], repetidos = [];
    for (const c of aceitos) {
      const marca = marcaDoArquivo(c);
      const chave = tipo(c) + '|' + marca;
      const existente = jaTem.get(chave);
      if (existente) { if (!repetidos.includes(existente)) repetidos.push(existente); continue; }
      const nome = id() + path.extname(c).toLowerCase();
      fs.copyFileSync(c, path.join(this.pastaMidia, nome));
      const b = { id: id(), tipo: tipo(c), titulo: tituloDoArquivo(c), arquivo: nome, criadoEm: this.hoje(), marca };
      novos.push(b);
      jaTem.set(chave, b); // o mesmo arquivo duas vezes na mesma escolha também não duplica
    }
    this.d.biblioteca.push(...novos);
    this.salvar();
    return { novos, repetidos, ignorados: caminhos.length - aceitos.length };
  }

  /**
   * Pregação: várias imagens (as que o bispo mandou) guardadas juntas, na ordem do nome.
   * Fica na Biblioteca como uma coisa só.
   * manterOrdem: usa a ordem recebida (vindas do celular, na ordem em que o pastor marcou).
   */
  criarPregacao(caminhos, { titulo, manterOrdem = false } = {}) {
    const imagens = caminhos.filter(c => tipoDoArquivo(c) === 'imagem');
    if (!manterOrdem) imagens.sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'pt-BR', { numeric: true }));
    if (!imagens.length) return null;
    // A mesma pregação (mesmas imagens, na mesma ordem) já está na Biblioteca: usa a que já tem.
    const marca = marcaDaPregacao(imagens.map(marcaDoArquivo));
    const existente = this._porMarca().get('pregacao|' + marca);
    if (existente) return { pregacao: existente, ignorados: caminhos.length - imagens.length, repetida: true };
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
      marca,
    };
    this.d.biblioteca.push(b);
    this.salvar();
    return { pregacao: b, ignorados: caminhos.length - imagens.length };
  }

  // ---------- Categorias de música ("Oração forte", "Fundo de busca"...) ----------

  get categoriasMusica() { return this.d.config.categoriasMusica || (this.d.config.categoriasMusica = []); }

  criarCategoria(nome) {
    nome = String(nome || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!nome) return null;
    const igual = this.categoriasMusica.find(c => c.nome.toLowerCase() === nome.toLowerCase());
    if (igual) return igual;
    const c = { id: id(), nome };
    this.categoriasMusica.push(c);
    this.salvar();
    return c;
  }

  renomearCategoria(cid, nome) {
    const c = this.categoriasMusica.find(x => x.id === cid);
    nome = String(nome || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!c || !nome) return;
    c.nome = nome;
    this.salvar();
  }

  /** Apaga só a categoria: as músicas continuam na Biblioteca, sem categoria. */
  removerCategoria(cid) {
    this.d.config.categoriasMusica = this.categoriasMusica.filter(c => c.id !== cid);
    for (const b of this.d.biblioteca) if (b.categoria === cid) delete b.categoria;
    this.salvar();
  }

  /** Põe a música numa categoria (ou tira, com cid vazio). */
  definirCategoria(bid, cid) {
    const b = this.arquivoDaBiblioteca(bid);
    if (!b || b.tipo !== 'musica') return;
    if (cid && this.categoriasMusica.some(c => c.id === cid)) b.categoria = cid; else delete b.categoria;
    this.salvar();
  }

  /** Marca (ou desmarca) um vídeo ou imagem para aparecer na escolha da tela de espera. */
  marcarParaEspera(bid, sim) {
    const b = this.arquivoDaBiblioteca(bid);
    if (!b || !['video', 'imagem', 'fundo'].includes(b.tipo)) return;
    if (sim) b.espera = true; else delete b.espera;
    this.salvar();
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
    return this.d.reunioes.filter(r => r.fundo === bid || r.telaEspera === bid || r.musicaEspera === bid || r.itens.some(i => i.bibliotecaId === bid)).length;
  }

  /** Apaga o arquivo e o tira das reuniões que o usam. */
  removerDaBiblioteca(bid) {
    const b = this.arquivoDaBiblioteca(bid);
    if (!b) return;
    this.d.biblioteca = this.d.biblioteca.filter(x => x.id !== bid);
    for (const r of this.d.reunioes) {
      r.itens = r.itens.filter(i => i.bibliotecaId !== bid);
      if (r.fundo === bid) r.fundo = null;
      if (r.telaEspera === bid) r.telaEspera = null;
      if (r.musicaEspera === bid) r.musicaEspera = null;
    }
    if (this.d.config.musicaEspera === bid) this.d.config.musicaEspera = null;
    for (const a of [...(b.arquivos || [b.arquivo]), b.capa].filter(Boolean)) fs.rmSync(path.join(this.pastaMidia, a), { force: true });
    this.salvar();
  }

  // ---------- Imagem dos vídeos: o último quadro, o mesmo que fica parado na TV quando o vídeo acaba ----------

  /** Vídeos que ainda não têm a imagem (ou têm a de antes, que não era do fim). O programa tira sozinho. */
  videosSemCapa() {
    return this.d.biblioteca.filter(b => b.tipo === 'video' && (!b.capa || b.capaDe !== 'fim'));
  }

  salvarCapaAutomatica(bid, jpg) {
    const b = this.arquivoDaBiblioteca(bid);
    if (!b || b.tipo !== 'video') return false;
    const antiga = b.capa;
    b.capa = 'capa-' + id() + '.jpg';
    b.capaDe = 'fim';
    delete b.capaEscolhida;
    fs.writeFileSync(path.join(this.pastaMidia, b.capa), jpg);
    this.salvar();
    if (antiga) fs.rmSync(path.join(this.pastaMidia, antiga), { force: true });
    return true;
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
      r.telaEspera = origem.telaEspera || null;
      r.musicaEspera = origem.musicaEspera || null;
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
    if ('telaEspera' in campos) r.telaEspera = campos.telaEspera || null;
    if ('musicaEspera' in campos) r.musicaEspera = campos.musicaEspera || null;  // null = a padrão; 'nenhuma' = sem música
    this.salvar();
  }

  /**
   * Versículo preparado. A reunião pode ter várias Palavras (a do dízimo, a da família...),
   * cada uma num lugar da reunião. Com palavraId entra nessa Palavra; sem, vira uma Palavra nova no fim.
   * nome: o que aparece no cartão ("Palavra do dízimo"). Vazio = "Palavra".
   * @param {{ ref: {l,c,v}, ate?: number, versao?: 'ACF'|'ARC'|'NVI'|null, palavraId?: string, nome?: string }} v
   * @returns a passagem criada
   */
  adicionarVersiculo(rid, { ref, ate, versao, palavraId, nome }) {
    const r = this.reuniao(rid);
    if (!r || !ref) return null;
    let palavra = palavraId && r.itens.find(i => i.id === palavraId && i.tipo === 'palavra');
    if (!palavra) { palavra = { id: id(), tipo: 'palavra', passagens: [] }; r.itens.push(palavra); }
    if (nome !== undefined) palavra.nome = nomeDaPalavra(nome);
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

  /** Muda o nome do cartão da Palavra ("Palavra do dízimo"). */
  renomearPalavra(rid, itemId, nome) {
    const pal = this.reuniao(rid)?.itens.find(i => i.id === itemId && i.tipo === 'palavra');
    if (!pal) return;
    pal.nome = nomeDaPalavra(nome);
    this.salvar();
  }

  /** A Palavra que tem essa passagem. */
  _palavra(rid, passagemId) {
    return this.reuniao(rid)?.itens.find(i => i.tipo === 'palavra' && i.passagens.some(p => p.id === passagemId));
  }

  moverPassagem(rid, passagemId, delta) {
    const pal = this._palavra(rid, passagemId);
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
    const pal = this._palavra(rid, passagemId);
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

  /** semRepetir: não coloca de novo o que a reunião já tem (usado ao importar arquivos repetidos). */
  adicionarItens(rid, bibliotecaIds, { semRepetir = false } = {}) {
    const r = this.reuniao(rid);
    if (!r) return;
    for (const bid of bibliotecaIds) {
      if (semRepetir && r.itens.some(i => i.bibliotecaId === bid)) continue;
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
      return { id: it.id, tipo: 'palavra', titulo: it.nome || 'Palavra', nome: it.nome || null, passagens };
    }
    const b = this.arquivoDaBiblioteca(it.bibliotecaId);
    if (!b) return null;
    const r = { id: it.id, bibliotecaId: b.id, tipo: b.tipo, titulo: b.titulo, arquivo: b.arquivo };
    if (b.capa) r.capa = b.capa;
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
      fundoId: this.fundoVale(r.fundo) ? r.fundo : this.fundoPadrao(),
      telaEsperaId: r.telaEspera || null,
      telaEspera: this.telaEspera(r.id),
      musicaEsperaId: r.musicaEspera || null,
      musicaEspera: this.musicaEspera(r.id),
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
    return { pronto: this.fundoVale(fid) && FUNDOS_PRONTOS.includes(fid) ? fid : this.fundoPadrao() };
  }

  // ---------- Fundos do programa que vocês tiraram da lista ----------
  get fundosEscondidos() { return this.d.config.fundosEscondidos || []; }

  /** O fundo existe e não foi tirado (um do programa ou uma imagem da Biblioteca). */
  fundoVale(fid) {
    if (!fid) return false;
    if (FUNDOS_PRONTOS.includes(fid)) return !this.fundosEscondidos.includes(fid);
    return !!this.arquivoDaBiblioteca(fid);
  }

  /** O padrão é o Céu; se tiraram ele, o primeiro que sobrou. */
  fundoPadrao() {
    return FUNDOS_PRONTOS.find(f => !this.fundosEscondidos.includes(f)) || FUNDO_PADRAO;
  }

  /** Tira um fundo do programa da lista (o arquivo continua no programa; dá para trazer de volta). */
  esconderFundo(fid) {
    if (!FUNDOS_PRONTOS.includes(fid) || this.fundosEscondidos.includes(fid)) return false;
    this.d.config.fundosEscondidos = [...this.fundosEscondidos, fid];
    for (const r of this.d.reunioes) if (r.fundo === fid) r.fundo = null;
    this.salvar();
    return true;
  }

  /** Fotos do programa tiradas da escolha da Tela de espera (dá para trazer de volta). */
  get esperasEscondidas() { return this.d.config.esperasEscondidas || []; }

  esconderEsperaDoPrograma(fid) {
    if (!FOTOS_PRONTAS.has(fid) || this.esperasEscondidas.includes(fid)) return false;
    this.d.config.esperasEscondidas = [...this.esperasEscondidas, fid];
    for (const r of this.d.reunioes) if (r.telaEspera === fid) r.telaEspera = null;
    this.salvar();
    return true;
  }

  mostrarEsperasDoPrograma() {
    this.d.config.esperasEscondidas = [];
    this.salvar();
  }

  mostrarFundosDoPrograma() {
    this.d.config.fundosEscondidos = [];
    this.salvar();
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

  /**
   * O que a TV mostra quando nada está passando:
   * a escolhida na reunião (imagem da Biblioteca ou foto do programa) ou, se não tiver, a padrão
   * (a imagem de Configurações ou, sem ela, a do programa: null).
   */
  telaEspera(rid) {
    const r = rid && this.reuniao(rid);
    const escolhida = r && r.telaEspera;
    if (escolhida) {
      const b = this.arquivoDaBiblioteca(escolhida);
      if (b && (b.tipo === 'imagem' || b.tipo === 'fundo')) return { arquivo: b.arquivo, daReuniao: true };
      // Vídeo: passa sem som e em repetição (o som da chegada é a música da espera).
      if (b && b.tipo === 'video') return { arquivo: b.arquivo, video: true, capa: b.capa || null, daReuniao: true };
      if (FUNDOS_PRONTOS.includes(escolhida) && FOTOS_PRONTAS.has(escolhida)) return { foto: '/comum/fundos/' + escolhida + '.jpg', daReuniao: true };
    }
    const padrao = this.d.config.telaEspera;
    if (!padrao) return null;
    return EXT_VIDEO.includes(path.extname(padrao).slice(1).toLowerCase()) ? { arquivo: padrao, video: true } : { arquivo: padrao };
  }

  /** Música que toca na tela de espera ao abrir a reunião: a da reunião, senão a padrão; 'nenhuma' = sem música. */
  musicaEspera(rid) {
    const r = rid && this.reuniao(rid);
    const ehMusica = bid => { const b = bid && this.arquivoDaBiblioteca(bid); return !!(b && b.tipo === 'musica'); };
    if (r && r.musicaEspera === 'nenhuma') return null;
    if (r && ehMusica(r.musicaEspera)) return r.musicaEspera;
    return ehMusica(this.d.config.musicaEspera) ? this.d.config.musicaEspera : null;
  }

  definirMusicaEsperaPadrao(bid) {
    const b = bid && this.arquivoDaBiblioteca(bid);
    if (bid && !(b && b.tipo === 'musica')) return;
    this.d.config.musicaEspera = bid || null;
    this.salvar();
  }

  voltarTelaEsperaDoPrograma() {
    const antiga = this.d.config.telaEspera;
    this.d.config.telaEspera = null;
    this.salvar();
    if (antiga) fs.rmSync(path.join(this.pastaMidia, antiga), { force: true });
  }

  trocarTelaEspera(origem) {
    const antiga = this.d.config.telaEspera;
    const nome = id() + path.extname(origem).toLowerCase();
    fs.copyFileSync(origem, path.join(this.pastaMidia, nome));
    this.d.config.telaEspera = nome;
    this.salvar();
    if (antiga) fs.rmSync(path.join(this.pastaMidia, antiga), { force: true });
  }
}

/** Nome do cartão da Palavra: sem espaços sobrando, curto; vazio = sem nome (aparece "Palavra"). */
function nomeDaPalavra(nome) {
  return String(nome || '').replace(/\s+/g, ' ').trim().slice(0, 40) || null;
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
