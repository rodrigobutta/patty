# La portada de la presentación: lo más propio de Patty, lo que descubre. Junta en una pantalla los dos primeros
# hallazgos (sin los botones de "¿Te sirve?") recortando una captura de verdad (hallazgos.webp, de capturar.mjs), y
# queda en public/presentacion/portada.webp. Abajo asoma el hallazgo que sigue (de patrones.webp), como si siguiera
# la pantalla. Uso: python3 portada.py
from pathlib import Path
from PIL import Image, ImageDraw

aqui = Path(__file__).parent
dir_ = aqui / '../../public/presentacion'
h = Image.open(dir_ / 'hallazgos.webp').convert('RGB')
sig = Image.open(dir_ / 'patrones.webp').convert('RGB')
W, H = h.size
fondo = h.getpixel((8, 1000))

# El encabezado fijo deja ver, apenas, el texto de una tarjeta de más arriba: se tapa con el color del fondo.
arriba = h.crop((0, 0, W, 275))
ImageDraw.Draw(arriba).rectangle((135, 103, 725, 112), fill=h.getpixel((400, 98)))

final_tarjeta = h.crop((0, 925, W, 968))  # el borde de abajo de una tarjeta, con su respiro
tramos = [
    arriba,
    h.crop((0, 275, W, 742)),     # Menos horas de sueño → Un día peor, hasta su explicación
    final_tarjeta,
    h.crop((0, 980, W, 1445)),    # Comida frita → Dolor de panza, hasta su explicación
    final_tarjeta,
]
out = Image.new('RGB', (W, H), fondo)
y = 0
for t in tramos:
    out.paste(t, (0, y))
    y += t.height
# Lo que queda hasta la barra de abajo: el principio del hallazgo que sigue (que continúa debajo de la barra).
NAV = 130
out.paste(sig.crop((0, 983, W, 983 + H - NAV - y)), (0, y))
# La barra de abajo, de una captura donde no asoma nada detrás (las demás tienen pestañas de Descubrir iguales).
barra = Image.open(dir_ / 'calendario.webp').convert('RGB')
out.paste(barra.crop((0, H - NAV, W, H)), (0, H - NAV))
out.save(dir_ / 'portada.webp', quality=88)
print('portada.webp', out.size, 'contenido', y)
