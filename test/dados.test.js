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
  assert.equal(tipoDoArquivo('Hino 15.mp3'), 'musica');
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

test('versículos preparados ficam todos dentro de um item "Palavra"', () => {
  const d = novo();
  const r = d.criarReuniao({});
  d.adicionarVersiculo(r.id, { ref: { l: 18, c: 23, v: 1 }, ate: 6, versao: 'NVI' });
  d.adicionarVersiculo(r.id, { ref: { l: 42, c: 3, v: 16 } });
  const itens = d.reuniaoCompleta(r.id).itens;
  assert.equal(itens.length, 1, 'um cartão só');
  assert.equal(itens[0].tipo, 'palavra');
  const [sl, jo] = itens[0].passagens;
  assert.equal(sl.titulo, 'Salmos 23:1-6');
  assert.equal(sl.versao, 'NVI');
  assert.equal(jo.titulo, 'João 3:16');
  assert.equal(jo.versao, null, 'sem versão própria: usa a do pastor');
});

test('passagens da Palavra mudam de ordem e, sem nenhuma, a Palavra sai da reunião', () => {
  const d = novo();
  const r = d.criarReuniao({});
  const a = d.adicionarVersiculo(r.id, { ref: { l: 18, c: 23, v: 1 } });
  const b = d.adicionarVersiculo(r.id, { ref: { l: 42, c: 3, v: 16 } });
  d.moverPassagem(r.id, b.id, -1);
  assert.deepEqual(d.reuniaoCompleta(r.id).itens[0].passagens.map(p => p.id), [b.id, a.id]);
  d.removerPassagem(r.id, a.id);
  assert.equal(d.reuniaoCompleta(r.id).itens[0].passagens.length, 1);
  d.removerPassagem(r.id, b.id);
  assert.equal(d.reuniaoCompleta(r.id).itens.length, 0);
});

test('versículos soltos de antes viram uma Palavra no lugar do primeiro', () => {
  const pasta = pastaTemp();
  const v = (id, l, c, n) => ({ id, tipo: 'versiculo', ref: { l, c, v: n }, ate: n, versao: null });
  fs.writeFileSync(path.join(pasta, 'dados.json'), JSON.stringify({
    versao: 2, config: { token: 'x', porta: 1 }, pastores: [], biblioteca: [{ id: 'b1', tipo: 'imagem', titulo: 'Foto', arquivo: 'f.png', criadoEm: '2026-01-01' }],
    reunioes: [{ id: 'r1', data: '2026-01-01', hora: '19:00', itens: [{ id: 'i1', bibliotecaId: 'b1' }, v('v1', 18, 23, 1), { id: 'i2', bibliotecaId: 'b1' }, v('v2', 42, 3, 16)] }],
  }));
  const d = new Dados(pasta);
  const itens = d.reuniaoCompleta('r1').itens;
  assert.deepEqual(itens.map(i => i.tipo), ['imagem', 'palavra', 'imagem']);
  assert.deepEqual(itens[1].passagens.map(p => p.titulo), ['Salmos 23:1', 'João 3:16']);
});

test('copiar reunião leva os versículos e o fundo', () => {
  const d = novo();
  const { novos } = d.importarArquivos(arquivos('foto.png'));
  const r1 = d.criarReuniao({ fundo: 'noite' });
  d.adicionarItens(r1.id, [novos[0].id]);
  d.adicionarVersiculo(r1.id, { ref: { l: 18, c: 23, v: 1 }, ate: 6 });
  const r2 = d.criarReuniao({ copiarDe: r1.id });
  const c = d.reuniaoCompleta(r2.id);
  assert.deepEqual(c.itens.map(i => i.tipo), ['palavra']);
  assert.deepEqual(c.itens[0].passagens.map(p => p.titulo), ['Salmos 23:1-6']);
  assert.deepEqual(c.fundo, { pronto: 'noite' });
});

