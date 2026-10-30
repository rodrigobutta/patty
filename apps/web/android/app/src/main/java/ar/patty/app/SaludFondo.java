package ar.patty.app;

import android.content.Context;
import androidx.health.connect.client.HealthConnectClient;
import androidx.health.connect.client.HealthConnectFeatures;
import androidx.health.connect.client.aggregate.AggregateMetric;
import androidx.health.connect.client.aggregate.AggregationResult;
import androidx.health.connect.client.aggregate.AggregationResultGroupedByPeriod;
import androidx.health.connect.client.permission.HealthPermission;
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord;
import androidx.health.connect.client.records.DistanceRecord;
import androidx.health.connect.client.records.ExerciseSessionRecord;
import androidx.health.connect.client.records.HeartRateRecord;
import androidx.health.connect.client.records.Record;
import androidx.health.connect.client.records.RestingHeartRateRecord;
import androidx.health.connect.client.records.SleepSessionRecord;
import androidx.health.connect.client.records.StepsRecord;
import androidx.health.connect.client.records.WeightRecord;
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest;
import androidx.health.connect.client.request.ReadRecordsRequest;
import androidx.health.connect.client.response.ReadRecordsResponse;
import androidx.health.connect.client.time.TimeRangeFilter;
import androidx.health.connect.client.units.Energy;
import androidx.health.connect.client.units.Length;
import androidx.health.connect.client.units.Mass;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import kotlin.coroutines.EmptyCoroutineContext;
import kotlin.jvm.JvmClassMappingKt;
import kotlin.reflect.KClass;
import kotlinx.coroutines.BuildersKt;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Lo del reloj leído de Health Connect sin abrir Patty (lo usa SincroFondo): lo mismo que manda `sincronizarSalud`
 * en lib/salud.ts, con los mismos nombres, unidades y redondeos, para los últimos días: los valores de cada día, el
 * sueño de cada noche (al día en que uno se despierta) con sus etapas, los entrenamientos y las caminatas. Leer con la
 * app cerrada pide el permiso READ_HEALTH_DATA_IN_BACKGROUND (Android 14+, o Health Connect que lo tenga): sin él no
 * se lee nada y lo manda la app al abrirse, como siempre.
 */
final class SaludFondo {

    static final String PERMISO_FONDO = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND;

    private SaludFondo() {}

    /** Lo que se manda: las mediciones, las noches con sus etapas y las caminatas de cada día. */
    static final class Lectura {
        final JSONArray mediciones = new JSONArray();
        final JSONArray noches = new JSONArray();
        final JSONArray caminatas = new JSONArray();
    }

    // ---- Health Connect desde Java (sus funciones son "suspend" de Kotlin: se esperan en este hilo) ----

    @SuppressWarnings("unchecked")
    private static <T> T esperar(kotlin.jvm.functions.Function2<kotlinx.coroutines.CoroutineScope, kotlin.coroutines.Continuation<? super T>, Object> f) throws InterruptedException {
        return BuildersKt.runBlocking(EmptyCoroutineContext.INSTANCE, f);
    }

    static HealthConnectClient cliente(Context ctx) {
        try {
            if (HealthConnectClient.getSdkStatus(ctx) != HealthConnectClient.SDK_AVAILABLE) return null;
            return HealthConnectClient.getOrCreate(ctx);
        } catch (Exception e) {
            return null;
        }
    }

    /** Si este teléfono deja leer Health Connect con la app cerrada (Android 14+ o un Health Connect nuevo). */
    static boolean fondoDisponible(Context ctx) {
        HealthConnectClient c = cliente(ctx);
        if (c == null) return false;
        try {
            return c.getFeatures().getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE;
        } catch (Throwable e) {
            return false;
        }
    }

    static Set<String> permisosDados(HealthConnectClient c) {
        try {
            Set<String> s = esperar((scope, cont) -> c.getPermissionController().getGrantedPermissions(cont));
            return s != null ? s : Collections.emptySet();
        } catch (Throwable e) {
            return Collections.emptySet();
        }
    }

    private static <T extends Record> String permiso(Class<T> clase) {
        return HealthPermission.getReadPermission(JvmClassMappingKt.getKotlinClass(clase));
    }

