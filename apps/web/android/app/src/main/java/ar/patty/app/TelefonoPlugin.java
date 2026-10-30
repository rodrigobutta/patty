package ar.patty.app;

import android.Manifest;
import android.app.AppOpsManager;
import android.content.ActivityNotFoundException;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.provider.CallLog;
import android.provider.Settings;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Locale;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Datos del teléfono que Patty usa para buscar patrones (solo Android: el iPhone no los deja leer).
 * - Tiempo de uso por app entre dos instantes (permiso "Acceso a datos de uso", se da en Ajustes).
 * - Llamadas entre dos instantes: cuántas entrantes, salientes y perdidas, y los segundos hablados. No se leen números
 *   ni nombres. Del registro de llamadas si hay permiso; si no, de lo que anotó LlamadasReceiver mientras pasaban (con el
 *   permiso del estado del teléfono, que Play Store no restringe).
 * - Las reuniones del calendario del teléfono (todas las cuentas sincronizadas: Google, Outlook, Exchange…): cuándo
 *   empiezan y terminan y cuánta gente hay. Nunca títulos, lugares ni invitados.
 * - Los íconos de las apps instaladas (para mostrarlos al lado del uso de cada una y de sus avisos).
 * Y, aparte, abrir un enlace en el navegador del teléfono (el PDF del informe para el médico).
 */
@CapacitorPlugin(
    name = "Telefono",
    permissions = {
        @Permission(alias = "llamadas", strings = { Manifest.permission.READ_CALL_LOG }),
        @Permission(alias = "estadoLlamadas", strings = { Manifest.permission.READ_PHONE_STATE }),
        @Permission(alias = "calendario", strings = { Manifest.permission.READ_CALENDAR }),
    }
)
public class TelefonoPlugin extends Plugin {

    // ---- Enlaces afuera de la app ----

