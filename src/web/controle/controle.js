// Controle: o celular do Pastor. Mostra a reunião em cartões; tocar num cartão leva para o Telão.
(function () {
  const app = document.getElementById('app');
  const local = new URLSearchParams(location.search).get('local') === '1';
  const ICONE = { imagem: '🖼️', video: '🎬', palavra: '📖', musica: '🎵', pregacao: '📑' };
  const TIPO = { imagem: 'Imagem', video: 'Vídeo', musica: 'Música · a TV continua com o que está nela' };
  const ULTIMO_DO_AT = 38; // Malaquias

  let dados = null;            // último pacote recebido do Notebook
  let con = { conectado: false };
  let confirmarEncerrar = false;
  let verOutras = false;
  let escolhendo = null;       // { etapa: 'livro'|'cap'|'vers', test: 'AT'|'NT', l, c } escolhendo versículo
  let palavraAberta = false;   // painel da Palavra aberto (setas + passagens preparadas)
  let pregacaoAberta = false;  // painel da Pregação aberto (◀ ▶ + miniaturas)
  let escolhendoMusica = false; // lista de músicas para tocar avulsa
  let envio = null;            // mandar arquivos do celular para a Biblioteca: { status, atual, total, pct, resultado, modo }
  let escolhendoBib = null;    // colocar da Biblioteca na reunião: { aba, sel: [ids na ordem marcada] }
  let novaReuniao = null;      // criando reunião pelo celular: { pastorId, nome }
  let chaveTela = '';          // para não redesenhar tudo só porque o tempo do vídeo andou
  const indices = {};          // livros e capítulos de cada versão (vem do notebook uma vez)

  const conexao = window.Auxilio.conectar({
    papel: 'controle',
    local,
    aoReceber: m => { if (m.tipo === 'estado') { dados = m; desenhar(); } },
    aoMudar: c => { con = c; desenhar(true); },
  });

  const mmss = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const enviar = cmd => conexao.enviar(cmd);
  const versao = () => (dados && dados.reuniao && dados.reuniao.versao) || 'ACF';

  function carregarIndice(v) {
    if (indices[v]) return;
    indices[v] = 'carregando';
    fetch(`/api/biblia?t=${encodeURIComponent(conexao.token)}&v=${v}`)
      .then(r => r.json())
      .then(j => { indices[v] = j; desenhar(true); })
      .catch(() => { delete indices[v]; });
  }

  // ---------- o que está na TV ----------
  function itemNaTv() {
    const e = dados.estado;
    return e.tv.tipo === 'item' && dados.reuniao ? dados.reuniao.itens.find(i => i.id === e.tv.itemId) : null;
  }

  function rotuloTv() {
    const e = dados.estado;
    if (e.tv.tipo === 'espera') return 'Tela de espera';
    if (e.tv.tipo === 'preto') return 'TV apagada';
    if (e.tv.tipo === 'janela') return '💻 ' + e.tv.nome;
    if (dados.versiculo) return `📖 ${dados.versiculo.rotulo} · ${dados.versiculo.versao}${dados.versiculo.avulso ? ' (fora do planejado)' : ''}`;
    const it = itemNaTv();
    if (!it) return '';
    if (it.tipo === 'pregacao') return `${it.titulo} · imagem ${e.tv.slide + 1} de ${it.arquivos.length}`;
    if (it.tipo === 'video') {
      const v = e.video || {};
      return it.titulo + (v.terminou ? ' (terminou, parado no último quadro)' : v.tocando ? ' (passando)' : ' (pausado)');
    }
    return it.titulo;
  }

  function miniTv() {
    const e = dados.estado;
    if (e.tv.tipo === 'espera') return `<div class="tv espera"><div class="rot">Tela de espera</div></div>`;
    if (e.tv.tipo === 'preto') return `<div class="tv"><div class="rot">TV apagada<small>tela preta</small></div></div>`;
    if (e.tv.tipo === 'janela') return `<div class="tv video"><div class="rot">💻 Janela do notebook<small>${esc(e.tv.nome)}</small></div></div>`;
    if (dados.versiculo) return `<div class="tv">${window.Versiculo.html(dados.versiculo, conexao.midia)}</div>`;
    const it = itemNaTv();
    if (it && it.tipo === 'imagem') return `<div class="tv"><img src="${conexao.midia(it.arquivo)}" alt=""></div>`;
    if (it && it.tipo === 'pregacao') return `<div class="tv"><img src="${conexao.midia(it.arquivos[e.tv.slide] || it.arquivos[0])}" alt=""></div>`;
    if (it && it.tipo === 'video') return `<div class="tv video"><div class="rot">🎬 ${esc(it.titulo)}</div></div>`;
    return `<div class="tv"></div>`;
  }

  function volume() {
    const v = dados.estado.volume;
    return `<div class="vol">
      <button class="btn" data-cmd="volume" data-delta="-1" aria-label="Diminuir volume">−</button>
      <div class="segs" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i class="${i < v ? 'on' : ''}" style="height:${30 + i * 7}%"></i>`).join('')}</div>
      <button class="btn" data-cmd="volume" data-delta="1" aria-label="Aumentar volume">+</button>
      <div class="vol-lbl">Volume ${v} de 10</div></div>`;
  }

  function painelVideo() {
    const e = dados.estado, it = itemNaTv();
    if (!it || it.tipo !== 'video' || !e.video) return '';
    const v = e.video;
    const pct = v.dur ? Math.min(100, (v.t / v.dur) * 100) : 0;
    return `<div class="media">
      <div class="what">🎬 ${esc(it.titulo)}</div>
      <div class="bar"><i data-prog="v" style="width:${pct}%"></i></div>
      <div class="sub"><span data-tempo="v">${mmss(v.t)}</span>${v.dur ? ' de ' + mmss(v.dur) : ''}${v.terminou ? ' · terminou, a TV ficou no último quadro' : ''}</div>
      <div class="row">${v.tocando
        ? `<button class="btn" data-cmd="videoPausar">⏸ Pausar</button>`
        : `<button class="btn primary" data-cmd="videoContinuar">${v.terminou ? '↺ Passar de novo' : '▶ Continuar'}</button>`}</div>
      ${e.audio ? '' : volume()}</div>`;
  }

  // Música tocando (do cartão ou avulsa). Aparece também por cima, na Palavra e na Pregação.
  function painelMusica() {
    const a = dados.estado.audio, m = dados.musica;
    if (!a || !m) return '';
    const pct = a.dur ? Math.min(100, (a.t / a.dur) * 100) : 0;
    return `<div class="media musica">
      <div class="what">🎵 ${esc(m.titulo)}</div>
      <div class="bar"><i data-prog="a" style="width:${pct}%"></i></div>
      <div class="sub"><span data-tempo="a">${mmss(a.t)}</span>${a.dur ? ' de ' + mmss(a.dur) : ''}${a.terminou ? ' · terminou' : ''}</div>
      <div class="row">${a.tocando
        ? '<button class="btn" data-cmd="audioPausar">⏸ Pausar</button>'
        : `<button class="btn primary" data-cmd="audioContinuar">${a.terminou ? '↺ Tocar de novo' : '▶ Continuar'}</button>`}
        <button class="btn danger" data-cmd="audioParar">⏹ Parar música</button></div>
      ${volume()}</div>`;
  }

  function cartao(it) {
    const e = dados.estado;
    const tocando = it.tipo === 'musica' && e.audio && e.audio.itemId === it.id;
    const naTv = (e.tv.tipo === 'item' && e.tv.itemId === it.id) || tocando;
    const comFoto = it.tipo === 'imagem' || it.tipo === 'pregacao';
    const icone = comFoto ? `<img src="${conexao.midia(it.arquivo)}" alt="" loading="lazy">` : ICONE[it.tipo] || '•';
    const sub = it.tipo === 'palavra' ? it.passagens.map(p => esc(p.titulo)).join(' · ')
      : it.tipo === 'pregacao' ? `Pregação · ${it.arquivos.length} ${it.arquivos.length === 1 ? 'imagem' : 'imagens'}`
      : TIPO[it.tipo] || '';
    const titulo = esc(it.titulo);
    const chip = tocando ? (e.audio.tocando ? 'TOCANDO' : e.audio.terminou ? 'TERMINOU' : 'PAUSADA') : 'NA TV';
    return `<button class="card ${it.tipo} ${naTv ? 'on' : ''}" data-acao="cartao" data-item="${it.id}">
      <span class="ic" aria-hidden="true">${icone}</span>
      <span><span class="t">${titulo}</span><br><span class="d">${sub}</span></span>
      ${naTv ? `<span class="chip">${chip}</span>` : ''}</button>`;
  }

  // ---------- telas ----------
  const diaSemana = d => { const [a, m, dd] = d.split('-').map(Number); return new Date(a, m - 1, dd).toLocaleDateString('pt-BR', { weekday: 'long' }); };
  const tituloReuniao = r => r.nome || `Reunião de ${diaSemana(r.data)}`;

  function botaoReuniao(r, mostrarDia) {
    const dia = mostrarDia ? `${diaSemana(r.data)} ${r.data.split('-').reverse().slice(0, 2).join('/')} · ` : '';
    return `<button class="reuniao-btn" data-cmd="escolherReuniao" data-id="${r.id}">
      <span class="hora">${esc(r.hora)}</span><span class="p">${r.pastor ? esc(r.pastor) : esc(tituloReuniao(r))}</span>
      <span class="v">${esc(dia)}${r.pastor ? esc(tituloReuniao(r)) + ' · ' : ''}${r.qtd} ${r.qtd === 1 ? 'item' : 'itens'}</span></button>`;
  }

  // Topo com a logo da igreja (ou a cruz do Púlpito) e o nome do programa.
  function marca() {
    const logo = dados && dados.info && dados.info.logo;
    return `<div class="marca-cel"><img class="marca-logo" src="${logo ? '/logo.png?v=' + encodeURIComponent(logo) : '/comum/icone.svg'}" alt="">Púlpito</div>`;
  }

  // O ícone do app no celular acompanha a logo (muda o endereço para o celular não usar a antiga).
  let iconeAtual;
  function atualizarIcone() {
    const logo = (dados && dados.info && dados.info.logo) || 'padrao';
    if (logo === iconeAtual) return;
    iconeAtual = logo;
    const v = encodeURIComponent(logo);
    document.querySelector('link[rel="apple-touch-icon"]').href = '/icone-app.png?v=' + v;
    document.querySelector('link[rel="manifest"]').href = '/manifest.webmanifest?v=' + v;
  }

  function telaEscolher() {
    const deHoje = dados.reunioes.filter(r => r.data === dados.hoje);
    const outras = dados.reunioes.filter(r => r.data !== dados.hoje);
    return `<div class="pad escolher">
      ${marca()}
      ${avisoConexao()}
      <div class="eyebrow">Hoje · ${esc(diaSemana(dados.hoje))}</div>
      ${dados.estado.tv.tipo === 'janela' ? `<div class="eyebrow">Na TV agora: 💻 ${esc(dados.estado.tv.nome)}</div><button class="btn primary" data-cmd="sairJanela">↩ Tirar a janela da TV</button>` : ''}
      <h1>Qual reunião vai começar?</h1>
      ${deHoje.length ? deHoje.map(r => botaoReuniao(r)).join('')
        : '<p class="note">Nenhuma reunião marcada para hoje. Prepare a reunião no notebook.</p>'}
      ${outras.length ? (verOutras
        ? `<div class="eyebrow">Outros dias</div>${outras.map(r => botaoReuniao(r, true)).join('')}
           <button class="btn" data-acao="outras">Esconder outros dias</button>`
        : `<button class="btn" data-acao="outras">Ver reuniões de outros dias</button>`) : ''}
      <button class="btn primary" data-acao="novaReuniao">➕ Criar reunião agora</button>
      <button class="btn" data-acao="abrirEnvio">📤 Mandar fotos, vídeos ou músicas para a Biblioteca</button>
    </div>`;
  }

  // Nomes da semana da igreja; o do dia vem primeiro.
  const NOMES_DA_SEMANA = ['Encontro com Deus', 'Reunião da prosperidade', 'Reunião de cura', 'Reunião dos filhos de Deus', 'Reunião da família', 'Reunião de libertação', 'Terapia do amor'];
  function telaNovaReuniao() {
    const n = novaReuniao;
    const dia = new Date(dados.hoje + 'T12:00').getDay();
    const nomes = [...new Set([NOMES_DA_SEMANA[dia], ...(dados.nomesReunioes || []).slice().reverse(), ...NOMES_DA_SEMANA])].slice(0, 8);
    const pastores = dados.pastores || [];
    return `<div class="painel" role="dialog" aria-label="Criar reunião">
      <div class="painel-topo"><h2>➕ Criar reunião agora</h2><button class="btn" data-acao="fecharNovaReuniao">✕ Fechar</button></div>
      <div class="painel-corpo nova-reuniao" data-scroll="nova">
      <p class="note">A reunião fica marcada para hoje, agora, e já começa. Depois é só colocar as coisas nela.</p>
      ${pastores.length ? `<div class="eyebrow">Quem vai conduzir?</div>
        <div class="escolha-cel">${pastores.map(p => `<button class="btn ${n.pastorId === p.id ? 'sel' : ''}" data-acao="nrPastor" data-id="${p.id}">${esc(p.nome)}</button>`).join('')}</div>` : ''}
      <div class="eyebrow">Nome da reunião</div>
      <div class="escolha-cel">${nomes.map(x => `<button class="btn ${n.nome === x ? 'sel' : ''}" data-acao="nrNome" data-nome="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <input type="text" id="nr-nome" class="campo-cel" value="${esc(n.nome)}" placeholder="Ou escreva outro nome" maxlength="60" autocomplete="off">
      <button class="btn primary huge" data-acao="nrCriar">✅ Criar e começar</button>
    </div></div>`;
  }

  function telaReuniao() {
    const r = dados.reuniao, e = dados.estado;
    return `<div class="pad">
      ${marca()}
      ${avisoConexao()}
      <div class="top"><div class="nome">${esc(tituloReuniao(r))} · ${esc(r.hora)}</div><div class="quem">${r.pastor ? esc(r.pastor) + ' · ' : ''}Bíblia ${esc(r.versao)}</div></div>
      <div class="mini"><div class="eyebrow">Na TV agora</div>${miniTv()}<div class="cap">${esc(rotuloTv())}</div></div>
      ${e.tv.tipo === 'janela' ? '<button class="btn primary" data-cmd="sairJanela">↩ Voltar para o Púlpito</button>' : ''}
      ${painelVideo()}
      ${painelMusica()}
      <div class="eyebrow">Toque para mostrar na TV</div>
      <div class="cards">${r.itens.length ? r.itens.map(cartao).join('') : '<p class="note">Esta reunião ainda não tem itens.</p>'}</div>
      <button class="btn" data-acao="abrirBib">🗂️ Colocar da Biblioteca na reunião</button>
      <button class="btn" data-acao="abrirEnvio">📤 Mandar arquivos do celular para a Biblioteca</button>
      <button class="btn danger" data-acao="encerrar">✅ Encerrar reunião</button>
    </div>
    <div class="toolbar">
      <button class="btn" data-acao="abrirEscolha">📖 Versículo</button>
      <button class="btn" data-acao="abrirMusicas">🎵 Música</button>
      <button class="btn ${e.tv.tipo === 'preto' ? 'live' : ''}" data-cmd="apagar">${e.tv.tipo === 'preto' ? '💡 Ligar TV' : '⬛ Apagar TV'}</button>
    </div>`;
  }

  // ---------- versículo na TV: setas livres ----------
  // Números do capítulo que está na TV: o atual marcado, os preparados destacados.
  function gradeCapitulo(vs, palavra) {
    if (!vs.qtdCap) return '';
    const p = vs.planejado && palavra && palavra.passagens.find(x => x.id === vs.planejado.id);
    const preparado = n => p && p.ref.l === vs.ref.l && p.ref.c === vs.ref.c && n >= p.ref.v && n <= p.ate;
    return `<div class="eyebrow">Versículos de ${esc(vs.capitulo)}</div>
      <div class="numeros">${Array.from({ length: vs.qtdCap }, (_, i) => i + 1).map(n => n === vs.ref.v
        ? `<button class="btn sel" aria-current="true">${n}</button>`
        : `<button class="btn ${preparado(n) ? 'plan' : ''}" data-acao="irVersiculo" data-v="${n}">${n}</button>`).join('')}</div>`;
  }

  // ---------- a Palavra: setas livres + passagens preparadas ----------
  function painelVersiculo() {
    const vs = dados.versiculo;
    // Os preparados são os da Palavra que está na TV (a reunião pode ter várias).
    const tv = dados.estado.tv;
    const palavra = tv.tipo === 'item' ? dados.reuniao.itens.find(i => i.id === tv.itemId && i.tipo === 'palavra') : null;
    let aviso = '';
    if (vs.planejado && !vs.planejado.dentro) aviso = `Passou de ${esc(vs.planejado.titulo)}. Pode continuar lendo à vontade.`;
    if (vs.avulso) aviso = 'Escolhido na hora (fora do que foi preparado).';
    const preparados = palavra ? `<div class="eyebrow">Preparados para hoje</div>
        <div class="passagens">${palavra.passagens.map(p => {
          const atual = vs.planejado && vs.planejado.id === p.id;
          return `<button class="btn ${atual ? 'sel' : ''}" data-acao="passagem" data-item="${palavra.id}" data-p="${p.id}">${atual ? '● ' : ''}${esc(p.titulo)}</button>`;
        }).join('')}</div>` : '';
    const rodape = vs.avulso
      ? `<button class="btn huge" data-cmd="voltarReuniao">↩ Voltar para a reunião</button>`
      : '';
    return `<div class="painel" role="dialog" aria-label="Palavra">
      <div class="painel-topo"><h2>📖 ${esc(vs.rotulo)} · ${esc(vs.versao)}</h2>
        ${vs.avulso ? '' : '<button class="btn" data-acao="fecharVerso">✕ Fechar</button>'}</div>
      <div class="painel-corpo" data-scroll="verso-${esc(vs.capitulo)}">
        <div class="tv">${window.Versiculo.html(vs, conexao.midia)}</div>
        <div class="capbar">
          <button class="btn" data-cmd="passoVersiculo" data-delta="-1" ${vs.anterior ? '' : 'disabled'}>◀<small>${esc(vs.anterior || 'início')}</small></button>
          <button class="btn atual" data-acao="abrirCapitulos">${esc(vs.capitulo)}<small>trocar capítulo ou livro</small></button>
          <button class="btn primary" data-cmd="passoVersiculo" data-delta="1" ${vs.proximo ? '' : 'disabled'}>▶<small>${esc(vs.proximo || 'fim')}</small></button>
        </div>
        ${aviso ? `<p class="note">${aviso}</p>` : ''}
        ${gradeCapitulo(vs, palavra)}
        ${preparados}
        ${painelMusica()}
        ${rodape}
      </div></div>`;
  }

  // ---------- Pregação: ◀ ▶ grandes e todas as imagens para tocar ----------
  function painelPregacao() {
    const it = itemNaTv();
    const s = dados.estado.tv.slide, n = it.arquivos.length;
    return `<div class="painel" role="dialog" aria-label="Pregação">
      <div class="painel-topo"><h2>📑 ${esc(it.titulo)}</h2><button class="btn" data-acao="fecharPregacao">✕ Fechar</button></div>
      <div class="painel-corpo" data-scroll="preg-${it.id}">
        <div class="tv"><img src="${conexao.midia(it.arquivos[s])}" alt=""></div>
        <div class="capbar">
          <button class="btn" data-cmd="passoSlide" data-delta="-1" ${s === 0 ? 'disabled' : ''}>◀<small>anterior</small></button>
          <div class="contador"><b>${s + 1}</b><small>de ${n}</small></div>
          <button class="btn primary" data-cmd="passoSlide" data-delta="1" ${s === n - 1 ? 'disabled' : ''}>▶<small>${s === n - 1 ? 'última' : 'próxima'}</small></button>
        </div>
        <div class="eyebrow">Todas as imagens · toque para ir direto</div>
        <div class="slides">${it.arquivos.map((a, i) => `<button class="slide ${i === s ? 'on' : ''}" data-acao="irSlide" data-n="${i}" aria-label="Imagem ${i + 1}">
          <img src="${conexao.midia(a)}" alt="" loading="lazy"><span>${i + 1}</span></button>`).join('')}</div>
        ${painelMusica()}
      </div></div>`;
  }

  // ---------- Música avulsa: qualquer música da Biblioteca ----------
  let catMusica = 'todas';      // categoria escolhida na lista de músicas do celular
  function telaMusicas() {
    const cats = (dados.categorias || []).filter(c => (dados.musicas || []).some(m => m.categoria === c.id));
    const semCat = (dados.musicas || []).some(m => !m.categoria);
    if (catMusica !== 'todas' && catMusica !== 'sem' && !cats.some(c => c.id === catMusica)) catMusica = 'todas';
    const lista = (dados.musicas || []).filter(m => catMusica === 'todas' || (catMusica === 'sem' ? !m.categoria : m.categoria === catMusica));
    const aba = (v, nome) => `<button class="btn ${catMusica === v ? 'sel' : ''}" data-acao="catMusica" data-v="${v}">${esc(nome)}</button>`;
    const abas = cats.length ? `<div class="cats-musica">${aba('todas', 'Todas')}${cats.map(c => aba(c.id, c.nome)).join('')}${semCat ? aba('sem', 'Outras') : ''}</div>` : '';
    const a = dados.estado.audio;
    const atual = id => a && a.bibliotecaId === id;
    return `<div class="painel" role="dialog" aria-label="Tocar música">
      <div class="painel-topo"><h2>🎵 Tocar uma música</h2><button class="btn" data-acao="fecharMusicas">✕ Fechar</button></div>
      <div class="painel-corpo" data-scroll="musicas">
        <p class="note">A TV continua mostrando o que está nela.</p>
        ${a ? '<button class="btn danger" data-cmd="audioParar">⏹ Parar a música que está tocando</button>' : ''}
        ${abas}
        ${lista.length
          ? `<div class="passagens">${lista.map(m => `<button class="btn ${atual(m.id) ? 'sel' : ''}" data-acao="tocarMusica" data-id="${m.id}">${atual(m.id) ? '🔊' : '🎵'} ${esc(m.titulo)}</button>`).join('')}</div>`
          : '<p class="note">Nenhuma música na Biblioteca ainda. Coloque as músicas pelo notebook.</p>'}
      </div></div>`;
  }

  // ---------- Mandar arquivos do celular para o notebook ----------
  function telaEnvio() {
    const e = envio;
    let corpo;
    if (e.status === 'enviando') {
      corpo = `<div class="envio-andamento">
          <div class="grande">📤</div>
          <h3>Enviando ${e.total > 1 ? `${e.atual} de ${e.total}` : ''}…</h3>
          <div class="bar"><i data-envio-pct style="width:${e.pct}%"></i></div>
          <p class="note">Deixe esta tela aberta e o celular ligado até terminar.</p></div>`;
    } else if (e.status === 'pronto') {
      const r = e.resultado || {};
      const onde = 'Estão na Biblioteca do notebook.';
      const msg = e.modo === 'pregacao'
        ? (r.repetida ? `Essa pregação já estava na Biblioteca ("${r.titulo}"). Não foi copiada de novo.`
          : r.qtd ? `A pregação com ${r.imagens} imagens chegou no notebook. ${onde}` : 'Nenhuma imagem chegou. A pregação precisa de fotos.')
        : (r.qtd ? `${r.qtd} ${r.qtd === 1 ? 'arquivo chegou' : 'arquivos chegaram'} no notebook. ${onde}`
          : r.repetidos ? 'Esses arquivos já estavam na Biblioteca.' : 'Nenhum arquivo chegou.');
      corpo = `<div class="envio-andamento"><div class="grande">${r.qtd || r.repetidos || r.repetida ? '✅' : '⚠️'}</div><h3>${esc(msg)}</h3>
          ${r.qtd && r.repetidos ? `<p class="note">${r.repetidos} ${r.repetidos === 1 ? 'já estava' : 'já estavam'} na Biblioteca e não ${r.repetidos === 1 ? 'foi copiado' : 'foram copiados'} de novo.</p>` : ''}
          ${r.ignorados ? `<p class="note">${r.ignorados} ${r.ignorados === 1 ? 'arquivo não era' : 'arquivos não eram'} foto, vídeo ou música e ${r.ignorados === 1 ? 'ficou' : 'ficaram'} de fora.</p>` : ''}
          ${dados.reuniao && r.ids && r.ids.length
            ? `<button class="btn primary huge" data-acao="colocarRecebidos">🗂️ Colocar na reunião agora</button>
               <button class="btn huge" data-acao="fecharEnvio">Agora não</button>`
            : '<button class="btn primary huge" data-acao="fecharEnvio">OK</button>'}</div>`;
    } else if (e.status === 'erro') {
      corpo = `<div class="envio-andamento"><div class="grande">❌</div><h3>Não deu certo.</h3>
          <p class="note">Confira se o celular está no Wi-Fi da igreja e tente de novo.</p>
          <button class="btn primary huge" data-acao="envioDeNovo">Tentar de novo</button></div>`;
    } else {
      corpo = `<p class="note">Os arquivos vão para a Biblioteca do notebook. Depois é só colocar na reunião.</p>
        <div class="eyebrow">O que vai mandar?</div>
        <label class="btn primary huge envio-btn">🖼️ Fotos, vídeos e músicas
          <input type="file" data-envio="arquivos" accept="image/*,video/*,audio/*" multiple hidden></label>
        <label class="btn huge envio-btn">📑 Imagens da pregação<small>marque todas, na ordem; viram uma pregação só</small>
          <input type="file" data-envio="pregacao" accept="image/*" multiple hidden></label>`;
    }
    const ocupado = e.status === 'enviando';
    return `<div class="painel" role="dialog" aria-label="Mandar para o notebook">
      <div class="painel-topo"><h2>📤 Mandar para a Biblioteca</h2>${ocupado ? '' : '<button class="btn" data-acao="fecharEnvio">✕ Fechar</button>'}</div>
      <div class="painel-corpo" data-scroll="envio">${corpo}</div></div>`;
  }

  // ---------- Colocar da Biblioteca na reunião ----------
  const ABAS_BIB = [['imagem', '🖼️ Imagens'], ['video', '🎬 Vídeos'], ['pregacao', '📑 Pregações'], ['musica', '🎵 Músicas']];
  function telaBiblioteca() {
    const b = escolhendoBib;
    const naReuniao = new Set(dados.reuniao.itens.map(i => i.bibliotecaId).filter(Boolean));
    const lista = (dados.biblioteca || []).filter(x => x.tipo === b.aba).slice().reverse();
    const qtd = t => (dados.biblioteca || []).filter(x => x.tipo === t).length;
    const miniatura = x => (x.tipo === 'imagem' || x.tipo === 'pregacao')
      ? `<img src="${conexao.midia(x.arquivo)}" alt="" loading="lazy">`
      : `<span class="ic-grande">${ICONE[x.tipo]}</span>`;
    const cartaoBib = x => {
      const n = b.sel.indexOf(x.id) + 1;
      return `<button class="bib ${n ? 'on' : ''}" data-acao="marcarBib" data-id="${x.id}">
        <span class="bib-img">${miniatura(x)}${n ? `<b class="ordem">✔ ${n}</b>` : ''}${x.qtd ? `<i class="qtd">${x.qtd}</i>` : ''}</span>
        <span class="bib-t">${esc(x.titulo)}</span>
        ${naReuniao.has(x.id) ? '<span class="bib-ja">já está na reunião</span>' : ''}</button>`;
    };
    return `<div class="painel" role="dialog" aria-label="Colocar da Biblioteca">
      <div class="painel-topo"><h2>🗂️ Colocar na reunião</h2><button class="btn" data-acao="fecharBib">✕ Fechar</button></div>
      <div class="painel-corpo" data-scroll="bib-${b.aba}">
        <div class="abas2 abas4">${ABAS_BIB.map(([t, nome]) => `<button class="btn ${b.aba === t ? 'sel' : ''}" data-acao="abaBib" data-v="${t}">${nome} (${qtd(t)})</button>`).join('')}</div>
        <p class="note">Toque para marcar. Entram no fim da reunião, na ordem em que você marcou.</p>
        ${lista.length ? `<div class="bibs">${lista.map(cartaoBib).join('')}</div>` : '<p class="note">Nada aqui ainda.</p>'}
      </div>
      <div class="toolbar"><button class="btn primary" data-acao="colocarBib" ${b.sel.length ? '' : 'disabled'}>${b.sel.length ? `Colocar ${b.sel.length} na reunião` : 'Marque o que vai entrar'}</button></div>
    </div>`;
  }

  // Manda um arquivo por vez, mostrando quanto já foi.
  function subir(url, arquivo, aoAndar) {
    return new Promise((ok, falha) => {
      const x = new XMLHttpRequest();
      x.open('POST', url);
      x.upload.onprogress = ev => { if (ev.lengthComputable) aoAndar(Math.round((ev.loaded / ev.total) * 100)); };
      x.onload = () => (x.status === 200 ? ok() : falha(new Error('status ' + x.status)));
      x.onerror = () => falha(new Error('rede'));
      x.send(arquivo);
    });
  }

  async function enviarArquivos(arquivos, modo) {
    const lista = Array.from(arquivos);
    if (!lista.length) return;
    const lote = (Math.random().toString(36).slice(2, 12) + Date.now().toString(36)).replace(/[^a-z0-9]/g, '');
    const t = encodeURIComponent(conexao.token);
    Object.assign(envio, { status: 'enviando', total: lista.length, atual: 0, pct: 0, modo });
    try {
      for (let i = 0; i < lista.length; i++) {
        envio.atual = i + 1; envio.pct = 0; desenhar(true);
        await subir(`/api/enviar?t=${t}&lote=${lote}&i=${i}&nome=${encodeURIComponent(lista[i].name || 'arquivo')}`, lista[i], p => {
          envio.pct = p;
          const barra = app.querySelector('[data-envio-pct]');
          if (barra) barra.style.width = p + '%';
        });
      }
      const r = await fetch(`/api/enviar-fim?t=${t}&lote=${lote}&modo=${modo}`, { method: 'POST' });
      if (!r.ok) throw new Error('fim ' + r.status);
      envio.resultado = await r.json();
      envio.status = 'pronto';
    } catch (e) {
      envio.status = 'erro';
    }
    desenhar(true);
  }

  // ---------- escolher um versículo: livro → capítulo → versículo ----------
  function telaEscolha() {
    const v = versao();
    const ind = indices[v];
    carregarIndice(v);
    const p = escolhendo;
    let titulo = 'Mostrar versículo', voltar = '', corpo;
    if (!ind || ind === 'carregando') {
      corpo = '<p class="note">Abrindo a Bíblia…</p>';
    } else if (p.etapa === 'livro') {
      const livros = p.test === 'AT' ? ind.slice(0, ULTIMO_DO_AT + 1) : ind.slice(ULTIMO_DO_AT + 1);
      const recentes = dados.recentes || [];
      corpo = `
        <div class="eyebrow">Últimos usados</div>
        ${recentes.length
          ? `<div class="grade2">${recentes.map(r => `<button class="btn" data-acao="recente" data-l="${r.l}" data-c="${r.c}" data-v="${r.v}">${esc(r.rotulo)}</button>`).join('')}</div>`
          : '<p class="note">Os versículos que você mostrar vão aparecer aqui.</p>'}
        <div class="eyebrow">Ou escolha o livro</div>
        <div class="abas2">
          <button class="btn ${p.test === 'AT' ? 'sel' : ''}" data-acao="testamento" data-v="AT">Antigo Testamento</button>
          <button class="btn ${p.test === 'NT' ? 'sel' : ''}" data-acao="testamento" data-v="NT">Novo Testamento</button>
        </div>
        <div class="grade2">${livros.map(x => `<button class="btn" data-acao="livro" data-l="${x.l}">${esc(x.nome)}</button>`).join('')}</div>`;
    } else if (p.etapa === 'cap') {
      const livro = ind[p.l];
      titulo = `${livro.nome}: capítulo`;
      const atual = dados.versiculo && dados.versiculo.ref.l === p.l ? dados.versiculo.ref.c : null;
      corpo = `<button class="btn" data-acao="trocarLivro">📚 Trocar o livro (agora: ${esc(livro.nome)})</button>
        <div class="eyebrow">Capítulos de ${esc(livro.nome)}</div>
        <div class="numeros">${livro.caps.map((_, i) => `<button class="btn ${i + 1 === atual ? 'sel' : ''}" data-acao="capitulo" data-c="${i + 1}">${i + 1}</button>`).join('')}</div>`;
    } else {
      const livro = ind[p.l];
      titulo = `${livro.nome} ${p.c}: versículo`;
      voltar = '<button class="btn" data-acao="voltarEscolha">◀ Voltar</button>';
      corpo = `<div class="numeros">${Array.from({ length: livro.caps[p.c - 1] }, (_, i) =>
        `<button class="btn" data-acao="versiculo" data-v="${i + 1}">${i + 1}</button>`).join('')}</div>`;
    }
    return `<div class="painel" role="dialog" aria-label="Escolher versículo">
      <div class="painel-topo">${voltar}<h2>${esc(titulo)}</h2><button class="btn" data-acao="fecharEscolha">✕ Cancelar</button></div>
      <div class="painel-corpo" data-scroll="escolha-${p.etapa}-${p.test}-${p.l ?? ''}-${p.c ?? ''}">${corpo}</div></div>`;
  }

  function avisoConexao() {
    return con.conectado ? '' : `<div class="aviso">Procurando o notebook… Confira se o celular está no Wi-Fi da igreja.</div>`;
  }

  function telaSemToken() {
    return `<div class="pad escolher"><div class="marca-cel"><img class="marca-logo" src="/comum/icone.svg" alt="">Púlpito</div>
      <h1>Leia o QR code que aparece no notebook</h1>
      <p class="note">Abra a câmera do celular, aponte para o QR code na tela do notebook e toque no link que aparecer.</p></div>`;
  }

  function telaConfirmar() {
    return `<div class="overlay"><h2>Encerrar a reunião?</h2><p>A TV volta para a tela de espera.</p>
      <button class="btn danger huge" data-cmd="encerrar">Sim, encerrar</button>
      <button class="btn huge" data-acao="cancelar">Não, continuar</button></div>`;
  }

  function sobreposicao() {
    if (confirmarEncerrar) return telaConfirmar();
    if (envio) return telaEnvio();
    if (escolhendoBib) return telaBiblioteca();
    if (escolhendo) return telaEscolha();
    if (escolhendoMusica) return telaMusicas();
    const vs = dados.versiculo;
    if (vs && (vs.avulso || palavraAberta)) return painelVersiculo();
    const it = itemNaTv();
    if (pregacaoAberta && it && it.tipo === 'pregacao') return painelPregacao();
    return '';
  }

  function desenhar(forcar) {
    let html;
    if (dados) atualizarIcone();
    if (con.semToken) html = telaSemToken();
    else if (!dados) html = `<div class="pad">${avisoConexao() || '<p class="note">Carregando…</p>'}</div>`;
    else if (dados.estado.reuniaoId && dados.reuniao) html = telaReuniao() + sobreposicao();
    else { escolhendo = null; palavraAberta = false; pregacaoAberta = false; escolhendoMusica = false; escolhendoBib = null; html = telaEscolher() + (envio ? telaEnvio() : novaReuniao ? telaNovaReuniao() : confirmarEncerrar ? telaConfirmar() : '');}
    if (dados && dados.estado.reuniaoId) novaReuniao = null;

    // Se só o tempo do vídeo mudou, atualiza a barra sem redesenhar (o toque do pastor não se perde).
    const chave = html.replace(/data-prog="\w" style="width:[^"]*"/g, '').replace(/<span data-tempo="\w">[^<]*<\/span>/g, '');
    if (!forcar && chave === chaveTela) {
      for (const [k, x] of [['v', dados.estado.video], ['a', dados.estado.audio]]) {
        if (!x) continue;
        app.querySelectorAll(`[data-prog="${k}"]`).forEach(el => { el.style.width = (x.dur ? Math.min(100, (x.t / x.dur) * 100) : 0) + '%'; });
        app.querySelectorAll(`[data-tempo="${k}"]`).forEach(el => { el.textContent = mmss(x.t); });
      }
      return;
    }
    chaveTela = chave;
    const rolagem = {};
    app.querySelectorAll('[data-scroll]').forEach(el => { rolagem[el.dataset.scroll] = el.scrollTop; });
    const digitando = document.activeElement && document.activeElement.id === 'nr-nome' ? document.activeElement.selectionStart : null;
    app.innerHTML = html;
    if (digitando !== null && document.getElementById('nr-nome')) { const i = document.getElementById('nr-nome'); i.focus(); i.setSelectionRange(digitando, digitando); }
    app.querySelectorAll('[data-scroll]').forEach(el => { if (rolagem[el.dataset.scroll]) el.scrollTop = rolagem[el.dataset.scroll]; });
    window.Versiculo.ajustar(app);
  }

  // ---------- toques ----------
  const ACOES = {
    encerrar: () => { confirmarEncerrar = true; },
    cancelar: () => { confirmarEncerrar = false; },
    outras: () => { verOutras = !verOutras; },
    novaReuniao: () => {
      const p = dados.pastores || [];
      novaReuniao = { pastorId: p.length === 1 ? p[0].id : null, nome: '' };
    },
    fecharNovaReuniao: () => { novaReuniao = null; },
    nrPastor: el => { novaReuniao.pastorId = novaReuniao.pastorId === el.dataset.id ? null : el.dataset.id; },
    nrNome: el => { novaReuniao.nome = novaReuniao.nome === el.dataset.nome ? '' : el.dataset.nome; },
    nrCriar: () => {
      enviar({ cmd: 'criarReuniaoAgora', pastorId: novaReuniao.pastorId, nome: novaReuniao.nome });
      novaReuniao = null;
    },
    cartao: el => {
      const it = dados.reuniao.itens.find(i => i.id === el.dataset.item);
      if (!it) return;
      enviar({ cmd: 'mostrar', itemId: it.id });
      palavraAberta = it.tipo === 'palavra';
      pregacaoAberta = it.tipo === 'pregacao';
    },
    fecharPregacao: () => { pregacaoAberta = false; },
    irSlide: el => enviar({ cmd: 'irSlide', n: Number(el.dataset.n) }),
    abrirMusicas: () => { escolhendoMusica = true; },
    catMusica: el => { catMusica = el.dataset.v; },
    abrirEnvio: () => { envio = { status: 'escolher' }; },
    colocarRecebidos: () => {
      // Abre "Colocar na reunião" já com o que acabou de chegar marcado.
      const ids = envio.resultado.ids;
      const primeiro = (dados.biblioteca || []).find(x => x.id === ids[0]);
      escolhendoBib = { aba: primeiro ? primeiro.tipo : 'imagem', sel: [...ids] };
      envio = null;
    },
    abrirBib: () => { escolhendoBib = { aba: 'imagem', sel: [] }; },
    fecharBib: () => { escolhendoBib = null; },
    abaBib: el => { escolhendoBib.aba = el.dataset.v; },
    marcarBib: el => {
      const s = escolhendoBib.sel, i = s.indexOf(el.dataset.id);
      if (i >= 0) s.splice(i, 1); else s.push(el.dataset.id);
    },
    colocarBib: () => {
      enviar({ cmd: 'colocarDaBiblioteca', bibliotecaIds: escolhendoBib.sel });
      escolhendoBib = null;
    },
    envioDeNovo: () => { envio.status = 'escolher'; },
    fecharEnvio: () => { envio = null; },
    fecharMusicas: () => { escolhendoMusica = false; },
    tocarMusica: el => { enviar({ cmd: 'tocarMusica', bibliotecaId: el.dataset.id }); escolhendoMusica = false; },
    passagem: el => { enviar({ cmd: 'mostrarPassagem', itemId: el.dataset.item, passagemId: el.dataset.p }); palavraAberta = true; },
    fecharVerso: () => { palavraAberta = false; },
    irVersiculo: el => enviar({ cmd: 'irVersiculo', v: Number(el.dataset.v) }),
    trocarLivro: () => { escolhendo = { etapa: 'livro', test: escolhendo.test }; },
    abrirCapitulos: () => {
      const l = dados.versiculo.ref.l;
      escolhendo = { etapa: 'cap', l, c: null, test: l > ULTIMO_DO_AT ? 'NT' : 'AT' };
    },
    abrirEscolha: () => { escolhendo = { etapa: 'livro', test: 'AT' }; },
    fecharEscolha: () => { escolhendo = null; },
    testamento: el => { escolhendo.test = el.dataset.v; },
    livro: el => {
      const l = Number(el.dataset.l);
      const livro = indices[versao()][l];
      // Livro de um capítulo só (Obadias, Judas...): vai direto para os versículos.
      escolhendo = { ...escolhendo, l, etapa: livro.caps.length === 1 ? 'vers' : 'cap', c: livro.caps.length === 1 ? 1 : null };
    },
    capitulo: el => { escolhendo = { ...escolhendo, c: Number(el.dataset.c), etapa: 'vers' }; },
    voltarEscolha: () => {
      const livro = indices[versao()][escolhendo.l];
      if (escolhendo.etapa === 'vers' && livro.caps.length > 1) escolhendo = { ...escolhendo, etapa: 'cap', c: null };
      else escolhendo = { etapa: 'livro', test: escolhendo.test };
    },
    versiculo: el => abrirVersiculo({ l: escolhendo.l, c: escolhendo.c, v: Number(el.dataset.v) }),
    recente: el => abrirVersiculo({ l: Number(el.dataset.l), c: Number(el.dataset.c), v: Number(el.dataset.v) }),
  };

  // Se já tem versículo na TV (na Palavra ou avulso), só pula para o novo e continua ali.
  // Se não, abre como versículo avulso por cima da reunião.
  function abrirVersiculo(ref) {
    if (dados.versiculo) enviar({ cmd: 'irVersiculo', ...ref });
    else enviar({ cmd: 'mostrarVersiculo', ref });
    escolhendo = null;
    palavraAberta = true;
  }

  app.addEventListener('click', ev => {
    const el = ev.target.closest('[data-cmd], [data-acao]');
    if (!el || el.disabled) return;
    const acao = el.dataset.acao;
    if (acao && ACOES[acao]) { ACOES[acao](el); desenhar(true); return; }
    const cmd = el.dataset.cmd;
    if (!cmd) return;
    if (cmd === 'encerrar') confirmarEncerrar = false;
    if (cmd === 'escolherReuniao') enviar({ cmd, id: el.dataset.id });
    else if (cmd === 'volume' || cmd === 'passoVersiculo' || cmd === 'passoSlide') enviar({ cmd, delta: Number(el.dataset.delta) });
    else enviar({ cmd });
    if (cmd === 'encerrar') desenhar(true);
  });

  // Escolheu os arquivos no celular: já começa a mandar.
  app.addEventListener('input', ev => { if (ev.target.id === 'nr-nome' && novaReuniao) novaReuniao.nome = ev.target.value; });
  app.addEventListener('change', ev => {
    const input = ev.target.closest('input[data-envio]');
    if (input && envio && input.files.length) enviarArquivos(input.files, input.dataset.envio);
  });

  window.addEventListener('resize', () => window.Versiculo.ajustar(app));

  // Tela do celular acesa (só funciona onde o navegador permite).
  async function manterAceso() {
    try { if (navigator.wakeLock && document.visibilityState === 'visible') await navigator.wakeLock.request('screen'); } catch (e) {}
  }
  document.addEventListener('visibilitychange', manterAceso);
  manterAceso();

  desenhar(true);
})();
