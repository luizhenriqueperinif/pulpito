const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Dados, tipoDoArquivo, somarDias } = require('../src/main/dados');

const pastaTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'auxilio-teste-'));

function arquivos(...nomes) {
  const p = pastaTemp();
  // conteúdo diferente em cada um (arquivos iguais são reconhecidos como repetidos)
  return nomes.map(n => { const c = path.join(p, n); fs.writeFileSync(c, 'conteúdo de ' + n); return c; });
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

test('versículos da mesma Palavra ficam dentro de um item "Palavra"', () => {
  const d = novo();
  const r = d.criarReuniao({});
  const pal = d.reuniao(r.id).itens;
  d.adicionarVersiculo(r.id, { ref: { l: 18, c: 23, v: 1 }, ate: 6, versao: 'NVI' });
  d.adicionarVersiculo(r.id, { ref: { l: 42, c: 3, v: 16 }, palavraId: pal[0].id });
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
  const b = d.adicionarVersiculo(r.id, { ref: { l: 42, c: 3, v: 16 }, palavraId: d.reuniao(r.id).itens[0].id });
  d.moverPassagem(r.id, b.id, -1);
  assert.deepEqual(d.reuniaoCompleta(r.id).itens[0].passagens.map(p => p.id), [b.id, a.id]);
  d.removerPassagem(r.id, a.id);
  assert.equal(d.reuniaoCompleta(r.id).itens[0].passagens.length, 1);
  d.removerPassagem(r.id, b.id);
  assert.equal(d.reuniaoCompleta(r.id).itens.length, 0);
});

test('cada "+ Versículo" sem Palavra escolhida vira uma Palavra separada, no fim', () => {
  const d = novo();
  const r = d.criarReuniao({});
  const [img] = d.importarArquivos(arquivos('convite.jpg')).novos;
  d.adicionarVersiculo(r.id, { ref: { l: 38, c: 3, v: 10 } }); // Malaquias: dízimo
  d.adicionarItens(r.id, [img.id]);
  const fam = d.adicionarVersiculo(r.id, { ref: { l: 5, c: 24, v: 15 } }); // Josué: família
  const itens = d.reuniaoCompleta(r.id).itens;
  assert.deepEqual(itens.map(i => i.tipo), ['palavra', 'imagem', 'palavra']);
  assert.equal(itens[0].passagens[0].titulo, 'Malaquias 3:10');
  assert.equal(itens[2].passagens[0].titulo, 'Josué 24:15');
  // mexer numa passagem não mexe na outra Palavra
  d.removerPassagem(r.id, fam.id);
  assert.deepEqual(d.reuniaoCompleta(r.id).itens.map(i => i.tipo), ['palavra', 'imagem']);
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

test('a Palavra pode ter nome ("Palavra do dízimo"); sem nome aparece "Palavra"', () => {
  const d = novo();
  const r = d.criarReuniao({});
  d.adicionarVersiculo(r.id, { ref: { l: 38, c: 3, v: 10 }, nome: '  Palavra   do dízimo ' });
  d.adicionarVersiculo(r.id, { ref: { l: 5, c: 24, v: 15 } });
  let [diz, fam] = d.reuniaoCompleta(r.id).itens;
  assert.equal(diz.titulo, 'Palavra do dízimo');
  assert.equal(fam.titulo, 'Palavra');
  d.renomearPalavra(r.id, fam.id, 'Palavra da família');
  d.adicionarVersiculo(r.id, { ref: { l: 18, c: 128, v: 1 }, palavraId: diz.id }); // sem nome: não apaga o que tinha
  [diz, fam] = d.reuniaoCompleta(r.id).itens;
  assert.equal(fam.titulo, 'Palavra da família');
  assert.equal(diz.titulo, 'Palavra do dízimo');
  assert.equal(diz.passagens.length, 2);
  d.renomearPalavra(r.id, fam.id, '   ');
  assert.equal(d.reuniaoCompleta(r.id).itens[1].titulo, 'Palavra');
});

test('o mesmo arquivo não entra duas vezes na Biblioteca, mesmo com outro nome', () => {
  const d = novo();
  const [a] = arquivos('IMG-WA0001.jpg');
  const p = pastaTemp();
  const copia = path.join(p, 'IMG-WA0099.jpg'); fs.copyFileSync(a, copia);   // reenviado pelo WhatsApp
  const r1 = d.importarArquivos([a]);
  assert.equal(r1.novos.length, 1);
  const r2 = d.importarArquivos([copia, ...arquivos('outra.jpg')]);
  assert.equal(r2.novos.length, 1, 'só a outra foto é nova');
  assert.equal(r2.repetidos.length, 1);
  assert.equal(r2.repetidos[0].id, r1.novos[0].id, 'devolve a que já estava');
  assert.equal(d.biblioteca.length, 2);
  // na mesma escolha, duas vezes o mesmo arquivo também não duplica
  const r3 = d.importarArquivos([...arquivos('nova.png'), ...arquivos('nova.png')]);
  assert.equal(r3.novos.length, 1);
  assert.equal(d.biblioteca.length, 3);
});

test('arquivo repetido entra na reunião só uma vez', () => {
  const d = novo();
  const r = d.criarReuniao({});
  const [a] = arquivos('convite.jpg');
  const { novos } = d.importarArquivos([a]);
  d.adicionarItens(r.id, [novos[0].id], { semRepetir: true });
  const { repetidos } = d.importarArquivos([a]);
  d.adicionarItens(r.id, repetidos.map(b => b.id), { semRepetir: true });
  assert.equal(d.reuniao(r.id).itens.length, 1);
});

test('a mesma imagem pode ser foto e também fundo de versículo', () => {
  const d = novo();
  const [a] = arquivos('ceu.jpg');
  d.importarArquivos([a]);
  const r = d.importarArquivos([a], { comoFundo: true });
  assert.equal(r.novos.length, 1);
  assert.equal(r.novos[0].tipo, 'fundo');
});

test('a mesma pregação não é criada duas vezes', () => {
  const d = novo();
  const imgs = arquivos('1.png', '2.png', '3.png');
  const a = d.criarPregacao(imgs);
  const b = d.criarPregacao(imgs);
  assert.equal(b.repetida, true);
  assert.equal(b.pregacao.id, a.pregacao.id);
  assert.equal(d.biblioteca.filter(x => x.tipo === 'pregacao').length, 1);
  // outra ordem é outra pregação
  assert.ok(!d.criarPregacao([imgs[2], imgs[1], imgs[0]], { manterOrdem: true }).repetida);
});

test('arquivos de antes (sem marca) também são reconhecidos', () => {
  const d = novo();
  const [a] = arquivos('antigo.jpg');
  d.importarArquivos([a]);
  delete d.biblioteca[0].marca;           // como os que entraram antes desta versão
  assert.equal(d.importarArquivos([a]).repetidos.length, 1);
  assert.ok(d.biblioteca[0].marca, 'ganhou a marca');
});

test('categorias de música: criar, pôr música, mudar nome e apagar', () => {
  const d = novo();
  d.biblioteca.push({ id: 'h1', tipo: 'musica', titulo: 'Hino 1', arquivo: 'h1.mp3', criadoEm: '2026-11-01' });
  d.biblioteca.push({ id: 'f1', tipo: 'imagem', titulo: 'Foto', arquivo: 'f.jpg', criadoEm: '2026-11-01' });
  const c = d.criarCategoria('  Oração   forte ');
  assert.equal(c.nome, 'Oração forte');
  assert.equal(d.criarCategoria('oração FORTE').id, c.id, 'nome repetido não cria outra');
  assert.equal(d.criarCategoria('   '), null);
  d.definirCategoria('h1', c.id);
  d.definirCategoria('f1', c.id);  // foto não tem categoria
  assert.equal(d.arquivoDaBiblioteca('h1').categoria, c.id);
  assert.equal(d.arquivoDaBiblioteca('f1').categoria, undefined);
  d.definirCategoria('h1', 'nao-existe');
  assert.equal(d.arquivoDaBiblioteca('h1').categoria, undefined);
  d.definirCategoria('h1', c.id);
  d.renomearCategoria(c.id, 'Fundo de busca');
  assert.equal(d.categoriasMusica[0].nome, 'Fundo de busca');
  d.removerCategoria(c.id);
  assert.equal(d.categoriasMusica.length, 0);
  assert.ok(d.arquivoDaBiblioteca('h1'), 'a música continua na Biblioteca');
  assert.equal(d.arquivoDaBiblioteca('h1').categoria, undefined);
});

test('imagem do vídeo: automática, a antiga é trocada e some junto com o vídeo', () => {
  const d = new Dados(pastaTemp());
  const { novos } = d.importarArquivos(arquivos('testemunho.mp4', 'foto.png'));
  const vid = novos.find(b => b.tipo === 'video'), foto = novos.find(b => b.tipo === 'imagem');
  assert.deepEqual(d.videosSemCapa().map(b => b.id), [vid.id], 'só vídeos sem imagem');
  d.salvarCapaAutomatica(vid.id, Buffer.from('jpg'));
  const capa = d.arquivoDaBiblioteca(vid.id).capa;
  assert.ok(fs.existsSync(path.join(d.pastaMidia, capa)));
  assert.deepEqual(d.videosSemCapa(), []);
  // imagem de antes (do meio do vídeo): o programa tira de novo, do fim
  delete d.arquivoDaBiblioteca(vid.id).capaDe;
  assert.deepEqual(d.videosSemCapa().map(b => b.id), [vid.id]);
  d.salvarCapaAutomatica(vid.id, Buffer.from('jpg2'));
  const nova = d.arquivoDaBiblioteca(vid.id).capa;
  assert.equal(fs.existsSync(path.join(d.pastaMidia, capa)), false, 'a antiga é apagada');
  assert.equal(d.salvarCapaAutomatica(foto.id, Buffer.from('x')), false, 'só vídeo tem imagem');
  d.removerDaBiblioteca(vid.id);
  assert.equal(fs.existsSync(path.join(d.pastaMidia, nova)), false);
});

test('tirar um fundo do programa: some da lista, a reunião que usava volta para o padrão, e dá para trazer de volta', () => {
  const d = novo();
  const r = d.criarReuniao({ data: '2026-11-08', hora: '18:00' });
  d.editarReuniao(r.id, { fundo: 'trigo' });
  assert.equal(d.esconderFundo('trigo'), true);
  assert.deepEqual(d.fundosEscondidos, ['trigo']);
  assert.equal(d.reuniaoCompleta(r.id).fundoId, 'ceu', 'volta para o padrão');
  assert.equal(d.esconderFundo('nao-existe'), false);
  // tirou o padrão: o padrão passa a ser o primeiro que sobrou
  d.esconderFundo('ceu');
  assert.equal(d.reuniaoCompleta(r.id).fundoId, 'amanhecer');
  assert.deepEqual(d.reuniaoCompleta(r.id).fundo, { pronto: 'amanhecer' });
  d.mostrarFundosDoPrograma();
  assert.deepEqual(d.fundosEscondidos, []);
});

test('música da espera: padrão, da reunião, sem música, e some se apagar a música', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { Dados } = require('../src/main/dados');
  const d = new Dados(fs.mkdtempSync(path.join(os.tmpdir(), 'pulpito-me-')));
  const m1 = { id: 'm1', tipo: 'musica', titulo: 'Hino', arquivo: 'm1.mp3' };
  const m2 = { id: 'm2', tipo: 'musica', titulo: 'Oração', arquivo: 'm2.mp3' };
  d.d.biblioteca.push(m1, m2, { id: 'i1', tipo: 'imagem', titulo: 'x', arquivo: 'i1.png' });
  const r = d.criarReuniao({ data: '2026-11-03', hora: '18:00' });
  assert.equal(d.musicaEspera(r.id), null);
  d.definirMusicaEsperaPadrao('m1');
  assert.equal(d.musicaEspera(r.id), 'm1');
  d.definirMusicaEsperaPadrao('i1'); // não é música: ignora
  assert.equal(d.musicaEspera(r.id), 'm1');
  d.editarReuniao(r.id, { musicaEspera: 'm2' });
  assert.equal(d.musicaEspera(r.id), 'm2');
  d.editarReuniao(r.id, { musicaEspera: 'nenhuma' });
  assert.equal(d.musicaEspera(r.id), null);
  d.editarReuniao(r.id, { musicaEspera: 'm2' });
  assert.equal(d.usos('m2'), 1);
  d.removerDaBiblioteca('m2');
  assert.equal(d.musicaEspera(r.id), 'm1'); // volta para a padrão
  d.removerDaBiblioteca('m1');
  assert.equal(d.musicaEspera(r.id), null);
  assert.equal(d.config.musicaEspera, null);
});

test('tela de espera com vídeo: da Biblioteca ou o arquivo padrão', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { Dados } = require('../src/main/dados');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pulpito-ev-'));
  const d = new Dados(pasta);
  d.d.biblioteca.push({ id: 'v1', tipo: 'video', titulo: 'Fundo animado', arquivo: 'v1.mp4', capa: 'capa-v1.jpg' });
  const r = d.criarReuniao({ data: '2026-11-03', hora: '18:00' });
  d.editarReuniao(r.id, { telaEspera: 'v1' });
  assert.deepEqual(d.telaEspera(r.id), { arquivo: 'v1.mp4', video: true, capa: 'capa-v1.jpg', daReuniao: true });
  const origem = path.join(pasta, 'espera.mp4'); fs.writeFileSync(origem, 'x');
  d.trocarTelaEspera(origem);
  d.editarReuniao(r.id, { telaEspera: null });
  assert.equal(d.telaEspera(r.id).video, true);
});

test('marcar vídeo ou imagem para aparecer na escolha da tela de espera', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { Dados } = require('../src/main/dados');
  const d = new Dados(fs.mkdtempSync(path.join(os.tmpdir(), 'pulpito-me2-')));
  d.d.biblioteca.push({ id: 'v1', tipo: 'video', titulo: 'a', arquivo: 'v1.mp4' }, { id: 'm1', tipo: 'musica', titulo: 'b', arquivo: 'm1.mp3' });
  d.marcarParaEspera('v1', true);
  assert.equal(d.arquivoDaBiblioteca('v1').espera, true);
  d.marcarParaEspera('m1', true); // música não vai para a tela de espera
  assert.equal(d.arquivoDaBiblioteca('m1').espera, undefined);
  d.marcarParaEspera('v1', false);
  assert.equal(d.arquivoDaBiblioteca('v1').espera, undefined);
});

test('tirar uma foto do programa da tela de espera: some da lista, a reunião volta para a padrão, e dá para trazer de volta', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { Dados, FUNDOS_PRONTOS } = require('../src/main/dados');
  const d = new Dados(fs.mkdtempSync(path.join(os.tmpdir(), 'pulpito-ee-')));
  const foto = FUNDOS_PRONTOS[8];
  const r = d.criarReuniao({ data: '2026-11-03', hora: '18:00' });
  d.editarReuniao(r.id, { telaEspera: foto });
  assert.equal(d.telaEspera(r.id).daReuniao, true);
  d.esconderEsperaDoPrograma(foto);
  assert.deepEqual(d.esperasEscondidas, [foto]);
  assert.equal(d.telaEspera(r.id), null);
  d.esconderEsperaDoPrograma(FUNDOS_PRONTOS[0]); // cor, não é foto: ignora
  assert.deepEqual(d.esperasEscondidas, [foto]);
  d.mostrarEsperasDoPrograma();
  assert.deepEqual(d.esperasEscondidas, []);
});