    /** Todos los registros de un tipo entre dos instantes (de a páginas). */
    private static <T extends Record> List<T> leer(HealthConnectClient c, Class<T> clase, Instant desde, Instant hasta, int limite) throws InterruptedException {
        KClass<T> k = JvmClassMappingKt.getKotlinClass(clase);
        List<T> r = new ArrayList<>();
        String pagina = null;
        do {
            ReadRecordsRequest<T> pedido = new ReadRecordsRequest<>(k, TimeRangeFilter.between(desde, hasta), Collections.emptySet(), true, 1000, pagina);
            ReadRecordsResponse<T> resp = esperar((scope, cont) -> c.readRecords(pedido, cont));
            r.addAll(resp.getRecords());
            pagina = resp.getPageToken();
        } while (pagina != null && !pagina.isEmpty() && r.size() < limite);
        return r;
    }

    // ---- Lo de cada día ----

    private static double r1(double n) {
        return Math.round(n * 10) / 10.0;
    }

    private static double redondear(double n, int d) {
        double f = Math.pow(10, d);
        return Math.round(n * f) / f;
    }

    private static JSONObject medicion(String concepto, String categoria, String unidad, double valor, Instant desde, Instant hasta) {
        JSONObject m = new JSONObject();
        try {
            m.put("concepto", concepto);
            m.put("categoria", categoria);
            m.put("unidad", unidad == null ? JSONObject.NULL : unidad);
            m.put("valor", valor);
            m.put("inicio", desde.toString());
            m.put("fin", hasta.toString());
        } catch (Exception e) {
            // No pasa: son textos y números.
        }
        return m;
    }

    /** Un agregado por día, como AGREGADOS en salud.ts (los que Health Connect deja agregar). */
    private interface Valor {
        Double de(AggregationResult r);
    }

    private static final class Agregado {
        final Class<? extends Record> clase;
        final AggregateMetric<?> metrica;
        final boolean suma;
        final String concepto;
        final String categoria;
        final String unidad;
        final int decimales;
        final Valor valor;

        Agregado(Class<? extends Record> clase, AggregateMetric<?> metrica, boolean suma, String concepto, String categoria, String unidad, int decimales, Valor valor) {
            this.clase = clase;
            this.metrica = metrica;
            this.suma = suma;
            this.concepto = concepto;
            this.categoria = categoria;
            this.unidad = unidad;
            this.decimales = decimales;
            this.valor = valor;
        }
    }

    private static Double largo(Object o) {
        return o instanceof Number ? ((Number) o).doubleValue() : null;
    }

    private static List<Agregado> agregados() {
        List<Agregado> l = new ArrayList<>();
        l.add(new Agregado(StepsRecord.class, StepsRecord.COUNT_TOTAL, true, "Pasos", "actividad", "pasos", 0, r -> largo(r.get(StepsRecord.COUNT_TOTAL))));
        l.add(new Agregado(DistanceRecord.class, DistanceRecord.DISTANCE_TOTAL, true, "Km caminados", "actividad", "km", 1, r -> {
            Length x = r.get(DistanceRecord.DISTANCE_TOTAL);
            return x == null ? null : x.getMeters() / 1000;
        }));
        l.add(new Agregado(ActiveCaloriesBurnedRecord.class, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, true, "Calorías activas", "actividad", "kcal", 0, r -> {
            Energy x = r.get(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL);
            return x == null ? null : x.getKilocalories();
        }));
        l.add(new Agregado(HeartRateRecord.class, HeartRateRecord.BPM_AVG, false, "Pulso promedio", "otro", "lpm", 0, r -> largo(r.get(HeartRateRecord.BPM_AVG))));
        l.add(new Agregado(HeartRateRecord.class, HeartRateRecord.BPM_MAX, false, "Pulso máximo", "otro", "lpm", 0, r -> largo(r.get(HeartRateRecord.BPM_MAX))));
        l.add(new Agregado(HeartRateRecord.class, HeartRateRecord.BPM_MIN, false, "Pulso mínimo", "otro", "lpm", 0, r -> largo(r.get(HeartRateRecord.BPM_MIN))));
        l.add(new Agregado(RestingHeartRateRecord.class, RestingHeartRateRecord.BPM_AVG, false, "Pulso en reposo", "otro", "lpm", 0, r -> largo(r.get(RestingHeartRateRecord.BPM_AVG))));
        l.add(new Agregado(WeightRecord.class, WeightRecord.WEIGHT_AVG, false, "Peso", "otro", "kg", 1, r -> {
            Mass x = r.get(WeightRecord.WEIGHT_AVG);
            return x == null ? null : x.getKilograms();
        }));
        return l;
    }

