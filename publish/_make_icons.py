"""Generate several app icon concepts using actual game sprites."""

from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

OUT = Path(__file__).parent

# ---------- sprite data (mirrors app.js) ---------------------------------

EGG_TEMPLATE = [
    '................',
    '................',
    '......0000......',
    '.....022210.....',
    '....02211110....',
    '...0221111110...',
    '..022111111110..',
    '.02211111111110.',
    '.02111111111110.',
    '.02111111111110.',
    '.02111111111110.',
    '.03111111111130.',
    '..033111111330..',
    '...0331111330...',
    '....03333330....',
    '.....033330.....',
]

def apply_overlay(rows, overlay):
    out = list(rows)
    for i, line in enumerate(overlay):
        base = list(out[i + 2])
        for c in range(16):
            oc = line[c] if c < len(line) else '.'
            if oc in ('.', ' '): continue
            if base[c] in ('1', '2'): base[c] = oc
        out[i + 2] = ''.join(base)
    return out

# Egg overlays (rows 2..15 only, 14 lines)
FLAME_OVERLAY = [
    '................',
    '................',
    '.......44.......',
    '......4444......',
    '.....544444.....',
    '.....544544.....',
    '.....544445.....',
    '......4444......',
    '.......44.......',
    '................',
    '................',
    '................',
    '................',
    '................',
]
STAR_OVERLAY = [
    '................',
    '................',
    '.......5........',
    '......4.4.......',
    '.....5...5......',
    '......4.4.......',
    '.......5........',
    '..........5.....',
    '.........4.4....',
    '..........5.....',
    '....5...........',
    '...4.4..........',
    '....5...........',
    '................',
]
LEAF_OVERLAY = [
    '................',
    '................',
    '......555.......',
    '.....55555......',
    '....55444455....',
    '...555444555....',
    '....55444455....',
    '.....55555......',
    '......555.......',
    '................',
    '................',
    '................',
    '................',
    '................',
]
CRYSTAL_OVERLAY = [
    '................',
    '................',
    '.......5........',
    '......454.......',
    '.....45554......',
    '....4555554.....',
    '.....45554......',
    '......454.......',
    '.......5........',
    '......454.......',
    '.....45554......',
    '......454.......',
    '.......5........',
    '................',
]

EGGS = {
    'flame':   (FLAME_OVERLAY,   {'0':'#3a0a00','1':'#ff5a1a','2':'#ffb070','3':'#9c2200','4':'#ffe46a','5':'#ffd83a'}),
    'star':    (STAR_OVERLAY,    {'0':'#04102a','1':'#1f4dff','2':'#7aa6ff','3':'#0b2070','4':'#ffffff','5':'#9ee0ff'}),
    'leaf':    (LEAF_OVERLAY,    {'0':'#0a2010','1':'#3aa84a','2':'#9be07a','3':'#1f5a2a','4':'#ffe27a','5':'#1d5a25'}),
    'crystal': (CRYSTAL_OVERLAY, {'0':'#0e051e','1':'#a96bff','2':'#e0bcff','3':'#5a25a0','4':'#ffffff','5':'#ffd1ff'}),
}

# Adult crystal body (Diamond Lord)
ADULT_CRYSTAL = [
    '....B...B...B...',
    '....BB.BBB.BB...',
    '....BBBBBBBBB...',
    '...0000000000...',
    '..02222222220...',
    '.0221111111220..',
    '.0211556655120..',
    '.0216560065612.0',
    '.0211556655120..',
    '.0211111111120..',
    '.0211177771120..',
    '.0211111111120..',
    '.0221111111220..',
    '.0331111111330..',
    '..0331....1330..',
    '..0.0......0.0..',
]
PAL_CRYSTAL_PET = {
    '0':'#0e051e','1':'#c489ff','2':'#ecd0ff','3':'#5a25a0','5':'#ffffff',
    '6':'#0a0010','7':'#3a1060','B':'#ffd83a','A':'#e0bcff'
}

# Baby leaf (Sprout)
BABY_BODY = [
    '................',
    '................',
    '................',
    '......0000......',
    '.....022210.....',
    '....02211110....',
    '...0221111110...',
    '..022111111120..',
    '..021551155120..',
    '..021560065120..',
    '..021111111120..',
    '..021117711120..',
    '..021111111120..',
    '..033111111330..',
    '...0331111330...',
    '....03333330....',
]
PAL_LEAF_PET = {
    '0':'#0a2010','1':'#5cd06a','2':'#a8eb96','3':'#1f5a2a','5':'#ffffff',
    '6':'#0a0010','7':'#0a3010'
}

# ---------- drawing helpers ----------------------------------------------

def hex_to_rgba(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16), a)

