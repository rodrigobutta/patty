# La portada de la presentación: un teléfono que junta lo más propio de Patty en una sola pantalla: un hallazgo
# (Comida frita → Dolor de panza) y el calendario del sueño. Se arma recortando dos capturas de verdad (patrones.webp y
# calendario.webp, de capturar.mjs) y queda en public/presentacion/portada.webp. Uso: python3 portada.py
from pathlib import Path
from PIL import Image

aqui = Path(__file__).parent
dir_ = aqui / '../../public/presentacion'
pat = Image.open(dir_ / 'patrones.webp').convert('RGB')
cal = Image.open(dir_ / 'calendario.webp').convert('RGB')
W, H = pat.size
fondo = cal.getpixel((8, 1450))

tramos = [
    (pat, 0, 740),      # arriba, las pestañas y el hallazgo hasta su explicación
    (pat, 925, 975),    # el final de la tarjeta (sin los botones de "¿Te sirve?")
    (cal, 425, 1075),   # el calendario del sueño
    (cal, 1335, 1380),  # el final de su tarjeta
]
alto_tramos = sum(b - a for _, a, b in tramos)
nav = (cal, H - 133, H)
out = Image.new('RGB', (W, H), fondo)
y = 0
for img, a, b in tramos:
    out.paste(img.crop((0, a, W, b)), (0, y))
    y += b - a
out.paste(nav[0].crop((0, nav[1], W, nav[2])), (0, H - 133))
out.save(dir_ / 'portada.webp', quality=88)
print('portada.webp', out.size, 'contenido', alto_tramos)
