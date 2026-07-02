# GlassPet

A Tamagotchi-style virtual pet for Meta Ray-Ban Display smart glasses.

- 600x600 dark-theme webapp, D-pad navigation (centered/scaled on desktop & phone)
- 4 hatchable egg lines (Flame / Star / Leaf / Crystal)
- Real-time ~7-day lifecycle: Egg → Baby → Child → Teen → Adult → Senior
- Care-quality branching evolution — plus a hidden secret form per line
- 6 mini-games (RPS / Coin Flip / Tic Tac Toe / Echo Dance / Star Catch / Hi-Lo)
- Coin economy: game payouts, daily check-in streaks, surprise events
- Shop with treats and equippable pixel accessories (rare stock rotates daily)
- Discipline system: comfort or scold misbehaving pets — it shapes evolution
- Generations: Hall of Fame album; well-raised pets bless the next egg
- Day/dusk/night scenery synced to the real clock (night sleep regens faster)
- Chiptune sound effects (WebAudio, mutable in Settings)
- Offline-aware: stats decay over real time while you're away
- Local-only persistence (localStorage with anonymous device ID)

## Run locally

```bash
python -m http.server 5181
# open http://localhost:5181
```

Use arrow keys to simulate D-pad input. Enter to select, Escape to go back.

## Deploy

Render Blueprint config is in [`render.yaml`](render.yaml). Push to a connected
Git repo and create a Blueprint Instance in the Render dashboard.

## Architecture

Single-page client-side app — no backend.

- `index.html` — all screens
- `styles.css` — dark theme, focus states, responsive 600x600
- `app.js` — game loop, sprite rendering, navigation, persistence
- `manifest.webmanifest` — PWA metadata

All pet state is saved under `mdg_pet_v1` in localStorage. The anonymous
device ID lives in the same blob for telemetry-free identification.
