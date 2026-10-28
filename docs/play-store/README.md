# Publicar Patty en Google Play

Lo que ya está listo y lo que falta hacer desde la consola de Google Play.

## Ya listo

- **El paquete firmado (AAB):** `apps/web/android/app/build/outputs/bundle/release/app-release.aab`. Se arma con
  `cd apps/web && npx cap sync android && cd android && ./gradlew bundleRelease`.
- **La llave de subida:** está en `~/patty-release/`, fuera del repositorio: `patty-upload.jks` y `keystore.properties`
  con la contraseña. **Hacé una copia en un lugar seguro**, por ejemplo un gestor de contraseñas. Si se pierde, se puede
  pedir a Google que la cambie, pero lleva días. Google firma la app con su propia llave (Play App Signing).
- **El ícono** de 512 × 512: `icono-512.png`.
- **El gráfico destacado** de 1024 × 500: `grafico-destacado.png`.
- **Las capturas** del teléfono, en `capturas/`.
- **La política de privacidad:** https://patty.today/privacidad.html
- **Borrar la cuenta:** desde la app (Más → Tu cuenta → Borrar mi cuenta), y la página https://patty.today/borrar-cuenta.html
  para indicarlo en la consola.

## Pasos en la consola

1. Crear la cuenta de desarrollador en https://play.google.com/console (pago único de US$ 25 y verificación de
   identidad).
2. **Crear app:**
   - Nombre: «Patty»
   - Idioma predeterminado: español (Latinoamérica)
   - Tipo: aplicación
   - Precio: gratis
3. **Prueba interna:** crear una versión y subir `app-release.aab`. Aceptar Play App Signing. Sumar a los testers
   por correo. Con eso ya se instala desde Play, sin esperar la revisión completa.
4. **Ficha de la tienda:** completar con los textos de abajo, el ícono, el gráfico y las capturas.
   - Categoría: Salud y bienestar.
   - Correo de contacto: rbutta@gmail.com
5. **Contenido de la app:**
   - completar el contenido de la app (política de privacidad, anuncios: no, acceso a la app);
   - completar la seguridad de los datos (ver abajo) y las declaraciones de permisos (ver abajo);
   - para que revisen la app, dejarles un usuario de prueba con datos de ejemplo.

## Textos de la ficha

**Descripción corta (80):** Contale tu día y descubrí qué cosas se relacionan: sueño, comida, ánimo y más.

**Descripción completa:**

Patty es un búho que te acompaña a entender tu día. Contale lo que comés, cómo dormís, cómo te sentís o si algo te
dolió: con la voz, con una foto del plato o con un toque. Patty lo ordena solo, con la hora de cada cosa.

Con el tiempo, Patty encuentra lo que se relaciona en tu vida. Por ejemplo, que las noches que dormís poco aparece el
dolor de cabeza, o que los días que caminás estás de mejor ánimo. Te lo cuenta en palabras simples.

• Anotar en segundos: contándolo, con una foto o con las caritas.
• Lo que junta sola: el sueño y los pasos del reloj (Health Connect), los viajes y paseos, el clima y el uso del teléfono.
• Patrones: qué va con qué, y vos le decís si te sirve.
• ¿Qué pasó antes?: cuando anotás un dolor, mira las horas anteriores.
• Resumen de la semana, objetivos suaves y avisos cuando algo se sale de lo normal.
• Seguimientos para cuando estás enfermo o en recuperación, que puede activar alguien de tu familia.
• Widget en la pantalla de inicio.

Patty no hace diagnósticos: te muestra relaciones en tus datos para que las veas vos y, si querés, las charles con un
profesional.

## Seguridad de los datos (respuestas)

- **Datos que se recopilan** (todos para el funcionamiento de la app, ninguno para publicidad):
  - Ubicación aproximada y precisa: viajes, lugares, clima y paseos.
  - Salud y actividad física: sueño, pasos, pulso y lo que se anota.
  - Información personal: nombre, correo (si entra con Google) y fecha de nacimiento (opcional).
  - Actividad en la app: pantallas y uso, con Google Analytics y un identificador anónimo.
  - Calendario: solo horarios y cantidad de invitados de las reuniones, nunca títulos ni personas.
  - Audio: lo dictado se pasa a texto y no se guarda.
  - Fotos: la del plato se analiza y no se guarda.
- **Compartidos con terceros (procesamiento):**
  - Anthropic: interpretar lo que se cuenta y las fotos.
  - OpenAI: pasar el audio a texto.
  - Google: Analytics y avisos push con Firebase.
- **En tránsito:** cifrados (HTTPS).
- **Borrado:** la persona puede borrar su cuenta y sus datos desde la app.

## Permisos que Google revisa (ojo)

| Permiso | Para qué | Qué esperar |
|---|---|---|
| `ACCESS_BACKGROUND_LOCATION` | viajes, paseos y fin de actividades con la app cerrada | Hay que declararlo y mandar un video corto mostrando la función. Suelen aprobarlo si está bien explicado. |
| `READ_CALL_LOG` | cuántas llamadas por día (con historial) | **Muy probable que lo rechacen**: Google lo reserva para apps de teléfono o SMS predeterminadas. Si lo rechazan, se saca esta línea del manifiesto y nada más: la app usa sola el plan B de abajo. |
| `READ_PHONE_STATE` | plan B de las llamadas: las mide mientras pasan (`LlamadasReceiver`), sin números | No está restringido. Solo cuenta desde que se da el permiso. |
| `QUERY_ALL_PACKAGES` | el nombre de cada app en el uso del teléfono | Hay que declararlo; puede pedir justificación. Se puede reemplazar por consultas puntuales si lo objetan. |
| `PACKAGE_USAGE_STATS` | tiempo de pantalla | Lo da la persona en Ajustes; declararlo en el formulario. |
| `USE_EXACT_ALARM` | avisos de remedios a la hora exacta | Google lo limita a apps de alarma o calendario; si lo objetan, pasar a `SCHEDULE_EXACT_ALARM`. |
| Health Connect | sueño, pasos, pulso | Completar el formulario de Health Connect con cada tipo de dato y para qué se usa. |
| `READ_CALENDAR`, `RECORD_AUDIO`, `CAMERA` | reuniones, dictar, foto del plato | Normales: los pide la app al usarlos. |
