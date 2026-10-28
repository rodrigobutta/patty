package ar.patty.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.telephony.TelephonyManager;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Plan B de las llamadas cuando no hay permiso para leer el registro: con el permiso del estado del teléfono, anota cada
 * llamada mientras pasa (cuándo empezó, si fue entrante, saliente o perdida, y cuántos segundos se habló). Nunca guarda
 * números. Solo cuenta desde que se dio el permiso; TelefonoPlugin.llamadas lo lee cuando no puede usar el registro.
 */
public class LlamadasReceiver extends BroadcastReceiver {

    static final String PREFS = "patty_llamadas";
    static final String LISTA = "llamadas";
    private static final long GUARDAR_MS = 60L * 24 * 3600 * 1000;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(intent.getAction())) return;
        String estado = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        if (estado == null) return;
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String antes = p.getString("estado", TelephonyManager.EXTRA_STATE_IDLE);
        // Android a veces manda el mismo cambio dos veces (con y sin número): el segundo no cuenta.
        if (estado.equals(antes)) return;
        long ahora = System.currentTimeMillis();
        SharedPreferences.Editor e = p.edit().putString("estado", estado);
        if (TelephonyManager.EXTRA_STATE_RINGING.equals(estado)) {
            e.putLong("inicio", ahora).putString("tipo", "entrante").putLong("atendida", 0L);
        } else if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(estado)) {
            // Desde "suena" es una entrante que se atendió; desde "libre", una que hice yo.
            if (TelephonyManager.EXTRA_STATE_IDLE.equals(antes)) e.putLong("inicio", ahora).putString("tipo", "saliente");
            e.putLong("atendida", ahora);
        } else if (TelephonyManager.EXTRA_STATE_IDLE.equals(estado)) {
            long atendida = p.getLong("atendida", 0L);
            String tipo = TelephonyManager.EXTRA_STATE_RINGING.equals(antes) ? "perdida" : p.getString("tipo", "saliente");
            long segundos = atendida > 0 && !"perdida".equals(tipo) ? (ahora - atendida) / 1000 : 0;
            anotar(p, e, p.getLong("inicio", ahora), tipo, segundos, ahora);
            e.putLong("atendida", 0L);
        }
        e.apply();
    }

    private static void anotar(SharedPreferences p, SharedPreferences.Editor e, long inicio, String tipo, long segundos, long ahora) {
        try {
            JSONArray viejas = new JSONArray(p.getString(LISTA, "[]"));
            JSONArray lista = new JSONArray();
            for (int i = 0; i < viejas.length(); i++) {
                JSONObject l = viejas.getJSONObject(i);
                if (ahora - l.getLong("inicio") < GUARDAR_MS) lista.put(l);
            }
            lista.put(new JSONObject().put("inicio", inicio).put("tipo", tipo).put("segundos", segundos));
            e.putString(LISTA, lista.toString());
        } catch (Exception ex) {
            // Si la lista se rompió, se empieza de nuevo antes que perder las que vienen.
            e.putString(LISTA, "[]");
        }
    }
}
