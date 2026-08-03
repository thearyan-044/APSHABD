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

  drops.forEach(function (drop) {
    var loc    = drop.dataset.loc;
    var stage  = drop.querySelector('.drop-stage');
    var front  = drop.querySelector('.drop-face--front img');
    var back   = drop.querySelector('.drop-face--back img');
    var ways   = [].slice.call(drop.querySelectorAll('.way'));
    if (!stage || !front || !back) return;

    /* ── FLIP ─────────────────────────────────────────── */
    function toggle() {
      var flipped = drop.classList.toggle('is-flipped');
      stage.setAttribute('aria-pressed', flipped ? 'true' : 'false');
      stage.setAttribute('aria-label',
        drop.dataset.loc.toUpperCase() + ' tee — activate to see the ' +
        (flipped ? 'front' : 'back'));
    }

    stage.addEventListener('click', toggle);
    stage.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        toggle();
      }
    });

    /* ── COLOURWAYS ───────────────────────────────────── */
    // Preload both faces before swapping so the plate never
    // flashes a half-loaded or blank image.
    function swap(cw, btn) {
      if (btn.classList.contains('is-on')) return;

      var base   = './/assets/mumbai/' + loc + '/' + cw;
      var nextF  = base + '-front.jpg';
      var nextB  = base + '-back.jpg';
      var pending = 2;
      var done = function () {
        if (--pending) return;
        front.classList.add('is-swapping');
        back.classList.add('is-swapping');
        window.setTimeout(function () {
          front.src = nextF;
          back.src  = nextB;
          front.classList.remove('is-swapping');
          back.classList.remove('is-swapping');
        }, 140);
      };

      [nextF, nextB].forEach(function (src) {
        var pre = new Image();
        pre.onload = done;
        pre.onerror = done;   // still swap; a broken src shows the alt
        pre.src = src;
      });

      ways.forEach(function (w) { w.classList.remove('is-on'); });
      btn.classList.add('is-on');
    }

    ways.forEach(function (btn) {
      btn.addEventListener('click', function () { swap(btn.dataset.cw, btn); });
    });

    /* ── HOVER TILT ───────────────────────────────────── */
    // Applied to the whole card with its own perspective, so it
    // composes with the flip rotation happening inside.
    if (fine && !reduce) {
      var tx = 0, ty = 0, cx = 0, cy = 0, raf = null;

      var paint = function () {
        cx += (tx - cx) * 0.14;
        cy += (ty - cy) * 0.14;
        if (Math.abs(tx - cx) < 0.01 && Math.abs(ty - cy) < 0.01) {
          cx = tx; cy = ty;
          drop.style.transform = base3d(cx, cy);
          raf = null;
          return;
        }
        drop.style.transform = base3d(cx, cy);
        raf = requestAnimationFrame(paint);
      };
      var base3d = function (x, y) {
        return 'perspective(1200px) rotateX(' + y.toFixed(2) + 'deg) rotateY(' +
               x.toFixed(2) + 'deg) translateZ(' + (x || y ? 14 : 0) + 'px)';
      };
      var kick = function () { if (!raf) raf = requestAnimationFrame(paint); };

      drop.addEventListener('mousemove', function (e) {
        var r = drop.getBoundingClientRect();
        tx =  ((e.clientX - (r.left + r.width  / 2)) / (r.width  / 2)) * 5;
        ty = -((e.clientY - (r.top  + r.height / 2)) / (r.height / 2)) * 4;
        kick();
      }, { passive: true });

      drop.addEventListener('mouseleave', function () {
        tx = 0; ty = 0; kick();
      }, { passive: true });
    }
  });
})();