    /**
     * Abre un enlace en el navegador del teléfono. La app abre la web de Patty adentro y ese visor no muestra ni baja
     * PDFs (y los enlaces del mismo sitio no salen solos): así el informe para el médico se ve, se guarda y se comparte.
     */
    @PluginMethod
    public void abrirAfuera(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            call.reject("Enlace inválido");
            return;
        }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No hay un navegador para abrirlo");
        }
    }

    // ---- Tiempo de uso ----
    // Lo que lee cada cosa está en métodos estáticos: los usa también SincroFondo (con Patty cerrada).

    static boolean tienePermisoUso(Context ctx) {
        AppOpsManager ops = (AppOpsManager) ctx.getSystemService(Context.APP_OPS_SERVICE);
        int modo = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.getPackageName());
        return modo == AppOpsManager.MODE_ALLOWED;
    }

    private boolean tienePermisoUso() {
        return tienePermisoUso(getContext());
    }

    @PluginMethod
    public void permisos(PluginCall call) {
        JSObject r = new JSObject();
        r.put("uso", tienePermisoUso() ? "granted" : "denied");
        r.put("llamadas", tieneRegistro() || tieneEstado() ? "granted" : "denied");
        r.put("llamadasDe", tieneRegistro() ? "registro" : tieneEstado() ? "en_vivo" : "nada");
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
    private static Set<String> ignoradas(Context ctx) {
        Set<String> s = new HashSet<>();
        s.add("com.android.systemui");
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        for (ResolveInfo ri : ctx.getPackageManager().queryIntentActivities(home, 0)) s.add(ri.activityInfo.packageName);
        return s;
    }

    private static String nombreDeApp(Context ctx, String paquete) {
        PackageManager pm = ctx.getPackageManager();
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
        call.resolve(usoDeApps(getContext(), call.getLong("desde", 0L), call.getLong("hasta", System.currentTimeMillis())));
    }

    /** { minutos, apps: [{ paquete, nombre, minutos }] } (sin revisar el permiso). */
    static JSObject usoDeApps(Context ctx, long desde, long hasta) {
        UsageStatsManager usm = (UsageStatsManager) ctx.getSystemService(Context.USAGE_STATS_SERVICE);
        UsageEvents eventos = usm.queryEvents(desde, hasta);
        Set<String> fuera = ignoradas(ctx);
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
            a.put("nombre", nombreDeApp(ctx, t.getKey()));
            a.put("minutos", t.getValue() / 60000.0);
            apps.put(a);
        }
        JSObject r = new JSObject();
        r.put("apps", apps);
        r.put("minutos", suma / 60000.0);
        return r;
    }

    // ---- Llamadas ----

    private static boolean declarado(Context ctx, String permiso) {
        try {
            String[] pedidos = ctx
                .getPackageManager()
                .getPackageInfo(ctx.getPackageName(), PackageManager.GET_PERMISSIONS)
                .requestedPermissions;
            if (pedidos != null) for (String x : pedidos) if (permiso.equals(x)) return true;
        } catch (Exception e) {
            // Sin datos del paquete: se trata como no declarado.
        }
        return false;
    }

    private static boolean dado(Context ctx, String permiso) {
        return androidx.core.content.ContextCompat.checkSelfPermission(ctx, permiso) == PackageManager.PERMISSION_GRANTED;
    }

    /** El registro de llamadas (puede no estar en el manifiesto, si Play Store no lo aprueba). */
    static boolean tieneRegistro(Context ctx) {
        return declarado(ctx, Manifest.permission.READ_CALL_LOG) && dado(ctx, Manifest.permission.READ_CALL_LOG);
    }

    static boolean tieneEstado(Context ctx) {
        return declarado(ctx, Manifest.permission.READ_PHONE_STATE) && dado(ctx, Manifest.permission.READ_PHONE_STATE);
    }

    static boolean tieneCalendario(Context ctx) {
        return dado(ctx, Manifest.permission.READ_CALENDAR);
    }

    private boolean tieneRegistro() {
        return tieneRegistro(getContext());
    }

    private boolean tieneEstado() {
        return tieneEstado(getContext());
    }

    /** Pide los dos: si se da el del registro se usa ese (tiene el historial); si no, alcanza con el del estado. */
    @PluginMethod
    public void pedirPermisoLlamadas(PluginCall call) {
        java.util.List<String> faltan = new java.util.ArrayList<>();
        if (declarado(getContext(), Manifest.permission.READ_CALL_LOG) && !tieneRegistro()) faltan.add("llamadas");
        if (declarado(getContext(), Manifest.permission.READ_PHONE_STATE) && !tieneEstado()) faltan.add("estadoLlamadas");
        if (tieneRegistro() || faltan.isEmpty()) permisos(call);
        else requestPermissionForAliases(faltan.toArray(new String[0]), call, "alPedirLlamadas");
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
        try {
            JSObject r = new JSObject();
            r.put("eventos", eventosEntre(getContext(), call.getLong("desde", 0L), call.getLong("hasta", System.currentTimeMillis())));
            call.resolve(r);
        } catch (SecurityException ex) {
            call.reject("Falta el permiso para leer el calendario.", "SIN_PERMISO");
        }
    }

    /** Los eventos entre dos instantes, como en `eventos` (sin revisar el permiso: tira SecurityException). */
    static JSArray eventosEntre(Context ctx, long desde, long hasta) {
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
            android.provider.CalendarContract.Events.ACCOUNT_TYPE,
            android.provider.CalendarContract.Instances.VISIBLE,
        };
        JSArray lista = new JSArray();
        try (Cursor c = ctx.getContentResolver().query(b.build(), columnas, null, null, android.provider.CalendarContract.Instances.BEGIN)) {
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
                e.put("invitados", invitados(ctx, evento));
                lista.put(e);
            }
        }
        return lista;
    }

    /** Cuántas personas hay invitadas a un evento (sin sus datos). */
    private static int invitados(Context ctx, long evento) {
        try (Cursor c = android.provider.CalendarContract.Attendees.query(ctx.getContentResolver(), evento, new String[] { android.provider.CalendarContract.Attendees._ID })) {
            return c == null ? 0 : c.getCount();
        } catch (Exception ex) {
            return 0;
        }
    }

    /** Cuántas llamadas hubo entre `desde` y `hasta` y cuántos segundos se habló. */
    @PluginMethod
    public void llamadas(PluginCall call) {
        JSObject r = llamadasEntre(getContext(), call.getLong("desde", 0L), call.getLong("hasta", System.currentTimeMillis()));
        if (r == null) call.reject("Falta el permiso para leer las llamadas.", "SIN_PERMISO");
        else call.resolve(r);
    }

    /**
     * { entrantes, salientes, perdidas, segundos, porHora, de }: del registro si hay permiso; si no, de lo que anotó
     * LlamadasReceiver mientras pasaban. Null sin ningún permiso.
     */
    static JSObject llamadasEntre(Context ctx, long desde, long hasta) {
        if (!tieneRegistro(ctx)) return tieneEstado(ctx) ? llamadasEnVivo(ctx, desde, hasta) : null;
        int entrantes = 0, salientes = 0, perdidas = 0;
        long segundos = 0;
        Map<Long, Integer> porHora = new HashMap<>();
        String[] columnas = { CallLog.Calls.TYPE, CallLog.Calls.DURATION, CallLog.Calls.DATE };
        try (
            Cursor c = ctx
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
                contarEnSuHora(porHora, c.getLong(2));
            }
        }
        JSObject r = new JSObject();
        r.put("porHora", porHora(porHora));
        r.put("entrantes", entrantes);
        r.put("salientes", salientes);
        r.put("perdidas", perdidas);
        r.put("segundos", segundos);
        r.put("de", "registro");
        return r;
    }

    /** Lo mismo con lo que anotó LlamadasReceiver mientras pasaban (solo desde que se dio el permiso). */
    private static JSObject llamadasEnVivo(Context ctx, long desde, long hasta) {
        int entrantes = 0, salientes = 0, perdidas = 0;
        long segundos = 0;
        Map<Long, Integer> porHora = new HashMap<>();
        try {
            org.json.JSONArray lista = new org.json.JSONArray(
                ctx.getSharedPreferences(LlamadasReceiver.PREFS, Context.MODE_PRIVATE).getString(LlamadasReceiver.LISTA, "[]")
            );
            for (int i = 0; i < lista.length(); i++) {
                org.json.JSONObject l = lista.getJSONObject(i);
                long inicio = l.getLong("inicio");
                if (inicio < desde || inicio >= hasta) continue;
                String tipo = l.getString("tipo");
                if ("entrante".equals(tipo)) entrantes++;
                else if ("saliente".equals(tipo)) salientes++;
                else perdidas++;
                segundos += l.getLong("segundos");
                contarEnSuHora(porHora, inicio);
            }
        } catch (Exception e) {
            // Lista rota: cuenta como sin llamadas.
        }
        JSObject r = new JSObject();
        r.put("porHora", porHora(porHora));
        r.put("entrantes", entrantes);
        r.put("salientes", salientes);
        r.put("perdidas", perdidas);
        r.put("segundos", segundos);
        r.put("de", "en_vivo");
        return r;
    }

    /** Suma una llamada a la hora en que empezó (la hora del teléfono, en punto). */
    private static void contarEnSuHora(Map<Long, Integer> porHora, long instante) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(instante);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        long hora = c.getTimeInMillis();
        porHora.put(hora, porHora.getOrDefault(hora, 0) + 1);
    }

    /** Solo las horas con llamadas: [{ hora, n }]. */
    private static JSArray porHora(Map<Long, Integer> porHora) {
        JSArray l = new JSArray();
        for (Map.Entry<Long, Integer> h : porHora.entrySet()) {
            JSObject o = new JSObject();
            o.put("hora", h.getKey());
            o.put("n", h.getValue());
            l.put(o);
        }
        return l;
    }

    // ---- Íconos de las apps ----

    private static String clave(String nombre) {
        return nombre == null ? "" : nombre.trim().toLowerCase(Locale.ROOT);
    }

    /**
     * El ícono de cada app pedida, como PNG chico (data URL). Se buscan por paquete si viene (`paquetes`, en el mismo
     * orden que `nombres`) y si no por el nombre que muestra el teléfono («Instagram»: el mismo con que se guardó el uso
     * de cada app). Las que no están instaladas no vuelven.
     */
    @PluginMethod
    public void iconos(PluginCall call) {
        JSArray nombres = call.getArray("nombres", new JSArray());
        JSArray paquetes = call.getArray("paquetes", new JSArray());
        int tamano = Math.max(24, Math.min(192, call.getInt("tamano", 96)));
        PackageManager pm = getContext().getPackageManager();
        // Las apps del escritorio, por su nombre (el de la app y el del acceso, por si no son iguales).
        Map<String, String> porNombre = new HashMap<>();
        Intent lanzables = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        for (ResolveInfo ri : pm.queryIntentActivities(lanzables, 0)) {
            String paquete = ri.activityInfo.packageName;
            CharSequence deLaApp = pm.getApplicationLabel(ri.activityInfo.applicationInfo);
            if (deLaApp != null && !porNombre.containsKey(clave(deLaApp.toString()))) porNombre.put(clave(deLaApp.toString()), paquete);
            CharSequence delAcceso = ri.loadLabel(pm);
            if (delAcceso != null && !porNombre.containsKey(clave(delAcceso.toString()))) porNombre.put(clave(delAcceso.toString()), paquete);
        }
        JSObject r = new JSObject();
        for (int i = 0; i < nombres.length(); i++) {
            String nombre = nombres.optString(i, "");
            if (nombre.isEmpty()) continue;
            String paquete = paquetes.optString(i, "");
            if (paquete.isEmpty() || "null".equals(paquete)) paquete = porNombre.get(clave(nombre));
            // El uso de una app sin nombre se guardó con el paquete («com.algo.app»).
            if (paquete == null && nombre.matches("[a-zA-Z0-9_]+(\\.[a-zA-Z0-9_]+)+")) paquete = nombre;
            if (paquete == null) continue;
            try {
                String png = aPng(pm.getApplicationIcon(paquete), tamano);
                if (png != null) r.put(nombre, png);
            } catch (PackageManager.NameNotFoundException e) {
                // Ya no está instalada.
            }
        }
        JSObject res = new JSObject();
        res.put("iconos", r);
        call.resolve(res);
    }

    private static String aPng(Drawable d, int tamano) {
        try {
            Bitmap b = Bitmap.createBitmap(tamano, tamano, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b);
            d.setBounds(0, 0, tamano, tamano);
            d.draw(c);
            ByteArrayOutputStream s = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.PNG, 100, s);
            b.recycle();
            return "data:image/png;base64," + Base64.encodeToString(s.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }
}
