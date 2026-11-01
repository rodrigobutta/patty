package ar.patty.app;

import android.Manifest;
import android.app.ActivityManager;
import android.app.AlarmManager;
import android.app.ApplicationExitInfo;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.SystemClock;
import com.capgo.capacitor_background_geolocation.BackgroundGeolocationService;
import com.capgo.capacitor_background_geolocation.TrackerStatus;
import java.util.List;

/**
 * Que el seguimiento de la ubicación y los trabajos de fondo vuelvan solos. Algunos teléfonos (los Oppo/Realme, varias
 * veces por día) matan el proceso aunque esté en primer plano, y con él se van el servicio y la alarma; lo que vuelve solo
 * es el lector de notificaciones y algún trabajo de WorkManager. Por eso hay una sola puerta, {@link #asegurar}, y la llama
 * todo lo que revive después de una muerte: EscuchaService, los dos trabajos, el arranque del teléfono, la actualización de
 * Patty, la alarma de cada 15 minutos, el aviso silencioso del servidor (AvisosPushService) y abrir la app.
 * Lo que pasa queda anotado en la bitácora (TrackerStatus), que se ve en la administración.
 */
public class VigiaUbicacion extends BroadcastReceiver {

    static final String VIGILAR = "ar.patty.app.VIGILAR_UBICACION";
    private static final long CADA_MS = 15 * 60 * 1000L;
    /** Un latido si hace este rato que el servidor no sabe nada (un poco menos que la alarma, para que no se saltee vueltas). */
    private static final long LATIDO_MS = 14 * 60 * 1000L;
    /** Varios pueden revivir a la vez (el lector y un trabajo): con un intento alcanza. */
    private static final long ENTRE_ARRANQUES_MS = 10 * 1000L;
    /** Dónde guarda el plugin si el seguimiento está prendido (LocationStore). */
    private static final String PREFS_PLUGIN = "CapgoBackgroundGeolocationWatcher";
    private static final String PREFS = "patty_vigia";
    private static final String PROXIMA = "proxima";
    private static final String MUERTES_VISTAS = "muertes_vistas";

    private static long ultimoArranque = 0L;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String accion = intent == null ? null : intent.getAction();
        if (VIGILAR.equals(accion)) {
            if (prendido(ctx)) TrackerStatus.event(ctx, "alarma");
            asegurar(ctx, "alarma");
        } else {
            asegurar(ctx, Intent.ACTION_BOOT_COMPLETED.equals(accion) ? "arranque" : "actualizada");
        }
    }

    static boolean prendido(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS_PLUGIN, Context.MODE_PRIVATE);
        return p.getBoolean("enabled", false) && p.getString("url", null) != null;
    }

    /**
     * Deja todo como tiene que estar: los trabajos periódicos programados y, si el seguimiento está prendido, la alarma y el
     * servicio andando. Se puede llamar todas las veces que haga falta, desde cualquier lado. `origen` es quién la llamó (se
     * anota en la bitácora).
     */
    static void asegurar(Context ctx, String origen) {
        Context c = ctx.getApplicationContext();
        anotarMuertes(c);
        try {
            SincroFondo.programar(c);
            MascotaPlugin.programarRevision(c);
        } catch (Throwable e) {
            TrackerStatus.event(c, "trabajos_fallaron:" + e.getClass().getSimpleName());
        }
        if (!prendido(c)) return;
        programar(c);
        // Lo pidió el servidor porque no sabe nada del teléfono: se le contesta aunque se le haya hablado hace poco.
        long latido = "despertar".equals(origen) ? 0L : LATIDO_MS;
        if (TrackerStatus.isRunning()) {
            latidoEnOtroHilo(c, latido);
            return;
        }
        if (!tienePermiso(c)) {
            TrackerStatus.event(c, "sin_permiso:" + origen);
            return;
        }
        long ahora = SystemClock.elapsedRealtime();
        synchronized (VigiaUbicacion.class) {
            if (ultimoArranque != 0L && ahora - ultimoArranque < ENTRE_ARRANQUES_MS) return;
            ultimoArranque = ahora;
        }
        try {
            Intent s = new Intent(c, BackgroundGeolocationService.class).putExtra(TrackerStatus.EXTRA_REVIVE, true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) c.startForegroundService(s);
            else c.startService(s);
            TrackerStatus.event(c, "revivido:" + origen);
            latidoEnOtroHilo(c, latido);
        } catch (Exception e) {
            // Android 12 o más no deja arrancarlo desde acá (ForegroundServiceStartNotAllowedException): se intenta en la
            // próxima vuelta. Sin latido: para el servidor sigue callado, y eso es lo cierto.
            boolean bloqueado = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && e instanceof android.app.ForegroundServiceStartNotAllowedException;
            TrackerStatus.event(c, (bloqueado ? "bloqueado:" : "no_arranco:" + e.getClass().getSimpleName() + ":") + origen);
        }
    }

    private static void latidoEnOtroHilo(Context c, long cadaMs) {
        new Thread(() -> {
            try {
                TrackerStatus.sendHeartbeat(c, cadaMs);
            } catch (Throwable e) {
                // Sale en la próxima vuelta.
            }
        }).start();
    }

    /**
     * Sin permiso de ubicación "todo el tiempo", un servicio de ubicación arrancado desde segundo plano no puede pasar a
     * primer plano y Android cierra la app. Con la app abierta lo arranca la web.
     */
    private static boolean tienePermiso(Context c) {
        boolean ubicacion =
            c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            c.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!ubicacion) return false;
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || c.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    /** Las muertes del proceso que Android recuerda y todavía no se anotaron (motivo y descripción, con la hora en que pasó). */
    private static void anotarMuertes(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return;
        try {
            ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
            if (am == null) return;
            SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            long vistas = p.getLong(MUERTES_VISTAS, 0L);
            long hasta = vistas;
            List<ApplicationExitInfo> lista = am.getHistoricalProcessExitReasons(null, 0, 8);
            // Vienen de la más nueva a la más vieja.
            for (int i = lista.size() - 1; i >= 0; i--) {
                ApplicationExitInfo x = lista.get(i);
                if (x.getTimestamp() <= vistas) continue;
                hasta = Math.max(hasta, x.getTimestamp());
                String d = x.getDescription();
                TrackerStatus.event(c, x.getTimestamp(), "murio:" + x.getReason() + (d == null ? "" : ":" + (d.length() > 40 ? d.substring(0, 40) : d)));
            }
            if (hasta != vistas) p.edit().putLong(MUERTES_VISTAS, hasta).apply();
        } catch (Exception e) {
            // Es solo para mirar: si no se puede, no se puede.
        }
    }

    /** La próxima vuelta de la alarma, sin correrla: llamar seguido no puede ir postergándola para siempre. */
    static long proximaVuelta(long ahora, long guardada, long cada) {
        return guardada > ahora && guardada <= ahora + cada ? guardada : ahora + cada;
    }

    /** Pone la alarma (reemplaza la anterior, que una muerte pudo haber borrado). */
    static void programar(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = PendingIntent.getBroadcast(
            ctx,
            700,
            new Intent(ctx, VigiaUbicacion.class).setAction(VIGILAR),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long cuando = proximaVuelta(SystemClock.elapsedRealtime(), p.getLong(PROXIMA, 0L), CADA_MS);
        p.edit().putLong(PROXIMA, cuando).apply();
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, cuando, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, cuando, pi);
        }
    }
}
