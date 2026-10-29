# La portada de la presentación: lo más propio de Patty, lo que descubre. Arriba el hallazgo combinado (comida frita +
# menstruación + día de calor → dolor de panza), sin los botones de "¿Te sirve?", y abajo el siguiente, que sigue
# debajo de la barra. Se arma recortando una captura de verdad (hallazgos.webp, de capturar.mjs) y queda en
# public/presentacion/portada.webp. Uso: python3 portada.py
from pathlib import Path
from PIL import Image, ImageDraw

aqui = Path(__file__).parent
dir_ = aqui / '../../public/presentacion'
h = Image.open(dir_ / 'hallazgos.webp').convert('RGB')
W, H = h.size
NAV = 130
fondo = h.getpixel((8, 1105))

# El encabezado fijo deja ver, apenas, el texto de una tarjeta de más arriba: se tapa con el color del fondo.
arriba = h.crop((0, 0, W, 275))
ImageDraw.Draw(arriba).rectangle((135, 103, 725, 112), fill=h.getpixel((400, 98)))

tramos = [
    arriba,
    h.crop((0, 275, W, 860)),    # el combinado, hasta su explicación
    h.crop((0, 1066, W, 1118)),  # el final de esa tarjeta (sin los botones) y el respiro hasta la siguiente
]
out = Image.new('RGB', (W, H), fondo)
y = 0
for t in tramos:
    out.paste(t, (0, y))
    y += t.height
# El hallazgo siguiente, que sigue debajo de la barra de abajo. Lo que no entra en esta captura sale de patrones.webp,
# donde ese mismo hallazgo está arriba de todo (empieza en 275).
visible = H - NAV - 1118
out.paste(h.crop((0, 1118, W, H - NAV)), (0, y))
y += visible
sig = Image.open(dir_ / 'patrones.webp').convert('RGB')
if y < H - NAV:
    out.paste(sig.crop((0, 275 + visible, W, 275 + visible + H - NAV - y)), (0, y))
out.paste(h.crop((0, H - NAV, W, H)), (0, H - NAV))
out.save(dir_ / 'portada.webp', quality=88)
print('portada.webp', out.size)
