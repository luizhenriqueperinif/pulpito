// Telão: mostra o que a Condução manda. Se a conexão cair, continua mostrando o que estava.
(function () {
  const $ = id => document.getElementById(id);
  const camadas = { espera: $('c-espera'), imagem: $('c-imagem'), video: $('c-video') };
  const img = $('img');
  const video = $('video');
  let conexao;
  let atual = { camada: null, arquivo: null, inicio: null };

  function mostrarCamada(nome) {
    for (const [k, el] of Object.entries(camadas)) el.classList.toggle('visivel', k === nome);
    atual.camada = nome;
  }

  function aplicar(msg) {
    const { estado, reuniao, info } = msg;

    // Tela de espera (imagem da igreja ou a padrão)
    const esperaImg = $('espera-img');
    if (info.telaEspera) {
      const src = conexao.midia(info.telaEspera);
      if (esperaImg.dataset.src !== src) { esperaImg.src = src; esperaImg.dataset.src = src; }
      esperaImg.hidden = false; $('espera-padrao').hidden = true;
    } else {
      esperaImg.hidden = true; $('espera-padrao').hidden = false;
    }

    video.volume = Math.max(0, Math.min(1, estado.volume / 10));

    if (estado.tv.tipo === 'espera') { pararVideo(); mostrarCamada('espera'); return; }
    if (estado.tv.tipo === 'preto') { video.pause(); mostrarCamada(null); return; }

    const it = reuniao && reuniao.itens.find(i => i.id === estado.tv.itemId);
    if (!it) return;

    if (it.tipo === 'imagem') {
      pararVideo();
      const src = conexao.midia(it.arquivo);
      if (atual.arquivo === src && atual.camada === 'imagem') return;
      atual.arquivo = src;
      // Só troca quando a nova imagem já carregou, para não piscar.
      const nova = new Image();
      nova.onload = () => { if (atual.arquivo === src) { img.src = src; mostrarCamada('imagem'); } };
      nova.src = src;
      return;
    }

    if (it.tipo === 'video') {
      const src = conexao.midia(it.arquivo);
      const v = estado.video;
      if (atual.arquivo !== src || atual.inicio !== v.inicio) {
        atual.arquivo = src; atual.inicio = v.inicio;
        if (video.dataset.src !== src) { video.src = src; video.dataset.src = src; }
        try { video.currentTime = 0; } catch (e) {}
        video.onloadeddata = () => mostrarCamada('video');
        if (video.readyState >= 2) mostrarCamada('video');
      } else if (atual.camada !== 'video') {
        mostrarCamada('video');
      }
      if (v.tocando && video.paused && !video.ended) video.play().catch(() => {});
      if (!v.tocando && !video.paused) video.pause();
    }
  }

  function pararVideo() {
    if (!video.paused) video.pause();
    atual.inicio = null;
    if (atual.camada === 'video') atual.arquivo = null;
  }

  // Avisa o Controle do tempo do vídeo; quando termina, o último quadro fica na tela.
  let ultimoEnvio = 0;
  function progresso(terminou) {
    if (atual.inicio == null) return;
    const agora = Date.now();
    if (!terminou && agora - ultimoEnvio < 500) return;
    ultimoEnvio = agora;
    conexao.enviar({ cmd: 'videoProgresso', inicio: atual.inicio, t: video.currentTime, dur: video.duration || 0, terminou });
  }
  video.addEventListener('timeupdate', () => progresso(false));
  video.addEventListener('ended', () => progresso(true));

  mostrarCamada('espera');
  conexao = window.Auxilio.conectar({ papel: 'telao', aoReceber: m => m.tipo === 'estado' && aplicar(m), aoMudar: () => {} });
})();
