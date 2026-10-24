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
    private static final String[] CARAS = { "feliz", "espera", "triste" };
    /** Hasta cuántos días sin anotar espera; después se pone triste. */
    private static final int DIAS_ESPERANDO = 2;
    /** El día de Patty empieza a las 5 de la mañana. */
    private static final int HORA_DE_CORTE = 5;

    @Override
    public void load() {
        PeriodicWorkRequest trabajo = new PeriodicWorkRequest.Builder(Revisar.class, 2, TimeUnit.HOURS).build();
        WorkManager.getInstance(getContext()).enqueueUniquePeriodicWork("mascota", ExistingPeriodicWorkPolicy.KEEP, trabajo);
    }

    @PluginMethod
    public void anotado(PluginCall call) {
        String ultima = call.getString("ultima");
        SharedPreferences.Editor e = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        if (ultima == null) e.remove(ULTIMA);
        else e.putString(ULTIMA, ultima);
        e.apply();
        call.resolve();
    }

    /** El ícono se cambia al salir de la app: cambiarlo con la app a la vista puede cerrarla en algunos teléfonos. */
    @Override
    protected void handleOnStop() {
        ponerIcono(getContext());
    }

    static String caraDeHoy(Context ctx) {
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
            return dias <= DIAS_ESPERANDO ? "espera" : "triste";
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
