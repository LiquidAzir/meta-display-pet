"""Generate the GlassPet favicon: a glowing glassy cyan egg-pet on a dark
rounded plate. Rendered at 4x supersampling for smooth edges, then downscaled.

Outputs favicon.png (512x512) at the repo root. Bright subject on a dark plate
so it reads on a browser tab AND blends on the additive glasses display (where
black reads as transparent, leaving the egg + glow floating)."""

import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SCRATCH = Path(r"C:\Users\kgood\AppData\Local\Temp\claude\C--Development-Meta-Display-Apps-meta-display-pet\1a290fe1-449d-472f-bcde-21b0d5582803\scratchpad")

M = 2048              # supersample master size
FINAL = 512           # output size

# --- geometry (fractions of M) -------------------------------------------
cx, cy = M * 0.5, M * 0.475
A, B = M * 0.242, M * 0.312      # egg half-width / half-height
TAPER = 0.16                     # narrows the top for an egg silhouette
PLATE_INSET, PLATE_RADIUS = int(M * 0.06), int(M * 0.235)

# --- helpers --------------------------------------------------------------

def hx(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

def lerp(a, b, t): return a + (b - a) * t

def grad_color(stops, t):
    t = max(0.0, min(1.0, t))
    for i in range(len(stops) - 1):
        p0, c0 = stops[i]; p1, c1 = stops[i + 1]
        if t <= p1:
            f = (t - p0) / (p1 - p0) if p1 > p0 else 0.0
            return tuple(int(lerp(c0[k], c1[k], f)) for k in range(3))
    return stops[-1][1]

def vgrad(stops, y0, y1):
    """Vertical gradient across the whole canvas (built as a column, resized)."""
    col = Image.new('RGB', (1, M))
    p = col.load()
    for y in range(M):
        p[0, y] = grad_color(stops, (y - y0) / (y1 - y0))
    return col.resize((M, M)).convert('RGBA')

def egg_mask(scale=1.0, n=720):
    m = Image.new('L', (M, M), 0)
    d = ImageDraw.Draw(m)
    pts = []
    for i in range(n):
        th = 2 * math.pi * i / n
        rx = A * (1 - TAPER * math.sin(th)) * scale
        pts.append((cx + rx * math.cos(th), cy - B * scale * math.sin(th)))
    d.polygon(pts, fill=255)
    return m

def clip(img, mask):
    return Image.composite(img, Image.new('RGBA', (M, M), (0, 0, 0, 0)), mask)

def scale_alpha(img, f):
    r, g, b, a = img.split()
    return Image.merge('RGBA', (r, g, b, a.point(lambda v: int(v * f))))

def solid(color):
    return Image.new('RGBA', (M, M), hx(color) + (255,))

# --- compose --------------------------------------------------------------

canvas = Image.new('RGBA', (M, M), (0, 0, 0, 0))

# 1. dark rounded plate
plate = vgrad([(0.0, hx('#181834')), (1.0, hx('#05050f'))], 0, M)
plate_mask = Image.new('L', (M, M), 0)
ImageDraw.Draw(plate_mask).rounded_rectangle(
    [PLATE_INSET, PLATE_INSET, M - PLATE_INSET, M - PLATE_INSET],
    radius=PLATE_RADIUS, fill=255)
canvas = Image.composite(plate, canvas, plate_mask)

mask_full = egg_mask(1.0)
mask_body = egg_mask(0.965)

# 2. cyan glow behind the egg (clipped to the plate so the badge stays clean)
glow = clip(solid('#00d4ff'), egg_mask(1.14)).filter(ImageFilter.GaussianBlur(M * 0.06))
glow = clip(scale_alpha(glow, 0.8), plate_mask)
canvas = Image.alpha_composite(canvas, glow)

# 3. thin dark rim for edge definition
canvas = Image.alpha_composite(canvas, clip(solid('#073a56'), mask_full))

# 4. glassy body gradient
body = vgrad([(0.0, hx('#9df4ff')), (0.20, hx('#4fdcff')), (0.48, hx('#10bff2')),
              (0.74, hx('#0a8ece')), (1.0, hx('#075f96'))], cy - B, cy + B)
canvas = Image.alpha_composite(canvas, clip(body, mask_body))

# 5. specular sheen (upper-left), clipped to the egg
spec = Image.new('RGBA', (M, M), (0, 0, 0, 0))
sx, sy = cx - 0.09 * M, cy - 0.12 * M
ImageDraw.Draw(spec).ellipse([sx - 0.17 * M, sy - 0.11 * M, sx + 0.17 * M, sy + 0.11 * M],
                             fill=(255, 255, 255, 255))
spec = clip(scale_alpha(spec.filter(ImageFilter.GaussianBlur(M * 0.05)), 0.55), mask_body)
canvas = Image.alpha_composite(canvas, spec)

# 6. bright rim-light along the top edge (glass)
rl = Image.new('RGBA', (M, M), (0, 0, 0, 0))
ImageDraw.Draw(rl).arc([cx - A * 0.965, cy - B * 0.965, cx + A * 0.965, cy + B * 0.965],
                       start=202, end=338, fill=(255, 255, 255, 255), width=int(M * 0.012))
rl = clip(scale_alpha(rl.filter(ImageFilter.GaussianBlur(M * 0.008)), 0.5), mask_body)
canvas = Image.alpha_composite(canvas, rl)

# 7. cute pet eyes + catchlights
eyes = Image.new('RGBA', (M, M), (0, 0, 0, 0))
ed = ImageDraw.Draw(eyes)
def eye(ex, ey):
    rx, ry = 0.043 * M, 0.056 * M
    ed.ellipse([ex - rx, ey - ry, ex + rx, ey + ry], fill=hx('#0a1420') + (255,))
    cr = 0.016 * M
    lx, ly = ex - 0.014 * M, ey - 0.020 * M
    ed.ellipse([lx - cr, ly - cr, lx + cr, ly + cr], fill=(255, 255, 255, 255))
eye(cx - 0.076 * M, cy + 0.022 * M)
eye(cx + 0.076 * M, cy + 0.022 * M)
# small friendly smile
ed.arc([cx - 0.045 * M, cy + 0.070 * M, cx + 0.045 * M, cy + 0.130 * M],
       start=18, end=162, fill=hx('#0a1420') + (210,), width=int(M * 0.011))
canvas = Image.alpha_composite(canvas, eyes)

# 8. sparkles (4-point stars with a soft glow)
sp = Image.new('RGBA', (M, M), (0, 0, 0, 0))
spd = ImageDraw.Draw(sp)
def sparkle(px, py, r):
    spd.polygon([(px, py - r), (px + r * 0.26, py), (px, py + r), (px - r * 0.26, py)], fill=(255, 255, 255, 255))
    spd.polygon([(px - r, py), (px, py + r * 0.26), (px + r, py), (px, py - r * 0.26)], fill=(255, 255, 255, 255))
sparkle(cx + 0.108 * M, cy - 0.160 * M, 0.052 * M)
sparkle(cx + 0.162 * M, cy - 0.058 * M, 0.024 * M)
canvas = Image.alpha_composite(canvas, scale_alpha(sp.filter(ImageFilter.GaussianBlur(M * 0.012)), 0.7))
canvas = Image.alpha_composite(canvas, sp)

# --- output ---------------------------------------------------------------
final = canvas.resize((FINAL, FINAL), Image.LANCZOS)
final.save(ROOT / 'favicon.png')
print(f"saved {ROOT / 'favicon.png'}  {final.size}")

# small previews (scratchpad) to check readability at tab sizes
for s in (128, 64, 32, 16):
    final.resize((s, s), Image.LANCZOS).save(SCRATCH / f'fav-{s}.png')
# a contact sheet: previews on white and on black
sheet = Image.new('RGBA', (FINAL + 320, FINAL), (0, 0, 0, 0))
sheet.paste(final, (0, 0), final)
white = Image.new('RGBA', (300, FINAL), (255, 255, 255, 255))
black = Image.new('RGBA', (300, FINAL), (0, 0, 0, 255))
for bg, oy in ((white, 0),):
    pass
# on-black strip (simulates glasses) + on-white strip (simulates light tab)
strip = Image.new('RGBA', (300, FINAL), (0, 0, 0, 255))
y = 10
for s in (128, 64, 32, 16):
    ic = final.resize((s, s), Image.LANCZOS)
    strip.alpha_composite(ic, (20, y)); y += s + 12
sheet.alpha_composite(strip, (FINAL + 20, 0))
sheet.save(SCRATCH / 'fav-sheet-black.png')
wsheet = Image.new('RGBA', (FINAL, FINAL), (255, 255, 255, 255))
wsheet.alpha_composite(final)
wsheet.save(SCRATCH / 'fav-on-white.png')
print("previews written to scratchpad")
