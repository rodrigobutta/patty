// Las páginas de temas (patty.today/migranas, /dolor-de-panza, …): una por síntoma o tema que la gente busca en Google,
// con contenido de verdad en el HTML (la presentación es una app de React y Google no la lee bien). Todo el texto vive
// acá; las páginas, el sitemap y la lista "Temas" del pie de la presentación salen de este archivo (ver pagina.ts y el
// plugin en vite.config.ts). Cuidado con lo que se dice: Patty no diagnostica ni reemplaza a un profesional; se habla de
// lo que mucha gente nota, nunca de causas seguras ni de tratamientos.

export interface Tema {
  /** La ruta: patty.today/<slug>. */
  slug: string;
  /** Corto, para los links entre páginas y el pie de la presentación. */
  nombre: string;
  emoji: string;
  /** El <title> (hasta ~60 letras). */
  titulo: string;
  /** La meta description (hasta ~155 letras). */
  descripcion: string;
  h1: string;
  bajada: string;
  intro: string[];
  /** Lo que mucha gente nota antes (no son causas seguras). */
  disparadores: Array<{ titulo: string; texto: string }>;
  /** Por qué anotarlo ayuda, en este tema. */
  porQue: string;
  /** Un patrón de ejemplo como los que muestra Patty. */
  ejemplo: { emojis: string; texto: string };
  /** Qué conviene contarle a Patty para este tema. */
  anotar: string[];
  /** Cuándo consultar sin esperar. */
  cuidado: string;
  faq: Array<{ p: string; r: string }>;
  relacionados: string[];
}

export const SITIO = 'https://patty.today';

