/* ===== PIN DROP SILENCE — TYPEWRITER LOCATION PROMPT ===== */
;(function () {
  'use strict';

  /* ── Configuration ── */
  const WORDS = ['location', 'जगह', 'स्थान', 'ಸ್ಥಳ'];
  const TYPE_SPEED   = 100;   // ms per character typing
  const ERASE_SPEED  = 60;    // ms per character erasing
  const PAUSE_AFTER  = 1500;  // ms pause after full word is typed
  const PAUSE_BEFORE = 400;   // ms pause before typing next word

  /* ── Find the container ── */
  const section = document.querySelector('.typewriter-section');
  if (!section) return;

  const wordEl  = section.querySelector('.tw-word');
  if (!wordEl) return;

  let wordIndex = 0;
  let charIndex = 0;
  let isErasing = false;

  /* ── Type / Erase loop ── */
  function tick() {
    const currentWord = WORDS[wordIndex];

    if (!isErasing) {
      // Typing forward
      charIndex++;
      wordEl.textContent = currentWord.slice(0, charIndex);

      if (charIndex >= [...currentWord].length) {
        // Use spread to handle multi-byte characters correctly
        // Finished typing — pause, then start erasing
        setTimeout(() => {
          isErasing = true;
          charIndex = [...currentWord].length;
          tick();
        }, PAUSE_AFTER);
        return;
      }

      // Handle multi-byte (Devanagari / Kannada) correctly
      wordEl.textContent = [...currentWord].slice(0, charIndex).join('');
      setTimeout(tick, TYPE_SPEED);
    } else {
      // Erasing backward
      charIndex--;
      wordEl.textContent = [...currentWord].slice(0, charIndex).join('');

      if (charIndex <= 0) {
        // Finished erasing — move to next word
        isErasing = false;
        charIndex = 0;
        wordIndex = (wordIndex + 1) % WORDS.length;
        setTimeout(tick, PAUSE_BEFORE);
        return;
      }

      setTimeout(tick, ERASE_SPEED);
    }
  }

  /* ── Reveal on scroll ── */
  section.classList.add('tw-hidden');

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          section.classList.remove('tw-hidden');
          section.classList.add('tw-visible');
          revealObserver.unobserve(entry.target);
          // Start typing after reveal animation
          setTimeout(tick, 600);
        }
      });
    },
    { threshold: 0.2 }
  );

  revealObserver.observe(section);
})();
