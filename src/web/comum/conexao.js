// Conexão com o Notebook, usada pelas três telas. Reconecta sozinha se cair.
(function () {
  const CHAVE = 'altar-token';

  // O celular que já estava ligado (quando o programa tinha outro nome) continua ligado.
  try {
    const antigo = localStorage.getItem('auxilio-token');
    if (antigo) {
      if (!localStorage.getItem(CHAVE)) localStorage.setItem(CHAVE, antigo);
      localStorage.removeItem('auxilio-token');
    }
  } catch (e) {}

  function lerToken() {
    const daUrl = new URLSearchParams(location.search).get('t');
    if (daUrl) {
      try { localStorage.setItem(CHAVE, daUrl); } catch (e) {}
      return daUrl;
    }
    try { return localStorage.getItem(CHAVE); } catch (e) { return null; }
  }

  // O notebook mudou de endereço na rede (o roteador às vezes troca): a página antiga do celular
  // pergunta a cada endereço da mesma rede "você é o Altar?" e, achando, vai para o endereço novo.
  async function procurarNotebook(token) {
    const m = /^(\d+\.\d+\.\d+)\.(\d+)$/.exec(location.hostname);
    if (!m) return null;
    const porta = location.port || '80';
    const hosts = [];
    for (let i = 1; i < 255; i++) if (String(i) !== m[2]) hosts.push(m[1] + '.' + i);
    let achou = null;
    const testar = async h => {
      if (achou) return;
      const ac = new AbortController();
      const limite = setTimeout(() => ac.abort(), 2500);
      try {
        const r = await fetch(`http://${h}:${porta}/ola?t=${encodeURIComponent(token)}`, { signal: ac.signal, cache: 'no-store' });
        const j = await r.json();
        if (j && j.altar && j.meu && !achou) achou = h;
      } catch (e) {} finally { clearTimeout(limite); }
    };
    for (let i = 0; i < hosts.length && !achou; i += 50) await Promise.all(hosts.slice(i, i + 50).map(testar));
    return achou;
  }

  function conectar({ papel, local, aoReceber, aoMudar }) {
    const token = lerToken();
    let ws = null;
    let espera = 500;
    let inicioDoNotebook = null;
    let falhas = 0, procurando = false, naoAchou = false;
    const podeProcurar = papel === 'controle' && /^\d+\.\d+\.\d+\.\d+$/.test(location.hostname);

    async function procurar() {
      if (procurando || !podeProcurar || !token) return;
      procurando = true; naoAchou = false;
      aoMudar({ conectado: false, procurando: true });
      const h = await procurarNotebook(token);
      procurando = false;
      if (h && h !== location.hostname) {
        location.replace(`http://${h}:${location.port || '80'}${location.pathname}?t=${encodeURIComponent(token)}`);
        return;
      }
      if (ws && ws.readyState === 1) return;   // voltou sozinho enquanto procurava
      naoAchou = true;
      aoMudar({ conectado: false, naoAchou: true });
    }

    function abrir() {
      if (!token) { aoMudar({ conectado: false, semToken: true }); return; }
      const q = `t=${encodeURIComponent(token)}&papel=${papel}${local ? '&local=1' : ''}`;
      ws = new WebSocket(`ws://${location.host}/ws?${q}`);
      ws.onopen = () => { espera = 500; falhas = 0; naoAchou = false; aoMudar({ conectado: true }); };
      ws.onmessage = ev => {
        let m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        // O programa do notebook foi reiniciado (talvez com novidades): recarrega a página
        // para não ficar rodando a versão antiga guardada no celular.
        const inicio = m.info && m.info.inicio;
        if (inicio) {
          if (inicioDoNotebook && inicio !== inicioDoNotebook) { location.reload(); return; }
          inicioDoNotebook = inicio;
        }
        try { aoReceber(m); } catch (e) {}
      };
      ws.onclose = ev => {
        if (ev.code === 4001) {
          try { localStorage.removeItem(CHAVE); } catch (e) {}
          aoMudar({ conectado: false, semToken: true });
          return;
        }
        falhas++;
        // Umas 4 tentativas sem resposta (uns 5 segundos): vai procurar o notebook na rede.
        if (falhas === 4 || (falhas > 4 && falhas % 15 === 0)) procurar();
        if (!procurando) aoMudar({ conectado: false, naoAchou });
        setTimeout(abrir, espera);
        espera = Math.min(espera * 2, 4000);
      };
    }

    // Ao voltar para a tela (celular desbloqueado), tenta na hora.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && ws && ws.readyState > 1) { espera = 300; abrir(); }
    });

    abrir();
    return {
      token,
      procurarDeNovo: () => procurar(),
      enviar(cmd) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(cmd)); },
      midia: nome => `/midia/${encodeURIComponent(nome)}?t=${encodeURIComponent(token)}`,
    };
  }

  window.Altar = { conectar };
})();