export const TEMAS: Tema[] = [
  {
    slug: 'migranas',
    nombre: 'Migrañas',
    emoji: '🤕',
    titulo: 'Migrañas: cómo descubrir qué te las dispara | Patty',
    descripcion:
      'Sueño, comidas, clima, pantallas, el ciclo: anotá tu día y descubrí qué se repite antes de tus migrañas. Un diario simple, con la voz o un toque.',
    h1: 'Migrañas: descubrí qué se repite antes de que aparezcan',
    bajada:
      'Cada persona tiene sus propios disparadores. Anotar tu día durante algunas semanas es la forma más simple de empezar a verlos.',
    intro: [
      'Si tenés migrañas seguido, seguramente ya te preguntaste "¿qué hice distinto ayer?". El problema es que la memoria falla: el día de la migraña te acordás del café de la mañana, pero no de que dormiste cinco horas dos noches antes, ni de que hacía un calor pesado y casi no tomaste agua.',
      'Por eso muchos neurólogos sugieren llevar un diario de cefaleas: anotar cuándo aparece el dolor, cuánto dura y qué pasó antes. Con datos de varias semanas, lo que parecía azar muchas veces empieza a tener forma.',
    ],
    disparadores: [
      { titulo: 'Dormir poco o a deshoras', texto: 'Una noche corta, acostarse muy tarde o dormir de más el fin de semana son de lo que más se menciona.' },
      { titulo: 'Saltear comidas', texto: 'Pasar muchas horas sin comer, o comer a horarios muy distintos de lo habitual.' },
      { titulo: 'Ciertas comidas y bebidas', texto: 'Alcohol (sobre todo vino tinto), quesos estacionados, embutidos, chocolate o mucho café. Varía muchísimo de persona a persona.' },
      { titulo: 'Clima', texto: 'Cambios bruscos de presión o de temperatura, días de humedad pesada o de viento.' },
      { titulo: 'Estrés y el "después"', texto: 'Algunas personas tienen la migraña en el momento tenso y otras cuando se relajan, por ejemplo el sábado.' },
      { titulo: 'El ciclo menstrual', texto: 'Hay quienes notan que aparecen más en ciertos días del ciclo, como justo antes o durante el período.' },
    ],
    porQue:
      'Una migraña rara vez tiene una sola causa: suele ser la suma de varias cosas que, solas, no alcanzan. Eso es justamente lo que la memoria no ve y un diario sí. Además, si consultás a un profesional, llevar registrado cuántas tuviste en el mes y qué pasó antes hace que la consulta rinda mucho más.',
    ejemplo: {
      emojis: '😴 + ☀️ → 🤕',
      texto: 'Cuando dormís menos de 6 horas y al otro día hace más de 30°, la migraña aparece casi siempre. Con una sola de las dos cosas, pocas veces.',
    },
    anotar: [
      'Cuándo empezó el dolor, qué tan fuerte fue y cuánto duró.',
      'Lo que comiste y tomaste, con una foto del plato si querés.',
      'El sueño (o que lo traiga solo el reloj) y el clima, que Patty suma sin que hagas nada.',
    ],
    cuidado:
      'Consultá rápido si es el peor dolor de cabeza de tu vida, si aparece de golpe, si viene con fiebre, rigidez de cuello, confusión, pérdida de fuerza o problemas para hablar o ver, o si las migrañas cambiaron de forma.',
    faq: [
      {
        p: '¿Patty me dice qué causa mis migrañas?',
        r: 'No. Patty no diagnostica. Te muestra qué cosas aparecen juntas en tus propios datos (por ejemplo, dormir poco y la migraña del día siguiente) para que lo veas vos y, si querés, lo charles con tu médico.',
      },
      {
        p: '¿Cuánto tiempo hay que anotar para ver algo?',
        r: 'Depende de cuán seguido tengas migrañas. Los primeros patrones suelen aparecer a las dos o tres semanas, y se vuelven más firmes con un par de meses de datos.',
      },
      {
        p: '¿Tengo que anotar todo a mano?',
        r: 'No. Podés contarle tu día con la voz, sacarle una foto al plato o contestar con un toque. El sueño, los pasos y el clima los suma sola si los conectás.',
      },
    ],
    relacionados: ['dolor-de-cabeza', 'dormir-mal', 'periodo', 'cansancio'],
  },
  {
    slug: 'dolor-de-cabeza',
    nombre: 'Dolor de cabeza',
    emoji: '🧠',
    titulo: 'Dolor de cabeza seguido: qué anotar para entenderlo | Patty',
    descripcion:
      '¿Te duele la cabeza seguido? Anotá sueño, comidas, agua, pantallas y clima, y mirá qué se repite antes del dolor. Con la voz, una foto o un toque.',
    h1: 'Dolor de cabeza seguido: qué pasa antes y cómo verlo',
    bajada: 'Muchas veces el dolor de cabeza avisa de algo que pasó horas antes. Anotarlo ayuda a encontrar la relación.',
    intro: [
      'Un dolor de cabeza de vez en cuando le pasa a casi todo el mundo. Pero cuando aparece varias veces por semana, empezás a sospechar de todo: el café, la compu, el calor, el estrés del laburo. Y como cada día es distinto, es muy difícil darse cuenta solo.',
      'La forma más práctica de salir de la duda es anotar: cuándo te dolió y qué hiciste antes. No hace falta un cuaderno ni una planilla; alcanza con contarlo como se lo contarías a alguien.',
    ],
    disparadores: [
      { titulo: 'Dormir menos de lo que necesitás', texto: 'Es de lo que más se repite: una o dos noches cortas y el dolor aparece al otro día.' },
      { titulo: 'Poca agua', texto: 'Sobre todo en días de calor o de mucho movimiento, cuando casi no tomaste nada.' },
      { titulo: 'Horas de pantalla', texto: 'Muchas horas seguidas frente a la compu o el celular, con la vista fija y la postura tensa.' },
      { titulo: 'Café: mucho o nada', texto: 'Tanto pasarse de café como dejarlo de golpe un fin de semana puede notarse.' },
      { titulo: 'Comidas salteadas', texto: 'Llegar a la tarde sin haber almorzado bien.' },
      { titulo: 'Tensión y estrés', texto: 'Días cargados de reuniones, apuro o preocupaciones, con hombros y cuello contracturados.' },
    ],
    porQue:
      'El dolor de cabeza casi nunca aparece en el momento en que pasa lo que lo dispara, sino horas después. Por eso es tan difícil relacionarlo de memoria. Un registro diario permite mirar hacia atrás y ver qué tienen en común los días con dolor y qué los días sin dolor.',
    ejemplo: {
      emojis: '📱 + 💧 → 🤕',
      texto: 'Los días con más de 8 horas de pantalla y poca agua, a la tarde aparece el dolor de cabeza. Los días que salís a caminar, casi no.',
    },
    anotar: [
      'El dolor: a qué hora, en qué parte de la cabeza y qué tan fuerte, del 1 al 5.',
      'Las comidas, el café y el agua del día.',
      'El sueño y el uso del teléfono, que Patty puede traer solos del reloj y del celular.',
    ],
    cuidado:
      'Consultá sin esperar si el dolor es muy fuerte y repentino, si viene con fiebre, rigidez de cuello, vómitos, confusión, cambios en la vista o en el habla, si aparece después de un golpe, o si es distinto de los que tenés siempre.',
    faq: [
      {
        p: '¿Es lo mismo dolor de cabeza que migraña?',
        r: 'No siempre. La migraña es un tipo de dolor de cabeza con características propias, y quien puede distinguirlos es un profesional. Patty sirve igual para los dos: registra cuándo aparece y qué pasó antes.',
      },
      {
        p: '¿Patty reemplaza al médico?',
        r: 'No. Patty te ayuda a ordenar lo que te pasa y a ver relaciones en tus datos. Si el dolor es frecuente o te preocupa, consultá; llevar tu registro va a ayudar en la consulta.',
      },
      {
        p: '¿Y si no me acuerdo de anotar?',
        r: 'El búho te pregunta cómo te sentís a lo largo del día y contestás con un toque, también desde el widget. Mucho de lo demás (sueño, pasos, clima, pantalla) lo junta solo.',
      },
    ],
    relacionados: ['migranas', 'dormir-mal', 'cansancio', 'ansiedad'],
  },
  {
    slug: 'dolor-de-panza',
    nombre: 'Dolor de panza',
    emoji: '😣',
    titulo: 'Dolor de panza: descubrí qué comida te cae mal | Patty',
    descripcion:
      '¿Te duele la panza y no sabés por qué? Anotá lo que comés con una foto y cómo te sentís después, y mirá qué se repite. Patty encuentra la relación.',
    h1: 'Dolor de panza: qué comés, cuándo te duele y qué se repite',
    bajada: 'Saber qué te cae mal no es tan obvio: a veces el malestar llega al otro día, o solo cuando se juntan varias cosas.',
    intro: [
      '"Algo me cayó mal" es fácil de decir y difícil de averiguar. Comiste cuatro o cinco cosas distintas en el día, tomaste mate, un café, quizás una cerveza a la noche. Y el dolor no siempre aparece enseguida: puede ser esa misma tarde o a la mañana siguiente.',
      'Un diario de comidas y síntomas es una de las herramientas más usadas para empezar a entender estas molestias. Con fotos del plato y un toque para decir cómo te sentís, armarlo cuesta segundos por día.',
    ],
    disparadores: [
      { titulo: 'Comidas pesadas o fritas', texto: 'Frituras, asado abundante, comidas con mucha grasa, sobre todo a la noche.' },
      { titulo: 'Lácteos', texto: 'Hay personas a las que la leche o ciertos quesos les generan molestias y otras a las que no les pasa nada.' },
      { titulo: 'Harinas, legumbres y algunas verduras', texto: 'Algunas comidas fermentan más que otras y se notan en forma de gases o dolor.' },
      { titulo: 'Comer apurado o a deshoras', texto: 'Almorzar en diez minutos, comer muy tarde o pasar muchas horas sin comer.' },
      { titulo: 'Estrés y nervios', texto: 'La panza suele ser de las primeras en enterarse de una semana complicada.' },
      { titulo: 'El ciclo y el calor', texto: 'Algunas personas notan más molestias en ciertos días del ciclo o en días de mucho calor.' },
    ],
    porQue:
      'Lo difícil del dolor de panza es que muchas veces no depende de una sola comida, sino de una combinación, o del momento. Mirando semanas de datos se puede ver qué tienen en común los días con dolor, algo que de memoria es casi imposible.',
    ejemplo: {
      emojis: '🍟 + 🩸 + ☀️ → 😣',
      texto: 'Cuando se juntan comida frita, el período y un día de calor, al otro día duele la panza. Una sola de esas cosas, casi nunca.',
    },
    anotar: [
      'Cada comida, con una foto: Patty reconoce el plato y si es frito, con harinas o verdura.',
      'Cómo te sentiste después y a qué hora apareció la molestia.',
      'Las idas al baño, si querés, y el ciclo menstrual si corresponde.',
    ],
    cuidado:
      'Consultá rápido si el dolor es muy fuerte o no se va, si hay fiebre, vómitos que no paran, sangre en la materia fecal o en el vómito, si bajás de peso sin buscarlo, o si te despierta de noche.',
    faq: [
      {
        p: '¿Patty me dice si soy intolerante a algo?',
        r: 'No. Patty no hace diagnósticos. Te muestra relaciones en tus datos, como "los días que tomás leche te duele más la panza", para que lo veas y lo consultes con un profesional, que es quien puede indicarte estudios.',
      },
      {
        p: '¿Tengo que pesar la comida o contar calorías?',
        r: 'No. Con una foto o contándolo con la voz alcanza. Patty estima la porción y el tipo de comida; no se trata de hacer dieta sino de ver qué te hace bien.',
      },
      {
        p: '¿Qué pasa si el dolor aparece al día siguiente?',
        r: 'Justamente para eso sirve: Patty mira lo que pasó en las horas y días anteriores, no solo en el momento del dolor.',
      },
    ],
    relacionados: ['hinchazon', 'colon-irritable', 'acidez', 'periodo'],
  },
  {
    slug: 'hinchazon',
    nombre: 'Panza hinchada',
    emoji: '🎈',
    titulo: 'Panza hinchada: qué la provoca en tu caso | Patty',
    descripcion:
      'Hinchazón abdominal y gases: anotá comidas, horarios y cómo te sentís, y descubrí qué se repite en los días de panza hinchada. Sin dietas ni planillas.',
    h1: 'Panza hinchada: encontrá qué se repite los días que te pasa',
    bajada: 'La hinchazón tiene mil explicaciones posibles. La tuya probablemente sea más simple de ver con unas semanas de datos.',
    intro: [
      'Te levantás bien y a la tarde la panza parece otra. Algunos días sí, otros no, y no termina de quedar claro por qué. La hinchazón y los gases son de las molestias más comunes y también de las más difíciles de relacionar con algo concreto.',
      'Lo que más suele ayudar es mirar el patrón: qué comiste, a qué hora, cuánto te moviste, cómo dormiste y en qué momento del ciclo estabas. Patty junta todo eso en un mismo lugar.',
    ],
    disparadores: [
      { titulo: 'Bebidas con gas', texto: 'Gaseosas, agua con gas, cerveza.' },
      { titulo: 'Legumbres, harinas y algunas verduras', texto: 'Porotos, lentejas, cebolla, repollo o mucho pan: lo que fermenta más en el intestino.' },
      { titulo: 'Comer rápido', texto: 'Al comer apurado o hablando mucho se traga más aire.' },
      { titulo: 'Edulcorantes y lácteos', texto: 'Algunos edulcorantes de los productos "light" y la leche le caen distinto a cada persona.' },
      { titulo: 'Poco movimiento', texto: 'Días enteros sentado, sin caminar.' },
      { titulo: 'El ciclo menstrual', texto: 'Muchas personas notan más hinchazón en los días previos al período.' },
    ],
    porQue:
      'La hinchazón cambia mucho de un día a otro y depende de varias cosas a la vez. Anotarla con una intensidad simple (poca, bastante, mucha) y cruzarla con lo que comiste y lo que hiciste permite ver qué se repite, en vez de sacar cosas de la dieta a ciegas.',
    ejemplo: {
      emojis: '🥤 + 🪑 → 🎈',
      texto: 'Los días que tomás gaseosa y casi no caminás, a la noche la panza está más hinchada. Los días con media hora de caminata, mucho menos.',
    },
    anotar: [
      'Las comidas y bebidas, con foto o con la voz.',
      'La hinchazón con un toque, cuando aparece, con su intensidad.',
      'Los pasos y el ciclo, que Patty puede sumar solos.',
    ],
    cuidado:
      'Consultá si la hinchazón no se va durante días, si viene con dolor fuerte, fiebre, vómitos, sangre, cambios marcados en cómo vas al baño o si bajás de peso sin buscarlo.',
    faq: [
      {
        p: '¿Patty me arma una dieta?',
        r: 'No. Patty no da dietas ni indicaciones médicas. Te muestra qué cosas aparecen juntas en tus datos; si querés cambiar tu alimentación, lo ideal es hacerlo con un profesional.',
      },
      {
        p: '¿Sirve si me pasa solo algunos días?',
        r: 'Sí, y es justamente cuando más sirve: comparar los días con hinchazón con los días sin hinchazón es lo que permite ver la diferencia.',
      },
      {
        p: '¿Mis datos quedan privados?',
        r: 'Sí. Lo que anotás se usa para mostrártelo a vos y buscar tus patrones. No se vende ni se comparte.',
      },
    ],
    relacionados: ['dolor-de-panza', 'colon-irritable', 'acidez', 'periodo'],
  },
  {
    slug: 'colon-irritable',
    nombre: 'Colon irritable',
    emoji: '🌀',
    titulo: 'Colon irritable: un diario para ver qué te afecta | Patty',
    descripcion:
      'Si tenés colon irritable, anotar comidas, estrés, sueño y síntomas ayuda a ver qué te afecta a vos. Patty lo hace fácil, con la voz o una foto.',
    h1: 'Colon irritable: un diario simple para ver qué te afecta a vos',
    bajada: 'Con colon irritable, lo que a una persona le cae mal a otra no le hace nada. Por eso sirve tanto mirar tus propios datos.',
    intro: [
      'El síndrome de colon irritable (o intestino irritable) es muy común y muy personal: hay días tranquilos y días de dolor, hinchazón, diarrea o constipación, y lo que los desencadena cambia de una persona a otra.',
      'Por eso, quienes lo tratan suelen recomendar llevar un registro de comidas, síntomas y del contexto (estrés, sueño, horarios). Es una tarea pesada si la hacés en papel, y ahí es donde Patty ayuda: lo contás en segundos y ella ordena todo.',
    ],
    disparadores: [
      { titulo: 'Ciertos alimentos', texto: 'Muchas personas notan diferencias con lácteos, harinas, legumbres, cebolla, ajo o algunas frutas. Varía muchísimo.' },
      { titulo: 'Estrés y ansiedad', texto: 'La relación entre la cabeza y el intestino es fuerte: una semana difícil se suele notar.' },
      { titulo: 'Dormir mal', texto: 'Noches cortas o cortadas que se notan al día siguiente.' },
      { titulo: 'Café, alcohol y picante', texto: 'Son de lo que más se menciona, aunque no a todos les afecta igual.' },
      { titulo: 'Horarios desordenados', texto: 'Comer a cualquier hora, saltear comidas o comer mucho de una vez.' },
      { titulo: 'El ciclo menstrual', texto: 'Algunas personas notan más síntomas en determinadas fases.' },
    ],
    porQue:
      'Con colon irritable los síntomas suelen aparecer horas o incluso un día después, y casi nunca por una sola cosa. Un diario constante es lo que permite separar lo que realmente te afecta de lo que solo coincidió una vez, y llegar a la consulta con datos en vez de recuerdos.',
    ejemplo: {
      emojis: '😰 + ☕ → 🌀',
      texto: 'En las semanas con mucho estrés, los días que tomás más de dos cafés terminan con molestias. Con el mismo café en semanas tranquilas, casi nunca.',
    },
    anotar: [
      'Las comidas con una foto, y las bebidas (café, alcohol, mate).',
      'Los síntomas con su intensidad y las idas al baño.',
      'Cómo te sentís de ánimo y cómo dormiste.',
    ],
    cuidado:
      'Consultá si aparecen síntomas nuevos o distintos, sangre en la materia fecal, fiebre, pérdida de peso sin buscarlo, dolor que te despierta de noche, o si los síntomas empiezan después de los 50 años.',
    faq: [
      {
        p: '¿Patty sirve para saber si tengo colon irritable?',
        r: 'No. El diagnóstico lo hace un profesional. Patty sirve para registrar lo que te pasa y ver qué se relaciona con tus síntomas, tengas o no un diagnóstico.',
      },
      {
        p: '¿Puedo mostrarle mis datos al médico?',
        r: 'Sí. Podés mirar en el calendario cómo te fue cada día del mes y qué patrones encontró Patty, y llevarlo a la consulta.',
      },
      {
        p: '¿Patty me dice qué dejar de comer?',
        r: 'No da indicaciones. Te muestra relaciones en tus datos; cualquier cambio de alimentación conviene charlarlo con quien te atiende.',
      },
    ],
    relacionados: ['dolor-de-panza', 'hinchazon', 'ansiedad', 'acidez'],
  },
  {
    slug: 'acidez',
    nombre: 'Acidez',
    emoji: '🔥',
    titulo: 'Acidez y reflujo: qué la dispara en tu caso | Patty',
    descripcion:
      'Acidez después de comer o a la noche: anotá qué comiste, a qué hora y cómo dormiste, y descubrí qué se repite. Patty encuentra tus propios patrones.',
    h1: 'Acidez: descubrí qué comidas y hábitos se repiten antes',
    bajada: 'Café, mate, comidas tarde, el estrés: la lista de sospechosos es larga. Tus datos te dicen cuáles cuentan en tu caso.',
    intro: [
      'Esa sensación de ardor después de comer, o al acostarte, es muy común. A veces es claro qué la provocó y otras veces no tanto: el mismo plato un día te cae bien y otro día no.',
      'La diferencia muchas veces está en el contexto: cuánto comiste, a qué hora, si te acostaste enseguida, si fue un día de estrés. Anotarlo unas semanas ayuda a separar lo que importa de lo que no.',
    ],
    disparadores: [
      { titulo: 'Comer tarde y acostarse enseguida', texto: 'Cenar fuerte y acostarse al rato es de lo que más se menciona.' },
      { titulo: 'Porciones grandes', texto: 'Comer mucho de una vez, como en un asado o una salida.' },
      { titulo: 'Café, mate y alcohol', texto: 'Hay personas a las que les pega uno y no el otro.' },
      { titulo: 'Grasas, frituras y picante', texto: 'Comidas pesadas, salsas fuertes, chocolate o cítricos, según cada uno.' },
      { titulo: 'Estrés', texto: 'Las semanas cargadas suelen notarse también en la digestión.' },
      { titulo: 'Fumar', texto: 'Es un factor que se nombra seguido.' },
    ],
    porQue:
      'La acidez depende tanto de qué comés como de cuándo y cómo. Un diario que junte la comida, la hora y el sueño permite ver patrones como "cuando ceno después de las 23, a la noche aparece la acidez", que de otra forma se pierden.',
    ejemplo: {
      emojis: '🌙 + 🍕 → 🔥',
      texto: 'Cuando cenás después de las 23 y te acostás antes de una hora, aparece la acidez. Las noches que cenás más temprano, casi nunca.',
    },
    anotar: [
      'Lo que comés y tomás, con la hora (Patty la pone sola cuando se lo contás).',
      'Cuándo aparece la acidez y qué tan fuerte es.',
      'A qué hora te acostaste y cómo dormiste.',
    ],
    cuidado:
      'Consultá si la acidez es muy frecuente, si te cuesta tragar, si vomitás, si hay sangre o materia fecal muy oscura, si bajás de peso sin buscarlo o si el dolor en el pecho es fuerte (ante la duda, siempre es una urgencia).',
    faq: [
      {
        p: '¿Patty me dice qué tomar para la acidez?',
        r: 'No. Patty no recomienda medicamentos ni tratamientos. Si tenés acidez seguido, consultá a un profesional; tu registro de Patty puede ayudar en la consulta.',
      },
      {
        p: '¿Patty sabe a qué hora comí?',
        r: 'Sí. Cuando le contás tu día ("a las 10 de la noche cené pizza"), Patty guarda cada cosa con su hora, y si no la decís, usa la del momento.',
      },
      {
        p: '¿Funciona sin reloj inteligente?',
        r: 'Sí. El reloj suma datos de sueño y actividad, pero Patty funciona igual con lo que le contás.',
      },
    ],
    relacionados: ['dolor-de-panza', 'hinchazon', 'dormir-mal', 'colon-irritable'],
  },
  {
    slug: 'dormir-mal',
    nombre: 'Dormir mal',
    emoji: '😴',
    titulo: 'Dormís mal: descubrí qué afecta tu sueño | Patty',
    descripcion:
      '¿Te cuesta dormir o te despertás cansado? Cruzá tu sueño con el café, las pantallas, la cena y el ejercicio, y mirá qué cambia tus noches.',
    h1: 'Dormir mal: qué cosas de tu día cambian cómo dormís',
    bajada: 'Lo que hacés de día se nota de noche. Patty cruza tu sueño con todo lo demás y te muestra qué pesa más en tu caso.',
    intro: [
      'Hay noches en las que te dormís enseguida y otras en las que das vueltas hasta las tres. Y al día siguiente, el cansancio, el mal humor o el dolor de cabeza. Casi todos tenemos sospechas (el café, el celular, la cena), pero pocas veces sabemos cuál pesa de verdad.',
      'Si tenés reloj o pulsera, Patty trae solo cuánto dormiste y sus etapas. Si no, alcanza con decirle a qué hora te acostaste y te levantaste. Lo interesante es cruzar eso con el resto de tu día.',
    ],
    disparadores: [
      { titulo: 'Café o mate a la tarde', texto: 'La cafeína puede durar muchas horas en el cuerpo; a algunas personas les afecta y a otras no tanto.' },
      { titulo: 'Pantallas a la noche', texto: 'El celular en la cama, una serie que se estira, el scroll infinito.' },
      { titulo: 'Cenas pesadas o tardías', texto: 'Acostarse con la panza llena.' },
      { titulo: 'Alcohol', texto: 'Puede ayudar a dormirse pero suele empeorar la segunda mitad de la noche.' },
      { titulo: 'Horarios cambiantes', texto: 'Acostarse a horas muy distintas cada día, o dormir de más el fin de semana.' },
      { titulo: 'Poco movimiento y preocupaciones', texto: 'Días sin moverse y la cabeza a mil al apagar la luz.' },
    ],
    porQue:
      'El sueño es de las cosas más fáciles de medir y de las que más se relacionan con el resto: el ánimo, el dolor de cabeza, el hambre, la energía. Con unas semanas de datos se ve qué hábitos de tu día van con las noches buenas y cuáles con las malas.',
    ejemplo: {
      emojis: '📱 → 😴',
      texto: 'Las noches con más de una hora de celular después de las 23, dormís 50 minutos menos y te despertás más veces.',
    },
    anotar: [
      'A qué hora te acostaste y te levantaste, o que lo traiga el reloj por Health Connect.',
      'El café, el mate y el alcohol, con la hora.',
      'Cómo te despertaste: con un toque, al abrir la app.',
    ],
    cuidado:
      'Consultá si dormís mal la mayoría de las noches durante semanas, si te dicen que roncás fuerte o dejás de respirar dormido, si te dormís sin querer durante el día, o si el insomnio viene con mucha angustia.',
    faq: [
      {
        p: '¿Necesito un reloj inteligente?',
        r: 'No. Con un reloj o pulsera (Samsung, Fitbit y otros, por Health Connect) el sueño llega solo y con sus etapas. Sin reloj, le decís a qué hora te acostaste y te levantaste.',
      },
      {
        p: '¿Patty trata el insomnio?',
        r: 'No. Patty no es un tratamiento ni diagnostica trastornos del sueño. Te muestra qué cosas de tu día se relacionan con cómo dormís.',
      },
      {
        p: '¿Patty mira el uso del celular?',
        r: 'En Android, si le das permiso, Patty cuenta el tiempo de pantalla y qué apps usás más (nunca lo que hacés adentro). Lo podés apagar cuando quieras.',
      },
    ],
    relacionados: ['cansancio', 'ansiedad', 'dolor-de-cabeza', 'migranas'],
  },
  {
    slug: 'cansancio',
    nombre: 'Cansancio',
    emoji: '🥱',
    titulo: 'Cansancio todo el día: qué lo explica en tu caso | Patty',
    descripcion:
      '¿Vivís cansado? Anotá tu energía y cruzala con el sueño, las comidas, el movimiento y el ciclo. Patty te muestra qué va con tus días de más energía.',
    h1: 'Cansancio: qué tienen en común tus días con más y menos energía',
    bajada: 'El cansancio rara vez tiene una sola explicación. Mirar tus días buenos y malos lado a lado ayuda a encontrar la diferencia.',
    intro: [
      'Hay días en los que a las tres de la tarde ya no das más, y otros en los que llegás a la noche con pilas. Si te pasa seguido, es natural preguntarse qué cambia entre unos y otros.',
      'El cansancio se relaciona con muchas cosas a la vez: cómo dormiste, qué comiste, cuánto te moviste, cuánta pantalla, cuánto estrés. Patty junta todo eso y te muestra qué se repite.',
    ],
    disparadores: [
      { titulo: 'Sueño corto o de mala calidad', texto: 'No solo cuántas horas, también si te despertaste muchas veces.' },
      { titulo: 'Almuerzos pesados', texto: 'Mucha harina o mucha cantidad al mediodía y el bajón de la siesta.' },
      { titulo: 'Poco movimiento', texto: 'Aunque parezca al revés, los días sin moverse a muchas personas las dejan más cansadas.' },
      { titulo: 'Poca agua y mucho café', texto: 'El café de la tarde que después te cuesta la noche.' },
      { titulo: 'Días cargados', texto: 'Muchas reuniones, viajes con tráfico, un día sin pausas.' },
      { titulo: 'El ciclo menstrual', texto: 'Muchas personas notan más cansancio en ciertos días del ciclo.' },
    ],
    porQue:
      'El cansancio es subjetivo y cambia mucho, por eso cuesta relacionarlo con algo concreto. Anotar tu energía con un toque, todos los días, convierte una sensación difusa en algo que se puede comparar: los días de más energía tienen cosas en común, y Patty las encuentra.',
    ejemplo: {
      emojis: '🚶 + 😴 → ⚡',
      texto: 'Los días que caminás media hora y dormiste más de 7 horas, tu energía de la tarde está bastante más arriba.',
    },
    anotar: [
      'Tu energía o tu ánimo con un toque, cuando el búho te pregunta.',
      'Las comidas, el café y el agua.',
      'El sueño, los pasos y el calendario, que Patty puede traer solos.',
    ],
    cuidado:
      'Consultá si el cansancio dura semanas aunque descanses, si viene con pérdida de peso, fiebre, falta de aire, palpitaciones, mucha tristeza o desgano, o si te impide hacer tu vida normal.',
    faq: [
      {
        p: '¿Patty me dice por qué estoy cansado?',
        r: 'No da diagnósticos. Te muestra qué cosas de tu día aparecen junto con más o menos energía. Si el cansancio no se va, lo indicado es consultar a un profesional.',
      },
      {
        p: '¿Cómo anoto el cansancio?',
        r: 'Con un toque: el búho te pregunta cómo te sentís y elegís una carita o una intensidad. También podés decirlo con la voz: "estoy muerto, dormí re mal".',
      },
      {
        p: '¿Cuánto tarda en encontrar algo?',
        r: 'Desde el primer día ves tu día ordenado. Los primeros patrones suelen aparecer a las dos semanas, y al mes ya son más firmes.',
      },
    ],
    relacionados: ['dormir-mal', 'ansiedad', 'periodo', 'dolor-de-cabeza'],
  },
  {
    slug: 'ansiedad',
    nombre: 'Ansiedad y ánimo',
    emoji: '🌧️',
    titulo: 'Ansiedad y ánimo: qué cosas de tu día influyen | Patty',
    descripcion:
      'Anotá cómo te sentís con un toque y cruzalo con el sueño, el movimiento, las pantallas y el café. Patty te muestra qué va con tus mejores días.',
    h1: 'Ansiedad y ánimo: qué cosas de tu día se relacionan con cómo te sentís',
    bajada: 'No se trata de controlar todo, sino de conocerte un poco más: qué te hace bien y qué te pesa.',
    intro: [
      'El ánimo sube y baja, y a veces la ansiedad aparece sin aviso. Muchas personas notan que ciertos hábitos influyen (dormir poco, el café, pasar horas en redes, no moverse), pero en el día a día es difícil ver cuáles pesan más.',
      'Anotar cómo te sentís, con un toque y sin tener que explicar nada, y dejar que Patty lo cruce con el resto de tu día es una forma amable de empezar a verlo.',
    ],
    disparadores: [
      { titulo: 'Dormir poco', texto: 'Las noches cortas suelen notarse en el humor y la paciencia del día siguiente.' },
      { titulo: 'Mucho café', texto: 'A algunas personas, el exceso de cafeína les acelera el cuerpo y la cabeza.' },
      { titulo: 'Horas en redes', texto: 'El scroll largo, sobre todo a la noche.' },
      { titulo: 'Poco movimiento y poco sol', texto: 'Días enteros adentro, sin caminar.' },
      { titulo: 'Agenda cargada', texto: 'Muchas reuniones seguidas, sin pausas.' },
      { titulo: 'El ciclo menstrual', texto: 'Hay quienes notan cambios de ánimo en ciertas fases.' },
    ],
    porQue:
      'Cuando estás mal es difícil acordarte de los días buenos, y al revés. Un registro simple y constante te da una mirada más justa de cómo venís, y ayuda a ver qué cosas acompañan a los mejores días. También puede ser útil si estás en terapia, para llevar algo concreto a la sesión.',
    ejemplo: {
      emojis: '🚶 → 😄',
      texto: 'Los días que caminás media hora, tu ánimo está más arriba. Los días con más de 3 horas de redes, más abajo.',
    },
    anotar: [
      'Cómo te sentís, con una carita, varias veces al día si querés.',
      'Lo que hiciste: si saliste, si viste gente, si te moviste.',
      'El sueño, el tiempo de pantalla y el calendario, que Patty suma solos.',
    ],
    cuidado:
      'Patty no reemplaza a un psicólogo ni a un psiquiatra. Si la ansiedad o la tristeza no te dejan hacer tu vida, buscá ayuda profesional. Si pensás en hacerte daño o sentís que no podés más, pedí ayuda ya: hablá con alguien de confianza o llamá a emergencias (911 o 107 en Argentina).',
    faq: [
      {
        p: '¿Patty es una app de salud mental?',
        r: 'No. Patty es un diario de tu día que busca relaciones entre cosas. Puede ayudarte a conocerte, pero no es terapia ni da diagnósticos.',
      },
      {
        p: '¿Tengo que escribir cómo me siento?',
        r: 'No hace falta. Con un toque en una carita alcanza. Si querés contar más, podés hacerlo con la voz.',
      },
      {
        p: '¿Alguien más ve lo que anoto?',
        r: 'No, salvo que vos elijas compartirlo con alguien de tu familia. Lo que anotás no se vende ni se comparte.',
      },
    ],
    relacionados: ['dormir-mal', 'cansancio', 'colon-irritable', 'periodo'],
  },
  {
    slug: 'periodo',
    nombre: 'Período y ciclo',
    emoji: '🩸',
    titulo: 'Síntomas del período: cómo te va en cada fase | Patty',
    descripcion:
      'Registrá tu ciclo y tus síntomas (dolor, hinchazón, ánimo, energía) y mirá cómo te va en cada fase y qué se suma. Patty encuentra tus patrones.',
    h1: 'Período y ciclo: cómo te va en cada fase y qué se suma',
    bajada: 'El ciclo influye en muchas cosas, pero no a todas las personas igual. Ver tus propios datos fase por fase cambia la mirada.',
    intro: [
      'Dolor, hinchazón, cansancio, cambios de ánimo, dolor de cabeza: muchas personas notan que el cuerpo se siente distinto según el momento del ciclo. Pero también pasa que se le echa la culpa al período de cosas que tienen otra explicación, o al revés.',
      'Patty registra la fase de cada día y la cruza con todo lo demás que anotás. Así podés ver cómo te va en cada fase y, sobre todo, qué cosas se suman: el ciclo muchas veces no actúa solo.',
    ],
    disparadores: [
      { titulo: 'Los días previos', texto: 'Hinchazón, irritabilidad, antojos o cansancio son de lo que más se menciona antes del período.' },
      { titulo: 'Los primeros días', texto: 'Dolor de panza o de espalda, y para algunas personas, dolor de cabeza.' },
      { titulo: 'Lo que se suma', texto: 'Dormir mal, comidas pesadas, calor o estrés pueden hacer que esos días se sientan peor.' },
      { titulo: 'El ánimo', texto: 'Hay quienes notan cambios de humor según la fase, y quienes no notan nada.' },
      { titulo: 'La energía', texto: 'En algunas fases muchas personas se sienten con más energía y en otras con menos.' },
    ],
    porQue:
      'El ciclo es un patrón que se repite, y por eso un registro de varios meses es tan revelador: se ve qué te pasa siempre en la misma fase y qué depende de otras cosas. Llevar ese registro también ayuda mucho en una consulta ginecológica.',
    ejemplo: {
      emojis: '🩸 + 🍟 + 😴 → 😣',
      texto: 'En los primeros días del período, el dolor de panza es más fuerte cuando dormiste poco y comiste frito el día anterior.',
    },
    anotar: [
      'Cuándo empieza y termina el período: Patty calcula la fase de cada día.',
      'Los síntomas con su intensidad: dolor, hinchazón, ánimo, energía.',
      'Lo de siempre: comidas, sueño y movimiento, para ver qué se suma.',
    ],
    cuidado:
      'Consultá si el dolor es tan fuerte que no te deja hacer tu vida, si el sangrado es muy abundante o fuera de lo habitual, si hay sangrado entre períodos, o si tu ciclo cambió mucho de golpe.',
    faq: [
      {
        p: '¿Patty sirve como método anticonceptivo?',
        r: 'No. Patty no predice días fértiles ni sirve para evitar o buscar un embarazo. Solo registra la fase del ciclo para cruzarla con cómo te sentís.',
      },
      {
        p: '¿Cuántos ciclos hace falta anotar?',
        r: 'Con dos o tres ciclos ya se empiezan a ver cosas que se repiten. Cuantos más, más firmes los patrones.',
      },
      {
        p: '¿Puedo ver mis datos por fase?',
        r: 'Sí. Patty te muestra cómo te va en cada fase del ciclo: ánimo, energía, dolores y lo que anotes.',
      },
    ],
    relacionados: ['dolor-de-panza', 'hinchazon', 'migranas', 'cansancio'],
  },
];
