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


  // Egg metadata for selection screen
  var EGG_INFO = [
    { id: 'flame',   name: 'Flame Egg',   tagline: 'Warm-hearted. Fiery. Loyal to those it trusts.' },
    { id: 'star',    name: 'Star Egg',    tagline: 'Cosmic. Curious. Drawn to bright moments.' },
    { id: 'leaf',    name: 'Leaf Egg',    tagline: 'Gentle. Calm. Thrives with a steady hand.' },
    { id: 'crystal', name: 'Crystal Egg', tagline: 'Rare. Sharp-minded. Sparkles when happy.' },
  ];

  // Species name table by line + stage + branch ('great'|'good'|'poor')
  var NAMES = {
    flame:   { baby: 'Embril',   child: 'Sparkling', teen: 'Flarewing', adult: { great: 'Inferno King', good: 'Phoenix',  poor: 'Smolderpaw' } },
    star:    { baby: 'Twinkle',  child: 'Astrobit',  teen: 'Comet',     adult: { great: 'Galactus',     good: 'Nova Prince', poor: 'Voidwalker' } },
    leaf:    { baby: 'Sprout',   child: 'Bloomling', teen: 'Vinepaw',   adult: { great: 'Wildking',     good: 'Ancient Oak', poor: 'Bloomshade' } },
    crystal: { baby: 'Sparkle',  child: 'Crystura',  teen: 'Prismfox',  adult: { great: 'Diamond Lord', good: 'Geode Sage',  poor: 'Obsidiancore' } },
  };

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
    history: [],       // list of past pet summaries
    // ephemeral
    eggIdx: 0,
    nameDraft: '',
    nameCursor: 0,     // letter grid focus index
    miniGame: null,
    // anim
    bouncePhase: 0,
    pendingMood: null, // {icon, text, until}
  };

  function freshPet(eggId, name) {
    var now = Date.now();
    return {
      id: 'p_' + now.toString(36),
      eggId: eggId,
      name: name,
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
    } catch (e) { console.error('[load]', e); }
  }
  function saveData() {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify({
        deviceId: state.deviceId,
        pet: state.pet,
        history: state.history,
      }));
    } catch (e) { console.error('[save]', e); }
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
    pet.hunger = clamp(pet.hunger - CONFIG.decay.hunger * dtH * stageMul, 0, 100);
    pet.happy  = clamp(pet.happy  - CONFIG.decay.happy  * dtH * stageMul, 0, 100);
    pet.clean  = clamp(pet.clean  - CONFIG.decay.clean  * dtH * stageMul, 0, 100);
    if (pet.asleep) {
      pet.energy = clamp(pet.energy + CONFIG.decay.sleepRegen * dtH, 0, 100);
      if (pet.energy >= 99) pet.asleep = false;
    } else {
      pet.energy = clamp(pet.energy - CONFIG.decay.energy * dtH * stageMul, 0, 100);
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
    var avg = pet.careSamples > 0 ? pet.careSum / pet.careSamples : 70;
    var winsBoost = Math.min(20, pet.gameWins * 2);
    var neglectPen = Math.min(30, pet.neglectMin / 60); // hours of neglect
    var score = avg + winsBoost - neglectPen;
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
    return STAGE_SPRITES[pet.eggId][stageKey];
  }

  function onStageChanged(pet, from, to) {
    if (from === 'egg' && to === 'baby') {
      showEvolveScreen('Hatched!', pet);
    } else if (to !== 'senior' && to !== 'egg') {
      showEvolveScreen('Evolved!', pet);
    }
  }

  function die(pet, reason) {
    if (pet.dead) return;
    pet.dead = true;
    pet.deathReason = reason;
    pet.diedAt = Date.now();
    state.history.unshift({
      name: pet.name,
      eggId: pet.eggId,
      branch: pet.branch,
      bornAt: pet.bornAt,
      diedAt: pet.diedAt,
      finalStage: pet.stage,
      reason: reason,
      finalName: petDisplayName(pet),
    });
    if (state.history.length > 12) state.history.length = 12;
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

    // background
    drawStars(ctx, canvas.width, canvas.height, animT);
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
      drawSprite(ctx, sprite, bx, by + bounce, scale);

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
  }

  function computeMood(pet) {
    if (!pet) return null;
    if (pet.stage === 'egg') {
      var h = hoursSince(pet.bornAt);
      var pct = Math.min(100, Math.round((h / CONFIG.stageHours.egg) * 100));
      return { icon: '🥚', text: 'Hatching · ' + pct + '%' };
    }
    if (pet.asleep) return { icon: '💤', text: 'Sleeping' };
    if (pet.sick)   return { icon: '🤒', text: 'Feeling sick' };
    if (pet.poops.length >= 2) return { icon: '🧹', text: 'Needs cleaning!' };
    if (pet.hunger < 25) return { icon: '🍽', text: 'Very hungry' };
    if (pet.happy  < 25) return { icon: '😢', text: 'Wants to play' };
    if (pet.clean  < 25) return { icon: '🧼', text: 'Feeling messy' };
    if (pet.energy < 20) return { icon: '🥱', text: 'Sleepy' };
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
    if (id === 'main') refreshMainUI();
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
      showToast('Full belly!', 'success');
    } else if (kind === 'snack') {
      if (pet.hunger > 95) { showToast('Already stuffed.', 'warn'); return; }
      pet.hunger = clamp(pet.hunger + 15, 0, 100);
      pet.happy  = clamp(pet.happy + 10, 0, 100);
      pet.weight += 1;
      pet.feedings++;
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
      state.pet.happy = clamp(state.pet.happy + rounds * 8, 0, 100);
      state.pet.energy = clamp(state.pet.energy - rounds * 2, 0, 100);
      if (rounds >= 3) {
        state.pet.gameWins++;
        showToast('Great session! +' + (rounds * 8) + ' happiness', 'success');
      } else {
        showToast('+' + (rounds * 8) + ' happiness', 'success');
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
      state.pet.happy = clamp(state.pet.happy + rs.hits * 10, 0, 100);
      if (rs.hits >= 4) state.pet.gameWins++;
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
        var bonus = Math.max(4, 30 - guessState.tries * 3);
        state.pet.happy = clamp(state.pet.happy + bonus, 0, 100);
        if (guessState.tries <= 7) state.pet.gameWins++;
        saveData();
        showToast('+' + bonus + ' happiness', 'success');
      }
      guessState = null;
    } else if (guessState.guess < guessState.target) {
      document.getElementById('guess-hint').textContent = 'Too low — go higher.';
    } else {
      document.getElementById('guess-hint').textContent = 'Too high — go lower.';
    }
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
    }
  }

  // ==================== SETTINGS ====================
  function refreshSettingsUI() {
    document.getElementById('device-id-label').textContent = state.deviceId || '—';
    var historyEl = document.getElementById('history-label');
    if (!state.history.length) {
      historyEl.textContent = 'No pets yet';
    } else {
      historyEl.innerHTML = state.history.slice(0, 5).map(function(h) {
        return h.name + ' · ' + h.finalName + ' · ' + h.finalStage;
      }).join('<br>');
    }
  }

  function resetEverything() {
    state.pet = null;
    state.history = [];
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
        break;

      case 'act-feed': navigateTo('feed'); break;
      case 'act-play': navigateTo('play'); break;
      case 'act-clean': clean(); break;
      case 'act-sleep': sleep(); break;
      case 'act-medicine': medicine(); break;
      case 'act-stats': navigateTo('stats'); break;

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
      var el = e.target.closest('[data-action]');
      if (el) handleAction(el.dataset.action, el);
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
      if (state.currentScreen === 'main') refreshMainUI();
    }
    if (state.currentScreen === 'main') renderMain();
    if (state.currentScreen === 'egg-select') renderEggCanvas();
    if (state.currentScreen === 'welcome') renderWelcome();
    if (state.currentScreen === 'evolve') renderEvolve();
    if (state.currentScreen === 'death') renderDeath();
  }

  // ==================== INIT ====================
  function init() {
    collectScreens();
    setupEvents();
    loadData();
    if (!state.deviceId) { state.deviceId = uid(); saveData(); }

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
