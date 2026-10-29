package ar.patty.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;
import com.capgo.capacitor_background_geolocation.BackgroundGeolocationService;

/**
 * Que el seguimiento de la ubicación no se quede apagado. El servicio del plugin sigue solo con la app cerrada, pero si
 * el teléfono lo mata (algunos, como los Oppo/Realme, lo hacen), se reinicia, o se actualiza Patty, no vuelve hasta
 * abrir la app: así se perdió una tarde entera de viajes y paseos. Esto lo vuelve a levantar al prender el teléfono, al
 * actualizar Patty y, por las dudas, cada 15 minutos con una alarma (las alarmas exactas sí pueden arrancarlo desde
 * segundo plano). Solo si el seguimiento está prendido (la configuración que guarda el plugin).
 */
public class VigiaUbicacion extends BroadcastReceiver {

    static final String VIGILAR = "ar.patty.app.VIGILAR_UBICACION";
    private static final long CADA_MS = 15 * 60 * 1000L;
    /** Dónde guarda el plugin si el seguimiento está prendido (LocationStore). */
    private static final String PREFS_PLUGIN = "CapgoBackgroundGeolocationWatcher";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!prendido(ctx)) return;
        try {
            Intent s = new Intent(ctx, BackgroundGeolocationService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(s);
            else ctx.startService(s);
        } catch (Exception e) {
            // Android no dejó arrancarlo desde acá: se intenta en la próxima alarma (o al abrir Patty).
        }
        programar(ctx);
    }

    static boolean prendido(Context ctx) {
        android.content.SharedPreferences p = ctx.getSharedPreferences(PREFS_PLUGIN, Context.MODE_PRIVATE);
        return p.getBoolean("enabled", false) && p.getString("url", null) != null;
    }

    /** La próxima vuelta del vigía (reemplaza la anterior). */
    static void programar(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = PendingIntent.getBroadcast(
            ctx,
            700,
            new Intent(ctx, VigiaUbicacion.class).setAction(VIGILAR),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        long cuando = SystemClock.elapsedRealtime() + CADA_MS;
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, cuando, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, cuando, pi);
        }
    }
}
