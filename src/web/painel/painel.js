// Painel do Notebook: preparar as Reuniões, cuidar da Biblioteca, dos Pastores e das telas.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TIPO = { imagem: 'Imagem', video: 'Vídeo' };

  let M = null;                 // último pacote do Notebook
  let chaveDados = '';
  let precisaDesenhar = false;
  const S = {
    aba: 'reunioes',
    aberta: null,               // id da reunião sendo preparada
    form: null,                 // { modo: 'nova'|'editar', id?, copiarDe?, pastorId, data, hora, nome }
    verAnteriores: false,
    bibAba: 'video',
    renomear: null,             // id do arquivo sendo renomeado
    escolher: null,             // { aba, sel: Set } janela "Da Biblioteca"
    testar: null,               // índice do item no "Testar"
    pastorForm: null,           // { id?, nome, versao }
  };

  // ---------- conexão ----------
  let seq = 0;
  const esperando = new Map();
  const conexao = window.Auxilio.conectar({
    papel: 'painel',
    aoReceber: m => {
      if (m.tipo === 'estado') receber(m);
      else if (m.tipo === 'resposta') { esperando.get(m.pedido)?.(m.resposta); esperando.delete(m.pedido); }
      else if (m.tipo === 'erro') avisar(m.mensagem);
    },
    aoMudar: () => {},
  });
  const enviar = cmd => conexao.enviar(cmd);
  const pedir = cmd => new Promise(res => { const p = ++seq; esperando.set(p, res); enviar({ ...cmd, pedido: p }); });
  const midia = nome => conexao.midia(nome);
  $('reserva').src = `/controle/?t=${encodeURIComponent(conexao.token)}&local=1`;

  function receber(m) {
    M = m;
    desenharFixos();
    // O tempo do vídeo muda toda hora durante a reunião; isso não muda nada aqui.
    const chave = JSON.stringify({ ...m, estado: { ...m.estado, video: null }, info: { ...m.info, qrSvg: null } });
    if (chave === chaveDados) return;
    chaveDados = chave;
    if (S.aberta && !M.reunioesCompletas.some(r => r.id === S.aberta)) S.aberta = null;
    desenhar();
  }

  // ---------- datas ----------
  const dataObj = d => { const [a, m, dd] = d.split('-').map(Number); return new Date(a, m - 1, dd); };
  const diaSemana = d => dataObj(d).toLocaleDateString('pt-BR', { weekday: 'long' });
  const ddmm = d => d.split('-').reverse().slice(0, 2).join('/');
  const ddmmaaaa = d => d.split('-').reverse().join('/');
  const tituloReuniao = r => r.nome || `Reunião de ${diaSemana(r.data)}`;
  function proximoDomingo(hoje) {
    const d = dataObj(hoje);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // ---------- partes fixas (topo, QR) ----------
  let ultimoQr = '';
  function desenharFixos() {
    const i = M.info;
    const tv = i.tv === 'tv' ? '<span class="pill ok">TV ligada</span>' : '<span class="pill atencao">TV não encontrada</span>';
    const cel = i.celulares > 0
      ? `<span class="pill ok">📱 ${i.celulares} ${i.celulares === 1 ? 'celular' : 'celulares'}</span>`
      : '<span class="pill">📱 nenhum celular</span>';
    const agora = M.reuniao ? `<span class="pill ok">● ${esc(tituloReuniao(M.reuniao))}</span>` : '';
    $('status').innerHTML = agora + tv + cel;
    if (i.qrSvg !== ultimoQr) { $('qr').innerHTML = i.qrSvg; ultimoQr = i.qrSvg; }
    $('url').textContent = i.url;
  }

  // ---------- desenho principal ----------
  function desenhar() {
    for (const b of $('abas').children) b.classList.toggle('sel', b.dataset.aba === S.aba);
    $('aba-celular').hidden = S.aba !== 'celular';
    $('aba-reserva').hidden = S.aba !== 'reserva';
    $('conteudo').hidden = S.aba === 'celular' || S.aba === 'reserva';
    if (!M) return;

    // Não redesenha no meio de um arrasto (o item sumiria da mão).
    if (arrastandoItem) { precisaDesenhar = true; return; }
    // Não apaga o que a pessoa está digitando; desenha quando ela sair do campo.
    const foco = document.activeElement;
    if (foco && foco.matches('input[type="text"], input[type="date"], input[type="time"]') && (foco.closest('#conteudo') || foco.closest('#modal'))) {
      precisaDesenhar = true;
      return;
    }
    precisaDesenhar = false;

    let html = '';
    if (S.aba === 'reunioes') html = S.aberta ? editor() : listaReunioes();
    else if (S.aba === 'biblioteca') html = biblioteca();
    else if (S.aba === 'config') html = configuracoes();
    $('conteudo').innerHTML = html;
    $('modal').innerHTML = S.escolher ? janelaEscolher() : S.testar != null ? janelaTestar() : '';
    const v = document.querySelector('#modal video'); if (v) v.volume = 0.5;
  }
  document.addEventListener('focusout', () => setTimeout(() => { if (precisaDesenhar) desenhar(); }, 0));

  // ---------- Reuniões: lista ----------
  function listaReunioes() {
    const hoje = M.hoje;
    const lista = M.reunioes;
    const deHoje = lista.filter(r => r.data === hoje);
    const proximas = lista.filter(r => r.data > hoje);
    const anteriores = lista.filter(r => r.data < hoje).reverse();
    const semPastor = M.pastores.length === 0
      ? `<div class="chamada">Cadastre os pastores primeiro, para cada reunião ter o nome de quem vai conduzir.
          <button class="btn sm" data-a="aba" data-v="config">Cadastrar pastores</button></div>` : '';

    const linha = r => `<div class="reuniao ${M.estado.reuniaoId === r.id ? 'agora' : ''}">
        <div class="quando"><span class="dia">${esc(diaSemana(r.data).slice(0, 3))} ${ddmm(r.data)}</span><span class="hora">${esc(r.hora)}</span></div>
        <div><div class="t">${esc(tituloReuniao(r))}</div>
          <div class="d">${r.pastor ? esc(r.pastor) : 'Sem pastor'} · ${r.qtd} ${r.qtd === 1 ? 'item' : 'itens'}
          ${M.estado.reuniaoId === r.id ? ' · <span class="ao-vivo">acontecendo agora</span>' : ''}</div></div>
        <div class="acoes">
          <button class="btn primary sm" data-a="abrir" data-v="${r.id}">Abrir</button>
          <button class="btn sm" data-a="copiar" data-v="${r.id}" title="Nova reunião com as mesmas músicas e versículos">📋 Copiar</button>
          <button class="btn danger sm" data-a="apagarReuniao" data-v="${r.id}">🗑</button>
        </div></div>`;
    const grupo = (titulo, itens, vazio) => `<div class="grupo"><div class="eyebrow">${titulo}</div>
        ${itens.length ? itens.map(linha).join('') : `<p class="note">${vazio}</p>`}</div>`;

    let ant = '';
    if (anteriores.length) {
      const mostrar = S.verAnteriores ? anteriores : anteriores.slice(0, 3);
      ant = `<div class="grupo"><div class="eyebrow">Anteriores</div>${mostrar.map(linha).join('')}
        ${anteriores.length > 3 ? `<div><button class="btn sm" data-a="verAnteriores">${S.verAnteriores ? 'Mostrar menos' : `Mostrar todas (${anteriores.length})`}</button></div>` : ''}</div>`;
    }

    return `<div class="pagina">
      <div class="cabeca"><h1>Reuniões</h1>
        ${S.form ? '' : '<button class="btn primary huge" data-a="nova">+ Nova reunião</button>'}</div>
      ${semPastor}
      ${S.form ? formReuniao() : ''}
      ${grupo('Hoje', deHoje, 'Nenhuma reunião hoje.')}
      ${grupo('Próximas', proximas, 'Nenhuma reunião marcada para os próximos dias.')}
      ${ant}
    </div>`;
  }

  function formReuniao() {
    const f = S.form;
    const origem = f.copiarDe && M.reunioesCompletas.find(r => r.id === f.copiarDe);
    const titulo = f.modo === 'editar' ? 'Dados da reunião' : origem ? 'Copiar reunião' : 'Nova reunião';
    return `<form class="caixa" id="form-reuniao" autocomplete="off">
      <h2>${titulo}</h2>
      ${origem ? `<p class="note">Copiando "${esc(tituloReuniao(origem))}" de ${ddmmaaaa(origem.data)}. Músicas e versículos vêm junto; fotos e vídeos não, porque são da semana.</p>` : ''}
      <div class="campo"><span>Quem vai conduzir?</span>
        <div class="escolha">
          ${M.pastores.map(p => `<button type="button" class="btn ${f.pastorId === p.id ? 'sel' : ''}" data-a="formPastor" data-v="${p.id}">${esc(p.nome)}</button>`).join('')}
          ${M.pastores.length ? '' : '<p class="note">Nenhum pastor cadastrado. Dá para cadastrar em Configurações e escolher depois.</p>'}
        </div></div>
      <div class="linha-campos">
        <label class="campo"><span>Dia</span><input type="date" id="f-data" value="${esc(f.data)}" required></label>
        <label class="campo"><span>Horário</span><input type="time" id="f-hora" value="${esc(f.hora)}" required></label>
      </div>
      <div class="escolha">
        <button type="button" class="btn sm" data-a="formDia" data-v="${M.hoje}">Hoje</button>
        <button type="button" class="btn sm" data-a="formDia" data-v="${proximoDomingo(M.hoje)}">Próximo domingo</button>
      </div>
      <label class="campo"><span>Nome (se quiser)</span>
        <input type="text" id="f-nome" value="${esc(f.nome)}" placeholder="Ex.: Reunião de libertação" maxlength="60"></label>
      <div class="acoes">
        <button type="submit" class="btn primary">${f.modo === 'editar' ? 'Salvar' : 'Criar e começar a montar'}</button>
        <button type="button" class="btn" data-a="cancelarForm">Cancelar</button>
      </div></form>`;
  }

  // ---------- Reuniões: montar uma reunião ----------
  function miniatura(it) {
    if (it.tipo === 'imagem') return `<div class="miniatura"><img src="${midia(it.arquivo)}" alt="" loading="lazy" draggable="false"></div>`;
    if (it.tipo === 'video') return `<div class="miniatura"><video src="${midia(it.arquivo)}#t=1" preload="metadata" muted draggable="false"></video></div>`;
    return `<div class="miniatura">•</div>`;
  }

  function editor() {
    const r = M.reunioesCompletas.find(x => x.id === S.aberta);
    const naTv = M.estado.reuniaoId === r.id && M.estado.tv.tipo === 'item' ? M.estado.tv.itemId : null;
    const itens = r.itens.map((it, i) => `<div class="item ${naTv === it.id ? 'na-tv' : ''}" draggable="true" data-item="${it.id}" title="Arraste para mudar a ordem">
        <span class="n"><span class="alca" aria-hidden="true">⠿</span><span class="num">${i + 1}</span></span>${miniatura(it)}
        <div><div class="t">${esc(it.titulo)}</div><div class="d">${TIPO[it.tipo] || it.tipo}${naTv === it.id ? ' · <span class="ao-vivo">na TV agora</span>' : ''}</div></div>
        <div class="acoes">
          <button class="btn" data-a="mover" data-v="${it.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
          <button class="btn" data-a="mover" data-v="${it.id}" data-d="1" ${i === r.itens.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
          <button class="btn danger" data-a="tirar" data-v="${it.id}" aria-label="Tirar da reunião">🗑</button>
        </div></div>`).join('');

    return `<div class="pagina">
      <div><button class="btn sm" data-a="fechar">◀ Todas as reuniões</button></div>
      ${S.form ? formReuniao() : `<div class="cabeca">
        <div class="pilha" style="gap:4px">
          <h1>${esc(tituloReuniao(r))}</h1>
          <div class="note" style="font-size:18px; text-transform:capitalize">${esc(diaSemana(r.data))}, ${ddmmaaaa(r.data)} · ${esc(r.hora)} · ${r.pastor ? esc(r.pastor) : 'sem pastor'}</div>
        </div>
        <div class="acoes">
          <button class="btn" data-a="editarDados">✏️ Mudar dia, hora ou pastor</button>
          <button class="btn primary" data-a="testar" ${r.itens.length ? '' : 'disabled'}>▶ Testar</button>
        </div></div>`}
      ${r.itens.length ? `<div class="itens">${itens}</div>` : `<div class="vazio"><div class="grande">📭</div><div>Esta reunião ainda está vazia.</div></div>`}
      <div class="adicionar">
        <div class="acoes">
          <button class="btn primary huge" data-a="importar">+ Fotos e vídeos do computador</button>
          <button class="btn huge" data-a="daBiblioteca">🗂️ Da Biblioteca</button>
        </div>
        <p class="note">Ou arraste os arquivos para esta janela. Eles entram no fim da lista, na ordem do WhatsApp.
          Para mudar a ordem, arraste um item para cima ou para baixo, ou use as setas ↑ ↓.</p>
      </div>
    </div>`;
  }

  // ---------- Biblioteca ----------
  function cartaoArquivo(b, modo) {
    const marcado = modo === 'escolher' && S.escolher.sel.has(b.id);
    const thumb = miniatura(b);
    if (modo === 'escolher') {
      return `<button class="arq escolher ${marcado ? 'marcado' : ''}" data-a="marcar" data-v="${b.id}">${thumb}
        <div class="info"><div class="t">${marcado ? '✔ ' : ''}${esc(b.titulo)}</div><div class="d">Adicionado em ${ddmm(b.criadoEm)}</div></div></button>`;
    }
    const nome = S.renomear === b.id
      ? `<form data-renomear="${b.id}"><input type="text" id="renomear-${b.id}" value="${esc(b.titulo)}" maxlength="80"></form>`
      : `<div class="t">${esc(b.titulo)}</div>`;
    const antigo = M.antigos.includes(b.id);
    return `<div class="arq">${thumb}
      <div class="info">${nome}<div class="d">Adicionado em ${ddmm(b.criadoEm)} · ${b.usos ? `em ${b.usos} ${b.usos === 1 ? 'reunião' : 'reuniões'}` : 'não está em reunião'}${antigo ? ' · antigo' : ''}</div></div>
      <div class="acoes">
        ${S.renomear === b.id
          ? `<button class="btn primary" data-a="salvarNome" data-v="${b.id}">Salvar</button><button class="btn" data-a="cancelarNome">Cancelar</button>`
          : `<button class="btn" data-a="renomear" data-v="${b.id}">✏️ Nome</button><button class="btn danger" data-a="apagarArquivo" data-v="${b.id}">🗑 Apagar</button>`}
      </div></div>`;
  }

  function subAbas(atual, acao) {
    const qtd = t => M.biblioteca.filter(b => b.tipo === t).length;
    return `<div class="sub-abas">
      <button class="btn ${atual === 'video' ? 'sel' : ''}" data-a="${acao}" data-v="video">🎬 Vídeos (${qtd('video')})</button>
      <button class="btn ${atual === 'imagem' ? 'sel' : ''}" data-a="${acao}" data-v="imagem">🖼️ Imagens (${qtd('imagem')})</button>
    </div>`;
  }

  function biblioteca() {
    const lista = M.biblioteca.filter(b => b.tipo === S.bibAba).slice().reverse();
    const antigos = M.antigos.length;
    return `<div class="pagina">
      <div class="cabeca"><h1>Biblioteca</h1>
        <div class="acoes">
          <button class="btn primary" data-a="importar">+ Adicionar arquivos</button>
          <button class="btn danger" data-a="apagarAntigos" ${antigos ? '' : 'disabled'}>🗑 Apagar antigos (${antigos})</button>
        </div></div>
      <p class="note">"Apagar antigos" apaga fotos e vídeos que não foram usados nos últimos 7 dias e não estão em nenhuma reunião de hoje em diante.</p>
      ${subAbas(S.bibAba, 'bibAba')}
      ${lista.length ? `<div class="grade">${lista.map(b => cartaoArquivo(b)).join('')}</div>`
        : `<div class="vazio"><div class="grande">🗂️</div><div>Nenhum${S.bibAba === 'video' ? ' vídeo' : 'a imagem'} ainda.</div></div>`}
    </div>`;
  }

  function janelaEscolher() {
    const e = S.escolher;
    const lista = M.biblioteca.filter(b => b.tipo === e.aba).slice().reverse();
    return `<div class="fundo-modal"><div class="janela" role="dialog" aria-label="Escolher da Biblioteca">
      <header><h2>Escolher da Biblioteca</h2><button class="btn sm" data-a="fecharModal">✕ Fechar</button></header>
      <div class="corpo">${subAbas(e.aba, 'escolherAba')}
        ${lista.length ? `<div class="grade">${lista.map(b => cartaoArquivo(b, 'escolher')).join('')}</div>` : '<div class="vazio">Nada aqui ainda.</div>'}
        <p class="note">Toque nos arquivos para marcar. Eles entram no fim da reunião, na ordem em que foram marcados.</p></div>
      <footer><span class="note">${e.sel.size} marcado(s)</span>
        <button class="btn primary" data-a="colocar" ${e.sel.size ? '' : 'disabled'}>Colocar na reunião</button></footer>
    </div></div>`;
  }

  function janelaTestar() {
    const r = M.reunioesCompletas.find(x => x.id === S.aberta);
    if (!r || !r.itens.length) { S.testar = null; return ''; }
    const i = Math.max(0, Math.min(r.itens.length - 1, S.testar));
    const it = r.itens[i];
    const palco = it.tipo === 'imagem'
      ? `<img src="${midia(it.arquivo)}" alt="">`
      : `<video src="${midia(it.arquivo)}" controls autoplay></video>`;
    return `<div class="fundo-modal"><div class="janela" role="dialog" aria-label="Testar a reunião">
      <header><h2>Testar · ${i + 1} de ${r.itens.length}: ${esc(it.titulo)}</h2><button class="btn sm" data-a="fecharModal">✕ Fechar</button></header>
      <div class="corpo"><div class="palco">${palco}</div>
        <p class="note">Assim aparece na TV. Este teste não mexe na TV da igreja.</p></div>
      <footer>
        <button class="btn" data-a="testarPasso" data-v="-1" ${i === 0 ? 'disabled' : ''}>◀ Anterior</button>
        <button class="btn primary" data-a="testarPasso" data-v="1" ${i === r.itens.length - 1 ? 'disabled' : ''}>Próximo ▶</button>
      </footer></div></div>`;
  }

  // ---------- Configurações ----------
  function configuracoes() {
    const f = S.pastorForm;
    const formPastor = f ? `<form class="caixa" id="form-pastor" autocomplete="off">
        <label class="campo"><span>Nome do pastor</span><input type="text" id="p-nome" value="${esc(f.nome)}" placeholder="Ex.: Pr. João" maxlength="40"></label>
        <div class="campo"><span>Bíblia preferida</span><div class="escolha">
          ${['ACF', 'NVI'].map(v => `<button type="button" class="btn ${f.versao === v ? 'sel' : ''}" data-a="pastorVersao" data-v="${v}">${v}</button>`).join('')}</div></div>
        <div class="acoes"><button type="submit" class="btn primary">Salvar</button><button type="button" class="btn" data-a="cancelarPastor">Cancelar</button></div>
      </form>` : '';
    const pastores = M.pastores.map(p => `<div class="pastor">
        <div><div class="t">${esc(p.nome)}</div><div class="note">Bíblia ${p.versao}</div></div>
        <div class="acoes"><button class="btn sm" data-a="editarPastor" data-v="${p.id}">✏️ Editar</button>
          <button class="btn danger sm" data-a="removerPastor" data-v="${p.id}">🗑</button></div></div>`).join('');
    const espera = M.info.telaEspera
      ? `<div class="espera-mini"><img src="${midia(M.info.telaEspera)}" alt="Tela de espera atual"></div>`
      : `<div class="espera-mini">Seja bem-vindo</div>`;

    return `<div class="pagina">
      <h1>Configurações</h1>
      <section class="caixa">
        <div class="cabeca"><h2>Pastores</h2>${f ? '' : '<button class="btn primary sm" data-a="novoPastor">+ Adicionar pastor</button>'}</div>
        ${formPastor}
        ${pastores || (f ? '' : '<p class="note">Nenhum pastor cadastrado.</p>')}
      </section>
      <section class="caixa">
        <h2>Tela de espera</h2>
        <p class="note">A imagem que aparece na TV antes e depois da reunião.</p>
        ${espera}
        <div class="acoes"><button class="btn" data-a="trocarEspera">Trocar imagem</button></div>
      </section>
      <section class="caixa">
        <h2>Monitores</h2>
        <p class="note">${M.info.tv === 'tv' ? 'A TV está ligada.' : 'A TV não foi encontrada. O Telão está numa janela.'}
          ${M.info.telas > 1 ? 'Se a TV e o notebook estiverem trocados, use o botão abaixo.' : ''}</p>
        ${M.info.telas > 1 ? '<div class="acoes"><button class="btn" data-a="trocarTelas">Trocar TV ⇄ notebook</button></div>' : ''}
      </section>
    </div>`;
  }

  // ---------- ações ----------
  let avisoTimer;
  function avisar(texto) {
    const el = $('aviso');
    el.textContent = texto; el.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { el.hidden = true; }, 4000);
  }
  function avisarImportacao(r) {
    if (!r) return;
    let t = r.qtd ? `${r.qtd} ${r.qtd === 1 ? 'arquivo adicionado' : 'arquivos adicionados'}.` : 'Nenhum arquivo adicionado.';
    if (r.ignorados) t += ` ${r.ignorados} não ${r.ignorados === 1 ? 'é' : 'são'} foto nem vídeo e ficou de fora.`;
    avisar(t);
  }
  const reuniaoAberta = () => M.reunioesCompletas.find(x => x.id === S.aberta);

  function lerForm() {
    if (!S.form) return;
    const v = id => $(id)?.value;
    if ($('f-data')) S.form.data = v('f-data');
    if ($('f-hora')) S.form.hora = v('f-hora');
    if ($('f-nome')) S.form.nome = v('f-nome');
  }

  const ACOES = {
    aba: v => { S.aba = v; S.form = null; S.renomear = null; },
    nova: () => { S.form = { modo: 'nova', pastorId: M.pastores.length === 1 ? M.pastores[0].id : null, data: M.hoje, hora: '19:00', nome: '' }; },
    copiar: v => {
      const o = M.reunioesCompletas.find(r => r.id === v);
      S.aberta = null;
      S.form = { modo: 'nova', copiarDe: v, pastorId: o.pastorId, data: proximoDomingo(M.hoje), hora: o.hora, nome: o.nome };
      window.scrollTo({ top: 0 });
    },
    editarDados: () => {
      const r = reuniaoAberta();
      S.form = { modo: 'editar', id: r.id, pastorId: r.pastorId, data: r.data, hora: r.hora, nome: r.nome };
    },
    cancelarForm: () => { S.form = null; },
    formPastor: v => { lerForm(); S.form.pastorId = S.form.pastorId === v ? null : v; },
    formDia: v => { lerForm(); S.form.data = v; },
    abrir: v => { S.aberta = v; S.form = null; window.scrollTo({ top: 0 }); },
    fechar: () => { S.aberta = null; S.form = null; },
    apagarReuniao: v => {
      const r = M.reunioesCompletas.find(x => x.id === v);
      const agora = M.estado.reuniaoId === v ? '\n\nEla está acontecendo agora: a TV volta para a tela de espera.' : '';
      if (confirm(`Apagar "${tituloReuniao(r)}" de ${ddmmaaaa(r.data)}?\nOs arquivos continuam na Biblioteca.${agora}`)) enviar({ cmd: 'removerReuniao', id: v });
    },
    verAnteriores: () => { S.verAnteriores = !S.verAnteriores; },
    mover: (v, el) => enviar({ cmd: 'moverItem', reuniaoId: S.aberta, itemId: v, delta: Number(el.dataset.d) }),
    tirar: v => enviar({ cmd: 'removerItem', reuniaoId: S.aberta, itemId: v }),
    importar: async () => {
      const r = await window.notebook.importarDialogo(S.aba === 'reunioes' ? S.aberta : null);
      avisarImportacao(r);
    },
    daBiblioteca: () => { S.escolher = { aba: 'video', sel: new Set() }; },
    escolherAba: v => { S.escolher.aba = v; },
    marcar: v => { const s = S.escolher.sel; s.has(v) ? s.delete(v) : s.add(v); },
    colocar: () => {
      enviar({ cmd: 'adicionarItens', reuniaoId: S.aberta, bibliotecaIds: [...S.escolher.sel] });
      avisar(`${S.escolher.sel.size} colocado(s) na reunião.`);
      S.escolher = null;
    },
    fecharModal: () => { S.escolher = null; S.testar = null; },
    testar: () => { S.testar = 0; },
    testarPasso: v => { S.testar += Number(v); },
    bibAba: v => { S.bibAba = v; S.renomear = null; },
    renomear: v => { S.renomear = v; setTimeout(() => { const i = $('renomear-' + v); if (i) { i.focus(); i.select(); } }); },
    salvarNome: v => salvarNome(v),
    cancelarNome: () => { S.renomear = null; },
    apagarArquivo: v => {
      const b = M.biblioteca.find(x => x.id === v);
      const uso = b.usos ? `\n\nEle está em ${b.usos} ${b.usos === 1 ? 'reunião' : 'reuniões'} e vai sair de lá também.` : '';
      if (confirm(`Apagar "${b.titulo}" da Biblioteca?${uso}`)) enviar({ cmd: 'removerDaBiblioteca', id: v });
    },
    apagarAntigos: () => {
      const n = M.antigos.length;
      if (confirm(`Apagar ${n} ${n === 1 ? 'arquivo antigo' : 'arquivos antigos'}?\nSão fotos e vídeos sem uso há mais de 7 dias e fora das próximas reuniões.`)) {
        enviar({ cmd: 'apagarAntigos' }); avisar(`${n} apagado(s).`);
      }
    },
    novoPastor: () => { S.pastorForm = { nome: '', versao: 'ACF' }; setTimeout(() => $('p-nome')?.focus()); },
    editarPastor: v => { const p = M.pastores.find(x => x.id === v); S.pastorForm = { ...p }; },
    pastorVersao: v => { S.pastorForm.nome = $('p-nome')?.value ?? S.pastorForm.nome; S.pastorForm.versao = v; },
    cancelarPastor: () => { S.pastorForm = null; },
    removerPastor: v => {
      const p = M.pastores.find(x => x.id === v);
      if (confirm(`Remover ${p.nome}?\nAs reuniões dele continuam, mas ficam sem pastor.`)) enviar({ cmd: 'removerPastor', id: v });
    },
    trocarEspera: () => window.notebook.trocarTelaEspera(),
    trocarTelas: () => window.notebook.trocarTelas(),
  };

  function salvarNome(v) {
    const titulo = $('renomear-' + v)?.value;
    S.renomear = null;
    if (titulo && titulo.trim()) enviar({ cmd: 'renomearArquivo', id: v, titulo });
    desenhar();
  }

  document.addEventListener('click', ev => {
    const aba = ev.target.closest('#abas [data-aba]');
    if (aba) { ACOES.aba(aba.dataset.aba); desenhar(); return; }
    const el = ev.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = ACOES[el.dataset.a];
    if (!fn) return;
    const r = fn(el.dataset.v, el);
    if (r && typeof r.then === 'function') return;
    desenhar();
  });

  document.addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    if (f.id === 'form-reuniao') {
      lerForm();
      const { modo, id, copiarDe, pastorId, data, hora, nome } = S.form;
      if (!data || !hora) { avisar('Preencha o dia e o horário.'); return; }
      if (modo === 'editar') {
        enviar({ cmd: 'editarReuniao', id, campos: { pastorId, data, hora, nome } });
        S.form = null;
      } else {
        const r = await pedir({ cmd: 'criarReuniao', pastorId, data, hora, nome, copiarDe });
        S.form = null;
        if (r) S.aberta = r.id;
      }
      document.activeElement?.blur();
      desenhar();
    } else if (f.id === 'form-pastor') {
      const nome = $('p-nome').value.trim();
      if (!nome) { avisar('Escreva o nome do pastor.'); return; }
      enviar({ cmd: 'salvarPastor', id: S.pastorForm.id, nome, versao: S.pastorForm.versao });
      S.pastorForm = null;
      document.activeElement?.blur();
      desenhar();
    } else if (f.dataset.renomear) {
      salvarNome(f.dataset.renomear);
    }
  });

  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && (S.escolher || S.testar != null)) { ACOES.fecharModal(); desenhar(); }
    if (ev.key === 'Escape' && S.renomear) { S.renomear = null; desenhar(); }
    if (S.testar != null && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) {
      const n = reuniaoAberta()?.itens.length || 0;
      const novo = S.testar + (ev.key === 'ArrowRight' ? 1 : -1);
      if (novo >= 0 && novo < n) { S.testar = novo; desenhar(); }
    }
  });

  // ---------- arrastar um item para mudar a ordem ----------
  // Enquanto arrasta, os outros itens já abrem espaço (prévia). Só grava ao soltar.
  let arrastandoItem = null;
  let elArrastado = null;
  const metadeDeBaixo = (ev, el) => { const r = el.getBoundingClientRect(); return ev.clientY > r.top + r.height / 2; };
  function renumerar(lista) {
    [...lista.children].forEach((el, i) => { const n = el.querySelector('.num'); if (n) n.textContent = i + 1; });
  }

  document.addEventListener('dragstart', ev => {
    const el = ev.target.closest && ev.target.closest('.item[data-item]');
    if (!el) return;
    arrastandoItem = el.dataset.item;
    elArrastado = el;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/x-item', arrastandoItem);
    setTimeout(() => el.classList.add('arrastando'));
  });
  document.addEventListener('dragover', ev => {
    if (!arrastandoItem) return;
    const lista = elArrastado.parentElement;
    if (!ev.target.closest('.itens')) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    const alvo = ev.target.closest('.item[data-item]');
    if (!alvo || alvo === elArrastado) return;
    const filhos = [...lista.children];
    const iEl = filhos.indexOf(elArrastado), iAlvo = filhos.indexOf(alvo);
    // Só troca depois de passar da metade do vizinho, para não ficar pulando.
    if (iEl < iAlvo && metadeDeBaixo(ev, alvo)) lista.insertBefore(elArrastado, alvo.nextSibling);
    else if (iEl > iAlvo && !metadeDeBaixo(ev, alvo)) lista.insertBefore(elArrastado, alvo);
    else return;
    renumerar(lista);
  });
  document.addEventListener('drop', ev => {
    if (!arrastandoItem || !ev.target.closest('.itens')) return;
    ev.preventDefault();
    const r = reuniaoAberta();
    if (!r) return;
    const de = r.itens.findIndex(i => i.id === arrastandoItem);
    const para = [...elArrastado.parentElement.children].indexOf(elArrastado);
    if (de < 0 || para === de) return;
    // Já mostra a ordem nova enquanto o notebook grava.
    const [it] = r.itens.splice(de, 1);
    r.itens.splice(para, 0, it);
    enviar({ cmd: 'moverItem', reuniaoId: S.aberta, itemId: arrastandoItem, delta: para - de });
  });
  document.addEventListener('dragend', () => {
    if (!arrastandoItem) return;
    arrastandoItem = null;
    elArrastado = null;
    // Soltou fora da lista ou apertou Esc: redesenha e tudo volta para o lugar.
    desenhar();
  });

  // ---------- arrastar arquivos para a janela ----------
  let arrastando = 0;
  const temArquivos = ev => Array.from(ev.dataTransfer?.types || []).includes('Files');
  document.addEventListener('dragenter', ev => { if (!temArquivos(ev)) return; arrastando++; $('soltar').hidden = false; });
  document.addEventListener('dragleave', ev => { if (!temArquivos(ev)) return; if (--arrastando <= 0) { arrastando = 0; $('soltar').hidden = true; } });
  document.addEventListener('dragover', ev => { if (temArquivos(ev)) ev.preventDefault(); });
  document.addEventListener('drop', async ev => {
    if (!temArquivos(ev)) return;
    ev.preventDefault();
    arrastando = 0; $('soltar').hidden = true;
    const destino = S.aba === 'reunioes' && S.aberta ? S.aberta : null;
    if (!destino && S.aba !== 'biblioteca') { S.aba = 'biblioteca'; desenhar(); }
    avisarImportacao(await window.notebook.importarArquivos(ev.dataTransfer.files, destino));
  });

  desenhar();
})();
