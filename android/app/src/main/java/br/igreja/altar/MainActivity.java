package br.igreja.altar;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Altar no celular: uma "casca" em tela cheia para o controle da reunião.
 * As telas são as mesmas do navegador e vêm do notebook da igreja (src/web/controle),
 * por isso o app não precisa ser atualizado quando o programa do notebook muda.
 *
 * O que o app faz a mais que o navegador:
 *  - guarda o endereço do notebook (lido uma vez pelo QR code do Painel);
 *  - se o notebook mudou de endereço na rede, procura sozinho;
 *  - não deixa a tela do celular apagar durante a reunião.
 */
public class MainActivity extends Activity {
    private static final String GUARDADO = "altar";
    private static final String HOST = "host", PORTA = "porta", TOKEN = "token";
    private static final int PEDIDO_ARQUIVOS = 4201;
    private static final int E_O_MEU = 2, E_OUTRO = 1, NAO_RESPONDEU = 0;

    private static final int MARINHO = Color.rgb(0x1f, 0x2a, 0x44);
    private static final int PAPEL = Color.rgb(0xf7, 0xf6, 0xf2);
    private static final int VERMELHO = Color.rgb(0xb3, 0x12, 0x1f);
    private static final int CINZA = Color.rgb(0x5b, 0x64, 0x78);

    private final Handler naTela = new Handler(Looper.getMainLooper());
    private final ExecutorService porFora = Executors.newCachedThreadPool();

    private SharedPreferences guardado;
    private WebView pagina;
    private LinearLayout aviso;
    private TextView avisoTitulo, avisoTexto;
    private ProgressBar avisoRoda;
    private Button botaoPrincipal, botaoSecundario;

    private ValueCallback<Uri[]> esperandoArquivos;
    private int tentativa;            // cada tentativa de conexão tem um número; resposta de tentativa velha é ignorada
    private boolean paginaFalhou;
    private boolean precisaTentar;    // a tela "não achei" está aberta: ao voltar para o app, tenta de novo

