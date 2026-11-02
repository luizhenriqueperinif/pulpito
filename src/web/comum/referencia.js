// Entende o que a pessoa digita ("jo 3:16", "Salmos 23 1-6", "1 cor 13:4-7") e devolve a referência.
// Funciona no navegador (window.Referencia) e no Node (testes).
(function (raiz) {
  const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  // Abreviações comuns que não são só o começo do nome.
  const APELIDOS = { jo: 'joao', sl: 'salmos', mt: 'mateus', mc: 'marcos', lc: 'lucas', rm: 'romanos', gl: 'galatas', fp: 'filipenses',
    cl: 'colossenses', hb: 'hebreus', tg: 'tiago', ap: 'apocalipse', gn: 'genesis', ex: 'exodo', lv: 'levitico', nm: 'numeros',
    dt: 'deuteronomio', js: 'josue', jz: 'juizes', rt: 'rute', pv: 'proverbios', ec: 'eclesiastes', ct: 'canticos', is: 'isaias',
    jr: 'jeremias', lm: 'lamentacoes', ez: 'ezequiel', dn: 'daniel', os: 'oseias', jl: 'joel', am: 'amos', ob: 'obadias', jn: 'jonas',
    mq: 'miqueias', na: 'naum', hc: 'habacuque', sf: 'sofonias', ag: 'ageu', zc: 'zacarias', ml: 'malaquias', at: 'atos',
    ef: 'efesios', tt: 'tito', fm: 'filemom', jd: 'judas', cor: 'corintios', co: 'corintios', ts: 'tessalonicenses',
    tm: 'timoteo', pe: 'pedro', sm: 'samuel', rs: 'reis', cr: 'cronicas', ed: 'esdras', ne: 'neemias', et: 'ester' };

  /**
   * @param {string} entrada  texto digitado
   * @param {{nome: string}[]} livros  lista dos 66 livros, em ordem
   * @returns {{l:number, c:number, v:number, ate:number}|null}
   */
  function interpretar(entrada, livros) {
    const t = semAcento(entrada).replace(/[.]/g, ' ').replace(/\s+/g, ' ');
    const m = /^([123])?\s*([a-z]+(?: [a-z]+)*?)\s*(\d+)(?:\s*[:,. ]\s*(\d+)(?:\s*-\s*(\d+))?)?$/.exec(t);
    if (!m) return null;
    const numero = m[1] || '';
    let palavra = m[2];
    // "jó" com acento é o livro de Jó; "jo" sem acento é João.
    const ehJo = !numero && /^j[óô](?=\s|\d|$)/i.test(entrada.trim());
    palavra = ehJo ? 'jo' : APELIDOS[palavra] || palavra;
    const nomes = livros.map(x => semAcento(x.nome));
    const candidatos = nomes
      .map((n, i) => ({ n, i }))
      .filter(({ n }) => {
        if (ehJo) return n === 'jo';
        const [prefixo, ...resto] = /^[123] /.test(n) ? [n[0], n.slice(2)] : ['', n];
        return prefixo === numero && resto.join(' ').startsWith(palavra);
      });
    if (candidatos.length === 0) return null;
    const l = candidatos[0].i;
    const c = Number(m[3]);
    const v = m[4] ? Number(m[4]) : 1;
    const ate = m[5] ? Number(m[5]) : v;
    if (c < 1 || v < 1 || ate < v) return null;
    return { l, c, v, ate };
  }

  const api = { interpretar, semAcento };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Referencia = api;
})(typeof window !== 'undefined' ? window : globalThis);
