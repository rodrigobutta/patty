package ar.patty.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Lo que junta el teléfono llega a Patty aunque no se abra: un trabajo periódico (WorkManager, cada media hora, con
 * conexión; Android lo corre cuando le conviene a la batería) manda lo mismo que la web al abrirse, a los mismos
 * lugares y con los mismos formatos:
 * - El reloj (Health Connect): los valores de cada día, el sueño con sus etapas, entrenamientos y caminatas
 *   (SaludFondo; necesita el permiso de leer con la app cerrada).
 * - El uso de cada app, las llamadas y las llamadas por hora (TelefonoPlugin), si se prendieron los datos del teléfono.
 * - Los números del calendario, si se prendió.
 * - Lo que sonó (EscuchaService) y lo que avisan las apps (AvisosTelefono), con el acceso a las notificaciones.
 * Cada cosa respeta su interruptor: la web los copia acá (SincroFondoPlugin.configurar) al prenderlos o apagarlos,
 * junto con los tokens de sus fuentes («App de Android» y «Reloj y salud»). Mandar dos veces lo mismo no duplica en el
 * servidor. Con Patty a la vista, lo que suena y los avisos los manda la web (así no se mandan los dos a la vez).
 * Al llegar el sueño de la mañana, el servidor manda el aviso de buen día (push/buenDia.ts).
 */
public class SincroFondo extends Worker {

    static final String PREFS = "patty_fondo";
    static final String TRABAJO = "sincro-fondo";
    /** Los últimos días que se mandan cada vez (la web, al abrirse, manda la semana entera). */
    private static final int DIAS = 2;
    private static final int MINUTOS_MINIMOS_POR_APP = 5;
    private static final Pattern CUENTA_DE_TRABAJO = Pattern.compile("exchange|microsoft|outlook|office", Pattern.CASE_INSENSITIVE);

    /** Si Patty está a la vista (lo pone SincroFondoPlugin). */
    static volatile boolean alFrente = false;

    public SincroFondo(Context ctx, WorkerParameters params) {
        super(ctx, params);
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Lo programa (una sola vez: si ya estaba, sigue igual) o lo saca si no queda nada prendido. */
    static void programar(Context ctx) {
        SharedPreferences p = prefs(ctx);
        boolean algo = p.getInt("persona", 0) != 0 && (p.getBoolean("salud", false) || p.getBoolean("telefono", false) || p.getBoolean("calendario", false) || p.getString("token_app", null) != null);
        WorkManager wm = WorkManager.getInstance(ctx);
        if (!algo) {
            wm.cancelUniqueWork(TRABAJO);
            return;
        }
        Constraints c = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest t = new PeriodicWorkRequest.Builder(SincroFondo.class, 30, TimeUnit.MINUTES).setConstraints(c).build();
        wm.enqueueUniquePeriodicWork(TRABAJO, ExistingPeriodicWorkPolicy.KEEP, t);
    }

    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences p = prefs(ctx);
        String api = ctx.getSharedPreferences(RespuestaReceiver.PREFS, Context.MODE_PRIVATE).getString("api", null);
        int persona = p.getInt("persona", 0);
        // Sin sesión (salió de la cuenta) no se manda nada.
        if (api == null || persona == 0) return Result.success();
        try {
            if (p.getBoolean("salud", false)) salud(ctx, api, persona);
        } catch (Throwable e) {
            // Lo del reloj vuelve a probar la próxima vez.
        }
        try {
            telefono(ctx, api);
        } catch (Throwable e) {
            // Idem.
        }
        if (!alFrente) {
            try {
                escuchas(ctx, api);
            } catch (Throwable e) {
                // Quedan en el teléfono para la próxima.
            }
            try {
                avisos(ctx, api);
            } catch (Throwable e) {
                // Idem.
            }
        }
        p.edit().putLong("ultima", System.currentTimeMillis()).apply();
        return Result.success();
    }

    // ---- El reloj ----

    private static void salud(Context ctx, String api, int persona) throws Exception {
        String token = prefs(ctx).getString("token_salud", null);
        if (token == null) return;
        SaludFondo.Lectura l = SaludFondo.leer(ctx, DIAS);
        if (l == null) return;
        // Las etapas primero: cuando llega el sueño, el servidor arma el resumen de la noche con ellas.
        if (l.noches.length() > 0) {
            JSONObject c = new JSONObject().put("persona_id", persona).put("noches", l.noches);
            conSesion(ctx, api, "/api/sueno/etapas", c.toString());
        }
        if (l.mediciones.length() > 0) ingesta(ctx, api, "salud", "", new JSONObject().put("mediciones", l.mediciones));
        if (l.caminatas.length() > 0) {
            JSONObject c = new JSONObject().put("persona_id", persona).put("dias", l.caminatas);
            conSesion(ctx, api, "/api/actividad/caminatas", c.toString());
        }
    }