def rounded_rect(draw, xy, radius, fill):
    draw.rounded_rectangle(xy, radius=radius, fill=fill)

def draw_sprite(img, rows, palette, ox, oy, scale):
    """Paint sprite onto img using nearest-neighbor pixels."""
    draw = ImageDraw.Draw(img)
    for r, row in enumerate(rows):
        for c in range(16):
            ch = row[c] if c < len(row) else '.'
            if ch in ('.', ' '): continue
            color = palette.get(ch)
            if not color: continue
            draw.rectangle(
                [ox + c*scale, oy + r*scale,
                 ox + (c+1)*scale - 1, oy + (r+1)*scale - 1],
                fill=hex_to_rgba(color)
            )

def gradient_bg(size, top, bottom):
    img = Image.new('RGBA', (size, size))
    pix = img.load()
    t = hex_to_rgba(top)
    b = hex_to_rgba(bottom)
    for y in range(size):
        f = y / (size - 1)
        c = tuple(int(t[i] + (b[i] - t[i]) * f) for i in range(4))
        for x in range(size):
            pix[x, y] = c
    return img

def make_plate(size, inset, radius, fill):
    img = Image.new('RGBA', (size, size), (0,0,0,0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(
        [inset, inset, size - inset, size - inset],
        radius=radius, fill=hex_to_rgba(fill)
    )
    return img

# ---------- concept renderers --------------------------------------------

SIZE = 512

def icon_egg(egg_id, filename):
    """Single big pixel-art egg on a dark gradient plate."""
    overlay, pal = EGGS[egg_id]
    rows = apply_overlay(EGG_TEMPLATE, overlay)
    bg = gradient_bg(SIZE, '#1a1a3a', '#000010')
    plate = make_plate(SIZE, 32, 96, '#0a0a18')
    bg.alpha_composite(plate)
    # render sprite 16x16 scaled to ~24x = 384px, centered
    scale = 24
    sx = (SIZE - 16*scale) // 2
    sy = (SIZE - 16*scale) // 2
    draw_sprite(bg, rows, pal, sx, sy, scale)
    bg.save(OUT / filename)
    print(f"saved {filename}")

def icon_pet(rows, pal, filename, bg_from='#1a1a3a', bg_to='#000010', plate='#0a0a18'):
    bg = gradient_bg(SIZE, bg_from, bg_to)
    plt = make_plate(SIZE, 32, 96, plate)
    bg.alpha_composite(plt)
    scale = 24
    sx = (SIZE - 16*scale) // 2
    sy = (SIZE - 16*scale) // 2
    draw_sprite(bg, rows, pal, sx, sy, scale)
    bg.save(OUT / filename)
    print(f"saved {filename}")

def icon_four_eggs(filename):
    """2x2 grid of all four eggs."""
    bg = gradient_bg(SIZE, '#1a1a3a', '#000010')
    plate = make_plate(SIZE, 32, 96, '#0a0a18')
    bg.alpha_composite(plate)
    # 4 cells in 2x2 layout
    scale = 11      # 16*11 = 176
    cell = SIZE // 2
    quads = [('flame', 0, 0), ('star', 1, 0), ('leaf', 0, 1), ('crystal', 1, 1)]
    for egg_id, qx, qy in quads:
        overlay, pal = EGGS[egg_id]
        rows = apply_overlay(EGG_TEMPLATE, overlay)
        sx = qx * cell + (cell - 16*scale)//2
        sy = qy * cell + (cell - 16*scale)//2
        draw_sprite(bg, rows, pal, sx, sy, scale)
    bg.save(OUT / filename)
    print(f"saved {filename}")

def icon_baby_warm(filename):
    """Baby Sprout on warmer pink/coral background."""
    bg = gradient_bg(SIZE, '#3a1a2a', '#180810')
    plate = make_plate(SIZE, 32, 96, '#1a0e18')
    bg.alpha_composite(plate)
    scale = 24
    sx = (SIZE - 16*scale) // 2
    sy = (SIZE - 16*scale) // 2
    draw_sprite(bg, BABY_BODY, PAL_LEAF_PET, sx, sy, scale)
    bg.save(OUT / filename)
    print(f"saved {filename}")

# Generate them all
icon_egg('flame', 'icon-A-flame-egg.png')
icon_egg('crystal', 'icon-B-crystal-egg.png')
icon_egg('leaf', 'icon-C-leaf-egg.png')
icon_four_eggs('icon-D-four-eggs.png')
icon_pet(ADULT_CRYSTAL, PAL_CRYSTAL_PET, 'icon-E-diamond-lord.png')
icon_pet(BABY_BODY, PAL_LEAF_PET, 'icon-F-sprout.png')
icon_baby_warm('icon-G-sprout-warm.png')