    @Override
    protected void onCreate(Bundle estadoSalvo) {
        super.onCreate(estadoSalvo);
        guardado = getSharedPreferences(GUARDADO, MODE_PRIVATE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        montarTela();
        boolean veioEndereco = guardarEnderecoDoLink(getIntent());
        if (estadoSalvo != null && !veioEndereco && temEndereco()) abrirPagina(); else conectar();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (guardarEnderecoDoLink(intent)) conectar();
    }

    @Override
    protected void onResume() {
        super.onResume();
        pagina.onResume();
        if (precisaTentar) conectar();
    }

    @Override
    protected void onPause() {
        pagina.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        porFora.shutdownNow();
        pagina.destroy();
        super.onDestroy();
    }

    // ---------- telas ----------

    private int dp(int valor) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, valor, getResources().getDisplayMetrics()));
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void montarTela() {
        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(PAPEL);

        pagina = new WebView(this);
        pagina.setBackgroundColor(PAPEL);
        pagina.setOverScrollMode(View.OVER_SCROLL_NEVER);
        pagina.setVisibility(View.INVISIBLE);
        WebSettings ajustes = pagina.getSettings();
        ajustes.setJavaScriptEnabled(true);
        ajustes.setDomStorageEnabled(true);
        ajustes.setMediaPlaybackRequiresUserGesture(false);
        ajustes.setSupportZoom(false);
        // As telas já têm letra grande; o tamanho de letra do celular não pode desmontar o desenho.
        ajustes.setTextZoom(100);
        pagina.addJavascriptInterface(new PonteComAPagina(), "AltarApp");
        pagina.setWebViewClient(new Navegacao());
        pagina.setWebChromeClient(new EscolherArquivos());
        raiz.addView(pagina, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        aviso = new LinearLayout(this);
        aviso.setOrientation(LinearLayout.VERTICAL);
        aviso.setGravity(Gravity.CENTER_VERTICAL);
        aviso.setBackgroundColor(PAPEL);
        aviso.setPadding(dp(28), dp(28), dp(28), dp(28));
        aviso.setClickable(true);

        avisoRoda = new ProgressBar(this);
        LinearLayout.LayoutParams rodaLp = new LinearLayout.LayoutParams(dp(56), dp(56));
        rodaLp.gravity = Gravity.CENTER_HORIZONTAL;
        rodaLp.bottomMargin = dp(20);
        aviso.addView(avisoRoda, rodaLp);

        avisoTitulo = new TextView(this);
        avisoTitulo.setTextSize(TypedValue.COMPLEX_UNIT_SP, 27);
        avisoTitulo.setTypeface(Typeface.create(Typeface.SERIF, Typeface.BOLD));
        avisoTitulo.setTextColor(MARINHO);
        avisoTitulo.setGravity(Gravity.CENTER_HORIZONTAL);
        aviso.addView(avisoTitulo, linha(0));

        avisoTexto = new TextView(this);
        avisoTexto.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19);
        avisoTexto.setTextColor(CINZA);
        avisoTexto.setGravity(Gravity.CENTER_HORIZONTAL);
        avisoTexto.setLineSpacing(0, 1.25f);
        aviso.addView(avisoTexto, linha(14));

        botaoPrincipal = botao(true);
        aviso.addView(botaoPrincipal, linha(28));
        botaoSecundario = botao(false);
        aviso.addView(botaoSecundario, linha(12));

        raiz.addView(aviso, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(raiz);
    }

    private LinearLayout.LayoutParams linha(int margemDeCima) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(margemDeCima);
        return lp;
    }

    private Button botao(boolean principal) {
        Button b = new Button(this);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setMinHeight(dp(68));
        b.setStateListAnimator(null);
        GradientDrawable fundo = new GradientDrawable();
        fundo.setCornerRadius(dp(14));
        if (principal) {
            fundo.setColor(VERMELHO);
            b.setTextColor(Color.WHITE);
        } else {
            fundo.setColor(Color.WHITE);
            fundo.setStroke(dp(2), Color.rgb(0xd2, 0xd6, 0xdf));
            b.setTextColor(MARINHO);
        }
        b.setBackground(fundo);
        return b;
    }

    /** Mostra a tela de aviso por cima da página. Botão sem texto (null) fica escondido. */
    private void avisar(String titulo, String texto, boolean rodando, String principal, Runnable aoPrincipal, String secundario, Runnable aoSecundario) {
        avisoTitulo.setText(titulo);
        avisoTexto.setText(texto);
        avisoTexto.setVisibility(texto == null ? View.GONE : View.VISIBLE);
        avisoRoda.setVisibility(rodando ? View.VISIBLE : View.GONE);
        prepararBotao(botaoPrincipal, principal, aoPrincipal);
        prepararBotao(botaoSecundario, secundario, aoSecundario);
        aviso.setVisibility(View.VISIBLE);
        pagina.setVisibility(View.INVISIBLE);
    }

    private void prepararBotao(Button botao, String texto, Runnable acao) {
        botao.setVisibility(texto == null ? View.GONE : View.VISIBLE);
        botao.setText(texto);
        botao.setOnClickListener(acao == null ? null : v -> acao.run());
    }

    private void telaLerQr(String motivo) {
        precisaTentar = false;
        avisar("Altar",
                motivo != null ? motivo : "Abra o Altar no notebook da igreja e leia o QR code que aparece na tela dele.",
                false, "Ler o QR code", this::lerQr, null, null);
    }

    private void telaNaoAchou() {
        precisaTentar = true;
        avisar("Não achei o notebook",
                "Confira se o Altar está aberto no notebook e se o celular está no Wi-Fi da igreja.",
                false, "Tentar de novo", this::conectar, "Ler o QR code de novo", this::lerQr);
    }

    // ---------- endereço do notebook ----------

    private boolean temEndereco() {
        return guardado.getString(HOST, null) != null && guardado.getString(TOKEN, null) != null;
    }

    private String enderecoDaPagina() {
        return "http://" + guardado.getString(HOST, "") + ":" + guardado.getInt(PORTA, 7420) + "/controle/?t=" + guardado.getString(TOKEN, "");
    }

    /** O QR code do Painel é um link assim: http://192.168.0.10:7420/controle/?t=codigo */
    private boolean guardarEndereco(String link) {
        try {
            Uri u = Uri.parse(String.valueOf(link).trim());
            String codigo = u.getQueryParameter("t");
            String caminho = u.getPath();
            if (!"http".equals(u.getScheme()) || u.getHost() == null || caminho == null || !caminho.startsWith("/controle")) return false;
            if (codigo == null || !codigo.matches("[A-Za-z0-9]{8,64}")) return false;
            guardado.edit()
                    .putString(HOST, u.getHost())
                    .putInt(PORTA, u.getPort() == -1 ? 80 : u.getPort())
                    .putString(TOKEN, codigo)
                    .apply();
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private boolean guardarEnderecoDoLink(Intent intent) {
        return intent != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null
                && guardarEndereco(intent.getData().toString());
    }

    // ---------- conectar: pergunta ao endereço guardado; se não responder, procura na rede ----------

    private void conectar() {
        if (!temEndereco()) { telaLerQr(null); return; }
        precisaTentar = false;
        avisar("Procurando o notebook…", null, true, null, null, null, null);
        final int vez = ++tentativa;
        final String host = guardado.getString(HOST, "");
        final int porta = guardado.getInt(PORTA, 7420);
        final String codigo = guardado.getString(TOKEN, "");
        porFora.execute(() -> {
            int resposta = perguntar(host, porta, codigo, 2500);
            String achado = resposta == E_O_MEU ? host : null;
            if (resposta == NAO_RESPONDEU) achado = procurarNaRede(host, porta, codigo);
            final String onde = achado;
            final boolean codigoMudou = resposta == E_OUTRO;
            naTela.post(() -> {
                if (vez != tentativa || isFinishing()) return;
                if (onde != null) {
                    guardado.edit().putString(HOST, onde).apply();
                    abrirPagina();
                } else if (codigoMudou) {
                    telaLerQr("O código do notebook mudou. Leia de novo o QR code que aparece na tela dele.");
                } else {
                    telaNaoAchou();
                }
            });
        });
    }

    /** "Você é o Altar?" (o mesmo /ola que a página usa). */
    private int perguntar(String host, int porta, String codigo, int espera) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL("http://" + host + ":" + porta + "/ola?t=" + codigo).openConnection();
            c.setConnectTimeout(espera);
            c.setReadTimeout(espera);
            c.setUseCaches(false);
            if (c.getResponseCode() != 200) return NAO_RESPONDEU;
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream lido = new ByteArrayOutputStream();
                byte[] pedaco = new byte[512];
                for (int n; (n = in.read(pedaco)) > 0 && lido.size() < 4096; ) lido.write(pedaco, 0, n);
                JSONObject j = new JSONObject(lido.toString("UTF-8"));
                if (!j.optBoolean("altar") && !j.optBoolean("pulpito")) return NAO_RESPONDEU;
                return j.optBoolean("meu") ? E_O_MEU : E_OUTRO;
            }
        } catch (Exception e) {
            return NAO_RESPONDEU;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** O roteador às vezes troca o endereço do notebook: pergunta a todos os endereços da mesma rede. */
    private String procurarNaRede(String hostAntigo, int porta, String codigo) {
        Set<String> redes = new LinkedHashSet<>();
        try {
            for (NetworkInterface placa : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!placa.isUp() || placa.isLoopback()) continue;
                for (InetAddress a : Collections.list(placa.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) redes.add(comecoDaRede(a.getHostAddress()));
                }
            }
        } catch (Exception e) { /* sem rede: fica só com a do endereço antigo */ }
        redes.add(comecoDaRede(hostAntigo));
        redes.remove(null);
        if (redes.isEmpty()) return null;

        List<String> candidatos = new ArrayList<>();
        for (String rede : redes) for (int i = 1; i < 255; i++) candidatos.add(rede + i);
        final AtomicReference<String> achado = new AtomicReference<>();
        final CountDownLatch faltam = new CountDownLatch(candidatos.size());
        ExecutorService varios = Executors.newFixedThreadPool(48);
        try {
            for (final String candidato : candidatos) {
                varios.execute(() -> {
                    try {
                        if (achado.get() == null && perguntar(candidato, porta, codigo, 1500) == E_O_MEU) achado.compareAndSet(null, candidato);
                    } finally {
                        faltam.countDown();
                    }
                });
            }
            long limite = System.currentTimeMillis() + 20000;
            while (achado.get() == null && System.currentTimeMillis() < limite) {
                if (faltam.await(200, TimeUnit.MILLISECONDS)) break;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            varios.shutdownNow();
        }
        return achado.get();
    }

    /** "192.168.0.10" vira "192.168.0." (null quando não é um endereço com números). */
    private static String comecoDaRede(String endereco) {
        if (endereco == null || !endereco.matches("\\d+\\.\\d+\\.\\d+\\.\\d+")) return null;
        return endereco.substring(0, endereco.lastIndexOf('.') + 1);
    }

    // ---------- a página do controle ----------

    private void abrirPagina() {
        precisaTentar = false;
        paginaFalhou = false;
        avisar("Abrindo…", null, true, null, null, null, null);
        pagina.loadUrl(enderecoDaPagina());
    }

    private boolean ehDoNotebook(Uri u) {
        return u != null && "http".equals(u.getScheme()) && (u.getPort() == -1 ? 80 : u.getPort()) == guardado.getInt(PORTA, 7420);
    }

    private class Navegacao extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest pedido) {
            Uri u = pedido.getUrl();
            if (ehDoNotebook(u)) return false;
            // Qualquer outro link abre no navegador do celular.
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { /* sem navegador */ }
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap icone) {
            // A própria página muda de endereço quando acha o notebook em outro lugar da rede: guarda o novo.
            Uri u = Uri.parse(url);
            if (ehDoNotebook(u) && u.getHost() != null && u.getPath() != null && u.getPath().startsWith("/controle")
                    && !u.getHost().equals(guardado.getString(HOST, ""))) {
                guardado.edit().putString(HOST, u.getHost()).apply();
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (paginaFalhou) return;
            aviso.setVisibility(View.GONE);
            pagina.setVisibility(View.VISIBLE);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest pedido, WebResourceError erro) {
            if (pedido.isForMainFrame()) falhou();
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest pedido, WebResourceResponse resposta) {
            if (pedido.isForMainFrame()) falhou();
        }

        private void falhou() {
            if (paginaFalhou) return;
            paginaFalhou = true;
            pagina.stopLoading();
            pagina.loadUrl("about:blank");
            // Não abriu: pergunta de novo ao notebook (e procura na rede, se ele mudou de endereço).
            naTela.post(MainActivity.this::conectar);
        }
    }

    /** "Mandar arquivos" (fotos, vídeos, músicas, PDF da palestra): abre o seletor de arquivos do celular. */
    private class EscolherArquivos extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> resposta, FileChooserParams pedido) {
            if (esperandoArquivos != null) esperandoArquivos.onReceiveValue(null);
            esperandoArquivos = resposta;
            Intent escolher = new Intent(Intent.ACTION_GET_CONTENT);
            escolher.addCategory(Intent.CATEGORY_OPENABLE);
            escolher.setType("*/*");
            List<String> tipos = new ArrayList<>();
            if (pedido.getAcceptTypes() != null) {
                for (String aceito : pedido.getAcceptTypes()) {
                    if (aceito == null) continue;
                    for (String t : aceito.split(",")) if (t.trim().contains("/")) tipos.add(t.trim());
                }
            }
            if (tipos.size() == 1) escolher.setType(tipos.get(0));
            else if (tipos.size() > 1) escolher.putExtra(Intent.EXTRA_MIME_TYPES, tipos.toArray(new String[0]));
            if (pedido.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) escolher.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try {
                startActivityForResult(Intent.createChooser(escolher, "Escolha os arquivos"), PEDIDO_ARQUIVOS);
            } catch (ActivityNotFoundException e) {
                esperandoArquivos = null;
                resposta.onReceiveValue(null);
                Toast.makeText(MainActivity.this, "Este celular não tem um aplicativo para escolher arquivos.", Toast.LENGTH_LONG).show();
            }
            return true;
        }
    }

    /** O que a página pode pedir ao app (window.AltarApp). */
    private class PonteComAPagina {
        @JavascriptInterface
        public void lerQr() {
            naTela.post(MainActivity.this::lerQr);
        }
    }

    // ---------- QR code ----------

    private void lerQr() {
        IntentIntegrator leitor = new IntentIntegrator(this);
        leitor.setDesiredBarcodeFormats(IntentIntegrator.QR_CODE);
        leitor.setPrompt("Aponte para o QR code que aparece na tela do notebook");
        leitor.setBeepEnabled(false);
        leitor.setOrientationLocked(true);
        leitor.initiateScan();
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent dados) {
        if (pedido == PEDIDO_ARQUIVOS) {
            ValueCallback<Uri[]> resposta = esperandoArquivos;
            esperandoArquivos = null;
            if (resposta != null) resposta.onReceiveValue(resultado == RESULT_OK ? arquivosEscolhidos(dados) : null);
            return;
        }
        IntentResult lido = IntentIntegrator.parseActivityResult(pedido, resultado, dados);
        if (lido == null) { super.onActivityResult(pedido, resultado, dados); return; }
        if (lido.getContents() == null) return;   // desistiu de ler
        if (guardarEndereco(lido.getContents())) conectar();
        else Toast.makeText(this, "Esse QR code não é do Altar. Leia o que aparece na tela do notebook.", Toast.LENGTH_LONG).show();
    }

    private static Uri[] arquivosEscolhidos(Intent dados) {
        if (dados == null) return null;
        ClipData varios = dados.getClipData();
        if (varios != null && varios.getItemCount() > 0) {
            Uri[] lista = new Uri[varios.getItemCount()];
            for (int i = 0; i < lista.length; i++) lista[i] = varios.getItemAt(i).getUri();
            return lista;
        }
        return dados.getData() != null ? new Uri[]{dados.getData()} : null;
    }

    // ---------- botão de voltar do celular ----------

    @Override
    public void onBackPressed() {
        // A página trata o "voltar" (fecha o painel aberto, volta para a lista...). No começo, o app só vai para o fundo.
        if (pagina.getVisibility() == View.VISIBLE && pagina.canGoBack()) pagina.goBack();
        else moveTaskToBack(true);
    }
}
