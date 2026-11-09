// Telão: mostra o que a Condução manda. Se a conexão cair, continua mostrando o que estava.
(function () {
  const $ = id => document.getElementById(id);
  const camadas = { espera: $('c-espera'), imagem: $('c-imagem'), video: $('c-video'), versiculo: $('c-versiculo'), janela: $('c-janela') };
  const img = $('img');
  const video = $('video');
  const audio = $('audio');
  let atualAudio = { arquivo: null, inicio: null, salto: 0 };
  let conexao;
  let atual = { camada: null, arquivo: null, inicio: null };

  function mostrarCamada(nome) {
    for (const [k, el] of Object.entries(camadas)) el.classList.toggle('visivel', k === nome);
    atual.camada = nome;
  }

  // Versículo: só redesenha quando muda o texto, a referência ou o fundo.
  let chaveVersiculo = '';
  function mostrarVersiculo(vs) {
    const chave = JSON.stringify([vs.texto, vs.rotulo, vs.versao, vs.fundo]);
    if (chave !== chaveVersiculo) {
      chaveVersiculo = chave;
      camadas.versiculo.innerHTML = window.Versiculo.html(vs, conexao.midia);
      window.Versiculo.ajustar(camadas.versiculo);
    }
    mostrarCamada('versiculo');
  }
  window.addEventListener('resize', () => window.Versiculo.ajustar(camadas.versiculo));
  if (document.fonts) document.fonts.ready.then(() => window.Versiculo.ajustar(camadas.versiculo));

  // Janela do notebook ao vivo na TV. O som sai pelo próprio computador, então o vídeo daqui fica mudo.
  const janela = $('janela');
  let fonteAtual = null, fluxo = null;
  function pararJanela() {
    if (fluxo) fluxo.getTracks().forEach(t => t.stop());
    fluxo = null; fonteAtual = null; janela.srcObject = null;
  }
  async function mostrarJanela(fonteId) {
    if (fonteAtual === fonteId && fluxo) { mostrarCamada('janela'); return; }
    pararJanela();
    fonteAtual = fonteId;
    try {
      const f = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: fonteId, maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 } },
      });
      if (fonteAtual !== fonteId) { f.getTracks().forEach(t => t.stop()); return; }
      fluxo = f;
      // A janela foi fechada: a TV volta para o que estava antes.
      f.getVideoTracks()[0].addEventListener('ended', () => { if (fonteAtual === fonteId) { pararJanela(); conexao.enviar({ cmd: 'sairJanela' }); } });
      janela.srcObject = f;
      await janela.play().catch(() => {});
      mostrarCamada('janela');
    } catch (err) {
      console.log('Não deu para mostrar a janela:', err && err.message);
      pararJanela();
      conexao.enviar({ cmd: 'sairJanela' });
    }
  }

  function aplicar(msg) {
    const { estado, reuniao, info } = msg;

    // Tela de espera: a da reunião, a de Configurações ou a do programa (foto + logo + "Seja bem-vindo")
    const esperaImg = $('espera-img');
    const esp = info.espera;
    const logo = $('espera-logo');
    if (info.logo) { const s = '/logo.png?v=' + encodeURIComponent(info.logo); if (logo.dataset.src !== s) { logo.src = s; logo.dataset.src = s; } logo.hidden = false; }
    else logo.hidden = true;
    const esperaVideo = $('espera-video');
    if (esp && esp.video) {
      // Vídeo da espera: sem som, em repetição; só roda enquanto a TV está na espera.
      const src = conexao.midia(esp.arquivo);
      if (esperaVideo.dataset.src !== src) { esperaVideo.src = src; esperaVideo.dataset.src = src; }
      esperaVideo.hidden = false; esperaImg.hidden = true; $('espera-padrao').hidden = true;
      if (estado.tv.tipo === 'espera') { if (esperaVideo.paused) esperaVideo.play().catch(() => {}); }
      else if (!esperaVideo.paused) esperaVideo.pause();
    } else {
      if (!esperaVideo.paused) esperaVideo.pause();
      if (esperaVideo.dataset.src) { esperaVideo.removeAttribute('src'); esperaVideo.dataset.src = ''; esperaVideo.load(); }
      esperaVideo.hidden = true;
      if (esp) {
        const src = esp.arquivo ? conexao.midia(esp.arquivo) : esp.foto;
        if (esperaImg.dataset.src !== src) { esperaImg.src = src; esperaImg.dataset.src = src; }
        esperaImg.hidden = false; $('espera-padrao').hidden = true;
      } else {
        esperaImg.hidden = true; $('espera-padrao').hidden = false;
      }
    }

    video.volume = Math.max(0, Math.min(1, estado.volume / 10));
    if (!abaixando) audio.volume = video.volume;
    aplicarAudio(estado.audio, msg.musica);

    if (estado.tv.tipo === 'janela') { pararVideo(); mostrarJanela(estado.tv.fonteId); return; }
    if (fonteAtual) pararJanela();
    if (estado.tv.tipo === 'espera') { pararVideo(); mostrarCamada('espera'); return; }
    if (estado.tv.tipo === 'preto') { video.pause(); mostrarCamada(null); return; }
    if (estado.tv.ref && msg.versiculo) {
      // Pausa o vídeo sem esquecer onde ele estava: ao voltar, continua dali.
      if (!video.paused) video.pause();
      mostrarVersiculo(msg.versiculo);
      return;
    }

    const it = reuniao && reuniao.itens.find(i => i.id === estado.tv.itemId);
    if (!it) return;

    if (it.tipo === 'imagem' || it.tipo === 'pregacao') {
      pararVideo();
      const arq = it.tipo === 'pregacao' ? it.arquivos[estado.tv.slide] || it.arquivos[0] : it.arquivo;
      const src = conexao.midia(arq);
      // Pregação: já deixa a próxima imagem carregada, para trocar na hora.
      if (it.tipo === 'pregacao' && it.arquivos[estado.tv.slide + 1]) new Image().src = conexao.midia(it.arquivos[estado.tv.slide + 1]);
      if (atual.arquivo === src && atual.camada === 'imagem') return;
      atual.arquivo = src;
      // Só troca quando a nova imagem já carregou, para não piscar.
      const nova = new Image();
      nova.onload = () => {
        if (atual.arquivo !== src) return;
        // Quanto da imagem seria cortado para encher a TV? Até 15%, enche; mais que isso, mostra inteira.
        const tela = innerWidth / innerHeight, foto = nova.naturalWidth / nova.naturalHeight;
        const corte = 1 - Math.min(tela, foto) / Math.max(tela, foto);
        const preencher = corte <= 0.15;
        img.classList.toggle('preencher', preencher);
        const fundo = $('img-fundo'); fundo.hidden = preencher; if (!preencher) fundo.src = src;
        img.src = src;
        mostrarCamada('imagem');
      };
      nova.src = src;
      return;
    }

    if (it.tipo === 'video') {
      const src = conexao.midia(it.arquivo);
      const v = estado.video;
      if (atual.arquivo !== src || atual.inicio !== v.inicio) {
        atual.arquivo = src; atual.inicio = v.inicio; atual.salto = v.salto || 0;
        if (video.dataset.src !== src) { video.src = src; video.dataset.src = src; }
        try { video.currentTime = 0; } catch (e) {}
        video.onloadeddata = () => mostrarCamada('video');
        if (video.readyState >= 2) mostrarCamada('video');
      } else if (atual.camada !== 'video') {
        mostrarCamada('video');
      }
      if ((v.salto || 0) !== (atual.salto || 0)) {
        atual.salto = v.salto || 0;
        try { video.currentTime = v.t; } catch (e) {}
      }
      if (v.tocando && video.paused && !video.ended) video.play().catch(() => {});
      if (!v.tocando && !video.paused) video.pause();
    }
  }

  // A música da espera sai abaixando devagar (uns 3 segundos), sem cortar de uma vez.
  let abaixando = null;
  function pararAbaixando() { if (abaixando) { clearInterval(abaixando); abaixando = null; } }
  function abaixarEParar() {
    if (abaixando || audio.paused) return;
    const de = audio.volume, passos = 30;
    let n = 0;
    abaixando = setInterval(() => {
      n++;
      audio.volume = Math.max(0, de * (1 - n / passos));
      if (n >= passos) { pararAbaixando(); audio.pause(); audio.volume = video.volume; }
    }, 100);
  }

  function aplicarAudio(a, musica) {
    if (!a || !musica) {
      if (atualAudio.espera) abaixarEParar();
      else if (!audio.paused) audio.pause();
      atualAudio = { arquivo: null, inicio: null, salto: 0 };
      return;
    }
    if (abaixando) { pararAbaixando(); audio.volume = video.volume; }
    audio.loop = !!a.espera;
    const src = conexao.midia(musica.arquivo);
    if (atualAudio.arquivo !== src || atualAudio.inicio !== a.inicio) {
      atualAudio = { arquivo: src, inicio: a.inicio, salto: a.salto || 0, espera: !!a.espera };
      if (audio.dataset.src !== src) { audio.src = src; audio.dataset.src = src; }
      try { audio.currentTime = 0; } catch (e) {}
    }
    if ((a.salto || 0) !== atualAudio.salto) {
      // Adiantou ou voltou pela barrinha do celular.
      atualAudio.salto = a.salto || 0;
      try { audio.currentTime = a.t; } catch (e) {}
    }
    if (a.tocando && audio.paused && !audio.ended) audio.play().catch(() => {});
    if (!a.tocando && !audio.paused) audio.pause();
  }

  let ultimoAudio = 0;
  function progressoAudio(terminou) {
    if (atualAudio.inicio == null) return;
    const agora = Date.now();
    if (!terminou && agora - ultimoAudio < 1000) return;
    ultimoAudio = agora;
    conexao.enviar({ cmd: 'audioProgresso', inicio: atualAudio.inicio, t: audio.currentTime, dur: audio.duration || 0, terminou });
  }
  audio.addEventListener('timeupdate', () => progressoAudio(false));
  audio.addEventListener('ended', () => progressoAudio(true));

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

  // Som sempre "acordado": um tom grave de 10 Hz (abaixo do que o ouvido escuta e do que as
  // caixas reproduzem), bem baixinho, toca sem parar. Assim o Windows não desliga a saída de som
  // do notebook quando fica em silêncio — é esse desligar que faz a mesa de som começar a chiar.
  let somAcordado = null;
  window.manterSomAcordado = ligar => {
    if (!ligar) { if (somAcordado) { somAcordado.close().catch(() => {}); somAcordado = null; } return; }
    if (somAcordado) return;
    try {
      const ctx = new AudioContext();
      const tom = ctx.createOscillator();
      tom.frequency.value = 10;
      const volume = ctx.createGain();
      volume.gain.value = 0.002;
      tom.connect(volume).connect(ctx.destination); tom.start();
      ctx.resume().catch(() => {});
      somAcordado = ctx;
    } catch { somAcordado = null; }
  };

  mostrarCamada('espera');
  conexao =window.Auxilio.conectar({ papel: 'telao', aoReceber: m => m.tipo === 'estado' && aplicar(m), aoMudar: () => {} });
})();
