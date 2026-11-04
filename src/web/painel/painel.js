// Painel do Notebook: preparar as Reuniões, cuidar da Biblioteca, dos Pastores e das telas.
(function () {
  const I = window.Icone;
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
  let ultimoQr = '', ultimaLogo;
  function desenharFixos() {
    const i = M.info;
    // Rodapé do menu: o que está acontecendo agora
    const linha = (cls, txt) => `<span class="st ${cls}"><i class="dot"></i>${txt}</span>`;
    const tv = i.tv === 'tv' ? linha('ok', 'TV ligada') : linha('atencao', 'TV não encontrada');
    const cel = i.celulares > 0 ? linha('ok', `${i.celulares} ${i.celulares === 1 ? 'celular conectado' : 'celulares conectados'}`) : linha('', 'Nenhum celular');
    const agora = M.reuniao ? linha('ok vivo', `Ao vivo: ${esc(tituloReuniao(M.reuniao))}`) : '';
    $('status').innerHTML = agora + tv + cel;
    // Botão de mostrar uma janela do notebook na TV (Telegram, Univervideo...): sempre à mão.
    const naTv = M.estado && M.estado.tv.tipo === 'janela';
    $('janela-tv').innerHTML = naTv ? `<div class="janela-viva"><small>Na TV agora</small><b>${esc(M.estado.tv.nome)}</b></div>
          <button class="btn primary bloco" data-a="sairJanela">${I('voltar')} Voltar para o Púlpito</button>`
      : `<button class="btn bloco lado-btn" data-a="abrirJanelas">${I('tv')} Mostrar uma janela na TV</button>`;
    // Logo da igreja (ou a cruz do Púlpito)
    if (i.logo !== ultimaLogo) {
      ultimaLogo = i.logo;
      $('marca-img').innerHTML = i.logo
        ? `<img class="marca-logo" src="/logo.png?v=${encodeURIComponent(i.logo)}" alt="">`
        : '<img class="marca-logo" src="/comum/icone.svg" alt="">';
    }
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
    $('modal').innerHTML = S.musicaEspera ? janelaMusicaEspera() : S.espera ? janelaEspera() : S.janelas ? escolherJanela() : S.escolher ? janelaEscolher() : S.testar != null ? janelaTestar() : S.verso ? janelaVerso() : S.fundo ? janelaFundo() : '';
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
          <button class="btn sm" data-a="copiar" data-v="${r.id}" title="Nova reunião com as mesmas músicas e versículos">${I('copiar')} Copiar</button>
          <button class="btn danger sm" data-a="apagarReuniao" data-v="${r.id}" aria-label="Apagar reunião">${I('lixo')}</button>
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
    if (it.tipo === 'palavra') return `<div class="miniatura" style='background:${fundoCss(reuniaoAberta()?.fundo)}'>${I('palavra')}</div>`;
    if (it.tipo === 'fundo') return `<div class="miniatura" style='background:${fundoCss({ arquivo: it.arquivo })}'></div>`;
    if (it.tipo === 'imagem') return `<div class="miniatura"><img src="${midia(it.arquivo)}" alt="" loading="lazy" draggable="false"></div>`;
    if (it.tipo === 'musica') return `<div class="miniatura musica">${I('musica')}</div>`;
    if (it.tipo === 'pregacao') return `<div class="miniatura"><img src="${midia(it.arquivo)}" alt="" loading="lazy" draggable="false"><span class="qtd">${it.arquivos.length}</span></div>`;
    if (it.tipo === 'video') return it.capa
      ? `<div class="miniatura"><img src="${midia(it.capa)}" alt="" loading="lazy" draggable="false"><span class="play" aria-hidden="true">${I('play')}</span></div>`
      : `<div class="miniatura"><video src="${midia(it.arquivo)}#t=1" preload="metadata" muted draggable="false"></video><span class="play" aria-hidden="true">${I('play')}</span></div>`;
    return `<div class="miniatura">•</div>`;
  }

  function linhasPassagens(it, r) {
    const n = it.passagens.length;
    return `<div class="passagens">${it.passagens.map((p, i) => `<div class="passagem">
        <span class="pn">${i + 1}.</span>
        <div><div class="t">${esc(p.titulo)}</div><div class="d">${p.ate > p.ref.v ? `${p.ate - p.ref.v + 1} versículos, um por tela` : '1 versículo'} · Bíblia ${p.versao ? p.versao : `${r.versao} (do pastor)`}</div></div>
        <div class="acoes">
          <button class="btn sm" data-a="moverPassagem" data-v="${p.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${I('subir')}</button>
          <button class="btn sm" data-a="moverPassagem" data-v="${p.id}" data-d="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Descer">${I('descer')}</button>
          <button class="btn sm danger" data-a="tirarPassagem" data-v="${p.id}" aria-label="Tirar versículo">${I('lixo')}</button>
        </div></div>`).join('')}
      <div><button class="btn sm" data-a="abrirVerso" data-v="${it.id}">${I('mais')} Outro versículo nesta Palavra</button></div></div>`;
  }

  function editor() {
    const r = M.reunioesCompletas.find(x => x.id === S.aberta);
    const naTv = M.estado.reuniaoId === r.id && M.estado.tv.tipo === 'item' ? M.estado.tv.itemId : null;
    const itens = r.itens.map((it, i) => `<div class="item ${naTv === it.id ? 'na-tv' : ''}" draggable="true" data-item="${it.id}" title="Arraste para mudar a ordem">
        <span class="n"><span class="alca" aria-hidden="true">${I('arrastar')}</span><span class="num">${i + 1}</span></span>${miniatura(it)}
        <div><div class="t">${it.tipo === 'palavra'
          ? `<input class="nome-palavra" data-palavra="${it.id}" value="${esc(it.nome || '')}" placeholder="Palavra" maxlength="40" aria-label="Nome do cartão" title="Clique para mudar o nome do cartão">`
          : esc(it.titulo)}</div><div class="d">${it.tipo === 'palavra'
          ? `${it.passagens.length} ${it.passagens.length === 1 ? 'passagem' : 'passagens'} · no celular é um cartão, com as setas`
          : it.tipo === 'pregacao' ? `Pregação · ${it.arquivos.length} ${it.arquivos.length === 1 ? 'imagem' : 'imagens'} · no celular passa com as setas`
          : TIPO[it.tipo] || it.tipo}${naTv === it.id ? ' · <span class="ao-vivo">na TV agora</span>' : ''}</div></div>
        <div class="acoes">
          <button class="btn" data-a="mover" data-v="${it.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">${I('subir')}</button>
          <button class="btn" data-a="mover" data-v="${it.id}" data-d="1" ${i === r.itens.length - 1 ? 'disabled' : ''} aria-label="Descer">${I('descer')}</button>
          <button class="btn danger" data-a="tirar" data-v="${it.id}" aria-label="Tirar da reunião">${I('lixo')}</button>
        </div>${it.tipo === 'palavra' ? linhasPassagens(it, r) : ''}</div>`).join('');

    return `<div class="pagina">
      <div><button class="btn sm" data-a="fechar">${I('esq')} Todas as reuniões</button></div>
      ${S.form ? formReuniao() : `<div class="cabeca">
        <div class="pilha" style="gap:4px">
          <h1>${esc(tituloReuniao(r))}</h1>
          <div class="note" style="font-size:18px; text-transform:capitalize">${esc(diaSemana(r.data))}, ${ddmmaaaa(r.data)} · ${esc(r.hora)} · ${r.pastor ? esc(r.pastor) : 'sem pastor'}</div>
        </div>
        <div class="acoes">
          <button class="btn" data-a="editarDados">${I('editar')} Mudar dia, hora ou pastor</button>
          <button class="btn" data-a="abrirFundo"><span class="bolinha" style='background:${fundoCss(r.fundo)}'></span> Fundo dos versículos</button>
          <button class="btn" data-a="abrirEspera"><span class="bolinha" style='background:${esperaCss(r.telaEspera)}'></span> Tela de espera${r.telaEsperaId ? '' : ' (padrão)'}</button>
          <button class="btn" data-a="abrirMusicaEspera" data-v="reuniao">${I('musica')} Música da espera: ${esc(nomeMusicaEspera(r))}</button>
          <button class="btn" data-a="testar" ${r.itens.length ? '' : 'disabled'}>${I('play')} Testar</button>
          <button class="btn primary" data-a="passarAqui" data-v="${r.id}" title="Começa a reunião e abre o controle aqui no notebook">${I('tv')} ${M.estado.reuniaoId === r.id ? 'Passar na TV por aqui' : M.estado.reuniaoId ? 'Trocar a TV para esta reunião' : 'Passar na TV por aqui'}</button>
        </div></div>`}
      ${r.itens.length ? `<div class="itens">${itens}</div>` : `<div class="vazio"><div class="grande">${I('vazio')}</div><div>Esta reunião ainda está vazia.</div></div>`}
      <div class="adicionar">
        <h2 class="adicionar-tit">Colocar na reunião</h2>
        <div class="acoes">
          <button class="btn primary huge" data-a="daBiblioteca">${I('biblioteca')} Da Biblioteca</button>
          <button class="btn primary huge" data-a="abrirVerso">${I('palavra')} Versículo</button>
        </div>
        <p class="note">Para mudar a ordem, arraste um item para cima ou para baixo, ou use as setas de subir e descer.</p>
        <div class="de-fora">
          <div class="de-fora-tit">Ainda não está na Biblioteca? Traga do computador:</div>
          <div class="acoes">
            <button class="btn" data-a="importar">+ Fotos, vídeos e músicas</button>
            <button class="btn" data-a="novaPregacao">${I('pregacao')} Pregação</button>
          </div>
          <p class="note">Ou arraste os arquivos para esta janela. Eles vão para a Biblioteca e entram no fim da reunião, na ordem do WhatsApp.</p>
        </div>
      </div>
    </div>`;
  }

  // ---------- Biblioteca ----------
  // Como mostrar cada tipo: músicas sempre em linhas; vídeos e imagens o pastor escolhe (fica guardado neste notebook).
  const VISAO_ESCOLHE = ['video', 'imagem'];
  let visoes = {};
  try { visoes = JSON.parse(localStorage.getItem('pulpito-visao') || '{}'); } catch {}
  function visao(tipo) {
    if (tipo === 'musica') return 'lista';
    if (VISAO_ESCOLHE.includes(tipo)) return visoes[tipo] === 'lista' ? 'lista' : 'grade';
    return 'grade';
  }
  function trocaVisao(tipo) {
    if (!VISAO_ESCOLHE.includes(tipo)) return '';
    const v = visao(tipo);
    return `<div class="troca-visao" role="group" aria-label="Como mostrar">
      <button class="btn sm ${v === 'grade' ? 'sel' : ''}" data-a="visao" data-v="grade" title="Quadros grandes">${I('biblioteca')} Quadros</button>
      <button class="btn sm ${v === 'lista' ? 'sel' : ''}" data-a="visao" data-v="lista" title="Uma linha para cada">${I('linhas')} Linhas</button></div>`;
  }
  function cartaoArquivo(b, modo) {
    const marcado = modo === 'escolher' && S.escolher.sel.has(b.id);
    const thumb = miniatura(b);
    if (modo === 'escolher') {
      return `<button class="arq escolher ${marcado ? 'marcado' : ''}" data-a="marcar" data-v="${b.id}">${thumb}
        <div class="info"><div class="t">${marcado ? I('ok') + ' ' : ''}${esc(b.titulo)}</div><div class="d">Adicionado em ${ddmm(b.criadoEm)}</div></div></button>`;
    }
    const nome = S.renomear === b.id
      ? `<form data-renomear="${b.id}"><input type="text" id="renomear-${b.id}" value="${esc(b.titulo)}" maxlength="80"></form>`
      : `<div class="t">${esc(b.titulo)}</div>`;
    const antigo = M.antigos.includes(b.id);
    return `<div class="arq">${thumb}
      <div class="info">${nome}${b.tipo === 'musica' && (M.categorias || []).length ? `<label class="cat-escolha"><span>Categoria</span>
          <select data-categoria="${b.id}"><option value="">Sem categoria</option>${M.categorias.map(c => `<option value="${c.id}" ${b.categoria === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>` : ''}<div class="d">${b.arquivos ? `${b.arquivos.length} imagens · ` : ''}Adicionado em ${ddmm(b.criadoEm)} · ${b.usos ? `em ${b.usos} ${b.usos === 1 ? 'reunião' : 'reuniões'}` : 'não está em reunião'}${antigo ? ' · antigo' : ''}</div></div>
      <div class="acoes">
        ${S.renomear === b.id
          ? `<button class="btn primary" data-a="salvarNome" data-v="${b.id}">Salvar</button><button class="btn" data-a="cancelarNome">Cancelar</button>`
          : `${b.tipo === 'video' || b.tipo === 'imagem' ? `<button class="btn ${b.espera ? 'na-espera' : ''}" data-a="marcarEspera" data-v="${b.id}" title="Aparece na escolha da Tela de espera das reuniões">${I(b.espera ? 'ok' : 'tv')} ${b.espera ? 'Na espera' : 'Usar na espera'}</button>` : ''}<button class="btn" data-a="renomear" data-v="${b.id}">${I('editar')} Nome</button><button class="btn danger" data-a="apagarArquivo" data-v="${b.id}">${I('lixo')} Apagar</button>`}
      </div></div>`;
  }

  // Abas dos tipos de arquivo: uma linha só, todas do mesmo tamanho; com pouco espaço o ícone vai para cima.
  function subAbas(atual, acao) {
    const qtd = t => t === 'espera' ? M.biblioteca.filter(b => b.espera).length + fotosDaEspera().length : M.biblioteca.filter(b => b.tipo === t).length + (t === 'fundo' && acao === 'bibAba' ? fundosDoPrograma().length : 0);
    const tipos = [['video', I('video'), 'Vídeos'], ['imagem', I('imagem'), 'Imagens'], ['pregacao', I('pregacao'), 'Pregações'], ['musica', I('musica'), 'Músicas']];
    if (acao === 'bibAba') tipos.push(['fundo', I('fundo'), 'Fundos de versículo'], ['espera', I('tv'), 'Tela de espera']);
    const nome = (longo, curto) => curto ? `<span class="longo">${longo}</span><span class="curto">${curto}</span>` : longo;
    return `<div class="tipos-caixa"><div class="tipos">${tipos.map(([t, ic, longo, curto]) => `
      <button class="btn ${atual === t ? 'sel' : ''}" data-a="${acao}" data-v="${t}" title="${longo}">
        <span class="ic">${ic}</span><span class="nm">${nome(longo, curto)}</span><span class="qt">${qtd(t)}</span>
      </button>`).join('')}</div></div>`;
  }

  // Barra de categorias (só na aba Músicas)
  function barraCategorias() {
    const cats = M.categorias || [];
    const musicas = M.biblioteca.filter(b => b.tipo === 'musica');
    const n = cid => musicas.filter(b => (cid === 'sem' ? !b.categoria : b.categoria === cid)).length;
    const f = S.catFiltro || 'todas';
    const chip = (v, nome, qtd) => `<button class="btn sm ${f === v ? 'sel' : ''}" data-a="catFiltro" data-v="${v}">${esc(nome)} (${qtd})</button>`;
    const atual = cats.find(c => c.id === f);
    const form = S.catForm
      ? `<form class="cat-form" id="form-categoria" autocomplete="off">
          <input type="text" id="cat-nome" value="${esc(S.catForm.nome || '')}" placeholder="Ex.: Oração forte" maxlength="40" aria-label="Nome da categoria">
          <button type="submit" class="btn primary sm">${S.catForm.id ? 'Salvar' : 'Criar'}</button>
          <button type="button" class="btn sm" data-a="catCancelar">Cancelar</button></form>`
      : `<div class="acoes"><button class="btn sm" data-a="catNova">+ Nova categoria</button>
          ${atual ? `<button class="btn sm" data-a="catRenomear" data-v="${atual.id}">${I('editar')} Mudar nome de "${esc(atual.nome)}"</button>
            <button class="btn sm danger" data-a="catApagar" data-v="${atual.id}">${I('lixo')} Apagar categoria</button>` : ''}</div>`;
    return `<div class="caixa categorias">
        <div class="cabeca"><h2>Categorias</h2><span class="note">O pastor escolhe a música por categoria no celular.</span></div>
        <div class="sub-abas">${chip('todas', 'Todas', musicas.length)}${cats.map(c => chip(c.id, c.nome, n(c.id))).join('')}${cats.length && n('sem') ? chip('sem', 'Sem categoria', n('sem')) : ''}</div>
        ${form}
      </div>`;
  }

  // A Biblioteca separada pelo dia em que cada arquivo entrou (o mais novo em cima).
  function nomeDoDia(d) {
    if (!d) return 'Sem data';
    const hoje = M.hoje || new Date().toLocaleDateString('sv-SE');
    const [a, m, dd] = d.split('-').map(Number);
    const data = new Date(a, m - 1, dd);
    const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    if (d === hoje) return 'Hoje · ' + ddmm(d);
    if (d === ontem.toLocaleDateString('sv-SE')) return 'Ontem · ' + ddmm(d);
    const dia = data.toLocaleDateString('pt-BR', { weekday: 'long' });
    return dia.charAt(0).toUpperCase() + dia.slice(1) + ' · ' + (String(a) === hoje.slice(0, 4) ? ddmm(d) : ddmmaaaa(d));
  }
  function porDia(lista, modo, tipo) {
    const dias = [];
    for (const b of lista.slice().sort((x, y) => (y.criadoEm || '').localeCompare(x.criadoEm || ''))) {
      const ultimo = dias[dias.length - 1];
      if (ultimo && ultimo.d === b.criadoEm) ultimo.itens.push(b); else dias.push({ d: b.criadoEm, itens: [b] });
    }
    return dias.map(g => `<section class="dia"><h3 class="dia-nome">${esc(nomeDoDia(g.d))} <span>${g.itens.length}</span></h3>
      <div class="grade ${visao(tipo)}">${g.itens.map(b => cartaoArquivo(b, modo)).join('')}</div></section>`).join('');
  }

  // Aba Fundos: os que vocês colocaram (dá para apagar) e os que vêm no programa (ficam sempre).
  const fundosDoPrograma = () => window.Versiculo.FUNDOS.filter(f => !(M.fundosEscondidos || []).includes(f.id));
  function abaFundos(proprios) {
    const escondidos = M.fundosEscondidos || [];
    const lista = fundosDoPrograma();
    const doPrograma = lista.map(f => `<div class="fundo-op fixo">
        <span class="amostra">${window.Versiculo.html({ ...EXEMPLO_FUNDO, fundo: { pronto: f.id } }, midia)}</span>
        <span class="nome-linha"><span class="nome">${esc(f.nome)}</span>
          <button class="btn sm danger" data-a="esconderFundo" data-v="${f.id}" title="Tirar este fundo da lista">${I('lixo')} Tirar</button></span></div>`).join('');
    const voltar = escondidos.length
      ? `<p class="note">Vocês tiraram ${escondidos.length} ${escondidos.length === 1 ? 'fundo' : 'fundos'} do programa. <button class="btn sm" data-a="mostrarFundos">${I('voltar')} Trazer de volta</button></p>` : '';
    return `<section class="dia"><h3 class="dia-nome">Seus fundos <span>${proprios.length}</span></h3>
        ${proprios.length ? porDia(proprios, undefined, 'fundo') : '<p class="note">Nenhum ainda. Use "+ Adicionar imagem de fundo" para colocar uma imagem sua.</p>'}</section>
      <section class="dia"><h3 class="dia-nome">Que vêm no programa <span>${lista.length}</span></h3>
        <p class="note">Para usar um deles, abra a reunião e clique em "Fundo dos versículos". "Tirar" só tira da lista: dá para trazer de volta.</p>
        ${lista.length ? `<div class="fundos">${doPrograma}</div>` : ''}${voltar}</section>`;
  }

  function biblioteca() {
    let lista = M.biblioteca.filter(b => b.tipo === S.bibAba).slice().reverse();
    const f = S.catFiltro || 'todas';
    if (S.bibAba === 'musica' && f !== 'todas') lista = lista.filter(b => (f === 'sem' ? !b.categoria : b.categoria === f));
    const antigos = M.antigos.length;
    return `<div class="pagina">
      <div class="cabeca"><h1>Biblioteca</h1>
        <div class="acoes">
          ${S.bibAba === 'pregacao'
            ? `<button class="btn primary" data-a="novaPregacao">${I('mais')} Nova pregação</button>`
            : `<button class="btn primary" data-a="importar">${S.bibAba === 'espera' ? '+ Adicionar vídeo ou imagem' : S.bibAba === 'fundo' ? '+ Adicionar imagem de fundo' : S.bibAba === 'musica' ? '+ Adicionar músicas' : '+ Adicionar arquivos'}</button>`}
          <button class="btn danger" data-a="apagarAntigos" ${antigos ? '' : 'disabled'}>${I('lixo')} Apagar antigos (${antigos})</button>
        </div></div>
      <p class="note">"Apagar antigos" apaga fotos, vídeos e pregações que não foram usados nos últimos 7 dias e não estão em nenhuma reunião de hoje em diante. Músicas e fundos nunca são apagados por ele.</p>
      ${subAbas(S.bibAba, 'bibAba')}
      ${S.bibAba === 'musica' ? barraCategorias() : ''}
      ${S.bibAba === 'espera' ? '' : trocaVisao(S.bibAba)}
      ${S.bibAba === 'espera' ? abaEspera() : S.bibAba === 'fundo' ? abaFundos(lista) : lista.length ? porDia(lista, undefined, S.bibAba)
        : `<div class="vazio"><div class="grande">${I(S.bibAba === 'fundo' ? 'fundo' : 'biblioteca')}</div><div>${S.bibAba === 'video' ? 'Nenhum vídeo ainda.' : S.bibAba === 'musica' ? 'Nenhuma música ainda. Hinos, louvores e fundos de oração ficam guardados aqui para sempre.' : S.bibAba === 'pregacao' ? 'Nenhuma pregação ainda. Use "+ Nova pregação" e escolha todas as imagens que o bispo mandou.' : S.bibAba === 'fundo' ? 'Nenhum fundo próprio ainda. Os fundos que vêm no programa aparecem na hora de escolher o fundo da reunião.' : 'Nenhuma imagem ainda.'}</div></div>`}
    </div>`;
  }

  // Aba "Tela de espera": o que aparece na hora de escolher a tela de espera de cada reunião.
  const fotosDaEspera = () => window.Versiculo.FUNDOS.filter(f => f.foto && !(M.esperasEscondidas || []).includes(f.id));
  function abaEspera() {
    const marcados = M.biblioteca.filter(b => b.espera).slice().reverse();
    const cartao = b => `<div class="arq">${miniatura(b)}
      <div class="info"><div class="t">${esc(b.titulo)}</div><div class="d">Adicionado em ${ddmm(b.criadoEm)}</div></div>
      <div class="acoes"><button class="btn" data-a="marcarEspera" data-v="${b.id}">${I('fechar')} Tirar da espera</button></div></div>`;
    const grupo = (tipo, titulo, vazio) => {
      const l = marcados.filter(b => (tipo === 'video' ? b.tipo === 'video' : b.tipo !== 'video'));
      return `<h2 class="sub-titulo">${titulo} <span class="qt-dia">${l.length}</span></h2>
        ${l.length ? `<div class="grade">${l.map(cartao).join('')}</div>` : `<p class="note">${vazio}</p>`}`;
    };
    const fotos = fotosDaEspera(), escondidas = (M.esperasEscondidas || []).length;
    const fotosHtml = fotos.map(f => `<div class="fundo-op fixo">${amostraEspera({ foto: f.foto })}
        <span class="nome-linha"><span class="nome">${esc(f.nome)}</span>
          <button class="btn sm danger" data-a="esconderEspera" data-v="${f.id}" title="Tirar esta foto da Tela de espera">${I('lixo')} Tirar</button></span></div>`).join('');
    const voltar = escondidas ? `<p class="note">Vocês tiraram ${escondidas} ${escondidas === 1 ? 'foto' : 'fotos'} do programa. <button class="btn sm" data-a="mostrarEsperas">${I('voltar')} Trazer de volta</button></p>` : '';
    return `<p class="note">Estes vídeos e imagens aparecem na hora de escolher a Tela de espera de uma reunião (botão "Tela de espera" dentro da reunião).
        Os vídeos passam sem som e repetindo. Use "+ Adicionar vídeo ou imagem", arraste os arquivos para cá ou clique em "Usar na espera" nas abas Vídeos e Imagens.</p>
      ${grupo('video', 'Vídeos', 'Nenhum vídeo para a espera ainda.')}
      ${grupo('imagem', 'Suas imagens', 'Nenhuma imagem sua para a espera ainda.')}
      <h2 class="sub-titulo">Fotos que vêm no programa <span class="qt-dia">${fotos.length}</span></h2>
      <p class="note">"Tirar" só tira da lista: dá para trazer de volta.</p>
      ${fotos.length ? `<div class="fundos">${fotosHtml}</div>` : ''}${voltar}
      <p class="note">"Tirar da espera" não apaga o arquivo: ele continua na Biblioteca.</p>`;
  }

  function janelaEscolher() {
    const e = S.escolher;
    const lista = M.biblioteca.filter(b => b.tipo === e.aba).slice().reverse();
    return `<div class="fundo-modal"><div class="janela" role="dialog" aria-label="Escolher da Biblioteca">
      <header><h2>Escolher da Biblioteca</h2><button class="btn sm" data-a="fecharModal">${I('fechar')} Fechar</button></header>
      <div class="corpo">${subAbas(e.aba, 'escolherAba')}
        ${trocaVisao(e.aba)}
        ${lista.length ? porDia(lista, 'escolher', e.aba) : '<div class="vazio">Nada aqui ainda.</div>'}
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
        : it.tipo === 'musica' ? `<div class="palco-musica"><div>${I('musica')}</div><audio src="${midia(it.arquivo)}" controls></audio><p>A música toca sem mudar a TV: ela continua mostrando o item anterior.</p></div>`
        : `<video src="${midia(it.arquivo)}" controls autoplay></video>`;
    }
    return `<div class="fundo-modal"><div class="janela" role="dialog" aria-label="Testar a reunião">
      <header><h2>Testar · ${i + 1} de ${telas.length}: ${p ? 'Palavra · ' + esc(p.titulo) : esc(it.titulo) + (slide != null ? ` · imagem ${slide + 1} de ${it.arquivos.length}` : '')}</h2><button class="btn sm" data-a="fecharModal">${I('fechar')} Fechar</button></header>
      <div class="corpo"><div class="palco">${palco}</div>
        <p class="note">Assim aparece na TV. Este teste não mexe na TV da igreja.${p ? ' No culto, as setas do celular passam pelos outros versículos.' : ''}</p></div>
      <footer>
        <button class="btn" data-a="testarPasso" data-v="-1" ${i === 0 ? 'disabled' : ''}>${I('esq')} Anterior</button>
        <button class="btn primary" data-a="testarPasso" data-v="1" ${i === telas.length - 1 ? 'disabled' : ''}>Próximo ${I('dir')}</button>
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
  const SUGESTOES_NOME = ['Palavra', 'Palavra do dízimo', 'Palavra da oferta', 'Palavra da família', 'Palavra da libertação'];
  document.addEventListener('input', ev => {
    if (ev.target.id === 'v-nome' && S.verso) S.verso.nome = ev.target.value;
  });
  document.addEventListener('change', ev => {
    const pal = ev.target.closest && ev.target.closest('input[data-palavra]');
    if (pal) enviar({ cmd: 'renomearPalavra', reuniaoId: S.aberta, itemId: pal.dataset.palavra, nome: pal.value });
  });
  function janelaVerso() {
    const v = S.verso;
    const r = reuniaoAberta();
    const idx = indice(versaoDoVerso());
    const cab = `<header><h2>${v.palavraId ? 'Mais um versículo nesta Palavra' : 'Nova Palavra (entra no fim da reunião)'}</h2><button class="btn sm" data-a="fecharModal">${I('fechar')} Fechar</button></header>`;
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

    const opcoesVersao = [[null, `Do pastor (${r.versao})`], ['ACF', 'ACF'], ['ARC', 'ARC'], ['NVI', 'NVI']];
    return `<div class="fundo-modal"><div class="janela" role="dialog" aria-label="Colocar versículo">${cab}
      <div class="corpo">
        <form id="form-verso" class="busca" autocomplete="off">
          <label class="campo"><span>Já sabe qual é? Escreva aqui</span>
            <input type="text" id="v-busca" placeholder="Ex.: Salmos 23:1-6   ou   Jo 3:16" value="${esc(v.busca || '')}"></label>
          <button type="submit" class="btn primary">Achar</button></form>
        <p class="note">Ou escolha tocando:</p>
        ${trilha}${escolha}${previa}
        <div class="campo"><span>Nome do cartão (aparece no celular)</span>
          <input type="text" id="v-nome" value="${esc(v.nome || '')}" placeholder="Palavra" maxlength="40">
          <div class="escolha">${SUGESTOES_NOME.map(n => `<button type="button" class="btn sm ${(v.nome || 'Palavra') === n ? 'sel' : ''}" data-a="versoNome" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>
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
    const opcoes = fundosDoPrograma().map(f => ({ id: f.id, nome: f.nome, fundo: { pronto: f.id } }))
      .concat(proprios.map(b => ({ id: b.id, nome: b.titulo, fundo: { arquivo: b.arquivo } })));
    const tile = o => `<button class="fundo-op ${r.fundoId === o.id ? 'sel' : ''}" data-a="escolherFundo" data-v="${o.id}">
        <span class="amostra">${window.Versiculo.html({ ...EXEMPLO_FUNDO, fundo: o.fundo }, midia)}</span>
        <span class="nome">${r.fundoId === o.id ? I('ok') + ' ' : ''}${esc(o.nome)}</span></button>`;
    return `<div class="fundo-modal"><div class="janela" role="dialog" aria-label="Fundo dos versículos">
      <header><h2>Fundo dos versículos desta reunião</h2><button class="btn sm" data-a="fecharModal">${I('fechar')} Fechar</button></header>
      <div class="corpo"><p class="note">Toque no fundo que você quer. Todos os versículos desta reunião aparecem com ele, inclusive os escolhidos na hora pelo celular.</p>
        <div class="fundos">${opcoes.map(tile).join('')}</div></div>
      <footer><button class="btn" data-a="importar">+ Usar uma imagem minha</button><button class="btn primary" data-a="fecharModal">Pronto</button></footer>
    </div></div>`;
  }

  // ---------- Mostrar uma janela do notebook na TV ----------
  async function carregarJanelas() {
    let lista = [];
    try { lista = await window.notebook.listarJanelas(); } catch (e) { lista = []; }
    if (S.janelas) { S.janelas.lista = lista; desenhar(); }
  }
  function escolherJanela() {
    const l = S.janelas.lista;
    const corpo = l === null ? '<p class="note">Procurando as janelas abertas…</p>'
      : !l.length ? '<p class="note">Nenhuma janela aberta. Abra o vídeo no Telegram ou no navegador e clique em "Procurar de novo".</p>'
      : `<div class="janelas">${l.map(j => `<button class="janela-op" data-a="mostrarJanela" data-v="${esc(j.id)}">
          <span class="amostra"><img src="${j.miniatura}" alt=""></span>
          <span class="nome">${j.icone ? `<img src="${j.icone}" alt="">` : ''}${esc(j.nome)}</span></button>`).join('')}</div>`;
    return `<div class="fundo-modal"><div class="janela" role="dialog" aria-label="Mostrar uma janela na TV">
      <header><h2>Qual janela vai aparecer na TV?</h2><button class="btn sm" data-a="fecharModal">${I('fechar')} Fechar</button></header>
      <div class="corpo">
        <ol class="dicas">
          <li>Abra o vídeo antes (no Telegram ou no navegador) e deixe <b>pausado</b>.</li>
          <li>Clique na janela abaixo. A TV mostra só ela, ao vivo; o resto do notebook não aparece.</li>
          <li>Para ficar só o vídeo, coloque o vídeo em <b>tela cheia</b> e dê o play.</li>
          <li>Não minimize a janela enquanto ela estiver na TV.</li>
        </ol>
        ${corpo}
      </div>
      <footer><button class="btn" data-a="recarregarJanelas">${I('procurar')} Procurar de novo</button><span class="note">Para voltar: toque em qualquer cartão no celular ou em "Voltar para o Púlpito".</span></footer>
    </div></div>`;
  }

  // ---------- Tela de espera da reunião ----------
  // Como a tela de espera aparece (para as miniaturas). null = a do programa: foto + "Seja bem-vindo".
  function esperaCss(esp) {
    if (esp && esp.video) return esp.capa ? `url("${midia(esp.capa)}") center / cover no-repeat` : '#111';
    if (esp && esp.arquivo) return `url("${midia(esp.arquivo)}") center / cover no-repeat`;
    if (esp && esp.foto) return `url("${esp.foto}") center / cover no-repeat`;
    return 'linear-gradient(rgba(0,0,0,.5), rgba(0,0,0,.6)), url("/comum/fundos/amanhecer-dourado.jpg") center / cover no-repeat';
  }
  function amostraEspera(esp) {
    if (esp && esp.video && !esp.capa) return `<span class="amostra espera-amostra"><video src="${midia(esp.arquivo)}#t=1" muted preload="metadata"></video>${I('video')}</span>`;
    return `<span class="amostra espera-amostra" style='background:${esperaCss(esp)}'>${esp ? (esp.video ? I('video') : '') : '<b>Seja bem-vindo</b>'}</span>`;
  }
  const EXT_VID = /.(mp4|m4v|mov|webm|mkv)$/i;
  const esperaPadrao = () => M.info.telaEspera ? { arquivo: M.info.telaEspera, video: EXT_VID.test(M.info.telaEspera) } : null;
  function janelaEspera() {
    const r = reuniaoAberta();
    if (!r) { S.espera = false; return ''; }
    const padrao = esperaPadrao();
    const sel0 = r.telaEsperaId || '';
    // Só o que o pastor marcou na Biblioteca (e o que já está escolhido, mesmo se desmarcou depois).
    const vale = b => b.espera || b.id === sel0;
    const fotos = window.Versiculo.FUNDOS.filter(f => f.foto && (!(M.esperasEscondidas || []).includes(f.id) || f.id === sel0)).map(f => ({ id: f.id, nome: f.nome, esp: { foto: f.foto } }));
    const proprias = M.biblioteca.filter(b => (b.tipo === 'imagem' || b.tipo === 'fundo') && vale(b)).slice().reverse().map(b => ({ id: b.id, nome: b.titulo, esp: { arquivo: b.arquivo } }));
    const videos = M.biblioteca.filter(b => b.tipo === 'video' && vale(b)).slice().reverse().map(b => ({ id: b.id, nome: b.titulo, esp: { arquivo: b.arquivo, video: true, capa: b.capa } }));
    const sel = r.telaEsperaId || '';
    const tile = (id, nome, esp) => `<button class="fundo-op ${sel === id ? 'sel' : ''}" data-a="escolherEspera" data-v="${id}">
        ${amostraEspera(esp)}<span class="nome">${sel === id ? I('ok') + ' ' : ''}${esc(nome)}</span></button>`;
    // Mostra 4 de cada; a setinha abre o resto (abre sozinho se o escolhido estiver escondido).
    const VISIVEIS = 4;
    const grupo = (k, titulo, lista, nota, vazio) => {
      const aberto = (S.esperaMais || {})[k] || lista.slice(VISIVEIS).some(x => x.id === sel);
      const mostra = aberto ? lista : lista.slice(0, VISIVEIS);
      const resto = lista.length - VISIVEIS;
      return `<h3 class="sub-titulo">${titulo}</h3>
        ${lista.length ? (nota ? `<p class="note">${nota}</p>` : '') + `<div class="fundos">${mostra.map(x => tile(x.id, x.nome, x.esp)).join('')}</div>` : `<p class="note">${vazio}</p>`}
        ${resto > 0 ? `<button class="btn sm ver-mais" data-a="esperaMais" data-v="${k}">${I(aberto ? 'subir' : 'descer')} ${aberto ? 'Mostrar menos' : `Ver mais ${resto}`}</button>` : ''}`;
    };
    return `<div class="fundo-modal"><div class="janela" role="dialog" aria-label="Tela de espera desta reunião">
      <header><h2>Tela de espera desta reunião</h2><button class="btn sm" data-a="fecharModal">${I('fechar')} Fechar</button></header>
      <div class="corpo"><p class="note">É o que aparece na TV antes de começar e quando nada está passando. Se não escolher, fica a padrão.</p>
        <div class="fundos">${tile('', 'Padrão', padrao)}</div>
        ${grupo('video', 'Vídeos', videos, 'O vídeo passa sem som, repetindo, enquanto a TV está na espera. O som fica com a música da espera.',
          'Nenhum vídeo marcado para a espera. Na Biblioteca, aba Vídeos, clique em "Usar na espera" nos vídeos que quiser.')}
        ${grupo('imagem', 'Imagens', [...proprias, ...fotos], '', '')}
      </div>
      <footer><span class="note">A padrão muda em Configurações → Tela de espera.</span><button class="btn primary" data-a="fecharModal">Pronto</button></footer>
    </div></div>`;
  }

  // ---------- Música da espera ----------
  const tituloMusica = bid => { const b = bid && M.biblioteca.find(x => x.id === bid && x.tipo === 'musica'); return b ? b.titulo : null; };
  function nomeMusicaEspera(r) {
    if (r.musicaEsperaId === 'nenhuma') return 'sem música';
    const da = tituloMusica(r.musicaEsperaId);
    if (da) return da;
    const p = tituloMusica(M.info.musicaEspera);
    return p ? p + ' (padrão)' : 'sem música';
  }
  // Escolher a música que toca na tela de espera: da reunião aberta ou a padrão (Configurações).
  function janelaMusicaEspera() {
    const daReuniao = S.musicaEspera === 'reuniao';
    const r = reuniaoAberta();
    if (daReuniao && !r) { S.musicaEspera = null; return ''; }
    const sel = daReuniao ? (r.musicaEsperaId || '') : (M.info.musicaEspera || 'nenhuma');
    const musicas = M.biblioteca.filter(b => b.tipo === 'musica').slice().sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
    const op = (v, nome, sub) => `<button class="musica-op ${sel === v ? 'sel' : ''}" data-a="escolherMusicaEspera" data-v="${v}">
        ${I(sel === v ? 'ok' : v === 'nenhuma' ? 'fechar' : 'musica')}<span><b>${esc(nome)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
    const padrao = tituloMusica(M.info.musicaEspera);
    return `<div class="fundo-modal"><div class="janela" role="dialog" aria-label="Música da espera">
      <header><h2>${daReuniao ? 'Música da espera desta reunião' : 'Música da espera padrão'}</h2><button class="btn sm" data-a="fecharModal">${I('fechar')} Fechar</button></header>
      <div class="corpo"><p class="note">Toca em repetição na tela de espera quando a reunião é aberta, enquanto o povo chega.
        Quando o pastor coloca alguma coisa na TV, ela vai abaixando e para.</p>
        <div class="musicas-op">
          ${daReuniao ? op('', 'Usar a padrão', padrao ? padrao : 'a padrão está sem música') : ''}
          ${op('nenhuma', 'Sem música')}
          ${musicas.map(m => op(m.id, m.titulo)).join('')}
        </div>
        ${musicas.length ? '' : '<p class="note">Nenhuma música na Biblioteca ainda. Coloque as músicas na Biblioteca, aba Músicas.</p>'}
      </div>
      <footer><span class="note">${daReuniao ? 'A padrão muda em Configurações.' : 'Cada reunião pode escolher outra, no botão "Música da espera" dentro da reunião.'}</span><button class="btn primary" data-a="fecharModal">Pronto</button></footer>
    </div></div>`;
  }

  // ---------- Configurações ----------
  function configuracoes() {
    const f = S.pastorForm;
    const formPastor = f ? `<form class="caixa" id="form-pastor" autocomplete="off">
        <label class="campo"><span>Nome do pastor</span><input type="text" id="p-nome" value="${esc(f.nome)}" placeholder="Ex.: Pr. João" maxlength="40"></label>
        <div class="campo"><span>Bíblia preferida</span><div class="escolha">
          ${['ACF', 'ARC', 'NVI'].map(v => `<button type="button" class="btn ${f.versao === v ? 'sel' : ''}" data-a="pastorVersao" data-v="${v}">${v}</button>`).join('')}</div></div>
        <div class="acoes"><button type="submit" class="btn primary">Salvar</button><button type="button" class="btn" data-a="cancelarPastor">Cancelar</button></div>
      </form>` : '';
    const pastores = M.pastores.map(p => `<div class="pastor">
        <div><div class="t">${esc(p.nome)}</div><div class="note">Bíblia ${p.versao}</div></div>
        <div class="acoes"><button class="btn sm" data-a="editarPastor" data-v="${p.id}">${I('editar')} Editar</button>
          <button class="btn danger sm" data-a="removerPastor" data-v="${p.id}" aria-label="Remover pastor">${I('lixo')}</button></div></div>`).join('');
    const ep = esperaPadrao();
    const espera = ep && ep.video
      ? `<div class="espera-mini"><video src="${midia(ep.arquivo)}" muted autoplay loop playsinline></video></div>`
      : `<div class="espera-mini" style='background:${esperaCss(ep)}'>${ep ? '' : '<b>Seja bem-vindo</b>'}</div>`;

    return `<div class="pagina">
      <h1>Configurações</h1>
      <section class="caixa">
        <div class="cabeca"><h2>Pastores</h2>${f ? '' : '<button class="btn primary sm" data-a="novoPastor">+ Adicionar pastor</button>'}</div>
        ${formPastor}
        ${pastores || (f ? '' : '<p class="note">Nenhum pastor cadastrado.</p>')}
      </section>
      <section class="caixa">
        <h2>Tela de espera padrão</h2>
        <p class="note">O que aparece na TV antes e depois da reunião. Cada reunião pode escolher outra, no botão "Tela de espera" dentro da reunião.
          A do programa é uma foto com a logo da igreja e "Seja bem-vindo".</p>
        ${espera}
        <div class="acoes"><button class="btn" data-a="trocarEspera">Usar uma imagem ou vídeo meu</button>
          ${M.info.telaEspera ? '<button class="btn" data-a="esperaDoPrograma">Voltar para a do programa</button>' : ''}</div>
      </section>
      <section class="caixa">
        <h2>Música da espera padrão</h2>
        <p class="note">Toca na tela de espera quando a reunião é aberta. Quando alguma coisa vai para a TV, ela vai abaixando e para.</p>
        <div class="acoes"><button class="btn" data-a="abrirMusicaEspera" data-v="padrao">${I('musica')} ${esc(tituloMusica(M.info.musicaEspera) || 'Sem música')}</button></div>
      </section>
      <section class="caixa">
        <h2>Monitores</h2>
        <p class="note">${M.info.tv === 'tv' ? 'A TV está ligada.' : 'A TV não foi encontrada. O Telão está numa janela.'}
          ${M.info.telas > 1 ? 'Se a TV e o notebook estiverem trocados, use o botão abaixo.' : ''}</p>
        ${M.info.telas > 1 ? `<div class="acoes"><button class="btn" data-a="trocarTelas">${I('trocar')} Trocar TV e notebook</button></div>` : ''}
      </section>
      <section class="caixa">
        <h2>Logo da igreja</h2>
        <p class="note">Aparece no menu do notebook, no celular do pastor e no ícone do app no celular. Use uma imagem PNG com fundo transparente.</p>
        <div class="logo-linha">
          <div class="logo-amostra">${M.info.logo ? `<img src="/logo.png?v=${encodeURIComponent(M.info.logo)}" alt="Logo atual">` : '<img src="/comum/icone.svg" alt="Cruz do Púlpito">'}</div>
          <div class="pilha">
            <div class="t-grande">${M.info.logo ? 'A logo da igreja está sendo usada.' : 'Sem logo: aparece a cruz do Púlpito.'}</div>
            <div class="acoes"><button class="btn primary sm" data-a="escolherLogo">${M.info.logo ? 'Trocar logo' : 'Escolher logo'}</button>
              ${M.info.logo ? '<button class="btn sm" data-a="tirarLogo">Tirar logo</button>' : ''}</div>
          </div>
        </div>
        <details class="ajuda"><summary>Como colocar o ícone na tela do celular</summary>
          <ol class="passos">
            <li>Conecte o celular pelo QR code (menu <strong>Conectar celular</strong>).</li>
            <li><strong>Android (Chrome):</strong> toque no menu <strong>⋮</strong> e em <strong>Adicionar à tela inicial</strong>.</li>
            <li><strong>iPhone (Safari):</strong> toque no botão de compartilhar e em <strong>Adicionar à Tela de Início</strong>.</li>
            <li>Se trocar a logo depois, apague o ícone do celular e coloque de novo.</li>
          </ol></details>
      </section>
      ${secaoWindows()}
    </div>`;
  }

  // Opções do Windows (vêm do programa, não do servidor)
  let opcoesWindows = null;
  function carregarOpcoes() {
    if (!window.notebook?.opcoes) return;
    window.notebook.opcoes().then(o => { opcoesWindows = o; desenhar(); });
  }
  carregarOpcoes();
  function secaoWindows() {
    const o = opcoesWindows;
    if (!o) return '';
    const simNao = (nome, valor) => `<div class="escolha">
        <button class="btn ${valor ? 'sel' : ''}" data-a="opcao" data-v="${nome}" data-sim="1">Sim</button>
        <button class="btn ${!valor ? 'sel' : ''}" data-a="opcao" data-v="${nome}" data-sim="0">Não</button></div>`;
    return `<section class="caixa">
        <h2>Windows</h2>
        <div class="campo"><span>Abrir o programa sozinho quando o notebook ligar</span>${simNao('iniciarComWindows', o.iniciarComWindows)}
          ${o.instalado ? '' : '<p class="note">Vale só depois de instalar pelo instalador (.exe).</p>'}</div>
        <div class="campo"><span>Esconder os avisos do Windows (e-mail, atualizações...) enquanto o programa está aberto</span>${simNao('esconderNotificacoes', o.esconderNotificacoes)}
          <p class="note">Ao fechar o programa, os avisos voltam como estavam.</p></div>
      </section>`;
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
    let t = r.qtd ? `${r.qtd} ${r.qtd === 1 ? 'arquivo adicionado' : 'arquivos adicionados'}.` : r.repetidos ? '' : 'Nenhum arquivo adicionado.';
    if (r.repetidos) t += ` ${r.repetidos} ${r.repetidos === 1 ? 'já estava' : 'já estavam'} na Biblioteca e não ${r.repetidos === 1 ? 'foi copiado' : 'foram copiados'} de novo${r.naReuniao ? ` (mas ${r.repetidos === 1 ? 'entrou' : 'entraram'} na reunião)` : ''}.`;
    t = t.trim();
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
    // Começa a reunião (se ainda não é a que está na TV) e abre o controle aqui no notebook.
    passarAqui: v => { if (M.estado.reuniaoId !== v) enviar({ cmd: 'escolherReuniao', id: v }); S.aba = 'reserva'; S.form = null; S.renomear = null; },
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
      const comoFundo = S.aba === 'biblioteca' && S.bibAba === 'espera' ? 'espera' : (S.aba === 'biblioteca' && S.bibAba === 'fundo') || S.fundo;
      const r = await window.notebook.importarDialogo(S.aba === 'reunioes' && !comoFundo ? S.aberta : null, comoFundo);
      avisarImportacao(r);
    },
    novaPregacao: async () => {
      const r = await window.notebook.importarPregacao(S.aba === 'reunioes' ? S.aberta : null);
      if (!r) return;
      if (!r.qtd) { avisar('Nenhuma imagem escolhida. A pregação precisa de imagens (fotos).'); return; }
      avisar(r.repetida
        ? `Essa pregação já estava na Biblioteca ("${r.titulo}"). Não foi copiada de novo${S.aba === 'reunioes' && S.aberta ? ', mas está na reunião' : ''}.`
        : `Pregação criada com ${r.imagens} imagens. Para mudar o nome, vá na Biblioteca.`);
    },
    daBiblioteca: () => { S.escolher = { aba: 'video', sel: new Set() }; },
    escolherAba: v => { S.escolher.aba = v; },
    marcar: v => { const s = S.escolher.sel; s.has(v) ? s.delete(v) : s.add(v); },
    colocar: () => {
      enviar({ cmd: 'adicionarItens', reuniaoId: S.aberta, bibliotecaIds: [...S.escolher.sel] });
      avisar(`${S.escolher.sel.size} colocado(s) na reunião.`);
      S.escolher = null;
    },
    fecharModal: () => { S.escolher = null; S.testar = null; S.verso = null; S.fundo = false; S.janelas = null; S.espera = false; S.musicaEspera = null; },
    abrirEspera: () => { S.espera = true; S.esperaMais = {}; },
    esperaMais: v => { S.esperaMais[v] = !S.esperaMais[v]; },
    marcarEspera: v => { const b = M.biblioteca.find(x => x.id === v); if (!b) return; b.espera = !b.espera; enviar({ cmd: 'marcarParaEspera', id: v, sim: b.espera }); },
    abrirMusicaEspera: v => { S.musicaEspera = v; },
    escolherMusicaEspera: v => {
      if (S.musicaEspera === 'padrao') {
        M.info.musicaEspera = v === 'nenhuma' ? null : v;  // já mostra marcado enquanto o notebook grava
        enviar({ cmd: 'musicaEsperaPadrao', id: v === 'nenhuma' ? null : v });
      } else {
        const r = reuniaoAberta();
        r.musicaEsperaId = v || null;
        enviar({ cmd: 'editarReuniao', id: S.aberta, campos: { musicaEspera: v || null } });
      }
    },
    escolherEspera: v => {
      const r = reuniaoAberta();
      r.telaEsperaId = v || null;  // já mostra marcado enquanto o notebook grava
      enviar({ cmd: 'editarReuniao', id: S.aberta, campos: { telaEspera: v || null } });
    },
    esperaDoPrograma: () => window.notebook.telaEsperaDoPrograma(),
    abrirJanelas: () => { S.janelas = { lista: null }; carregarJanelas(); },
    recarregarJanelas: () => { S.janelas = { lista: null }; carregarJanelas(); },
    mostrarJanela: v => {
      const j = S.janelas && S.janelas.lista && S.janelas.lista.find(x => x.id === v);
      if (!j) return;
      enviar({ cmd: 'mostrarJanela', fonteId: j.id, nome: j.nome });
      S.janelas = null;
    },
    sairJanela: () => enviar({ cmd: 'sairJanela' }),
    testar: () => { S.testar = 0; },
    abrirVerso: v => {
      const pal = v && reuniaoAberta()?.itens.find(i => i.id === v);
      S.verso = { test: 'AT', l: null, c: null, de: null, ate: null, versao: null, busca: '', palavraId: v || null, nome: pal ? pal.nome || '' : '' }; setTimeout(() => $('v-busca')?.focus()); },
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
    versoNome: v => { S.verso.nome = v === 'Palavra' ? '' : v; },
    versoColocar: () => {
      const x = S.verso;
      enviar({ cmd: 'adicionarVersiculo', reuniaoId: S.aberta, ref: { l: x.l, c: x.c, v: x.de }, ate: x.ate || x.de, versao: x.versao, palavraId: x.palavraId, nome: x.nome || '' });
      avisar(`Versículo colocado em "${x.nome || 'Palavra'}".`);
      S.verso = null;
    },
    abrirFundo: () => { S.fundo = true; },
    escolherFundo: v => {
      const r = reuniaoAberta();
      r.fundoId = v;  // já mostra marcado enquanto o notebook grava
      enviar({ cmd: 'editarReuniao', id: S.aberta, campos: { fundo: v } });
    },
    testarPasso: v => { S.testar += Number(v); },
    bibAba: v => { S.bibAba = v; S.renomear = null; S.catForm = null; },
    visao: v => {
      const tipo = S.escolher ? S.escolher.aba : S.bibAba;
      visoes[tipo] = v;
      try { localStorage.setItem('pulpito-visao', JSON.stringify(visoes)); } catch {}
    },
    catFiltro: v => { S.catFiltro = v; S.catForm = null; },
    catNova: () => { S.catForm = { nome: '' }; setTimeout(() => $('cat-nome')?.focus()); },
    catRenomear: v => { const c = M.categorias.find(x => x.id === v); S.catForm = { id: v, nome: c ? c.nome : '' }; setTimeout(() => $('cat-nome')?.focus()); },
    catCancelar: () => { S.catForm = null; },
    catApagar: v => {
      const c = M.categorias.find(x => x.id === v);
      if (c && !confirm(`Apagar a categoria "${c.nome}"? As músicas continuam na Biblioteca, só ficam sem categoria.`)) return;
      enviar({ cmd: 'removerCategoria', id: v });
      S.catFiltro = 'todas';
    },
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
    esconderFundo: v => enviar({ cmd: 'esconderFundo', id: v }),
    esconderEspera: v => enviar({ cmd: 'esconderEsperaDoPrograma', id: v }),
    mostrarEsperas: () => enviar({ cmd: 'mostrarEsperasDoPrograma' }),
    mostrarFundos: () => enviar({ cmd: 'mostrarFundosDoPrograma' }),
    trocarTelas: () => window.notebook.trocarTelas(),
    escolherLogo: async () => {
      const r = await window.notebook.escolherLogo();
      if (r && r.erro) avisar(r.erro); else if (r && r.ok) avisar('Logo colocada.');
    },
    tirarLogo: async () => { await window.notebook.tirarLogo(); avisar('Logo tirada. Voltou a cruz do Púlpito.'); },
    opcao: async (nome, el) => {
      await window.notebook.mudarOpcao(nome, el.dataset.sim === '1');
      carregarOpcoes();
    },
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

  // Categoria escolhida numa música
  document.addEventListener('change', ev => {
    const sel = ev.target.closest && ev.target.closest('select[data-categoria]');
    if (sel) enviar({ cmd: 'definirCategoria', id: sel.dataset.categoria, categoria: sel.value || null });
  });

  document.addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target;
    if (f.id === 'form-categoria') {
      const nome = $('cat-nome').value.trim();
      if (!nome) { avisar('Escreva o nome da categoria.'); return; }
      if (S.catForm.id) enviar({ cmd: 'renomearCategoria', id: S.catForm.id, nome });
      else {
        const c = await pedir({ cmd: 'criarCategoria', nome });
        if (c) S.catFiltro = c.id;  // já mostra a categoria nova, pronta para receber músicas
      }
      S.catForm = null;
      document.activeElement?.blur();
      desenhar();
      return;
    }
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
    const comoFundo = S.aba === 'biblioteca' && S.bibAba === 'espera' ? 'espera' : (S.aba === 'biblioteca' && S.bibAba === 'fundo') || S.fundo;
    avisarImportacao(await window.notebook.importarArquivos(ev.dataTransfer.files, comoFundo ? null : destino, comoFundo));
  });

  desenhar();
})();
