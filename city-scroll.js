/* ═══════════════════════════════════════════════════════
   PDS — CITY SCROLL ANIMATION JS  (shared across cities)
   Sharp, minimalistic, scroll-linked
═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 1. SCROLL PROGRESS BAR ───────────────────────── */
  const bar = document.createElement('div');
  bar.id = 'scroll-bar';
  document.body.prepend(bar);

  /* ── 2. SCAN LINE ─────────────────────────────────── */
  const scan = document.createElement('div');
  scan.id = 'scan-line';
  document.body.prepend(scan);

  /* ── 3. BG-WORD CLIP REVEAL ───────────────────────── */
  const bgWord = document.querySelector('.bg-word');

  /* ── 4. SECTION STAGGER ───────────────────────────── */
  document.querySelectorAll('.section').forEach(el => el.classList.add('section-anim'));
  document.querySelectorAll('.card').forEach(el => el.classList.add('reveal-card'));

  /* ── 5. HEADING CLIP REVEALS ──────────────────────── */
  // Wrap each h2 inner text in a clip-reveal structure
  document.querySelectorAll('.section-head h2, .wait h2').forEach(h2 => {
    const text = h2.innerHTML;
    h2.classList.add('clip-reveal');
    h2.innerHTML = `<span class="clip-reveal-inner">${text}</span>`;
  });

  /* ── 6. MARQUEE SCROLL SPEED ──────────────────────── */
  const tracks = document.querySelectorAll('.marquee-track');

  /* ── 7. WAIT BORDER ───────────────────────────────── */
  document.querySelectorAll('.wait').forEach(el => el.classList.add('animated-border'));

  /* ── INTERSECTION OBSERVER — section/card/clip ──── */
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.section-anim, .reveal-card, .clip-reveal').forEach(el => io.observe(el));

  /* Card stagger delay */
  document.querySelectorAll('.grid').forEach(grid => {
    grid.querySelectorAll('.card').forEach((card, i) => {
      card.style.transitionDelay = `${i * 100}ms`;
    });
  });

  if (reduce) return; // ← everything below skipped for reduced-motion

  /* ── SCROLL DRIVER ────────────────────────────────── */
  let lastY = 0;
  let scanVisible = false;
  let scanHideTimer = null;
  let marqueeFast = false;
  let marqueeResetTimer = null;

  function onScroll() {
    const y       = window.scrollY;
    const maxY    = document.documentElement.scrollHeight - window.innerHeight;
    const pct     = maxY > 0 ? y / maxY : 0;

    /* Progress bar */
    bar.style.width = (pct * 100).toFixed(2) + '%';

    /* Scan line — tracks scroll position */
    const scanY = Math.min(y, window.innerHeight * 0.85);
    scan.style.top = (scanY / window.innerHeight * 100).toFixed(2) + 'vh';

    if (!scanVisible) {
      scan.classList.add('visible');
      scanVisible = true;
    }
    clearTimeout(scanHideTimer);
    scanHideTimer = setTimeout(() => {
      scan.classList.remove('visible');
      scanVisible = false;
    }, 800);

    /* bg-word clip: goes from 0% → 80% as user scrolls first screen */
    if (bgWord) {
      const clipPct = Math.min(pct * 220, 80);
      bgWord.style.setProperty('--clip-pct', clipPct.toFixed(1) + '%');
    }

    /* Marquee: speed up on fast scroll.
       Changing animation-duration remaps the animation's current
       position, so writing a new value every scroll event makes the
       text visibly jump. Snap between two states instead, and only
       write when the state actually flips. */
    const delta = Math.abs(y - lastY);
    const wantFast = delta > 26;
    if (wantFast !== marqueeFast) {
      marqueeFast = wantFast;
      const duration = wantFast ? '12s' : '30s';
      tracks.forEach(t => { t.style.animationDuration = duration; });
    }
    clearTimeout(marqueeResetTimer);
    marqueeResetTimer = setTimeout(() => {
      if (!marqueeFast) return;
      marqueeFast = false;
      tracks.forEach(t => { t.style.animationDuration = '30s'; });
    }, 400);

    lastY = y;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // init

})();