    /**
     * Lee los últimos `dias` días (el de hoy incluido). Null si no hay Health Connect o falta el permiso de leer con la
     * app cerrada.
     */
    static Lectura leer(Context ctx, int dias) {
        HealthConnectClient c = cliente(ctx);
        if (c == null) return null;
        Set<String> dados = permisosDados(c);
        if (!dados.contains(PERMISO_FONDO)) return null;
        ZoneId zona = ZoneId.systemDefault();
        LocalDate hoy = LocalDate.now(zona);
        LocalDate primero = hoy.minusDays(dias - 1);
        Instant desde = primero.atStartOfDay(zona).toInstant();
        Instant hasta = hoy.plusDays(1).atStartOfDay(zona).toInstant();
        Lectura r = new Lectura();

        for (Agregado a : agregados()) {
            if (!dados.contains(permiso(a.clase))) continue;
            try {
                Set<AggregateMetric<?>> metricas = new HashSet<>();
                metricas.add(a.metrica);
                AggregateGroupByPeriodRequest pedido = new AggregateGroupByPeriodRequest(
                    metricas,
                    TimeRangeFilter.between(primero.atStartOfDay(), hoy.plusDays(1).atStartOfDay()),
                    Period.ofDays(1),
                    Collections.emptySet()
                );
                List<AggregationResultGroupedByPeriod> grupos = esperar((scope, cont) -> c.aggregateGroupByPeriod(pedido, cont));
                for (AggregationResultGroupedByPeriod g : grupos) {
                    Double v = a.valor.de(g.getResult());
                    if (v == null || v.isNaN() || v.isInfinite() || (a.suma && v == 0)) continue;
                    LocalDateTime ini = g.getStartTime();
                    Instant d = ini.atZone(zona).toInstant();
                    Instant h = ini.toLocalDate().plusDays(1).atStartOfDay(zona).toInstant();
                    r.mediciones.put(medicion(a.concepto, a.categoria, a.unidad, redondear(v, a.decimales), d, h));
                }
            } catch (Throwable e) {
                // Ese dato no está en este teléfono: se sigue con los demás.
            }
        }

        if (dados.contains(permiso(SleepSessionRecord.class))) {
            try {
                List<SleepSessionRecord> sesiones = leer(c, SleepSessionRecord.class, desde.minusSeconds(12 * 3600), hasta, 500);
                for (LocalDate dia = primero; !dia.isAfter(hoy); dia = dia.plusDays(1)) {
                    Instant d = dia.atStartOfDay(zona).toInstant();
                    Instant h = dia.plusDays(1).atStartOfDay(zona).toInstant();
                    List<SleepSessionRecord> noche = new ArrayList<>();
                    for (SleepSessionRecord s : sesiones) if (!s.getEndTime().isBefore(d) && s.getEndTime().isBefore(h)) noche.add(s);
                    if (noche.isEmpty()) continue;
                    for (JSONObject m : resumenDeSueno(noche, zona, d, h)) r.mediciones.put(m);
                    JSONObject n = new JSONObject();
                    n.put("noche", dia.toString());
                    n.put("etapas", etapasDeLaNoche(noche));
                    r.noches.put(n);
                }
            } catch (Throwable e) {
                // Sin sueño.
            }
        }

        if (dados.contains(permiso(ExerciseSessionRecord.class))) {
            try {
                List<ExerciseSessionRecord> ws = leer(c, ExerciseSessionRecord.class, desde, hasta, 200);
                for (LocalDate dia = primero; !dia.isAfter(hoy); dia = dia.plusDays(1)) {
                    Instant d = dia.atStartOfDay(zona).toInstant();
                    Instant h = dia.plusDays(1).atStartOfDay(zona).toInstant();
                    double minutos = 0;
                    int n = 0;
                    for (ExerciseSessionRecord w : ws) {
                        if (w.getStartTime().isBefore(d) || !w.getStartTime().isBefore(h)) continue;
                        minutos += (w.getEndTime().toEpochMilli() - w.getStartTime().toEpochMilli()) / 60000.0;
                        n++;
                    }
                    if (n == 0) continue;
                    r.mediciones.put(medicion("Minutos de ejercicio", "actividad", "min", Math.round(minutos), d, h));
                    r.mediciones.put(medicion("Entrenamientos", "actividad", null, n, d, h));
                }
            } catch (Throwable e) {
                // Sin entrenamientos.
            }
        }

        if (dados.contains(permiso(StepsRecord.class))) {
            try {
                List<StepsRecord> pasos = leer(c, StepsRecord.class, desde, hasta, 5000);
                for (LocalDate dia = primero; !dia.isAfter(hoy); dia = dia.plusDays(1)) {
                    Instant d = dia.atStartOfDay(zona).toInstant();
                    Instant h = dia.plusDays(1).atStartOfDay(zona).toInstant();
                    List<long[]> muestras = new ArrayList<>();
                    for (StepsRecord p : pasos) {
                        if (p.getStartTime().isBefore(d) || !p.getStartTime().isBefore(h)) continue;
                        muestras.add(new long[] { p.getStartTime().toEpochMilli(), p.getEndTime().toEpochMilli(), p.getCount() });
                    }
                    JSONObject x = new JSONObject();
                    x.put("fecha", dia.toString());
                    x.put("caminatas", caminatasDe(muestras));
                    r.caminatas.put(x);
                }
            } catch (Throwable e) {
                // Sin muestras de pasos.
            }
        }
        return r;
    }

