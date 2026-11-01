package ar.patty.app;

import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;
import com.capgo.capacitor_background_geolocation.TrackerStatus;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;
import org.json.JSONArray;

/** Lo que la web le pregunta y le pide al vigía (VigiaUbicacion): cómo está todo, la excepción de batería y "asegurate". */
@CapacitorPlugin(name = "Vigia")
public class VigiaPlugin extends Plugin {

    /** Al volver a la app también: con Patty a la vista Android deja arrancar el servicio. */
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        VigiaUbicacion.asegurar(getContext(), "volver");
    }

    @PluginMethod
    public void asegurar(PluginCall call) {
        VigiaUbicacion.asegurar(getContext(), "web");
        call.resolve();
    }

    static boolean exentoDeBateria(Context c) {
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName());
    }

    /**
     * { prendido, corriendo, movimiento, ultimoPunto, bateria, sincro: { estado, algo, ultima }, bitacora: [[ms, veces, evento]] }.
     * En otro hilo: preguntarle a WorkManager espera a su base.
     */
    @PluginMethod
    public void estado(PluginCall call) {
        new Thread(() -> {
            Context c = getContext();
            JSObject r = new JSObject();
            r.put("prendido", TrackerStatus.isEnabled(c));
            r.put("corriendo", TrackerStatus.isRunning());
            r.put("movimiento", TrackerStatus.isMoving());
            r.put("ultimoPunto", TrackerStatus.lastPointAt(c));
            r.put("bateria", exentoDeBateria(c));
            JSObject sincro = new JSObject();
            sincro.put("estado", estadoTrabajo(c));
            sincro.put("algo", SincroFondo.hayAlgoParaMandar(c));
            sincro.put("ultima", SincroFondo.prefs(c).getLong("ultima", 0L));
            r.put("sincro", sincro);
            JSArray bitacora = new JSArray();
            for (String linea : TrackerStatus.events(c)) {
                String[] x = linea.split("\\|", 3);
                if (x.length < 3) continue;
                try {
                    bitacora.put(new JSONArray().put(Long.parseLong(x[0])).put(Integer.parseInt(x[1])).put(x[2]));
                } catch (NumberFormatException e) {
                    // Una línea rara no le quita valor al resto.
                }
            }
            r.put("bitacora", bitacora);
            call.resolve(r);
        }).start();
    }

    /** Cómo está el trabajo de fondo según WorkManager (null: no está programado). */
    private static String estadoTrabajo(Context c) {
        try {
            List<WorkInfo> l = WorkManager.getInstance(c).getWorkInfosForUniqueWork(SincroFondo.TRABAJO).get();
            return l.isEmpty() ? null : l.get(0).getState().name();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Abre lo más cerca posible del «Inicio automático» de la marca: ninguna app lo puede prender, y varias marcas
     * tampoco dejan abrir esa lista (ColorOS la cierra con permiso), así que se cae a Aplicaciones y a Ajustes.
     */
    @PluginMethod
    public void abrirInicioAutomatico(PluginCall call) {
        String[][] pantallas = {
            { "lista", "com.oplus.battery", "com.oplus.startupapp.view.StartupAppListActivity" },
            { "lista", "com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity" },
            { "lista", "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" },
            { "lista", "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" },
            { "lista", "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
            { "aplicaciones", "com.android.settings", "com.android.settings.Settings$AppDashboardActivity" },
        };
        for (String[] p : pantallas) {
            try {
                getActivity().startActivity(new Intent().setComponent(new ComponentName(p[1], p[2])));
                JSObject r = new JSObject();
                r.put("abierta", p[0]);
                call.resolve(r);
                return;
            } catch (ActivityNotFoundException | SecurityException e) {
                // Esta marca no la tiene o no la deja abrir: la que sigue.
            }
        }
        getActivity().startActivity(new Intent(Settings.ACTION_SETTINGS));
        JSObject r = new JSObject();
        r.put("abierta", "ajustes");
        call.resolve(r);
    }

    /** La versión del sistema: al actualizarse, ColorOS y otros pueden apagar estos ajustes sin avisar. */
    @PluginMethod
    public void versionSistema(PluginCall call) {
        JSObject r = new JSObject();
        r.put("sistema", Build.DISPLAY);
        call.resolve(r);
    }

    /** El cartel de Android para sacar a Patty de la optimización de batería. Devuelve { bateria } al volver de él. */
    @PluginMethod
    public void pedirBateria(PluginCall call) {
        Context c = getContext();
        if (exentoDeBateria(c)) {
            resolverBateria(call);
            return;
        }
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + c.getPackageName()));
            startActivityForResult(call, i, "alVolverDeBateria");
        } catch (ActivityNotFoundException e) {
            // Hay teléfonos sin ese cartel: la lista de Ajustes, y al volver se mira de nuevo.
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception e2) {
                TrackerStatus.event(c, "sin_cartel_de_bateria");
            }
            resolverBateria(call);
        }
    }

    @ActivityCallback
    private void alVolverDeBateria(PluginCall call, ActivityResult resultado) {
        if (call == null) return;
        VigiaUbicacion.asegurar(getContext(), "bateria");
        resolverBateria(call);
    }

    private void resolverBateria(PluginCall call) {
        JSObject r = new JSObject();
        r.put("bateria", exentoDeBateria(getContext()));
        call.resolve(r);
    }
}
