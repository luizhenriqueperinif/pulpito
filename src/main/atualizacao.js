// Atualização automática do programa do notebook.
// O programa procura a versão nova na internet (GitHub, ver "publish" no package.json), baixa por trás
// e instala quando o programa fecha — ou na hora, se a pessoa clicar em "Atualizar agora" no Painel.
// Nunca reinicia sozinho: uma reunião não pode ser interrompida por uma atualização.
//
// Aqui fica só o "em que pé está" (para o Painel mostrar). Quem baixa e instala é o `atualizador`
// (o autoUpdater do electron-updater), recebido de fora para dar para testar sem internet.

const PRIMEIRA_BUSCA = 15 * 1000;          // depois de abrir (deixa o programa terminar de abrir)
const ENTRE_BUSCAS = 6 * 60 * 60 * 1000;   // o notebook pode ficar dias ligado

/** Erros de "sem internet" são normais na igreja: não vão para o erros.log. */
function ehFaltaDeInternet(e) {
  const texto = String((e && (e.code || e.message)) || e || '');
  return /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK|ERR_CONNECTION|ERR_TIMED_OUT|ERR_ADDRESS_UNREACHABLE|ENOTFOUND|ETIMEDOUT|ECONNRE|EAI_AGAIN|ENETUNREACH/i.test(texto);
}

/**
 * @param atualizador   autoUpdater do electron-updater (ou um de mentira, nos testes)
 * @param versaoAtual   versão instalada (package.json)
 * @param aoMudar       chamado com o estado novo a cada mudança (o Painel redesenha)
 * @param aoErrar       erros que não são falta de internet
 */
function criarAtualizacao({ atualizador, versaoAtual, aoMudar = () => {}, aoErrar = () => {}, agora = () => Date.now() }) {
  // fase: 'parada' (ainda não procurou) | 'procurando' | 'emDia' | 'baixando' | 'pronta' | 'erro'
  let estado = { fase: 'parada', versao: versaoAtual, nova: null, pct: 0, quando: null, aviso: '' };
  let relogio = null, primeira = null;

  function mudar(parte) {
    estado = { ...estado, ...parte };
    aoMudar(estado);
  }

  atualizador.autoDownload = true;
  atualizador.autoInstallOnAppQuit = true;   // instala ao fechar o programa, sem perguntar
  atualizador.allowDowngrade = false;

  atualizador.on('checking-for-update', () => { if (estado.fase !== 'baixando' && estado.fase !== 'pronta') mudar({ fase: 'procurando', aviso: '' }); });
  atualizador.on('update-not-available', () => mudar({ fase: 'emDia', nova: null, quando: agora(), aviso: '' }));
  atualizador.on('update-available', info => mudar({ fase: 'baixando', nova: (info && info.version) || null, pct: 0, quando: agora(), aviso: '' }));
  atualizador.on('download-progress', p => { if (estado.fase === 'baixando') mudar({ pct: Math.max(0, Math.min(100, Math.round((p && p.percent) || 0))) }); });
  atualizador.on('update-downloaded', info => mudar({ fase: 'pronta', nova: (info && info.version) || estado.nova, pct: 100, aviso: '' }));
  atualizador.on('error', e => {
    // Uma versão já baixada continua valendo: o erro foi de uma busca posterior.
    if (estado.fase === 'pronta') return;
    const semInternet = ehFaltaDeInternet(e);
    if (!semInternet) aoErrar(e);
    mudar({
      fase: 'erro', pct: 0, quando: agora(),
      aviso: semInternet ? 'Sem internet agora. O programa tenta de novo sozinho.' : 'Não deu para buscar a atualização. O programa tenta de novo sozinho.',
    });
  });

  /** Procura versão nova (não repete se já está procurando, baixando ou com uma pronta). */
  function buscar() {
    if (['procurando', 'baixando', 'pronta'].includes(estado.fase)) return estado;
    mudar({ fase: 'procurando', aviso: '' });
    // Os erros chegam pelo evento 'error'; aqui é só para as promessas (a da busca e a do download)
    // não ficarem "sem dono" e irem parar no erros.log como erro inesperado.
    Promise.resolve()
      .then(() => atualizador.checkForUpdates())
      .then(r => r && r.downloadPromise && r.downloadPromise.catch(() => {}))
      .catch(() => {});
    return estado;
  }

  /** Fecha o programa, instala e abre de novo. Só faz algo se a versão nova já foi baixada. */
  function instalar() {
    if (estado.fase !== 'pronta') return false;
    atualizador.quitAndInstall(true, true);   // sem janelas do instalador; abre o programa de novo no fim
    return true;
  }

  function iniciar() {
    parar();
    primeira = setTimeout(buscar, PRIMEIRA_BUSCA);
    relogio = setInterval(buscar, ENTRE_BUSCAS);
    // Não seguram o programa aberto na hora de fechar.
    primeira.unref?.();
    relogio.unref?.();
  }

  function parar() {
    clearTimeout(primeira);
    clearInterval(relogio);
    primeira = relogio = null;
  }

  return { estado: () => estado, buscar, instalar, iniciar, parar };
}

module.exports = { criarAtualizacao, ehFaltaDeInternet };
