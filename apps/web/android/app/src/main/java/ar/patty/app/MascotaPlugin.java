package ar.patty.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * El ícono de Patty cambia de cara como el de Duolingo: contenta si se anotó algo hoy, esperando si no se anota desde
 * ayer o anteayer, triste si pasaron más días. Hay un "activity-alias" por cara en el AndroidManifest y se deja
 * prendido solo el que corresponde. La web avisa cuándo fue lo último anotado; un trabajo periódico cambia la cara
 * aunque Patty no se abra. Las mismas reglas que `caraSegun` en src/mascota/cara.ts.
 */
@CapacitorPlugin(name = "Mascota")
public class MascotaPlugin extends Plugin {

    private static final String PREFS = "mascota";
    private static final String ULTIMA = "ultima";
    private static final String[] CARAS = { "feliz", "espera", "triste", "dormida", "manana" };
    /** Si la persona cuenta todo a la noche: durante el día no la espera (ver cara.ts). */
    private static final String DE_NOCHE = "de_noche";
    /** Hasta esta hora es "recién levantado": si anotó ayer, el búho tiene cara de mañana y no de esperar. */
    private static final int HASTA_MANANA = 10 * 60;
    /** A qué hora se suele dormir (minutos desde las 0); de esa hora a las 6, el búho tiene sueño. */
    private static final String DORMIR = "dormir";
    private static final int DORMIR_POR_DEFECTO = 23 * 60;
    /** Hasta cuántos días sin anotar espera; después se pone triste. */
    private static final int DIAS_ESPERANDO = 2;
    /** El día de Patty empieza a las 5 de la mañana. */
    private static final int HORA_DE_CORTE = 5;

