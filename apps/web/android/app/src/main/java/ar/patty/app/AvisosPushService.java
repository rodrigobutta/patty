package ar.patty.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Recibe los avisos push y los muestra siempre. Firebase solo los muestra solo si la app está en segundo plano, y
 * Patty casi nunca lo está para Android: el seguimiento de ubicación la deja "en primer plano" todo el tiempo, y
 * entonces el aviso le llega a la app, que sin la pantalla abierta no lo mostraba. Reemplaza al servicio del plugin
 * (ver AndroidManifest) y le sigue pasando el token nuevo.
 */
public class AvisosPushService extends FirebaseMessagingService {

    /** Marca en el intent de que se abrió la app tocando un aviso (MascotaPlugin se lo pasa a la web). */
    public static final String EXTRA_TOCADO = "patty_aviso_tocado";
    /** Los avisos con etiqueta (los de remedios de una persona) usan siempre este id: el nuevo reemplaza al anterior. */
    public static final int ID_CON_ETIQUETA = 1;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage m) {
        RemoteMessage.Notification n = m.getNotification();
        Map<String, String> datos = m.getData();
        String titulo = n != null && n.getTitle() != null ? n.getTitle() : datos.get("titulo");
        String cuerpo = n != null && n.getBody() != null ? n.getBody() : datos.get("cuerpo");
        if (titulo == null && cuerpo == null) return;
        String canal = n != null && n.getChannelId() != null ? n.getChannelId() : "avisos";

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(canal) == null) {
            boolean remedios = "remedios".equals(canal);
            NotificationChannel c = new NotificationChannel(
                canal,
                remedios ? "Remedios" : "Avisos",
                remedios ? NotificationManager.IMPORTANCE_HIGH : NotificationManager.IMPORTANCE_DEFAULT
            );
            c.setLockscreenVisibility(NotificationCompat.VISIBILITY_PRIVATE);
            nm.createNotificationChannel(c);
        }

        // Tocarlo abre la app (en el Día).
        Intent abrir = new Intent(this, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        for (Map.Entry<String, String> e : datos.entrySet()) abrir.putExtra(e.getKey(), e.getValue());
        abrir.putExtra(EXTRA_TOCADO, true);
        String etiqueta = datos.get("etiqueta");
        int id = etiqueta != null ? (etiqueta.hashCode() & 0x0fffffff) * 4 : (int) (System.currentTimeMillis() & 0x7fffffff);
        PendingIntent pi = PendingIntent.getActivity(this, id, abrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, canal)
            .setSmallIcon(R.drawable.ic_stat_patty)
            .setColor(0xFF6B4FBB)
            .setContentTitle(titulo)
            .setContentText(cuerpo)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(cuerpo))
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pi);
        // Con la cara del búho al costado (por ejemplo, triste en "hoy no me contaste nada").
        String cara = datos.get("cara");
        if (cara != null && cara.matches("feliz|espera|triste")) {
            int res = getResources().getIdentifier("icono_" + cara + "_frente", "mipmap", getPackageName());
            if (res != 0) {
                android.graphics.Bitmap img = android.graphics.BitmapFactory.decodeResource(getResources(), res);
                if (img != null) b.setLargeIcon(img);
            }
        }
        // Una invitación a supervisar se contesta desde el aviso: abre la app con la respuesta y la web la manda.
        if ("supervision".equals(datos.get("tipo")) && datos.get("supervision_id") != null) {
            b.addAction(0, "Aceptar", conAccion(datos, "aceptar", id, id + 1));
            b.addAction(0, "No", conAccion(datos, "rechazar", id, id + 2));
        }
        // Las tomas de remedios se contestan desde el aviso: una sola ("La tomé" / "No la tomo") o todas juntas.
        if ("toma".equals(datos.get("tipo")) && datos.get("tomas") != null && !"si".equals(datos.get("supervision"))) {
            boolean una = datos.get("tratamiento_id") != null;
            String si = datos.get("boton_tomada") != null ? datos.get("boton_tomada") : (una ? "La tomé" : "Las tomé todas");
            b.addAction(0, si, conAccion(datos, "tomada", id, id + 1));
            if (una) b.addAction(0, datos.get("boton_salteada") != null ? datos.get("boton_salteada") : "No la tomo", conAccion(datos, "salteada", id, id + 2));
        }
        try {
            if (etiqueta != null) nm.notify(etiqueta, ID_CON_ETIQUETA, b.build());
            else nm.notify(id, b.build());
        } catch (SecurityException e) {
            // Sin permiso de avisos: no hay nada que hacer.
        }
    }

    private PendingIntent conAccion(Map<String, String> datos, String accion, int aviso, int codigo) {
        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        for (Map.Entry<String, String> e : datos.entrySet()) i.putExtra(e.getKey(), e.getValue());
        i.putExtra("accion", accion);
        // Para sacar el aviso una vez contestado.
        i.putExtra("aviso_id", aviso);
        i.putExtra(EXTRA_TOCADO, true);
        return PendingIntent.getActivity(this, codigo, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }
}
