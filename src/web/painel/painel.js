// Painel do Notebook: preparar as Reuniões, cuidar da Biblioteca, dos Pastores e das telas.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TIPO = { imagem: 'Imagem', video: 'Vídeo', palavra: 'Palavra', fundo: 'Fundo', musica: 'Música · toca sem mudar a TV', pregacao: 'Pregação' };

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
    verso: null,                // janela "+ Versículo": { etapa, test, l, c, de, sel, versao }
    fundo: false,               // janela "Fundo dos versículos"
    previaTestar: null,         // texto do versículo no "Testar"
  };
  const ULTIMO_DO_AT = 38;
  const indices = {};
  function indice(v) {
    if (indices[v] && indices[v] !== 'carregando') return indices[v];
    if (!indices[v]) {
      indices[v] = 'carregando';
      fetch(`/api/biblia?t=${encodeURIComponent(conexao.token)}&v=${v}`).then(r => r.json()).then(j => { indices[v] = j; desenhar(); });
    }
    return null;
  }
  const textoApi = (v, r) => fetch(`/api/texto?t=${encodeURIComponent(conexao.token)}&v=${v}&l=${r.l}&c=${r.c}&de=${r.v}&ate=${r.ate || r.v}`).then(x => x.json());

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
    $('modal').innerHTML = S.escolher ? janelaEscolher() : S.testar != null ? janelaTestar() : S.verso ? janelaVerso() : S.fundo ? janelaFundo() : '';
    window.Versiculo.ajustar(document.body);
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
  function fundoCss(f) { return window.Versiculo.estiloFundo(f, midia).bg; }
  function miniatura(it) {
    if (it.tipo === 'palavra') return `<div class="miniatura" style='background:${fundoCss(reuniaoAberta()?.fundo)}'>📖</div>`;
    if (it.tipo === 'fundo') return `<div class="miniatura" style='background:${fundoCss({ arquivo: it.arquivo })}'></div>`;
    if (it.tipo === 'imagem') return `<div class="miniatura"><img src="${midia(it.arquivo)}" alt="" loading="lazy" draggable="false"></div>`;
    if (it.tipo === 'musica') return `<div class="miniatura musica">🎵</div>`;
    if (it.tipo === 'pregacao') return `<div class="miniatura"><img src="${midia(it.arquivo)}" alt="" loading="lazy" draggable="false"><span class="qtd">${it.arquivos.length}</span></div>`;
    if (it.tipo === 'video') return `<div class="miniatura"><video src="${midia(it.arquivo)}#t=1" preload="metadata" muted draggable="false"></video></div>`;
    return `<div class="miniatura">•</div>`;
  }

  function linhasPassagens(it, r) {
    const n = it.passagens.length;
    return `<div class="passagens">${it.passagens.map((p, i) => `<div class="passagem">
        <span class="pn">${i + 1}.</span>
        <div><div class="t">${esc(p.titulo)}</div><div class="d">${p.ate > p.ref.v ? `${p.ate - p.ref.v + 1} versículos, um por tela` : '1 versículo'} · Bíblia ${p.versao ? p.versao : `${r.versao} (do pastor)`}</div></div>
        <div class="acoes">
          <button class="btn sm" data-a="moverPassagem" data-v="${p.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
          <button class="btn sm" data-a="moverPassagem" data-v="${p.id}" data-d="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
          <button class="btn sm danger" data-a="tirarPassagem" data-v="${p.id}" aria-label="Tirar versículo">🗑</button>
        </div></div>`).join('')}
      <div><button class="btn sm" data-a="abrirVerso">📖 + Outro versículo</button></div></div>`;
  }

  function editor() {
    const r = M.reunioesCompletas.find(x => x.id === S.aberta);
    const naTv = M.estado.reuniaoId === r.id && M.estado.tv.tipo === 'item' ? M.estado.tv.itemId : null;
    const itens = r.itens.map((it, i) => `<div class="item ${naTv === it.id ? 'na-tv' : ''}" draggable="true" data-item="${it.id}" title="Arraste para mudar a ordem">
        <span class="n"><span class="alca" aria-hidden="true">⠿</span><span class="num">${i + 1}</span></span>${miniatura(it)}
        <div><div class="t">${it.tipo === 'palavra' ? '📖 Palavra' : esc(it.titulo)}</div><div class="d">${it.tipo === 'palavra'
          ? `${it.passagens.length} ${it.passagens.length === 1 ? 'passagem' : 'passagens'} · no celular é um cartão só, com as setas ◀ ▶`
          : it.tipo === 'pregacao' ? `Pregação · ${it.arquivos.length} imagens · no celular passa com ◀ ▶`
          : TIPO[it.tipo] || it.tipo}${naTv === it.id ? ' · <span class="ao-vivo">na TV agora</span>' : ''}</div></div>
        <div class="acoes">
          <button class="btn" data-a="mover" data-v="${it.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
          <button class="btn" data-a="mover" data-v="${it.id}" data-d="1" ${i === r.itens.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
          <button class="btn danger" data-a="tirar" data-v="${it.id}" aria-label="Tirar da reunião">🗑</button>
        </div>${it.tipo === 'palavra' ? linhasPassagens(it, r) : ''}</div>`).join('');

    return `<div class="pagina">
      <div><button class="btn sm" data-a="fechar">◀ Todas as reuniões</button></div>
      ${S.form ? formReuniao() : `<div class="cabeca">
        <div class="pilha" style="gap:4px">
          <h1>${esc(tituloReuniao(r))}</h1>
          <div class="note" style="font-size:18px; text-transform:capitalize">${esc(diaSemana(r.data))}, ${ddmmaaaa(r.data)} · ${esc(r.hora)} · ${r.pastor ? esc(r.pastor) : 'sem pastor'}</div>
        </div>
        <div class="acoes">
          <button class="btn" data-a="editarDados">✏️ Mudar dia, hora ou pastor</button>
          <button class="btn" data-a="abrirFundo"><span class="bolinha" style='background:${fundoCss(r.fundo)}'></span> Fundo dos versículos</button>
          <button class="btn primary" data-a="testar" ${r.itens.length ? '' : 'disabled'}>▶ Testar</button>
        </div></div>`}
      ${r.itens.length ? `<div class="itens">${itens}</div>` : `<div class="vazio"><div class="grande">📭</div><div>Esta reunião ainda está vazia.</div></div>`}
      <div class="adicionar">
        <div class="acoes">
          <button class="btn primary huge" data-a="importar">+ Fotos, vídeos e músicas</button>
          <button class="btn primary huge" data-a="novaPregacao">📑 + Pregação</button>
          <button class="btn primary huge" data-a="abrirVerso">📖 + Versículo</button>
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
      <div class="info">${nome}<div class="d">${b.arquivos ? `${b.arquivos.length} imagens · ` : ''}Adicionado em ${ddmm(b.criadoEm)} · ${b.usos ? `em ${b.usos} ${b.usos === 1 ? 'reunião' : 'reuniões'}` : 'não está em reunião'}${antigo ? ' · antigo' : ''}</div></div>
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
      <button class="btn ${atual === 'pregacao' ? 'sel' : ''}" data-a="${acao}" data-v="pregacao">📑 Pregações (${qtd('pregacao')})</button>
      <button class="btn ${atual === 'musica' ? 'sel' : ''}" data-a="${acao}" data-v="musica">🎵 Músicas (${qtd('musica')})</button>
      ${acao === 'bibAba' ? `<button class="btn ${atual === 'fundo' ? 'sel' : ''}" data-a="${acao}" data-v="fundo">🎨 Fundos de versículo (${qtd('fundo')})</button>` : ''}
    </div>`;
  }

  function biblioteca() {
    const lista = M.biblioteca.filter(b => b.tipo === S.bibAba).slice().reverse();
    const antigos = M.antigos.length;
    return `<div class="pagina">
      <div class="cabeca"><h1>Biblioteca</h1>
        <div class="acoes">
          ${S.bibAba === 'pregacao'
            ? '<button class="btn primary" data-a="novaPregacao">📑 + Nova pregação</button>'
            : `<button class="btn primary" data-a="importar">${S.bibAba === 'fundo' ? '+ Adicionar imagem de fundo' : S.bibAba === 'musica' ? '+ Adicionar músicas' : '+ Adicionar arquivos'}</button>`}
          <button class="btn danger" data-a="apagarAntigos" ${antigos ? '' : 'disabled'}>🗑 Apagar antigos (${antigos})</button>
        </div></div>
      <p class="note">"Apagar antigos" apaga fotos, vídeos e pregações que não foram usados nos últimos 7 dias e não estão em nenhuma reunião de hoje em diante. Músicas e fundos nunca são apagados por ele.</p>
      ${subAbas(S.bibAba, 'bibAba')}
      ${lista.length ? `<div class="grade">${lista.map(b => cartaoArquivo(b)).join('')}</div>`
        : `<div class="vazio"><div class="grande">${S.bibAba === 'fundo' ? '🎨' : '🗂️'}</div><div>${S.bibAba === 'video' ? 'Nenhum vídeo ainda.' : S.bibAba === 'musica' ? 'Nenhuma música ainda. Hinos, louvores e fundos de oração ficam guardados aqui para sempre.' : S.bibAba === 'pregacao' ? 'Nenhuma pregação ainda. Use "+ Nova pregação" e escolha todas as imagens que o bispo mandou.' : S.bibAba === 'fundo' ? 'Nenhum fundo próprio ainda. Os fundos que vêm no programa aparecem na hora de escolher o fundo da reunião.' : 'Nenhuma imagem ainda.'}</div></div>`}
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

  /** No "Testar", cada passagem da Palavra é uma tela. */
  const telasDoTestar = r => r.itens.flatMap(it => (it.tipo === 'palavra' ? it.passagens.map(p => ({ it, p }))
    : it.tipo === 'pregacao' ? it.arquivos.map((a, slide) => ({ it, slide })) : [{ it }]));

  function janelaTestar() {
    const r = M.reunioesCompletas.find(x => x.id === S.aberta);
    const telas = r ? telasDoTestar(r) : [];
    if (!telas.length) { S.testar = null; return ''; }
    const i = Math.max(0, Math.min(telas.length - 1, S.testar));
    const { it, p, slide } = telas[i];
    let palco;
    if (p) {
      const versao = p.versao || r.versao;
      const chave = p.id + versao;
      if (!S.previaTestar || S.previaTestar.chave !== chave) {
        S.previaTestar = { chave, texto: '…' };
        textoApi(versao, { ...p.ref, ate: p.ref.v }).then(t => { if (S.previaTestar?.chave === chave) { S.previaTestar.texto = t[0]?.texto || ''; desenhar(); } });
      }
      const rot = `${p.titulo.replace(/:\d+(-\d+)?$/, '')}:${p.ref.v}`;
      palco = window.Versiculo.html({ texto: S.previaTestar.texto, rotulo: rot, versao, fundo: r.fundo }, midia);
    } else {
      palco = it.tipo === 'imagem' ? `<img src="${midia(it.arquivo)}" alt="">`
        : it.tipo === 'pregacao' ? `<img src="${midia(it.arquivos[slide])}" alt="">`
        : it.tipo === 'musica' ? `<div class="palco-musica"><div>🎵</div><audio src="${midia(it.arquivo)}" controls></audio><p>A música toca sem mudar a TV: ela continua mostrando o item anterior.</p></div>`
        : `<video src="${midia(it.arquivo)}" controls autoplay></video>`;
    }
    return `<div class="fundo-modal"><div class="janela" role="dialog" aria-label="Testar a reunião">
      <header><h2>Testar · ${i + 1} de ${telas.length}: ${p ? 'Palavra · ' + esc(p.titulo) : esc(it.titulo) + (slide != null ? ` · imagem ${slide + 1} de ${it.arquivos.length}` : '')}</h2><button class="btn sm" data-a="fecharModal">✕ Fechar</button></header>
      <div class="corpo"><div class="palco">${palco}</div>
        <p class="note">Assim aparece na TV. Este teste não mexe na TV da igreja.${p ? ' No culto, as setas do celular passam pelos outros versículos.' : ''}</p></div>
      <footer>
        <button class="btn" data-a="testarPasso" data-v="-1" ${i === 0 ? 'disabled' : ''}>◀ Anterior</button>
        <button class="btn primary" data-a="testarPasso" data-v="1" ${i === telas.length - 1 ? 'disabled' : ''}>Próximo ▶</button>
      </footer></div></div>`;
  }

  // ---------- "+ Versículo" ----------
  const EXEMPLO_FUNDO = { texto: 'O Senhor é o meu pastor; nada me faltará.', rotulo: 'Salmos 23:1' };
  function versaoDoVerso() { return S.verso.versao || reuniaoAberta()?.versao || 'ACF'; }
  function textosDoVerso() {
    const v = S.verso;
    if (v.l == null || v.c == null || v.de == null) return null;
    const ate = v.ate || v.de;
    const chave = [versaoDoVerso(), v.l, v.c, v.de, ate].join('|');
    if (v.chave !== chave) {
      v.chave = chave; v.textos = null;
      textoApi(versaoDoVerso(), { l: v.l, c: v.c, v: v.de, ate }).then(t => { if (S.verso?.chave === chave) { S.verso.textos = t; desenhar(); } });
    }
    return v.textos;
  }
  function janelaVerso() {
    const v = S.verso;
    const r = reuniaoAberta();
    const idx = indice(versaoDoVerso());
    const cab = `<header><h2>📖 Colocar versículo na reunião</h2><button class="btn sm" data-a="fecharModal">✕ Fechar</button></header>`;
    if (!idx || !r) return `<div class="fundo-modal"><div class="janela">${cab}<div class="corpo"><div class="vazio">Abrindo a Bíblia…</div></div></div></div>`;
    const livro = v.l != null ? idx[v.l] : null;

    // Trilha: Livro › Capítulo › Versículos (tocar numa parte volta para ela)
    const trilha = `<div class="trilha">
      <button class="btn sm ${v.l == null ? 'sel' : ''}" data-a="versoVoltar" data-v="livro">${livro ? esc(livro.nome) : 'Livro'}</button><span>›</span>
      <button class="btn sm ${v.l != null && v.c == null ? 'sel' : ''}" data-a="versoVoltar" data-v="cap" ${livro ? '' : 'disabled'}>${v.c ? 'Capítulo ' + v.c : 'Capítulo'}</button><span>›</span>
      <button class="btn sm ${v.c != null ? 'sel' : ''}" disabled>Versículos</button></div>`;

    let escolha;
    if (!livro) {
      const lista = idx.filter(b => v.test === 'NT' ? b.l > ULTIMO_DO_AT : b.l <= ULTIMO_DO_AT);
      escolha = `<div class="sub-abas">
          <button class="btn ${v.test !== 'NT' ? 'sel' : ''}" data-a="versoTest" data-v="AT">Antigo Testamento</button>
          <button class="btn ${v.test === 'NT' ? 'sel' : ''}" data-a="versoTest" data-v="NT">Novo Testamento</button></div>
        <div class="livros">${lista.map(b => `<button class="btn" data-a="versoLivro" data-v="${b.l}">${esc(b.nome)}</button>`).join('')}</div>`;
    } else if (v.c == null) {
      escolha = `<div class="nums">${livro.caps.map((_, i) => `<button class="btn" data-a="versoCap" data-v="${i + 1}">${i + 1}</button>`).join('')}</div>`;
    } else {
      const qtd = livro.caps[v.c - 1] || 0;
      const fim = v.ate || v.de;
      escolha = `<p class="note">Toque no versículo. Para pegar vários (um por tela), toque também no último.</p>
        <div class="nums">${Array.from({ length: qtd }, (_, i) => i + 1).map(n => {
          const dentro = v.de != null && n >= v.de && n <= fim;
          return `<button class="btn ${dentro ? 'sel' : ''}" data-a="versoNum" data-v="${n}">${n}</button>`;
        }).join('')}</div>`;
    }

    const textos = textosDoVerso();
    const ate = v.ate || v.de;
    const rotulo = livro && v.c && v.de ? `${livro.nome} ${v.c}:${v.de}${ate > v.de ? '-' + ate : ''}` : '';
    const previa = rotulo ? `<div class="previa-verso">
        <div class="palco">${window.Versiculo.html({ texto: textos ? (textos[0]?.texto || '') : '…', rotulo: `${livro.nome} ${v.c}:${v.de}`, versao: versaoDoVerso(), fundo: r.fundo }, midia)}</div>
        ${textos && textos.length > 1 ? `<ol class="textos">${textos.map(t => `<li value="${t.v}">${esc(t.texto)}</li>`).join('')}</ol>` : ''}
      </div>` : '';

    const opcoesVersao = [[null, `Do pastor (${r.versao})`], ['ACF', 'ACF'], ['NVI', 'NVI']];
    return `<div class="fundo-modal"><div class="janela" role="dialog" aria-label="Colocar versículo">${cab}
      <div class="corpo">
        <form id="form-verso" class="busca" autocomplete="off">
          <label class="campo"><span>Já sabe qual é? Escreva aqui</span>
            <input type="text" id="v-busca" placeholder="Ex.: Salmos 23:1-6   ou   Jo 3:16" value="${esc(v.busca || '')}"></label>
          <button type="submit" class="btn primary">Achar</button></form>
        <p class="note">Ou escolha tocando:</p>
        ${trilha}${escolha}${previa}
        <div class="campo"><span>Bíblia</span><div class="escolha">
          ${opcoesVersao.map(([val, nome]) => `<button type="button" class="btn ${v.versao === val ? 'sel' : ''}" data-a="versoVersao" data-v="${val || ''}">${nome}</button>`).join('')}
        </div></div>
      </div>
      <footer><span class="t-grande">${rotulo ? esc(rotulo) + (ate > v.de ? ` · ${ate - v.de + 1} versículos` : '') : '<span class="note">Nenhum versículo escolhido ainda</span>'}</span>
        <button class="btn primary" data-a="versoColocar" ${rotulo ? '' : 'disabled'}>Colocar na reunião</button></footer>
    </div></div>`;
  }

  // ---------- "Fundo dos versículos" ----------
  function janelaFundo() {
    const r = reuniaoAberta();
    if (!r) { S.fundo = false; return ''; }
    const proprios = M.biblioteca.filter(b => b.tipo === 'fundo');
    const opcoes = window.Versiculo.FUNDOS.map(f => ({ id: f.id, nome: f.nome, fundo: { pronto: f.id } }))
      .concat(proprios.map(b => ({ id: b.id, nome: b.titulo, fundo: { arquivo: b.arquivo } })));
    const tile = o => `<button class="fundo-op ${r.fundoId === o.id ? 'sel' : ''}" data-a="escolherFundo" data-v="${o.id}">
        <span class="amostra">${window.Versiculo.html({ ...EXEMPLO_FUNDO, fundo: o.fundo }, midia)}</span>
        <span class="nome">${r.fundoId === o.id ? '✓ ' : ''}${esc(o.nome)}</span></button>`;
    return `<div class="fundo-modal"><div class="janela" role="dialog" aria-label="Fundo dos versículos">
      <header><h2>🎨 Fundo dos versículos desta reunião</h2><button class="btn sm" data-a="fecharModal">✕ Fechar</button></header>
      <div class="corpo"><p class="note">Toque no fundo que você quer. Todos os versículos desta reunião aparecem com ele, inclusive os escolhidos na hora pelo celular.</p>
        <div class="fundos">${opcoes.map(tile).join('')}</div></div>
      <footer><button class="btn" data-a="importar">+ Usar uma imagem minha</button><button class="btn primary" data-a="fecharModal">Pronto</button></footer>
    </div></div>`;
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
    if (r.ignorados) t += ` ${r.ignorados} não ${r.ignorados === 1 ? 'é' : 'são'} foto, vídeo nem música e ${r.ignorados === 1 ? 'ficou' : 'ficaram'} de fora.`;
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
    tirar: v => {
      const it = reuniaoAberta()?.itens.find(i => i.id === v);
      if (it && it.tipo === 'palavra' && it.passagens.length > 1 && !confirm(`Tirar a Palavra inteira (${it.passagens.length} passagens) da reunião?`)) return;
      enviar({ cmd: 'removerItem', reuniaoId: S.aberta, itemId: v });
    },
    moverPassagem: (v, el) => enviar({ cmd: 'moverPassagem', reuniaoId: S.aberta, passagemId: v, delta: Number(el.dataset.d) }),
    tirarPassagem: v => enviar({ cmd: 'removerPassagem', reuniaoId: S.aberta, passagemId: v }),
    importar: async () => {
      const comoFundo = (S.aba === 'biblioteca' && S.bibAba === 'fundo') || S.fundo;
      const r = await window.notebook.importarDialogo(S.aba === 'reunioes' && !comoFundo ? S.aberta : null, comoFundo);
      avisarImportacao(r);
    },
    novaPregacao: async () => {
      const r = await window.notebook.importarPregacao(S.aba === 'reunioes' ? S.aberta : null);
      if (!r) return;
      if (!r.qtd) { avisar('Nenhuma imagem escolhida. A pregação precisa de imagens (fotos).'); return; }
      avisar(`Pregação criada com ${r.imagens} imagens. Para mudar o nome, vá na Biblioteca.`);
    },
    daBiblioteca: () => { S.escolher = { aba: 'video', sel: new Set() }; },
    escolherAba: v => { S.escolher.aba = v; },
    marcar: v => { const s = S.escolher.sel; s.has(v) ? s.delete(v) : s.add(v); },
    colocar: () => {
      enviar({ cmd: 'adicionarItens', reuniaoId: S.aberta, bibliotecaIds: [...S.escolher.sel] });
      avisar(`${S.escolher.sel.size} colocado(s) na reunião.`);
      S.escolher = null;
    },
    fecharModal: () => { S.escolher = null; S.testar = null; S.verso = null; S.fundo = false; },
    testar: () => { S.testar = 0; },
    abrirVerso: () => { S.verso = { test: 'AT', l: null, c: null, de: null, ate: null, versao: null, busca: '' }; setTimeout(() => $('v-busca')?.focus()); },
    versoTest: v => { S.verso.test = v; },
    versoLivro: v => {
      S.verso.l = Number(v); S.verso.c = null; S.verso.de = S.verso.ate = null;
      const b = indice(versaoDoVerso())[S.verso.l];
      if (b.caps.length === 1) S.verso.c = 1;  // Judas, Obadias…: vai direto aos versículos
    },
    versoCap: v => { S.verso.c = Number(v); S.verso.de = S.verso.ate = null; },
    versoNum: v => {
      const n = Number(v), x = S.verso;
      // 1º toque: começo. 2º toque depois dele: fim. Outro toque: recomeça.
      if (x.de == null || x.ate != null || n <= x.de) { x.de = n; x.ate = null; } else x.ate = n;
    },
    versoVoltar: v => {
      if (v === 'livro') S.verso.l = null;
      S.verso.c = null; S.verso.de = S.verso.ate = null;
    },
    versoVersao: v => { S.verso.versao = v || null; },
    versoColocar: () => {
      const x = S.verso;
      enviar({ cmd: 'adicionarVersiculo', reuniaoId: S.aberta, ref: { l: x.l, c: x.c, v: x.de }, ate: x.ate || x.de, versao: x.versao });
      avisar('Versículo colocado na Palavra.');
      S.verso = null;
    },
    abrirFundo: () => { S.fundo = true; },
    escolherFundo: v => {
      const r = reuniaoAberta();
      r.fundoId = v;  // já mostra marcado enquanto o notebook grava
      enviar({ cmd: 'editarReuniao', id: S.aberta, campos: { fundo: v } });
    },
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
    } else if (f.id === 'form-verso') {
      const texto = $('v-busca').value;
      S.verso.busca = texto;
      const idx = indice(versaoDoVerso());
      const ref = idx && window.Referencia.interpretar(texto, idx);
      document.activeElement?.blur();
      if (!ref) { avisar('Não entendi. Escreva assim: Salmos 23:1-6 ou João 3:16'); desenhar(); return; }
      const qtdCaps = idx[ref.l].caps.length;
      if (ref.c > qtdCaps) { avisar(`${idx[ref.l].nome} tem só ${qtdCaps} capítulos.`); desenhar(); return; }
      const qtd = idx[ref.l].caps[ref.c - 1];
      if (ref.v > qtd) { avisar(`${idx[ref.l].nome} ${ref.c} tem só ${qtd} versículos.`); desenhar(); return; }
      const ate = Math.min(ref.ate, qtd);
      Object.assign(S.verso, { test: ref.l > ULTIMO_DO_AT ? 'NT' : 'AT', l: ref.l, c: ref.c, de: ref.v, ate: ate > ref.v ? ate : null });
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
    if (ev.key === 'Escape' && (S.escolher || S.testar != null || S.verso || S.fundo)) { ACOES.fecharModal(); desenhar(); }
    if (ev.key === 'Escape' && S.renomear) { S.renomear = null; desenhar(); }
    if (S.testar != null && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) {
      const r = reuniaoAberta();
      const n = r ? telasDoTestar(r).length : 0;
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
    if (S.aba === 'biblioteca' && S.bibAba === 'pregacao') {
      const r = await window.notebook.importarPregacaoArquivos(ev.dataTransfer.files);
      avisar(r && r.qtd ? `Pregação criada com ${r.imagens} imagens.` : 'Para criar uma pregação, solte imagens (fotos).');
      return;
    }
    const comoFundo = (S.aba === 'biblioteca' && S.bibAba === 'fundo') || S.fundo;
    avisarImportacao(await window.notebook.importarArquivos(ev.dataTransfer.files, comoFundo ? null : destino, comoFundo));
  });

  desenhar();
})();
