/**
 * PDS — Client-Side Security Guards
 * Runs on every page. Lightweight, zero dependencies.
 * =====================================================
 * NOTE: These are *defence-in-depth* measures.
 * True security lives on the SERVER (.htaccess, hosting config).
 * Client-side JS can always be bypassed by a determined attacker,
 * but these guards catch common mistakes and casual abuse.
 */

(function () {
  'use strict';

  /* ── 1. BLOCK IFRAME EMBEDDING (clickjacking) ─────────── */
  if (window.top !== window.self) {
    // We're inside an iframe we didn't create — break out or blank
    try { window.top.location = window.self.location; }
    catch (e) { document.body.innerHTML = ''; }
  }

  /* ── 2. DISABLE RIGHT-CLICK (minor content protection) ── */
  // Prevents casual image/video save via context menu
  document.addEventListener('contextmenu', e => e.preventDefault());

  /* ── 3. DISABLE KEYBOARD SHORTCUTS FOR DEV TOOLS ─────── */
  document.addEventListener('keydown', e => {
    // F12
    if (e.key === 'F12') { e.preventDefault(); return; }
    // Ctrl+Shift+I / Cmd+Opt+I (DevTools)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') { e.preventDefault(); return; }
    // Ctrl+Shift+J (Console)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J') { e.preventDefault(); return; }
    // Ctrl+U (View source)
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') { e.preventDefault(); return; }
    // Ctrl+S (Save page)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); return; }
  });

  /* ── 4. DISABLE TEXT SELECTION ON NON-INPUT ELEMENTS ──── */
  // Prevents bulk copy of design content
  document.addEventListener('selectstart', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
  });

  /* ── 5. DISABLE DRAG OF IMAGES & VIDEOS ─────────────────  */
  document.addEventListener('dragstart', e => {
    if (['IMG', 'VIDEO'].includes(e.target.tagName)) e.preventDefault();
  });

  /* ── 6. DETECT DEVTOOLS OPEN (heuristic) ─────────────── */
  // If the window dimensions differ significantly from normal,
  // it's likely DevTools is docked — warn without blocking.
  let devWarned = false;
  const devCheck = setInterval(() => {
    const threshold = 160;
    const widthDiff  = window.outerWidth  - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;
    if ((widthDiff > threshold || heightDiff > threshold) && !devWarned) {
      devWarned = true;
      console.warn(
        '%c⚠ PIN DROP SILENCE',
        'font-size:22px; font-weight:bold; color:#f5b301;',
        '\nThis site\'s design and assets are protected.\nUnauthorised reproduction is prohibited.'
      );
    }
  }, 1000);

  /* ── 7. CONSOLE WELCOME (ethical disclosure) ─────────── */
  // Friendly message for legitimate developers
  console.log(
    '%cPIN DROP SILENCE — Security Notice',
    'font-size:14px; font-weight:bold; color:#f5b301; background:#0c0c0c; padding:4px 8px;'
  );
  console.log(
    '%cFound a vulnerability? Email: security@pindropsilence.com\nResponsible disclosure is appreciated.',
    'color:#888; font-size:12px;'
  );

  /* ── 8. STRIP INJECTED SCRIPTS (mutation guard) ──────── */
  // Watches for new <script> tags being injected into the DOM
  const scriptObserver = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.tagName === 'SCRIPT' && !node.src.includes(window.location.origin)) {
          console.warn('[PDS Security] Blocked external script injection:', node.src || 'inline');
          node.remove();
        }
      });
    });
  });
  scriptObserver.observe(document.documentElement, { childList: true, subtree: true });

})();
