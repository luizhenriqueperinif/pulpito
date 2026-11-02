const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Dados, tipoDoArquivo, somarDias } = require('../src/main/dados');

const pastaTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'auxilio-teste-'));

function arquivos(...nomes) {
  const p = pastaTemp();
  return nomes.map(n => { const c = path.join(p, n); fs.writeFileSync(c, 'x'); return c; });
}

function novo(hoje = '2026-11-08') {
  return new Dados(pastaTemp(), { hoje: () => hoje });
}

test('reconhece imagens e vídeos pelo nome do arquivo', () => {
  assert.equal(tipoDoArquivo('IMG-20261102-WA0001.jpg'), 'imagem');
  assert.equal(tipoDoArquivo('VID-20261102-WA0003.MP4'), 'video');
  assert.equal(tipoDoArquivo('documento.pdf'), null);
});

test('soma dias atravessando o mês', () => {
  assert.equal(somarDias('2026-11-02', -7), '2026-10-26');
});

test('importa para a Biblioteca na ordem do WhatsApp e ignora o que não reconhece', () => {
  const d = novo();
  const { novos, ignorados } = d.importarArquivos(arquivos('IMG-WA0010.jpg', 'IMG-WA0002.jpg', 'VID-WA0005.mp4', 'leia-me.txt'));
  assert.deepEqual(novos.map(b => b.titulo), ['IMG-WA0002', 'IMG-WA0010', 'VID-WA0005']);
  assert.equal(ignorados, 1);
  for (const b of novos) assert.ok(fs.existsSync(path.join(d.pastaMidia, b.arquivo)));
});

test('pastor guarda nome e versão; versão desconhecida vira ACF', () => {
  const d = novo();
  const p = d.salvarPastor({ nome: '  Pr. Carlos ', versao: 'NVI' });
  assert.equal(p.nome, 'Pr. Carlos');
  d.salvarPastor({ id: p.id, nome: 'Pr. Carlos', versao: 'XYZ' });
  assert.equal(d.pastor(p.id).versao, 'ACF');
  assert.throws(() => d.salvarPastor({ nome: '  ' }));
});

test('reunião completa traz o pastor, a versão dele e os itens da Biblioteca', () => {
  const d = novo();
  const p = d.salvarPastor({ nome: 'Pr. Carlos', versao: 'NVI' });
  const { novos } = d.importarArquivos(arquivos('a.png', 'b.mp4'));
  const r = d.criarReuniao({ pastorId: p.id, data: '2026-11-08', hora: '19:00' });
  d.adicionarItens(r.id, novos.map(b => b.id));
  const c = d.reuniaoCompleta(r.id);
  assert.equal(c.pastor, 'Pr. Carlos');
  assert.equal(c.versao, 'NVI');
  assert.deepEqual(c.itens.map(i => i.tipo), ['imagem', 'video']);
  assert.equal(d.item(r.id, c.itens[1].id).titulo, 'b');
});

test('setas mudam a ordem e não passam das pontas', () => {
  const d = novo();
  const { novos } = d.importarArquivos(arquivos('1.png', '2.png', '3.png'));
  const r = d.criarReuniao({});
  d.adicionarItens(r.id, novos.map(b => b.id));
  const [a, b, c] = d.reuniao(r.id).itens.map(i => i.id);
  d.moverItem(r.id, c, -1);
  assert.deepEqual(d.reuniao(r.id).itens.map(i => i.id), [a, c, b]);
  d.moverItem(r.id, a, -1);
  assert.deepEqual(d.reuniao(r.id).itens.map(i => i.id), [a, c, b]);
  d.moverItem(r.id, b, -2);
  assert.deepEqual(d.reuniao(r.id).itens.map(i => i.id), [b, a, c], 'desliza, não troca de lugar');
  d.removerItem(r.id, c);
  assert.deepEqual(d.reuniao(r.id).itens.map(i => i.id), [b, a]);
});

test('apagar reunião não apaga os arquivos da Biblioteca', () => {
  const d = novo();
  const { novos } = d.importarArquivos(arquivos('a.png'));
  const r = d.criarReuniao({});
  d.adicionarItens(r.id, [novos[0].id]);
  d.removerReuniao(r.id);
  assert.equal(d.reunioes.length, 0);
  assert.equal(d.biblioteca.length, 1);
  assert.ok(fs.existsSync(path.join(d.pastaMidia, novos[0].arquivo)));
});

test('tirar da Biblioteca apaga o arquivo e tira das reuniões', () => {
  const d = novo();
  const { novos } = d.importarArquivos(arquivos('a.png', 'b.png'));
  const r = d.criarReuniao({});
  d.adicionarItens(r.id, novos.map(b => b.id));
  assert.equal(d.usos(novos[0].id), 1);
  d.removerDaBiblioteca(novos[0].id);
  assert.equal(d.reuniaoCompleta(r.id).itens.length, 1);
  assert.equal(fs.existsSync(path.join(d.pastaMidia, novos[0].arquivo)), false);
});

