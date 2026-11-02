// Painel do Notebook: QR code, situação da TV e do celular, reuniões de teste.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let ultimoQr = '';

  const conexao = window.Auxilio.conectar({
    papel: 'painel',
    aoReceber: m => m.tipo === 'estado' && desenhar(m),
    aoMudar: () => {},
  });
  $('reserva').src = `/controle/?t=${encodeURIComponent(conexao.token)}&local=1`;

  function desenhar(m) {
    const { info, reunioes, estado } = m;
    if (info.qrSvg !== ultimoQr) { $('qr').innerHTML = info.qrSvg; ultimoQr = info.qrSvg; }
    $('url').textContent = info.url;

    const tv = info.tv === 'tv'
      ? '<span class="pill ok">TV ligada</span>'
      : '<span class="pill atencao">TV não encontrada (o Telão abriu numa janela)</span>';
    const cel = info.celulares > 0
      ? `<span class="pill ok">${info.celulares} ${info.celulares === 1 ? 'celular conectado' : 'celulares conectados'}</span>`
      : '<span class="pill">Nenhum celular conectado</span>';
    $('status').innerHTML = tv + cel;

    $('reunioes').innerHTML = reunioes.length
      ? reunioes.map(r => `<div class="reuniao">
          <div><div class="n">${esc(r.nome)}${estado.reuniaoId === r.id ? ' · <span style="color:var(--live)">acontecendo agora</span>' : ''}</div>
          <div class="d">${esc(r.data.split('-').reverse().join('/'))} · ${esc(r.hora)} · ${r.qtd} itens</div></div>
          <button class="btn danger" data-apagar="${r.id}" data-nome="${esc(r.nome)}">Apagar</button></div>`).join('')
      : '<p class="note">Nenhuma reunião ainda.</p>';
  }

  $('reunioes').addEventListener('click', ev => {
    const b = ev.target.closest('[data-apagar]');
    if (!b) return;
    if (confirm(`Apagar "${b.dataset.nome}" e os arquivos dela?`)) conexao.enviar({ cmd: 'removerReuniao', id: b.dataset.apagar });
  });

  $('criar').addEventListener('click', async () => {
    $('msg').textContent = '';
    const r = await window.notebook.criarReuniaoTeste();
    if (!r) return;
    $('msg').textContent = `Reunião criada com ${r.itens} ${r.itens === 1 ? 'item' : 'itens'}.` +
      (r.ignorados ? ` ${r.ignorados} arquivo(s) não são imagem nem vídeo e ficaram de fora.` : '');
  });

  $('espera').addEventListener('click', () => window.notebook.trocarTelaEspera());
  $('atualizar').addEventListener('click', () => window.notebook.atualizarEndereco());
})();
