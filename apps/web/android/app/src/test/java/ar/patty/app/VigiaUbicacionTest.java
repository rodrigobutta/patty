package ar.patty.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class VigiaUbicacionTest {

    private static final long CADA = 900000L;

    @Test
    public void llamarSeguidoNoPostergaLaAlarma() {
        assertEquals(1500000L, VigiaUbicacion.proximaVuelta(1000000L, 1500000L, CADA));
    }

    @Test
    public void siYaPasoOSeReinicioElTelefonoSePoneDeNuevo() {
        assertEquals(1900000L, VigiaUbicacion.proximaVuelta(1000000L, 999000L, CADA));
        assertEquals(1900000L, VigiaUbicacion.proximaVuelta(1000000L, 0L, CADA));
        // Después de reiniciar, el reloj vuelve a cero y lo guardado queda lejísimos en el futuro.
        assertEquals(1900000L, VigiaUbicacion.proximaVuelta(1000000L, 90000000L, CADA));
    }
}
