(function() {
  'use strict';

  // ==================== CONFIG ====================
  var CONFIG = {
    storageKey: 'mdg_pet_v1',
    tickMs: 1000,                       // game-loop tick frequency
    drawMs: 1000 / 30,                  // animation tick
    // life stage durations (real-time, totalling ~7 days)
    stageHours: {
      egg:   1,        // 0..1h
      baby:  6,        // 1..7h
      child: 24,       // 7..31h
      teen:  48,       // 31..79h
      adult: 48,       // 79..127h
      senior:48,       // 127..175h
    },
    // stat decay per hour
    decay: {
      hunger: 8,
      happy:  6,
      clean:  5,
      energy: 4,        // while awake
      sleepRegen: 25,   // energy regen per hour asleep
    },
    poopHoursMin: 2.5,
    poopHoursMax: 4.5,
    poopMaxOnScreen: 3,
    sickThreshold: 18,         // when any core stat < this for too long
    sickProbabilityPerHour: 0.4, // when conditions are bad
    critForDeathHours: 12,      // health 0 sustained
    startCoins: 50,
    mischiefPerHour: 0.22,      // chance/hour of a misbehavior while awake
    mischiefTimeoutMin: 90,     // ignored misbehavior auto-resolves (with penalty)
    eventGapHoursMin: 2.5,      // surprise events on the main screen
    eventGapHoursMax: 5,
    nightRegenMul: 1.25,        // sleeping at real-world night regens faster
    boonDecayMul: 0.88,         // legacy boon: -12% stat drain
    // secret evolution requirements, checked once at teen -> adult
    secret: { careAvg: 82, discipline: 65, gameWins: 12 },
  };

  var STAGES = ['egg','baby','child','teen','adult','senior'];

  // ==================== PET LINES ====================
  // Each line: 4 stages of pixel sprites (baby/child/teen/adult).
  // The egg is its own sprite. Adult branching is achieved via care-quality
  // suffix: '_great' / '_poor'.

  // Shared sprite palette codes (per-sprite palette object below).
  //   '.' transparent · '0' outline · '1' body · '2' light · '3' shade ·
  //   '4' accent A · '5' accent B / white · '6' eye · '7' mouth

  // ============================================================
  //  SPRITE SYSTEM
  // ============================================================
  // All sprites are 16x16 pixel grids. The 'px' field is a single
  // 256-char string (rows concatenated). The drawSprite() function
  // reads (col, row) from the string. Palettes map single characters
  // to hex colors. '.' or ' ' is always transparent.
  //
  // Palette code convention:
  //   '0' outline · '1' body · '2' light · '3' shade
  //   '4' accent · '5' bright/white · '6' eye-dark · '7' mouth · '8' crown/halo
  // ============================================================

  function S(rows) {
    // Normalize 16-row sprite spec: pad/truncate each row to 16 chars,
    // converting spaces to dots. Returns a 256-char string.
    var out = '';
    for (var i = 0; i < 16; i++) {
      var r = (rows[i] || '').replace(/ /g, '.');
      if (r.length < 16) r = r + '................'.slice(0, 16 - r.length);
      else if (r.length > 16) r = r.slice(0, 16);
      out += r;
    }
    return out;
  }

  // ----- shared egg silhouette + per-line accents ----------------------
  // Egg body template (cols 4..11, rows 2..15). Body cells contain '1' so
  // overlays can mask with '4' or '5' to add patterns.
  var EGG_TEMPLATE = [
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
  ];

  function buildEgg(pal, accentLayer) {
    // accentLayer is an array of 14 rows × 16 cols. '.' = leave body alone,
    // any other char paints over body '1' cells (never overwrites outline).
    var rows = EGG_TEMPLATE.slice();
    if (accentLayer) {
      for (var r = 0; r < accentLayer.length; r++) {
        var base = rows[r + 2].split('');
        var over = accentLayer[r];
        for (var c = 0; c < 16; c++) {
          var oc = over[c];
          if (!oc || oc === '.' || oc === ' ') continue;
          if (base[c] === '1' || base[c] === '2') base[c] = oc;
        }
        rows[r + 2] = base.join('');
      }
    }
    return { pal: pal, px: S(rows), w: 16 };
  }

  var EGG_FLAME = buildEgg(
    { '0':'#3a0a00', '1':'#ff5a1a', '2':'#ffb070', '3':'#9c2200', '4':'#ffe46a', '5':'#ffd83a' },
    [
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
  );
  var EGG_STAR = buildEgg(
    { '0':'#04102a', '1':'#1f4dff', '2':'#7aa6ff', '3':'#0b2070', '4':'#ffffff', '5':'#9ee0ff' },
    [
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
  );
  var EGG_LEAF = buildEgg(
    { '0':'#0a2010', '1':'#3aa84a', '2':'#9be07a', '3':'#1f5a2a', '4':'#ffe27a', '5':'#1d5a25' },
    [
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
  );
  var EGG_CRYSTAL = buildEgg(
    { '0':'#0e051e', '1':'#a96bff', '2':'#e0bcff', '3':'#5a25a0', '4':'#ffffff', '5':'#ffd1ff' },
    [
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
  );

  // ----- shared creature body templates per stage -----------------
  // Each template: 16x16. Codes:
  //  '1' body · '2' light highlight · '3' dark shade · '0' outline
  //  'A','B','C' marker spots that are replaced by accessories or accents
  //  '6' eye-dark sockets · '5' eye-shine
  //  '7' mouth

  // Baby — small round body with two eyes and a tiny mouth.
  var BABY_BODY = S([
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
  ]);

  // Child — slightly taller, little legs at the bottom.
  var CHILD_BODY = S([
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
    '..0331....1330..',
    '..0.0......0.0..',
    '................',
  ]);

  // Teen — taller silhouette with ears/horns marker 'A'.
  var TEEN_BODY = S([
    '................',
    '..AA........AA..',
    '..AAA......AAA..',
    '...A0AA..AA0A...',
    '....0220022 0....',
    '....02211110....',
    '....02111110....',
    '...0211661120...',
    '...0215005120...',
    '...0211661120...',
    '...0211111120...',
    '...0211771120...',
    '...0211111120...',
    '...0331111330...',
    '...0331..1330...',
    '...0.0....0.0...',
  ]);

  // Adult — majestic full form with a small crown 'B' on top.
  var ADULT_BODY = S([
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
  ]);

  // Per-line palette for creature stages
  var PETPAL = {
    flame:   { '0':'#3a0a00', '1':'#ff6a25', '2':'#ffd07a', '3':'#9c2200', '5':'#ffffff', '6':'#0a0010', '7':'#a22000', '4':'#ffe46a', '8':'#ffd83a', 'A':'#ffe46a', 'B':'#ffd83a', 'C':'#ff3000' },
    star:    { '0':'#04102a', '1':'#3a7dff', '2':'#9ec5ff', '3':'#1230a0', '5':'#ffffff', '6':'#0a0010', '7':'#0a1844', '4':'#ffe27a', '8':'#ffffff', 'A':'#ffffff', 'B':'#fff7c0', 'C':'#9ee0ff' },
    leaf:    { '0':'#0a2010', '1':'#5cd06a', '2':'#a8eb96', '3':'#1f5a2a', '5':'#ffffff', '6':'#0a0010', '7':'#0a3010', '4':'#ffe27a', '8':'#fff070', 'A':'#3aa84a', 'B':'#ffe27a', 'C':'#ffd83a' },
    crystal: { '0':'#0e051e', '1':'#c489ff', '2':'#ecd0ff', '3':'#5a25a0', '5':'#ffffff', '6':'#0a0010', '7':'#3a1060', '4':'#ffffff', '8':'#ffd1ff', 'A':'#e0bcff', 'B':'#ffffff', 'C':'#ff8de8' },
  };

  function buildPet(line, stage) {
    var tmpl;
    if      (stage === 'baby')  tmpl = BABY_BODY;
    else if (stage === 'child') tmpl = CHILD_BODY;
    else if (stage === 'teen')  tmpl = TEEN_BODY;
    else                        tmpl = ADULT_BODY;
    return { pal: PETPAL[line], px: tmpl, w: 16 };
  }

  var EGGS = { flame: EGG_FLAME, star: EGG_STAR, leaf: EGG_LEAF, crystal: EGG_CRYSTAL };

  var STAGE_SPRITES = {
    flame:   { baby: buildPet('flame','baby'),   child: buildPet('flame','child'),   teen: buildPet('flame','teen'),   adult: buildPet('flame','adult') },
    star:    { baby: buildPet('star','baby'),    child: buildPet('star','child'),    teen: buildPet('star','teen'),    adult: buildPet('star','adult') },
    leaf:    { baby: buildPet('leaf','baby'),    child: buildPet('leaf','child'),    teen: buildPet('leaf','teen'),    adult: buildPet('leaf','adult') },
    crystal: { baby: buildPet('crystal','baby'), child: buildPet('crystal','child'), teen: buildPet('crystal','teen'), adult: buildPet('crystal','adult') },
  };

  // Secret adult forms: same silhouette, radiant palette + drawn aura.
  var SECRETPAL = {
    flame:   { '0':'#4a2000', '1':'#ffc23a', '2':'#fff3b0', '3':'#e07800', '5':'#ffffff', '6':'#3a1000', '7':'#c05000', '4':'#ffffff', '8':'#fff3b0', 'A':'#ffffff', 'B':'#ffffff', 'C':'#ffd83a' },
    star:    { '0':'#101040', '1':'#bfe2ff', '2':'#ffffff', '3':'#5a7dff', '5':'#ffffff', '6':'#101040', '7':'#3a50a0', '4':'#fff7c0', '8':'#ffffff', 'A':'#fff7c0', 'B':'#fff7c0', 'C':'#9ee0ff' },
    leaf:    { '0':'#1a3a00', '1':'#b8f070', '2':'#f0ffc0', '3':'#5a9a20', '5':'#ffffff', '6':'#102000', '7':'#3a6a10', '4':'#fff070', '8':'#fff070', 'A':'#fff070', 'B':'#fff070', 'C':'#ffe27a' },
    crystal: { '0':'#2a0a3a', '1':'#f0c8ff', '2':'#ffffff', '3':'#b06bff', '5':'#ffffff', '6':'#2a0a3a', '7':'#8040c0', '4':'#ffffff', '8':'#ffffff', 'A':'#ffffff', 'B':'#ffe8ff', 'C':'#ff8de8' },
  };
  var SECRET_SPRITES = {
    flame:   { pal: SECRETPAL.flame,   px: ADULT_BODY, w: 16 },
    star:    { pal: SECRETPAL.star,    px: ADULT_BODY, w: 16 },
    leaf:    { pal: SECRETPAL.leaf,    px: ADULT_BODY, w: 16 },
    crystal: { pal: SECRETPAL.crystal, px: ADULT_BODY, w: 16 },
  };

  // ==================== SHOP CATALOG ====================
  // Accessories draw as small pixel overlays anchored to the head or eyes.
  // h = row count; dy = extra cell offset from the anchor (negative = higher).
  var HEAD_TOP_ROW = { baby: 3, child: 2, teen: 1, adult: 0, senior: 0 };
  var EYE_ROW      = { baby: 8, child: 7, teen: 7, adult: 6, senior: 6 };

  var ACCESSORIES = {
    party:  { name: 'Party Hat', icon: '🎉', price: 40, desc: 'For a pet that loves a celebration.',
              anchor: 'head', dy: 0, h: 4,
              pal: { '1':'#ff5b9c', '2':'#ffe46a', '5':'#ffffff' },
              px: ['.......5........',
                   '.......1........',
                   '......212.......',
                   '......121.......'] },
    bow:    { name: 'Ribbon Bow', icon: '🎀', price: 35, desc: 'Tied with love. Very dignified.',
              anchor: 'head', dy: 1, h: 2,
              pal: { '1':'#ff5b9c', '2':'#ff8db8' },
              px: ['.....12.21......',
                   '.....11211......'] },
    shades: { name: 'Cool Shades', icon: '🕶', price: 50, desc: 'Instant +100 style. Zero stat effect.',
              anchor: 'eyes', dy: 0, h: 2,
              pal: { '1':'#10101c', '2':'#3a3a55' },
              px: ['...11211211.....',
                   '....11...11.....'] },
    crown:  { name: 'Tiny Crown', icon: '👑', price: 120, desc: 'Rare stock. Fit for royalty.', rare: 0,
              anchor: 'head', dy: 0, h: 3,
              pal: { '1':'#ffd83a', '2':'#fff3b0', '4':'#ff5b9c' },
              px: ['.....1.4.1......',
                   '.....11111......',
                   '.....12121......'] },
    halo:   { name: 'Golden Halo', icon: '😇', price: 150, desc: 'Rare stock. Simply divine.', rare: 1,
              anchor: 'head', dy: -1, h: 2,
              pal: { '1':'#ffe46a', '2':'#fff8d0' },
              px: ['.....12221......',
                   '....1.....1.....'] },
  };

  var SHOP_FOODS = [
    { id: 'cake',  name: 'Honey Cake',  icon: '🍰', price: 18, desc: 'Hunger +30, happiness +12. Weight +2.' },
    { id: 'salad', name: 'Berry Salad', icon: '🥗', price: 12, desc: 'Hunger +18, light & healthy. Weight -1.' },
    { id: 'tonic', name: 'Energy Tonic',icon: '🧪', price: 20, desc: 'Energy +35 without a nap.' },
    { id: 'mystery', name: 'Mystery Meal', icon: '🎁', price: 15, desc: 'Could be anything. Feeling lucky?' },
  ];


  // Egg metadata for selection screen
  var EGG_INFO = [
    { id: 'flame',   name: 'Flame Egg',   tagline: 'Warm-hearted. Fiery. Loyal to those it trusts.' },
    { id: 'star',    name: 'Star Egg',    tagline: 'Cosmic. Curious. Drawn to bright moments.' },
    { id: 'leaf',    name: 'Leaf Egg',    tagline: 'Gentle. Calm. Thrives with a steady hand.' },
    { id: 'crystal', name: 'Crystal Egg', tagline: 'Rare. Sharp-minded. Sparkles when happy.' },
  ];

  // Species name table by line + stage + branch ('great'|'good'|'poor')
  var NAMES = {
    flame:   { baby: 'Embril',   child: 'Sparkling', teen: 'Flarewing', adult: { great: 'Inferno King', good: 'Phoenix',  poor: 'Smolderpaw', secret: 'Solar Sovereign' } },
    star:    { baby: 'Twinkle',  child: 'Astrobit',  teen: 'Comet',     adult: { great: 'Galactus',     good: 'Nova Prince', poor: 'Voidwalker', secret: 'Celestial One' } },
    leaf:    { baby: 'Sprout',   child: 'Bloomling', teen: 'Vinepaw',   adult: { great: 'Wildking',     good: 'Ancient Oak', poor: 'Bloomshade', secret: 'World Tree Spirit' } },
    crystal: { baby: 'Sparkle',  child: 'Crystura',  teen: 'Prismfox',  adult: { great: 'Diamond Lord', good: 'Geode Sage',  poor: 'Obsidiancore', secret: 'Prism Deity' } },
  };
  var LINE_ICONS = { flame: '🔥', star: '⭐', leaf: '🍃', crystal: '💎' };

  // ==================== EXTRA SPRITES ====================
  var GHOST = {
    pal: { '0':'#2a2a3a', '1':'#d8dcef', '2':'#ffffff', '3':'#5a5a7a', '6':'#0a0a14' },
    px: [
      '................',
      '......0000......',
      '.....022220.....',
      '....02211220....',
      '...0211111120...',
      '..021116611120..',
      '..021160606120..',
      '..021111111120..',
      '..021111111120..',
      '..021111111120..',
      '..021111111120..',
      '..023113113120..',
      '..033031031030..',
      '...0...0...0....',
      '................',
      '................',
    ]
  };
  var POOP = {
    pal: { '0':'#1a0e00', '1':'#6b3a10', '2':'#9b5c20', '6':'#000000' },
    px: [
      '................',
      '................',
      '................',
      '......0000......',
      '.....022220.....',
      '.....021110.....',
      '....022266220...',
      '....02160611 0...',
      '...0221111122 0..',
      '...0211111111 0..',
      '..0221660611 220.',
      '..0211111111 110.',
      '..0211111111 110.',
      '..03333333333 0..',
      '................',
      '................',
    ]
  };

  // ==================== STATE ====================
  var state = {
    deviceId: null,
    currentScreen: 'welcome',
    screenHistory: [],
    // pet state
    pet: null,         // see freshPet()
    history: [],       // list of past pet summaries (Hall of Fame)
    // economy & meta (persisted, survive pet death)
    coins: CONFIG.startCoins,
    streak: { last: '', count: 0 },
    owned: {},         // accessoryId -> true
    equipped: null,    // accessoryId or null
    muted: false,
    legacy: null,      // {from, line} boon waiting for the next egg
    nextEventAt: 0,    // next surprise-event timestamp
    // ephemeral
    eggIdx: 0,
    nameDraft: '',
    nameCursor: 0,     // letter grid focus index
    miniGame: null,
    eventFx: null,     // {type, startedAt, data} canvas effect for events
    // anim
    bouncePhase: 0,
    pendingMood: null, // {icon, text, until}
  };

  function freshPet(eggId, name) {
    var now = Date.now();
    var gen = state.history.length && state.history[0].gen ? state.history[0].gen + 1 : state.history.length + 1;
    var boon = state.legacy;   // consume the waiting legacy boon, if any
    state.legacy = null;
    return {
      id: 'p_' + now.toString(36),
      eggId: eggId,
      name: name,
      gen: gen,
      boon: boon,              // {from, line} → slower stat drain
      secret: false,           // unlocked at teen->adult with exceptional care
      mischief: null,          // {type: 'beg'|'tantrum'|'sulk', sinceMs}
      bornAt: now,
      lastTickAt: now,
      stage: 'egg',
      branch: 'good',          // updated as care evolves
      // core stats 0..100
      hunger: 80,
      happy: 80,
      clean: 90,
      energy: 80,
      health: 100,
      // life events
      weight: 5,
      discipline: 50,
      poops: [],               // each: { atMs }
      asleep: false,
      sick: false,
      sickSinceMs: 0,
      criticalSinceMs: 0,
      // logs / care
      careSum: 0,              // running sum of avg stats
      careSamples: 0,
      feedings: 0,
      cleanings: 0,
      gameWins: 0,
      neglectMin: 0,
      dead: false,
      deathReason: null,
      diedAt: 0,
      nextPoopAt: now + randRange(CONFIG.poopHoursMin, CONFIG.poopHoursMax) * 3600 * 1000,
    };
  }

  // ==================== UTILS ====================
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function randRange(a, b) { return a + Math.random() * (b - a); }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function uid() {
    try { return crypto.randomUUID(); }
    catch (e) {
      return 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }
  function hoursSince(ms) { return (Date.now() - ms) / 3600000; }
  // Real-world day phase drives the main-screen scenery and sleep bonus
  function dayPhase() {
    var h = new Date().getHours();
    if (h >= 7 && h < 17) return 'day';
    if (h >= 17 && h < 20) return 'dusk';
    return 'night';
  }
  function careAvgOf(pet) {
    return pet.careSamples > 0 ? pet.careSum / pet.careSamples : 70;
  }

  function ageString(pet) {
    if (!pet) return '';
    var h = hoursSince(pet.bornAt);
    var d = Math.floor(h / 24);
    var hh = Math.floor(h % 24);
    return d + 'd ' + hh + 'h';
  }

  // ==================== STORAGE ====================
  function loadData() {
    try {
      var raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) return;
      var data = JSON.parse(raw);
      state.deviceId = data.deviceId || null;
      state.pet      = data.pet      || null;
      state.history  = data.history  || [];
      // economy & meta — default for saves created before these existed
      state.coins    = typeof data.coins === 'number' ? data.coins : CONFIG.startCoins;
      state.streak   = data.streak   || { last: '', count: 0 };
      state.owned    = data.owned    || {};
      state.equipped = data.equipped || null;
      state.muted    = !!data.muted;
      state.legacy   = data.legacy   || null;
      state.nextEventAt = data.nextEventAt || 0;
    } catch (e) { console.error('[load]', e); }
  }
  function saveData() {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify({
        deviceId: state.deviceId,
        pet: state.pet,
        history: state.history,
        coins: state.coins,
        streak: state.streak,
        owned: state.owned,
        equipped: state.equipped,
        muted: state.muted,
        legacy: state.legacy,
        nextEventAt: state.nextEventAt,
      }));
    } catch (e) { console.error('[save]', e); }
  }

  // ==================== SOUND (WebAudio chiptune) ====================
  // Each effect: array of [freq, startSec, durSec, type?, vol?] notes.
  var SFX = {
    move:    [[660, 0, 0.03, 'square', 0.02]],
    select:  [[740, 0, 0.05, 'square', 0.05], [1108, 0.05, 0.07, 'square', 0.05]],
    coin:    [[988, 0, 0.05, 'square', 0.06], [1319, 0.05, 0.12, 'square', 0.06]],
    eat:     [[392, 0, 0.06, 'triangle', 0.08], [330, 0.07, 0.06, 'triangle', 0.08], [440, 0.14, 0.1, 'triangle', 0.08]],
    clean:   [[880, 0, 0.05, 'sine', 0.06], [1175, 0.06, 0.05, 'sine', 0.06], [1568, 0.12, 0.08, 'sine', 0.06]],
    heal:    [[523, 0, 0.09, 'triangle', 0.07], [659, 0.1, 0.09, 'triangle', 0.07], [784, 0.2, 0.14, 'triangle', 0.07]],
    win:     [[523, 0, 0.08, 'square', 0.06], [659, 0.08, 0.08, 'square', 0.06], [784, 0.16, 0.08, 'square', 0.06], [1047, 0.24, 0.18, 'square', 0.07]],
    lose:    [[330, 0, 0.12, 'square', 0.05], [247, 0.13, 0.2, 'square', 0.05]],
    evolve:  [[523, 0, 0.1, 'square', 0.06], [659, 0.1, 0.1, 'square', 0.06], [784, 0.2, 0.1, 'square', 0.06], [1047, 0.3, 0.1, 'square', 0.07], [1319, 0.4, 0.26, 'square', 0.07]],
    event:   [[1319, 0, 0.05, 'sine', 0.06], [1760, 0.06, 0.05, 'sine', 0.06], [2217, 0.12, 0.12, 'sine', 0.05]],
    scold:   [[196, 0, 0.1, 'square', 0.06], [165, 0.11, 0.14, 'square', 0.06]],
    comfort: [[523, 0, 0.09, 'sine', 0.07], [659, 0.1, 0.16, 'sine', 0.07]],
  };
  var sndCtx = null;
  function sfx(name) {
    if (state.muted) return;
    var notes = SFX[name];
    if (!notes) return;
    try {
      if (!sndCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        sndCtx = new AC();
      }
      if (sndCtx.state === 'suspended') sndCtx.resume();
      var t0 = sndCtx.currentTime;
      notes.forEach(function(n) {
        var osc = sndCtx.createOscillator();
        var gain = sndCtx.createGain();
        osc.type = n[3] || 'square';
        osc.frequency.value = n[0];
        var vol = n[4] != null ? n[4] : 0.06;
        var start = t0 + n[1], end = start + n[2];
        gain.gain.setValueAtTime(vol, start);
        gain.gain.exponentialRampToValueAtTime(0.001, end);
        osc.connect(gain); gain.connect(sndCtx.destination);
        osc.start(start); osc.stop(end + 0.02);
      });
    } catch (e) { /* no audio on this device — fine */ }
  }

  // ==================== COINS & STREAK ====================
  function addCoins(n, quiet) {
    state.coins = Math.max(0, state.coins + n);
    refreshCoinLabels();
    if (n > 0 && !quiet) sfx('coin');
    saveData();
  }
  function refreshCoinLabels() {
    var el = document.getElementById('coin-label');
    if (el) el.textContent = state.coins;
    var shopEl = document.getElementById('shop-coin-label');
    if (shopEl) shopEl.textContent = state.coins;
  }
  function dayKeyOf(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function checkStreak() {
    var now = new Date();
    var today = dayKeyOf(now);
    if (state.streak.last === today) return;
    var yesterday = dayKeyOf(new Date(now.getTime() - 86400000));
    if (state.streak.last === yesterday) {
      state.streak.count++;
      var reward = Math.min(5 + state.streak.count * 2, 25);
      state.streak.last = today;
      addCoins(reward, true);
      showToast('🔥 Day ' + state.streak.count + ' streak! +' + reward + ' coins', 'success');
      sfx('coin');
    } else {
      var first = !state.streak.last;
      state.streak.count = 1;
      state.streak.last = today;
      addCoins(5, true);
      if (!first) showToast('Welcome back! +5 coins', 'success');
    }
    saveData();
    refreshStreakBadge();
  }
  function refreshStreakBadge() {
    var el = document.getElementById('streak-badge');
    if (!el) return;
    if (state.streak.count >= 2) {
      el.classList.remove('hidden');
      el.textContent = '🔥' + state.streak.count;
    } else {
      el.classList.add('hidden');
    }
  }

  // ==================== SPRITE RENDERER ====================
  function drawSprite(ctx, sprite, x, y, scale, opts) {
    if (!sprite) return;
    opts = opts || {};
    var px = sprite.px;
    var pal = sprite.pal;
    var w = sprite.w || 16;
    var h = sprite.h || 16;
    var alpha = opts.alpha != null ? opts.alpha : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    // px can be a flat 256-char string OR an array of row strings.
    var isArr = Array.isArray(px);
    for (var r = 0; r < h; r++) {
      for (var c = 0; c < w; c++) {
        var ch;
        if (isArr) {
          var row = px[r] || '';
          ch = c < row.length ? row[c] : '.';
        } else {
          ch = px[r * w + c] || '.';
        }
        if (ch === '.' || ch === ' ') continue;
        var color = pal[ch];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
      }
    }
    ctx.restore();
  }

  // Decorative starfield background for the main pet view
  function drawStars(ctx, w, h, t) {
    // small twinkling pixels — pseudo-fixed seed
    var prev = ctx.fillStyle;
    for (var i = 0; i < 32; i++) {
      var sx = (i * 97) % w;
      var sy = (i * 53) % h;
      var twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t / 1200 + i));
      ctx.globalAlpha = twinkle * 0.6;
      ctx.fillStyle = i % 5 === 0 ? '#00d4ff' : '#ffffff';
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = prev;
  }

  // Scene backdrop synced to the real-world clock
  function drawScene(ctx, w, h, t) {
    var phase = dayPhase();
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    if (phase === 'day') {
      grad.addColorStop(0, '#0e2a4a');
      grad.addColorStop(1, '#081420');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // pixel sun, top-left
      ctx.fillStyle = '#ffe46a';
      ctx.fillRect(64, 40, 36, 36);
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(72, 48, 20, 20);
    } else if (phase === 'dusk') {
      grad.addColorStop(0, '#3a1030');
      grad.addColorStop(0.6, '#40161a');
      grad.addColorStop(1, '#100810');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // low sun on the horizon
      ctx.fillStyle = '#ff9f43';
      ctx.fillRect(80, h - 80, 44, 24);
      drawStars(ctx, w, Math.floor(h / 2), t);
    } else {
      // night — starfield + crescent moon
      drawStars(ctx, w, h, t);
      ctx.fillStyle = '#e8ecff';
      ctx.beginPath();
      ctx.arc(w - 90, 64, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a0a14';
      ctx.beginPath();
      ctx.arc(w - 80, 58, 20, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ground line
  function drawGround(ctx, x, y, w) {
    ctx.fillStyle = 'rgba(0, 212, 255, 0.18)';
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = 'rgba(0, 212, 255, 0.05)';
    ctx.fillRect(x, y + 2, w, 4);
  }

  // ==================== GAME LOOP ====================
  function petStageFromAge(pet) {
    var h = hoursSince(pet.bornAt);
    var s = CONFIG.stageHours;
    if (h < s.egg) return 'egg';
    if (h < s.egg + s.baby) return 'baby';
    if (h < s.egg + s.baby + s.child) return 'child';
    if (h < s.egg + s.baby + s.child + s.teen) return 'teen';
    if (h < s.egg + s.baby + s.child + s.teen + s.adult) return 'adult';
    return 'senior';
  }

  function tickPet(now) {
    var pet = state.pet;
    if (!pet || pet.dead) return;
    var dtMs = now - pet.lastTickAt;
    if (dtMs <= 0) return;
    var dtH = dtMs / 3600000;

    var stage = petStageFromAge(pet);
    var prevStage = pet.stage;
    pet.stage = stage;

    // Egg: just count time, no decay
    if (stage === 'egg') {
      pet.lastTickAt = now;
      return;
    }

    // Decay
    var stageMul = stage === 'baby' ? 1.2 : stage === 'senior' ? 0.7 : 1.0;
    if (pet.boon) stageMul *= CONFIG.boonDecayMul;   // legacy boon: slower drain
    pet.hunger = clamp(pet.hunger - CONFIG.decay.hunger * dtH * stageMul, 0, 100);
    pet.happy  = clamp(pet.happy  - CONFIG.decay.happy  * dtH * stageMul, 0, 100);
    pet.clean  = clamp(pet.clean  - CONFIG.decay.clean  * dtH * stageMul, 0, 100);
    if (pet.asleep) {
      var regen = CONFIG.decay.sleepRegen * (dayPhase() === 'night' ? CONFIG.nightRegenMul : 1);
      pet.energy = clamp(pet.energy + regen * dtH, 0, 100);
      if (pet.energy >= 99) pet.asleep = false;
    } else {
      pet.energy = clamp(pet.energy - CONFIG.decay.energy * dtH * stageMul, 0, 100);
    }

    // Misbehavior: occasionally the pet acts up and wants a response
    if (!pet.asleep && !pet.dead) {
      if (pet.mischief) {
        if ((now - pet.mischief.sinceMs) / 60000 > CONFIG.mischiefTimeoutMin) {
          // ignored — pet resolves it badly on its own
          pet.mischief = null;
          pet.discipline = clamp(pet.discipline - 6, 0, 100);
          pet.happy = clamp(pet.happy - 4, 0, 100);
        }
      } else if (Math.random() < CONFIG.mischiefPerHour * dtH) {
        var mType = pet.happy < 40 ? 'sulk' : (Math.random() < 0.5 ? 'beg' : 'tantrum');
        pet.mischief = { type: mType, sinceMs: now };
      }
    }

    // Poop schedule
    while (now >= pet.nextPoopAt && pet.poops.length < CONFIG.poopMaxOnScreen && stage !== 'egg') {
      pet.poops.push({ atMs: pet.nextPoopAt });
      pet.clean = clamp(pet.clean - 18, 0, 100);
      pet.nextPoopAt += randRange(CONFIG.poopHoursMin, CONFIG.poopHoursMax) * 3600 * 1000;
    }

    // Care score (averaged stats)
    var avg = (pet.hunger + pet.happy + pet.clean + pet.energy) / 4;
    pet.careSum += avg * dtH;
    pet.careSamples += dtH;

    // Neglect & sickness conditions
    var critStat = Math.min(pet.hunger, pet.happy, pet.clean);
    if (critStat < CONFIG.sickThreshold) {
      pet.neglectMin += dtH * 60;
      if (!pet.sick && Math.random() < CONFIG.sickProbabilityPerHour * dtH) {
        pet.sick = true;
        pet.sickSinceMs = now;
      }
    }
    if (pet.poops.length >= 2 && Math.random() < 0.3 * dtH) {
      pet.sick = true;
      pet.sickSinceMs = pet.sickSinceMs || now;
    }

    // Health update
    var healthDelta = 0;
    if (pet.sick) healthDelta -= 12 * dtH;
    if (pet.hunger < 15) healthDelta -= 8 * dtH;
    if (pet.clean < 15) healthDelta -= 6 * dtH;
    if (pet.happy < 15) healthDelta -= 4 * dtH;
    if (!pet.sick && pet.hunger > 50 && pet.clean > 50 && pet.happy > 50) {
      healthDelta += 6 * dtH;
    }
    pet.health = clamp(pet.health + healthDelta, 0, 100);

    if (pet.health <= 0) {
      pet.criticalSinceMs = pet.criticalSinceMs || now;
      if (now - pet.criticalSinceMs > CONFIG.critForDeathHours * 3600 * 1000) {
        die(pet, 'illness');
      }
    } else {
      pet.criticalSinceMs = 0;
    }

    // Old age
    var totalH = Object.values(CONFIG.stageHours).reduce(function(a,b){return a+b;}, 0);
    if (hoursSince(pet.bornAt) > totalH + 24 && !pet.dead) {
      die(pet, 'oldage');
    }

    // Evolution branch updates as the pet grows
    pet.branch = computeBranch(pet);

    pet.lastTickAt = now;

    if (prevStage !== stage) onStageChanged(pet, prevStage, stage);
  }

  function computeBranch(pet) {
    if (pet.secret) return 'secret';
    var avg = careAvgOf(pet);
    var winsBoost = Math.min(20, pet.gameWins * 2);
    var neglectPen = Math.min(30, pet.neglectMin / 60); // hours of neglect
    var discMod = (pet.discipline - 50) / 5;            // -10 .. +10
    var score = avg + winsBoost - neglectPen + discMod;
    if (score >= 80) return 'great';
    if (score >= 55) return 'good';
    return 'poor';
  }

  function petDisplayName(pet) {
    if (!pet) return '';
    if (pet.stage === 'egg') return 'Egg';
    if (pet.stage === 'senior') {
      var adultEntry = NAMES[pet.eggId].adult;
      return 'Elder ' + adultEntry[pet.branch];
    }
    var entry = NAMES[pet.eggId][pet.stage];
    if (typeof entry === 'string') return entry;
    return entry[pet.branch] || entry.good;
  }

  function petSprite(pet) {
    if (!pet) return null;
    if (pet.dead) return GHOST;
    if (pet.stage === 'egg') return EGGS[pet.eggId];
    var stageKey = pet.stage === 'senior' ? 'adult' : pet.stage;
    if (stageKey === 'adult' && pet.branch === 'secret') return SECRET_SPRITES[pet.eggId];
    return STAGE_SPRITES[pet.eggId][stageKey];
  }

  function onStageChanged(pet, from, to) {
    // Secret evolution check: exactly once, at the moment of becoming adult
    if (to === 'adult' && from !== 'adult') {
      var req = CONFIG.secret;
      if (careAvgOf(pet) >= req.careAvg && pet.discipline >= req.discipline && pet.gameWins >= req.gameWins) {
        pet.secret = true;
        pet.branch = 'secret';
      }
    }
    if (from === 'egg' && to === 'baby') {
      showEvolveScreen('Hatched!', pet);
    } else if (to !== 'senior' && to !== 'egg') {
      showEvolveScreen(pet.secret && to === 'adult' ? '✦ Secret Evolution ✦' : 'Evolved!', pet);
    }
  }

  function die(pet, reason) {
    if (pet.dead) return;
    pet.dead = true;
    pet.deathReason = reason;
    pet.diedAt = Date.now();
    var careAvg = Math.round(careAvgOf(pet));
    state.history.unshift({
      name: pet.name,
      eggId: pet.eggId,
      branch: pet.branch,
      gen: pet.gen || state.history.length + 1,
      careAvg: careAvg,
      bornAt: pet.bornAt,
      diedAt: pet.diedAt,
      finalStage: pet.stage,
      reason: reason,
      finalName: petDisplayName(pet),
    });
    if (state.history.length > 30) state.history.length = 30;
    // A well-raised pet blesses the next egg with a legacy boon
    if (careAvg >= 70 || pet.stage === 'senior' || pet.branch === 'secret') {
      state.legacy = { from: pet.name, line: pet.eggId };
    }
    sfx('lose');
    saveData();
    navigateTo('death', { addToHistory: false });
  }

  // ==================== RENDERING ====================
  var animT = 0;

  function renderMain() {
    var pet = state.pet;
    var canvas = document.getElementById('pet-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    // background — follows the real-world clock
    drawScene(ctx, canvas.width, canvas.height, animT);
    drawGround(ctx, 40, canvas.height - 30, canvas.width - 80);

    // pet sprite (16x16 base scaled up)
    var sprite = petSprite(pet);
    if (sprite) {
      var scale = 14; // 16*14 = 224px
      var spriteW = 16 * scale;
      var spriteH = 16 * scale;
      var bx = (canvas.width - spriteW) / 2;
      var by = canvas.height - spriteH - 20;
      // idle bounce
      var bounce = pet && !pet.dead && !pet.asleep && pet.stage !== 'egg'
        ? Math.sin(animT / 380) * 4
        : 0;
      // egg wobble
      if (pet && pet.stage === 'egg') bounce = Math.sin(animT / 240) * 2;

      // secret forms radiate a pulsing golden aura
      if (pet && !pet.dead && pet.branch === 'secret' && pet.stage !== 'egg') {
        var pulse = 0.18 + 0.1 * Math.abs(Math.sin(animT / 500));
        var aura = ctx.createRadialGradient(
          bx + spriteW / 2, by + spriteH / 2 + bounce, 30,
          bx + spriteW / 2, by + spriteH / 2 + bounce, spriteW * 0.75);
        aura.addColorStop(0, 'rgba(255, 226, 122, ' + pulse + ')');
        aura.addColorStop(1, 'rgba(255, 226, 122, 0)');
        ctx.fillStyle = aura;
        ctx.fillRect(bx - spriteW / 2, by - spriteH / 2, spriteW * 2, spriteH * 2);
      }

      drawSprite(ctx, sprite, bx, by + bounce, scale);

      // equipped accessory overlay (not on eggs or ghosts)
      if (pet && !pet.dead && pet.stage !== 'egg' && state.equipped && ACCESSORIES[state.equipped]) {
        var acc = ACCESSORIES[state.equipped];
        var anchorRow = acc.anchor === 'eyes' ? EYE_ROW[pet.stage] : HEAD_TOP_ROW[pet.stage] - acc.h + 1;
        var accY = by + bounce + (anchorRow + acc.dy) * scale;
        drawSprite(ctx, { pal: acc.pal, px: acc.px, w: 16, h: acc.h }, bx, accY, scale);
      }

      // sleep overlay
      if (pet && pet.asleep) {
        ctx.font = 'bold 42px system-ui';
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(animT / 600));
        ctx.fillText('Z', bx + spriteW - 30, by - 10);
        ctx.font = 'bold 28px system-ui';
        ctx.fillText('z', bx + spriteW - 6, by - 24);
        ctx.globalAlpha = 1;
      }

      // sick overlay
      if (pet && pet.sick && !pet.asleep) {
        ctx.font = '28px system-ui';
        ctx.fillText('💀', bx + spriteW - 36, by + 10);
      }
    }

    // poops in front
    if (pet && pet.poops && pet.poops.length) {
      var startX = 80;
      for (var i = 0; i < pet.poops.length; i++) {
        drawSprite(ctx, POOP, startX + i * 80, canvas.height - 80, 4);
      }
    }

    drawEventFx(ctx, canvas.width, canvas.height);
  }

  // Transient canvas effects for surprise events
  function drawEventFx(ctx, w, h) {
    var fx = state.eventFx;
    if (!fx) return;
    var elapsed = Date.now() - fx.startedAt;
    if (fx.type === 'star') {
      // shooting star streaking across the top
      var dur = 2200;
      if (elapsed > dur) { state.eventFx = null; return; }
      var p = elapsed / dur;
      var sx = -40 + p * (w + 80);
      var sy = 40 + p * 90;
      ctx.fillStyle = '#fff7c0';
      ctx.fillRect(sx, sy, 8, 8);
      for (var i = 1; i <= 5; i++) {
        ctx.globalAlpha = 0.5 - i * 0.09;
        ctx.fillRect(sx - i * 14, sy - i * 5, 6, 6);
      }
      ctx.globalAlpha = 1;
    } else if (fx.type === 'visitor') {
      // a wild baby pet wanders across the ground
      var vDur = 4200;
      if (elapsed > vDur) { state.eventFx = null; return; }
      var vp = elapsed / vDur;
      var vx = -100 + vp * (w + 120);
      var vy = h - 8 * 16 - 26 + Math.abs(Math.sin(elapsed / 160)) * -6;
      drawSprite(ctx, STAGE_SPRITES[fx.data.line].baby, vx, vy, 8);
    } else if (fx.type === 'sparkle') {
      // coin / gift sparkles above the pet
      var sDur = 1600;
      if (elapsed > sDur) { state.eventFx = null; return; }
      for (var j = 0; j < 6; j++) {
        var a = (j * 60 + elapsed / 4) * Math.PI / 180;
        var r = 40 + (elapsed / sDur) * 50;
        ctx.globalAlpha = 1 - elapsed / sDur;
        ctx.fillStyle = j % 2 ? '#ffe46a' : '#ffffff';
        ctx.fillRect(w / 2 + Math.cos(a) * r - 3, h / 2 - 60 + Math.sin(a) * r - 3, 6, 6);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ==================== SURPRISE EVENTS ====================
  function scheduleNextEvent(now) {
    state.nextEventAt = now + randRange(CONFIG.eventGapHoursMin, CONFIG.eventGapHoursMax) * 3600 * 1000;
  }
  function maybeTriggerEvent() {
    var pet = state.pet;
    var now = Date.now();
    if (!pet || pet.dead || pet.stage === 'egg' || pet.asleep) return;
    if (state.currentScreen !== 'main') return;
    if (!state.nextEventAt) { scheduleNextEvent(now); saveData(); return; }
    if (now < state.nextEventAt) return;
    scheduleNextEvent(now);

    var roll = Math.random();
    if (roll < 0.35) {
      var found = 5 + Math.floor(Math.random() * 11);
      state.eventFx = { type: 'sparkle', startedAt: now };
      addCoins(found, true);
      showToast('✨ ' + pet.name + ' found ' + found + ' coins!', 'success');
      sfx('event');
    } else if (roll < 0.6) {
      state.eventFx = { type: 'star', startedAt: now };
      pet.happy = clamp(pet.happy + 10, 0, 100);
      addCoins(5, true);
      showToast('🌠 A shooting star! +10 happiness, +5 coins', 'success');
      sfx('event');
    } else if (roll < 0.85) {
      var lines = ['flame', 'star', 'leaf', 'crystal'].filter(function(l) { return l !== pet.eggId; });
      var visitor = lines[Math.floor(Math.random() * lines.length)];
      state.eventFx = { type: 'visitor', startedAt: now, data: { line: visitor } };
      pet.happy = clamp(pet.happy + 8, 0, 100);
      showToast('👋 A wild ' + NAMES[visitor].baby + ' stopped by to play! +8 happiness', 'success');
      sfx('event');
    } else {
      pet.hunger = clamp(pet.hunger + 12, 0, 100);
      state.eventFx = { type: 'sparkle', startedAt: now };
      showToast('🎁 A neighbor left a snack. +12 hunger', 'success');
      sfx('event');
    }
    saveData();
    refreshMainUI();
  }

  function renderEggCanvas() {
    var canvas = document.getElementById('egg-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    var info = EGG_INFO[state.eggIdx];
    var sprite = EGGS[info.id];
    // bg glow
    var grad = ctx.createRadialGradient(100, 100, 20, 100, 100, 110);
    var color = info.id === 'flame' ? '#ff5a1a'
              : info.id === 'star'  ? '#3a7dff'
              : info.id === 'leaf'  ? '#5cd06a'
              :                       '#c489ff';
    grad.addColorStop(0, hexToRgba(color, 0.35));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 200, 200);
    // egg float
    var bounce = Math.sin(animT / 320) * 3;
    drawSprite(ctx, sprite, 20, 20 + bounce, 10);
  }

  function renderWelcome() {
    var canvas = document.getElementById('welcome-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    // cycle through eggs
    var idx = Math.floor(animT / 1500) % EGG_INFO.length;
    var sprite = EGGS[EGG_INFO[idx].id];
    var bounce = Math.sin(animT / 320) * 4;
    drawSprite(ctx, sprite, 20, 20 + bounce, 12);
  }

  function renderEvolve() {
    var pet = state.pet;
    var canvas = document.getElementById('evolve-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    var sprite = petSprite(pet);
    if (!sprite) return;
    var grad = ctx.createRadialGradient(130, 130, 10, 130, 130, 150);
    grad.addColorStop(0, 'rgba(0,212,255,0.6)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 260, 260);
    var sweep = (animT % 1200) / 1200;
    var scale = 13 + Math.sin(animT / 200) * 0.5;
    var bx = (260 - 16 * scale) / 2;
    var by = (260 - 16 * scale) / 2;
    drawSprite(ctx, sprite, bx, by, scale);
    // shimmer
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 - sweep * 0.7) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    var ring = 40 + sweep * 80;
    ctx.arc(130, 130, ring, 0, Math.PI * 2);
    ctx.stroke();
  }

  function renderDeath() {
    var pet = state.pet;
    if (!pet) return;
    var canvas = document.getElementById('death-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    drawSprite(ctx, GHOST, 20, 20 + Math.sin(animT / 600) * 4, 10);
  }

  function hexToRgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255;
    var g = (n >> 8) & 255;
    var b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  // ==================== STATS UI ====================
  function classForStat(v) { return v < 20 ? 'low' : v < 45 ? 'warn' : ''; }

  function refreshMainUI() {
    var pet = state.pet;
    if (!pet) return;
    document.getElementById('pet-name-label').textContent = pet.name || 'Pet';
    document.getElementById('pet-stage-label').textContent = pet.stage === 'egg' ? 'Egg' : petDisplayName(pet);
    document.getElementById('pet-age-label').textContent = ageString(pet);

    var stats = [
      { id: 'stat-hunger', v: pet.hunger },
      { id: 'stat-happy',  v: pet.happy },
      { id: 'stat-clean',  v: pet.clean },
      { id: 'stat-energy', v: pet.energy },
      { id: 'stat-health', v: pet.health },
    ];
    stats.forEach(function(s) {
      var el = document.getElementById(s.id);
      if (!el) return;
      el.classList.remove('warn','low','crit');
      var c = classForStat(s.v);
      if (c) el.classList.add(c);
      if (s.v < 10) el.classList.add('crit');
      var fill = el.querySelector('.stat-fill');
      if (fill) fill.style.width = s.v + '%';
    });

    // mood bubble
    var bubble = document.getElementById('mood-bubble');
    var mood = computeMood(pet);
    if (mood) {
      bubble.classList.remove('hidden');
      bubble.innerHTML = '<span class="mood-icon">' + mood.icon + '</span> <span>' + mood.text + '</span>';
    } else {
      bubble.classList.add('hidden');
    }

    refreshCoinLabels();
    refreshStreakBadge();

    // misbehavior prompt
    var bar = document.getElementById('mischief-bar');
    if (bar) {
      if (pet.mischief && !pet.asleep && !pet.dead) {
        var mLabel = pet.mischief.type === 'beg' ? pet.name + ' is begging for snacks!'
                   : pet.mischief.type === 'tantrum' ? pet.name + ' is throwing a tantrum!'
                   : pet.name + ' is sulking…';
        document.getElementById('mischief-label').textContent = mLabel;
        bar.classList.remove('hidden');
      } else {
        bar.classList.add('hidden');
      }
    }
  }

  // Respond to an active misbehavior. Sulking wants comfort; begging and
  // tantrums want a firm scolding. The wrong call spoils or upsets the pet.
  function respondMischief(response) {
    var pet = state.pet;
    if (!pet || !pet.mischief) return;
    var type = pet.mischief.type;
    pet.mischief = null;
    var correct = (type === 'sulk') ? (response === 'comfort') : (response === 'scold');
    if (correct) {
      if (response === 'comfort') {
        pet.discipline = clamp(pet.discipline + 8, 0, 100);
        pet.happy = clamp(pet.happy + 6, 0, 100);
        showToast('You comforted ' + pet.name + '. Discipline +8', 'success');
        sfx('comfort');
      } else {
        pet.discipline = clamp(pet.discipline + 10, 0, 100);
        showToast('Firm but fair. Discipline +10', 'success');
        sfx('scold');
      }
    } else {
      if (response === 'comfort') {
        pet.discipline = clamp(pet.discipline - 8, 0, 100);
        pet.happy = clamp(pet.happy + 4, 0, 100);
        showToast('Spoiled! It was faking. Discipline -8', 'warn');
        sfx('comfort');
      } else {
        pet.discipline = clamp(pet.discipline + 2, 0, 100);
        pet.happy = clamp(pet.happy - 10, 0, 100);
        showToast('It was genuinely sad… Happiness -10', 'error');
        sfx('scold');
      }
    }
    saveData();
    refreshMainUI();
  }

  function computeMood(pet) {
    if (!pet) return null;
    if (pet.stage === 'egg') {
      var h = hoursSince(pet.bornAt);
      var pct = Math.min(100, Math.round((h / CONFIG.stageHours.egg) * 100));
      return { icon: '🥚', text: 'Hatching · ' + pct + '%' };
    }
    if (pet.asleep) return { icon: '💤', text: dayPhase() === 'night' ? 'Deep night sleep' : 'Sleeping' };
    if (pet.sick)   return { icon: '🤒', text: 'Feeling sick' };
    if (pet.mischief) {
      if (pet.mischief.type === 'beg')     return { icon: '🥺', text: 'Begging for snacks' };
      if (pet.mischief.type === 'tantrum') return { icon: '😤', text: 'Tantrum in progress!' };
      return { icon: '😔', text: 'Sulking…' };
    }
    if (pet.poops.length >= 2) return { icon: '🧹', text: 'Needs cleaning!' };
    if (pet.hunger < 25) return { icon: '🍽', text: 'Very hungry' };
    if (pet.happy  < 25) return { icon: '😢', text: 'Wants to play' };
    if (pet.clean  < 25) return { icon: '🧼', text: 'Feeling messy' };
    if (pet.energy < 20) return { icon: '🥱', text: 'Sleepy' };
    if (dayPhase() === 'night' && pet.energy < 60) return { icon: '🌙', text: 'Getting late…' };
    if (pet.hunger > 70 && pet.happy > 70 && pet.clean > 70) {
      return { icon: '✨', text: 'Loving life' };
    }
    return null;
  }

  function renderStatsScreen() {
    var pet = state.pet;
    if (!pet) return;
    var content = document.getElementById('stats-content');
    var statsRows = [
      { label: 'Hunger',   icon: '🍖', v: pet.hunger },
      { label: 'Happiness',icon: '♥',  v: pet.happy },
      { label: 'Cleanliness',icon:'☢', v: pet.clean },
      { label: 'Energy',   icon: '⚡', v: pet.energy },
      { label: 'Health',   icon: '✚',  v: pet.health },
    ];
    var html = '';
    statsRows.forEach(function(s) {
      var cls = classForStat(s.v);
      html += '<div class="stat-row ' + cls + '">' +
              '<div class="stat-row-icon">' + s.icon + '</div>' +
              '<div class="stat-row-body">' +
              '<div class="stat-row-title">' + s.label + '</div>' +
              '<div class="stat-row-bar"><div class="stat-row-fill" style="width:' + s.v.toFixed(0) + '%"></div></div>' +
              '</div>' +
              '<div class="stat-row-value">' + s.v.toFixed(0) + '</div>' +
              '</div>';
    });
    var avgCare = pet.careSamples > 0 ? (pet.careSum / pet.careSamples).toFixed(0) : '—';
    html += '<div class="bio-grid">' +
            '<div class="bio-cell"><div class="bio-label">Stage</div><div class="bio-value">' + capitalize(pet.stage) + '</div></div>' +
            '<div class="bio-cell"><div class="bio-label">Age</div><div class="bio-value">' + ageString(pet) + '</div></div>' +
            '<div class="bio-cell"><div class="bio-label">Weight</div><div class="bio-value">' + pet.weight + ' lb</div></div>' +
            '<div class="bio-cell"><div class="bio-label">Discipline</div><div class="bio-value">' + pet.discipline + '</div></div>' +
            '<div class="bio-cell"><div class="bio-label">Feedings</div><div class="bio-value">' + pet.feedings + '</div></div>' +
            '<div class="bio-cell"><div class="bio-label">Game wins</div><div class="bio-value">' + pet.gameWins + '</div></div>' +
            '<div class="bio-cell"><div class="bio-label">Care score</div><div class="bio-value">' + avgCare + '/100</div></div>' +
            '<div class="bio-cell"><div class="bio-label">Sick?</div><div class="bio-value">' + (pet.sick ? 'Yes' : 'No') + '</div></div>' +
            '<div class="bio-cell"><div class="bio-label">Generation</div><div class="bio-value">' + (pet.gen || 1) + '</div></div>' +
            '<div class="bio-cell"><div class="bio-label">Lineage boon</div><div class="bio-value">' +
              (pet.boon ? '✨ ' + pet.boon.from + ' (-12% drain)' : 'None') + '</div></div>' +
            '</div>';
    content.innerHTML = html;
  }
  function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

  // ==================== NAVIGATION ====================
  var screens = {};
  function collectScreens() {
    document.querySelectorAll('.screen').forEach(function(s) {
      if (s.id) screens[s.id] = s;
    });
  }

  function navigateTo(id, opts) {
    opts = opts || {};
    var add = opts.addToHistory !== false;
    if (add && state.currentScreen && state.currentScreen !== id) {
      state.screenHistory.push(state.currentScreen);
    }
    Object.values(screens).forEach(function(s) { s.classList.add('hidden'); });
    if (screens[id]) {
      screens[id].classList.remove('hidden');
      state.currentScreen = id;
      onScreenEnter(id);
      focusFirst(screens[id]);
    }
  }

  function navigateBack() {
    if (state.miniGame) { state.miniGame.stop && state.miniGame.stop(); state.miniGame = null; }
    if (state.screenHistory.length > 0) {
      navigateTo(state.screenHistory.pop(), { addToHistory: false });
    }
  }

  function focusFirst(container) {
    var el = container.querySelector('.focusable:not([disabled]):not(.hidden)');
    if (el) el.focus();
  }

  // Geometric position lookup for 2D D-pad navigation
  function moveFocus(dir) {
    var container = screens[state.currentScreen];
    if (!container) return;
    var els = Array.from(container.querySelectorAll('.focusable:not([disabled]):not(.hidden)'));
    if (!els.length) return;
    var cur = document.activeElement;
    var idx = els.indexOf(cur);
    if (idx === -1) { els[0].focus(); return; }
    // Use bounding boxes for 2D navigation
    var rcur = cur.getBoundingClientRect();
    var best = null, bestScore = Infinity;
    els.forEach(function(el) {
      if (el === cur) return;
      var r = el.getBoundingClientRect();
      var dx = r.left + r.width/2 - (rcur.left + rcur.width/2);
      var dy = r.top + r.height/2 - (rcur.top + rcur.height/2);
      var ok = false;
      if (dir === 'left'  && dx < -4) ok = true;
      if (dir === 'right' && dx > 4)  ok = true;
      if (dir === 'up'    && dy < -4) ok = true;
      if (dir === 'down'  && dy > 4)  ok = true;
      if (!ok) return;
      var perp = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx);
      var primary = (dir === 'left' || dir === 'right') ? Math.abs(dx) : Math.abs(dy);
      var score = primary + perp * 2;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) {
      best.focus();
      sfx('move');
      var sp = best.closest('.content, .list-container, .letter-grid');
      if (sp) best.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      // wrap around: just go linear in the dir
      var step = (dir === 'down' || dir === 'right') ? 1 : -1;
      var next = (idx + step + els.length) % els.length;
      els[next].focus();
    }
  }

  function onScreenEnter(id) {
    if (id === 'main') { checkStreak(); refreshMainUI(); }
    if (id === 'shop') renderShop();
    if (id === 'album') renderAlbum();
    if (id === 'stats') renderStatsScreen();
    if (id === 'name-pet') {
      state.nameDraft = '';
      state.nameCursor = 0;
      buildLetterGrid();
      refreshNameDisplay();
    }
    if (id === 'egg-select') {
      refreshEggSelect();
    }
    if (id === 'settings') {
      refreshSettingsUI();
    }
    if (id === 'evolve') {
      // auto-set name in evolve title
      document.getElementById('evolve-name').textContent = petDisplayName(state.pet);
    }
    if (id === 'death') {
      var pet = state.pet;
      if (pet) {
        document.getElementById('death-summary').textContent =
          'Your friend ' + pet.name + ' (' + petDisplayName(pet) + ') lived ' + ageString(pet) + '. ' +
          (pet.deathReason === 'illness' ? 'Lost to illness.' : 'Passed peacefully of old age.');
      }
    }
  }

  // ==================== EGG SELECT ====================
  function refreshEggSelect() {
    var info = EGG_INFO[state.eggIdx];
    document.getElementById('egg-name').textContent = info.name;
    document.getElementById('egg-desc').textContent = info.tagline;
    var dotsEl = document.getElementById('egg-dots');
    dotsEl.innerHTML = '';
    EGG_INFO.forEach(function(_, i) {
      var d = document.createElement('div');
      d.className = 'egg-dot' + (i === state.eggIdx ? ' active' : '');
      dotsEl.appendChild(d);
    });
  }

  // ==================== NAMING ====================
  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function buildLetterGrid() {
    var grid = document.getElementById('letter-grid');
    grid.innerHTML = '';
    for (var i = 0; i < LETTERS.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'letter-cell focusable';
      btn.textContent = LETTERS[i];
      btn.dataset.action = 'letter';
      btn.dataset.letter = LETTERS[i];
      grid.appendChild(btn);
    }
  }
  function refreshNameDisplay() {
    var disp = state.nameDraft || '';
    if (disp.length < 8) disp = disp + '_';
    document.getElementById('name-display').textContent = disp;
  }

  // ==================== SHOP ====================
  // Rare accessories rotate stock by day: crown on even days, halo on odd.
  function rareInStockToday() {
    var doy = Math.floor(Date.now() / 86400000);
    return doy % 2 === 0 ? 'crown' : 'halo';
  }

  function renderShop() {
    refreshCoinLabels();
    var content = document.getElementById('shop-content');
    var html = '<div class="shop-section-label">Treats</div>';
    SHOP_FOODS.forEach(function(f) {
      var afford = state.coins >= f.price;
      html += '<button class="big-action focusable shop-row' + (afford ? '' : ' cant-afford') + '" ' +
              'data-action="shop-food" data-item="' + f.id + '">' +
              '<div class="big-action-icon">' + f.icon + '</div>' +
              '<div class="big-action-body">' +
              '<div class="big-action-title">' + f.name + '</div>' +
              '<div class="big-action-sub">' + f.desc + '</div>' +
              '</div>' +
              '<div class="shop-price">🪙 ' + f.price + '</div>' +
              '</button>';
    });
    html += '<div class="shop-section-label">Accessories</div>';
    var rareToday = rareInStockToday();
    Object.keys(ACCESSORIES).forEach(function(id) {
      var a = ACCESSORIES[id];
      var owned = !!state.owned[id];
      // rare items only appear in the shop on their stock day (once owned, always listed)
      if (a.rare != null && !owned && id !== rareToday) return;
      var equipped = state.equipped === id;
      var afford = state.coins >= a.price;
      var priceHtml = owned
        ? '<div class="shop-price owned">' + (equipped ? 'Equipped ✓' : 'Equip') + '</div>'
        : '<div class="shop-price">🪙 ' + a.price + '</div>';
      html += '<button class="big-action focusable shop-row' + (!owned && !afford ? ' cant-afford' : '') + (equipped ? ' equipped' : '') + '" ' +
              'data-action="shop-acc" data-item="' + id + '">' +
              '<div class="big-action-icon">' + a.icon + '</div>' +
              '<div class="big-action-body">' +
              '<div class="big-action-title">' + a.name + (a.rare != null ? ' <span class="rare-tag">RARE</span>' : '') + '</div>' +
              '<div class="big-action-sub">' + a.desc + '</div>' +
              '</div>' + priceHtml + '</button>';
    });
    html += '<div class="shop-footer">Rare stock rotates daily. Earn coins from games, streaks & events.</div>';
    content.innerHTML = html;
  }

  function buyFood(id) {
    var pet = state.pet;
    var item = null;
    SHOP_FOODS.forEach(function(f) { if (f.id === id) item = f; });
    if (!item) return;
    if (!pet || pet.dead || pet.stage === 'egg') { showToast('No pet to feed right now.', 'warn'); return; }
    if (pet.asleep) { showToast('They\'re asleep — let them rest.', 'warn'); return; }
    if (state.coins < item.price) { showToast('Not enough coins.', 'error'); return; }
    addCoins(-item.price, true);
    if (id === 'cake') {
      pet.hunger = clamp(pet.hunger + 30, 0, 100);
      pet.happy = clamp(pet.happy + 12, 0, 100);
      pet.weight += 2;
      pet.feedings++;
      showToast('🍰 Delicious! Hunger +30, happiness +12', 'success');
    } else if (id === 'salad') {
      pet.hunger = clamp(pet.hunger + 18, 0, 100);
      pet.weight = Math.max(1, pet.weight - 1);
      pet.clean = clamp(pet.clean + 4, 0, 100);
      pet.feedings++;
      showToast('🥗 Healthy choice! Hunger +18, weight -1', 'success');
    } else if (id === 'tonic') {
      pet.energy = clamp(pet.energy + 35, 0, 100);
      showToast('🧪 Zing! Energy +35', 'success');
    } else if (id === 'mystery') {
      var r = Math.random();
      if (r < 0.15) {
        var refund = item.price + 10;
        addCoins(refund, true);
        showToast('🎁 The box was full of coins! +' + refund, 'success');
      } else if (r < 0.55) {
        pet.hunger = clamp(pet.hunger + 35, 0, 100);
        pet.happy = clamp(pet.happy + 10, 0, 100);
        pet.feedings++;
        showToast('🎁 A feast! Hunger +35, happiness +10', 'success');
      } else {
        pet.hunger = clamp(pet.hunger + 10, 0, 100);
        pet.feedings++;
        showToast('🎁 Hmm, stale crackers. Hunger +10', 'warn');
      }
    }
    sfx('eat');
    saveData();
    renderShop();
  }

  function buyOrEquipAccessory(id) {
    var a = ACCESSORIES[id];
    if (!a) return;
    if (state.owned[id]) {
      state.equipped = state.equipped === id ? null : id;
      showToast(state.equipped ? a.icon + ' ' + a.name + ' equipped!' : a.name + ' removed.', 'success');
      sfx('select');
    } else {
      if (state.coins < a.price) { showToast('Not enough coins.', 'error'); return; }
      addCoins(-a.price, true);
      state.owned[id] = true;
      state.equipped = id;
      showToast(a.icon + ' ' + a.name + ' — yours! Equipped.', 'success');
      sfx('win');
    }
    saveData();
    renderShop();
  }

  // ==================== HALL OF FAME ====================
  function renderAlbum() {
    var content = document.getElementById('album-content');
    if (!state.history.length) {
      content.innerHTML = '<div class="album-empty">No pets remembered yet.<br>Raise your first friend and their story will live here.</div>';
      return;
    }
    var html = '';
    state.history.forEach(function(h) {
      var lived = Math.max(0, h.diedAt - h.bornAt);
      var days = Math.floor(lived / 86400000);
      var hours = Math.floor((lived % 86400000) / 3600000);
      var cause = h.reason === 'oldage' ? '☀ Passed of old age' : '🥀 Lost to illness';
      var secret = h.branch === 'secret' ? ' <span class="rare-tag">✦ SECRET</span>' : '';
      html += '<div class="album-row">' +
              '<div class="album-icon">' + (LINE_ICONS[h.eggId] || '🥚') + '</div>' +
              '<div class="album-body">' +
              '<div class="album-title">' + h.name + ' · ' + (h.finalName || h.finalStage) + secret + '</div>' +
              '<div class="album-sub">Gen ' + (h.gen || '?') + ' · lived ' + days + 'd ' + hours + 'h · care ' +
                (h.careAvg != null ? h.careAvg + '/100' : '—') + '</div>' +
              '<div class="album-sub">' + cause + '</div>' +
              '</div></div>';
    });
    if (state.legacy) {
      html += '<div class="album-legacy">✨ ' + state.legacy.from + '\'s spirit will bless your next egg.</div>';
    }
    content.innerHTML = html;
  }

  // ==================== ACTIONS ====================
  function feed(kind) {
    var pet = state.pet;
    if (!pet || pet.dead || pet.stage === 'egg') return;
    if (pet.asleep) { showToast('They\'re asleep — let them rest.', 'warn'); return; }
    if (kind === 'meal') {
      if (pet.hunger > 90) { pet.discipline = clamp(pet.discipline - 4, 0, 100); showToast('Too full to eat more.', 'warn'); return; }
      pet.hunger = clamp(pet.hunger + 40, 0, 100);
      pet.weight += 1;
      pet.feedings++;
      sfx('eat');
      showToast('Full belly!', 'success');
    } else if (kind === 'snack') {
      if (pet.hunger > 95) { showToast('Already stuffed.', 'warn'); return; }
      pet.hunger = clamp(pet.hunger + 15, 0, 100);
      pet.happy  = clamp(pet.happy + 10, 0, 100);
      pet.weight += 1;
      pet.feedings++;
      sfx('eat');
      showToast('Yummy!', 'success');
    } else if (kind === 'water') {
      pet.hunger = clamp(pet.hunger + 5, 0, 100);
      pet.health = clamp(pet.health + 3, 0, 100);
      showToast('Refreshed.', 'success');
    }
    saveData();
    refreshMainUI();
  }

  function clean() {
    var pet = state.pet;
    if (!pet || pet.dead || pet.stage === 'egg') return;
    if (pet.poops.length === 0) {
      pet.clean = clamp(pet.clean + 15, 0, 100);
      showToast('Already spotless.', 'success');
    } else {
      var cleaned = pet.poops.length;
      pet.poops = [];
      pet.clean = clamp(pet.clean + 40, 0, 100);
      pet.cleanings++;
      sfx('clean');
      showToast('Cleaned up ' + cleaned + ' mess' + (cleaned > 1 ? 'es' : '') + '!', 'success');
    }
    saveData();
    refreshMainUI();
  }

  function sleep() {
    var pet = state.pet;
    if (!pet || pet.dead || pet.stage === 'egg') return;
    if (pet.asleep) {
      pet.asleep = false;
      showToast('Woken up.', 'warn');
    } else {
      pet.asleep = true;
      showToast('Tucked in. Sweet dreams.', 'success');
    }
    saveData();
    refreshMainUI();
  }

  function medicine() {
    var pet = state.pet;
    if (!pet || pet.dead || pet.stage === 'egg') return;
    if (!pet.sick) {
      pet.health = clamp(pet.health - 4, 0, 100);
      showToast('No medicine needed — and it tasted bad!', 'warn');
      return;
    }
    pet.sick = false;
    pet.sickSinceMs = 0;
    pet.health = clamp(pet.health + 25, 0, 100);
    sfx('heal');
    showToast('Feeling better!', 'success');
    saveData();
    refreshMainUI();
  }

  // ==================== MINI-GAMES ====================
  // === SIMON / Echo Dance ===
  var simonState = null;
  function startSimon() {
    simonState = {
      sequence: [],
      playerIdx: 0,
      round: 1,
      isShowing: false,
      isAccepting: false,
    };
    state.miniGame = { stop: function() { simonState = null; } };
    nextSimonRound();
  }
  function nextSimonRound() {
    if (!simonState) return;
    var dirs = ['up','down','left','right'];
    simonState.sequence.push(dirs[Math.floor(Math.random()*4)]);
    simonState.playerIdx = 0;
    simonState.isAccepting = false;
    document.getElementById('simon-round').textContent = 'Round ' + simonState.round;
    document.getElementById('simon-status').textContent = '';
    document.getElementById('simon-prompt').textContent = 'Watch the pattern';
    showSimonSequence();
  }
  function showSimonSequence() {
    if (!simonState) return;
    simonState.isShowing = true;
    var i = 0;
    function next() {
      if (!simonState) return;
      if (i >= simonState.sequence.length) {
        simonState.isShowing = false;
        simonState.isAccepting = true;
        document.getElementById('simon-prompt').textContent = 'Your turn';
        return;
      }
      flashSimonCell(simonState.sequence[i]);
      i++;
      setTimeout(next, 600);
    }
    setTimeout(next, 500);
  }
  function flashSimonCell(dir, klass) {
    klass = klass || 'lit';
    var el = document.getElementById('simon-' + dir);
    if (!el) return;
    el.classList.add(klass);
    setTimeout(function() { el.classList.remove(klass); }, 350);
  }
  function simonInput(dir) {
    if (!simonState || !simonState.isAccepting) return;
    var expected = simonState.sequence[simonState.playerIdx];
    if (dir === expected) {
      flashSimonCell(dir, 'ok');
      simonState.playerIdx++;
      if (simonState.playerIdx >= simonState.sequence.length) {
        simonState.isAccepting = false;
        document.getElementById('simon-status').textContent = 'Great!';
        simonState.round++;
        setTimeout(nextSimonRound, 700);
      }
    } else {
      flashSimonCell(dir, 'fail');
      simonState.isAccepting = false;
      endSimon();
    }
  }
  function endSimon() {
    if (!simonState) return;
    var rounds = simonState.round - 1;
    document.getElementById('simon-status').textContent = 'You scored ' + rounds + ' round' + (rounds !== 1 ? 's' : '') + '.';
    document.getElementById('simon-prompt').textContent = 'Back to return';
    if (state.pet && !state.pet.dead) {
      // Generous: baseline +12 for playing, +10 per round survived.
      var gain = 12 + rounds * 10;
      var coins = rounds * 2;
      state.pet.happy = clamp(state.pet.happy + gain, 0, 100);
      state.pet.energy = clamp(state.pet.energy - rounds, 0, 100);
      if (coins > 0) addCoins(coins, true);
      if (rounds >= 3) {
        state.pet.gameWins++;
        showToast('Great session! +' + gain + ' happiness, +' + coins + ' coins', 'success');
        sfx('win');
      } else {
        showToast('+' + gain + ' happiness' + (coins ? ', +' + coins + ' coins' : ''), 'success');
        sfx('lose');
      }
      saveData();
    }
    simonState = null;
  }

  // === REACTION / Star Catch ===
  var reactionState = null;
  function startReaction() {
    reactionState = { round: 0, hits: 0, misses: 0, total: 5, waiting: false, showAt: 0, timeoutId: 0 };
    document.getElementById('reaction-score').textContent = '0/5';
    document.getElementById('reaction-text').textContent = 'Press Tap to start';
    document.getElementById('reaction-star').classList.add('hidden');
    document.getElementById('reaction-stage').className = 'reaction-stage';
    state.miniGame = { stop: function() {
      if (reactionState && reactionState.timeoutId) clearTimeout(reactionState.timeoutId);
      reactionState = null;
    }};
  }
  function reactionTap() {
    var rs = reactionState;
    if (!rs) return;
    if (rs.round >= rs.total) {
      endReaction(); return;
    }
    if (!rs.waiting) {
      // start round
      rs.round++;
      rs.waiting = true;
      document.getElementById('reaction-text').textContent = 'Wait...';
      document.getElementById('reaction-star').classList.add('hidden');
      document.getElementById('reaction-stage').className = 'reaction-stage ready';
      var delay = 800 + Math.random() * 2200;
      rs.showAt = Date.now() + delay;
      rs.timeoutId = setTimeout(function() {
        if (!rs.waiting) return;
        document.getElementById('reaction-text').textContent = '';
        document.getElementById('reaction-star').classList.remove('hidden');
        document.getElementById('reaction-stage').className = 'reaction-stage go';
        rs.showAt = Date.now();
        rs.showing = true;
      }, delay);
    } else {
      // mid-round
      if (rs.showing) {
        // hit
        var rt = Date.now() - rs.showAt;
        rs.hits++;
        rs.waiting = false;
        rs.showing = false;
        document.getElementById('reaction-text').textContent = rt + 'ms!';
        document.getElementById('reaction-star').classList.add('hidden');
        document.getElementById('reaction-stage').className = 'reaction-stage';
      } else {
        // false start
        rs.misses++;
        rs.waiting = false;
        if (rs.timeoutId) clearTimeout(rs.timeoutId);
        document.getElementById('reaction-text').textContent = 'Too early!';
        document.getElementById('reaction-stage').className = 'reaction-stage bad';
      }
      document.getElementById('reaction-score').textContent = rs.round + '/' + rs.total;
      if (rs.round >= rs.total) {
        setTimeout(endReaction, 700);
      }
    }
  }
  function endReaction() {
    var rs = reactionState;
    if (!rs) return;
    document.getElementById('reaction-text').textContent = 'Hits: ' + rs.hits + ' / ' + rs.total;
    if (state.pet && !state.pet.dead) {
      // Generous: baseline +15 for playing, +10 per hit.
      var gain = 15 + rs.hits * 10;
      var coins = 1 + rs.hits * 2;
      state.pet.happy = clamp(state.pet.happy + gain, 0, 100);
      addCoins(coins, true);
      if (rs.hits >= 3) { state.pet.gameWins++; sfx('win'); } else sfx('lose');
      showToast('+' + gain + ' happiness, +' + coins + ' coins', 'success');
      saveData();
    }
    reactionState = null;
  }

  // === GUESS / Hi-Lo ===
  var guessState = null;
  function startGuess() {
    guessState = { target: 1 + Math.floor(Math.random() * 100), tries: 0, guess: 50, lastHint: '' };
    document.getElementById('guess-current').textContent = '50';
    document.getElementById('guess-hint').textContent = 'Guess 1-100';
    document.getElementById('guess-tries').textContent = 'Tries: 0';
    state.miniGame = { stop: function() { guessState = null; } };
  }
  function guessAdjust(d) {
    if (!guessState) return;
    guessState.guess = clamp(guessState.guess + d, 1, 100);
    document.getElementById('guess-current').textContent = guessState.guess;
  }
  function guessSubmit() {
    if (!guessState) return;
    guessState.tries++;
    document.getElementById('guess-tries').textContent = 'Tries: ' + guessState.tries;
    if (guessState.guess === guessState.target) {
      document.getElementById('guess-hint').textContent = 'Got it in ' + guessState.tries + '!';
      if (state.pet && !state.pet.dead) {
        // Always +25 minimum for winning, faster solve = bonus up to +20.
        var bonus = 25 + Math.max(0, 20 - guessState.tries * 2);
        var coins = Math.max(4, 14 - guessState.tries);
        state.pet.happy = clamp(state.pet.happy + bonus, 0, 100);
        addCoins(coins, true);
        if (guessState.tries <= 7) state.pet.gameWins++;
        sfx('win');
        saveData();
        showToast('+' + bonus + ' happiness, +' + coins + ' coins', 'success');
      }
      guessState = null;
    } else if (guessState.guess < guessState.target) {
      document.getElementById('guess-hint').textContent = 'Too low — go higher.';
    } else {
      document.getElementById('guess-hint').textContent = 'Too high — go lower.';
    }
  }

  // === ROCK PAPER SCISSORS ===
  var rpsState = null;
  var RPS_ICONS = { rock: '✊', paper: '✋', scissors: '✌' };
  function startRps() {
    rpsState = { wins: 0, losses: 0, locked: false };
    document.getElementById('rps-score').textContent = '0-0';
    document.getElementById('rps-you').textContent = '❓';
    document.getElementById('rps-pet').textContent = '❓';
    var r = document.getElementById('rps-result');
    r.textContent = 'Pick your move';
    r.className = 'rps-result';
    state.miniGame = { stop: function() { rpsState = null; } };
  }
  function rpsPlay(choice) {
    if (!rpsState || rpsState.locked) return;
    rpsState.locked = true;
    var picks = ['rock','paper','scissors'];
    var pet = picks[Math.floor(Math.random() * 3)];
    document.getElementById('rps-you').textContent = RPS_ICONS[choice];
    document.getElementById('rps-pet').textContent = '…';
    setTimeout(function() {
      if (!rpsState) return;
      document.getElementById('rps-pet').textContent = RPS_ICONS[pet];
      var r = document.getElementById('rps-result');
      var verdict;
      var gain = 0;
      if (pet === choice) {
        verdict = 'Tie!';
        r.className = 'rps-result tie';
        gain = 8;
      } else if (
        (choice === 'rock' && pet === 'scissors') ||
        (choice === 'paper' && pet === 'rock') ||
        (choice === 'scissors' && pet === 'paper')
      ) {
        verdict = 'You win!';
        r.className = 'rps-result win';
        gain = 15;
        rpsState.wins++;
        addCoins(4, true);
        sfx('win');
        if (state.pet && !state.pet.dead) {
          if (rpsState.wins % 2 === 0) state.pet.gameWins++;
        }
      } else {
        verdict = 'Pet wins.';
        r.className = 'rps-result lose';
        gain = 7;
        rpsState.losses++;
        sfx('lose');
      }
      if (pet === choice) addCoins(1, true);
      if (state.pet && !state.pet.dead) {
        state.pet.happy = clamp(state.pet.happy + gain, 0, 100);
        saveData();
      }
      r.textContent = verdict + ' Pick again.';
      document.getElementById('rps-score').textContent = rpsState.wins + '-' + rpsState.losses;
      rpsState.locked = false;
    }, 450);
  }

  // === COIN FLIP ===
  var coinState = null;
  function startCoin() {
    coinState = { wins: 0, losses: 0, locked: false };
    document.getElementById('coin-score').textContent = '0-0';
    document.getElementById('coin').textContent = '?';
    document.getElementById('coin').className = 'coin';
    var r = document.getElementById('coin-result');
    r.textContent = 'Call it';
    r.className = 'coin-result';
    state.miniGame = { stop: function() { coinState = null; } };
  }
  function coinCall(call) {
    if (!coinState || coinState.locked) return;
    coinState.locked = true;
    var coin = document.getElementById('coin');
    coin.textContent = '?';
    coin.className = 'coin flipping';
    setTimeout(function() {
      if (!coinState) return;
      var result = Math.random() < 0.5 ? 'heads' : 'tails';
      coin.textContent = result === 'heads' ? 'H' : 'T';
      coin.className = 'coin';
      var r = document.getElementById('coin-result');
      var gain;
      if (result === call) {
        r.textContent = 'It\'s ' + result + '! You called it. +5 coins';
        r.className = 'coin-result win';
        coinState.wins++;
        gain = 18;
        addCoins(5, true);
        sfx('coin');
        if (state.pet && !state.pet.dead) {
          if (coinState.wins % 2 === 0) state.pet.gameWins++;
        }
      } else {
        r.textContent = 'It\'s ' + result + '. Better luck next.';
        r.className = 'coin-result lose';
        coinState.losses++;
        gain = 9;
        sfx('lose');
      }
      if (state.pet && !state.pet.dead) {
        state.pet.happy = clamp(state.pet.happy + gain, 0, 100);
        saveData();
      }
      document.getElementById('coin-score').textContent = coinState.wins + '-' + coinState.losses;
      coinState.locked = false;
    }, 950);
  }

  // === TIC TAC TOE ===
  var tttState = null;
  var TTT_LINES = [
    [0,1,2],[3,4,5],[6,7,8],   // rows
    [0,3,6],[1,4,7],[2,5,8],   // cols
    [0,4,8],[2,4,6],           // diagonals
  ];
  function startTtt() {
    tttState = { board: ['','','','','','','','',''], turn: 'X', over: false, wins: 0, losses: 0 };
    state.miniGame = { stop: function() { tttState = null; } };
    redrawTtt();
  }
  function redrawTtt() {
    if (!tttState) return;
    document.getElementById('ttt-score').textContent = tttState.wins + '-' + tttState.losses;
    var cells = document.querySelectorAll('#ttt-board .ttt-cell');
    cells.forEach(function(c) {
      var i = parseInt(c.dataset.ttt, 10);
      var v = tttState.board[i];
      c.textContent = v;
      if (v) c.dataset.mark = v;
      else delete c.dataset.mark;
      c.classList.remove('win-line');
    });
    var status = document.getElementById('ttt-status');
    if (tttState.over) {
      if (tttState.winLine) {
        tttState.winLine.forEach(function(i){ cells[i].classList.add('win-line'); });
      }
      if (tttState.winner === 'X') {
        status.textContent = 'You win!';
        status.className = 'ttt-status win';
      } else if (tttState.winner === 'O') {
        status.textContent = 'Pet wins.';
        status.className = 'ttt-status lose';
      } else {
        status.textContent = 'Draw.';
        status.className = 'ttt-status tie';
      }
    } else {
      status.textContent = tttState.turn === 'X' ? 'Your turn (X)' : 'Pet thinking...';
      status.className = 'ttt-status';
    }
  }
  function tttCheckWin(board, mark) {
    for (var i = 0; i < TTT_LINES.length; i++) {
      var L = TTT_LINES[i];
      if (board[L[0]] === mark && board[L[1]] === mark && board[L[2]] === mark) {
        return L;
      }
    }
    return null;
  }
  function tttClick(idx) {
    if (!tttState || tttState.over || tttState.turn !== 'X' || tttState.board[idx]) return;
    tttState.board[idx] = 'X';
    var win = tttCheckWin(tttState.board, 'X');
    if (win) {
      tttState.over = true;
      tttState.winner = 'X';
      tttState.winLine = win;
      tttState.wins++;
      if (state.pet && !state.pet.dead) {
        state.pet.happy = clamp(state.pet.happy + 30, 0, 100);
        state.pet.gameWins++;
        addCoins(8, true);
        sfx('win');
        saveData();
        showToast('Nice! +30 happiness, +8 coins', 'success');
      }
      redrawTtt();
      return;
    }
    if (tttState.board.every(function(c){ return c; })) {
      tttState.over = true;
      tttState.winner = null;
      if (state.pet && !state.pet.dead) {
        state.pet.happy = clamp(state.pet.happy + 15, 0, 100);
        addCoins(3, true);
        saveData();
        showToast('Draw — +15 happiness, +3 coins', 'success');
      }
      redrawTtt();
      return;
    }
    tttState.turn = 'O';
    redrawTtt();
    setTimeout(tttPetMove, 500);
  }
  function tttPetMove() {
    if (!tttState || tttState.over) return;
    // Simple AI: take winning move if any, else block, else random
    var board = tttState.board;
    var pick = null;
    // win
    for (var i = 0; i < 9; i++) {
      if (!board[i]) {
        board[i] = 'O';
        if (tttCheckWin(board, 'O')) pick = i;
        board[i] = '';
        if (pick !== null) break;
      }
    }
    // block
    if (pick === null) {
      for (var j = 0; j < 9; j++) {
        if (!board[j]) {
          board[j] = 'X';
          if (tttCheckWin(board, 'X')) pick = j;
          board[j] = '';
          if (pick !== null) break;
        }
      }
    }
    // center
    if (pick === null && !board[4]) pick = 4;
    // random
    if (pick === null) {
      var open = [];
      for (var k = 0; k < 9; k++) if (!board[k]) open.push(k);
      pick = open[Math.floor(Math.random() * open.length)];
    }
    board[pick] = 'O';
    var win = tttCheckWin(board, 'O');
    if (win) {
      tttState.over = true;
      tttState.winner = 'O';
      tttState.winLine = win;
      tttState.losses++;
      if (state.pet && !state.pet.dead) {
        state.pet.happy = clamp(state.pet.happy + 12, 0, 100);
        sfx('lose');
        saveData();
        showToast('Good game — +12 happiness', 'success');
      }
      redrawTtt();
      return;
    }
    if (board.every(function(c){ return c; })) {
      tttState.over = true;
      tttState.winner = null;
      if (state.pet && !state.pet.dead) {
        state.pet.happy = clamp(state.pet.happy + 15, 0, 100);
        addCoins(3, true);
        saveData();
        showToast('Draw — +15 happiness, +3 coins', 'success');
      }
      redrawTtt();
      return;
    }
    tttState.turn = 'X';
    redrawTtt();
  }
  function tttReset() {
    if (!tttState) return;
    var w = tttState.wins, l = tttState.losses;
    startTtt();
    tttState.wins = w;
    tttState.losses = l;
    redrawTtt();
  }

  // ==================== TOAST ====================
  var toastTimer;
  function showToast(msg, kind) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast ' + (kind || '');
    void el.offsetWidth;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { el.classList.remove('visible'); }, 2500);
  }

  // ==================== EVOLVE SCREEN ====================
  var evolveQueue = [];
  function showEvolveScreen(title, pet) {
    evolveQueue.push({ title: title, petStage: pet.stage });
    if (state.currentScreen !== 'evolve') {
      navigateTo('evolve', { addToHistory: false });
      document.querySelector('.evolve-title').textContent = title;
      sfx('evolve');
    }
  }

  // ==================== SETTINGS ====================
  function refreshSettingsUI() {
    document.getElementById('device-id-label').textContent = state.deviceId || '—';
    var soundEl = document.getElementById('sound-label');
    if (soundEl) soundEl.textContent = state.muted ? 'Off' : 'On';
    var streakEl = document.getElementById('streak-label');
    if (streakEl) streakEl.textContent = state.streak.count >= 1
      ? '🔥 ' + state.streak.count + ' day' + (state.streak.count > 1 ? 's' : '')
      : '—';
  }

  function resetEverything() {
    state.pet = null;
    state.history = [];
    state.coins = CONFIG.startCoins;
    state.streak = { last: '', count: 0 };
    state.owned = {};
    state.equipped = null;
    state.legacy = null;
    state.nextEventAt = 0;
    saveData();
    navigateTo('welcome', { addToHistory: false });
  }

  // ==================== ACTION DISPATCH ====================
  function handleAction(action, el) {
    switch (action) {
      case 'back': navigateBack(); break;
      case 'open-settings': navigateTo('settings'); break;
      case 'open-howto':    navigateTo('how-to-play'); break;
      case 'settings-reset': resetEverything(); break;
      case 'welcome-start': navigateTo('egg-select'); break;

      case 'egg-prev':
        state.eggIdx = (state.eggIdx - 1 + EGG_INFO.length) % EGG_INFO.length;
        refreshEggSelect();
        break;
      case 'egg-next':
        state.eggIdx = (state.eggIdx + 1) % EGG_INFO.length;
        refreshEggSelect();
        break;
      case 'egg-confirm':
        navigateTo('name-pet');
        break;

      case 'letter':
        if (state.nameDraft.length < 8) {
          state.nameDraft += el.dataset.letter;
          refreshNameDisplay();
        }
        break;
      case 'name-del':
        state.nameDraft = state.nameDraft.slice(0, -1);
        refreshNameDisplay();
        break;
      case 'name-confirm':
        var nm = (state.nameDraft || '').trim();
        if (nm.length < 1) { showToast('Pick a name first.', 'warn'); return; }
        state.pet = freshPet(EGG_INFO[state.eggIdx].id, nm);
        saveData();
        // clear history so back doesn't return to naming flow
        state.screenHistory = [];
        navigateTo('main', { addToHistory: false });
        if (state.pet.boon) {
          showToast('✨ ' + state.pet.boon.from + '\'s spirit watches over this egg.', 'success');
        }
        break;

      case 'act-feed': navigateTo('feed'); break;
      case 'act-play': navigateTo('play'); break;
      case 'act-shop': navigateTo('shop'); break;
      case 'act-clean': clean(); break;
      case 'act-sleep': sleep(); break;
      case 'act-medicine': medicine(); break;
      case 'act-stats': navigateTo('stats'); break;

      case 'shop-food': buyFood(el.dataset.item); break;
      case 'shop-acc': buyOrEquipAccessory(el.dataset.item); break;

      case 'open-album': navigateTo('album'); break;

      case 'mischief-comfort': respondMischief('comfort'); break;
      case 'mischief-scold': respondMischief('scold'); break;

      case 'settings-sound':
        state.muted = !state.muted;
        saveData();
        refreshSettingsUI();
        if (!state.muted) sfx('select');
        break;

      case 'feed-meal': feed('meal'); navigateBack(); break;
      case 'feed-snack': feed('snack'); navigateBack(); break;
      case 'feed-water': feed('water'); navigateBack(); break;

      case 'play-simon':
        navigateTo('game-simon');
        startSimon();
        break;
      case 'play-reaction':
        navigateTo('game-reaction');
        startReaction();
        break;
      case 'play-guess':
        navigateTo('game-guess');
        startGuess();
        break;
      case 'play-rps':
        navigateTo('game-rps');
        startRps();
        break;
      case 'play-coin':
        navigateTo('game-coin');
        startCoin();
        break;
      case 'play-ttt':
        navigateTo('game-ttt');
        startTtt();
        break;

      case 'rps-rock':     rpsPlay('rock'); break;
      case 'rps-paper':    rpsPlay('paper'); break;
      case 'rps-scissors': rpsPlay('scissors'); break;

      case 'coin-heads':   coinCall('heads'); break;
      case 'coin-tails':   coinCall('tails'); break;

      case 'ttt-reset':    tttReset(); break;

      case 'reaction-tap': reactionTap(); break;

      case 'guess-down10': guessAdjust(-10); break;
      case 'guess-down1': guessAdjust(-1); break;
      case 'guess-up1': guessAdjust(1); break;
      case 'guess-up10': guessAdjust(10); break;
      case 'guess-submit': guessSubmit(); break;

      case 'evolve-continue':
        evolveQueue = [];
        navigateTo('main', { addToHistory: false });
        break;
      case 'death-hatch':
        state.pet = null;
        state.screenHistory = [];
        saveData();
        navigateTo('egg-select', { addToHistory: false });
        break;
    }
  }

  // ==================== INPUT ====================
  function setupEvents() {
    document.addEventListener('click', function(e) {
      var tttCell = e.target.closest('[data-ttt]');
      if (tttCell) {
        tttClick(parseInt(tttCell.dataset.ttt, 10));
        return;
      }
      var el = e.target.closest('[data-action]');
      if (el) { sfx('select'); handleAction(el.dataset.action, el); }
    });

    document.addEventListener('keydown', function(e) {
      // Simon: arrow keys = directional input when accepting
      if (state.currentScreen === 'game-simon' && simonState && simonState.isAccepting) {
        if (e.key === 'ArrowUp')    { simonInput('up'); e.preventDefault(); return; }
        if (e.key === 'ArrowDown')  { simonInput('down'); e.preventDefault(); return; }
        if (e.key === 'ArrowLeft')  { simonInput('left'); e.preventDefault(); return; }
        if (e.key === 'ArrowRight') { simonInput('right'); e.preventDefault(); return; }
      }
      switch (e.key) {
        case 'ArrowUp':    moveFocus('up'); e.preventDefault(); break;
        case 'ArrowDown':  moveFocus('down'); e.preventDefault(); break;
        case 'ArrowLeft':  moveFocus('left'); e.preventDefault(); break;
        case 'ArrowRight': moveFocus('right'); e.preventDefault(); break;
        case 'Enter':
          if (document.activeElement && document.activeElement.classList.contains('focusable')) {
            document.activeElement.click();
          }
          e.preventDefault();
          break;
        case 'Escape':
          navigateBack();
          e.preventDefault();
          break;
      }
    });
  }

  // ==================== MAIN LOOP ====================
  function loop() {
    var now = Date.now();
    animT = (animT + 1000/30) | 0;
    if (state.pet && !state.pet.dead) {
      tickPet(now);
      maybeTriggerEvent();
      if (state.currentScreen === 'main') refreshMainUI();
    }
    if (state.currentScreen === 'main') renderMain();
    if (state.currentScreen === 'egg-select') renderEggCanvas();
    if (state.currentScreen === 'welcome') renderWelcome();
    if (state.currentScreen === 'evolve') renderEvolve();
    if (state.currentScreen === 'death') renderDeath();
  }

  // ==================== RESPONSIVE FIT ====================
  // The app is authored at a fixed 600x600 logical size so all layout and HUD
  // math stays in that coordinate space. Here we scale the whole #app box by
  // the limiting viewport dimension — largest scale that fits without cropping —
  // and CSS flexbox centers it. On a 600x600 screen (the glasses) the scale is 1.
  var LOGICAL_W = 600, LOGICAL_H = 600;
  function fitToViewport() {
    if (!window.innerWidth || !window.innerHeight) return; // ignore transient 0-size resizes
    var s = Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H);
    var app = document.getElementById('app');
    if (app) app.style.transform = 'scale(' + s + ')';
  }

  // ==================== INIT ====================
  function init() {
    collectScreens();
    setupEvents();
    fitToViewport();
    window.addEventListener('resize', fitToViewport);
    window.addEventListener('orientationchange', fitToViewport);
    loadData();
    if (!state.deviceId) { state.deviceId = uid(); saveData(); }
    checkStreak();
    if (!state.nextEventAt) scheduleNextEvent(Date.now());

    setInterval(loop, 1000/30);
    setInterval(saveData, 10000);

    // route to correct screen on resume
    var startScreen;
    if (!state.pet) startScreen = 'welcome';
    else if (state.pet.dead) startScreen = 'death';
    else startScreen = 'main';
    navigateTo(startScreen, { addToHistory: false });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
