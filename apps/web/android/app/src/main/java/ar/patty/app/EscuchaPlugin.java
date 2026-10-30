package ar.patty.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Iterator;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Lo que escuché y miré en el teléfono (solo Android), anotado por EscuchaService a partir de las sesiones de audio y
 * video. Acá se pide el permiso ("Acceso a notificaciones", se da en Ajustes), se prende o se apaga, y se leen o se
 * borran los tramos. Cada tramo: paquete, app, titulo, artista, album, inicio y fin (ms), y duracion (lo que dura el
 * tema o el video según la app, 0 si no lo dice).
 */
@CapacitorPlugin(name = "Escucha")
public class EscuchaPlugin extends Plugin {

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(EscuchaService.PREFS, Context.MODE_PRIVATE);
    }

    private ComponentName servicio() {
        return new ComponentName(getContext(), EscuchaService.class);
    }

    private boolean tieneAcceso() {
        return NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName());
    }

    @PluginMethod
    public void permiso(PluginCall call) {
        JSObject r = new JSObject();
        r.put("acceso", tieneAcceso() ? "granted" : "denied");
        call.resolve(r);
    }

    /** Abre la pantalla de Ajustes donde se habilita "Acceso a notificaciones" para Patty. */
    @PluginMethod
    public void pedirPermiso(PluginCall call) {
        try {
            Intent i;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // Android 11+ deja ir directo a la ficha de Patty.
                i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
                i.putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, servicio().flattenToString());
            } else {
                i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
        } catch (Exception e) {
            // Algunos teléfonos no tienen la ficha directa: se abre la lista.
            Intent i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getActivity().startActivity(i);
            } catch (Exception e2) {
                call.reject("No se pudo abrir Ajustes");
                return;
            }
        }
        call.resolve();
    }

    /** Prende o apaga la anotación. Al apagar, lo que estaba sonando se cierra ahora. */
    @PluginMethod
    public void activar(PluginCall call) {
        boolean activo = Boolean.TRUE.equals(call.getBoolean("activo", false));
        synchronized (EscuchaService.CANDADO) {
            prefs().edit().putBoolean(EscuchaService.ACTIVO, activo).apply();
        }
        if (activo) {
            // Si Android tenía el servicio dormido, que lo vuelva a conectar para empezar a escuchar.
            if (tieneAcceso()) NotificationListenerService.requestRebind(servicio());
        } else {
            EscuchaService.cerrarTodos(getContext(), System.currentTimeMillis());
        }
        JSObject r = new JSObject();
        r.put("activo", activo);
        call.resolve(r);
    }

    private static JSObject comoJS(JSONObject t, long fin) {
        JSObject o = new JSObject();
        o.put("paquete", t.optString("paquete"));
        o.put("app", t.optString("app"));
        o.put("titulo", t.optString("titulo"));
        o.put("artista", t.optString("artista"));
        o.put("album", t.optString("album"));
        o.put("inicio", t.optLong("inicio", 0L));
        o.put("fin", fin);
        o.put("duracion", t.optLong("duracion", 0L));
        return o;
    }

    /** Los tramos cerrados, lo que está sonando ahora (el que empezó último, o null) y si la función está prendida. */
    @PluginMethod
    public void escuchas(PluginCall call) {
        long ahora = System.currentTimeMillis();
        JSArray lista = new JSArray();
        JSObject actual = null;
        boolean activo;
        synchronized (EscuchaService.CANDADO) {
            SharedPreferences p = prefs();
            activo = p.getBoolean(EscuchaService.ACTIVO, false);
            JSONArray cerrados = EscuchaService.leerLista(p);
            for (int i = 0; i < cerrados.length(); i++) {
                JSONObject t = cerrados.optJSONObject(i);
                if (t != null) lista.put(comoJS(t, t.optLong("fin", 0L)));
            }
            JSONObject abiertos = EscuchaService.leerAbiertos(p);
            long ultimo = Long.MIN_VALUE;
            Iterator<String> it = abiertos.keys();
            while (it.hasNext()) {
                JSONObject t = abiertos.optJSONObject(it.next());
                if (t == null) continue;
                long inicio = t.optLong("inicio", 0L);
                if (inicio > ultimo) {
                    ultimo = inicio;
                    actual = comoJS(t, ahora);
                }
            }
        }
        JSObject r = new JSObject();
        r.put("escuchas", lista);
        r.put("ahora", actual == null ? JSONObject.NULL : actual);
        r.put("activo", activo);
        call.resolve(r);
    }

    /** Borra los tramos cerrados que terminaron hasta `hasta` (ms), los que ya se mandaron, por ejemplo. */
    @PluginMethod
    public void borrar(PluginCall call) {
        long hasta = call.getLong("hasta", 0L);
        int quedan;
        synchronized (EscuchaService.CANDADO) {
            SharedPreferences p = prefs();
            JSONArray viejos = EscuchaService.leerLista(p);
            JSONArray lista = new JSONArray();
            for (int i = 0; i < viejos.length(); i++) {
                JSONObject t = viejos.optJSONObject(i);
                if (t != null && t.optLong("fin", 0L) > hasta) lista.put(t);
            }
            p.edit().putString(EscuchaService.LISTA, lista.toString()).apply();
            quedan = lista.length();
        }
        JSObject r = new JSObject();
        r.put("quedan", quedan);
        call.resolve(r);
    }

    /** Borra todo: los tramos cerrados y lo que estaba abierto. */
    @PluginMethod
    public void borrarTodo(PluginCall call) {
        synchronized (EscuchaService.CANDADO) {
            prefs().edit().putString(EscuchaService.LISTA, "[]").putString(EscuchaService.ABIERTOS, "{}").apply();
        }
        call.resolve();
    }
}
