// El informe para el médico: la pantalla para pedirlo (en Más y en Descubrir) y el PDF que arma el servidor.
export const INFORME: Record<string, string> = {
  // La pantalla
  '📄 Informe para el médico': '📄 Report for your doctor',
  'Informe para el médico': 'Report for your doctor',
  'Un PDF con lo anotado para la consulta': 'A PDF of what you logged, for your appointment',
  '📄 Informe para el médico (PDF)': '📄 Report for your doctor (PDF)',
  'Un PDF prolijo con lo que anotaste, para llevar a la consulta: malestares y dolores (cuántas veces, qué tan fuertes y cuánto duraron), remedios y para qué los tomaste, sueño, ánimo, el ciclo si lo anotás y lo que encontró Patty.':
    'A tidy PDF of what you logged, to take to your appointment: symptoms and pains (how often, how strong and how long they lasted), medicines and what you took them for, sleep, mood, your cycle if you track it, and what Patty found.',
  'Período del informe': 'Report period',
  'Última semana': 'Last week',
  'Último mes': 'Last month',
  'Últimos 3 meses': 'Last 3 months',
  'Armando el PDF…': 'Making the PDF…',
  '📄 Armar el PDF': '📄 Make the PDF',
  'Listo: se abrió el PDF. Desde ahí lo podés guardar o compartir.': 'Done: the PDF is open. You can save or share it from there.',
  'Copié el enlace: pegalo en el navegador del teléfono para abrir el PDF. Con la versión nueva de la app se abre solo.':
    "I copied the link: paste it in your phone's browser to open the PDF. With the new version of the app it opens by itself.",
  'Abrí este enlace en el navegador del teléfono para ver el PDF:': "Open this link in your phone's browser to see the PDF:",
  'El enlace sirve por 15 minutos. Patty no diagnostica: el informe resume lo que anotaste para ayudarte a contarlo.':
    "The link works for 15 minutes. Patty doesn't diagnose: the report sums up what you logged to help you tell your doctor.",
  'El enlace al informe venció. Volvé a pedirlo desde Patty.': 'The link to the report expired. Ask for it again in Patty.',

  // El PDF: cabecera y persona
  'Informe para el médico: {nombre}': 'Report for the doctor: {nombre}',
  'Del {desde} al {hasta} ({n} días)': 'From {desde} to {hasta} ({n} days)',
  'Hecho el {fecha}': 'Made on {fecha}',
  '{n} años': '{n} years old',
  'Condiciones que contó': 'Conditions reported',
  'Anotó algo {n} de los {total} días del período. Todo sale de lo que la persona fue anotando en Patty (y de lo que juntan el teléfono o el reloj).':
    'Logged something on {n} of the {total} days in the period. Everything comes from what the person logged in Patty (and what the phone or watch collected).',

  // Malestares
  'Malestares y dolores': 'Symptoms and pains',
  'No anotó malestares ni dolores en el período.': 'No symptoms or pains logged in the period.',
  'Intensidad de 0 a 10, como la anotó la persona. La duración sale de los que tienen anotado cuándo terminaron.':
    'Intensity from 0 to 10, as the person logged it. Duration comes from the ones with a logged end time.',
  Malestar: 'Symptom',
  Veces: 'Times',
  Duración: 'Duration',
  'hasta {v}': 'up to {v}',
  '{prom} en promedio (máx. {max})': '{prom} on average (max {max})',
  '{d} ({n} de {total})': '{d} ({n} of {total})',
  'más {franja}': 'mostly {franja}',
  'última: {fecha}': 'last: {fecha}',
  'a la mañana': 'in the morning',
  'a la tarde': 'in the afternoon',
  'a la noche': 'at night',
  '{h} h {m} min': '{h} h {m} min',
  '{h} h': '{h} h',
  '{m} min': '{m} min',

  // Remedios
  'No anotó remedios en el período.': 'No medicines logged in the period.',
  'Dosis habitual': 'Usual dose',
  'Para qué': 'What for',
  'Tratamientos cargados': 'Treatments set up',
  Dosis: 'Dose',
  Cómo: 'How',
  Motivo: 'Reason',
  Tomas: 'Doses taken',
  '{remedio} (terminado)': '{remedio} (finished)',
  'Cada {n} h': 'Every {n} h',

  // Sueño
  'No hay datos de sueño en el período.': 'No sleep data in the period.',
  'Durmió {horas} por noche en promedio ({n} noches con datos; entre {min} y {max}).': 'Slept {horas} a night on average ({n} nights with data; between {min} and {max}).',
  'Se acostó en promedio a las {acoste} y se levantó a las {levante}.': 'Went to bed at {acoste} and got up at {levante} on average.',
  'Se acostó en promedio a las {hora}.': 'Went to bed at {hora} on average.',
  'Se levantó en promedio a las {hora}.': 'Got up at {hora} on average.',
  'Contó que se despertó a la noche {n} veces.': 'Reported waking up at night {n} times.',
  '7 h': '7 h',
  'Horas dormidas por noche (en ámbar, menos de 6 h).': 'Hours slept per night (in amber, under 6 h).',

  // Ánimo
  'No contó cómo se sentía en el período.': "Didn't report how they felt in the period.",
  'Contó cómo se sentía {n} días: {muy_bien} muy bien, {bien} bien, {mal} mal y {muy_mal} muy mal.':
    'Reported how they felt on {n} days: {muy_bien} very good, {bien} good, {mal} bad and {muy_mal} very bad.',
  'A lo largo del período, {tendencia}.': 'Over the period, it {tendencia}.',
  'fue mejorando': 'got better',
  'fue empeorando': 'got worse',
  'se mantuvo parecido': 'stayed about the same',
  'Ánimo de cada día, de 1 (muy mal) a 10 (muy bien).': 'Mood each day, from 1 (very bad) to 10 (very good).',
  'Ánimo promedio de cada semana (la fecha es el primer día), de 1 (muy mal) a 10 (muy bien). En promedio: {estado}.':
    'Average mood each week (the date is the first day), from 1 (very bad) to 10 (very good). On average: {estado}.',

  // Ciclo
  'Ciclos de {n} días en promedio, con menstruación de {p} días ({ciclos} ciclos anotados).': 'Cycles of {n} days on average, with periods of {p} days ({ciclos} cycles logged).',
  'Todavía no hay ciclos completos anotados (menstruación de {p} días).': 'No complete cycles logged yet (periods of {p} days).',
  'Los ciclos son regulares (varían menos de una semana).': 'Cycles are regular (they vary by less than a week).',
  'Los ciclos varían bastante de largo.': 'Cycle length varies quite a bit.',
  'En el período empezó a menstruar el {fechas}.': 'Periods in this time started on {fechas}.',
  'No anotó menstruación en el período.': 'No period logged in this time.',
  'Próxima menstruación estimada: {fecha}.': 'Next period (estimated): {fecha}.',

  // Patrones
  'Lo que encontró Patty': 'What Patty found',
  'Todavía no hay patrones claros en lo anotado.': 'No clear patterns in the logs yet.',
  'Patty compara los días en que pasó algo con los demás. Son relaciones en los datos de esta persona, no causas comprobadas: sirven como pista para conversar.':
    "Patty compares the days something happened with the rest. These are links in this person's data, not proven causes: use them as clues to talk about.",
  'Pasó {n} de {total} veces: {con}% de las veces, contra {sin}% sin eso.': 'Happened {n} of {total} times: {con}% of the time, versus {sin}% without it.',
  '{efecto} apareció más seguido {cuando} de {causa}.': '{efecto} showed up more often {cuando} after {causa}.',
  'Dice que le pasa': 'Says it happens',

  // Aclaración y pie
  'Patty no diagnostica ni reemplaza la consulta. Este informe resume lo que la persona anotó en la app para ayudar a contarle al médico cómo estuvo; los datos pueden estar incompletos y los patrones son asociaciones, no causas. Cualquier decisión sobre la salud o los remedios la toma un profesional.':
    "Patty doesn't diagnose or replace a medical visit. This report sums up what the person logged in the app to help tell the doctor how they've been; the data may be incomplete and the patterns are associations, not causes. Any decision about health or medicines is for a professional to make.",
  'Patty · {nombre} · No es un diagnóstico médico.': 'Patty · {nombre} · Not a medical diagnosis.',
  'Hoja {n} de {total}': 'Page {n} of {total}',
};
