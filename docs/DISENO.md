# Patty: diseño

Patty es una app para anotar el día de una persona (sueño, comidas, baño, actividad, llamadas, pantalla, clima, dolores,
ánimo…) y descubrir qué cosas se relacionan: "cuando comés tomate, a los dos días te duele la cabeza".

Está armada con la misma base que la app nueva de Quincho (Node + TypeScript + Postgres, React + Vite, login con
usuario y clave o Google, roles, IA de Anthropic, Railway con Dockerfile, PWA que se actualiza sola), pero es una app
aparte, con su propia base.

## La idea central: conceptos y registros

Todo lo que se anota es un **registro** de un **concepto**.

- El **concepto** es el catálogo: `Tomate`, `Dolor de cabeza`, `Llamadas`, `Me levanté`, `Temperatura`. Pertenece a una
  **categoría** (Comida, Dolores y molestias, …) y tiene un **tipo de valor**:

  | tipo | qué se anota | ejemplo |
  |---|---|---|
  | `evento` | solo que pasó | comí tomate |
  | `cantidad` | un número con unidad | 3 vasos de agua, 5 llamadas |
  | `intensidad` | de 0 a 10 | dolor de cabeza 4 |
  | `duracion` | minutos | caminé 30 min |
  | `hora` | un momento del día | me levanté 7:10 |
  | `medida` | un valor medido, en general de un sensor | 28 °C, 8000 pasos |

- El **registro** es cada vez que pasó: persona, concepto, hora de inicio (y fin), valor o intensidad, nota.

### El nombre es la clave para la persona, el id para la base

- La persona escribe "tomat", "tomates" o "TOMÁTE" y Patty sugiere `Tomate`. Si no existe, lo crea ahí mismo
  (`POST /api/conceptos` devuelve el existente si ya está: es idempotente).
- Internamente cada concepto tiene un id entero y `nombre_norm` (sin tildes, minúsculas, espacios prolijos), único dentro
  de su categoría. El autocompletar usa un índice de trigramas (`pg_trgm`) sobre `nombre_norm`, así encuentra prefijos,
  palabras sueltas ("cabeza") y errores de tipeo ("dolr de cabesa"), ordenando por coincidencia y por cuánto se usa.
- **Alias**: otros nombres del mismo concepto. Renombrar deja el nombre viejo como alias.
- **Unir**: si quedaron dos nombres para lo mismo (`Tomate` y `Tomates`), se unen: los registros pasan al que queda y el
  otro nombre queda como alias.
- `padre_id` permite agrupar (`Tomate` dentro de `Verduras`) para que, más adelante, el análisis mire también el grupo.

### El día de Patty va de 5 a 5

"Me acosté a la 1:30" es de la noche anterior. Cada registro guarda el instante (`timestamptz`) y además su `fecha`:
el día de la persona en su zona horaria, empezando a las 5 de la mañana. "A los dos días" se cuenta en esos días.

## Datos de relojes, teléfono y clima

- Cada dispositivo es una **fuente** de una persona, con su propio token (se muestra una sola vez; se guarda el hash).
- `POST /api/ingesta` con `Authorization: Bearer patty_…` y `{ "mediciones": [{ "concepto": "Pasos", "inicio": "…", "valor": 8123 }] }`.
  El concepto se busca por nombre (o se crea como `medida`). Mandar lo mismo dos veces no duplica (clave única persona +
  concepto + inicio + fuente: se actualiza el valor).
