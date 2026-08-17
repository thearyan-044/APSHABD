(() => {
  'use strict';

  const header = document.querySelector('.site-header');
  const menuButton = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.site-nav');

  const setHeaderState = () => {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 18);
  };

  setHeaderState();
  window.addEventListener('scroll', setHeaderState, { passive: true });

  const scrollRoute = document.querySelector('.scroll-route');
  const scrollRouteSvg = document.querySelector('.scroll-route-map');
  const scrollRoutePath = document.querySelector('.scroll-route-path');
  const scrollRoutePointer = document.querySelector('.scroll-route-pointer');

  if (scrollRoute && scrollRouteSvg && scrollRoutePath && scrollRoutePointer) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let routeFrame = 0;
    let targetProgress = 0;
    let renderedProgress = 0;
    let lastScrollPosition = window.scrollY;
    let scrollDirection = 1;
    let renderedAngle = 180;

    const drawRouteProgress = () => {
      routeFrame = 0;
      const progressDelta = targetProgress - renderedProgress;
      renderedProgress += progressDelta * 0.2;
      if (Math.abs(progressDelta) < 0.00015) renderedProgress = targetProgress;

      const pathLength = scrollRoutePath.getTotalLength();
      const routePosition = pathLength * renderedProgress;
      const pathPoint = scrollRoutePath.getPointAtLength(routePosition);
      const beforePoint = scrollRoutePath.getPointAtLength(Math.max(0, routePosition - 1.5));
      const afterPoint = scrollRoutePath.getPointAtLength(Math.min(pathLength, routePosition + 1.5));
      const scaleX = scrollRoute.clientWidth / 72;
      const scaleY = scrollRoute.clientHeight / 1000;
      const x = pathPoint.x * scaleX;
      const y = pathPoint.y * scaleY;
      const pathAngle = Math.atan2((afterPoint.y - beforePoint.y) * scaleY, (afterPoint.x - beforePoint.x) * scaleX) * 180 / Math.PI;
      const targetAngle = pathAngle + 90 + (scrollDirection < 0 ? 180 : 0);
      const angleDelta = ((targetAngle - renderedAngle + 540) % 360) - 180;
      renderedAngle += angleDelta * 0.24;

      scrollRoutePointer.style.transform = `translate3d(${x - scrollRoutePointer.offsetWidth / 2}px, ${y - scrollRoutePointer.offsetHeight / 2}px, 0) rotate(${renderedAngle}deg)`;
      scrollRoutePath.style.strokeDashoffset = `${-renderedProgress * 180}`;
      scrollRoute.classList.add('is-ready');

      if (renderedProgress !== targetProgress || Math.abs(angleDelta) > 0.2) {
        routeFrame = window.requestAnimationFrame(drawRouteProgress);
      }
    };

    const requestRouteDraw = () => {
      if (reducedMotion.matches) return;
      const currentScrollPosition = window.scrollY;
      const scrollDelta = currentScrollPosition - lastScrollPosition;
      if (Math.abs(scrollDelta) > 0.5) scrollDirection = scrollDelta > 0 ? 1 : -1;
      lastScrollPosition = currentScrollPosition;
      const scrollRange = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      targetProgress = Math.min(1, Math.max(0, currentScrollPosition / scrollRange));
      if (!routeFrame) routeFrame = window.requestAnimationFrame(drawRouteProgress);
    };

    if (reducedMotion.matches) scrollRoute.classList.add('is-ready');
    else {
      const initialScrollRange = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      targetProgress = Math.min(1, Math.max(0, window.scrollY / initialScrollRange));
      renderedProgress = targetProgress;
      drawRouteProgress();
    }

    window.addEventListener('scroll', requestRouteDraw, { passive: true });
    window.addEventListener('resize', requestRouteDraw);
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) scrollRoute.classList.add('is-ready');
      else drawRouteProgress();
    });
  }

  const closeMenu = () => {
    if (!menuButton || !menu) return;
    menuButton.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
    document.body.classList.remove('menu-open');
  };

  if (menuButton && menu) {
    menuButton.addEventListener('click', () => {
      const willOpen = menuButton.getAttribute('aria-expanded') !== 'true';
      menuButton.setAttribute('aria-expanded', String(willOpen));
      menu.classList.toggle('is-open', willOpen);
      document.body.classList.toggle('menu-open', willOpen);
    });

    menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));

    window.addEventListener('resize', () => {
      if (window.innerWidth > 820) closeMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMenu();
        menuButton.focus();
      }
    });
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Arming the wipe from JS means the headline renders plainly if the script
  // never runs — it is the one piece of copy that must not depend on us.
  const heroTitle = document.querySelector('.hero-title');
  if (heroTitle && !prefersReducedMotion.matches) heroTitle.classList.add('is-armed');

  // Sections marked data-reveal-sequence cascade their children on one trigger
  // instead of each child firing on its own intersection, so a section arrives
  // as a single directed moment. data-reveal-solo opts an element back out.
  const sequences = [...document.querySelectorAll('[data-reveal-sequence]')];
  const sequenceItems = (section) => [...section.querySelectorAll('.reveal:not([data-reveal-solo])')];
  const sequenced = new Set();
  sequences.forEach((section) => sequenceItems(section).forEach((el) => sequenced.add(el)));

  const runSequence = (section) => {
    const step = Number(section.dataset.revealStep) || 110;

    // Sorted by position rather than DOM order so the cascade always reads
    // top-to-bottom on screen, whatever order the markup happens to be in.
    const items = sequenceItems(section)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

    items.forEach((el, index) => {
      const delay = index * step;
      el.style.transitionDelay = `${delay}ms`;
      el.classList.add('in');
      // Drop the delay once it has played, so nothing later inherits it.
      window.setTimeout(() => { el.style.transitionDelay = ''; }, delay + 900);
    });

    if (section.classList.contains('hero') && heroTitle) {
      heroTitle.classList.add('is-wiping');
    }
  };

  const revealItems = [...document.querySelectorAll('.reveal')].filter((el) => !sequenced.has(el));

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    revealItems.forEach((item) => revealObserver.observe(item));

    const sequenceObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        runSequence(entry.target);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    sequences.forEach((section) => sequenceObserver.observe(section));
  } else {
    revealItems.forEach((item) => item.classList.add('in'));
    sequences.forEach(runSequence);
  }

  // Hero photo drifts slower than the copy beside it. Scroll-driven, so it
  // behaves the same on touch as on a mouse, and only ever writes a transform.
  const heroFigure = document.querySelector('.hero-image');
  const heroPhoto = heroFigure && heroFigure.querySelector('img');

  if (heroFigure && heroPhoto && !prefersReducedMotion.matches) {
    const maxShift = 30;
    let parallaxFrame = 0;

    const drawParallax = () => {
      parallaxFrame = 0;
      const rect = heroFigure.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;

      // -1 when the figure is just below the fold, +1 once it has fully passed.
      const travel = window.innerHeight + rect.height;
      const progress = ((window.innerHeight - rect.top) / travel) * 2 - 1;
      const shift = Math.max(-1, Math.min(1, progress)) * maxShift;
      heroPhoto.style.transform = `translate3d(0, ${shift.toFixed(2)}px, 0) scale(1.12)`;
    };

    const requestParallax = () => {
      if (!parallaxFrame) parallaxFrame = window.requestAnimationFrame(drawParallax);
    };

    drawParallax();
    window.addEventListener('scroll', requestParallax, { passive: true });
    window.addEventListener('resize', requestParallax);
  }

  // Faux 3D: the pointer is the camera. This only ever writes two numbers, and
  // the stylesheet decides how deep each layer sits off them — which keeps the
  // per-frame cost flat no matter how many layers the hero grows later.
  // Fine pointers only: there is nothing to track on touch, and the scroll
  // parallax above already gives that case its depth cue.
  const heroStage = document.querySelector('.hero');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  if (heroStage && finePointer.matches && !prefersReducedMotion.matches) {
    const clamp = (value) => Math.max(-1, Math.min(1, value));
    let tiltFrame = 0;
    let tiltX = 0;
    let tiltY = 0;

    const drawTilt = () => {
      tiltFrame = 0;
      heroStage.style.setProperty('--px', tiltX.toFixed(3));
      heroStage.style.setProperty('--py', tiltY.toFixed(3));
    };

    const requestTilt = () => {
      if (!tiltFrame) tiltFrame = window.requestAnimationFrame(drawTilt);
    };

    heroStage.addEventListener('pointermove', (event) => {
      const rect = heroStage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      // -1 at the left/top edge of the hero, +1 at the right/bottom.
      tiltX = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1);
      tiltY = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1);
      requestTilt();
    }, { passive: true });

    // Square up on the way out, so the hero is never left sitting skewed.
    heroStage.addEventListener('pointerleave', () => {
      tiltX = 0;
      tiltY = 0;
      requestTilt();
    });
  }

  // The wall: columns drift past each other on scroll, and each frame wipes in
  // as it arrives. Armed from JS so every photo stays visible without the script.
  const wall = document.querySelector('[data-wall]');

  if (wall && !prefersReducedMotion.matches) {
    const columns = [...wall.querySelectorAll('[data-wall-speed]')];
    const frames = [...wall.querySelectorAll('[data-wall-item]')];
    let wallFrame = 0;

    const drawWall = () => {
      wallFrame = 0;
      const rect = wall.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200) return;

      // 0 as the wall enters the viewport, 1 as it leaves.
      const progress = (window.innerHeight - rect.top) / (window.innerHeight + rect.height);
      columns.forEach((column) => {
        const speed = parseFloat(column.dataset.wallSpeed) || 0;
        column.style.setProperty('--wall-shift', `${(progress * speed * rect.height).toFixed(2)}px`);
      });
    };

    const requestWall = () => {
      if (!wallFrame) wallFrame = window.requestAnimationFrame(drawWall);
    };

    drawWall();
    window.addEventListener('scroll', requestWall, { passive: true });
    window.addEventListener('resize', requestWall);

    if ('IntersectionObserver' in window) {
      frames.forEach((frame) => frame.classList.add('is-armed'));

      const wallObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          // Stagger within whatever batch arrives together, so a column of
          // frames cascades instead of snapping in as one block.
          const delay = entries.indexOf(entry) * 90;
          window.setTimeout(() => entry.target.classList.add('is-revealed'), delay);
          observer.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.12 });

      frames.forEach((frame) => wallObserver.observe(frame));
    }
  }

  const cityRows = [...document.querySelectorAll('.city-row')];
  const preview = document.querySelector('.city-preview');
  const previewImage = document.getElementById('cityPreviewImage');
  const previewCode = document.getElementById('cityPreviewCode');
  const previewName = document.getElementById('cityPreviewName');
  let imageSwapTimer;

  const activateCity = (row) => {
    if (!row || !preview || !previewImage || !previewCode || !previewName) return;
    if (row.classList.contains('is-active')) return;

    cityRows.forEach((item) => item.classList.toggle('is-active', item === row));
    preview.classList.add('is-switching');
    window.clearTimeout(imageSwapTimer);

    imageSwapTimer = window.setTimeout(() => {
      previewImage.src = row.dataset.image;
      previewCode.textContent = row.dataset.code;
      previewName.textContent = row.dataset.city;
      previewImage.addEventListener('load', () => preview.classList.remove('is-switching'), { once: true });
      window.setTimeout(() => preview.classList.remove('is-switching'), 500);
    }, 140);
  };

  cityRows.forEach((row) => {
    row.addEventListener('mouseenter', () => activateCity(row));
    row.addEventListener('focus', () => activateCity(row));
  });

  const reel = document.getElementById('craftReel');
  // The pinned stage, not the section around it: the wall is several screens
  // tall, so a ratio threshold against the section itself could never be met.
  const reelSection = document.getElementById('craftStage');

  if (reel && reelSection) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // The clip is decoration, so it stays silent whatever the markup says.
    reel.muted = true;
    reel.addEventListener('volumechange', () => { reel.muted = true; });

    // It only loads and runs while it is on screen, so the page costs nothing
    // extra to anyone who never scrolls this far. Wherever it cannot play, the
    // poster stays as a still backdrop — it is scenery, so there is nothing to
    // hand controls for, and the frames on top read the same either way.
    if (!reducedMotion.matches && 'IntersectionObserver' in window) {
      const reelObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            reel.play().catch(() => {});
          } else {
            reel.pause();
          }
        });
      }, { threshold: 0.25 });

      reelObserver.observe(reelSection);
    }
  }

  const wordmark = document.querySelector('.identity-wordmark');

  if (wordmark) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const wordmarkImage = wordmark.querySelector('img');

    const startWordmark = () => {
      wordmark.classList.add('is-typing');
    };

    // Arming from JS keeps the mark fully visible if the script never runs.
    if (!reducedMotion.matches && wordmarkImage) {
      wordmark.classList.add('is-armed');

      if ('IntersectionObserver' in window) {
        const wordmarkObserver = new IntersectionObserver((entries, observer) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          startWordmark();
          observer.disconnect();
        }, { threshold: 0.4 });
        wordmarkObserver.observe(wordmark);
      } else {
        startWordmark();
      }
    }
  }

  const typewriterSection = document.querySelector('.typewriter-section');
  const typewriterWord = typewriterSection?.querySelector('.tw-word');

  if (typewriterSection && typewriterWord) {
    const words = (typewriterSection.dataset.words || 'location')
      .split('|')
      .map((word) => word.trim())
      .filter(Boolean);
    const wordLanguages = ['en', 'ta', 'hi', 'kn', 'bn', 'te'];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const segmenter = 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
    const characters = (word) => segmenter ? [...segmenter.segment(word)].map((part) => part.segment) : [...word];
    let wordIndex = 0;
    let characterIndex = 0;
    let erasing = false;
    let typingTimer = 0;
    let hasStarted = false;

    const typeNextCharacter = () => {
      if (reducedMotion.matches) {
        typewriterWord.textContent = words[0];
        return;
      }

      const wordCharacters = characters(words[wordIndex]);
      typewriterWord.lang = wordLanguages[wordIndex] || 'en';
      characterIndex += erasing ? -1 : 1;
      typewriterWord.textContent = wordCharacters.slice(0, characterIndex).join('');

      let delay = erasing ? 62 : 105;
      if (!erasing && characterIndex >= wordCharacters.length) {
        erasing = true;
        delay = 1450;
      } else if (erasing && characterIndex <= 0) {
        erasing = false;
        wordIndex = (wordIndex + 1) % words.length;
        delay = 420;
      }

      typingTimer = window.setTimeout(typeNextCharacter, delay);
    };

    const startTypewriter = () => {
      if (hasStarted) return;
      hasStarted = true;
      if (reducedMotion.matches) {
        typewriterWord.textContent = words[0];
        return;
      }
      typewriterWord.textContent = '';
      typewriterWord.lang = wordLanguages[0];
      typingTimer = window.setTimeout(typeNextCharacter, 480);
    };

    if ('IntersectionObserver' in window) {
      const typewriterObserver = new IntersectionObserver((entries, observer) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        startTypewriter();
        observer.disconnect();
      }, { threshold: 0.28 });
      typewriterObserver.observe(typewriterSection);
    } else {
      startTypewriter();
    }

    reducedMotion.addEventListener('change', () => {
      window.clearTimeout(typingTimer);
      if (reducedMotion.matches) typewriterWord.textContent = words[0];
      else {
        hasStarted = false;
        wordIndex = 0;
        characterIndex = 0;
        erasing = false;
        startTypewriter();
      }
    });
  }
})();
