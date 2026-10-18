/* ==========================================================================
   San Francisco: Hottest & Coldest — scroll-driven scene + glass panel
   Plain JavaScript, no dependencies.
   ========================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     TUNABLE THRESHOLDS
     Scroll progress through the stage runs 0 → 1.
       0 … WARM_END          : warm-loop.mp4 plays (sunny)
       WARM_END … COLD_START : transition.mp4 is scrubbed by scroll (fog rolls in)
       COLD_START … 1        : cold-loop.mp4 plays (foggy)
     Adjust these two numbers to give the loops more or less scroll room.
     ------------------------------------------------------------------------ */
  const WARM_END   = 0.15;
  const COLD_START = 0.85;

  /* Scroll progress at which the card swaps from the HOTTEST count (sunny) to the COLDEST count (foggy). */
  const METRIC_SWAP = 0.5;

  /* The card is visible at the top and the bottom, hidden in between:
       shown while progress < CARD_HIDE_AT, hidden until progress >= CARD_SHOW_AT. */
  const CARD_HIDE_AT = 0.04;
  const CARD_SHOW_AT = 0.9;

  /* First downward scroll auto-plays the whole scene: how long the ride to the bottom takes. */
  const AUTO_SCROLL_MS = 9000;

  /* How many discrete steps the scrub uses when the visitor prefers reduced motion. */
  const REDUCED_MOTION_STEPS = 12;

  /* Count-up animation length on load, in milliseconds. */
  const COUNT_UP_MS = 1800;

  /* Fallback if data.json can't be fetched, so the panel always renders. */
  const DEFAULT_DATA = { hot: 3, cold: 1, totalDays: 138, year: 2026 };

  /* ------------------------------------------------------------------------ */

  const EASE_OUT = (t) => 1 - Math.pow(1 - t, 3);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const stage      = document.getElementById('stage');
  const clipWarm   = document.getElementById('clipWarm');
  const clipTrans  = document.getElementById('clipTransition');
  const clipCold   = document.getElementById('clipCold');
  const posterWarm = document.getElementById('posterWarm');
  const posterCold = document.getElementById('posterCold');
  const scrollCue  = document.getElementById('scrollCue');
  const glass      = document.getElementById('glass');
  const metricHot  = document.getElementById('metricHot');
  const metricCold = document.getElementById('metricCold');
  const hotValue   = document.getElementById('hotValue');
  const coldValue  = document.getElementById('coldValue');
  const hotBar     = document.getElementById('hotBar');
  const coldBar    = document.getElementById('coldBar');

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touchOnly     = window.matchMedia('(hover: none)').matches || navigator.maxTouchPoints > 0;

  const PHASE = { WARM: 'warm', TRANSITION: 'transition', COLD: 'cold' };
  const clipFor = { warm: clipWarm, transition: clipTrans, cold: clipCold };
  const dead = { warm: false, transition: false, cold: false };   // clips that failed to load

  let phase = null;        // current phase
  let progress = 0;        // 0 … 1 scroll progress
  let rafPending = false;  // at most one tick per animation frame
  let unlocked = false;    // mobile Safari seek unlock done?

  /* ------------------------------------------------------------------------
     Scroll → progress
     ------------------------------------------------------------------------ */

  function readProgress() {
    const max = stage.offsetHeight - window.innerHeight;
    if (max <= 0) return 0;
    return clamp((window.scrollY || window.pageYOffset || 0) / max, 0, 1);
  }

  function requestTick() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(tick);
  }

  function tick() {
    rafPending = false;
    progress = readProgress();

    /* Phase boundaries — see WARM_END / COLD_START above. */
    let next;
    if (progress < WARM_END)        next = PHASE.WARM;        // 0 … WARM_END
    else if (progress < COLD_START) next = PHASE.TRANSITION;  // WARM_END … COLD_START
    else                            next = PHASE.COLD;        // COLD_START … 1

    if (next !== phase) setPhase(next);
    if (phase === PHASE.TRANSITION) scrub();
    updatePosters();
    updateMetric();
    updateCard();

    scrollCue.classList.toggle('is-hidden', progress > 0.02 || autoScrolling);
  }

  /* ------------------------------------------------------------------------
     Card metric: HOTTEST count over the sunny scene, COLDEST once the fog is in.
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

  /* Card fades out as soon as the ride starts and fades back in at the bottom. */
  function updateCard() {
    const want = progress < CARD_HIDE_AT || progress >= CARD_SHOW_AT;
    if (want === cardVisible) return;
    cardVisible = want;
    glass.classList.toggle('is-hidden', !want);
    if (want && dataLoaded) animateActiveMetric(1200);
  }

  function animateActiveMetric(duration) {
    const el  = activeMetric === 'hot' ? hotValue : coldValue;
    const bar = activeMetric === 'hot' ? hotBar : coldBar;
    const target = Number(el.dataset.target || 0);
    countUp(el, target, duration);
    bar.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = bar.dataset.width || '0%'; }));
  }

  /* ------------------------------------------------------------------------
     Phase handoffs — single-frame swaps, no crossfade.
     The clips share framing and the transition's first/last frames match the
     loops' first frames, so we reset a loop to frame 0 as it comes in.
     Stacking order in the DOM is warm < transition < cold, which lets the
     incoming clip become visible *before* the outgoing one hides.
     ------------------------------------------------------------------------ */

  function setPhase(next) {
    const prev = phase;
    phase = next;

    const incoming = clipFor[next];
    const outgoing = prev ? clipFor[prev] : null;

    if (next === PHASE.TRANSITION) {
      /* Scrub target is applied by scrub(); it's already paused. */
      scrub(true);
      incoming.classList.add('is-visible');
      hideAndPause(outgoing);
      return;
    }

    /* A loop is coming in: rewind to frame 0 so it lines up with the transition. */
    const loop = incoming;
    const startLoop = () => {
      loop.classList.add('is-visible');
      safePlay(loop);
    };

    if (loop.readyState >= 2 && Math.abs(loop.currentTime) > 0.01) {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        loop.removeEventListener('seeked', finish);
        startLoop();
        hideAndPause(outgoing);
      };
      loop.addEventListener('seeked', finish, { once: true });
      setTimeout(finish, 150);                 // don't wait forever on a slow seek
      try { loop.currentTime = 0; } catch (e) { finish(); }
    } else {
      startLoop();
      hideAndPause(outgoing);
    }
  }

  function hideAndPause(clip) {
    if (!clip) return;
    clip.classList.remove('is-visible');
    if (clip !== clipTrans) { try { clip.pause(); } catch (e) { /* ignore */ } }
  }

  function safePlay(clip) {
    if (dead[keyOf(clip)]) return;
    const p = clip.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay blocked until first touch */ });
  }

  function keyOf(clip) {
    return clip === clipWarm ? 'warm' : clip === clipTrans ? 'transition' : 'cold';
  }

  /* ------------------------------------------------------------------------
     Scroll-scrubbing of transition.mp4
     - never seeks inside the scroll handler; only here, inside rAF
     - at most one seek per frame, and never while a previous seek is pending
     - only once readyState >= 2
     ------------------------------------------------------------------------ */

  let scrubPending = false;    // a seek was wanted while the video was busy

  function scrub(force) {
    const v = clipTrans;
    if (dead.transition) return;
    if (!(v.readyState >= 2) || !isFinite(v.duration) || v.duration <= 0) {
      scrubPending = true;     // try again on loadeddata / canplay
      return;
    }

    let t = clamp((progress - WARM_END) / (COLD_START - WARM_END), 0, 1);
    if (reducedMotion) t = Math.round(t * REDUCED_MOTION_STEPS) / REDUCED_MOTION_STEPS;

    /* Stay a hair short of the end so the browser shows the last frame rather than "ended". */
    const target = Math.min(t * v.duration, v.duration - 0.02);

    if (v.seeking && !force) {   // let the current seek land first
      scrubPending = true;
      return;
    }

    const HALF_FRAME = 1 / 48;   // 24 fps source; skip no-op seeks
    if (Math.abs(v.currentTime - target) < HALF_FRAME && !force) { scrubPending = false; return; }

    scrubPending = false;
    try {
      if (!v.paused) v.pause();
      v.currentTime = target;
    } catch (e) { scrubPending = true; }
  }

  /* When a seek finishes, apply any seek that was deferred meanwhile. */
  clipTrans.addEventListener('seeked', () => { if (scrubPending) requestTick(); });
  ['loadeddata', 'canplay', 'loadedmetadata'].forEach((ev) =>
    clipTrans.addEventListener(ev, () => { scrubPending = true; requestTick(); }));

  /* Belt and braces: the transition must never play on its own (after the one-time unlock below). */
  let unlockSettled = false;
  clipTrans.addEventListener('play', () => { if (unlockSettled) clipTrans.pause(); });

  /* ------------------------------------------------------------------------
     Mobile Safari unlock: a paused <video> often can't be seeked programmatically
     until it has been played once by a user gesture. On the first interaction,
     play() + pause() each clip, muted. Runs once.
     ------------------------------------------------------------------------ */

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    ['touchstart', 'pointerdown', 'keydown', 'wheel'].forEach((ev) =>
      window.removeEventListener(ev, unlock));

    [clipWarm, clipTrans, clipCold].forEach((v) => {
      if (dead[keyOf(v)]) return;
      v.muted = true;
      if (v.readyState === 0) { try { v.load(); } catch (e) { /* ignore */ } }
      const p = v.play();
      const settle = () => {
        const isActiveLoop = (v === clipWarm && phase === PHASE.WARM) ||
                             (v === clipCold && phase === PHASE.COLD);
        if (!isActiveLoop) v.pause();
        if (v === clipTrans) unlockSettled = true;
      };
      if (p && typeof p.then === 'function') p.then(settle).catch(settle); else settle();
    });
    scrubPending = true;
    requestTick();
  }
  ['touchstart', 'pointerdown', 'keydown', 'wheel'].forEach((ev) =>
    window.addEventListener(ev, unlock, { passive: true }));

  /* ------------------------------------------------------------------------
     Failure fallback: if a clip errors out, hide it and show the matching poster.
     ------------------------------------------------------------------------ */

  function markDead(clip) {
    const k = keyOf(clip);
    if (dead[k]) return;
    dead[k] = true;
    clip.classList.add('is-dead');
    clip.classList.remove('is-visible');
    updatePosters();
  }

  [clipWarm, clipTrans, clipCold].forEach((v) => {
    v.addEventListener('error', () => markDead(v));
    /* Some browsers report a bad source on the element's networkState instead of an error event. */
    v.addEventListener('stalled', () => { if (v.networkState === 3 /* NETWORK_NO_SOURCE */) markDead(v); });
    if (!v.canPlayType('video/mp4')) markDead(v);
  });

  function updatePosters() {
    let showWarm = false, showCold = false;
    if (phase === PHASE.WARM && dead.warm) showWarm = true;
    if (phase === PHASE.COLD && dead.cold) showCold = true;
    if (phase === PHASE.TRANSITION && dead.transition) {
      const t = (progress - WARM_END) / (COLD_START - WARM_END);
      if (t < 0.5) showWarm = true; else showCold = true;
    }
    posterWarm.classList.toggle('is-visible', showWarm);
    posterCold.classList.toggle('is-visible', showCold);
  }

  /* ------------------------------------------------------------------------
     Scroll / resize listeners (capture only; all work happens in tick()).
     ------------------------------------------------------------------------ */

  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', requestTick);
  window.addEventListener('orientationchange', requestTick);

  /* ------------------------------------------------------------------------
     Glass panel: data + count-up + specular highlight
     ------------------------------------------------------------------------ */

  function renderPanel(data) {
    const year  = Number.isFinite(+data.year)      ? +data.year      : DEFAULT_DATA.year;
    const hot   = Number.isFinite(+data.hot)       ? +data.hot       : DEFAULT_DATA.hot;
    const cold  = Number.isFinite(+data.cold)      ? +data.cold      : DEFAULT_DATA.cold;
    const total = Number.isFinite(+data.totalDays) ? +data.totalDays : DEFAULT_DATA.totalDays;

    document.getElementById('year').textContent = String(year);
    document.getElementById('totalDays').textContent = total.toLocaleString();

    hotValue.dataset.target = String(hot);
    coldValue.dataset.target = String(cold);
    const pct = (n) => (total > 0 ? Math.max(0, Math.min(100, (n / total) * 100)) : 0).toFixed(1) + '%';
    hotBar.dataset.width = pct(hot);
    coldBar.dataset.width = pct(cold);
    dataLoaded = true;

    /* Set both numbers, then animate whichever metric is showing. */
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
    const url = 'data.json?t=' + Math.floor(Date.now() / 3600000); // bust caches hourly
    fetch(url, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => renderPanel(Object.assign({}, DEFAULT_DATA, d)))
      .catch(() => renderPanel(DEFAULT_DATA));
  }

  /* Specular highlight follows the cursor; skipped on touch devices. */
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
     Auto-scroll ("the ride"): a downward scroll from the top part of the page
     rides smoothly to the bottom, playing the fog in; an upward scroll from the
     bottom part rides back to the top, playing it out. It works every time, so
     the scene can be replayed. Scrolling against the ride cancels it and hands
     control back; from the middle of the page scrolling is manual.
     ------------------------------------------------------------------------ */

  let autoScrolling = false;
  let autoDir = 0;            // +1 riding down, -1 riding up
  let autoScrollRaf = 0;

  /* Ride curve: a very short ease-in (so it visibly starts at once), a long steady
     middle (the fog plays at a constant speed), and a gentle ease-out at the end. */
  const RIDE_IN = 0.06, RIDE_OUT_FROM = 0.72;
  const RIDE_V = 2 / (1 + RIDE_OUT_FROM - RIDE_IN);
  function rideCurve(t) {
    if (t < RIDE_IN) return RIDE_V * t * t / (2 * RIDE_IN);
    if (t < RIDE_OUT_FROM) return RIDE_V * RIDE_IN / 2 + RIDE_V * (t - RIDE_IN);
    const u = (t - RIDE_OUT_FROM) / (1 - RIDE_OUT_FROM);
    return RIDE_V * RIDE_IN / 2 + RIDE_V * (RIDE_OUT_FROM - RIDE_IN) + RIDE_V * (1 - RIDE_OUT_FROM) * (u - u * u / 2);
  }

  /* Where a ride may begin: down from the top quarter, up from the bottom quarter. */
  const RIDE_DOWN_FROM_BELOW = 0.25;
  const RIDE_UP_FROM_ABOVE   = 0.75;

  function startAutoScroll(dir) {
    if (autoScrolling || reducedMotion) return false;
    const p = readProgress();
    if (dir > 0 && p > RIDE_DOWN_FROM_BELOW) return false;
    if (dir < 0 && p < RIDE_UP_FROM_ABOVE) return false;

    const from = window.scrollY || 0;
    const to = dir > 0 ? stage.offsetHeight - window.innerHeight : 0;
    if (Math.abs(to - from) < 2) return false;        // already there

    autoScrolling = true;
    autoDir = dir;
    scrollCue.classList.add('is-hidden');
    const t0 = performance.now();

    const frame = (now) => {
      if (!autoScrolling) return;
      const t = clamp((now - t0) / AUTO_SCROLL_MS, 0, 1);
      window.scrollTo(0, from + (to - from) * Math.min(1, rideCurve(t)));
      requestTick();
      if (t < 1) autoScrollRaf = requestAnimationFrame(frame);
      else finishAutoScroll();
    };
    autoScrollRaf = requestAnimationFrame(frame);
    return true;
  }

  function finishAutoScroll() {
    autoScrolling = false;
    autoDir = 0;
    cancelAnimationFrame(autoScrollRaf);
    requestTick();
  }

  /* Wheel: a tick in the ride's direction is swallowed; against it, the ride stops. */
  window.addEventListener('wheel', (e) => {
    const dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
    if (!dir) return;
    if (autoScrolling) {
      if (dir !== autoDir) finishAutoScroll();
      else e.preventDefault();
      return;
    }
    if (startAutoScroll(dir)) e.preventDefault();
  }, { passive: false });

  /* Touch: a swipe up (= scroll down) or down starts the ride; swipes during it are swallowed. */
  let touchStartY = null;
  window.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (autoScrolling) { e.preventDefault(); return; }
    if (touchStartY == null) return;
    const dy = e.touches[0].clientY - touchStartY;
    const dir = dy < -8 ? 1 : dy > 8 ? -1 : 0;
    if (dir && startAutoScroll(dir)) e.preventDefault();
  }, { passive: false });

  /* Keyboard: arrows, page keys, space, Home/End. */
  const DOWN_KEYS = ['ArrowDown', 'PageDown', ' ', 'End'];
  const UP_KEYS   = ['ArrowUp', 'PageUp', 'Home'];
  window.addEventListener('keydown', (e) => {
    const dir = DOWN_KEYS.includes(e.key) ? 1 : UP_KEYS.includes(e.key) ? -1 : 0;
    if (!dir) return;
    if (autoScrolling) {
      if (dir !== autoDir) finishAutoScroll();
      else e.preventDefault();
      return;
    }
    if (startAutoScroll(dir)) e.preventDefault();
  });

  /* Always start at the top (sunny), even on reload. */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (window.scrollY > 0) window.scrollTo(0, 0);

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  /* Make sure the scrubbed clip really stays paused. */
  clipTrans.pause();

  loadData();
  tick();
  updateMetric(true);
  safePlay(clipWarm);
})();
