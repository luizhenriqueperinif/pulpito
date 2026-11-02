// Controle: o celular do Pastor. Mostra a reunião em cartões; tocar num cartão leva para o Telão.
(function () {
  const app = document.getElementById('app');
  const local = new URLSearchParams(location.search).get('local') === '1';
  const ICONE = { imagem: '🖼️', video: '🎬' };
  const TIPO = { imagem: 'Imagem', video: 'Vídeo' };

  let dados = null;            // último pacote recebido do Notebook
  let con = { conectado: false };
  let confirmarEncerrar = false;
  let chaveTela = '';          // para não redesenhar tudo só porque o tempo do vídeo andou

  const conexao = window.Auxilio.conectar({
    papel: 'controle',
    local,
    aoReceber: m => { if (m.tipo === 'estado') { dados = m; desenhar(); } },
    aoMudar: c => { con = c; desenhar(true); },
  });

  const mmss = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const enviar = cmd => conexao.enviar(cmd);

  function itemNaTv() {
    const e = dados.estado;
    return e.tv.tipo === 'item' && dados.reuniao ? dados.reuniao.itens.find(i => i.id === e.tv.itemId) : null;
  }

  function rotuloTv() {
    const e = dados.estado;
    if (e.tv.tipo === 'espera') return 'Tela de espera';
    if (e.tv.tipo === 'preto') return 'TV apagada';
    const it = itemNaTv();
    if (!it) return '';
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
    const it = itemNaTv();
    if (it && it.tipo === 'imagem') return `<div class="tv"><img src="${conexao.midia(it.arquivo)}" alt=""></div>`;
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
      <div class="bar"><i data-prog style="width:${pct}%"></i></div>
      <div class="sub"><span data-tempo>${mmss(v.t)}</span>${v.dur ? ' de ' + mmss(v.dur) : ''}${v.terminou ? ' · terminou, a TV ficou no último quadro' : ''}</div>
      <div class="row">${v.tocando
        ? `<button class="btn" data-cmd="videoPausar">⏸ Pausar</button>`
        : `<button class="btn primary" data-cmd="videoContinuar">${v.terminou ? '↺ Passar de novo' : '▶ Continuar'}</button>`}</div>
      ${volume()}</div>`;
  }

  function cartao(it) {
    const e = dados.estado;
    const naTv = e.tv.tipo === 'item' && e.tv.itemId === it.id;
    const icone = it.tipo === 'imagem'
      ? `<img src="${conexao.midia(it.arquivo)}" alt="" loading="lazy">`
      : ICONE[it.tipo];
    return `<button class="card ${naTv ? 'on' : ''}" data-cmd="mostrar" data-item="${it.id}">
      <span class="ic" aria-hidden="true">${icone}</span>
      <span><span class="t">${esc(it.titulo)}</span><br><span class="d">${TIPO[it.tipo]}</span></span>
      ${naTv ? '<span class="chip">NA TV</span>' : ''}</button>`;
  }

  function telaEscolher() {
    const lista = dados.reunioes;
    return `<div class="pad escolher">
      ${avisoConexao()}
      <div class="eyebrow">Auxílio Reunião</div>
      <h1>Qual reunião vai começar?</h1>
      ${lista.length ? lista.map(r => `<button class="reuniao-btn" data-cmd="escolherReuniao" data-id="${r.id}">
          <span class="hora">${esc(r.hora)}</span><span class="p">${esc(r.nome)}</span><span class="v">${r.qtd} ${r.qtd === 1 ? 'item' : 'itens'}</span></button>`).join('')
        : '<p class="note">Nenhuma reunião preparada ainda. Prepare a reunião no notebook.</p>'}
    </div>`;
  }

  function telaReuniao() {
    const r = dados.reuniao, e = dados.estado;
    return `<div class="pad">
      ${avisoConexao()}
      <div class="top"><div class="nome">${esc(r.nome)}</div><div class="quem">${r.itens.length} itens</div></div>
      <div class="mini"><div class="eyebrow">Na TV agora</div>${miniTv()}<div class="cap">${esc(rotuloTv())}</div></div>
      ${painelVideo()}
      <div class="eyebrow">Toque para mostrar na TV</div>
      <div class="cards">${r.itens.map(cartao).join('')}</div>
      <button class="btn danger" data-acao="encerrar">✅ Encerrar reunião</button>
    </div>
    <div class="toolbar">
      <button class="btn ${e.tv.tipo === 'preto' ? 'live' : ''}" data-cmd="apagar">${e.tv.tipo === 'preto' ? '💡 Ligar TV' : '⬛ Apagar TV'}</button>
    </div>`;
  }

  function avisoConexao() {
    return con.conectado ? '' : `<div class="aviso">Procurando o notebook… Confira se o celular está no Wi-Fi da igreja.</div>`;
  }

  function telaSemToken() {
    return `<div class="pad escolher"><div class="eyebrow">Auxílio Reunião</div>
      <h1>Leia o QR code que aparece no notebook</h1>
      <p class="note">Abra a câmera do celular, aponte para o QR code na tela do notebook e toque no link que aparecer.</p></div>`;
  }

  function telaConfirmar() {
    return `<div class="overlay"><h2>Encerrar a reunião?</h2><p>A TV volta para a tela de espera.</p>
      <button class="btn danger huge" data-cmd="encerrar">Sim, encerrar</button>
      <button class="btn huge" data-acao="cancelar">Não, continuar</button></div>`;
  }

  function desenhar(forcar) {
    let html;
    if (con.semToken) html = telaSemToken();
    else if (!dados) html = `<div class="pad">${avisoConexao() || '<p class="note">Carregando…</p>'}</div>`;
    else html = (dados.estado.reuniaoId && dados.reuniao ? telaReuniao() : telaEscolher()) + (confirmarEncerrar ? telaConfirmar() : '');

    // Se só o tempo do vídeo mudou, atualiza a barra sem redesenhar (o toque do pastor não se perde).
    const chave = html.replace(/data-prog style="width:[^"]*"/, '').replace(/<span data-tempo>[^<]*<\/span>/, '');
    if (!forcar && chave === chaveTela) {
      const v = dados.estado.video;
      const prog = app.querySelector('[data-prog]');
      if (v && prog) prog.style.width = (v.dur ? Math.min(100, (v.t / v.dur) * 100) : 0) + '%';
      const tempo = app.querySelector('[data-tempo]');
      if (v && tempo) tempo.textContent = mmss(v.t);
      return;
    }
    chaveTela = chave;
    app.innerHTML = html;
  }

  app.addEventListener('click', ev => {
    const el = ev.target.closest('[data-cmd], [data-acao]');
    if (!el || el.disabled) return;
    const acao = el.dataset.acao;
    if (acao === 'encerrar') { confirmarEncerrar = true; desenhar(true); return; }
    if (acao === 'cancelar') { confirmarEncerrar = false; desenhar(true); return; }
    const cmd = el.dataset.cmd;
    if (cmd === 'encerrar') { confirmarEncerrar = false; }
    if (cmd === 'mostrar') enviar({ cmd, itemId: el.dataset.item });
    else if (cmd === 'escolherReuniao') enviar({ cmd, id: el.dataset.id });
    else if (cmd === 'volume') enviar({ cmd, delta: Number(el.dataset.delta) });
    else enviar({ cmd });
    if (cmd === 'encerrar') desenhar(true);
  });

  // Tela do celular acesa (só funciona onde o navegador permite).
  async function manterAceso() {
    try { if (navigator.wakeLock && document.visibilityState === 'visible') await navigator.wakeLock.request('screen'); } catch (e) {}
  }
  document.addEventListener('visibilitychange', manterAceso);
  manterAceso();

  desenhar(true);
})();
