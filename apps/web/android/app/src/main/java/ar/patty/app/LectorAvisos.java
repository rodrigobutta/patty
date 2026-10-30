package ar.patty.app;

import java.text.Normalizer;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lo que se entiende de un aviso de algunas apps, leído acá en el teléfono: el texto del aviso nunca sale de acá, solo
 * lo que se sacó de él (que llegó un pedido de PedidosYa, que terminó un viaje en Uber, que se guardó una carrera de
 * 5,2 km en Strava). Las reglas son a propósito conservadoras: si no se reconoce bien, no se anota nada.
 * No usa nada de Android para poder probarlo en la compu (LectorAvisosTest).
 */
public final class LectorAvisos {

    private LectorAvisos() {}

    /** Lo que se sacó de un aviso. tipo: pedido, viaje o ejercicio. */
    public static final class Evento {
        public final String tipo;
        public final String app;
        public final String evento;
        public String deporte;
        public Double km;
        public Integer minutos;

        Evento(String tipo, String app, String evento) {
            this.tipo = tipo;
            this.app = app;
            this.evento = evento;
        }
    }

    // ---- Apps que se miran ----

    /** De comida pedida. La app de Uber también trae los pedidos de Uber Eats. */
    static final Map<String, String> PEDIDOS = new HashMap<>();
    /** De viajes con chofer. */
    static final Map<String, String> VIAJES = new HashMap<>();
    /** De ejercicio (relojes y apps de correr). */
    static final Map<String, String> EJERCICIO = new HashMap<>();
    /** De mensajes: solo se cuentan, nunca se leen. */
    static final Map<String, String> MENSAJERIA = new HashMap<>();

    static {
        PEDIDOS.put("com.pedidosya", "pedidosya");
        PEDIDOS.put("com.grability.rappi", "rappi");
        PEDIDOS.put("com.ubercab.eats", "ubereats");
        PEDIDOS.put("com.didiglobal.food", "didifood");

        VIAJES.put("com.ubercab", "uber");
        VIAJES.put("com.ubercab.uberlite", "uber");
        VIAJES.put("com.cabify.rider", "cabify");
        VIAJES.put("com.didiglobal.passenger", "didi");
        VIAJES.put("com.xiaojukeji.didi.global.customer", "didi");

        EJERCICIO.put("com.strava", "strava");
        EJERCICIO.put("com.nike.plusgps", "nikerun");
        EJERCICIO.put("com.google.android.apps.fitness", "googlefit");
        EJERCICIO.put("com.sec.android.app.shealth", "samsunghealth");
        EJERCICIO.put("com.garmin.android.apps.connectmobile", "garmin");
        EJERCICIO.put("com.runtastic.android", "adidasrunning");
        EJERCICIO.put("com.huawei.health", "huaweihealth");
        EJERCICIO.put("com.mi.health", "mifitness");
        EJERCICIO.put("com.xiaomi.wearable", "mifitness");
        EJERCICIO.put("com.huami.watch.hmwatchmanager", "zepp");
        EJERCICIO.put("com.fitbit.FitbitMobile", "fitbit");

        MENSAJERIA.put("com.whatsapp", "whatsapp");
        MENSAJERIA.put("com.whatsapp.w4b", "whatsapp");
        MENSAJERIA.put("org.telegram.messenger", "telegram");
        MENSAJERIA.put("org.telegram.messenger.web", "telegram");
        MENSAJERIA.put("org.thunderdog.challegram", "telegram");
        MENSAJERIA.put("com.instagram.android", "instagram");
        MENSAJERIA.put("com.facebook.orca", "messenger");
        MENSAJERIA.put("com.facebook.mlite", "messenger");
        MENSAJERIA.put("org.thoughtcrime.securesms", "signal");
        MENSAJERIA.put("com.google.android.apps.messaging", "sms");
        MENSAJERIA.put("com.samsung.android.messaging", "sms");
        MENSAJERIA.put("com.android.mms", "sms");
        MENSAJERIA.put("com.android.messaging", "sms");
    }

    /** Si vale la pena leer el texto de los avisos de esta app (solo las de pedidos, viajes y ejercicio). */
    public static boolean seLee(String paquete) {
        return PEDIDOS.containsKey(paquete) || VIAJES.containsKey(paquete) || EJERCICIO.containsKey(paquete);
    }

