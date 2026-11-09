// Aperta teclas numa janela do notebook (YouTube no navegador, Telegram...) a pedido do celular.
// Traz a janela para a frente e aperta a tecla, como se o pastor tivesse apertado no teclado.
// Um PowerShell fica aberto escondido, esperando os pedidos (assim cada toque é rápido).
const { spawn } = require('child_process');
const path = require('path');

// Códigos das teclas no Windows
const VK = { espaco: 0x20, esquerda: 0x25, direita: 0x27, j: 0x4a, k: 0x4b, l: 0x4c, f: 0x46 };

/** Janela do Telegram (o visualizador do Telegram Desktop ou o Telegram Web no navegador):
 * lá as setas trocam para o vídeo seguinte da conversa em vez de adiantar, então só dá para tocar e pausar. */
const ehTelegram = nome => /telegram|media viewer|visualizador de m[ií]dia/i.test(nome || '');

/** Qual tecla apertar para cada botão do celular. No YouTube: K, J e L (10 segundos); no Telegram: só espaço; nos outros: espaço e setas. */
function teclaPara(acao, nomeJanela) {
  const yt = /youtube/i.test(nomeJanela || '');
  const tg = !yt && ehTelegram(nomeJanela);
  switch (acao) {
    case 'playPausa': return yt ? VK.k : VK.espaco;
    case 'voltar': return tg ? null : yt ? VK.j : VK.esquerda;
    case 'avancar': return tg ? null : yt ? VK.l : VK.direita;
    case 'telaCheia': return VK.f;
    default: return null;
  }
}

/** "window:132456:0" (o id que o Electron dá para a janela) → 132456 (o número da janela no Windows). */
function numeroDaJanela(fonteId) {
  const m = /^window:(\d+):/.exec(String(fonteId || ''));
  return m ? m[1] : null;
}

const CODIGO = `
using System; using System.Runtime.InteropServices; using System.Threading;
public static class PulpitoTeclas {
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte sc, uint f, UIntPtr e);
  public static string Apertar(long numero, int vk) {
    IntPtr h = new IntPtr(numero);
    if (!IsWindow(h)) return "fechada";
    if (IsIconic(h)) ShowWindow(h, 9);
    if (GetForegroundWindow() != h) {
      uint eu = GetCurrentThreadId(), frente = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
      AttachThreadInput(eu, frente, true);
      BringWindowToTop(h); SetForegroundWindow(h);
      AttachThreadInput(eu, frente, false);
      Thread.Sleep(80);
    }
    if (GetForegroundWindow() != h) return "semfoco";
    uint ext = (vk == 0x25 || vk == 0x27) ? 1u : 0u;
    keybd_event((byte)vk, 0, ext, UIntPtr.Zero);
    keybd_event((byte)vk, 0, ext | 2u, UIntPtr.Zero);
    return "ok";
  }
}`;

function criarTeclas() {
  let ps = null, buffer = '', fila = [];

  function abrir() {
    const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    ps = spawn(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'], { windowsHide: true });
    ps.stdout.setEncoding('utf8');
    ps.stdout.on('data', d => {
      buffer += d;
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const linha = buffer.slice(0, i).trim(); buffer = buffer.slice(i + 1);
        const m = /^PULPITO (\w+)$/.exec(linha);
        if (m && fila.length) fila.shift()(m[1]);
      }
    });
    ps.stderr.on('data', d => console.error('Teclas:', String(d).trim()));
    ps.on('exit', () => { ps = null; for (const r of fila.splice(0)) r('erro'); });
    ps.on('error', () => { ps = null; });
    // Numa linha só: o PowerShell lendo os pedidos não aceita o código em várias linhas.
    const b64 = Buffer.from(CODIGO, 'utf8').toString('base64');
    ps.stdin.write(`Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64}')))\n`);
  }

  /** Aperta a tecla do botão `acao` na janela. Responde 'ok', 'semfoco', 'fechada' ou 'erro'. */
  function apertar(fonteId, nomeJanela, acao) {
    const n = numeroDaJanela(fonteId), vk = teclaPara(acao, nomeJanela);
    if (!n || vk == null || process.platform !== 'win32') return Promise.resolve('erro');
    if (!ps) abrir();
    return new Promise(ok => {
      const t = setTimeout(() => { const k = fila.indexOf(fim); if (k >= 0) fila.splice(k, 1); ok('erro'); }, 4000);
      const fim = r => { clearTimeout(t); ok(r); };
      fila.push(fim);
      ps.stdin.write(`Write-Output ("PULPITO " + [PulpitoTeclas]::Apertar(${n}, ${vk}))\n`);
    });
  }

  return { apertar, fechar() { if (ps) { try { ps.kill(); } catch {} ps = null; } } };
}

module.exports = { criarTeclas, teclaPara, numeroDaJanela, ehTelegram };
