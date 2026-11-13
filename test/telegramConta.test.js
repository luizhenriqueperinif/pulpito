const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarContaTelegram, limparNumero, nomeSeguro } = require('../src/main/telegramConta');

// Telegram de mentira: guarda o que foi pedido.
function falso({ precisaSenha = false } = {}) {
  const log = [];
  const conversas = [
    { id: '10', nome: 'Obreiros', tipo: 'grupo', entidade: { e: 10 }, quando: 3 },
    { id: '20', nome: 'Sem vídeo', tipo: 'pessoa', entidade: { e: 20 }, quando: 2 },
    { id: '30', nome: 'Pastor Ricardo', tipo: 'pessoa', entidade: { e: 30 }, quando: 1 },
  ];
  const videos = { 10: [{ id: 7, titulo: 'Testemunho: irmã Maria', duracao: 400, tamanho: 5e6, quando: 1, ext: 'mp4' }], 30: [{ id: 3, titulo: 'Palavra', duracao: 60, tamanho: 1e6, quando: 1, ext: 'mov' }] };
  let sessao = '';
  const ad = {
    log,
    conectar: async () => log.push('conectar'),
    desconectar: async () => log.push('desconectar'),
    autorizado: async () => !!sessao || true,
    sessao: () => (sessao = 'SESSAO-OK'),
    mandarCodigo: async n => { log.push('codigo ' + n); return 'HASH'; },
    entrar: async (n, h, c) => {
      if (c !== '12345') { const e = new Error('x'); e.errorMessage = 'PHONE_CODE_INVALID'; throw e; }
      return precisaSenha ? 'senha' : 'ok';
    },
    entrarComSenha: async s => { if (s !== 'segredo') { const e = new Error('x'); e.errorMessage = 'PASSWORD_HASH_INVALID'; throw e; } },
    nome: async () => 'Pastor Teste',
    sair: async () => log.push('sair'),
    dialogos: async () => conversas,
    contarVideos: async ent => (videos[ent.e] || []).length,
    videos: async ent => videos[ent.e] || [],
    video: async (ent, id) => (videos[ent.e] || []).find(v => v.id === id) || null,
    miniatura: async () => Buffer.from('jpg'),
    baixar: async (ent, id, arq, prog) => { prog(50, 100); prog(100, 100); fs.writeFileSync(arq, Buffer.alloc(2048)); log.push('baixou ' + path.basename(arq)); },
  };
  return ad;
}

function nova(ad) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'altar-conta-'));
  const conta = criarContaTelegram({
    arquivo: path.join(pasta, 'telegram.bin'), pastaCache: path.join(pasta, 'cache'),
    cifrar: s => Buffer.from('X' + s), decifrar: b => String(b).slice(1),
    criarAdaptador: () => ad,
  });
  return { conta, pasta };
}

test('Telegram: número vira o formato internacional', () => {
  assert.equal(limparNumero('35 99999-1234'), '+5535999991234');
  assert.equal(limparNumero('(035) 99999-1234'), '+5535999991234');
  assert.equal(limparNumero('+1 555 123 4567'), '+15551234567');
  assert.equal(nomeSeguro('Culto: dia 1/2 "especial"'), 'Culto dia 1 2 especial');
});