    public static boolean esMensajeria(String paquete) {
        return MENSAJERIA.containsKey(paquete);
    }

    /**
     * Si un aviso de una app de mensajes es un mensaje: los que dicen que lo son (categoría "msg") y, en las apps que
     * casi solo avisan mensajes, los que no dicen nada. Las llamadas, las historias o los "me gusta" no cuentan.
     */
    public static boolean esMensaje(String paquete, String categoria) {
        if (!esMensajeria(paquete)) return false;
        if ("msg".equals(categoria)) return true;
        if (categoria != null) return false;
        String app = MENSAJERIA.get(paquete);
        // Instagram y Messenger avisan muchas cosas que no son mensajes: sin la categoría, no se cuentan.
        return !"instagram".equals(app) && !"messenger".equals(app);
    }

    // ---- Texto ----

    /** Minúsculas, sin tildes ni signos raros, espacios prolijos: "¡Tu pedido llegó! 🛵" → "tu pedido llego". */
    static String normal(String s) {
        if (s == null) return "";
        String t = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        t = t.toLowerCase(Locale.ROOT).replace('’', '\'');
        t = t.replaceAll("[^a-z0-9:.,'/ ]+", " ");
        return t.replaceAll("\\s+", " ").trim();
    }

    private static Pattern p(String re) {
        return Pattern.compile(re);
    }

    private static boolean hay(Pattern re, String t) {
        return re.matcher(t).find();
    }

    // Pedidos: tiene que hablar del pedido o del repartidor, y decir que llegó o que está en camino.
    private static final Pattern PEDIDO_ALGO = p("\\b(pedido|pedidos|orden|order|repartidor|repartidora|rappitendero|rappitendera|courier|delivery person|driver)\\b");
    private static final Pattern PEDIDO_ENTREGADO = p(
        "(fue entregad[oa]|ya fue entregad|entregamos tu|ha sido entregad|\\bllego\\b|ha llegado|ya esta (aca|aqui|en (la )?puerta)|esta en (la|tu) puerta"
            + "|\\bdelivered\\b|has arrived|\\barrived\\b|is here|at (the|your) door|disfruta(lo)? tu pedido|enjoy your (order|meal|food))"
    );
    private static final Pattern PEDIDO_EN_CAMINO = p(
        "(en camino|va en camino|esta llegando|esta cerca|salio a entregar|sale a entregar|retiro tu pedido|on (its|the|their) way|out for delivery|is arriving|is nearby|picked up your order)"
    );
    /** Lo que no es un pedido propio aunque lo parezca (promos, cupones, encuestas). */
    private static final Pattern PEDIDO_NO = p("(cupon|descuento|% off|\\d+ off|promo|gratis|free delivery|envio gratis|codigo|code|pedi ya|order now|califica|rate your|como estuvo|how was)");

    // Viajes: el chofer llega, el viaje empieza o termina.
    private static final Pattern VIAJE_TERMINADO = p(
        "((llegaste|has llegado|llegamos) a (tu )?destino|(viaje|trip|ride) (finalizado|terminado|completado|termino|finalizo|ha finalizado|ha terminado|ended|has ended|completed|is complete)"
            + "|gracias por viajar|thanks for (riding|traveling|travelling)|(califica|calificar|puntua|valora|rate) (tu |el |your |the )?(viaje|trip|ride|conductor|conductora|driver)"
            + "|como (estuvo|fue) tu viaje|how was your (trip|ride)|you'?ve arrived|you have arrived|you arrived)"
    );
    private static final Pattern VIAJE_EN_VIAJE = p("(en viaje|viaje en curso|rumbo a|camino a tu destino|you'?re on (your|the) way|on (your|the) trip|heading to|trip in progress|en route to)");
    private static final Pattern VIAJE_LLEGANDO = p(
        "((conductor|conductora|chofer|driver|socio|socia|tu auto|tu vehiculo|your car|your ride|tu cabify|tu didi|tu uber) .{0,20}(esta llegando|llega en|esta en camino|en camino|esta cerca|llego|ha llegado|esta afuera|esta esperando|is arriving|arriving|is on (the|their) way|is nearby|is here|has arrived|arrived|is waiting)"
            + "|(llega|llegara|arrives|arriving) (en|in) \\d+ ?min"
            + "|\\b(esta llegando|is arriving|ha llegado|has arrived|esta afuera|is outside|te esta esperando|is waiting for you)\\b)"
    );
    private static final Pattern VIAJE_NO = p("(cupon|descuento|% off|promo|codigo|code|programa tu|schedule|uber one|cabify plus|invita|invite)");

