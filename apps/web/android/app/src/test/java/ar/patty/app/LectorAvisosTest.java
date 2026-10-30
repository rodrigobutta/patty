package ar.patty.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Los textos de aviso de cada app que Patty entiende (en castellano y en inglés) y los que tiene que dejar pasar.
 * Los textos son como los que muestran las apps; si una app cambia cómo avisa, se agrega acá el caso nuevo.
 */
public class LectorAvisosTest {

    private static LectorAvisos.Evento leer(String paquete, String titulo, String texto) {
        return LectorAvisos.leer(paquete, titulo, texto, false);
    }

    private static void es(LectorAvisos.Evento e, String tipo, String app, String evento) {
        assertNotNull("no se reconoció", e);
        assertEquals(tipo, e.tipo);
        assertEquals(app, e.app);
        assertEquals(evento, e.evento);
    }

    // ---- Pedidos ----

    @Test
    public void pedidosYa() {
        es(leer("com.pedidosya", "¡Tu pedido está en camino! 🛵", "Juan ya retiró tu pedido de La Parolaccia"), "pedido", "pedidosya", "en_camino");
        es(leer("com.pedidosya", "Tu repartidor está llegando", "Preparate para recibir tu pedido"), "pedido", "pedidosya", "en_camino");
        es(leer("com.pedidosya", "¡Tu pedido llegó!", "Disfrutá tu pedido"), "pedido", "pedidosya", "entregado");
        es(leer("com.pedidosya", "Pedido entregado", "Tu pedido fue entregado. ¡Buen provecho!"), "pedido", "pedidosya", "entregado");
        es(leer("com.pedidosya", "Your order is on its way", ""), "pedido", "pedidosya", "en_camino");
    }

    @Test
    public void rappiYUberEats() {
        es(leer("com.grability.rappi", "Tu Rappitendero está llegando", "Tené todo listo para recibir tu pedido"), "pedido", "rappi", "en_camino");
        es(leer("com.grability.rappi", "¡Tu pedido ha llegado!", ""), "pedido", "rappi", "entregado");
        es(leer("com.ubercab.eats", "Your order has been delivered", "Enjoy your meal!"), "pedido", "ubereats", "entregado");
        es(leer("com.ubercab.eats", "Tu pedido está en camino", "Llega 21:40 – 21:50"), "pedido", "ubereats", "en_camino");
        // Uber Eats dentro de la app de Uber.
        es(leer("com.ubercab", "Your order is on the way", "Arriving at 9:40 PM"), "pedido", "ubereats", "en_camino");
    }

    @Test
    public void promosDePedidosNo() {
        assertNull(leer("com.pedidosya", "¡Envío gratis en tu próximo pedido! 🎉", "Usá el código FINDE"));
        assertNull(leer("com.pedidosya", "¿Hambre?", "Pedí ya y te llega en 20 minutos"));
        assertNull(leer("com.grability.rappi", "50% OFF en tu pedido", "Solo por hoy"));
        assertNull(leer("com.pedidosya", "¿Cómo estuvo tu pedido?", "Calificá a La Parolaccia"));
        assertNull(leer("com.pedidosya", "Tu pedido fue confirmado", "El local ya lo está preparando"));
    }

    // ---- Viajes ----

    @Test
    public void uber() {
        es(leer("com.ubercab", "Tu conductor está llegando", "Juan llega en 3 min en un Toyota Etios gris"), "viaje", "uber", "llegando");
        es(leer("com.ubercab", "Your driver has arrived", "Meet Juan at the pickup point"), "viaje", "uber", "llegando");
        es(leer("com.ubercab", "Juan está llegando", "Toyota Etios · AB123CD"), "viaje", "uber", "llegando");
        es(LectorAvisos.leer("com.ubercab", "Rumbo a Av. Corrientes 1234", "Llegada estimada 19:05", true), "viaje", "uber", "en_viaje");
        es(leer("com.ubercab", "Gracias por viajar, Rodrigo", "Calificá tu viaje con Juan"), "viaje", "uber", "terminado");
        es(leer("com.ubercab", "How was your trip with Juan?", "Rate your driver"), "viaje", "uber", "terminado");
        assertNull(leer("com.ubercab", "Uber One", "Ahorrá en todos tus viajes con Uber One"));
        assertNull(leer("com.ubercab", "20% off en tus próximos 3 viajes", "Usá el código VIAJA"));
    }

