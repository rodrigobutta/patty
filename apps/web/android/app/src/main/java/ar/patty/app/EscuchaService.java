package ar.patty.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Qué estoy escuchando o mirando, sin conectar cada servicio: Android deja que un "lector de notificaciones" vea las
 * sesiones de audio y video que hay abiertas (Spotify, YouTube, Netflix, podcasts…) con su título, artista y si están
 * sonando. Con eso se anotan tramos: desde que algo empieza a sonar hasta que se pausa, termina o cambia de tema. Solo
 * se guardan los tramos de al menos 30 segundos, de los últimos 14 días; EscuchaPlugin los lee.
 * Para esto no se lee el contenido de las notificaciones: el permiso se usa solo para ver qué suena.
 * Si el usuario no lo prendió (preferencia "activo"), no se anota nada.
 * Con el mismo permiso, cada aviso que llega pasa por AvisosTelefono (cuántos avisos y mensajes, y pedidos, viajes y
 * ejercicio de algunas apps), que tiene sus propios interruptores.
 */
public class EscuchaService extends NotificationListenerService {

    private static final String TAG = "PattyEscucha";

    static final String PREFS = "patty_escuchas";
    static final String LISTA = "escuchas";
    static final String ABIERTOS = "abiertos";
    static final String ACTIVO = "activo";

    private static final long MINIMO_MS = 30_000L;
    private static final long GUARDAR_MS = 14L * 24 * 3600 * 1000;
    private static final int MAXIMO = 2000;
    /** Si el proceso murió con un tramo abierto y hace más de esto que no se ve, se cierra donde se lo vio por última vez. */
    private static final long VIEJO_MS = 2L * 60 * 1000;

    /** El servicio y el plugin tocan las mismas preferencias desde hilos distintos: de a uno por vez. */
    static final Object CANDADO = new Object();

    private final Handler handler = new Handler(Looper.getMainLooper());
    /** Las sesiones que estamos siguiendo, cada una con su callback, para no anotarnos dos veces. */
    private final Map<MediaSession.Token, Seguida> seguidas = new HashMap<>();
    private MediaSessionManager sesiones;
    private ComponentName yo;

    private static class Seguida {
        final MediaController control;
        final MediaController.Callback callback;

        Seguida(MediaController control, MediaController.Callback callback) {
            this.control = control;
            this.callback = callback;
        }
    }