    // ---- El teléfono y el calendario (lo mismo que sincronizar() de lib/telefono.ts) ----

    private static void telefono(Context ctx, String api) throws Exception {
        SharedPreferences p = prefs(ctx);
        boolean conCalendario = p.getBoolean("calendario", false) && TelefonoPlugin.tieneCalendario(ctx);
        boolean uso = TelefonoPlugin.tienePermisoUso(ctx);
        boolean llamadas = TelefonoPlugin.tieneRegistro(ctx) || TelefonoPlugin.tieneEstado(ctx);
        boolean conTelefono = p.getBoolean("telefono", false) && (uso || llamadas);
        if (!conCalendario && !conTelefono) return;
        JSONArray lista = new JSONArray();
        JSONArray horas = new JSONArray();
        Calendar hoy = Calendar.getInstance();
        hoy.set(Calendar.HOUR_OF_DAY, 0);
        hoy.set(Calendar.MINUTE, 0);
        hoy.set(Calendar.SECOND, 0);
        hoy.set(Calendar.MILLISECOND, 0);
        JSONArray eventos = null;
        if (conCalendario) {
            Calendar desde = (Calendar) hoy.clone();
            desde.add(Calendar.DAY_OF_MONTH, -(DIAS - 1));
            Calendar hasta = (Calendar) hoy.clone();
            hasta.add(Calendar.DAY_OF_MONTH, 1);
            try {
                eventos = TelefonoPlugin.eventosEntre(ctx, desde.getTimeInMillis(), hasta.getTimeInMillis());
            } catch (SecurityException e) {
                eventos = new JSONArray();
            }
        }
        for (int i = DIAS - 1; i >= 0; i--) {
            Calendar d = (Calendar) hoy.clone();
            d.add(Calendar.DAY_OF_MONTH, -i);
            Calendar f = (Calendar) d.clone();
            f.add(Calendar.DAY_OF_MONTH, 1);
            if (eventos != null) for (JSONObject m : reunionesDelDia(d, f, eventos)) lista.put(m);
            if (!conTelefono) continue;
            JSONObject u = uso ? TelefonoPlugin.usoDeApps(ctx, d.getTimeInMillis(), f.getTimeInMillis()) : null;
            JSONObject ll = llamadas ? TelefonoPlugin.llamadasEntre(ctx, d.getTimeInMillis(), f.getTimeInMillis()) : null;
            for (JSONObject m : medicionesDelDia(d.getTimeInMillis(), f.getTimeInMillis(), u, ll)) lista.put(m);
            if (ll != null) llamadasPorHora(d, f, ll, horas);
        }
        if (lista.length() > 0) ingesta(ctx, api, "app", "", new JSONObject().put("mediciones", lista));
        if (horas.length() > 0) {
            try {
                ingesta(ctx, api, "app", "/llamadas", new JSONObject().put("horas", horas));
            } catch (Exception e) {
                // Lo demás ya llegó.
            }
        }
    }

    private static JSONObject medicion(String concepto, String categoria, String unidad, double valor, long desde, long hasta) throws Exception {
        return new JSONObject()
            .put("concepto", concepto)
            .put("categoria", categoria)
            .put("unidad", unidad == null ? JSONObject.NULL : unidad)
            .put("valor", valor)
            .put("inicio", Instant.ofEpochMilli(desde).toString())
            .put("fin", Instant.ofEpochMilli(hasta).toString());
    }

    static List<JSONObject> medicionesDelDia(long desde, long hasta, JSONObject uso, JSONObject llamadas) throws Exception {
        List<JSONObject> r = new ArrayList<>();
        if (uso != null) {
            r.add(medicion("Tiempo de pantalla", "pantalla", "min", Math.round(uso.optDouble("minutos", 0)), desde, hasta));
            JSONArray apps = uso.optJSONArray("apps");
            for (int i = 0; apps != null && i < apps.length(); i++) {
                JSONObject a = apps.getJSONObject(i);
                double m = a.optDouble("minutos", 0);
                if (m >= MINUTOS_MINIMOS_POR_APP) r.add(medicion("Uso de " + a.optString("nombre"), "pantalla", "min", Math.round(m), desde, hasta));
            }
        }
        if (llamadas != null) {
            r.add(medicion("Llamadas", "comunicacion", null, llamadas.optInt("entrantes") + llamadas.optInt("salientes"), desde, hasta));
            r.add(medicion("Llamadas perdidas", "comunicacion", null, llamadas.optInt("perdidas"), desde, hasta));
            r.add(medicion("Minutos en llamadas", "comunicacion", "min", Math.round(llamadas.optLong("segundos") / 60.0), desde, hasta));
        }
        return r;
    }