    @Test
    public void cabifyYDidi() {
        es(leer("com.cabify.rider", "Tu Cabify ha llegado", "Tu conductora te está esperando"), "viaje", "cabify", "llegando");
        es(leer("com.cabify.rider", "Has llegado a tu destino", "¿Qué tal fue? Valorá tu viaje"), "viaje", "cabify", "terminado");
        es(leer("com.didiglobal.passenger", "Tu conductor está en camino", "Llega en 5 min"), "viaje", "didi", "llegando");
        es(leer("com.didiglobal.passenger", "Viaje finalizado", "Total: $4.500"), "viaje", "didi", "terminado");
    }

    // ---- Ejercicio ----

    @Test
    public void strava() {
        LectorAvisos.Evento e = leer("com.strava", "Carrera matutina guardada", "5,2 km · 28:14");
        es(e, "ejercicio", "strava", "terminado");
        assertEquals("correr", e.deporte);
        assertEquals(5.2, e.km, 0.001);
        assertEquals(Integer.valueOf(28), e.minutos);

        e = leer("com.strava", "Afternoon Ride uploaded", "32.4 km · 1:12:40");
        assertEquals("bici", e.deporte);
        assertEquals(32.4, e.km, 0.001);
        assertEquals(Integer.valueOf(73), e.minutos);

        // Lo que no es una actividad propia terminada.
        assertNull(leer("com.strava", "Juan gave you kudos", "on Morning Run · 5.2 km"));
        assertNull(leer("com.strava", "Morning Run", "Grabando · 2,1 km · 12:03"));
        assertNull(LectorAvisos.leer("com.strava", "Carrera guardada", "5 km", true));
        assertNull(leer("com.strava", "Nuevo desafío", "Completá 50 km en octubre"));
    }

    @Test
    public void otrasApps() {
        LectorAvisos.Evento e = leer("com.nike.plusgps", "Great run!", "You ran 3.1 mi in 31:05");
        assertEquals("correr", e.deporte);
        assertEquals(4.99, e.km, 0.01);
        assertEquals(Integer.valueOf(31), e.minutos);

        e = leer("com.sec.android.app.shealth", "Ejercicio registrado", "Caminata · 45 min · 3,8 km");
        assertEquals("caminata", e.deporte);
        assertEquals(Integer.valueOf(45), e.minutos);

        e = leer("com.garmin.android.apps.connectmobile", "Activity saved", "Strength · 1 h 5 min");
        assertEquals("gym", e.deporte);
        assertEquals(Integer.valueOf(65), e.minutos);

        e = leer("com.runtastic.android", "¡Buen trabajo!", "Terminaste tu entrenamiento de natación: 40 minutos");
        assertEquals("natacion", e.deporte);
        assertEquals(Integer.valueOf(40), e.minutos);

        e = leer("com.google.android.apps.fitness", "Workout completed", "Yoga · 30 min");
        assertEquals("yoga", e.deporte);

        assertNull(leer("com.google.android.apps.fitness", "¡Completaste tu objetivo!", "Recorriste 10.000 pasos"));
        assertNull(leer("com.sec.android.app.shealth", "Step goal completed", "10,000 steps"));
        assertNull(leer("com.garmin.android.apps.connectmobile", "Sincronización", "Tu reloj se sincronizó"));
    }

    @Test
    public void minutosSinHoraDelDia() {
        // Una hora del día suelta no es lo que duró.
        assertNull(LectorAvisos.minutos(LectorAvisos.normal("Entrenamiento a las 7:30"), false));
        assertEquals(Integer.valueOf(28), LectorAvisos.minutos(LectorAvisos.normal("5 km 28:14"), true));
    }

    // ---- Mensajes y otras apps ----

    @Test
    public void mensajes() {
        assertTrue(LectorAvisos.esMensaje("com.whatsapp", "msg"));
        assertTrue(LectorAvisos.esMensaje("com.whatsapp", null));
        assertFalse(LectorAvisos.esMensaje("com.whatsapp", "call"));
        assertTrue(LectorAvisos.esMensaje("com.instagram.android", "msg"));
        assertFalse(LectorAvisos.esMensaje("com.instagram.android", null));
        assertTrue(LectorAvisos.esMensaje("com.google.android.apps.messaging", "msg"));
        assertFalse(LectorAvisos.esMensaje("com.spotify.music", "msg"));
    }

    @Test
    public void otrasAppsNoSeLeen() {
        assertFalse(LectorAvisos.seLee("com.whatsapp"));
        assertFalse(LectorAvisos.seLee("com.google.android.gm"));
        assertNull(leer("com.whatsapp", "Juan", "Tu pedido llegó"));
        assertTrue(LectorAvisos.seLee("com.pedidosya"));
    }
}
