/* ===== PIN DROP SILENCE — PRISM GLASS JS =====
   Injects the dispersion rim into signature elements and steers the
   refraction angle from the pointer. Purely decorative: every node it
   adds is aria-hidden and pointer-events:none.
   ============================================================== */

(function () {
  'use strict';

  // Signature moments only — body copy and long-form text stay clean.
  const TARGETS = [
    '.city-card',
    '.btn',
    '.cta',
    '.card',
    '.glass',
    '.drop-face',
    '.way',
    '.footer-ig',
    '.hero-logo-tile',
    '.logo-tile',
    '.nav-sticker',
    '.stamp',
    '.tz-badge'
  ].join(',');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const noHover      = window.matchMedia('(hover: none)').matches;

  // color-mix drives the whole rim; without it the CSS already hides
  // the rim, so skip the DOM work entirely.
  const supportsMix = window.CSS && CSS.supports &&
    CSS.supports('background', 'color-mix(in srgb, red 50%, transparent)');

  function decorate(el) {
    if (el.dataset.holo) return;      // never double-decorate
    el.dataset.holo = '1';
    el.classList.add('holo-host');

    const rim = document.createElement('i');
    rim.className = 'holo-rim';
    rim.setAttribute('aria-hidden', 'true');
    el.appendChild(rim);

    // Scanlines are the tell of a projection, so they stay even when
    // motion is reduced — only the moving scan pass is CSS-gated.
    const scan = document.createElement('i');
    scan.className = 'holo-scan';
    scan.setAttribute('aria-hidden', 'true');
    el.appendChild(scan);
  }

  // ── Pointer-steered refraction ──────────────────────────────────
  // One rAF frame per move, batched across all hovered elements.
  let queued = null;

  function track(el, e) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;

    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top)  / r.height;

    queued = () => {
      // Moves where the projected light pools inside the panel.
      el.style.setProperty('--hx', (x * 100).toFixed(1) + '%');
      el.style.setProperty('--hy', (y * 100).toFixed(1) + '%');
    };

    if (!track.raf) {
      track.raf = requestAnimationFrame(() => {
        track.raf = null;
        if (queued) { queued(); queued = null; }
      });
    }
  }

  function bind(el) {
    if (reduceMotion || noHover) return;
    el.addEventListener('pointermove', e => track(el, e), { passive: true });
    el.addEventListener('pointerleave', () => {
      el.style.removeProperty('--hx');
      el.style.removeProperty('--hy');
    }, { passive: true });
  }

  function scan(root) {
    (root || document).querySelectorAll(TARGETS).forEach(el => {
      decorate(el);
      bind(el);
    });
  }

  function init() {
    if (!supportsMix) return;
    scan(document);

    // The intro overlay and some city sections mount late — pick up
    // anything that appears after first paint.
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches(TARGETS)) { decorate(node); bind(node); }
          if (node.querySelectorAll) scan(node);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
