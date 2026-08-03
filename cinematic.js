/* ═══════════════════════════════════════════════════════
   PDS — CINEMATIC ENGINE
   One rAF loop drives the camera, the deck depth, and the
   card tilt so nothing fights over a transform.
═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine   = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  var clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  var lerp  = function (a, b, t) { return a + (b - a) * t; };

  /* ── FILM FRAME ─────────────────────────────────────── */
  function buildFrame() {
    if (reduce) return;
    var f = document.createElement('div');
    f.className = 'cine-frame';
    f.setAttribute('aria-hidden', 'true');
    var v = document.createElement('div');
    v.className = 'cine-vignette';
    f.appendChild(v);
    document.body.appendChild(f);
    requestAnimationFrame(function () { f.classList.add('on'); });
  }

  /* ── HERO CAMERA RIG ────────────────────────────────── */
  // Wrap .hero-inner so the dolly composes with the existing
  // mouse parallax instead of overwriting it.
  var cam = null;
  function buildCam() {
    var inner = document.querySelector('.hero-inner');
    if (!inner || !inner.parentNode) return;
    cam = document.createElement('div');
    cam.className = 'hero-cam';
    inner.parentNode.insertBefore(cam, inner);
    cam.appendChild(inner);
  }

  var video = document.querySelector('.hero-video');
  var hero  = document.querySelector('.hero');

  function updateCamera() {
    if (!hero) return;
    var vh = window.innerHeight;
    var y  = window.scrollY;
    // 0 at rest, 1 when the hero has fully passed
    var p = clamp(y / (vh * 0.9), 0, 1);

    if (cam) {
      var scale   = 1 - p * 0.14;          // pull back
      var push    = -p * 260;              // into the screen
      var rise    = -p * 60;
      var rot     = p * 7;                 // tip away from viewer
      cam.style.transform =
        'translate3d(0,' + rise.toFixed(1) + 'px,' + push.toFixed(0) + 'px) ' +
        'rotateX(' + rot.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
      cam.style.opacity = (1 - p * 1.05).toFixed(3);
      cam.style.filter  = p > 0.02 ? 'blur(' + (p * 5).toFixed(2) + 'px)' : 'none';
    }

    if (video) {
      // Slow push-in on the plate, opposite direction to the rig
      var vs = 1 + p * 0.22;
      video.style.transform = 'scale(' + vs.toFixed(3) + ') translateY(' + (p * 22).toFixed(1) + 'px)';
    }
  }

  /* ── CITY DECK: DEPTH + TILT ────────────────────────── */
  var cards = [].slice.call(document.querySelectorAll('.city-card'));
  var state = cards.map(function () {
    return { bury: 0, tx: 0, ty: 0, ctx: 0, cty: 0 };
  });

  function measureDeck() {
    var vh = window.innerHeight;
    for (var i = 0; i < cards.length; i++) {
      var next = cards[i + 1];
      var b = 0;
      if (next) {
        var nr = next.getBoundingClientRect();
        var cr = cards[i].getBoundingClientRect();
        // 0 while the next card is still below the fold,
        // 1 once it has risen flush over this one.
        var start = vh;
        var end   = cr.top + 30;
        if (start - end > 1) b = clamp((start - nr.top) / (start - end), 0, 1);
      }
      state[i].bury = b;
    }
  }

  function paintDeck() {
    for (var i = 0; i < cards.length; i++) {
      var s = state[i];
      // ease the hover tilt toward its target
      s.ctx = lerp(s.ctx, s.tx, 0.12);
      s.cty = lerp(s.cty, s.ty, 0.12);

      var b     = s.bury;
      var scale = 1 - b * 0.07;
      var push  = -b * 140;
      var rise  = -b * 18;
      var rotB  = b * 4;

      cards[i].style.transform =
        'translate3d(0,' + rise.toFixed(1) + 'px,' + push.toFixed(0) + 'px) ' +
        'rotateX(' + (rotB + s.cty).toFixed(2) + 'deg) ' +
        'rotateY(' + s.ctx.toFixed(2) + 'deg) ' +
        'scale(' + scale.toFixed(3) + ')';
      cards[i].style.setProperty('--bury', (b * 0.55).toFixed(3));
    }
  }

  function bindCardTilt() {
    if (!fine || reduce) return;
    cards.forEach(function (card, i) {
      card.addEventListener('mousemove', function (e) {
        var r  = card.getBoundingClientRect();
        var nx = (e.clientX - (r.left + r.width  / 2)) / (r.width  / 2); // -1 → 1
        var ny = (e.clientY - (r.top  + r.height / 2)) / (r.height / 2);
        state[i].tx =  nx * 4;
        state[i].ty = -ny * 3;
        // inner layers drift at their own rates → depth inside the card
        card.style.setProperty('--mx', nx.toFixed(3));
        card.style.setProperty('--my', ny.toFixed(3));
        dirty = true;
      }, { passive: true });

      card.addEventListener('mouseenter', function () {
        card.style.setProperty('--hov', '1');
      }, { passive: true });

      card.addEventListener('mouseleave', function () {
        state[i].tx = 0; state[i].ty = 0;
        card.style.setProperty('--mx', '0');
        card.style.setProperty('--my', '0');
        card.style.setProperty('--hov', '0');
        dirty = true;
      }, { passive: true });
    });
  }

  /* ── SCROLL-ROTATED PANELS ──────────────────────────── */
  // Each element pivots through the page plane as it crosses
  // the viewport: tipped toward you below, away above.
  var panels = [];
  function collectPanels() {
    var add = function (sel, rotX, rotY, z, persp) {
      [].slice.call(document.querySelectorAll(sel)).forEach(function (el) {
        panels.push({ el: el, rx: rotX, ry: rotY, z: z, p: persp || 0 });
      });
    };
    add('.story-block', 9, 0, 90);
    add('.wait-inner',  7, 0, 70);
    // The marquee track owns its own scrolling animation, so the
    // tilt goes on the container with a self-contained perspective.
    add('.marquee', 7, 0, 0, 700);
    add('.footer-big', 0, 8, 60);

    // These CSS animations would override the inline transforms below.
    var fb = document.querySelector('.footer-big');
    if (fb) fb.classList.remove('footer-3d-pulse');
  }

  function updatePanels() {
    var vh = window.innerHeight;
    for (var i = 0; i < panels.length; i++) {
      var p = panels[i];
      var r = p.el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;   // offscreen
      var mid = r.top + r.height / 2;
      // -1 (below the fold) → 0 (centered) → 1 (above)
      var t = clamp((vh / 2 - mid) / (vh / 2 + r.height / 2), -1, 1);
      p.el.style.transform =
        (p.p ? 'perspective(' + p.p + 'px) ' : '') +
        'rotateX(' + (t * p.rx).toFixed(2) + 'deg) ' +
        'rotateY(' + (t * p.ry).toFixed(2) + 'deg) ' +
        'translateZ(' + (-Math.abs(t) * p.z).toFixed(0) + 'px)';
    }
  }

  /* ── NAV LIFT ───────────────────────────────────────── */
  var nav = document.querySelector('.nav');
  function updateNav() {
    if (!nav) return;
    if (window.scrollY > 40) nav.classList.add('lifted');
    else nav.classList.remove('lifted');
  }

  /* ── HERO STICKER — float + 3D mouse tumble ─────────── */
  var sticker = document.getElementById('heroSticker');
  var stkX = 0, stkY = 0;
  function bindSticker() {
    if (!sticker || !fine || reduce) return;
    // The CSS float animation would override our inline transform,
    // so we drive the float ourselves instead.
    sticker.classList.remove('float-3d');
    document.addEventListener('mousemove', function (e) {
      stkX = (e.clientX / window.innerWidth  - 0.5) * 2;
      stkY = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  function paintSticker(now) {
    if (!sticker || !fine || reduce) return;
    var bob = Math.sin(now / 1400) * 7;
    var yaw = Math.cos(now / 2600) * 3;
    sticker.style.transform =
      'perspective(900px) rotate(-15deg) ' +
      'translate3d(' + (stkX * -20).toFixed(1) + 'px,' + (stkY * -14 + bob).toFixed(1) + 'px,0) ' +
      'rotateY(' + (stkX * 22 + yaw).toFixed(2) + 'deg) ' +
      'rotateX(' + (stkY * -16).toFixed(2) + 'deg)';
  }

  /* ── PAGE WIPE ──────────────────────────────────────── */
  function buildWipe(color, name) {
    var w = document.createElement('div');
    w.className = 'cine-wipe';
    w.style.setProperty('--wipe', color);
    w.setAttribute('aria-hidden', 'true');
    if (name) {
      var n = document.createElement('span');
      n.className = 'cine-wipe-name';
      n.textContent = name;
      w.appendChild(n);
    }
    document.body.appendChild(w);
    return w;
  }

  function bindWipeLinks() {
    if (reduce) return;
    cards.forEach(function (card) {
      card.addEventListener('click', function (e) {
        // let modified clicks (new tab, etc.) behave normally
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        var href = card.getAttribute('href');
        if (!href || href.charAt(0) === '#') return;
        e.preventDefault();

        var color = (card.style.getPropertyValue('--c') || '#f5b301').trim();
        var nameEl = card.querySelector('.city-name');
        var w = buildWipe(color, nameEl ? nameEl.textContent.trim() : '');
        w.classList.add('cover');

        try { sessionStorage.setItem('pdsWipe', color); } catch (err) {}

        var went = false;
        var go = function () { if (!went) { went = true; window.location.href = href; } };
        w.addEventListener('animationend', go);
        setTimeout(go, 900); // safety net
      });
    });
  }

  // Arriving on a city page — retract the panel we left with.
  function playArrival() {
    if (reduce) return;
    var color;
    try { color = sessionStorage.getItem('pdsWipe'); } catch (err) { return; }
    if (!color) return;
    try { sessionStorage.removeItem('pdsWipe'); } catch (err) {}

    var w = buildWipe(color, '');
    w.classList.add('reveal');
    w.addEventListener('animationend', function () {
      if (w.parentNode) w.parentNode.removeChild(w);
    });
  }

  /* ── TITLE SWEEP ────────────────────────────────────── */
  function bindSweep() {
    var title = document.querySelector('.hero-title');
    if (!title || reduce) return;
    var fire = function () {
      title.classList.remove('sweep');
      void title.offsetWidth;      // restart the animation
      title.classList.add('sweep');
    };
    setTimeout(fire, 1400);
    if (hero) hero.addEventListener('mouseenter', fire);
  }

  /* ── LOOP ───────────────────────────────────────────── */
  var dirty = true;
  function tick(now) {
    if (dirty) {
      updateCamera();
      measureDeck();
      updatePanels();
      updateNav();
      dirty = false;
    }
    paintDeck();              // keeps easing the tilt smoothly
    paintSticker(now || 0);   // continuous float
    requestAnimationFrame(tick);
  }

  function boot() {
    playArrival();
    if (reduce) return;

    buildFrame();
    buildCam();
    collectPanels();
    bindCardTilt();
    bindSticker();
    bindWipeLinks();
    bindSweep();

    window.addEventListener('scroll', function () { dirty = true; }, { passive: true });
    window.addEventListener('resize', function () { dirty = true; }, { passive: true });

    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
