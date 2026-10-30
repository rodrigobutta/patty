package ar.patty.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Lo que Patty saca de los avisos de las otras apps (con el mismo "acceso a las notificaciones" de EscuchaService), cada
 * cosa con su interruptor (Más → Permisos):
 * - interrupciones: cuántos avisos llegan, por app y por hora, cuántos sonaron y cuántos con la pantalla apagada.
 * - social: cuántos mensajes llegan (WhatsApp, Telegram, Instagram, Messenger, Signal, SMS).
 * - pedidos, viajes, ejercicio: lo que dicen los avisos de PedidosYa, Uber, Strava… leído acá con LectorAvisos.
 * De las dos primeras nunca se lee el texto: solo la app, la hora y si es un mensaje. De las otras tres, el texto se lee
 * en el momento y se guarda solo lo que se sacó ({tipo, app, evento, instante, deporte, km, minutos}).
 * Se guarda en preferencias propias; EscuchaPlugin se lo da a la web, que lo manda a Patty y lo borra.
 */
final class AvisosTelefono {

    private static final String TAG = "PattyAvisos";

    static final String PREFS = "patty_avisos";
    static final String CONTEOS = "conteos";
    static final String EVENTOS = "eventos";
    private static final String ULTIMOS = "ultimos";
    static final String[] FUNCIONES = { "interrupciones", "social", "pedidos", "viajes", "ejercicio" };

    private static final long HORA_MS = 3600_000L;
    private static final long GUARDAR_MS = 14L * 24 * HORA_MS;
    private static final int MAX_CONTEOS = 4000;
    private static final int MAX_EVENTOS = 300;
    /** El mismo evento de la misma app dentro de este rato es el mismo (las apps repiten o actualizan sus avisos). */
    private static final long REPETIDO_MS = 10 * 60_000L;

    static final Object CANDADO = new Object();

