// Cómo dar cada permiso, paso a paso, según el teléfono: los menús cambian de marca a marca (Samsung, Xiaomi, Motorola,
// Pixel) y en el iPhone. La marca se saca del navegador de la app (el modelo viene en el user agent).
import { registerPlugin } from '@capacitor/core';
import { t } from './idioma';
import { plataforma } from './nativo';

export type Marca = 'iphone' | 'samsung' | 'xiaomi' | 'oppo' | 'huawei' | 'motorola' | 'pixel' | 'android';

const Mascota = registerPlugin<{ telefono(): Promise<{ marca: string; modelo: string }> }>('Mascota');
let delSistema: string | null = null;
/** Pregunta la marca al teléfono (el modelo del navegador a veces no la dice, como en los OPPO y OnePlus). */
export async function averiguarMarca(): Promise<Marca> {
  if (plataforma() === 'android' && delSistema === null) {
    delSistema = await Mascota.telefono()
      .then((r) => `${r.marca} ${r.modelo}`)
      .catch(() => '');
  }
  return marcaDelTelefono();
}
export type PermisoGuia = 'avisos' | 'ubicacion' | 'bateria' | 'telefono' | 'salud' | 'escuchas';

export function marcaDelTelefono(ua = `${delSistema ?? ''} ${typeof navigator === 'undefined' ? '' : navigator.userAgent}`): Marca {
  if (plataforma() === 'ios' || /iPhone|iPad/.test(ua)) return 'iphone';
  if (/\b(OPPO|OnePlus|realme)\b|CPH\d{4}|RMX\d{4}/i.test(ua)) return 'oppo';
  if (/SM-[A-Z0-9]|Samsung|SAMSUNG|Galaxy/.test(ua)) return 'samsung';
  if (/\b(HUAWEI|HONOR)\b/i.test(ua)) return 'huawei';
  if (/Redmi|POCO|Xiaomi|\bMi \d|; M2\d{3}|; 2\d{3}[0-9A-Z]{3,}/.test(ua)) return 'xiaomi';
  if (/moto|Motorola|XT\d{4}/i.test(ua)) return 'motorola';
  if (/Pixel/.test(ua)) return 'pixel';
  return 'android';
}

export const NOMBRE_MARCA: Record<Marca, string> = {
  iphone: 'iPhone',
  samsung: 'Samsung',
  xiaomi: 'Xiaomi / Redmi / POCO',
  oppo: 'OPPO / OnePlus / realme',
  huawei: 'Huawei / Honor',
  motorola: 'Motorola',
  pixel: 'Pixel',
  android: 'Android',
};

