/* ==========================================================================
   San Francisco: Hottest & Coldest — scroll-driven scene + glass card
   Plain JavaScript, no dependencies.

   Desktop (mouse/trackpad): the fog clip is scrubbed frame by frame from the
   scroll position. Phones/tablets (touch): the fog clip is simply played
   forward (or a reversed copy played for the way back), because seeking a
   video while the page moves is unreliable on iOS. Either way a single swipe
   or wheel tick "rides" the page to the other end.
   ========================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     TUNABLE THRESHOLDS
     Scroll progress through the stage runs 0 → 1.
       0 … WARM_END          : warm-loop.mp4 plays (sunny)
       WARM_END … COLD_START : transition.mp4 (fog rolls in)
       COLD_START … 1        : cold-loop.mp4 plays (foggy)
     ------------------------------------------------------------------------ */
  const WARM_END   = 0.15;
  const COLD_START = 0.85;

  /* Card: HOTTEST count below METRIC_SWAP, COLDEST above it. Visible while
     progress < CARD_HIDE_AT and again once progress >= CARD_SHOW_AT. */
  const METRIC_SWAP  = 0.5;
  const CARD_HIDE_AT = 0.04;
  const CARD_SHOW_AT = 0.9;

  /* The ride: how long a full top↔bottom auto-scroll takes (desktop scrub mode).
     In phone play mode the fog clip is played instead, following the same speed
     profile (RIDE_FAST, ramping down to normal speed at the end). */
  const AUTO_SCROLL_MS = 2250;         // used only as a last-resort fallback
  /* The fog clip runs at RIDE_FAST× speed, then from RIDE_RAMP_FROM of the way through it
     ramps down steadily to normal speed by its last frame, so each ride settles into the
     loop at the clip's natural pace (both directions). Desktop scrubbing follows the same
     speed profile. */
  const RIDE_FAST = 4;
  const RIDE_RAMP_FROM = 0.45;
  const RIDE_END_RATE = 1;
  const CLIP_SECONDS = 8;
  function rideRate(u) {               // playback rate at clip progress u (0…1)
    if (u <= RIDE_RAMP_FROM) return RIDE_FAST;
    return RIDE_FAST - (RIDE_FAST - RIDE_END_RATE) * (u - RIDE_RAMP_FROM) / (1 - RIDE_RAMP_FROM);
  }
  /* Time → clip progress table for the scrubbed (desktop) ride. */
  const RIDE_TABLE = (() => {
    const steps = 480, times = new Float32Array(steps + 1);
    let t = 0;
    for (let i = 1; i <= steps; i++) {
      const u = (i - 0.5) / steps;
      t += (CLIP_SECONDS / steps) / rideRate(u);
      times[i] = t;
    }
    return { times, total: t, steps };
  })();
  function rideProgressAt(elapsedSec) {
    const { times, total, steps } = RIDE_TABLE;
    if (elapsedSec >= total) return 1;
    let lo = 0, hi = steps;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < elapsedSec) lo = mid + 1; else hi = mid; }
    const i = Math.max(1, lo);
    const f = (elapsedSec - times[i - 1]) / (times[i] - times[i - 1] || 1);
    return clamp((i - 1 + f) / steps, 0, 1);
  }
  const RIDE_DOWN_FROM_BELOW = 0.25;   // a downward ride may start anywhere above this
  const RIDE_UP_FROM_ABOVE   = 0.75;   // an upward ride may start anywhere below this
  const LEAD_MS = 450;                 // phone mode: quick scroll into / out of the fog band

  /* Colour Safari paints its top/bottom bars with: the sky at the top of whatever is showing. */
  const THEME_COLORS = { intro: '#e9edf1', warm: '#6b93ff', cold: '#a6b7cb' };
  const themeMeta = document.getElementById('themeColor');
  function updateThemeColor() {
    if (!themeMeta) return;
    const key = introActive ? 'intro' : (progress < METRIC_SWAP ? 'warm' : 'cold');
    const c = THEME_COLORS[key];
    if (themeMeta.getAttribute('content') !== c) themeMeta.setAttribute('content', c);
  }

  /* Every clip handoff is a crossfade this long (matches .clip's opacity transition in styles.css). */
  const HANDOFF_FADE_MS = 1000;

  /* Reduced motion: scrub in coarser steps, no rides. */
  const REDUCED_MOTION_STEPS = 12;

  /* Count-up on load, in milliseconds. */
  const COUNT_UP_MS = 1800;

  /* Fallback if data.json can't be fetched, so the card always renders. */
  const DEFAULT_DATA = { hot: 3, cold: 1, totalDays: 138, year: 2026 };

  /* Scroll progress is measured from the SUNNY end: 0 = sunny (bottom of the page),
     1 = foggy (top of the page, where the visitor lands). See readProgress(). */

  /* Portrait touch screens up to this wide get the tall, lighter clips in assets/mobile/. */
  const MOBILE_MAX_WIDTH = 820;

  /* ------------------------------------------------------------------------ */

  const EASE_OUT = (t) => 1 - Math.pow(1 - t, 3);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const stage       = document.getElementById('stage');
  const clipWarm    = document.getElementById('clipWarm');
  const clipTrans   = document.getElementById('clipTransition');
  const clipTransRev= document.getElementById('clipTransitionRev');
  const clipCold    = document.getElementById('clipCold');
  const posterWarm  = document.getElementById('posterWarm');
  const posterCold  = document.getElementById('posterCold');
  const scrollCue   = document.getElementById('scrollCue');
  const scrollCueUp = document.getElementById('scrollCueUp');
  const glass       = document.getElementById('glass');
  const metricHot   = document.getElementById('metricHot');
  const metricCold  = document.getElementById('metricCold');
  const hotValue    = document.getElementById('hotValue');
  const coldValue   = document.getElementById('coldValue');
  const hotBar      = document.getElementById('hotBar');
  const coldBar     = document.getElementById('coldBar');
  const intro       = document.getElementById('intro');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const touchOnly     = window.matchMedia('(hover: none)').matches || navigator.maxTouchPoints > 0;

  /* Phones and tablets play the fog clip instead of scrubbing it.
     (Append ?play=1 to the address to force this on a desktop for testing.) */
  const playbackMode = (coarsePointer && navigator.maxTouchPoints > 0) || /[?&]play=1/.test(location.search);
  /* Portrait phones get the tall, lighter encodes. */
  const useMobileAssets = coarsePointer && window.innerWidth < window.innerHeight && window.innerWidth <= MOBILE_MAX_WIDTH;
  const ASSET_DIR = useMobileAssets ? 'assets/mobile/' : 'assets/';

  const PHASE = { WARM: 'warm', TRANSITION: 'transition', COLD: 'cold' };
  const dead = { warm: false, transition: false, transitionRev: false, cold: false };

  let activeTrans = clipTrans;   // which fog clip is in use (forward or reversed copy)
  let phase = null;
  let progress = 0;
  let rafPending = false;
  let unlocked = false;

  function clipFor(p) {
    return p === PHASE.WARM ? clipWarm : p === PHASE.COLD ? clipCold : activeTrans;
  }
  function keyOf(clip) {
    return clip === clipWarm ? 'warm' : clip === clipCold ? 'cold' : clip === clipTransRev ? 'transitionRev' : 'transition';
  }

  /* ------------------------------------------------------------------------
     Sources (chosen per device so phones never download the 45 MB desktop clips)
     ------------------------------------------------------------------------ */

  posterWarm.src = ASSET_DIR + 'warm-poster.jpg';
  posterCold.src = ASSET_DIR + 'cold-poster.jpg';
  clipWarm.poster  = ASSET_DIR + 'warm-poster.jpg';
  clipTrans.poster = ASSET_DIR + 'warm-poster.jpg';
  clipCold.poster  = ASSET_DIR + 'cold-poster.jpg';
  clipWarm.src  = ASSET_DIR + 'warm-loop.mp4';       // true loop: Veo was given the same still as first and last frame
  clipTrans.src = ASSET_DIR + 'transition.mp4';
  clipCold.src  = ASSET_DIR + 'cold-loop.mp4';       // true loop, starting on the fog clip's final frame
  if (playbackMode) {
    clipTransRev.poster = ASSET_DIR + 'cold-poster.jpg';
    clipTransRev.preload = 'auto';
    clipTransRev.src = ASSET_DIR + 'transition-reverse.mp4';
  }

  /* ------------------------------------------------------------------------
     Intro fog: covers the sunny scene until the first scroll, tap or key.
     ------------------------------------------------------------------------ */

  const INTRO_LIFT_MS = 1800;          // how long the clearing takes before the overlay is removed
  const INTRO_SETTLE_MS = 1050;        // no ride may start this soon after the fog begins to lift
  let introActive = !!intro;
  let introClearedAt = -Infinity;
  const introSettling = () => performance.now() - introClearedAt < INTRO_SETTLE_MS;
  if (introActive) document.documentElement.classList.add('intro-active');

  /* Live fog on a small canvas. A few octaves of smooth, tiling value noise give the
     cloud structure; each frame the canvas is redrawn at low resolution (cheap enough
     for phones) and stretched to the screen. While the intro is up the fog drifts
     slowly. When it lifts, a density cutoff rises over a few seconds: the thinnest
     wisps burn off first, holes open up, and the last thick patches shrink and vanish.
     No image download, no library. */

  const FOG_EVAPORATE_MS = 1600;
  const fogCanvas = document.getElementById('introFog');

  function makeNoiseField(size, seed) {
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const octaves = [];
    for (let o = 0, cells = 2; o < 5; o++, cells *= 2) {
      const g = new Float32Array(cells * cells);
      for (let i = 0; i < g.length; i++) g[i] = rnd();
      octaves.push({ cells, g });
    }
    const smooth = (t) => t * t * (3 - 2 * t);
    const field = new Float32Array(size * size);
    let lo = 1, hi = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let v = 0, amp = 0.55, norm = 0;
        for (const { cells, g } of octaves) {
          const fx = (x / size) * cells, fy = (y / size) * cells;
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          const tx = smooth(fx - x0), ty = smooth(fy - y0);
          const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
          const a = g[y0 * cells + x0], b = g[y0 * cells + x1], c = g[y1 * cells + x0], d = g[y1 * cells + x1];
          v += amp * ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty);
          norm += amp; amp *= 0.5;
        }
        v /= norm;
        field[y * size + x] = v;
        if (v < lo) lo = v; if (v > hi) hi = v;
      }
    }
    for (let i = 0; i < field.length; i++) field[i] = (field[i] - lo) / (hi - lo);   // stretch to 0…1
    return { size, field };
  }

  function startFog() {
    if (!fogCanvas || !intro) return;
    let ctx;
    try { ctx = fogCanvas.getContext('2d'); } catch (e) { return; }
    if (!ctx) return;

    const N = 128;
    const A = makeNoiseField(N, 1234);
    const B = makeNoiseField(N, 9876);
    const sample = (f, x, y) => {                 // bilinear, tiling
      const xi = Math.floor(x), yi = Math.floor(y);
      const tx = x - xi, ty = y - yi;
      const x0 = ((xi % N) + N) % N, y0 = ((yi % N) + N) % N;
      const x1 = (x0 + 1) % N, y1 = (y0 + 1) % N;
      const r0 = f.field[y0 * N + x0] * (1 - tx) + f.field[y0 * N + x1] * tx;
      const r1 = f.field[y1 * N + x0] * (1 - tx) + f.field[y1 * N + x1] * tx;
      return r0 * (1 - ty) + r1 * ty;
    };

    let w = 0, h = 0, img = null;
    const resize = () => {
      /* Enough pixels for cloud detail, few enough for phones: about 60k per frame. */
      let scale = 2;
      while ((window.innerWidth / scale) * (window.innerHeight / scale) > 60000) scale += 1;
      w = Math.max(60, Math.round(window.innerWidth / scale));
      h = Math.max(60, Math.round(window.innerHeight / scale));
      fogCanvas.width = w; fogCanvas.height = h;
      img = ctx.createImageData(w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    const t0 = performance.now();
    let liftAt = 0;
    let raf = 0;
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

    const frame = (now) => {
      const t = (now - t0) / 1000;
      let lift = 0;
      if (liftAt) lift = ease(clamp((now - liftAt) / FOG_EVAPORATE_MS, 0, 1));

      /* Density cutoff rises as the fog lifts: thin haze goes first, thick puffs last.
         A haze floor keeps everything veiled until the fog is well on its way out. */
      const cut = 0.03 + lift * 1.1;
      const soft = 0.36 + lift * 0.2;
      const haze = 0.62 * Math.pow(1 - lift, 1.6);
      const rise = lift * lift * 40;                 // wisps drift upward as they go
      const k = N / Math.max(w, h);                  // noise cells per canvas pixel
      const data = img.data;
      const ss = (e0, e1, v) => { const q = (v - e0) / (e1 - e0); return q <= 0 ? 0 : q >= 1 ? 1 : q * q * (3 - 2 * q); };
      let i = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const nx = x * k * 0.8, ny = (y + rise) * k * 1.2;
          const ax = nx + t * 2.0, ay = ny + t * 0.5;
          const d1 = sample(A, ax, ay);
          const d2 = sample(B, nx * 2.3 - t * 1.3, ny * 2.3 + t * 0.8);
          /* A second, wispier layer: long horizontal streaks of mist sliding past slowly. */
          const wisp = sample(B, nx * 0.45 + t * 0.9, ny * 2.8 - t * 0.25);
          const d = d1 * 0.6 + d2 * 0.22 + wisp * 0.18;
          /* Cloud shading: compare with the density a little higher up. Where the cloud
             above is denser, this pixel is on an underside and sits in shadow. */
          const dUp = sample(A, ax, ay - 1.6) * 0.7 + d2 * 0.3;
          const shade = ss(0, 0.22, dUp - d);
          let L = 0.86 + 0.14 * ss(0.3, 0.8, d) - 0.13 * shade;
          const a = haze + (1 - haze) * ss(cut, cut + soft, d);
          data[i++] = Math.round(L * 246);
          data[i++] = Math.round(L * 249);
          data[i++] = Math.round(L * 255);
          data[i++] = Math.round(a * 255 * (1 - lift * 0.08));
        }
      }
      ctx.putImageData(img, 0, 0);
      if (!(liftAt && lift >= 1) && !intro.hidden) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return {
      lift() { if (!liftAt) liftAt = performance.now(); },
      stop() { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); },
    };
  }

  const fog = (intro && !reducedMotion) ? startFog() : null;
  if (intro && reducedMotion && fogCanvas) fogCanvas.style.background = 'rgba(236, 240, 244, 0.9)';

  function clearIntro() {
    if (!introActive) return;
    introActive = false;
    introClearedAt = performance.now();
    document.documentElement.classList.remove('intro-active');
    intro.classList.add('is-clearing');
    if (fog) fog.lift();
    setTimeout(() => { intro.hidden = true; if (fog) fog.stop(); }, reducedMotion ? 50 : INTRO_LIFT_MS);
    requestTick();                      // the card and the scroll cue come in
  }

  if (intro) {
    intro.addEventListener('pointerdown', clearIntro);
    intro.addEventListener('click', clearIntro);
  }

  /* ------------------------------------------------------------------------
     Scroll → progress
     ------------------------------------------------------------------------ */

  function maxScroll() { return Math.max(0, stage.offsetHeight - window.innerHeight); }

  /* Raw page position: 0 at the top, 1 at the bottom. */
  function rawProgress() {
    const max = maxScroll();
    if (max <= 0) return 0;
    return clamp((window.scrollY || window.pageYOffset || 0) / max, 0, 1);
  }

  /* Scene progress runs the other way: the page LANDS on the foggy beach (progress 1)
     and scrolling down lifts the fog towards the sunny beach (progress 0). */
  function readProgress() { return 1 - rawProgress(); }
  const scrollYFor = (p) => (1 - p) * maxScroll();

  function requestTick() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(tick);
  }

  function tick() {
    rafPending = false;
    progress = readProgress();

    let next;
    if (progress < WARM_END)        next = PHASE.WARM;
    else if (progress < COLD_START) next = PHASE.TRANSITION;
    else                            next = PHASE.COLD;

    if (next !== phase) setPhase(next);
    if (phase === PHASE.TRANSITION) scrub();
    updatePosters();
    updateMetric();
    updateCard();
    updateCues();
    updateThemeColor();
  }

  function updateCues() {
    const busy = autoScrolling || introActive;
    const raw = rawProgress();
    scrollCue.classList.toggle('is-hidden', busy || raw > 0.02);
    scrollCueUp.classList.toggle('is-hidden', busy || raw < 0.98);
  }

  /* ------------------------------------------------------------------------
     Phase handoffs — single-frame swaps, no crossfade.
     Stacking order in the DOM is warm < fog clips < cold, so the incoming clip
     can become visible before the outgoing one hides.
     ------------------------------------------------------------------------ */

  const STACK = { warm: 0, transition: 1, cold: 2 };   // DOM / z stacking order of the clips

  function setPhase(next) {
    const prev = phase;
    phase = next;

    const incoming = clipFor(next);
    const outgoing = prev ? clipFor(prev) : null;
    const incomingOnTop = !prev || STACK[next] > STACK[prev];

    if (!prev) {
      [clipWarm, clipTrans, clipTransRev, clipCold].forEach((c) => {
        if (c === incoming) return;
        c.classList.add('no-fade');
        c.classList.remove('is-visible');
        try { c.pause(); } catch (e) { /* ignore */ }
        requestAnimationFrame(() => c.classList.remove('no-fade'));
      });
    }

    /* Crossfade. If the incoming clip sits above the outgoing one it fades in over it;
       if it sits below, it appears at once and the outgoing clip fades out to reveal it.
       Either way the outgoing clip keeps playing until the fade is done. */
    const handoff = () => {
      const seq = ++handoffSeq;
      if (incomingOnTop) {
        incoming.classList.add('is-visible');
        setTimeout(() => { if (handoffSeq === seq && phase === next) hideAndPause(outgoing); }, HANDOFF_FADE_MS);
      } else {
        incoming.classList.add('no-fade');
        incoming.classList.add('is-visible');
        void incoming.offsetWidth;                                   // apply instantly
        requestAnimationFrame(() => incoming.classList.remove('no-fade'));
        if (outgoing) outgoing.classList.remove('is-visible');        // fades out
        setTimeout(() => { if (handoffSeq === seq && phase === next) pauseClip(outgoing); }, HANDOFF_FADE_MS);
      }
    };

    if (next === PHASE.TRANSITION) {
      scrub(true);
      handoff();
      return;
    }

    /* A loop is coming in: rewind to frame 0 so it lines up with the fog clip's end frames. */
    const loop = incoming;
    const begin = () => { handoff(); safePlay(loop); };

    if (loop.readyState >= 2 && Math.abs(loop.currentTime) > 0.01) {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        loop.removeEventListener('seeked', finish);
        begin();
      };
      loop.addEventListener('seeked', finish, { once: true });
      setTimeout(finish, 150);
      try { loop.currentTime = 0; } catch (e) { finish(); }
    } else {
      begin();
    }
  }

  let handoffSeq = 0;

  function pauseClip(clip) {
    if (!clip) return;
    try { clip.pause(); } catch (e) { /* ignore */ }
  }

  function hideAndPause(clip) {
    if (!clip) return;
    clip.classList.remove('is-visible');
    try { clip.pause(); } catch (e) { /* ignore */ }
  }

  function safePlay(clip) {
    if (dead[keyOf(clip)]) return;
    const p = clip.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay blocked until first touch */ });
  }

  /* ------------------------------------------------------------------------
     Scrubbing (desktop): transition.mp4's currentTime follows the scroll.
     - never seeks inside the scroll handler; only here, inside rAF
     - at most one seek per frame, never while a previous seek is pending
     - only once readyState >= 2
     In phone play mode this is skipped while a ride is playing the clip.
     ------------------------------------------------------------------------ */

  let scrubPending = false;

  function scrub(force) {
    if (ridePlaying) return;                  // phone mode: the clip is playing itself
    const v = activeTrans;
    if (dead[keyOf(v)]) return;
    if (!(v.readyState >= 2) || !isFinite(v.duration) || v.duration <= 0) { scrubPending = true; return; }

    let t = clamp((progress - WARM_END) / (COLD_START - WARM_END), 0, 1);
    if (reducedMotion) t = Math.round(t * REDUCED_MOTION_STEPS) / REDUCED_MOTION_STEPS;
    if (v === clipTransRev) t = 1 - t;        // the reversed copy runs the other way

    const target = Math.min(t * v.duration, v.duration - 0.02);

    if (v.seeking && !force) { scrubPending = true; return; }
    const HALF_FRAME = 1 / 48;
    if (Math.abs(v.currentTime - target) < HALF_FRAME && !force) { scrubPending = false; return; }

    scrubPending = false;
    try {
      if (!v.paused) v.pause();
      v.currentTime = target;
    } catch (e) { scrubPending = true; }
  }

  [clipTrans, clipTransRev].forEach((v) => {
    v.addEventListener('seeked', () => { if (scrubPending) requestTick(); });
    ['loadeddata', 'canplay', 'loadedmetadata'].forEach((ev) =>
      v.addEventListener(ev, () => { scrubPending = true; requestTick(); }));
  });

  /* The fog clip must never play on its own (outside rides / the unlock). */
  let unlockSettled = false;
  [clipTrans, clipTransRev].forEach((v) =>
    v.addEventListener('play', () => { if (unlockSettled && !ridePlaying) v.pause(); }));

  /* ------------------------------------------------------------------------
     Mobile Safari unlock: play() + pause() each clip, muted, on the first
     interaction, so programmatic seeks and plays are allowed afterwards.
     ------------------------------------------------------------------------ */

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    ['touchstart', 'pointerdown', 'keydown', 'wheel'].forEach((ev) => window.removeEventListener(ev, unlock));

    const clips = [clipWarm, clipTrans, clipCold];
    if (playbackMode) clips.push(clipTransRev);
    let pending = clips.length;
    clips.forEach((v) => {
      if (dead[keyOf(v)]) { if (--pending === 0) unlockSettled = true; return; }
      v.muted = true;
      if (v.readyState === 0) { try { v.load(); } catch (e) { /* ignore */ } }
      const p = v.play();
      const settle = () => {
        const isActiveLoop = (v === clipWarm && phase === PHASE.WARM) || (v === clipCold && phase === PHASE.COLD);
        if (!isActiveLoop && !ridePlaying) v.pause();
        if (--pending === 0) unlockSettled = true;
      };
      if (p && typeof p.then === 'function') p.then(settle).catch(settle); else settle();
    });
    scrubPending = true;
    requestTick();
  }
  ['touchstart', 'pointerdown', 'keydown', 'wheel'].forEach((ev) =>
    window.addEventListener(ev, unlock, { passive: true }));

  /* ------------------------------------------------------------------------
     Failure fallback: a clip that errors out is hidden and its poster shows.
     ------------------------------------------------------------------------ */

  function markDead(clip) {
    const k = keyOf(clip);
    if (dead[k]) return;
    dead[k] = true;
    clip.classList.add('is-dead');
    clip.classList.remove('is-visible');
    updatePosters();
  }

  [clipWarm, clipTrans, clipTransRev, clipCold].forEach((v) => {
    v.addEventListener('error', () => { if (v.src) markDead(v); });
    v.addEventListener('stalled', () => { if (v.networkState === 3 && v.src) markDead(v); });
    if (!v.canPlayType('video/mp4')) markDead(v);
  });

  function updatePosters() {
    let showWarm = false, showCold = false;
    if (phase === PHASE.WARM && dead.warm) showWarm = true;
    if (phase === PHASE.COLD && dead.cold) showCold = true;
    if (phase === PHASE.TRANSITION && dead[keyOf(activeTrans)]) {
      const t = (progress - WARM_END) / (COLD_START - WARM_END);
      if (t < 0.5) showWarm = true; else showCold = true;
    }
    posterWarm.classList.toggle('is-visible', showWarm);
    posterCold.classList.toggle('is-visible', showCold);
  }

  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', requestTick);
  window.addEventListener('orientationchange', requestTick);

  /* ------------------------------------------------------------------------
     Card: HOTTEST over the sun, COLDEST once the fog is in; hidden in between.
     ------------------------------------------------------------------------ */

  let activeMetric = 'hot';
  let dataLoaded = false;
  let cardVisible = true;

  function updateMetric(force) {
    const want = progress >= METRIC_SWAP ? 'cold' : 'hot';
    if (want === activeMetric && !force) return;
    activeMetric = want;
    metricHot.classList.toggle('is-active', want === 'hot');
    metricCold.classList.toggle('is-active', want === 'cold');
  }

  function updateCard() {
    const want = !introActive && (progress < CARD_HIDE_AT || progress >= CARD_SHOW_AT);
    if (want === cardVisible) return;
    cardVisible = want;
    glass.classList.toggle('is-hidden', !want);
    if (!want) closeInfo(false);
    /* The numbers are already in place when the card fades back in; only the very
       first appearance (renderPanel) counts up, so the reveal stays smooth. */
  }

  function animateActiveMetric(duration) {
    const el  = activeMetric === 'hot' ? hotValue : coldValue;
    const bar = activeMetric === 'hot' ? hotBar : coldBar;
    countUp(el, Number(el.dataset.target || 0), duration);
    bar.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = bar.dataset.width || '0%'; }));
  }

  function renderPanel(data) {
    const year  = Number.isFinite(+data.year)      ? +data.year      : DEFAULT_DATA.year;
    const hot   = Number.isFinite(+data.hot)       ? +data.hot       : DEFAULT_DATA.hot;
    const cold  = Number.isFinite(+data.cold)      ? +data.cold      : DEFAULT_DATA.cold;
    const total = Number.isFinite(+data.totalDays) ? +data.totalDays : DEFAULT_DATA.totalDays;

    document.getElementById('year').textContent = String(year);
    const iy = document.getElementById('introYear'); if (iy) iy.textContent = String(year);
    document.getElementById('totalDays').textContent = total.toLocaleString();

    hotValue.dataset.target = String(hot);
    coldValue.dataset.target = String(cold);
    const pct = (n) => (total > 0 ? clamp((n / total) * 100, 0, 100) : 0).toFixed(1) + '%';
    hotBar.dataset.width = pct(hot);
    coldBar.dataset.width = pct(cold);
    dataLoaded = true;

    countUp(hotValue, hot, 0);
    countUp(coldValue, cold, 0);
    hotBar.style.width = hotBar.dataset.width;
    coldBar.style.width = coldBar.dataset.width;
    if (cardVisible) animateActiveMetric(COUNT_UP_MS);
  }

  const countUpTimers = new WeakMap();

  function countUp(el, target, duration) {
    el.dataset.target = String(target);
    if (countUpTimers.has(el)) cancelAnimationFrame(countUpTimers.get(el));
    if (reducedMotion || target === 0 || !duration) { el.textContent = String(target); return; }
    const start = performance.now();
    const frame = (now) => {
      const t = clamp((now - start) / duration, 0, 1);
      el.textContent = String(Math.round(EASE_OUT(t) * target));
      if (t < 1) countUpTimers.set(el, requestAnimationFrame(frame));
    };
    countUpTimers.set(el, requestAnimationFrame(frame));
  }

  function loadData() {
    const url = 'data.json?t=' + Math.floor(Date.now() / 3600000);
    fetch(url, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => renderPanel(Object.assign({}, DEFAULT_DATA, d)))
      .catch(() => renderPanel(DEFAULT_DATA));
  }

  /* ------------------------------------------------------------------------
     "How this is counted" popover
     ------------------------------------------------------------------------ */

  const infoBtn   = document.getElementById('infoBtn');
  const infoPop   = document.getElementById('infoPop');
  const infoClose = document.getElementById('infoClose');
  let infoOpen = false;

  function placePop() {
    const r = glass.getBoundingClientRect();
    const s = glass.offsetParent ? glass.offsetParent.getBoundingClientRect() : { top: 0 };
    infoPop.style.top = Math.round(r.bottom - s.top + 8) + 'px';
  }

  function openInfo() {
    if (infoOpen) return;
    infoOpen = true;
    placePop();
    infoPop.hidden = false;
    infoPop.classList.add('is-opening');
    infoPop.classList.remove('is-closing');
    requestAnimationFrame(() => requestAnimationFrame(() => infoPop.classList.remove('is-opening')));
    infoBtn.setAttribute('aria-expanded', 'true');
    infoClose.focus({ preventScroll: true });
  }

  function closeInfo(returnFocus) {
    if (!infoOpen) return;
    infoOpen = false;
    infoBtn.setAttribute('aria-expanded', 'false');
    infoPop.classList.add('is-closing');
    const hide = () => { if (!infoOpen) { infoPop.hidden = true; infoPop.classList.remove('is-closing'); } };
    if (reducedMotion) hide(); else setTimeout(hide, 420);
    if (returnFocus) infoBtn.focus({ preventScroll: true });
  }

  infoBtn.addEventListener('click', (e) => { e.stopPropagation(); infoOpen ? closeInfo(true) : openInfo(); });
  infoClose.addEventListener('click', () => closeInfo(true));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && infoOpen) closeInfo(true); });
  document.addEventListener('pointerdown', (e) => {
    if (infoOpen && !infoPop.contains(e.target) && !infoBtn.contains(e.target)) closeInfo(false);
  });
  window.addEventListener('resize', () => { if (infoOpen) placePop(); });

  if (!touchOnly) {
    glass.addEventListener('mousemove', (e) => {
      const r = glass.getBoundingClientRect();
      glass.style.setProperty('--spec-x', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      glass.style.setProperty('--spec-y', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
    glass.addEventListener('mouseenter', () => glass.style.setProperty('--spec-opacity', '1'));
    glass.addEventListener('mouseleave', () => glass.style.setProperty('--spec-opacity', '0'));
  }

  /* ------------------------------------------------------------------------
     The ride. Down from the top quarter → bottom (fog lifts, sun). Up from the
     bottom quarter → top (fog returns). Works every time, so it can be replayed.
     At the bottom the "scroll up" cue is the nudge back to the sunny side.
     Desktop: an animated scroll, the clip scrubbed along the way; scrolling
     against it cancels. Phone: the clip plays and the scroll follows it.
     ------------------------------------------------------------------------ */

  let autoScrolling = false;
  let autoDir = 0;
  let ridePlaying = false;        // phone mode: a fog clip is playing for the ride
  let rideRaf = 0;
  let rideStop = null;            // cleanup for the current ride's listeners/timeouts

  /* Ride curve (desktop): short ease-in, long steady middle, gentle ease-out. */
  const RIDE_IN = 0.06, RIDE_OUT_FROM = 0.72;
  const RIDE_V = 2 / (1 + RIDE_OUT_FROM - RIDE_IN);
  function rideCurve(t) {
    if (t < RIDE_IN) return RIDE_V * t * t / (2 * RIDE_IN);
    if (t < RIDE_OUT_FROM) return RIDE_V * RIDE_IN / 2 + RIDE_V * (t - RIDE_IN);
    const u = (t - RIDE_OUT_FROM) / (1 - RIDE_OUT_FROM);
    return RIDE_V * RIDE_IN / 2 + RIDE_V * (RIDE_OUT_FROM - RIDE_IN) + RIDE_V * (1 - RIDE_OUT_FROM) * (u - u * u / 2);
  }

  /* Animate the scroll position from one value to another; resolves when done. */
  function animateScroll(from, to, ms, curve) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const frame = (now) => {
        if (!autoScrolling) return resolve(false);
        const t = clamp((now - t0) / ms, 0, 1);
        window.scrollTo(0, from + (to - from) * Math.min(1, curve(t)));
        requestTick();
        if (t < 1) rideRaf = requestAnimationFrame(frame); else resolve(true);
      };
      rideRaf = requestAnimationFrame(frame);
    });
  }

  /* dir is the PAGE direction: +1 scrolling down (fog lifts → sun), -1 scrolling up (fog returns). */
  function startRide(dir) {
    if (autoScrolling || reducedMotion || introActive || introSettling()) return false;
    const raw = rawProgress();
    if (dir > 0 && raw > RIDE_DOWN_FROM_BELOW) return false;
    if (dir < 0 && raw < RIDE_UP_FROM_ABOVE) return false;
    const max = maxScroll();
    const from = window.scrollY || 0;
    const to = dir > 0 ? max : 0;
    if (Math.abs(to - from) < 2) return false;

    autoScrolling = true;
    autoDir = dir;
    updateCues();

    /* Scrolling down lifts the fog: that is the fog clip played backwards. */
    const clip = dir > 0 ? clipTransRev : clipTrans;
    const canPlay = playbackMode && !dead[keyOf(clip)] && clip.src;
    const run = canPlay ? ridePlayback(dir, from, to, max, clip) : rideScrub(dir, from, to);
    run.then((completed) => {
      if (completed) window.scrollTo(0, dir > 0 ? maxScroll() : 0);
      finishRide();
    });
    return true;
  }

  /* Desktop mode: lead-in scroll, scrub the fog band along the speed profile, lead-out scroll. */
  async function rideScrub(dir, from, to) {
    const band = COLD_START - WARM_END;
    const fogIn = dir < 0;
    const edgeIn  = scrollYFor(fogIn ? WARM_END : COLD_START);
    const edgeOut = scrollYFor(fogIn ? COLD_START : WARM_END);
    if (!(await animateScroll(from, edgeIn, LEAD_MS, EASE_OUT))) return false;
    const ok = await new Promise((resolve) => {
      const t0 = performance.now();
      const frame = (now) => {
        if (!autoScrolling) return resolve(false);
        const u = rideProgressAt((now - t0) / 1000);
        const prog = fogIn ? WARM_END + u * band : COLD_START - u * band;
        window.scrollTo(0, scrollYFor(prog));
        requestTick();
        if (u < 1) rideRaf = requestAnimationFrame(frame); else resolve(true);
      };
      rideRaf = requestAnimationFrame(frame);
    });
    if (!ok) return false;
    return animateScroll(edgeOut, to, LEAD_MS, EASE_OUT);
  }

  /* Phone mode: lead-in scroll, play the clip while the scroll follows it, lead-out scroll. */
  async function ridePlayback(dir, from, to, max, clip) {
    const band = COLD_START - WARM_END;
    const fogIn = dir < 0;                       // page up = fog rolling in (forward clip)
    const edgeIn  = scrollYFor(fogIn ? WARM_END : COLD_START);
    const edgeOut = scrollYFor(fogIn ? COLD_START : WARM_END);

    activeTrans = clip;
    if (!(await animateScroll(from, edgeIn, LEAD_MS, EASE_OUT))) return false;

    /* Play the clip from its start; map its time onto the scroll band. */
    let playFailed = false;
    const ok = await new Promise((resolve) => {
      let finished = false;
      const done = (v) => { if (finished) return; finished = true; cleanup(); resolve(v); };
      const onEnded = () => done(true);
      const cleanup = () => {
        clip.removeEventListener('ended', onEnded);
        clearTimeout(stallTimer);
        ridePlaying = false;
        rideStop = null;
      };
      let stallTimer = setTimeout(() => done(true), 20000);      // never hang
      rideStop = () => done(false);

      ridePlaying = true;
      clip.classList.add('is-visible');
      clip.addEventListener('ended', onEnded);
      try { clip.currentTime = 0; clip.playbackRate = RIDE_FAST; } catch (e) { /* ignore */ }
      const p = clip.play();
      if (p && typeof p.catch === 'function') p.catch(() => { playFailed = true; done(false); });

      const follow = () => {
        if (finished) return;
        if (!autoScrolling) return done(false);
        const d = clip.duration;
        if (isFinite(d) && d > 0) {
          const t = clamp(clip.currentTime / d, 0, 1);
          const want = rideRate(t);
          if (Math.abs(clip.playbackRate - want) > 0.05) { try { clip.playbackRate = want; } catch (e) { /* ignore */ } }
          const prog = fogIn ? WARM_END + t * band : COLD_START - t * band;
          window.scrollTo(0, scrollYFor(prog));
          requestTick();
          if (clip.ended || t >= 0.995) return done(true);
        }
        rideRaf = requestAnimationFrame(follow);
      };
      rideRaf = requestAnimationFrame(follow);
    });
    if (!ok) {
      if (!playFailed || !autoScrolling) return false;
      /* Fallback: scrub the clip along an animated scroll, like the desktop ride. */
      clip.classList.remove('is-visible');
      activeTrans = clipTrans;
      return rideScrub(dir, window.scrollY || 0, to);
    }

    return animateScroll(edgeOut, to, LEAD_MS, EASE_OUT);
  }

  function finishRide() {
    autoScrolling = false;
    autoDir = 0;
    cancelAnimationFrame(rideRaf);
    if (rideStop) rideStop();
    ridePlaying = false;
    if (activeTrans !== clipTrans && phase !== PHASE.TRANSITION) {
      /* Back to the forward clip for any desktop-style scrubbing later. */
      clipTransRev.classList.remove('is-visible');
      try { clipTransRev.pause(); } catch (e) { /* ignore */ }
      activeTrans = clipTrans;
    }
    requestTick();
  }

  /* ------------------------------------------------------------------------
     Input: wheel, touch, keyboard
     ------------------------------------------------------------------------ */

  /* Wheel: a tick in the ride's direction is swallowed; against it, the ride stops. */
  window.addEventListener('wheel', (e) => {
    const dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
    if (!dir) return;
    if (introActive) { clearIntro(); e.preventDefault(); return; }
    if (introSettling()) { e.preventDefault(); return; }
    if (autoScrolling) {
      if (dir !== autoDir) finishRide();
      else e.preventDefault();
      return;
    }
    if (startRide(dir)) e.preventDefault();
  }, { passive: false });

  /* Touch: a swipe starts the ride; swipes during a ride are swallowed (phones
     play the clip, so a half-finished ride would leave the scene stranded). */
  let touchStartY = null;
  window.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (introActive) { clearIntro(); e.preventDefault(); return; }
    if (introSettling() || autoScrolling) { e.preventDefault(); return; }
    if (touchStartY == null) return;
    const dy = e.touches[0].clientY - touchStartY;
    const dir = dy < -8 ? 1 : dy > 8 ? -1 : 0;
    if (!dir) return;
    if (startRide(dir)) e.preventDefault();
  }, { passive: false });

  /* Keyboard: arrows, page keys, space, Home/End. */
  const DOWN_KEYS = ['ArrowDown', 'PageDown', ' ', 'End'];
  const UP_KEYS   = ['ArrowUp', 'PageUp', 'Home'];
  window.addEventListener('keydown', (e) => {
    const dir = DOWN_KEYS.includes(e.key) ? 1 : UP_KEYS.includes(e.key) ? -1 : 0;
    if (introActive && (dir || e.key === 'Enter')) { clearIntro(); e.preventDefault(); return; }
    if (!dir) return;
    if (introSettling()) { e.preventDefault(); return; }
    if (autoScrolling) {
      if (dir !== autoDir) finishRide();
      else e.preventDefault();
      return;
    }
    if (startRide(dir)) e.preventDefault();
  });

  /* Always start at the top (the foggy beach), even on reload. */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (window.scrollY > 0) window.scrollTo(0, 0);

  /* ------------------------------------------------------------------------
     Diagnostics overlay (?debug=1): a small live readout to screenshot on a
     phone when something misbehaves. Never shown otherwise.
     ------------------------------------------------------------------------ */

  if (/[?&]debug=1/.test(location.search)) {
    const box = document.createElement('pre');
    box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;margin:0;padding:8px 10px;max-width:calc(100vw - 16px);' +
      'font:11px/1.35 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.72);border-radius:10px;white-space:pre-wrap;pointer-events:auto';
    document.body.appendChild(box);
    let report = '';
    let copiedUntil = 0;
    const copy = (e) => {
      e.preventDefault(); e.stopPropagation();
      const text = 'sf-weather report\n' + report;
      const done = () => { copiedUntil = performance.now() + 2500; };
      if (navigator.share) { navigator.share({ title: 'sf-weather report', text }).then(done).catch(() => {}); }
      else if (navigator.clipboard) { navigator.clipboard.writeText(text).then(done).catch(() => {}); }
    };
    box.addEventListener('click', copy);
    box.addEventListener('touchend', copy);
    const errors = [];
    window.addEventListener('error', (e) => errors.push((e.message || 'error') + ' @' + (e.lineno || '?')));
    window.addEventListener('unhandledrejection', (e) => errors.push('promise: ' + (e.reason && e.reason.message || e.reason)));
    const clipLine = (name, v) => `${name}: ready=${v.readyState} ${v.paused ? 'paused' : 'playing'} t=${(v.currentTime || 0).toFixed(1)} ` +
      `${v.classList.contains('is-visible') ? 'shown' : 'hidden'}${v.error ? ' ERR' + v.error.code : ''}${v.src ? '' : ' nosrc'}`;
    setInterval(() => {
      report = [
        `mode=${playbackMode ? 'play' : 'scrub'} assets=${ASSET_DIR} ${innerWidth}x${innerHeight} coarse=${coarsePointer} touch=${navigator.maxTouchPoints}`,
        `phase=${phase} progress=${progress.toFixed(2)} ride=${autoScrolling ? autoDir : 'no'} playing=${ridePlaying} intro=${introActive ? 'up' : (introSettling() ? 'lifting' : 'gone')}`,
        clipLine('warm', clipWarm), clipLine('fog ', clipTrans), clipLine('rev ', clipTransRev), clipLine('cold', clipCold),
        `card=${cardVisible ? 'shown' : 'hidden'} metric=${activeMetric} data=${dataLoaded}`,
        errors.length ? 'errors: ' + errors.slice(-3).join(' | ') : 'errors: none',
        navigator.userAgent.replace(/Mozilla\/5\.0 /, '').slice(0, 90),
      ].join('\n');
      box.textContent = (performance.now() < copiedUntil ? '>> copied / shared <<\n' : '>> tap this box to share or copy the report <<\n') + report;
    }, 500);
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  clipTrans.pause();
  loadData();
  tick();
  updateMetric(true);
  safePlay(clipWarm);
})();