test('Telegram: chave, número, código errado, código certo, e fica guardado', async () => {
  const ad = falso();
  const { conta, pasta } = nova(ad);
  assert.equal(conta.estado().etapa, 'semChave');
  conta.definirChave('abc', 'x');
  assert.match(conta.estado().erro, /só número/);
  conta.definirChave('1234567', '0123456789abcdef0123456789ABCDEF');
  assert.equal(conta.estado().etapa, 'desligado');

  await conta.enviarNumero('35 99999-1234');
  assert.equal(conta.estado().etapa, 'codigo');
  assert.ok(ad.log.includes('codigo +5535999991234'));
  await conta.enviarCodigo('11111');
  assert.equal(conta.estado().etapa, 'codigo');
  assert.match(conta.estado().erro, /Código errado/);
  await conta.enviarCodigo('12-345');
  assert.equal(conta.estado().etapa, 'ligado');
  assert.equal(conta.estado().nome, 'Pastor Teste');

  // O arquivo guardado está cifrado e, aberto de novo, já começa ligado.
  const bruto = fs.readFileSync(path.join(pasta, 'telegram.bin'), 'utf8');
  assert.ok(bruto.startsWith('X'));
  const { conta: denovo } = nova(ad);
  assert.equal(denovo.estado().etapa, 'semChave'); // outra pasta: não vê
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('Telegram: senha de duas etapas', async () => {
  const { conta, pasta } = nova(falso({ precisaSenha: true }));
  conta.definirChave('1', '0123456789abcdef0123456789abcdef');
  await conta.enviarNumero('35999991234');
  await conta.enviarCodigo('12345');
  assert.equal(conta.estado().etapa, 'senha');
  await conta.enviarSenha('errada');
  assert.match(conta.estado().erro, /Senha errada/);
  await conta.enviarSenha('segredo');
  assert.equal(conta.estado().etapa, 'ligado');
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('Telegram: só conversas com vídeo, vídeos, miniatura, baixar e sair', async () => {
  const ad = falso();
  const { conta, pasta } = nova(ad);
  conta.definirChave('1', '0123456789abcdef0123456789abcdef');
  await conta.enviarNumero('35999991234'); await conta.enviarCodigo('12345');

  const cs = await conta.conversas();
  assert.deepEqual(cs.map(c => [c.nome, c.qt]), [['Obreiros', 1], ['Pastor Ricardo', 1]]);
  const vs = await conta.videos('10');
  assert.equal(vs[0].titulo, 'Testemunho: irmã Maria');
  assert.equal(vs[0].temMiniatura, false);
  assert.ok(fs.existsSync(await conta.miniatura('10', 7)));
  assert.equal((await conta.videos('10'))[0].temMiniatura, true);
  assert.equal(await conta.miniatura('10/../x', 7), null);

  const prog = [];
  const r = await conta.baixar('30', 3, p => prog.push(p));
  assert.deepEqual(prog, [50, 100]);
  assert.equal(path.basename(r.arquivo), 'Palavra.mov');
  assert.ok(fs.existsSync(r.arquivo));
  await assert.rejects(conta.baixar('30', 999), /não está mais/);

  await conta.sair();
  assert.equal(conta.estado().etapa, 'desligado');
  assert.ok(ad.log.includes('sair'));
  assert.deepEqual(await conta.conversas(), []);
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('Telegram: baixa em pedaços ao mesmo tempo e monta o arquivo certinho', async () => {
  const { baixarEmPedacos } = require('../src/main/telegramConta');
  const total = 5 * 512 * 1024 + 1234;
  const original = Buffer.alloc(total); for (let i = 0; i < total; i++) original[i] = (i * 31) % 251;
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'altar-pedacos-'));
  const arquivo = path.join(pasta, 'v.mp4');
  let aoMesmoTempo = 0, maximo = 0; const progresso = [];
  await baixarEmPedacos({
    total, arquivo, juntos: 4, aoProgresso: f => progresso.push(f),
    pedir: async (offset, limite) => {
      aoMesmoTempo++; maximo = Math.max(maximo, aoMesmoTempo);
      await new Promise(ok => setTimeout(ok, 5 + ((offset / limite) % 3) * 10)); // respostas fora de ordem
      aoMesmoTempo--;
      return original.subarray(offset, offset + limite);
    },
  });
  assert.ok(fs.readFileSync(arquivo).equals(original));
  assert.equal(maximo, 4);
  assert.equal(progresso.at(-1), total);
  await assert.rejects(baixarEmPedacos({ total, arquivo, pedir: async () => Buffer.alloc(10) }), /pela metade/);
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('Telegram: título curto para o vídeo', () => {
  const { tituloCurto } = require('../src/main/telegramConta');
  assert.equal(tituloCurto('O BATISMO NO ESPÍRITO SANTO É O SELO DE APROVAÇÃO DA HONRA OFERECIDA A DEUS…'), 'O BATISMO NO ESPÍRITO SANTO É O SELO DE APROVAÇÃO…');
  assert.equal(tituloCurto('OS ESCOLHIDOS DE DEUS…'), 'OS ESCOLHIDOS DE DEUS…');
  assert.equal(tituloCurto('Culto de hoje. Venha com a família toda, traga um amigo!\nlink'), 'Culto de hoje.');
  assert.equal(tituloCurto('O QUE APROVEITA AO HOMEM GANHAR O MUNDO INTEIRO, SE PERDER A SUA ALMA?'), 'O QUE APROVEITA AO HOMEM GANHAR O MUNDO INTEIRO…');
  assert.ok(tituloCurto('x'.repeat(200)).length <= 50);
});
