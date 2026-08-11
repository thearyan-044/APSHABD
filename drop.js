/* ═══════════════════════════════════════════════════════
   PDS — DROP GRID
   Front/back flip, colourway swapping, and a hover tilt.
═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine   = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  var drops = [].slice.call(document.querySelectorAll('.drop'));
  if (!drops.length) return;

  // Lets the floating tuezday chip stand down on drop pages, where it
  // would otherwise sit on top of tappable colour swatches.
  document.body.classList.add('has-drop-grid');

  // Readable colourway name — the aria-label already carries it.
  function wayName(btn) {
    if (!btn) return '';
    return btn.getAttribute('aria-label') ||
           (btn.dataset.cw || '').replace(/-/g, ' ');
  }

  drops.forEach(function (drop) {
    var loc    = drop.dataset.loc;
    // Which city's asset folder to swap against. Declared once on the
    // grid so a page's drops can't disagree; defaults to mumbai, which
    // is where this grid started life.
    var grid   = drop.closest('.drop-grid');
    var city   = (grid && grid.dataset.city) || 'mumbai';
    var stage  = drop.querySelector('.drop-stage');
    var front  = drop.querySelector('.drop-face--front img');
    var back   = drop.querySelector('.drop-face--back img');
    var hint   = drop.querySelector('.drop-hint');
    var wrap   = drop.querySelector('.drop-ways');
    var ways   = [].slice.call(drop.querySelectorAll('.way'));
    if (!stage || !front || !back) return;

    /* ── FLIP ─────────────────────────────────────────── */
    function toggle() {
      var flipped = drop.classList.toggle('is-flipped');
      stage.setAttribute('aria-pressed', flipped ? 'true' : 'false');
      stage.setAttribute('aria-label',
        drop.dataset.loc.toUpperCase() + ' tee — activate to see the ' +
        (flipped ? 'front' : 'back'));
      // ::before keeps the icon, so only the label text changes.
      if (hint) hint.textContent = flipped ? 'TAP TO GO BACK' : 'TAP TO FLIP';
    }

    stage.addEventListener('click', toggle);
    stage.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        toggle();
      }
    });

    /* ── COLOURWAYS ───────────────────────────────────── */
    // Wrap the swatch row in a labelled bar with a live name
    // readout — the ring on its own is too quiet on a phone.
    var nameEl = null;
    if (wrap && ways.length) {
      var bar   = document.createElement('div');
      var label = document.createElement('span');
      nameEl    = document.createElement('span');

      bar.className   = 'drop-ways-bar';
      label.className = 'drop-ways-label';
      label.textContent = 'COLOUR — ' + ways.length + ' OPTIONS';
      nameEl.className = 'drop-ways-name';
      // Announce the swap for screen readers without moving focus.
      nameEl.setAttribute('aria-live', 'polite');
      nameEl.textContent = wayName(
        ways.filter(function (w) { return w.classList.contains('is-on'); })[0] || ways[0]
      );

      bar.appendChild(label);
      bar.appendChild(nameEl);
      wrap.parentNode.insertBefore(bar, wrap);
    }

    // Every click gets a sequence number. Loads finish out of
    // order — the back plate is ~3x the bytes of the front —
    // so without this an earlier, slower colour could land
    // after a later one and leave the ring disagreeing with
    // the garment on screen.
    var swapSeq = 0;

    function faceSwap(img, src, token) {
      var pre = new Image();
      var settle = function () {
        if (token !== swapSeq) return;          // superseded by a newer click
        img.classList.add('is-swapping');
        window.setTimeout(function () {
          if (token !== swapSeq) {              // superseded mid-fade
            img.classList.remove('is-swapping');
            return;
          }
          img.src = src;
          img.classList.remove('is-swapping');
        }, 140);
      };
      pre.onload  = settle;
      pre.onerror = settle;   // still swap; a broken src shows the alt
      pre.src = src;
    }

    function swap(cw, btn) {
      if (btn.classList.contains('is-on')) return;

      var base  = './/assets/' + city + '/' + loc + '/' + cw;
      var token = ++swapSeq;

      // Selection state moves on the click, never on the network.
      // The button has to feel like it answered instantly even
      // when the JPEG behind it takes a moment.
      ways.forEach(function (w) {
        w.classList.remove('is-on');
        w.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-on');
      btn.setAttribute('aria-pressed', 'true');
      if (nameEl) nameEl.textContent = wayName(btn);

      // The two faces load independently, so whichever one you
      // are actually looking at updates as soon as it is ready
      // instead of waiting on the hidden one.
      faceSwap(front, base + '-front.jpg', token);
      faceSwap(back,  base + '-back.jpg',  token);
    }

    ways.forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.classList.contains('is-on') ? 'true' : 'false');
      btn.addEventListener('click', function () { swap(btn.dataset.cw, btn); });
    });

    /* ── HOVER TILT ───────────────────────────────────────
       Only the garment plate tilts. It used to be the whole
       .drop, but .drop carries `transition: transform .85s`
       from .reveal — so every mousemove restarted an 850ms
       ease and the swatches below drifted several px under
       the cursor, making them genuinely hard to hit. The
       stage has no transform transition, so JS owns it
       outright and the controls never move. */
    if (fine && !reduce) {
      var tx = 0, ty = 0, cx = 0, cy = 0, raf = null;

      var base3d = function (x, y) {
        return 'perspective(1200px) rotateX(' + y.toFixed(2) + 'deg) rotateY(' +
               x.toFixed(2) + 'deg) translateZ(' + (x || y ? 14 : 0) + 'px)';
      };
      var paint = function () {
        cx += (tx - cx) * 0.14;
        cy += (ty - cy) * 0.14;
        if (Math.abs(tx - cx) < 0.01 && Math.abs(ty - cy) < 0.01) {
          cx = tx; cy = ty;
          stage.style.transform = base3d(cx, cy);
          raf = null;
          return;
        }
        stage.style.transform = base3d(cx, cy);
        raf = requestAnimationFrame(paint);
      };
      var kick = function () { if (!raf) raf = requestAnimationFrame(paint); };

      // Track against the plate, not the card, so the tilt
      // stops responding once you move down to the controls.
      stage.addEventListener('mousemove', function (e) {
        var r = stage.getBoundingClientRect();
        tx =  ((e.clientX - (r.left + r.width  / 2)) / (r.width  / 2)) * 5;
        ty = -((e.clientY - (r.top  + r.height / 2)) / (r.height / 2)) * 4;
        kick();
      }, { passive: true });

      stage.addEventListener('mouseleave', function () {
        tx = 0; ty = 0; kick();
      }, { passive: true });
    }
  });
})();
