# App submission content

Copy-paste these into the "Add an app" form. Asset files are in this folder.

---

## App name
```
GlassPet
```

## Tagline (≤40 chars)
Pick whichever feels right — all under 40:

- `A Tamagotchi-style pet for your glasses` — 39 ✓ *(recommended)*
- `Hatch and raise a virtual pet on glasses` — 40 ✓
- `Raise a virtual pet on your glasses` — 35 ✓
- `Hatch. Care. Bond.` — 18 ✓ (matches in-app tagline)

## Category
The form's dropdown shows "other" by default. Pick **Games** if available
(this is a pet-care game). If not, "Lifestyle" or "Other" works.

## Visibility
**Public — listed in the catalog** (already selected).

## Developer / studio name
Your choice — `Kevin` or `LiquidAzir` (matches your GitHub) both work.

## App link
```
https://meta-display-pet.onrender.com
```
(The Render URL slug stays as-is — only the display name changes to GlassPet.)

## App icon
Upload **`app-icon-512.png`** from this folder. 512×512 PNG, ~11 KB.

## Screenshots
Upload these in order (catalogs usually show #1 first):

1. `01-welcome.png` — Welcome screen with animated egg + GlassPet title
2. `06-pet-adult.png` — Adult Diamond Lord (the headline visual)
3. `03-egg-select.png` — Egg selection carousel
4. `05-pet-baby.png` — Baby pet with stats + action rail
5. `07-stats.png` — Detailed stats screen
6. `08-minigame.png` — Echo Dance mini-game
7. `04-name-pet.png` — Letter-grid naming flow
8. `02-howto.png` — How to play instructions

## Description

```
GlassPet is a Tamagotchi-style virtual pet built for the 600x600 dark
display and D-pad input of Meta Ray-Ban Display glasses.

Hatch one of four eggs — Flame, Star, Leaf, or Crystal — give your
pet a name, and raise it through six life stages over about a week of
real time. Stats drain even when you're not watching, so check on
your friend daily.

CARE
• Feed full meals, snacks, or water
• Play three D-pad mini-games (Echo Dance, Star Catch, Hi-Lo)
• Clean up after your pet
• Put them to sleep to restore energy
• Give medicine when they're sick

EVOLVE
Twelve possible adult forms. The path your pet takes depends on
how well you care for it — keep stats up, win mini-games, and yours
might grow into the crowned Diamond Lord, Phoenix, Wildking, or
Galactus. Neglect leads to sickness, and eventually a goodbye.

Built for the glasses. No account required. All progress stays on
your device.
```

(Trim to length if the form caps it — first paragraph alone is a
solid short description.)

---

## Source / links
- Live URL: https://meta-display-pet.onrender.com
- GitHub: https://github.com/LiquidAzir/meta-display-pet
- Hosting: Render (free static plan, auto-deploys from `main`)

## File checklist
- [x] `app-icon-512.png` — 512×512
- [x] `01-welcome.png` through `08-minigame.png` — 8 screenshots, all 1200×1200
      (high-DPI capture of the 600×600 viewport, scale down if the form requires
      smaller — most catalogs auto-resize)
- [x] `_capture.py` — script used to generate screenshots (kept for re-captures)
