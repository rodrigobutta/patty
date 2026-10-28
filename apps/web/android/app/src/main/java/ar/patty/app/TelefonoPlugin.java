package ar.patty.app;

import android.Manifest;
import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.provider.CallLog;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Datos del teléfono que Patty usa para buscar patrones (solo Android: el iPhone no los deja leer).
 * - Tiempo de uso por app entre dos instantes (permiso "Acceso a datos de uso", se da en Ajustes).
 * - Llamadas entre dos instantes: cuántas entrantes, salientes y perdidas, y los segundos hablados. No se leen números
 *   ni nombres.
 * - Las reuniones del calendario del teléfono (todas las cuentas sincronizadas: Google, Outlook, Exchange…): cuándo
 *   empiezan y terminan y cuánta gente hay. Nunca títulos, lugares ni invitados.
 */
@CapacitorPlugin(
    name = "Telefono",
    permissions = {
        @Permission(alias = "llamadas", strings = { Manifest.permission.READ_CALL_LOG }),
        @Permission(alias = "calendario", strings = { Manifest.permission.READ_CALENDAR }),
    }
)
public class TelefonoPlugin extends Plugin {

    // ---- Tiempo de uso ----

    private boolean tienePermisoUso() {
        AppOpsManager ops = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
        int modo = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName());
        return modo == AppOpsManager.MODE_ALLOWED;
    }

    @PluginMethod
    public void permisos(PluginCall call) {
        JSObject r = new JSObject();
        r.put("uso", tienePermisoUso() ? "granted" : "denied");
        r.put("llamadas", getPermissionState("llamadas") == PermissionState.GRANTED ? "granted" : "denied");
        r.put("calendario", getPermissionState("calendario") == PermissionState.GRANTED ? "granted" : "denied");
        call.resolve(r);
    }

    /** Abre la pantalla de Ajustes donde se habilita "Acceso a datos de uso" para Patty. */
    @PluginMethod
    public void pedirPermisoUso(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        i.setData(Uri.parse("package:" + getContext().getPackageName()));
        try {
            getActivity().startActivity(i);
        } catch (Exception e) {
            // Algunos teléfonos no aceptan ir directo a la app: se abre la lista.
            getActivity().startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
        }
        call.resolve();
    }

    /** Las apps que no cuentan como "uso": el escritorio del teléfono y la interfaz del sistema. */
    private Set<String> ignoradas() {
        Set<String> s = new HashSet<>();
        s.add("com.android.systemui");
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        for (ResolveInfo ri : getContext().getPackageManager().queryIntentActivities(home, 0)) s.add(ri.activityInfo.packageName);
        return s;
    }

    private String nombreDeApp(String paquete) {
        PackageManager pm = getContext().getPackageManager();
        try {
            ApplicationInfo ai = pm.getApplicationInfo(paquete, 0);
            return pm.getApplicationLabel(ai).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return paquete;
        }
    }

    /**
     * Minutos en primer plano de cada app entre `desde` y `hasta` (milisegundos). Se calcula con los eventos de
     * abrir y cerrar cada pantalla, así un día cuenta solo lo de ese día (los resúmenes de Android mezclan días).
     */
    @PluginMethod
    public void uso(PluginCall call) {
        if (!tienePermisoUso()) {
            call.reject("Falta el permiso de acceso a datos de uso.", "SIN_PERMISO");
            return;
        }
        long desde = call.getLong("desde", 0L);
        long hasta = call.getLong("hasta", System.currentTimeMillis());
        UsageStatsManager usm = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
        UsageEvents eventos = usm.queryEvents(desde, hasta);
        Set<String> fuera = ignoradas();
        Map<String, Long> abiertoDesde = new HashMap<>();
        Map<String, Long> total = new HashMap<>();
        UsageEvents.Event e = new UsageEvents.Event();
        while (eventos.hasNextEvent()) {
            eventos.getNextEvent(e);
            String p = e.getPackageName();
            int tipo = e.getEventType();
            if (tipo == UsageEvents.Event.ACTIVITY_RESUMED) {
                if (!abiertoDesde.containsKey(p)) abiertoDesde.put(p, e.getTimeStamp());
            } else if (tipo == UsageEvents.Event.ACTIVITY_PAUSED || tipo == UsageEvents.Event.ACTIVITY_STOPPED) {
                Long ini = abiertoDesde.remove(p);
                if (ini != null) total.put(p, total.getOrDefault(p, 0L) + (e.getTimeStamp() - ini));
            } else if (tipo == UsageEvents.Event.SCREEN_NON_INTERACTIVE || tipo == UsageEvents.Event.DEVICE_SHUTDOWN) {
                // Pantalla apagada: se cierra todo lo que estaba abierto.
                for (Map.Entry<String, Long> a : abiertoDesde.entrySet())
                    total.put(a.getKey(), total.getOrDefault(a.getKey(), 0L) + (e.getTimeStamp() - a.getValue()));
                abiertoDesde.clear();
            }
        }
        // Lo que sigue abierto cuenta hasta el final del período (o hasta ahora).
        long fin = Math.min(hasta, System.currentTimeMillis());
        for (Map.Entry<String, Long> a : abiertoDesde.entrySet())
            total.put(a.getKey(), total.getOrDefault(a.getKey(), 0L) + Math.max(0, fin - a.getValue()));

        JSArray apps = new JSArray();
        long suma = 0;
        for (Map.Entry<String, Long> t : total.entrySet()) {
            if (fuera.contains(t.getKey()) || t.getValue() < 1000) continue;
            suma += t.getValue();
            JSObject a = new JSObject();
            a.put("paquete", t.getKey());
            a.put("nombre", nombreDeApp(t.getKey()));
            a.put("minutos", t.getValue() / 60000.0);
            apps.put(a);
        }
        JSObject r = new JSObject();
        r.put("apps", apps);
        r.put("minutos", suma / 60000.0);
        call.resolve(r);
    }

    // ---- Llamadas ----

    @PluginMethod
    public void pedirPermisoLlamadas(PluginCall call) {
        if (getPermissionState("llamadas") == PermissionState.GRANTED) permisos(call);
        else requestPermissionForAlias("llamadas", call, "alPedirLlamadas");
    }

    @PermissionCallback
    private void alPedirLlamadas(PluginCall call) {
        permisos(call);
    }

    // ---- Calendario ----

    @PluginMethod
    public void pedirPermisoCalendario(PluginCall call) {
        if (getPermissionState("calendario") == PermissionState.GRANTED) permisos(call);
        else requestPermissionForAlias("calendario", call, "alPedirCalendario");
    }

    @PermissionCallback
    private void alPedirCalendario(PluginCall call) {
        permisos(call);
    }

    /**
     * Los eventos del calendario entre `desde` y `hasta` (las repeticiones ya abiertas): inicio, fin, si es de todo el
     * día, si figura como ocupado, si lo rechazó y cuántos invitados tiene, y el tipo de cuenta. Sin títulos ni nombres.
     */
    @PluginMethod
    public void eventos(PluginCall call) {
        if (getPermissionState("calendario") != PermissionState.GRANTED) {
            call.reject("Falta el permiso para leer el calendario.", "SIN_PERMISO");
            return;
        }
        long desde = call.getLong("desde", 0L);
        long hasta = call.getLong("hasta", System.currentTimeMillis());
        Uri.Builder b = android.provider.CalendarContract.Instances.CONTENT_URI.buildUpon();
        android.content.ContentUris.appendId(b, desde);
        android.content.ContentUris.appendId(b, hasta);
        String[] columnas = {
            android.provider.CalendarContract.Instances.EVENT_ID,
            android.provider.CalendarContract.Instances.BEGIN,
            android.provider.CalendarContract.Instances.END,
            android.provider.CalendarContract.Instances.ALL_DAY,
            android.provider.CalendarContract.Instances.AVAILABILITY,
            android.provider.CalendarContract.Instances.SELF_ATTENDEE_STATUS,
            android.provider.CalendarContract.Instances.ACCOUNT_TYPE,
            android.provider.CalendarContract.Instances.VISIBLE,
        };
        JSArray lista = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(b.build(), columnas, null, null, android.provider.CalendarContract.Instances.BEGIN)) {
            while (c != null && c.moveToNext()) {
                if (c.getInt(7) == 0) continue; // calendarios ocultos
                long evento = c.getLong(0);
                JSObject e = new JSObject();
                e.put("inicio", c.getLong(1));
                e.put("fin", c.getLong(2));
                e.put("todoElDia", c.getInt(3) == 1);
                e.put("libre", c.getInt(4) == android.provider.CalendarContract.Events.AVAILABILITY_FREE);
                e.put("rechazado", c.getInt(5) == android.provider.CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED);
                e.put("cuenta", c.getString(6));
                e.put("invitados", invitados(evento));
                lista.put(e);
            }
        } catch (SecurityException ex) {
            call.reject("Falta el permiso para leer el calendario.", "SIN_PERMISO");
            return;
        }
        JSObject r = new JSObject();
        r.put("eventos", lista);
        call.resolve(r);
    }

    /** Cuántas personas hay invitadas a un evento (sin sus datos). */
    private int invitados(long evento) {
        try (Cursor c = android.provider.CalendarContract.Attendees.query(getContext().getContentResolver(), evento, new String[] { android.provider.CalendarContract.Attendees._ID })) {
            return c == null ? 0 : c.getCount();
        } catch (Exception ex) {
            return 0;
        }
    }

    /** Cuántas llamadas hubo entre `desde` y `hasta` y cuántos segundos se habló. */
    @PluginMethod
    public void llamadas(PluginCall call) {
        if (getPermissionState("llamadas") != PermissionState.GRANTED) {
            call.reject("Falta el permiso para leer las llamadas.", "SIN_PERMISO");
            return;
        }
        long desde = call.getLong("desde", 0L);
        long hasta = call.getLong("hasta", System.currentTimeMillis());
        int entrantes = 0, salientes = 0, perdidas = 0;
        long segundos = 0;
        String[] columnas = { CallLog.Calls.TYPE, CallLog.Calls.DURATION };
        try (
            Cursor c = getContext()
                .getContentResolver()
                .query(
                    CallLog.Calls.CONTENT_URI,
                    columnas,
                    CallLog.Calls.DATE + " >= ? AND " + CallLog.Calls.DATE + " < ?",
                    new String[] { String.valueOf(desde), String.valueOf(hasta) },
                    null
                )
        ) {
            while (c != null && c.moveToNext()) {
                int tipo = c.getInt(0);
                long dur = c.getLong(1);
                if (tipo == CallLog.Calls.INCOMING_TYPE || tipo == CallLog.Calls.ANSWERED_EXTERNALLY_TYPE) entrantes++;
                else if (tipo == CallLog.Calls.OUTGOING_TYPE) salientes++;
                else if (tipo == CallLog.Calls.MISSED_TYPE || tipo == CallLog.Calls.REJECTED_TYPE) perdidas++;
                segundos += dur;
            }
        }
        JSObject r = new JSObject();
        r.put("entrantes", entrantes);
        r.put("salientes", salientes);
        r.put("perdidas", perdidas);
        r.put("segundos", segundos);
        call.resolve(r);
    }
}
