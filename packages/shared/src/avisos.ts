// Lo que avisan las apps del teléfono (solo Android, con el «acceso a las notificaciones»; ver AvisosTelefono.java):
// cuántos avisos llegan y cuándo, cuántos mensajes, y lo que dicen los avisos de pedidos de comida, viajes con chofer
// y ejercicio, leído en el teléfono. Cada cosa tiene su interruptor. Acá van los nombres, las apps y las reglas comunes.
// Acá no se importa de index.ts (lo exporta él: sería circular).

/** Las cinco cosas que se pueden prender o apagar, en el orden en que se muestran. */
export const FUNCIONES_AVISOS = ['interrupciones', 'social', 'pedidos', 'viajes', 'ejercicio'] as const;
export type FuncionAvisos = (typeof FUNCIONES_AVISOS)[number];
export type FuncionesAvisos = Record<FuncionAvisos, boolean>;

/** Los conceptos que llenan (mediciones de la fuente de la app). */
export const NOTIFICACIONES = 'Notificaciones';
export const NOTIFICACIONES_NOCHE = 'Notificaciones de noche';
export const MENSAJES_RECIBIDOS = 'Mensajes recibidos';
export const CONCEPTOS_AVISOS = [NOTIFICACIONES, NOTIFICACIONES_NOCHE, MENSAJES_RECIBIDOS];

/** La noche, para los avisos que pueden despertar: de 23 a 7 (hora de la persona). */
export const NOCHE_DESDE = 23;
export const NOCHE_HASTA = 7;
export const esHoraDeNoche = (h: number) => h >= NOCHE_DESDE || h < NOCHE_HASTA;

export type TipoAviso = 'pedido' | 'viaje' | 'ejercicio';
export const TIPOS_AVISO: TipoAviso[] = ['pedido', 'viaje', 'ejercicio'];

/** Las apps de cada tipo (la clave es la que manda el teléfono) con su nombre. */
export const APPS_AVISO: Record<TipoAviso, Record<string, string>> = {
  pedido: { pedidosya: 'PedidosYa', rappi: 'Rappi', ubereats: 'Uber Eats', didifood: 'DiDi Food' },
  viaje: { uber: 'Uber', cabify: 'Cabify', didi: 'DiDi' },
  ejercicio: {
    strava: 'Strava',
    nikerun: 'Nike Run Club',
    googlefit: 'Google Fit',
    samsunghealth: 'Samsung Health',
    garmin: 'Garmin Connect',
    adidasrunning: 'adidas Running',
    huaweihealth: 'Huawei Health',
    mifitness: 'Mi Fitness',
    zepp: 'Zepp',
    fitbit: 'Fitbit',
  },
};
export const nombreAppAviso = (tipo: TipoAviso, app: string) => APPS_AVISO[tipo][app] ?? app;

/** Las etapas de cada tipo, en orden: la última que se vio dice dónde va. */
export const ETAPAS_AVISO: Record<TipoAviso, string[]> = {
  pedido: ['en_camino', 'entregado'],
  viaje: ['llegando', 'en_viaje', 'terminado'],
  ejercicio: ['terminado'],
};

/** Los deportes que se reconocen y con qué actividad se anotan. */
export const DEPORTES_AVISO: Record<string, string> = {
  correr: 'Correr',
  bici: 'Bici',
  caminata: 'Caminata',
  natacion: 'Natación',
  yoga: 'Yoga',
  gym: 'Gimnasio',
  ejercicio: 'Ejercicio',
};

/** Lo que manda el teléfono de cada hora y app: cuántos avisos, cuántos sonaron, cuántos con la pantalla apagada y cuántos mensajes. */
export interface ConteoAvisos {
  paquete: string;
  app: string;
  /** El principio de la hora (ms). */
  hora: number;
  n: number;
  sonoras: number;
  apagada: number;
  mensajes: number;
}

/** Lo que se entendió de un aviso de pedidos, viajes o ejercicio (nunca el texto). */
export interface EventoAviso {
  tipo: TipoAviso;
  app: string;
  evento: string;
  /** Cuándo llegó el aviso (ms). */
  instante: number;
  deporte?: string;
  km?: number;
  minutos?: number;
}

/** El detalle del Día: los avisos por hora y por app, la noche y los mensajes. */
export interface AvisosDelDia {
  notificaciones: {
    total: number;
    sonoras: number;
    apagada: number;
    /** 24 números: cuántos llegaron en cada hora (de 0 a 23, hora de la persona). */
    por_hora: number[];
    apps: Array<{ app: string; n: number }>;
    /** La noche que termina este día (de 23 a 7): cuántos llegaron y cuántos sonaron. */
    noche: { total: number; sonoras: number; apagada: number } | null;
  } | null;
  mensajes: { total: number; apps: Array<{ app: string; n: number }> } | null;
}

/** Un pedido o un viaje que Patty vio y pregunta. */
export interface AvisoPendiente {
  id: number;
  tipo: 'pedido' | 'viaje';
  app: string;
  /** El pedido: cuándo llegó. El viaje: cuándo empezó (o se pidió). */
  inicio: string;
  fin: string | null;
  minutos: number | null;
}

/** Qué servicio de mensajes es cada app (para mostrar «WhatsApp» y no «com.whatsapp»). */
export const NOMBRES_MENSAJERIA: Record<string, string> = {
  'com.whatsapp': 'WhatsApp',
  'com.whatsapp.w4b': 'WhatsApp Business',
  'org.telegram.messenger': 'Telegram',
  'org.telegram.messenger.web': 'Telegram',
  'org.thunderdog.challegram': 'Telegram',
  'com.instagram.android': 'Instagram',
  'com.facebook.orca': 'Messenger',
  'com.facebook.mlite': 'Messenger',
  'org.thoughtcrime.securesms': 'Signal',
  'com.google.android.apps.messaging': 'SMS',
  'com.samsung.android.messaging': 'SMS',
  'com.android.mms': 'SMS',
  'com.android.messaging': 'SMS',
};