    @Override
    public void load() {
        PeriodicWorkRequest trabajo = new PeriodicWorkRequest.Builder(Revisar.class, 2, TimeUnit.HOURS).build();
        WorkManager.getInstance(getContext()).enqueueUniquePeriodicWork("mascota", ExistingPeriodicWorkPolicy.KEEP, trabajo);
        // Si la app se abrió tocando un aviso push (con la app cerrada).
        if (getActivity() != null) avisarAvisoTocado(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(android.content.Intent intent) {
        super.handleOnNewIntent(intent);
        avisarAvisoTocado(intent);
    }

    /** Le pasa a la web los datos del aviso push que se tocó (ver AvisosPushService), para que vaya a donde corresponde. */
    private void avisarAvisoTocado(android.content.Intent intent) {
        if (intent == null || !intent.getBooleanExtra(AvisosPushService.EXTRA_TOCADO, false)) return;
        com.getcapacitor.JSObject datos = new com.getcapacitor.JSObject();
        android.os.Bundle b = intent.getExtras();
        if (b != null) for (String k : b.keySet()) {
            Object v = b.get(k);
            if (v instanceof String) datos.put(k, (String) v);
        }
        intent.removeExtra(AvisosPushService.EXTRA_TOCADO);
        int aviso = intent.getIntExtra("aviso_id", 0);
        android.app.NotificationManager nm = (android.app.NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        String etiqueta = intent.getStringExtra("etiqueta");
        if (etiqueta != null && intent.getStringExtra("accion") != null) nm.cancel(etiqueta, AvisosPushService.ID_CON_ETIQUETA);
        else if (aviso != 0) nm.cancel(aviso);
        notifyListeners("avisoTocado", datos, true);
    }

    /**
     * Si esta compilación de la app trae Firebase (google-services.json): sin eso, registrarse para avisos push hace
     * que la app se cierre, así que la web lo pregunta antes.
     */
    @PluginMethod
    public void hayFirebase(PluginCall call) {
        Context c = getContext();
        int id = c.getResources().getIdentifier("google_app_id", "string", c.getPackageName());
        com.getcapacitor.JSObject r = new com.getcapacitor.JSObject();
        r.put("si", id != 0);
        call.resolve(r);
    }

    /** Saca los avisos push cuya etiqueta empieza con `prefijo` (los de remedios, cuando se marcan las tomas en la app). */
    @PluginMethod
    public void sacarAvisos(PluginCall call) {
        String prefijo = call.getString("prefijo", "");
        android.app.NotificationManager nm = (android.app.NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            for (android.service.notification.StatusBarNotification n : nm.getActiveNotifications()) {
                if (n.getTag() != null && n.getTag().startsWith(prefijo)) nm.cancel(n.getTag(), n.getId());
            }
        }
        call.resolve();
    }

    /**
     * La sesión de la app (la dirección de la API y el token), para que los botones de los avisos puedan anotar sin
     * abrir la app (RespuestaReceiver). Sin api, se borra (al salir de la cuenta).
     */
    @PluginMethod
    public void guardarSesion(PluginCall call) {
        SharedPreferences.Editor e = getContext().getSharedPreferences(RespuestaReceiver.PREFS, Context.MODE_PRIVATE).edit();
        String api = call.getString("api");
        if (api == null) e.clear();
        else e.putString("api", api).putString("token", call.getString("token"));
        e.apply();
        WidgetPatty.actualizar(getContext());
        call.resolve();
    }

    /** Para el widget de la pantalla de inicio: a quién se le anota y la categoría del ánimo (WidgetPatty). */
    @PluginMethod
    public void guardarWidget(PluginCall call) {
        Integer persona = call.getInt("persona_id");
        Integer categoria = call.getInt("categoria_id");
        SharedPreferences.Editor e = getContext().getSharedPreferences(WidgetPatty.PREFS, Context.MODE_PRIVATE).edit();
        if (persona == null || categoria == null) e.remove("persona_id").remove("categoria_id");
        else e.putInt("persona_id", persona).putInt("categoria_id", categoria);
        e.apply();
        WidgetPatty.actualizar(getContext());
        call.resolve();
    }

    /** Pide al lanzador que agregue el widget a la pantalla de inicio (el sistema muestra su cartel para ubicarlo). */
    @PluginMethod
    public void agregarWidget(PluginCall call) {
        android.appwidget.AppWidgetManager am = android.appwidget.AppWidgetManager.getInstance(getContext());
        com.getcapacitor.JSObject r = new com.getcapacitor.JSObject();
        boolean puede = android.os.Build.VERSION.SDK_INT >= 26 && am.isRequestPinAppWidgetSupported();
        if (puede) am.requestPinAppWidget(new ComponentName(getContext(), WidgetPatty.class), null, null);
        r.put("pedido", puede);
        call.resolve(r);
    }

    /** La marca y el modelo del teléfono (para explicar los ajustes con los menús de esa marca). */
    @PluginMethod
    public void telefono(PluginCall call) {
        com.getcapacitor.JSObject r = new com.getcapacitor.JSObject();
        r.put("marca", android.os.Build.MANUFACTURER);
        r.put("modelo", android.os.Build.MODEL);
        r.put("android", android.os.Build.VERSION.SDK_INT);
        try {
            r.put("app", getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName);
        } catch (Exception e) {
            // sin versión: no importa
        }
        call.resolve(r);
    }

    @PluginMethod
    public void anotado(PluginCall call) {
        String ultima = call.getString("ultima");
        SharedPreferences.Editor e = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        if (ultima == null) e.remove(ULTIMA);
        else e.putString(ULTIMA, ultima);
        Integer dormir = call.getInt("dormir");
        if (dormir != null) e.putInt(DORMIR, dormir);
        Boolean deNoche = call.getBoolean("deNoche");
        if (deNoche != null) e.putBoolean(DE_NOCHE, deNoche);
        e.apply();
        call.resolve();
    }

    /** El ícono se cambia al salir de la app: cambiarlo con la app a la vista puede cerrarla en algunos teléfonos. */
    @Override
    protected void handleOnStop() {
        ponerIcono(getContext());
    }

    static String caraDeHoy(Context ctx) {
        // De noche (desde la hora en que se suele dormir hasta las 6), con sueño.
        int dormir = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(DORMIR, DORMIR_POR_DEFECTO);
        Calendar ya = Calendar.getInstance();
        int minutos = ya.get(Calendar.HOUR_OF_DAY) * 60 + ya.get(Calendar.MINUTE);
        boolean noche = dormir >= 6 * 60 ? minutos >= dormir || minutos < 6 * 60 : minutos >= dormir && minutos < 6 * 60;
        if (noche) return "dormida";
        String ultima = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(ULTIMA, null);
        if (ultima == null) return "triste";
        try {
            Date d = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(ultima);
            Calendar hoy = Calendar.getInstance();
            hoy.add(Calendar.HOUR_OF_DAY, -HORA_DE_CORTE);
            Calendar ult = Calendar.getInstance();
            ult.setTime(d);
            long dias = diaNumero(hoy) - diaNumero(ult);
            if (dias <= 0) return "feliz";
            boolean reciente = dias <= DIAS_ESPERANDO;
            if (reciente && minutos < HASTA_MANANA) return "manana";
            if (dias <= 1 && ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(DE_NOCHE, false)) return "feliz";
            return reciente ? "espera" : "triste";
        } catch (ParseException e) {
            return "espera";
        }
    }

    /** Días desde 1970 de la fecha del calendario (sin importar la hora ni el horario de verano). */
    private static long diaNumero(Calendar c) {
        Calendar u = Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"));
        u.clear();
        u.set(c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH));
        return u.getTimeInMillis() / 86400000L;
    }

    static void ponerIcono(Context ctx) {
        String cara = caraDeHoy(ctx);
        // El búho del widget tiene la misma cara.
        WidgetPatty.actualizar(ctx);
        PackageManager pm = ctx.getPackageManager();
        for (String c : CARAS) {
            ComponentName alias = new ComponentName(ctx, ctx.getPackageName() + ".Icono" + Character.toUpperCase(c.charAt(0)) + c.substring(1));
            int quiero = c.equals(cara) ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
            int hay = pm.getComponentEnabledSetting(alias);
            // Al instalar todo está en "por defecto" (prendida solo la cara feliz, como dice el manifiesto).
            boolean prendido = hay == PackageManager.COMPONENT_ENABLED_STATE_ENABLED || (hay == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && c.equals("feliz"));
            if (prendido != (quiero == PackageManager.COMPONENT_ENABLED_STATE_ENABLED)) {
                pm.setComponentEnabledSetting(alias, quiero, PackageManager.DONT_KILL_APP);
            }
        }
    }

    /** Cada un par de horas, aunque Patty no se abra, revisa si el ícono tiene que cambiar de cara. */
    public static class Revisar extends Worker {

        public Revisar(Context ctx, WorkerParameters params) {
            super(ctx, params);
        }

        @Override
        public Result doWork() {
            ponerIcono(getApplicationContext());
            return Result.success();
        }
    }
}