test('fundo: pronto, da Biblioteca, ou o padrão quando some', () => {
  const d = novo();
  const { novos, ignorados } = d.importarArquivos(arquivos('igreja.jpg', 'video.mp4'), { comoFundo: true });
  assert.equal(ignorados, 1, 'vídeo não serve de fundo');
  assert.equal(novos[0].tipo, 'fundo');
  const r = d.criarReuniao({ fundo: novos[0].id });
  assert.deepEqual(d.reuniaoCompleta(r.id).fundo, { arquivo: novos[0].arquivo });
  assert.equal(d.usos(novos[0].id), 1);
  d.removerDaBiblioteca(novos[0].id);
  assert.deepEqual(d.reuniaoCompleta(r.id).fundo, { pronto: 'ceu' });
  d.editarReuniao(r.id, { fundo: 'qualquer-coisa' });
  assert.deepEqual(d.reuniaoCompleta(r.id).fundo, { pronto: 'ceu' });
});

test('fundos nunca são apagados por "Apagar antigos"', () => {
  const d = new Dados(pastaTemp(), { hoje: () => '2026-01-01' });
  d.importarArquivos(arquivos('igreja.jpg'), { comoFundo: true });
  d.hoje = () => '2026-12-31';
  assert.equal(d.antigos().length, 0);
});

test('últimos versículos usados: por pastor, sem repetir, no máximo 6', () => {
  const d = novo();
  for (let v = 1; v <= 8; v++) d.lembrarVersiculo('p1', { l: 18, c: 23, v });
  d.lembrarVersiculo('p1', { l: 18, c: 23, v: 5 });
  assert.deepEqual(d.recentes('p1').map(r => r.v), [5, 8, 7, 6, 4, 3]);
  assert.deepEqual(d.recentes('p2'), []);
  d.lembrarVersiculo(null, { l: 0, c: 1, v: 1 });
  assert.equal(d.recentes(null).length, 1);
});

test('pregação: várias imagens viram uma coisa só, na ordem do nome', () => {
  const d = novo('2026-11-08');
  const { pregacao, ignorados } = d.criarPregacao(arquivos('IMG-WA0012.jpg', 'IMG-WA0003.jpg', 'audio.mp3'));
  assert.equal(ignorados, 1);
  assert.equal(pregacao.tipo, 'pregacao');
  assert.equal(pregacao.titulo, 'Pregação de 08/11');
  assert.equal(pregacao.arquivos.length, 2);
  assert.equal(d.biblioteca.length, 1);
  const r = d.criarReuniao({});
  d.adicionarItens(r.id, [pregacao.id]);
  assert.equal(d.reuniaoCompleta(r.id).itens[0].arquivos.length, 2);
  const caminhos = pregacao.arquivos.map(a => path.join(d.pastaMidia, a));
  d.removerDaBiblioteca(pregacao.id);
  assert.ok(caminhos.every(c => !fs.existsSync(c)), 'apaga todas as imagens');
  assert.equal(d.criarPregacao(arquivos('a.mp3')), null);
});

test('músicas vão junto ao copiar a reunião; fotos não', () => {
  const d = novo();
  const { novos } = d.importarArquivos(arquivos('Hino.mp3', 'foto.png'));
  const r1 = d.criarReuniao({});
  d.adicionarItens(r1.id, novos.map(b => b.id));
  const r2 = d.criarReuniao({ copiarDe: r1.id });
  assert.deepEqual(d.reuniaoCompleta(r2.id).itens.map(i => i.tipo), ['musica']);
});

test('músicas nunca são apagadas por "Apagar antigos"; pregações sim', () => {
  const d = new Dados(pastaTemp(), { hoje: () => '2026-01-01' });
  d.importarArquivos(arquivos('Hino.mp3'));
  d.criarPregacao(arquivos('a.jpg'));
  d.hoje = () => '2026-12-31';
  assert.deepEqual(d.antigos().map(b => b.tipo), ['pregacao']);
});