- Las mediciones van a su propia tabla (`mediciones`), separada de lo anotado a mano, porque son muchas más filas.
- **Clima automático**: cada vez que se anota algo, y al abrir Patty (como mucho una vez por hora, todas las horas de
  las últimas 48), el teléfono pide su ubicación y llama a `POST /api/clima`
  (`persona_id`, `lat`, `lon`, `inicios`). La API le pide a [Open-Meteo](https://open-meteo.com) (gratis, sin clave) el
  clima de cada hora y guarda Temperatura, Sensación térmica, Humedad, Punto de rocío, Lluvia (mm), Presión (hPa), Nubosidad, Viento, Ráfagas,
  Índice UV, Visibilidad, Radiación solar, Minutos de sol y, de la API de aire, Calidad del aire (AQI), PM2.5, PM10,
  Ozono y Dióxido de nitrógeno como mediciones de la fuente
  «Clima automático» de la persona (se crea sola). Una lectura por hora y persona: si ya está, no se vuelve a pedir. Lo
  anotado hace más de 48 h no lleva clima (la ubicación de ahora no dice dónde estaba). La ubicación no se guarda y a
  Open-Meteo va con 2 decimales (~1 km). Se apaga por dispositivo en Más.
- **Clima del día** (`clima/resumenDiario.ts`): cada vez que llega clima se recalcula, por día, un resumen en la fuente
  «Clima del día»: máxima, mínima, media y amplitud, sensación y humedad medias, punto de rocío, nubosidad de día
  (solo las horas con radiación solar), horas de sol, radiación de día, UV máximo, lluvia del día y horas con lluvia,
  viento medio y ráfaga máxima, presión media y cuánto cambió, visibilidad mínima y calidad del aire. Los patrones usan
  estos y no las horas (el promedio de las horas mezcla la noche con el día): `climaPorHoraParaPatrones` saca los
  conceptos horarios y completa el resumen de días viejos que no lo tengan. En el Día se ve el resumen en vez de las
  horas.
- **Ubicación y lugares** (apagado por defecto, se prende por dispositivo en Más):
  - Con Patty abierta, la web sigue la ubicación (`watchPosition`, se corta al ocultarse) y manda un punto a
    `POST /api/ubicacion` solo si es el primero del día, si se movió más de 1 km o si entró o salió de un lugar con
    nombre (`puntoNuevo`, en shared; la API vuelve a filtrar). Una PWA **no puede** seguir la ubicación con la app
    cerrada o la pantalla apagada (ni iOS ni Android lo permiten). Para eso: un atajo del teléfono (iPhone: Atajos →
    Automatización «al llegar / al salir») que manda `{ lat, lon }` a `POST /api/ingesta/ubicacion` con el token de una
    fuente, y más adelante la app nativa con ubicación en segundo plano.
  - Tabla `puntos`: coordenadas redondeadas a 4 decimales (~11 m), se borran solas a los 90 días.
  - Tabla `lugares` (Casa, Supermercado…: centro y radio, 150 m de entrada). Cada lugar es un concepto de la categoría
    «Lugares y salidas» (rol causa, tipo duración).
  - Con los puntos de cada día se recalculan las mediciones de la fuente «Ubicación»: «Viajes» (tramos de más de 1 km),
    «Km recorridos» (en línea recta entre puntos) y una por estadía en un lugar (concepto del lugar, minutos, con la
    hora de llegada). Al crear, mover o borrar un lugar se recalculan todos los días que todavía tienen puntos.
    Lógica pura en `apps/api/src/ubicacion/resumen.ts`.
  - En el motor, las estadías tienen hora (para el orden dentro del día) pero son `automatica`: un día con solo
    ubicación no cuenta como día anotado (si no, parecería un día sin dolores).
  - Borrar el historial (Más) borra puntos y lo calculado; los lugares quedan.
- **App nativa** (Capacitor 8, `apps/web/android` y `apps/web/ios`; cómo correrla en el README): abre la web desde
  `server.url` (Railway, o el Vite de la Mac en desarrollo), así que es el mismo código y la misma sesión con cookie;
  lo empaquetado es solo la pantalla de "sin conexión" (`apps/web/movil/local`). `lib/nativo.ts` dice si está adentro.
  - La app crea sola una fuente «App de Android» / «App de iPhone» (tipo `telefono`) y guarda su token en el teléfono
    (`lib/fuenteApp.ts`): con él manda lo que junta sin la web a la vista.
  - Ubicación con la app cerrada: plugin `@capgo/background-geolocation` (servicio en primer plano en Android, con
    notificación fija; modo de fondo `location` en iOS). Cada punto (como mucho cada 2 min y 100 m) lo manda el código
    nativo directo a `POST /api/ingesta/ubicacion`, que también acepta su formato (`latitude`, `longitude`, `time`).
    Android no deja arrancarlo con la app en segundo plano: si hace falta, espera a que vuelva a estar a la vista.
  - Datos del teléfono (solo Android, plugin propio `TelefonoPlugin.java`): minutos en primer plano de cada app
    (eventos de UsageStats, permiso «Acceso a datos de uso» que se da en Ajustes) y llamadas (entrantes + salientes,
    perdidas y minutos; nunca números ni nombres; permiso `READ_CALL_LOG`). Se prende en Más; al abrir Patty (como
    mucho cada 30 min) manda los últimos 7 días calendario a `POST /api/ingesta`: «Tiempo de pantalla», «Uso de
    <app>» (si pasó 5 min en el día), «Llamadas», «Llamadas perdidas», «Minutos en llamadas». Mandar de nuevo un día
    actualiza el valor.
- En el Día, debajo de lo anotado, se ve lo que llegó solo ese día (`GET /api/registros/automaticos`): un grupo por
  fuente y una línea por concepto (el clima, rango del día; la lluvia, el total; los minutos, en horas y minutos).
- **Cantidades**: la primera vez que se anota un concepto de comida, bebida o medicación se pregunta si lleva cantidad
  y en qué unidad (`UNIDADES_SUGERIDAS`: unidades, porciones, vasos, litros, pastillas… u otra). Lo elegido queda en
  el concepto (`tipo_valor` cantidad + `unidad`, o evento si dijo que no) y `cantidad_decidida` evita volver a
  preguntar; desde ahí, al anotarlo se pide "¿Cuántos vasos?".
- En el Día, lo que llegó solo va en un renglón por fuente (teléfono, ubicación, clima) con lo principal
  (`resumenDelGrupo`); al tocarlo se abre con todo.
- **Festejo** (`mascota/Festejo.tsx`, `festejar` en el estado): al anotar algo la mascota aparece un momento, salta
  y suelta chispitas; si lo anotado es que la persona está mal, acompaña con otra cara. Después de contestar
  "¿cómo te sentís ahora?" la pregunta desaparece del Día por 3 horas; tocando la mascota de arriba se abre cuando sea.
- **Entrada y bienvenida**: la pantalla de entrar tiene al búho saludando con un globito, fondo con burbujas y cosas
  que flotan. La primera vez en cada dispositivo, después de entrar, hay una bienvenida de 3 pasos
  (`pantallas/Bienvenida.tsx`). **Google**: en la web, Google Identity Services; en la app nativa el botón web no anda,
  así que usa el inicio de sesión del teléfono (`@capgo/capacitor-social-login`) con el mismo ID de cliente web
  (`GOOGLE_CLIENT_ID`); además, en Google Cloud hace falta un cliente OAuth de tipo Android (paquete `ar.patty.app` y
  la SHA-1 de la firma) y el origen de Railway en el cliente web.
- **Contarlo con la voz**: si hay micrófono, solo el botón grande y lo que se escuchó (con un enlace "Prefiero
  escribir"). Si Patty tiene dudas ("¿cuántas porciones?"), se le contesta igual, hablando o escribiendo: la respuesta
  se suma al relato como "Aclaración" y se vuelve a ordenar todo.
- **Días anteriores**: "Contarlo" entiende "ayer", "el sábado a la noche", "anoche a las 2" y duraciones ("estuvimos 3
  horas"), y si se abre mirando otro día, eso es lo que se toma por defecto (`fecha` en `/api/registros/interpretar`).
  La propuesta muestra el día si no es el que se mira, y al guardar el Día salta a ese día.
- **El Día** se puede recorrer deslizando de costado; lo anotado va como línea de tiempo por partes del día (mañana,
  tarde, noche) con lo más reciente arriba; entra animado, lo recién anotado aparece con un destello, y mientras carga
  hay renglones que brillan.
- **Editar** (`pantallas/Editar.tsx`): tocando algo del Día se cambia la hora, la cantidad o los minutos, la intensidad
  (o la carita) y la nota; el concepto no (se borra y se anota de nuevo). La tele mueve sus partes juntas.
- En el Día, con la IA andando, el botón grande **«Contale a Patty»** abre "Contarlo" y empieza a escuchar al toque.
- **Dictar** en "Contarlo" (`lib/voz.ts`): si el servidor tiene `OPENAI_API_KEY` (`sesion.voz`), Patty graba el audio
  (MediaRecorder) y `POST /api/voz` lo pasa a texto con OpenAI (`gpt-4o-transcribe`): anda en cualquier teléfono sin
  instalar nada. Si no, usa el reconocedor del teléfono (`@capgo/capacitor-speech-recognition`) o Web Speech. El texto
  aparece mientras se habla y al terminar se ordena solo con la IA; la persona revisa y anota.
- **Tele** (pestaña «📺 Tele» al anotar, `pantallas/Tele.tsx`): tipo de contenido, cuánto tiempo y canal o plataforma
  (los ya usados primero). Se guardan tres duraciones en «Pantalla y redes»: «Tele» (total, con el detalle en la nota),
  «Tele: Noticias» y «Tele en TN», para que los patrones separen tipos y canales. En el Día se ve solo «Tele» y se
  borran juntas.
- **¿Cómo te sentís?** (arriba del Día, `pantallas/Sentir.tsx`, `lib/sentir.ts`): cuatro caritas (muy bien, bien,
  mal, muy mal) que se guardan como «Cómo me siento» en Ánimo con intensidad 10, 7, 4 y 1 (más alto, mejor: el motor
  compara días buenos y malos). Muy bien y bien se guardan al toque; mal y muy mal preguntan qué pasa: síntomas (los
  que ya usó la persona y `SINTOMAS_COMUNES`), cada uno poco, bastante o mucho (intensidad 3, 6, 9), y otra cosa.
- **Algo puntual** (`pantallas/Puntuales.tsx`): debajo de las caritas, estados que no son bien ni mal (con sueño, con
  hambre, con energía, con pesadez, con ansiedad…, `ESTADOS_PUNTUALES`, u otro escrito) con poco, bastante o mucho
  (intensidad 3, 6, 9) en Ánimo. Si la pregunta está escondida, queda una línea "¿Algo puntual?" que abre la hoja.
- **Encuesta de la noche** (`lib/encuesta.ts`): «Cómo me sentí en el día», con lo mismo. Hora configurable por
  dispositivo en Más (22:00 por defecto). En la app nativa llega un aviso del teléfono (`@capacitor/local-notifications`,
  alarma exacta gracias a `USE_EXACT_ALARM`); desde esa hora hasta las 5, si no se contestó, el Día la muestra y la
  abre sola la primera vez (así anda aunque el aviso se toque agrupado o en la web, que no tiene avisos).
- **Mascota** (`apps/web/src/mascota`): un búho dibujado en SVG (`dibujo.ts`; también hay carpincho y zorro, se
  elige con `ANIMAL`) con tres caras: contenta si se anotó algo a mano hoy, esperando si lo último fue ayer o
  anteayer, triste si pasaron más días (`caraSegun`). Va en la barra y grande en el día vacío. En Android el ícono del
  teléfono cambia de cara como el de Duolingo: un `activity-alias` por cara en el manifiesto y `MascotaPlugin.java`
  deja prendido el que toca (al salir de la app y cada 2 h con WorkManager, aunque no se abra). En iPhone, por ahora,
  solo adentro de la app (cambiar el ícono muestra un aviso del sistema cada vez). Los íconos (web y Android) salen
  del mismo dibujo con `pnpm movil:iconos` (usa Google Chrome sin ventana).
- **Informe para el médico** (Más, y un botón en Descubrir → Números; `pantallas/InformeMedico.tsx`): se elige la
  última semana, el último mes o los últimos 3 meses y la API arma un PDF A4 con pdfkit (`apps/api/src/informe`:
  `datos.ts` junta, `pdf.ts` dibuja): persona (edad, sexo, condiciones), malestares con días, veces, intensidad,
  duración y parte del día, remedios con dosis y para qué (`para_registro_id` y el motivo del tratamiento),
  tratamientos con tomas, sueño, ánimo por semana, ciclo y los patrones firmes o confirmados (sin los descartados),
  con el búho (la mascota vive en `shared/src/mascota.ts`) y la aclaración de que Patty no diagnostica.
  `POST /api/informe/enlace` da un enlace con token al azar que dura 15 minutos (en memoria) y
  `GET /api/informe/pdf/<token>.pdf` lo sirve sin sesión: en la app de Android el visor no muestra ni baja PDFs, así
  que se abre en el navegador del teléfono con `Telefono.abrirAfuera` (si la app instalada es vieja, se copia el enlace).
- Próximos pasos: leer Health Connect / HealthKit (pasos, sueño, pulso) desde la app nativa.

## Cómo se buscan los patrones

1. La vista `serie_diaria` junta registros y mediciones en **una fila por persona, día y concepto** (veces, suma,
   promedio, intensidad máxima, primera hora).
2. El motor (`apps/api/src/patrones/motor.ts`, sin base de datos, probado con datos armados) arma **rasgos** por día:
   - `presente`: ese día se anotó (comió tomate, le dolió la cabeza).
   - `alto` / `bajo`: el valor del día está por encima / debajo de su mediana. Para medidas, horas (con la vuelta de la
     medianoche resuelta: acostarse a la 1:00 es "más tarde" que a las 23:00) y para intensidades que se anotan casi
     todos los días (energía, ánimo), donde "se anotó" no dice nada.
   - Solo cuentan los días en que la persona anotó algo: un día sin anotaciones no es un día "sin tomate".
3. Para cada par **causa → efecto** (según el rol de la categoría: comida o clima son causas, dolores y ánimo efectos,
   sueño y baño las dos cosas) y cada desfase de 0 a 3 días arma la tabla de 2×2:
   - `prob_con` = P(efecto en d+k | causa en d), `prob_sin` = P(efecto en d+k | sin causa en d), `lift` = cociente.
   - `p_valor`: test exacto de Fisher de una cola.
   - `q_valor`: corrección de Benjamini-Hochberg por la cantidad de pares probados (se prueban muchos: algunos salen por
     azar). En la app, los de q ≤ 0,1 se muestran como patrones; el resto queda plegado como "posibles".
   - Con desfase 0 (el mismo día) solo cuenta si la causa se anotó antes que el efecto.
   - De cada par queda el mejor desfase, y de "acostarse tarde → menos energía" / "acostarse temprano → más energía"
     queda uno solo.
   - **Patrones más finos** (cada uno se prende o apaga en Más → Qué patrones buscar; se guarda en
     `personas.patrones`, vienen prendidos, y lo apagado tampoco se muestra en la lista):
     - *Umbrales* ("Café: 3 o más → dolor de cabeza"): para lo que se cuenta (cantidad, evento, duración) y lo que se
       mide, se prueban hasta 4 cortes (por encima y por debajo de lo habitual en las medidas). Cada corte suma al
       total de pruebas del q, el elegido necesita p ≤ 0,1 / cortes probados, y la dosis tiene que importar: entre los
       días con la causa, los que llegan al corte dan el efecto más que los que no (Fisher, p ≤ 0,05). Si queda el
       umbral, el patrón simple de la misma causa y efecto sobra.
     - *Lo que protege* ("Caminar → menos dolor de panza al día siguiente"): la otra cola de Fisher, solo contra
       malestares (categoría `sintoma`) y desde el día siguiente (el mismo día se mezcla con lo contrario: con dolor no
       se sale a caminar). Sin los días en que el malestar ya estaba el día de la causa, con al menos 5 días con la
       causa y esperando ver el malestar 3 o más veces. Las medidas no lo necesitan: "menos pasos → dolor" ya lo dice.
     - *Efectos a los dos o tres días*: los desfases 2 y 3 ("a los dos días"); apagados, solo 0 y 1.
4. Con menos de 14 días anotados no se analiza.
5. La **IA** (Claude, misma cuenta que Quincho) recibe los mejores 25 candidatos con sus números y devuelve, en JSON con
   esquema: una explicación clara de cada uno con su plausibilidad (marca los que pueden ser casualidad o tener otra
   explicación), un resumen y sugerencias de qué anotar o probar. Si no hay IA, queda un texto armado por el motor.
6. Los hallazgos se guardan. La persona puede marcar "me pasa" o "no creo"; eso se respeta en los análisis siguientes.
7. **Aviso preventivo** (`patrones/preventivo.ts`): de 16 a 21 (hora de la persona), una vez por hora, se mira si hoy
   están todas las causas de un patrón firme o confirmado (no descartado ni obvio) que mira a otro día (desfase ≥ 1),
   con los mismos rasgos del motor (`rasgosDelDia`). Si sí, el búho avisa por push ("Hoy se juntaron «Comida frita» y
   «Día de calor»…"), una vez por día por efecto (si varios patrones dan el mismo efecto, el que junta más cosas), y se
   ve como tarjeta en el Día (`GET /api/preventivo`). Se apaga en Más → Avisos (`usuarios.avisar_preventivo`).

## Carga en texto libre

`POST /api/registros/interpretar`: "me levanté 7:30, desayuné café con tostadas, a las 11 me dolió la cabeza, como un 4"
→ la IA propone registros reusando los conceptos existentes (se le pasa el catálogo). No guarda nada: la persona revisa,
saca lo que no va y recién ahí se guardan (`POST /api/registros/varios`), creando los conceptos nuevos.

## Remedios y recordatorios

- `tratamientos`: un remedio (concepto de Medicación) con dosis y unidad, y cómo se toma: `cada_horas` desde la primera
  toma (`inicio`), o `horarios` fijos todos los días, o ninguno ("si hace falta", sin avisos). `fin` es hasta cuándo
  (sin fin = crónico); `terminado` corta antes.
- Las tomas programadas no se guardan: se calculan (`tomasEntre` en `shared`). En `tomas` queda solo lo que pasó con
  cada una: tomada (con su registro de medicación, origen `recordatorio`, que entra a los patrones) o salteada. Una
  que pasó sin fila es olvidada (después de `HORAS_PARA_OLVIDADA`; antes, atrasada).
- Anotar el remedio a mano o contándolo cuenta como la toma programada más cercana (±3 h), así no queda olvidada.
- Contarlo: la IA propone `tratamientos` además de registros ("paracetamol 1 g cada 8 h por 5 días"); la persona los
  revisa antes de guardar. Patty no da consejos médicos ni cambia dosis.
- Avisos (`lib/remedios.ts`, solo app nativa): se programan las tomas de la próxima semana al abrir la app y cuando
  algo cambia; uno a la hora y otro a la media hora si no se marcó. Desde el aviso: "La tomé", "En 15 min", "No la
  tomo". Canal de Android `remedios`, privado en la pantalla bloqueada. `lib/avisos.ts` tiene lo común para otros avisos.
- Push (Firebase, `push/`): la app registra su token en `dispositivos` con `avisos_hasta` (hasta cuándo programó sus
  propios recordatorios). Cada minuto el servidor revisa las tomas y manda por push solo las que el teléfono no tiene
  (un crónico y más de una semana sin abrir la app). Necesita `FIREBASE_SERVICE_ACCOUNT` en el servidor y
  `google-services.json` en `apps/web/android/app`; sin eso, todo sigue andando sin push.

## Supervisión

- `supervisiones`: un usuario pide supervisar a otro (por usuario o mail) y el otro acepta o rechaza; cualquiera la
  termina. Aceptada, la vista `accesos` le da al supervisor acceso de editor a las personas de las que el supervisado
  es dueño. Todo lo que mira "quién ve a quién" usa `accesos` (con `por_supervision` para distinguir).
- Al supervisor le llegan por push: una toma sin marcar a la hora, y a las 21 si la persona no anotó nada en el día.
  Los recordatorios de cada toma van solo a quien la toma. Le puede mandar avisos ("acordate del remedio") desde Más
  o desde el día de esa persona.
- Lo que junta solo el teléfono (ubicación, llamadas, reloj, clima) va siempre a la persona propia (`propia`), aunque
  se esté mirando a otra.

## Usuarios y acceso

- Usuarios con rol `admin`, `editor` o `lector`; el primero que entra (con clave o con Google) es administrador.
- **Personas**: de quién se anota. Cada usuario ve las personas a las que está asociado (`persona_usuarios`, con rol
  `dueno`, `editor` o `lector`); los administradores ven todas.
- Sesión con cookie en la web, y el mismo token como `Authorization: Bearer` para la app con Capacitor (que corre en
  otro origen y no puede usar la cookie).

## Compartir e invitar

- Se puede compartir una imagen de un patrón (botón en cada tarjeta de Patrones), la racha o el día completo (hoja de
  puntos), el resumen de la semana (solo los números, sin molestias ni lo que escribió Patty) y el nivel de la rueda de
  progreso. La imagen (1080 x 1350, violeta, con el búho y patty.today) se dibuja en el teléfono, en un canvas
  (`lib/tarjetaCompartir.ts`), con los textos ya traducidos y sin el nombre de la persona; antes de mandarla se ve
  cómo queda (`ui/HojaCompartir.tsx`). Los que tienen rol `lector` no ven los botones.
- Cómo se comparte (`lib/compartir.ts`): en la app nativa, plugins Share y Filesystem (la imagen va a la caché y se
  pasa al menú del teléfono; si el APK es viejo y no los tiene, se avisa que hay que actualizar); en el navegador,
  `navigator.share` con archivos; si no, se descarga.
- "Invitá a alguien" (en Más y en la hoja de compartir) manda un texto corto con `https://patty.today/?ref=<código>`.
  El código son los primeros 8 caracteres del user_id anónimo de Analytics de quien invita. La presentación mide
  `llegada_invitacion` y guarda el código; la bienvenida lo manda en `bienvenida_terminada`. También se miden
  `compartir_ver`, `compartir` (qué y cómo) e `invitar`.

## Estructura

```
apps/api        Hono + drizzle (Postgres). src/routes: una por área. src/patrones: el motor. src/ia: Claude.
apps/web        React + Vite, PWA. Pensada primero para el teléfono: pestañas abajo, botón + para anotar.
packages/shared Tipos y reglas comunes (categorías iniciales, tipos de valor, normalizar nombres).
docs/           Este documento.
```

## Pendiente / ideas

- Lectura de Salud / Health Connect desde la app nativa; íconos alternativos de la mascota en iPhone.
- Usar `padre_id` (grupos) en el análisis: "verduras → …".
- Combinaciones (tomate **y** poco sueño → dolor) y efectos de "dosis" (cuánto más café, más…).
- Recordatorios para anotar (notificaciones) y carga por voz.
- Modo sin conexión con cola de cambios, como Quincho.
- Exportar los datos (CSV) y un respaldo descargable.
- Más cosas automáticas: horas de luz y fase lunar (sin pedir nada), calidad del aire y polen (Open-Meteo Air Quality,
  gratis, con la misma ubicación del clima), sugerir lugares a partir de dónde se repiten los puntos.