    // Ejercicio.
    private static final Pattern EJ_LISTO = p(
        "(guardad[oa]|guardaste|se guardo|subid[oa]|se subio|sincronizad[oa]|registrad[oa]|se registro|completad[oa]|completaste|terminad[oa]|terminaste|finalizad[oa]|finalizaste"
            + "|\\bsaved\\b|uploaded|synced|recorded|completed|\\bfinished\\b|great (run|ride|walk|job|workout|hike|swim)|nice (run|ride|walk|work)|well done|buen trabajo|bien hecho|felicitaciones|excelente (carrera|entrenamiento))"
    );
    private static final Pattern EJ_NO = p(
        "(objetivo|meta\\b|goal|desafio|challenge|reto\\b|recordatorio|reminder|kudos|le gusto|liked|comento|commented|segmento|segment|siguiendo|follow|te sigue|invit|premium|suscrip|subscri|oferta|promo|actualiza|update available|recorriste .* pasos|steps)"
    );
    private static final Pattern EJ_CORRER = p("\\b(run|running|runs|carrera|correr|corriste|corrida|trote|trotar|jog|jogging)\\b");
    private static final Pattern EJ_BICI = p("\\b(ride|cycling|ciclismo|bici|bicicleta|bike|biking|pedaleo|mtb|spinning)\\b");
    private static final Pattern EJ_CAMINATA = p("\\b(walk|walking|caminata|caminar|caminaste|hike|hiking|senderismo|trekking)\\b");
    private static final Pattern EJ_NATACION = p("\\b(swim|swimming|natacion|nadar|nadaste|pileta)\\b");
    private static final Pattern EJ_YOGA = p("\\b(yoga|pilates)\\b");
    private static final Pattern EJ_GYM = p("\\b(workout|entrenamiento|entrenaste|weights?|pesas|gym|gimnasio|fuerza|strength|hiit|crossfit|funcional)\\b");

    private static final Pattern KM = p("(\\d{1,3}(?:[.,]\\d{1,2})?) ?(km|kms|kilometros)\\b");
    private static final Pattern MILLAS = p("(\\d{1,3}(?:[.,]\\d{1,2})?) ?(mi|millas|miles)\\b");
    private static final Pattern H_MIN = p("(\\d{1,2}) ?(h|hs|hr|hrs|hora|horas|hour|hours) ?(\\d{1,2}) ?(m|min|mins|minutos|minutes)\\b");
    private static final Pattern SOLO_H = p("(\\d{1,2}) ?(h|hs|hr|hrs|hora|horas|hour|hours)\\b");
    private static final Pattern MIN = p("(\\d{1,3}) ?(min|mins|minutos|minutes)\\b");
    private static final Pattern RELOJ_LARGO = p("\\b(\\d{1,2}):(\\d{2}):(\\d{2})\\b");
    private static final Pattern RELOJ_CORTO = p("\\b(\\d{1,3}):(\\d{2})\\b");