    private final MediaSessionManager.OnActiveSessionsChangedListener alCambiarSesiones = this::sincronizar;

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        yo = new ComponentName(this, EscuchaService.class);
        sesiones = (MediaSessionManager) getSystemService(Context.MEDIA_SESSION_SERVICE);
        // Lo que quedó abierto de una vez anterior en que el proceso murió: se cierra donde se lo vio por última vez.
        cerrarViejos(this, System.currentTimeMillis());
        try {
            sesiones.addOnActiveSessionsChangedListener(alCambiarSesiones, yo, handler);
            sincronizar(sesiones.getActiveSessions(yo));
        } catch (SecurityException e) {
            // Sin el acceso a notificaciones Android no muestra las sesiones: no hay nada que hacer hasta que lo den.
            Log.w(TAG, "Sin acceso a las sesiones de audio", e);
        }
    }

    @Override
    public void onListenerDisconnected() {
        if (sesiones != null) {
            try {
                sesiones.removeOnActiveSessionsChangedListener(alCambiarSesiones);
            } catch (Exception e) {
                Log.w(TAG, "No se pudo dejar de escuchar las sesiones", e);
            }
        }
        for (Seguida s : seguidas.values()) s.control.unregisterCallback(s.callback);
        seguidas.clear();
        // Sin el servicio no nos enteramos de cuándo termina: lo que sonaba se cierra ahora.
        cerrarTodos(this, System.currentTimeMillis());
        super.onListenerDisconnected();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn, RankingMap ranking) {
        try {
            AvisosTelefono.alLlegar(this, sbn, ranking);
        } catch (Exception e) {
            // Un aviso raro no puede tirar abajo el servicio (ni lo que suena).
            Log.w(TAG, "No se pudo mirar el aviso", e);
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        onNotificationPosted(sbn, getCurrentRanking());
    }

    // ---- Sesiones ----

    /** Se pone al día con la lista de sesiones activas: suelta las que se fueron, sigue las nuevas y mira cada una. */
    private void sincronizar(List<MediaController> lista) {
        if (lista == null) lista = new ArrayList<>();
        Set<MediaSession.Token> vigentes = new HashSet<>();
        for (MediaController c : lista) vigentes.add(c.getSessionToken());

        Iterator<Map.Entry<MediaSession.Token, Seguida>> it = seguidas.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<MediaSession.Token, Seguida> e = it.next();
            if (vigentes.contains(e.getKey())) continue;
            Seguida s = e.getValue();
            s.control.unregisterCallback(s.callback);
            it.remove();
            evaluarCerrada(s.control.getPackageName());
        }

        for (MediaController c : lista) {
            MediaSession.Token t = c.getSessionToken();
            if (!seguidas.containsKey(t)) {
                MediaController.Callback cb = crearCallback(c);
                c.registerCallback(cb, handler);
                seguidas.put(t, new Seguida(c, cb));
            }
            evaluar(c);
        }

        // Tramos abiertos de apps que ya no tienen ninguna sesión: se cierran donde se los vio por última vez.
        Set<String> conSesion = new HashSet<>();
        for (Seguida s : seguidas.values()) conSesion.add(s.control.getPackageName());
        cerrarHuerfanos(this, conSesion);
    }

    private MediaController.Callback crearCallback(MediaController c) {
        return new MediaController.Callback() {
            @Override
            public void onMetadataChanged(MediaMetadata metadata) {
                evaluar(c);
            }

            @Override
            public void onPlaybackStateChanged(PlaybackState state) {
                evaluar(c);
            }

            @Override
            public void onSessionDestroyed() {
                Seguida s = seguidas.remove(c.getSessionToken());
                if (s != null) c.unregisterCallback(s.callback);
                evaluarCerrada(c.getPackageName());
            }
        };
    }

    /** Si otra sesión de la misma app está sonando, el tramo de la app sigue: se lo dejamos a esa sesión. */
    private boolean otraSuena(String paquete, MediaController salvo) {
        for (Seguida s : seguidas.values()) {
            if (s.control == salvo || !paquete.equals(s.control.getPackageName())) continue;
            if (estado(s.control) == PlaybackState.STATE_PLAYING) return true;
        }
        return false;
    }

    /** Una sesión que se fue: se cierra el tramo de su app, salvo que otra sesión de la misma app siga sonando. */
    private void evaluarCerrada(String paquete) {
        if (otraSuena(paquete, null)) return;
        synchronized (CANDADO) {
            SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
            JSONObject abiertos = leerAbiertos(p);
            JSONObject t = abiertos.optJSONObject(paquete);
            if (t == null) return;
            SharedPreferences.Editor e = p.edit();
            cerrar(p, e, t, System.currentTimeMillis());
            abiertos.remove(paquete);
            e.putString(ABIERTOS, abiertos.toString()).apply();
        }
    }

    private static int estado(MediaController c) {
        PlaybackState s = c.getPlaybackState();
        return s == null ? PlaybackState.STATE_NONE : s.getState();
    }

    /** Mira cómo está una sesión y abre, sigue, corta o cierra el tramo de su app. */
    private void evaluar(MediaController c) {
        String paquete = c.getPackageName();
        if (paquete == null || paquete.equals(getPackageName())) return;
        long ahora = System.currentTimeMillis();
        int st = estado(c);
        MediaMetadata md = c.getMetadata();
        String titulo = texto(md, MediaMetadata.METADATA_KEY_TITLE, MediaMetadata.METADATA_KEY_DISPLAY_TITLE);
        String artista = texto(md, MediaMetadata.METADATA_KEY_ARTIST, MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
        String album = texto(md, MediaMetadata.METADATA_KEY_ALBUM, null);
        long duracion = md == null ? 0L : Math.max(0L, md.getLong(MediaMetadata.METADATA_KEY_DURATION));

        synchronized (CANDADO) {
            SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
            boolean activo = p.getBoolean(ACTIVO, false);
            JSONObject abiertos = leerAbiertos(p);
            JSONObject abierto = abiertos.optJSONObject(paquete);
            // "Cargando" no abre un tramo nuevo, pero tampoco corta el que ya estaba.
            boolean suena = activo && !titulo.isEmpty()
                && (st == PlaybackState.STATE_PLAYING || (st == PlaybackState.STATE_BUFFERING && abierto != null));
            SharedPreferences.Editor e = p.edit();
            try {
                if (abierto != null) {
                    boolean mismo = titulo.equals(abierto.optString("titulo")) && artista.equals(abierto.optString("artista"));
                    if (suena && mismo) {
                        abierto.put("visto", ahora);
                        if (abierto.optLong("duracion", 0L) == 0L && duracion > 0) abierto.put("duracion", duracion);
                        if (abierto.optString("album").isEmpty() && !album.isEmpty()) abierto.put("album", album);
                    } else {
                        // Otra sesión de la misma app que sigue sonando no cierra nada (la pausada es otra).
                        if (!suena && activo && otraSuena(paquete, c)) return;
                        cerrar(p, e, abierto, ahora);
                        abiertos.remove(paquete);
                        abierto = null;
                    }
                }
                if (abierto == null && suena && st == PlaybackState.STATE_PLAYING) {
                    abiertos.put(paquete, new JSONObject()
                        .put("paquete", paquete)
                        .put("app", nombreDeApp(this, paquete))
                        .put("titulo", titulo)
                        .put("artista", artista)
                        .put("album", album)
                        .put("duracion", duracion)
                        .put("inicio", ahora)
                        .put("visto", ahora));
                }
            } catch (Exception ex) {
                Log.w(TAG, "No se pudo anotar el tramo", ex);
            }
            e.putString(ABIERTOS, abiertos.toString()).apply();
        }
    }

    private static String texto(MediaMetadata md, String clave, String otra) {
        if (md == null) return "";
        CharSequence v = md.getText(clave);
        if ((v == null || v.toString().trim().isEmpty()) && otra != null) v = md.getText(otra);
        return v == null ? "" : v.toString().trim();
    }

    static String nombreDeApp(Context ctx, String paquete) {
        PackageManager pm = ctx.getPackageManager();
        try {
            ApplicationInfo ai = pm.getApplicationInfo(paquete, 0);
            return pm.getApplicationLabel(ai).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return paquete;
        }
    }

    // ---- Guardado (también lo usa EscuchaPlugin) ----

    static JSONObject leerAbiertos(SharedPreferences p) {
        try {
            return new JSONObject(p.getString(ABIERTOS, "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static JSONArray leerLista(SharedPreferences p) {
        try {
            return new JSONArray(p.getString(LISTA, "[]"));
        } catch (Exception e) {
            // Si la lista se rompió, se empieza de nuevo antes que perder las que vienen.
            return new JSONArray();
        }
    }

    /** Pasa un tramo a la lista de cerrados (si duró lo suficiente), sacando los viejos y los que sobran. */
    private static void cerrar(SharedPreferences p, SharedPreferences.Editor e, JSONObject t, long fin) {
        long inicio = t.optLong("inicio", fin);
        if (fin - inicio < MINIMO_MS) return;
        try {
            JSONArray viejos = leerLista(p);
            JSONArray lista = new JSONArray();
            for (int i = 0; i < viejos.length(); i++) {
                JSONObject l = viejos.optJSONObject(i);
                if (l != null && fin - l.optLong("fin", 0L) < GUARDAR_MS) lista.put(l);
            }
            lista.put(new JSONObject()
                .put("paquete", t.optString("paquete"))
                .put("app", t.optString("app"))
                .put("titulo", t.optString("titulo"))
                .put("artista", t.optString("artista"))
                .put("album", t.optString("album"))
                .put("inicio", inicio)
                .put("fin", fin)
                .put("duracion", t.optLong("duracion", 0L)));
            // Como mucho los últimos MAXIMO: si sobran, se van los más viejos.
            if (lista.length() > MAXIMO) {
                JSONArray recortada = new JSONArray();
                for (int i = lista.length() - MAXIMO; i < lista.length(); i++) recortada.put(lista.get(i));
                lista = recortada;
            }
            e.putString(LISTA, lista.toString());
        } catch (Exception ex) {
            e.putString(LISTA, "[]");
        }
    }

    /** Cierra todo lo abierto en `fin` (al apagar la función o cuando el servicio se desconecta). */
    static void cerrarTodos(Context ctx, long fin) {
        synchronized (CANDADO) {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, MODE_PRIVATE);
            JSONObject abiertos = leerAbiertos(p);
            SharedPreferences.Editor e = p.edit();
            Iterator<String> it = abiertos.keys();
            while (it.hasNext()) {
                JSONObject t = abiertos.optJSONObject(it.next());
                if (t != null) cerrar(p, e, t, fin);
            }
            e.putString(ABIERTOS, "{}").apply();
        }
    }

    /** Lo abierto que hace rato no se ve (el proceso murió en el medio) se cierra en la última vez que se lo vio. */
    private static void cerrarViejos(Context ctx, long ahora) {
        synchronized (CANDADO) {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, MODE_PRIVATE);
            JSONObject abiertos = leerAbiertos(p);
            JSONObject quedan = new JSONObject();
            SharedPreferences.Editor e = p.edit();
            Iterator<String> it = abiertos.keys();
            while (it.hasNext()) {
                String paquete = it.next();
                JSONObject t = abiertos.optJSONObject(paquete);
                if (t == null) continue;
                long visto = t.optLong("visto", t.optLong("inicio", ahora));
                if (ahora - visto > VIEJO_MS) cerrar(p, e, t, visto);
                else {
                    try {
                        quedan.put(paquete, t);
                    } catch (Exception ignorado) {
                        // No pasa: la clave es un texto.
                    }
                }
            }
            e.putString(ABIERTOS, quedan.toString()).apply();
        }
    }

    /** Los tramos abiertos de apps que ya no tienen sesión se cierran donde se los vio por última vez. */
    private static void cerrarHuerfanos(Context ctx, Set<String> conSesion) {
        synchronized (CANDADO) {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, MODE_PRIVATE);
            JSONObject abiertos = leerAbiertos(p);
            JSONObject quedan = new JSONObject();
            SharedPreferences.Editor e = p.edit();
            boolean cambio = false;
            Iterator<String> it = abiertos.keys();
            while (it.hasNext()) {
                String paquete = it.next();
                JSONObject t = abiertos.optJSONObject(paquete);
                if (t == null) continue;
                if (conSesion.contains(paquete)) {
                    try {
                        quedan.put(paquete, t);
                    } catch (Exception ignorado) {
                        // No pasa: la clave es un texto.
                    }
                } else {
                    cerrar(p, e, t, t.optLong("visto", System.currentTimeMillis()));
                    cambio = true;
                }
            }
            if (cambio) e.putString(ABIERTOS, quedan.toString()).apply();
        }
    }
}
