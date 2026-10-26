package ar.patty.app;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import androidx.core.app.NotificationCompat;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Un botón de un aviso que se contesta sin abrir la app ("Bien", "La tomé"): hace los pedidos a la API con la sesión de
 * la app (la cookie de la vista web, o el token si la app usa token; la dirección la guarda MascotaPlugin.guardarSesion) y cambia el aviso por "✓ Anotado". Si no puede (sin conexión, sin
 * sesión), el aviso queda para tocarlo y contestar en la app.
 */
public class RespuestaReceiver extends BroadcastReceiver {

    static final String PREFS = "patty_sesion";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        final PendingResult pendiente = goAsync();
        new Thread(() -> {
            try {
                responder(ctx, intent);
            } finally {
                pendiente.finish();
            }
        }).start();
    }

    private void responder(Context ctx, Intent intent) {
        String etiqueta = intent.getStringExtra("etiqueta");
        int id = intent.getIntExtra("aviso_id", 0);
        String canal = intent.getStringExtra("canal");
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        boolean ok = false;
        String listo = null;
        String luego = null;
        try {
            JSONObject accion = new JSONObject(intent.getStringExtra("accion"));
            listo = accion.optString("listo", "✓");
            luego = accion.has("luego") ? accion.getString("luego") : null;
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String api = sp.getString("api", null);
            String token = sp.getString("token", null);
            // La app abre la web de Patty: la sesión es la cookie de esa vista web (el sistema la comparte con nosotros).
            String cookie = api != null ? android.webkit.CookieManager.getInstance().getCookie(api) : null;
            if (api != null && (token != null || cookie != null)) {
                JSONArray pedidos = accion.getJSONArray("pedidos");
                ok = true;
                for (int i = 0; i < pedidos.length() && ok; i++) {
                    JSONObject p = pedidos.getJSONObject(i);
                    ok = post(api + p.getString("ruta"), token, cookie, p.getJSONObject("cuerpo").toString());
                }
            }
        } catch (Exception e) {
            ok = false;
        }

        // Tocar el aviso que queda abre la app (en el Día), con los mismos datos que el original.
        Intent abrir = new Intent(ctx, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (intent.getExtras() != null) abrir.putExtras(intent.getExtras());
        abrir.removeExtra("accion");
        abrir.putExtra(AvisosPushService.EXTRA_TOCADO, true);
        PendingIntent pi = PendingIntent.getActivity(ctx, id + 3, abrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        String texto = ok ? (luego != null ? luego : listo) : "No pude anotarlo: tocá para contestar en Patty.";
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, canal != null ? canal : "avisos")
            .setSmallIcon(R.drawable.ic_stat_patty)
            .setColor(0xFF6B4FBB)
            .setContentTitle("Patty")
            .setContentText(texto)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setAutoCancel(true)
            .setContentIntent(pi);
        // Lo anotado se va solo a los pocos segundos; si hay que seguir (contar qué pasó) o falló, queda.
        if (ok && luego == null) b.setTimeoutAfter(4000);
        try {
            if (etiqueta != null) nm.notify(etiqueta, AvisosPushService.ID_CON_ETIQUETA, b.build());
            else nm.notify(id, b.build());
        } catch (SecurityException e) {
            // sin permiso de avisos
        }
    }

    private static boolean post(String url, String token, String cookie, String cuerpo) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(10000);
            c.setReadTimeout(15000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            if (token != null) c.setRequestProperty("Authorization", "Bearer " + token);
            if (cookie != null) c.setRequestProperty("Cookie", cookie);
            try (OutputStream o = c.getOutputStream()) {
                o.write(cuerpo.getBytes(StandardCharsets.UTF_8));
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