    // ---- El sueño (lo mismo que resumenDeSueno y etapasDeLaNoche de salud.ts) ----

    private static String etapa(int tipo) {
        if (tipo == SleepSessionRecord.STAGE_TYPE_AWAKE || tipo == SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED) return "awake";
        if (tipo == SleepSessionRecord.STAGE_TYPE_SLEEPING) return "asleep";
        if (tipo == SleepSessionRecord.STAGE_TYPE_LIGHT) return "light";
        if (tipo == SleepSessionRecord.STAGE_TYPE_DEEP) return "deep";
        if (tipo == SleepSessionRecord.STAGE_TYPE_REM) return "rem";
        return null;
    }

    private static final Map<String, String> NOMBRE_ETAPA = new HashMap<>();

    static {
        NOMBRE_ETAPA.put("awake", "despierto");
        NOMBRE_ETAPA.put("light", "ligero");
        NOMBRE_ETAPA.put("deep", "profundo");
        NOMBRE_ETAPA.put("rem", "rem");
        NOMBRE_ETAPA.put("asleep", "dormido");
    }

    /** Los minutos de esas etapas (enteros, como el plugin), o null si la sesión no trae etapas. */
    private static Double minutosDe(SleepSessionRecord s, Set<String> etapas) {
        boolean hay = false;
        double t = 0;
        for (SleepSessionRecord.Stage e : s.getStages()) {
            String n = etapa(e.getStage());
            if (n == null) continue;
            hay = true;
            if (etapas.contains(n)) t += (e.getEndTime().toEpochMilli() - e.getStartTime().toEpochMilli()) / 60000;
        }
        return hay ? t : null;
    }

    private static Set<String> conjunto(String... x) {
        return new HashSet<>(java.util.Arrays.asList(x));
    }

    static double horaComoNumero(Instant i, ZoneId zona, boolean despuesDeMedianoche) {
        ZonedDateTime z = i.atZone(zona);
        double h = z.getHour() + z.getMinute() / 60.0;
        return r1(despuesDeMedianoche && h < 12 ? h + 24 : h);
    }

