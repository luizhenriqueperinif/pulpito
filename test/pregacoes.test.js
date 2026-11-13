const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Dados } = require('../src/main/dados');
const { criarPregacoes, resumoDasPregacoes, ehPdf } = require('../src/main/pregacoes');

const pastaTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'altar-preg-'));
const novo = () => new Dados(pastaTemp(), { hoje: () => '2026-11-13' });
function arquivos(...nomes) {
  const p = pastaTemp();
  return nomes.map(n => { const c = path.join(p, n); fs.writeFileSync(c, 'conteúdo de ' + n); return c; });
}
// Faz de conta que o leitor desenhou 3 páginas do PDF.
const leitorDeMentira = pastas => async (pdf, pasta) => {
  pastas.push(pasta);
  return [1, 2, 3].map(n => { const c = path.join(pasta, `000${n}.jpg`); fs.writeFileSync(c, `página ${n} de ${path.basename(pdf)}`); return c; });
};

test('reconhece PDF pelo nome do arquivo', () => {
  assert.ok(ehPdf('Palestra.PDF'));
  assert.ok(!ehPdf('foto.jpg'));
});

test('o PDF da palestra vira uma pregação com uma imagem por página e o nome do arquivo', async () => {
  const d = novo(), pastas = [];
  const [pdf] = arquivos('Palestra TdoA - Semancol.pdf');
  const r = resumoDasPregacoes(await criarPregacoes(d, [pdf], { pdfParaImagens: leitorDeMentira(pastas) }));
  assert.deepEqual({ qtd: r.qtd, imagens: r.imagens, ignorados: r.ignorados, repetida: r.repetida }, { qtd: 1, imagens: 3, ignorados: 0, repetida: false });
  assert.equal(r.titulo, 'Palestra TdoA - Semancol');
  const b = d.biblioteca[0];
  assert.equal(b.tipo, 'pregacao');
  assert.equal(b.arquivos.length, 3);
  assert.ok(b.arquivos.every(a => fs.existsSync(path.join(d.pastaMidia, a))), 'as páginas ficam guardadas na Biblioteca');
  assert.ok(pastas.every(p => !fs.existsSync(p)), 'a pasta provisória é apagada');
});

test('o mesmo PDF de novo não duplica a pregação', async () => {
  const d = novo();
  const [pdf] = arquivos('Palestra.pdf');
  await criarPregacoes(d, [pdf], { pdfParaImagens: leitorDeMentira([]) });
  // Da segunda vez nem desenha as páginas (o desenho pode sair um tiquinho diferente): reconhece pelo próprio PDF.
  const r = resumoDasPregacoes(await criarPregacoes(d, [pdf], { pdfParaImagens: async () => { throw new Error('não era para desenhar de novo'); } }));
  assert.deepEqual({ qtd: r.qtd, novas: r.novas, repetida: r.repetida, imagens: r.imagens }, { qtd: 1, novas: 0, repetida: true, imagens: 3 });
  assert.equal(d.biblioteca.length, 1);
});

test('imagens soltas viram uma pregação e cada PDF vira outra', async () => {
  const d = novo();
  const r = resumoDasPregacoes(await criarPregacoes(d, arquivos('a.jpg', 'b.jpg', 'Palestra 1.pdf', 'Palestra 2.pdf', 'audio.mp3'), { pdfParaImagens: leitorDeMentira([]) }));
  assert.deepEqual({ qtd: r.qtd, imagens: r.imagens, ignorados: r.ignorados }, { qtd: 3, imagens: 8, ignorados: 1 });
  assert.deepEqual(d.biblioteca.map(b => b.titulo), ['Palestra 1', 'Palestra 2', 'Pregação de 13/11']);
});

test('PDF que não abre fica de fora, é anotado e não derruba o resto', async () => {
  const d = novo(), erros = [];
  const r = resumoDasPregacoes(await criarPregacoes(d, arquivos('quebrado.pdf', 'a.jpg'), {
    pdfParaImagens: async () => { throw new Error('não abriu'); }, aoErrar: e => erros.push(e.message),
  }));
  assert.deepEqual({ qtd: r.qtd, imagens: r.imagens, ignorados: r.ignorados }, { qtd: 1, imagens: 1, ignorados: 1 });
  assert.deepEqual(erros, ['não abriu']);
});

test('sem nada que sirva, não cria nada', async () => {
  const d = novo();
  const r = resumoDasPregacoes(await criarPregacoes(d, arquivos('audio.mp3'), {}));
  assert.deepEqual({ qtd: r.qtd, ignorados: r.ignorados, repetida: r.repetida }, { qtd: 0, ignorados: 1, repetida: false });
});
