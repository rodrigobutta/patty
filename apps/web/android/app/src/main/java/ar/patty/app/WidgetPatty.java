package ar.patty.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONObject;

/**
 * El widget de Patty en la pantalla de inicio. El búho tiene la misma cara que el ícono (MascotaPlugin.caraDeHoy); las
 * cuatro caritas anotan "Cómo me siento" sin abrir la app, con la sesión de la app (como los botones de los avisos,
 * RespuestaReceiver); "Contar" y "Foto" abren Patty directo en eso. La persona y la categoría del ánimo las guarda la
 * web (MascotaPlugin.guardarWidget). Si no se puede anotar (sin señal, sin sesión), abre la app con la carita elegida:
 * la web la anota o la deja en la cola de sin señal.
 * Al anotar aparece un aviso ("✓ Anotado: Bien") que se va solo a los segundos; el resto del tiempo, al lado del búho
 * va la línea del día que arma la API (/api/widget: un malestar abierto, lo que falta de un seguimiento, un objetivo…)
 * o, sin nada, la pregunta. La línea se pide al dibujarse (cada 30 minutos), al abrir Patty y después de anotar.
 */
public class WidgetPatty extends AppWidgetProvider {

    static final String PREFS = "widget";
    private static final String SENTIR = "ar.patty.app.WIDGET_SENTIR";
    /** Cuánto se ve el aviso de "Anotado". */
    private static final long AVISO_MS = 3000L;
    private static final int[] CARITAS = { R.id.widget_muy_bien, R.id.widget_bien, R.id.widget_mal, R.id.widget_muy_mal };
    private static final int[] INTENSIDAD = { 10, 7, 4, 1 };
    private static final int[] NOMBRE = { R.string.widget_muy_bien, R.string.widget_bien, R.string.widget_mal, R.string.widget_muy_mal };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager am, int[] ids) {
        for (int id : ids) am.updateAppWidget(id, vista(ctx));
        final PendingResult pendiente = goAsync();
        new Thread(() -> {
            try {
                pedirLinea(ctx);
            } finally {
                pendiente.finish();
            }
        }).start();
    }

    /** Pide la línea del día a la API y redibuja (sin conexión queda la última). En un hilo aparte. */
    static void pedirLinea(Context ctx) {
        int persona = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt("persona_id", 0);
        if (persona == 0) return;
        String r = pedir(ctx, "GET", "/api/widget?persona=" + persona, null);
        if (r == null) return;
        try {
            JSONObject o = new JSONObject(r);
            SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
            if (o.isNull("linea")) e.remove("linea");
            else e.putString("linea", o.getString("linea"));
            e.apply();
            actualizar(ctx);
        } catch (Exception ex) {
            // respuesta rara: queda la última
        }
    }

    /** Vuelve a dibujar todos los widgets (al cambiar la cara del búho o después de anotar). */
    static void actualizar(Context ctx) {
        AppWidgetManager am = AppWidgetManager.getInstance(ctx);
        int[] ids = am.getAppWidgetIds(new ComponentName(ctx, WidgetPatty.class));
        if (ids.length > 0) am.updateAppWidget(ids, vista(ctx));
    }

    private static RemoteViews vista(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_patty);
        String cara = MascotaPlugin.caraDeHoy(ctx);
        int img = ctx.getResources().getIdentifier("buho_" + cara, "mipmap", ctx.getPackageName());
        if (img != 0) v.setImageViewResource(R.id.widget_buho, img);
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String linea = sp.getString("linea", null);
        boolean conSesion = ctx.getSharedPreferences(RespuestaReceiver.PREFS, Context.MODE_PRIVATE).getString("api", null) != null;
        v.setTextViewText(R.id.widget_texto, !conSesion ? ctx.getString(R.string.widget_entrar) : linea != null ? linea : ctx.getString(R.string.widget_pregunta));
        v.setViewVisibility(R.id.widget_aviso, View.GONE);
        v.setViewVisibility(R.id.widget_texto, View.VISIBLE);

        v.setOnClickPendingIntent(R.id.widget_cabeza, abrir(ctx, "dia", null, 100));
        v.setOnClickPendingIntent(R.id.widget_contar, abrir(ctx, "contar", null, 101));
        v.setOnClickPendingIntent(R.id.widget_foto, abrir(ctx, "foto", null, 102));
        for (int i = 0; i < CARITAS.length; i++) {
            Intent in = new Intent(ctx, WidgetPatty.class).setAction(SENTIR).putExtra("indice", i);
            v.setOnClickPendingIntent(CARITAS[i], PendingIntent.getBroadcast(ctx, 200 + i, in, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        return v;
    }

    /** Abre Patty como si se tocara un aviso (MascotaPlugin se lo pasa a la web con tipo "widget"). */
    private static PendingIntent abrir(Context ctx, String accion, Integer intensidad, int codigo) {
        Intent in = new Intent(ctx, MainActivity.class);
        in.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        in.putExtra(AvisosPushService.EXTRA_TOCADO, true);
        in.putExtra("tipo", "widget");
        in.putExtra("accion_widget", accion);
        if (intensidad != null) in.putExtra("intensidad", String.valueOf(intensidad));
        return PendingIntent.getActivity(ctx, codigo, in, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (!SENTIR.equals(intent.getAction())) return;
        int i = Math.max(0, Math.min(CARITAS.length - 1, intent.getIntExtra("indice", 1)));
        aviso(ctx, ctx.getString(R.string.widget_anotando));
        final PendingResult pendiente = goAsync();
        new Thread(() -> {
            try {
                if (anotar(ctx, INTENSIDAD[i])) {
                    long desde = System.currentTimeMillis();
                    aviso(ctx, ctx.getString(R.string.widget_anotado, ctx.getString(NOMBRE[i])));
                    // Mientras se ve el aviso se trae la línea nueva; después el aviso se va con un fundido.
                    pedirLinea(ctx);
                    try {
                        Thread.sleep(Math.max(0, AVISO_MS - (System.currentTimeMillis() - desde)));
                    } catch (InterruptedException e) {
                        // nada
                    }
                    aviso(ctx, null);
                } else {
                    aviso(ctx, null);
                    try {
                        abrir(ctx, "sentir", INTENSIDAD[i], 300 + i).send();
                    } catch (PendingIntent.CanceledException e) {
                        // nada
                    }
                }
            } finally {
                pendiente.finish();
            }
        }).start();
    }

    /**
     * Muestra el aviso encima de la línea (o lo saca, con null). Es una actualización parcial: cambia solo esas vistas,
     * así el fundido del layout se ve en lugar de redibujar todo.
     */
    private static void aviso(Context ctx, String texto) {
        AppWidgetManager am = AppWidgetManager.getInstance(ctx);
        int[] ids = am.getAppWidgetIds(new ComponentName(ctx, WidgetPatty.class));
        if (ids.length == 0) return;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_patty);
        if (texto != null) v.setTextViewText(R.id.widget_aviso, texto);
        else {
            String linea = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("linea", null);
            v.setTextViewText(R.id.widget_texto, linea != null ? linea : ctx.getString(R.string.widget_pregunta));
        }
        v.setViewVisibility(R.id.widget_aviso, texto != null ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.widget_texto, texto != null ? View.INVISIBLE : View.VISIBLE);
        am.partiallyUpdateAppWidget(ids, v);
    }

    /** "Cómo me siento" con esa intensidad, ahora, a la API con la sesión de la app. */
    private static boolean anotar(Context ctx, int intensidad) {
        SharedPreferences w = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int persona = w.getInt("persona_id", 0);
        int categoria = w.getInt("categoria_id", 0);
        if (persona == 0 || categoria == 0) return false;
        try {
            SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
            iso.setTimeZone(TimeZone.getTimeZone("UTC"));
            JSONObject cuerpo = new JSONObject()
                .put("persona_id", persona)
                .put("concepto_nombre", "Cómo me siento")
                .put("categoria_id", categoria)
                .put("intensidad", intensidad)
                .put("inicio", iso.format(new Date()));
            return pedir(ctx, "POST", "/api/registros", cuerpo.toString()) != null;
        } catch (Exception e) {
            return false;
        }
    }

    /** Un pedido a la API con la sesión de la app; el cuerpo de la respuesta si salió bien, si no null. */
    private static String pedir(Context ctx, String metodo, String ruta, String cuerpo) {
        SharedPreferences s = ctx.getSharedPreferences(RespuestaReceiver.PREFS, Context.MODE_PRIVATE);
        String api = s.getString("api", null);
        String token = s.getString("token", null);
        if (api == null) return null;
        String cookie = android.webkit.CookieManager.getInstance().getCookie(api);
        if (token == null && cookie == null) return null;
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(api + ruta).openConnection();
            c.setRequestMethod(metodo);
            c.setConnectTimeout(8000);
            c.setReadTimeout(12000);
            c.setRequestProperty("X-Idioma", Locale.getDefault().getLanguage());
            if (token != null) c.setRequestProperty("Authorization", "Bearer " + token);
            if (cookie != null) c.setRequestProperty("Cookie", cookie);
            if (cuerpo != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                try (OutputStream o = c.getOutputStream()) {
                    o.write(cuerpo.getBytes(StandardCharsets.UTF_8));
                }
            }
            int estado = c.getResponseCode();
            if (estado < 200 || estado >= 300) return null;
            try (java.io.InputStream in = c.getInputStream()) {
                java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[4096];
                for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
                return b.toString("UTF-8");
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