    static List<JSONObject> resumenDeSueno(List<SleepSessionRecord> sesiones, ZoneId zona, Instant d, Instant h) {
        List<SleepSessionRecord> orden = new ArrayList<>(sesiones);
        orden.sort((a, b) -> a.getStartTime().compareTo(b.getStartTime()));
        SleepSessionRecord principal = orden.get(0);
        for (SleepSessionRecord s : orden) {
            long dur = s.getEndTime().toEpochMilli() - s.getStartTime().toEpochMilli();
            long durP = principal.getEndTime().toEpochMilli() - principal.getStartTime().toEpochMilli();
            if (dur > durP) principal = s;
        }
        double total = 0;
        for (SleepSessionRecord s : orden) {
            Double dormido = minutosDe(s, conjunto("asleep", "light", "deep", "rem"));
            total += dormido != null ? dormido : (s.getEndTime().toEpochMilli() - s.getStartTime().toEpochMilli()) / 60000.0;
        }
        List<JSONObject> r = new ArrayList<>();
        r.add(medicion("Horas de sueño", "sueno", "h", r1(total / 60), d, h));
        r.add(medicion("Hora de dormir", "sueno", "hora", horaComoNumero(principal.getStartTime(), zona, true), d, h));
        r.add(medicion("Hora de despertar", "sueno", "hora", horaComoNumero(principal.getEndTime(), zona, false), d, h));
        String[][] etapas = { { "Sueño profundo", "deep" }, { "Sueño REM", "rem" }, { "Despierto en la noche", "awake" } };
        for (String[] x : etapas) {
            Double m = null;
            for (SleepSessionRecord s : orden) {
                Double v = minutosDe(s, conjunto(x[1]));
                if (v != null) m = (m == null ? 0 : m) + v;
            }
            if (m != null) r.add(medicion(x[0], "sueno", "min", Math.round(m), d, h));
        }
        return r;
    }

    static JSONArray etapasDeLaNoche(List<SleepSessionRecord> sesiones) throws Exception {
        TreeMap<String, List<JSONObject>> orden = new TreeMap<>();
        for (SleepSessionRecord s : sesiones) {
            boolean con = false;
            for (SleepSessionRecord.Stage e : s.getStages()) {
                String n = etapa(e.getStage());
                if (n == null) continue;
                con = true;
                poner(orden, e.getStartTime(), e.getEndTime(), NOMBRE_ETAPA.get(n));
            }
            if (!con) poner(orden, s.getStartTime(), s.getEndTime(), "dormido");
        }
        JSONArray r = new JSONArray();
        for (List<JSONObject> l : orden.values()) for (JSONObject o : l) r.put(o);
        return r;
    }

    private static void poner(TreeMap<String, List<JSONObject>> orden, Instant ini, Instant fin, String etapa) throws Exception {
        JSONObject o = new JSONObject();
        o.put("inicio", ini.toString());
        o.put("fin", fin.toString());
        o.put("etapa", etapa);
        orden.computeIfAbsent(ini.toString(), k -> new ArrayList<>()).add(o);
    }

    // ---- Caminatas (lo mismo que caminatasDe de salud.ts) ----

    private static final int CAMINATA_MIN = 10;
    private static final int PASOS_POR_MIN = 60;
    private static final int CORTE_MIN = 4;

    /** muestras: [inicio ms, fin ms, pasos]. */
    static JSONArray caminatasDe(List<long[]> muestras) throws Exception {
        Map<Long, Double> porMinuto = new HashMap<>();
        for (long[] m : muestras) {
            long a = Math.floorDiv(m[0], 60000L);
            long b = Math.max(a + 1, (long) Math.ceil(m[1] / 60000.0));
            double cada = (double) m[2] / (b - a);
            for (long x = a; x < b; x++) porMinuto.put(x, porMinuto.getOrDefault(x, 0.0) + cada);
        }
        List<Long> minutos = new ArrayList<>();
        for (Map.Entry<Long, Double> e : porMinuto.entrySet()) if (e.getValue() >= PASOS_POR_MIN) minutos.add(e.getKey());
        Collections.sort(minutos);
        JSONArray r = new JSONArray();
        long ini = -1, fin = -1;
        double pasos = 0;
        for (long x : minutos) {
            if (ini >= 0 && x - fin <= CORTE_MIN) {
                for (long y = fin + 1; y <= x; y++) pasos += porMinuto.getOrDefault(y, 0.0);
                fin = x;
                continue;
            }
            cerrar(r, ini, fin, pasos);
            ini = x;
            fin = x;
            pasos = porMinuto.getOrDefault(x, 0.0);
        }
        cerrar(r, ini, fin, pasos);
        return r;
    }

    private static void cerrar(JSONArray r, long ini, long fin, double pasos) throws Exception {
        if (ini < 0 || fin - ini + 1 < CAMINATA_MIN) return;
        JSONObject o = new JSONObject();
        o.put("inicio", Instant.ofEpochMilli(ini * 60000).toString());
        o.put("fin", Instant.ofEpochMilli((fin + 1) * 60000).toString());
        o.put("pasos", Math.round(pasos));
        r.put(o);
    }
}