    /** Todas las horas del día, también las que no tuvieron llamadas (así se sabe que ese día se contó). */
    private static void llamadasPorHora(Calendar desde, Calendar hasta, JSONObject llamadas, JSONArray r) throws Exception {
        JSONArray ph = llamadas.optJSONArray("porHora");
        if (ph == null) return;
        Map<Long, Integer> n = new HashMap<>();
        for (int i = 0; i < ph.length(); i++) n.put(ph.getJSONObject(i).getLong("hora"), ph.getJSONObject(i).getInt("n"));
        Calendar h = (Calendar) desde.clone();
        while (h.before(hasta)) {
            r.put(new JSONObject().put("hora", h.getTimeInMillis()).put("n", n.getOrDefault(h.getTimeInMillis(), 0)));
            h.add(Calendar.HOUR_OF_DAY, 1);
        }
    }

    // ---- El calendario (lo mismo que reunionesDelDia de lib/calendario.ts) ----

    private static final long SEGUIDAS_MS = 10 * 60000L;
    private static final int HORA_ENTRADA = 8;
    private static final int HORA_SALIDA = 19;

    private static boolean esReunion(JSONObject e) {
        long dur = e.optLong("fin") - e.optLong("inicio");
        if (e.optBoolean("todoElDia") || e.optBoolean("libre") || e.optBoolean("rechazado") || dur < 5 * 60000L || dur > 8 * 3600000L) return false;
        String cuenta = e.isNull("cuenta") ? "" : e.optString("cuenta", "");
        return e.optInt("invitados") >= 2 || CUENTA_DE_TRABAJO.matcher(cuenta).find();
    }

