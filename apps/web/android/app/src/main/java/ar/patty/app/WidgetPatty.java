package ar.patty.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
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
 */
public class WidgetPatty extends AppWidgetProvider {

    static final String PREFS = "widget";
    private static final String SENTIR = "ar.patty.app.WIDGET_SENTIR";
    /** Lo anotado se muestra un rato y vuelve la pregunta. */
    private static final long MENSAJE_MS = 3 * 60 * 60 * 1000L;
    private static final int[] CARITAS = { R.id.widget_muy_bien, R.id.widget_bien, R.id.widget_mal, R.id.widget_muy_mal };
    private static final int[] INTENSIDAD = { 10, 7, 4, 1 };
    private static final int[] NOMBRE = { R.string.widget_muy_bien, R.string.widget_bien, R.string.widget_mal, R.string.widget_muy_mal };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager am, int[] ids) {
        for (int id : ids) am.updateAppWidget(id, vista(ctx));
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
        int img = ctx.getResources().getIdentifier("icono_" + cara + "_frente", "mipmap", ctx.getPackageName());
        if (img != 0) v.setImageViewResource(R.id.widget_buho, img);
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String mensaje = sp.getString("mensaje", null);
        boolean vigente = mensaje != null && System.currentTimeMillis() - sp.getLong("mensaje_cuando", 0) < MENSAJE_MS;
        boolean conSesion = ctx.getSharedPreferences(RespuestaReceiver.PREFS, Context.MODE_PRIVATE).getString("api", null) != null;
        v.setTextViewText(R.id.widget_texto, vigente ? mensaje : ctx.getString(conSesion ? R.string.widget_pregunta : R.string.widget_entrar));

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
        mensaje(ctx, ctx.getString(R.string.widget_anotando));
        final PendingResult pendiente = goAsync();
        new Thread(() -> {
            try {
                if (anotar(ctx, INTENSIDAD[i])) {
                    String hora = new SimpleDateFormat("HH:mm", Locale.US).format(new Date());
                    mensaje(ctx, ctx.getString(R.string.widget_anotado, ctx.getString(NOMBRE[i])) + " · " + hora);
                } else {
                    mensaje(ctx, null);
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

    private static void mensaje(Context ctx, String texto) {
        SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        if (texto == null) e.remove("mensaje");
        else e.putString("mensaje", texto).putLong("mensaje_cuando", System.currentTimeMillis());
        e.apply();
        actualizar(ctx);
    }

    /** "Cómo me siento" con esa intensidad, ahora, a la API con la sesión de la app. */
    private static boolean anotar(Context ctx, int intensidad) {
        SharedPreferences w = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences s = ctx.getSharedPreferences(RespuestaReceiver.PREFS, Context.MODE_PRIVATE);
        String api = s.getString("api", null);
        String token = s.getString("token", null);
        int persona = w.getInt("persona_id", 0);
        int categoria = w.getInt("categoria_id", 0);
        if (api == null || persona == 0 || categoria == 0) return false;
        String cookie = android.webkit.CookieManager.getInstance().getCookie(api);
        if (token == null && cookie == null) return false;
        HttpURLConnection c = null;
        try {
            SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
            iso.setTimeZone(TimeZone.getTimeZone("UTC"));
            JSONObject cuerpo = new JSONObject()
                .put("persona_id", persona)
                .put("concepto_nombre", "Cómo me siento")
                .put("categoria_id", categoria)
                .put("intensidad", intensidad)
                .put("inicio", iso.format(new Date()));
            c = (HttpURLConnection) new URL(api + "/api/registros").openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(8000);
            c.setReadTimeout(12000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            if (token != null) c.setRequestProperty("Authorization", "Bearer " + token);
            if (cookie != null) c.setRequestProperty("Cookie", cookie);
            try (OutputStream o = c.getOutputStream()) {
                o.write(cuerpo.toString().getBytes(StandardCharsets.UTF_8));
            }
            int estado = c.getResponseCode();
            return estado >= 200 && estado < 300;
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