/** Los pasos para dar un permiso en esta marca de teléfono (ya traducidos). */
export function pasosPara(permiso: PermisoGuia, marca: Marca): string[] {
  const buscar = (que: string) => t('¿No lo encontrás? Buscá «{que}» en Ajustes.', { que: t(que) });
  if (marca === 'iphone') {
    if (permiso === 'avisos') return [t('Abrí Ajustes → Notificaciones → Patty.'), t('Prendé «Permitir notificaciones».')];
    if (permiso === 'ubicacion') return [t('Abrí Ajustes y bajá hasta Patty.'), t('Tocá Ubicación.'), t('Elegí «Siempre» y dejá prendida «Ubicación exacta».')];
    if (permiso === 'salud') return [t('Abrí la app Salud y tocá tu foto (arriba a la derecha).'), t('Entrá a Apps → Patty.'), t('Tocá «Activar todo» y después OK.')];
    return [];
  }
  const abrirPatty =
    marca === 'samsung'
      ? t('Abrí Ajustes → Aplicaciones → Patty.')
      : marca === 'xiaomi'
        ? t('Abrí Ajustes → Aplicaciones → Administrar aplicaciones → Patty.')
        : t('Mantené apretado el ícono de Patty y tocá ⓘ (Información de la app).');
  const permisos = marca === 'xiaomi' ? t('Permisos de la aplicación') : t('Permisos');
  switch (permiso) {
    case 'avisos':
      return [abrirPatty, t('Tocá Notificaciones y prendé «Mostrar notificaciones» (o «Todas las notificaciones de Patty»).'), t('Revisá que «Remedios» también esté prendido.')];
    case 'ubicacion':
      return [
        abrirPatty,
        t('Tocá {permisos} → Ubicación y elegí «Permitir todo el tiempo». Dejá prendida «Usar ubicación precisa».', { permisos }),
        marca === 'samsung'
          ? t('Volvé a la pantalla de Patty → Batería y elegí «Sin restricciones», así el teléfono no la frena.')
          : marca === 'xiaomi'
            ? t('En la misma pantalla de Patty: «Ahorro de batería» → «Sin restricciones», y prendé «Inicio automático».')
            : marca === 'oppo'
              ? t('En la misma pantalla de Patty: «Uso de batería» → prendé «Permitir actividad en segundo plano» y «Permitir inicio automático».')
            : t('En la misma pantalla: Batería (o «Uso de batería de la app») → «Sin restricciones».'),
        buscar('Patty'),
      ];
    case 'bateria': {
      const cartel = t('Tocá «Activar» y aceptá el cartel de Android: así no le aplica sus límites de batería a Patty.');
      // Esto Android no se lo cuenta a ninguna app: por eso hay que decirlo, y por eso la fila no puede tildarlo.
      const sinTilde = t('Patty no puede saber si estos ajustes quedaron prendidos: el tilde de acá arriba es solo por el cartel de Android.');
      const candado = t('En las apps recientes, mantené apretada la tarjeta de Patty y tocá el candado, así no se cierra al limpiar.');
      if (marca === 'oppo') {
        return [
          cartel,
          t('Mantené apretado el ícono de Patty, tocá ⓘ y entrá a «Uso de batería»: prendé «Permitir actividad en segundo plano» y «Permitir inicio automático».'),
          t('En las apps recientes, tocá ⋮ en la tarjeta de Patty (o mantenela apretada) y elegí «Bloquear», así no se cierra al limpiar.'),
          sinTilde,
          buscar('inicio automático'),
        ];
      }
      if (marca === 'xiaomi') {
        return [cartel, t('Abrí Ajustes → Aplicaciones → Administrar aplicaciones → Patty: prendé «Inicio automático» y en «Ahorro de batería» elegí «Sin restricciones».'), candado, sinTilde, buscar('inicio automático')];
      }
      if (marca === 'samsung') {
        return [cartel, t('Abrí Ajustes → Aplicaciones → Patty → Batería y elegí «Sin restricciones».'), t('En Ajustes → Mantenimiento del dispositivo → Batería → Límites de uso en segundo plano, fijate que Patty no esté entre las apps en suspensión.'), sinTilde];
      }
      if (marca === 'huawei') {
        return [cartel, t('Abrí Ajustes → Batería → Inicio de aplicaciones → Patty: apagá «Administrar automáticamente» y dejá prendidas las tres opciones.'), candado, sinTilde];
      }
      return [cartel, t('En la misma pantalla: Batería (o «Uso de batería de la app») → «Sin restricciones».')];
    }
    case 'telefono':
      return [
        marca === 'samsung'
          ? t('Abrí Ajustes → Aplicaciones, tocá ⋮ (arriba a la derecha) → Acceso especial.')
          : marca === 'xiaomi'
            ? t('Abrí Ajustes y buscá «acceso de uso» (puede llamarse «Apps con acceso de uso»).')
            : t('Abrí Ajustes → Apps → Acceso especial de apps (en algunos teléfonos está dentro de «Avanzado»).'),
        t('Entrá a «Acceso a datos de uso», buscá Patty y activá «Permitir acceso al uso».'),
        t('Para las llamadas: {abrir} Después {permisos} → Registro de llamadas (o Teléfono) → «Permitir».', { abrir: abrirPatty, permisos }),
        buscar('acceso de uso'),
      ];
    case 'escuchas':
      return [
        marca === 'samsung'
          ? t('Abrí Ajustes → Notificaciones → Configuración avanzada → Acceso a notificaciones (o «Leer notificaciones»).')
          : marca === 'xiaomi'
            ? t('Abrí Ajustes → Privacidad (o Contraseñas y seguridad) → Acceso especial → Acceso a notificaciones.')
            : t('Abrí Ajustes → Apps → Acceso especial de apps → Acceso a notificaciones (o «Notificaciones del dispositivo y la app»).'),
        t('Buscá Patty, prendelo y aceptá el aviso de Android.'),
        t('El texto de tus mensajes y de tus avisos nunca sale del teléfono: Patty se queda solo con lo que prendas en Permisos.'),
        buscar('acceso a notificaciones'),
      ];
    case 'salud':
      return [
        t('Si no tenés Health Connect, instalalo desde Play Store (es de Google; desde Android 14 ya viene en Ajustes).'),
        marca === 'samsung'
          ? t('Abrí Ajustes → Seguridad y privacidad → Privacidad → Health Connect.')
          : t('Abrí Health Connect (o Ajustes → Seguridad y privacidad → Privacidad → Health Connect).'),
        t('Entrá a Permisos de apps → Patty y activá «Permitir todo».'),
        marca === 'samsung'
          ? t('Si usás un Galaxy Watch: en Samsung Health, ⋮ → Ajustes → Health Connect, y activá que comparta los datos.')
          : t('Si usás reloj, abrí su app (Fitbit, Mi Fitness, Garmin…) y activá que comparta los datos con Health Connect.'),
        buscar('Health Connect'),
      ];
  }
}
