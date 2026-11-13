// Letra do versículo na TV: em vez de diminuir a letra até o versículo inteiro caber,
// o versículo comprido é dividido em mais de uma tela (o pastor passa com a mesma seta ▶).

// Cada tamanho tem o máximo de letras por tela (limite) e a maior letra que a TV usa (max, em fração da
// altura da tela). Medido numa TV Full HD: 'grande' fica entre 140 e 160 px; 'enorme', entre 175 e 205 px.
// 'normal' = o versículo inteiro numa tela, do tamanho que couber (no máximo 140 px).
const LETRAS = {
  normal: { limite: Infinity, max: 0.13 },
  grande: { limite: 100, max: 0.15 },
  enorme: { limite: 62, max: 0.19 },
};
const LETRA_PADRAO = 'grande';

const letraValida = letra => (Object.hasOwn(LETRAS, letra) ? letra : LETRA_PADRAO);
const limiteDaLetra = letra => LETRAS[letraValida(letra)].limite;
const maxDaLetra = letra => LETRAS[letraValida(letra)].max;

/**
 * Divide o texto em telas mais ou menos do mesmo tamanho, sem cortar palavra,
 * de preferência depois de uma vírgula ou de um ponto.
 */
function dividirVersiculo(texto, limite) {
  texto = String(texto ?? '').trim();
  if (!(limite > 0) || texto.length <= limite) return [texto];
  const telas = [];
  let resto = texto;
  for (let faltam = Math.ceil(texto.length / limite); faltam > 1 && resto; faltam--) {
    const alvo = resto.length / faltam;
    let melhor = -1, nota = Infinity;
    for (let i = resto.indexOf(' '); i !== -1; i = resto.indexOf(' ', i + 1)) {
      // Quanto mais perto do alvo, melhor; uma pontuação ali por perto ganha.
      const d = Math.abs(i - alvo) - (/[.,;:!?]/.test(resto[i - 1]) ? alvo * 0.3 : 0);
      if (d < nota) { nota = d; melhor = i; }
    }
    if (melhor <= 0) break;
    telas.push(resto.slice(0, melhor).trim());
    resto = resto.slice(melhor + 1).trim();
  }
  if (resto) telas.push(resto);
  return telas;
}

module.exports = { dividirVersiculo, limiteDaLetra, maxDaLetra, letraValida, LETRAS, LETRA_PADRAO };
