package ar.patty.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins propios de la app se registran antes de crear el puente.
        registerPlugin(TelefonoPlugin.class);
        registerPlugin(MascotaPlugin.class);
        registerPlugin(EscuchaPlugin.class);
        registerPlugin(SincroFondoPlugin.class);
        super.onCreate(savedInstanceState);
        // El vigía que vuelve a levantar el seguimiento de la ubicación si el teléfono lo apaga.
        VigiaUbicacion.programar(this);
    }
}