    /**
     * Lee un aviso de una app conocida. `enCurso`: si es un aviso fijo (una grabación en marcha, un viaje en curso):
     * sirve para los viajes, no para el ejercicio (todavía no terminó). Devuelve null si no se reconoce nada.
     */
    public static Evento leer(String paquete, String titulo, String texto, boolean enCurso) {
        String t = (normal(titulo) + " . " + normal(texto)).trim();
        if (t.length() < 4) return null;

        // La app de Uber trae también los pedidos de Uber Eats: primero se mira si es un pedido.
        String appPedido = PEDIDOS.containsKey(paquete) ? PEDIDOS.get(paquete) : "com.ubercab".equals(paquete) ? "ubereats" : null;
        if (appPedido != null && hay(PEDIDO_ALGO, t) && !hay(PEDIDO_NO, t)) {
            boolean pedidoDeVerdad = !VIAJES.containsKey(paquete) || hay(p("\\b(pedido|orden|order|comida|food|repartidor|courier)\\b"), t);
            if (pedidoDeVerdad) {
                if (hay(PEDIDO_ENTREGADO, t)) return new Evento("pedido", appPedido, "entregado");
                if (hay(PEDIDO_EN_CAMINO, t)) return new Evento("pedido", appPedido, "en_camino");
            }
            if (!VIAJES.containsKey(paquete)) return null;
        }

        String appViaje = VIAJES.get(paquete);
        if (appViaje != null) {
            if (hay(VIAJE_NO, t)) return null;
            if (hay(VIAJE_TERMINADO, t)) return new Evento("viaje", appViaje, "terminado");
            if (hay(VIAJE_LLEGANDO, t)) return new Evento("viaje", appViaje, "llegando");
            if (hay(VIAJE_EN_VIAJE, t)) return new Evento("viaje", appViaje, "en_viaje");
            return null;
        }

        String appEj = EJERCICIO.get(paquete);
        if (appEj != null && !enCurso) {
            if (hay(EJ_NO, t) || !hay(EJ_LISTO, t)) return null;
            String deporte = deporte(t);
            Double km = km(t);
            Integer minutos = minutos(t, km != null);
            // Sin saber qué deporte, tiene que traer al menos la distancia o el tiempo.
            if (deporte == null) {
                if (km == null && minutos == null) return null;
                deporte = "ejercicio";
            }
            Evento e = new Evento("ejercicio", appEj, "terminado");
            e.deporte = deporte;
            e.km = km;
            e.minutos = minutos;
            return e;
        }
        return null;
    }

    static String deporte(String t) {
        if (hay(EJ_NATACION, t)) return "natacion";
        if (hay(EJ_BICI, t)) return "bici";
        if (hay(EJ_CORRER, t)) return "correr";
        if (hay(EJ_CAMINATA, t)) return "caminata";
        if (hay(EJ_YOGA, t)) return "yoga";
        if (hay(EJ_GYM, t)) return "gym";
        return null;
    }

    private static double numero(String s) {
        return Double.parseDouble(s.replace(',', '.'));
    }

    static Double km(String t) {
        Matcher m = KM.matcher(t);
        double v;
        if (m.find()) v = numero(m.group(1));
        else {
            m = MILLAS.matcher(t);
            if (!m.find()) return null;
            v = numero(m.group(1)) * 1.609344;
        }
        if (v <= 0 || v > 300) return null;
        return Math.round(v * 100) / 100.0;
    }

    /**
     * Los minutos que duró: "1 h 5 min", "45 min", "1:05:30" o, si además dice la distancia (la línea de números de
     * las apps: "5,2 km · 28:14"), "28:14". Una hora del día suelta ("a las 7:30") no cuenta.
     */
    static Integer minutos(String t, boolean conDistancia) {
        Integer r = null;
        Matcher m = H_MIN.matcher(t);
        if (m.find()) r = Integer.parseInt(m.group(1)) * 60 + Integer.parseInt(m.group(3));
        if (r == null) {
            m = RELOJ_LARGO.matcher(t);
            if (m.find()) r = Integer.parseInt(m.group(1)) * 60 + Integer.parseInt(m.group(2)) + (Integer.parseInt(m.group(3)) >= 30 ? 1 : 0);
        }
        if (r == null) {
            m = MIN.matcher(t);
            if (m.find()) {
                r = Integer.parseInt(m.group(1));
                Matcher h = SOLO_H.matcher(t);
                if (h.find() && h.start() < m.start()) r += Integer.parseInt(h.group(1)) * 60;
            }
        }
        if (r == null) {
            m = SOLO_H.matcher(t);
            if (m.find()) r = Integer.parseInt(m.group(1)) * 60;
        }
        if (r == null && conDistancia) {
            m = RELOJ_CORTO.matcher(t);
            if (m.find()) r = Integer.parseInt(m.group(1)) + (Integer.parseInt(m.group(2)) >= 30 ? 1 : 0);
        }
        if (r == null || r < 1 || r > 600) return null;
        return r;
    }
}
