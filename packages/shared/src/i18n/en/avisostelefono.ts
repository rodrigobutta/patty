// Lo que avisan las apps del teléfono (ver avisos.ts): los interruptores de Permisos, las preguntas del Día (comida
// pedida, viajes en apps), el detalle de las notificaciones y los mensajes, y los conceptos que se llenan solos.

export const AVISOS_TELEFONO: Record<string, string> = {
  // Permisos
  'Avisos, ubicación, uso del teléfono, lo que escuchás, lo que avisan las apps y salud': 'Notifications, location, phone use, what you listen to, what your apps notify and health',
  'Lo que avisan las apps': 'What your apps notify',
  'Con el mismo «acceso a las notificaciones»: cada cosa se prende o se apaga por separado. El texto de tus avisos nunca sale del teléfono.':
    'With the same "notification access": each thing turns on or off separately. The text of your notifications never leaves the phone.',
  'Así Patty puede ver cosas como «los días con muchas notificaciones estás más ansioso», «las noches con avisos dormís peor» o «cuando charlás más, estás de mejor ánimo».':
    'So Patty can spot things like "on days with lots of notifications you are more anxious", "on nights with notifications you sleep worse" or "when you chat more, you are in a better mood".',
  Interrupciones: 'Interruptions',
  'Cuántos avisos te llegan por día y por hora, qué apps avisan más y cuáles sonaron de noche (de 23 a 7). Solo la app y la hora: nunca el texto.':
    'How many notifications you get per day and per hour, which apps notify the most and which ones made a sound at night (11 pm to 7 am). Only the app and the time: never the text.',
  'Vida social': 'Social life',
  'Cuántos mensajes recibís en WhatsApp, Telegram, Instagram, Messenger, Signal y SMS. Solo cuántos: nunca de quién ni qué dicen.':
    'How many messages you get on WhatsApp, Telegram, Instagram, Messenger, Signal and SMS. Only how many: never who from or what they say.',
  'Comida pedida': 'Ordered food',
  'Cuando PedidosYa, Rappi o Uber Eats avisan que tu pedido está en camino o llegó, Patty te pregunta qué fue para anotarlo. El aviso se lee en el teléfono y solo sale «llegó un pedido».':
    'When PedidosYa, Rappi or Uber Eats say your order is on its way or arrived, Patty asks you what it was to log it. The notification is read on the phone and only "an order arrived" leaves it.',
  'Viajes en apps': 'Rides in apps',
  'Los avisos de Uber, Cabify y DiDi de que llega el auto o terminó el viaje, para marcar tus viajes «en Uber». Se leen en el teléfono y solo sale la app y la hora.':
    'Uber, Cabify and DiDi notifications that your car is arriving or the ride ended, to mark your trips "by Uber". They are read on the phone and only the app and the time leave it.',
  'Cuando Strava, Nike Run Club, Garmin, Samsung Health, Google Fit o adidas Running avisan que terminaste un entrenamiento, se anota solo (con los minutos y los km si el aviso los dice), salvo que ya esté anotado.':
    'When Strava, Nike Run Club, Garmin, Samsung Health, Google Fit or adidas Running say you finished a workout, it is logged on its own (with the minutes and km if the notification says them), unless it was already logged.',
  'El texto de tus mensajes y de tus avisos nunca sale del teléfono: Patty se queda solo con lo que prendas en Permisos.':
    'The text of your messages and notifications never leaves the phone: Patty only keeps what you turn on in Permissions.',

  // Lo que pregunta el Día
  '¿Pediste comida? ¿Qué fue?': 'Did you order food? What was it?',
  'Llegó tu pedido de {app} a las {hora}.': 'Your {app} order arrived at {hora}.',
  'Ej: pizza, sushi, empanadas': 'E.g. pizza, sushi, empanadas',
  'Con una foto': 'With a photo',
  'Mandale una foto de lo que pediste': 'Send a photo of what you ordered',
  'No era para mí': 'It was not for me',
  '¡Anotado! {que}, pedido por delivery': 'Logged! {que}, delivered',
  '¿Fuiste en {app}?': 'Did you ride with {app}?',
  'A las {hora}': 'At {hora}',
  'Sí: ¿cómo fue?': 'Yes: how was it?',
  'No fui yo': 'It was not me',
  'Anotado: viaje en {app}': 'Logged: ride with {app}',

  // El detalle del Día
  'Lo que avisó el teléfono': 'What your phone notified',
  notificación: 'notification',
  notificaciones: 'notifications',
  '1 sonó de noche': '1 made a sound at night',
  '{n} sonaron de noche': '{n} made a sound at night',
  'Por hora': 'By hour',
  'Notificaciones por hora': 'Notifications by hour',
  'Notificaciones y llamadas por hora': 'Notifications and calls by hour',
  'Llamadas por hora': 'Calls by hour',
  'Las apps que más avisaron': 'The apps that notified the most',
  'Anoche (de 23 a 7) llegaron {n}: {s} sonaron y {a} con la pantalla apagada.': 'Last night (11 pm to 7 am) {n} arrived: {s} made a sound and {a} with the screen off.',
  'Borrar todo lo de los avisos': 'Delete everything from notifications',
  '¿Borrar todo lo que Patty contó de los avisos del teléfono? Lo que ya se anotó (comidas, viajes, ejercicio) queda. No se puede deshacer.':
    'Delete everything Patty counted from the phone notifications? What was already logged (meals, rides, exercise) stays. This cannot be undone.',
  'mensaje recibido': 'message received',
  'mensajes recibidos': 'messages received',

  // Conceptos que se llenan solos
  Notificaciones: 'Notifications',
  'Notificaciones de noche': 'Notifications at night',
  'Mensajes recibidos': 'Messages received',
  Correr: 'Running',
  Natación: 'Swimming',
  Yoga: 'Yoga',
  avisos: 'notifications',
  mensajes: 'messages',

  // Servidor
  'En {app}, según su aviso': 'By {app}, according to its notification',
  '¿Qué fue?': 'What was it?',
  'Mandá hasta 5000 "conteos" y 500 "eventos" por vez.': 'Send up to 5000 "conteos" and 500 "eventos" at a time.',
  'Mandá listas "conteos" y "eventos".': 'Send "conteos" and "eventos" lists.',
  'Mandá hasta 5000 "horas" por vez.': 'Send up to 5000 "horas" at a time.',
  'Mandá una lista "horas".': 'Send an "horas" list.',
};