    private static double horaDecimal(long ms) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ms);
        return Math.round((c.get(Calendar.HOUR_OF_DAY) + c.get(Calendar.MINUTE) / 60.0) * 100) / 100.0;
    }

    /** Las horas ocupadas por la unión de los tramos (dos a la vez cuentan una sola vez). */
    private static long ocupado(List<JSONObject> lista, long a, long b) {
        long ms = 0;
        long hastaAhora = a;
        for (JSONObject e : lista) {
            long i = Math.max(e.optLong("inicio"), hastaAhora);
            long f = Math.min(e.optLong("fin"), b);
            if (f > i) ms += f - i;
            hastaAhora = Math.max(hastaAhora, f);
        }
        return ms;
    }

    static List<JSONObject> reunionesDelDia(Calendar desde, Calendar hasta, JSONArray eventos) throws Exception {
        long a = desde.getTimeInMillis();
        long b = hasta.getTimeInMillis();
        List<JSONObject> del = new ArrayList<>();
        List<JSONObject> agenda = new ArrayList<>();
        for (int i = 0; i < eventos.length(); i++) {
            JSONObject e = eventos.getJSONObject(i);
            long ini = e.optLong("inicio");
            long fin = e.optLong("fin");
            if (!(fin > a && ini < b)) continue;
            if (esReunion(e)) del.add(e);
            long dur = fin - ini;
            if (!e.optBoolean("todoElDia") && !e.optBoolean("libre") && !e.optBoolean("rechazado") && dur >= 5 * 60000L && dur <= 12 * 3600000L) agenda.add(e);
        }
        del.sort((x, y) -> Long.compare(x.optLong("inicio"), y.optLong("inicio")));
        agenda.sort((x, y) -> Long.compare(x.optLong("inicio"), y.optLong("inicio")));
        int seguidas = 0;
        for (int i = 1; i < del.size(); i++) if (del.get(i).optLong("inicio") - del.get(i - 1).optLong("fin") < SEGUIDAS_MS) seguidas++;
        int dia = desde.get(Calendar.DAY_OF_WEEK);
        boolean finde = dia == Calendar.SATURDAY || dia == Calendar.SUNDAY;
        int fuera = 0;
        for (JSONObject e : del) {
            Calendar c = Calendar.getInstance();
            c.setTimeInMillis(e.optLong("inicio"));
            if (finde || c.get(Calendar.HOUR_OF_DAY) < HORA_ENTRADA || horaDecimal(e.optLong("fin")) > HORA_SALIDA) fuera++;
        }
        List<JSONObject> r = new ArrayList<>();
        r.add(medicion("Reuniones", "trabajo", null, del.size(), a, b));
        r.add(medicion("Horas de reuniones", "trabajo", "h", Math.round(ocupado(del, a, b) / 3600000.0 * 10) / 10.0, a, b));
        r.add(medicion("Eventos del calendario", "otro", null, agenda.size(), a, b));
        r.add(medicion("Horas ocupadas en el calendario", "otro", "h", Math.round(ocupado(agenda, a, b) / 3600000.0 * 10) / 10.0, a, b));
        if (!del.isEmpty()) {
            long ultima = 0;
            for (JSONObject e : del) ultima = Math.max(ultima, e.optLong("fin"));
            r.add(medicion("Reuniones seguidas", "trabajo", null, seguidas, a, b));
            r.add(medicion("Reuniones fuera de horario", "trabajo", null, fuera, a, b));
            r.add(medicion("Primera reunión", "trabajo", "hora", horaDecimal(Math.max(del.get(0).optLong("inicio"), a)), a, b));
            r.add(medicion("Última reunión", "trabajo", "hora", horaDecimal(Math.min(ultima, b)), a, b));
        }
        return r;
    }

    // ---- Lo que sonó y lo que avisan las apps (con el acceso a las notificaciones) ----

    private static void escuchas(Context ctx, String api) throws Exception {
        if (!EscuchaPlugin.tieneAcceso(ctx)) return;
        JSONObject j = EscuchaPlugin.escuchasJuntadas(ctx);
        if (!j.optBoolean("activo")) return;
        JSONArray l = j.optJSONArray("escuchas");
        if (l == null || l.length() == 0) return;
        JSONArray manda = new JSONArray();
        long hasta = Long.MIN_VALUE;
        for (int i = 0; i < l.length(); i++) {
            JSONObject t = l.getJSONObject(i);
            t.remove("duracion");
            hasta = Math.max(hasta, t.optLong("fin"));
            manda.put(t);
        }
        ingesta(ctx, api, "app", "/escuchas", new JSONObject().put("escuchas", manda));
        EscuchaPlugin.borrarEscuchas(ctx, hasta);
    }

    private static void avisos(Context ctx, String api) throws Exception {
        if (!EscuchaPlugin.tieneAcceso(ctx)) return;
        JSONObject j = EscuchaPlugin.avisosJuntados(ctx);
        JSONArray conteos = j.optJSONArray("conteos");
        JSONArray eventos = j.optJSONArray("eventos");
        if ((conteos == null || conteos.length() == 0) && (eventos == null || eventos.length() == 0)) return;
        ingesta(ctx, api, "app", "/avisos", new JSONObject().put("conteos", conteos).put("eventos", eventos));
        EscuchaPlugin.borrarAvisos(ctx, j.optLong("hasta"));
    }

    // ---- Los pedidos a la API ----

    /** A la ingesta, con el token de la fuente (`cual`: "app" o "salud"). Un 401 olvida el token (la web crea otro). */
    private static void ingesta(Context ctx, String api, String cual, String ruta, JSONObject cuerpo) throws Exception {
        String token = prefs(ctx).getString("token_" + cual, null);
        if (token == null) throw new IllegalStateException("Sin token de la fuente");
        int estado = post(api + "/api/ingesta" + ruta, "Bearer " + token, null, cuerpo.toString());
        if (estado == 401) prefs(ctx).edit().remove("token_" + cual).apply();
        if (estado < 200 || estado >= 300) throw new IllegalStateException("Error " + estado);
    }

    /** Con la sesión de la app (la cookie de la vista web o su token), como los botones de los avisos. */
    private static void conSesion(Context ctx, String api, String ruta, String cuerpo) {
        SharedPreferences s = ctx.getSharedPreferences(RespuestaReceiver.PREFS, Context.MODE_PRIVATE);
        String token = s.getString("token", null);
        String cookie = null;
        try {
            cookie = android.webkit.CookieManager.getInstance().getCookie(api);
        } catch (Throwable e) {
            // Sin vista web en este momento: queda el token, si hay.
        }
        if (token == null && cookie == null) return;
        post(api + ruta, token != null ? "Bearer " + token : null, cookie, cuerpo);
    }

    private static int post(String url, String autorizacion, String cookie, String cuerpo) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("X-Idioma", Locale.getDefault().getLanguage());
            if (autorizacion != null) c.setRequestProperty("Authorization", autorizacion);
            if (cookie != null) c.setRequestProperty("Cookie", cookie);
            try (OutputStream o = c.getOutputStream()) {
                o.write(cuerpo.getBytes(StandardCharsets.UTF_8));
            }
            return c.getResponseCode();
        } catch (Exception e) {
            return 0;
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
