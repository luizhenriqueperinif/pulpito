// Dados guardados no Notebook: reuniões, configuração e os arquivos (pasta "midia").
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EXT_IMAGEM = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
const EXT_VIDEO = ['mp4', 'm4v', 'mov', 'webm', 'mkv'];

function tipoDoArquivo(nome) {
  const ext = path.extname(nome).slice(1).toLowerCase();
  if (EXT_IMAGEM.includes(ext)) return 'imagem';
  if (EXT_VIDEO.includes(ext)) return 'video';
  return null;
}

function tituloDoArquivo(nome) {
  return path.basename(nome, path.extname(nome)).replace(/[_]+/g, ' ').trim();
}

function agora() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return { data: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hora: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

class Dados {
  constructor(pasta) {
    this.pasta = pasta;
    this.arquivo = path.join(pasta, 'dados.json');
    this.pastaMidia = path.join(pasta, 'midia');
    fs.mkdirSync(this.pastaMidia, { recursive: true });
    this.d = this._carregar();
  }

  _carregar() {
    try {
      return JSON.parse(fs.readFileSync(this.arquivo, 'utf8'));
    } catch {
      const novo = {
        versao: 1,
        config: { token: crypto.randomBytes(16).toString('hex'), porta: 7420, telaEspera: null },
        reunioes: [],
      };
      this.d = novo;
      this.salvar();
      return novo;
    }
  }

  salvar() {
    const tmp = this.arquivo + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.d, null, 2));
    fs.renameSync(tmp, this.arquivo);
  }

  get config() { return this.d.config; }
  get reunioes() { return this.d.reunioes; }
  reuniao(id) { return this.d.reunioes.find(r => r.id === id); }
  item(reuniaoId, itemId) { return this.reuniao(reuniaoId)?.itens.find(i => i.id === itemId); }

  _copiarParaMidia(origem) {
    const nome = crypto.randomUUID() + path.extname(origem).toLowerCase();
    fs.copyFileSync(origem, path.join(this.pastaMidia, nome));
    return nome;
  }

  /** Cria uma Reunião a partir de arquivos, na ordem do nome (a ordem em que o WhatsApp salvou). */
  criarReuniao(nome, caminhos) {
    const aceitos = caminhos
      .filter(c => tipoDoArquivo(c))
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'pt-BR', { numeric: true }));
    const itens = aceitos.map(c => ({
      id: crypto.randomUUID(),
      tipo: tipoDoArquivo(c),
      titulo: tituloDoArquivo(c),
      arquivo: this._copiarParaMidia(c),
    }));
    const { data, hora } = agora();
    const r = { id: crypto.randomUUID(), nome, data, hora, itens };
    this.d.reunioes.push(r);
    this.salvar();
    return { reuniao: r, ignorados: caminhos.length - aceitos.length };
  }

  removerReuniao(id) {
    const r = this.reuniao(id);
    if (!r) return;
    this.d.reunioes = this.d.reunioes.filter(x => x.id !== id);
    const emUso = new Set(this.d.reunioes.flatMap(x => x.itens.map(i => i.arquivo)));
    for (const it of r.itens) {
      if (!emUso.has(it.arquivo)) fs.rmSync(path.join(this.pastaMidia, it.arquivo), { force: true });
    }
    this.salvar();
  }

  trocarTelaEspera(origem) {
    const antiga = this.d.config.telaEspera;
    this.d.config.telaEspera = this._copiarParaMidia(origem);
    this.salvar();
    if (antiga) fs.rmSync(path.join(this.pastaMidia, antiga), { force: true });
  }
}

module.exports = { Dados, tipoDoArquivo, tituloDoArquivo, EXT_IMAGEM, EXT_VIDEO };
