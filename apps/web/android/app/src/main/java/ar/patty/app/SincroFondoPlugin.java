package ar.patty.app;

import android.content.Intent;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.contract.ActivityResultContract;
import androidx.health.connect.client.HealthConnectClient;
import androidx.health.connect.client.PermissionController;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;
import java.util.Set;

/**
 * Lo que la web le cuenta a SincroFondo para mandar con Patty cerrada: a qué persona, los tokens de sus fuentes y qué
 * está prendido (los interruptores viven en la web). Y el permiso de Health Connect para leer con la app cerrada.
 */
@CapacitorPlugin(name = "SincroFondo")
public class SincroFondoPlugin extends Plugin {

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        SincroFondo.alFrente = true;
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        SincroFondo.alFrente = false;
    }

    /**
     * { persona, tokenApp, tokenSalud, salud, telefono, calendario }: lo que no viene queda como estaba; un token en
     * null se borra. Sin persona (al salir de la cuenta) se olvida todo y el trabajo se saca.
     */
    @PluginMethod
    public void configurar(PluginCall call) {
        android.content.SharedPreferences.Editor e = SincroFondo.prefs(getContext()).edit();
        Integer persona = call.getInt("persona");
        if (persona == null || persona == 0) {
            e.clear().commit();
        } else {
            e.putInt("persona", persona);
            for (String[] t : new String[][] { { "tokenApp", "token_app" }, { "tokenSalud", "token_salud" } }) {
                if (!call.getData().has(t[0])) continue;
                String v = call.getString(t[0]);
                if (v == null) e.remove(t[1]);
                else e.putString(t[1], v);
            }
            for (String k : new String[] { "salud", "telefono", "calendario" }) {
                Boolean v = call.getBoolean(k);
                if (v != null) e.putBoolean(k, v);
            }
            e.commit();
        }
        SincroFondo.programar(getContext());
        JSObject r = new JSObject();
        r.put("ultima", SincroFondo.prefs(getContext()).getLong("ultima", 0L));
        call.resolve(r);
    }

    /** { disponible, dado }: si este teléfono deja leer Health Connect con la app cerrada y si ya se dio el permiso. */
    @PluginMethod
    public void permisoSalud(PluginCall call) {
        new Thread(() -> call.resolve(estado())).start();
    }

    private JSObject estado() {
        JSObject r = new JSObject();
        boolean disponible = SaludFondo.fondoDisponible(getContext());
        r.put("disponible", disponible);
        HealthConnectClient c = disponible ? SaludFondo.cliente(getContext()) : null;
        r.put("dado", c != null && SaludFondo.permisosDados(c).contains(SaludFondo.PERMISO_FONDO));
        return r;
    }

    /** Pide el permiso de leer con la app cerrada (si el teléfono lo tiene y falta). Devuelve lo mismo que permisoSalud. */
    @PluginMethod
    public void pedirPermisoSalud(PluginCall call) {
        new Thread(() -> {
            JSObject r = estado();
            if (!r.optBoolean("disponible") || r.optBoolean("dado") || getActivity() == null) {
                call.resolve(r);
                return;
            }
            getActivity().runOnUiThread(() -> {
                try {
                    ActivityResultContract<Set<String>, Set<String>> contrato = PermissionController.createRequestPermissionResultContract();
                    Intent i = contrato.createIntent(getContext(), Collections.singleton(SaludFondo.PERMISO_FONDO));
                    startActivityForResult(call, i, "alPedirSalud");
                } catch (Exception e) {
                    call.resolve(r);
                }
            });
        }).start();
    }

    @ActivityCallback
    private void alPedirSalud(PluginCall call, ActivityResult resultado) {
        if (call == null) return;
        new Thread(() -> call.resolve(estado())).start();
    }
}
