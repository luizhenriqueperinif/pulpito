// Conexão com o Notebook, usada pelas três telas. Reconecta sozinha se cair.
(function () {
  const CHAVE = 'auxilio-token';

  function lerToken() {
    const daUrl = new URLSearchParams(location.search).get('t');
    if (daUrl) {
      try { localStorage.setItem(CHAVE, daUrl); } catch (e) {}
      return daUrl;
    }
    try { return localStorage.getItem(CHAVE); } catch (e) { return null; }
  }

  function conectar({ papel, local, aoReceber, aoMudar }) {
    const token = lerToken();
    let ws = null;
    let espera = 500;

    function abrir() {
      if (!token) { aoMudar({ conectado: false, semToken: true }); return; }
      const q = `t=${encodeURIComponent(token)}&papel=${papel}${local ? '&local=1' : ''}`;
      ws = new WebSocket(`ws://${location.host}/ws?${q}`);
      ws.onopen = () => { espera = 500; aoMudar({ conectado: true }); };
      ws.onmessage = ev => { try { aoReceber(JSON.parse(ev.data)); } catch (e) {} };
      ws.onclose = ev => {
        if (ev.code === 4001) {
          try { localStorage.removeItem(CHAVE); } catch (e) {}
          aoMudar({ conectado: false, semToken: true });
          return;
        }
        aoMudar({ conectado: false });
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
      enviar(cmd) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(cmd)); },
      midia: nome => `/midia/${encodeURIComponent(nome)}?t=${encodeURIComponent(token)}`,
    };
  }

  window.Auxilio = { conectar };
})();