test('copiar reunião não traz fotos e vídeos da semana passada', () => {
  const d = novo();
  const p = d.salvarPastor({ nome: 'Pr. João', versao: 'ACF' });
  const { novos } = d.importarArquivos(arquivos('a.png', 'b.mp4'));
  // um hino (tipo que se repete) entra direto na Biblioteca
  d.biblioteca.push({ id: 'hino', tipo: 'musica', titulo: 'Firme nas Promessas', arquivo: 'x.mp3', criadoEm: '2026-11-01' });
  const r1 = d.criarReuniao({ pastorId: p.id, nome: 'Reunião de libertação' });
  d.adicionarItens(r1.id, [novos[0].id, 'hino', novos[1].id]);
  const r2 = d.criarReuniao({ pastorId: p.id, data: '2026-11-15', copiarDe: r1.id });
  const c = d.reuniaoCompleta(r2.id);
  assert.deepEqual(c.itens.map(i => i.titulo), ['Firme nas Promessas']);
  assert.equal(c.nome, 'Reunião de libertação');
  assert.notEqual(c.itens[0].id, d.reuniao(r1.id).itens[1].id, 'item copiado ganha id próprio');
});

test('apagar antigos: só imagens e vídeos sem uso há mais de 7 dias e fora de reuniões futuras', () => {
  const pasta = pastaTemp();
  const d = new Dados(pasta, { hoje: () => '2026-11-01' });
  const { novos } = d.importarArquivos(arquivos('velho.png', 'em-uso.png', 'futuro.mp4', 'recente.png'));
  const [velho, emUso, futuro, recente] = novos;
  d.biblioteca.push({ id: 'hino', tipo: 'musica', titulo: 'Hino', arquivo: 'h.mp3', criadoEm: '2026-01-01' });
  const r1 = d.criarReuniao({ data: '2026-11-01' });
  d.adicionarItens(r1.id, [emUso.id]);
  const r2 = d.criarReuniao({ data: '2026-11-20' });
  d.adicionarItens(r2.id, [futuro.id]);
  recente.criadoEm = '2026-11-12';

  d.hoje = () => '2026-11-14';
  const ids = d.antigos().map(b => b.id).sort();
  assert.deepEqual(ids, [velho.id, emUso.id].sort(), 'em-uso foi usado em 01/11, mais de 7 dias antes de 14/11');
  assert.equal(d.apagarAntigos(), 2);
  assert.ok(d.arquivoDaBiblioteca('hino'), 'música nunca é apagada');
  assert.ok(d.arquivoDaBiblioteca(futuro.id));
  assert.ok(d.arquivoDaBiblioteca(recente.id));
});

test('lista de reuniões vem em ordem de dia e horário', () => {
  const d = novo();
  d.criarReuniao({ data: '2026-11-08', hora: '19:00' });
  d.criarReuniao({ data: '2026-11-08', hora: '07:00' });
  d.criarReuniao({ data: '2026-11-01', hora: '19:00' });
  assert.deepEqual(d.resumoReunioes().map(r => r.data + ' ' + r.hora), ['2026-11-01 19:00', '2026-11-08 07:00', '2026-11-08 19:00']);
});

test('os dados continuam lá quando o programa abre de novo', () => {
  const pasta = pastaTemp();
  const d1 = new Dados(pasta);
  d1.salvarPastor({ nome: 'Pr. João', versao: 'ACF' });
  const d2 = new Dados(pasta);
  assert.equal(d2.pastores.length, 1);
  assert.equal(d2.config.token, d1.config.token);
});

test('dados da versão 1 são convertidos: arquivos vão para a Biblioteca', () => {
  const pasta = pastaTemp();
  fs.mkdirSync(path.join(pasta, 'midia'));
  fs.writeFileSync(path.join(pasta, 'dados.json'), JSON.stringify({
    versao: 1,
    config: { token: 'abc', porta: 7420, telaEspera: null, telaTv: 123 },
    reunioes: [{ id: 'r1', nome: 'Reunião de teste', data: '2026-11-02', hora: '09:59', itens: [
      { id: 'i1', tipo: 'imagem', titulo: 'Convite', arquivo: 'c.png' },
      { id: 'i2', tipo: 'video', titulo: 'Testemunho', arquivo: 't.webm' },
    ] }],
  }));
  const d = new Dados(pasta);
  assert.equal(d.d.versao, 2);
  assert.equal(d.config.token, 'abc');
  assert.equal(d.config.telaTv, 123);
  assert.equal(d.biblioteca.length, 2);
  const c = d.reuniaoCompleta('r1');
  assert.deepEqual(c.itens.map(i => [i.id, i.titulo, i.arquivo]), [['i1', 'Convite', 'c.png'], ['i2', 'Testemunho', 't.webm']]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(pasta, 'dados.json'), 'utf8')).versao, 2, 'conversão foi salva');
});