    /** La última vez ("when") que se vio cada aviso: una actualización del mismo aviso no es uno nuevo. */
    private static final Map<String, Long> VISTOS = new LinkedHashMap<String, Long>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Long> e) {
            return size() > 400;
        }
    };

    private AvisosTelefono() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Cada función viene prendida mientras haya acceso a las notificaciones; la persona la apaga en Permisos. */
    static boolean prendida(SharedPreferences p, String funcion) {
        return p.getBoolean("f_" + funcion, true);
    }

    private static boolean ignorar(Context ctx, String paquete) {
        return paquete == null
            || paquete.equals(ctx.getPackageName())
            || paquete.equals("android")
            || paquete.equals("com.android.systemui")
            || paquete.equals("com.android.providers.downloads");
    }

    /** Un aviso que llegó (o se actualizó). Lo llama EscuchaService. */
    static void alLlegar(Context ctx, StatusBarNotification sbn, NotificationListenerService.RankingMap ranking) {
        String paquete = sbn.getPackageName();
        if (ignorar(ctx, paquete)) return;
        Notification n = sbn.getNotification();
        if (n == null) return;
        long ahora = System.currentTimeMillis();
        boolean enCurso = sbn.isOngoing() || (n.flags & Notification.FLAG_FOREGROUND_SERVICE) != 0;
        boolean resumen = (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0;
        SharedPreferences p = prefs(ctx);

        // Pedidos, viajes y ejercicio: solo de las apps conocidas, y del texto queda solo lo que se entendió.
        if (LectorAvisos.seLee(paquete) && !resumen) {
            Bundle x = n.extras;
            CharSequence titulo = x == null ? null : x.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence texto = x == null ? null : x.getCharSequence(Notification.EXTRA_BIG_TEXT);
            if (texto == null && x != null) texto = x.getCharSequence(Notification.EXTRA_TEXT);
            LectorAvisos.Evento e = LectorAvisos.leer(paquete, titulo == null ? null : titulo.toString(), texto == null ? null : texto.toString(), enCurso);
            String funcion = e == null ? null : e.tipo.equals("pedido") ? "pedidos" : e.tipo.equals("viaje") ? "viajes" : "ejercicio";
            if (e != null && prendida(p, funcion) && guardarEvento(p, e, ahora) && e.tipo.equals("pedido") && e.evento.equals("entregado")) {
                preguntarPorElPedido(ctx, e.app);
            }
        }

        // Interrupciones y mensajes: nada fijo ni los resúmenes de un grupo, y una actualización del mismo aviso no cuenta.
        if (enCurso || resumen || !esNuevo(sbn, n)) return;
        boolean interrupciones = prendida(p, "interrupciones");
        boolean mensaje = prendida(p, "social") && LectorAvisos.esMensaje(paquete, n.category);
        if (!interrupciones && !mensaje) return;
        boolean sonora = false;
        if (ranking != null) {
            NotificationListenerService.Ranking r = new NotificationListenerService.Ranking();
            if (ranking.getRanking(sbn.getKey(), r)) {
                // Con sonido o vibración y sin que No molestar lo calle: puede despertar.
                sonora = r.getImportance() >= NotificationManager.IMPORTANCE_DEFAULT && r.matchesInterruptionFilter();
            }
        }
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        boolean apagada = pm != null && !pm.isInteractive();
        sumar(ctx, p, paquete, ahora, interrupciones, sonora, apagada, mensaje);
    }

    private static boolean esNuevo(StatusBarNotification sbn, Notification n) {
        String clave = sbn.getKey();
        long cuando = n.when != 0 ? n.when : sbn.getPostTime();
        synchronized (VISTOS) {
            Long antes = VISTOS.get(clave);
            VISTOS.put(clave, cuando);
            if (antes == null) return true;
            // Las apps de mensajes actualizan el mismo aviso con cada mensaje nuevo (cambia "when"); las que solo
            // actualizan lo que muestran (un progreso, una cuenta regresiva) lo marcan para no volver a sonar.
            return antes != cuando && (n.flags & Notification.FLAG_ONLY_ALERT_ONCE) == 0;
        }
    }

    private static void sumar(Context ctx, SharedPreferences p, String paquete, long ahora, boolean interrupciones, boolean sonora, boolean apagada, boolean mensaje) {
        long hora = ahora - (ahora % HORA_MS);
        String clave = hora + "|" + paquete;
        synchronized (CANDADO) {
            try {
                JSONObject conteos = leerObjeto(p, CONTEOS);
                JSONObject c = conteos.optJSONObject(clave);
                if (c == null) {
                    // Al crear uno nuevo, se van los muy viejos (si la app no se abrió en mucho tiempo).
                    if (conteos.length() >= MAX_CONTEOS) conteos = recortar(conteos, ahora);
                    c = new JSONObject().put("paquete", paquete).put("app", EscuchaService.nombreDeApp(ctx, paquete)).put("hora", hora)
                        .put("n", 0).put("sonoras", 0).put("apagada", 0).put("mensajes", 0);
                    conteos.put(clave, c);
                }
                if (interrupciones) {
                    c.put("n", c.optInt("n") + 1);
                    if (sonora) c.put("sonoras", c.optInt("sonoras") + 1);
                    if (apagada) c.put("apagada", c.optInt("apagada") + 1);
                }
                if (mensaje) c.put("mensajes", c.optInt("mensajes") + 1);
                p.edit().putString(CONTEOS, conteos.toString()).apply();
            } catch (Exception e) {
                Log.w(TAG, "No se pudo contar el aviso", e);
            }
        }
    }

    private static JSONObject recortar(JSONObject conteos, long ahora) {
        JSONObject r = new JSONObject();
        Iterator<String> it = conteos.keys();
        while (it.hasNext()) {
            String k = it.next();
            JSONObject c = conteos.optJSONObject(k);
            if (c == null || ahora - c.optLong("hora") > GUARDAR_MS / 2) continue;
            try {
                r.put(k, c);
            } catch (Exception ignorado) {
                // No pasa: la clave es un texto.
            }
        }
        return r;
    }

    /** Guarda lo que se entendió de un aviso, salvo que sea lo mismo que hace un rato. Devuelve si era nuevo. */
    private static boolean guardarEvento(SharedPreferences p, LectorAvisos.Evento e, long ahora) {
        String clave = e.tipo + "|" + e.app + "|" + e.evento;
        synchronized (CANDADO) {
            try {
                JSONObject ultimos = leerObjeto(p, ULTIMOS);
                long antes = ultimos.optLong(clave, 0L);
                ultimos.put(clave, ahora);
                SharedPreferences.Editor ed = p.edit().putString(ULTIMOS, ultimos.toString());
                if (ahora - antes < REPETIDO_MS) {
                    ed.apply();
                    return false;
                }
                JSONArray viejos = leerLista(p, EVENTOS);
                JSONArray lista = new JSONArray();
                for (int i = Math.max(0, viejos.length() - MAX_EVENTOS + 1); i < viejos.length(); i++) {
                    JSONObject v = viejos.optJSONObject(i);
                    if (v != null && ahora - v.optLong("instante") < GUARDAR_MS) lista.put(v);
                }
                JSONObject o = new JSONObject().put("tipo", e.tipo).put("app", e.app).put("evento", e.evento).put("instante", ahora);
                if (e.deporte != null) o.put("deporte", e.deporte);
                if (e.km != null) o.put("km", e.km);
                if (e.minutos != null) o.put("minutos", e.minutos);
                lista.put(o);
                ed.putString(EVENTOS, lista.toString()).apply();
                return true;
            } catch (Exception ex) {
                Log.w(TAG, "No se pudo guardar el evento", ex);
                return false;
            }
        }
    }

    static JSONObject leerObjeto(SharedPreferences p, String clave) {
        try {
            return new JSONObject(p.getString(clave, "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static JSONArray leerLista(SharedPreferences p, String clave) {
        try {
            return new JSONArray(p.getString(clave, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static final Map<String, String> NOMBRES = new LinkedHashMap<>();

    static {
        NOMBRES.put("pedidosya", "PedidosYa");
        NOMBRES.put("rappi", "Rappi");
        NOMBRES.put("ubereats", "Uber Eats");
        NOMBRES.put("didifood", "DiDi Food");
    }

    /** Llegó un pedido: Patty pregunta qué fue con un aviso (tocarlo abre el Día, donde está la pregunta). */
    private static void preguntarPorElPedido(Context ctx, String app) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            String canal = "avisos";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(canal) == null) {
                NotificationChannel c = new NotificationChannel(canal, "Avisos", NotificationManager.IMPORTANCE_DEFAULT);
                c.setLockscreenVisibility(NotificationCompat.VISIBILITY_PRIVATE);
                nm.createNotificationChannel(c);
            }
            Intent abrir = new Intent(ctx, MainActivity.class);
            abrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            abrir.putExtra(AvisosPushService.EXTRA_TOCADO, true);
            abrir.putExtra("tipo", "pedido");
            PendingIntent pi = PendingIntent.getActivity(ctx, 7301, abrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            String nombre = NOMBRES.containsKey(app) ? NOMBRES.get(app) : app;
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, canal)
                .setSmallIcon(R.drawable.ic_stat_patty)
                .setColor(0xFF6B4FBB)
                .setContentTitle("¿Pediste comida? 🦉")
                .setContentText("Llegó tu pedido de " + nombre + ". ¿Qué fue? Anotalo con un toque.")
                .setAutoCancel(true)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setContentIntent(pi);
            int res = ctx.getResources().getIdentifier("buho_feliz", "mipmap", ctx.getPackageName());
            if (res != 0) {
                android.graphics.Bitmap img = android.graphics.BitmapFactory.decodeResource(ctx.getResources(), res);
                if (img != null) b.setLargeIcon(img);
            }
            nm.notify("pedido", 7301, b.build());
        } catch (Exception e) {
            // Sin permiso de avisos: la pregunta igual aparece en el Día.
            Log.w(TAG, "No se pudo preguntar por el pedido", e);
        }
    }
}
