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

  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('in'));
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

  const form = document.getElementById('waitForm');
  const emailInput = document.getElementById('emailInput');
  const note = document.getElementById('waitNote');

  if (form && emailInput && note) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = emailInput.value.trim();
      const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      if (!isValid) {
        note.textContent = 'Enter a valid email so we know where to find you.';
        note.classList.add('is-error');
        emailInput.setAttribute('aria-invalid', 'true');
        emailInput.focus();
        return;
      }

      note.textContent = "You're on the list. We'll speak when the drop is ready.";
      note.classList.remove('is-error');
      emailInput.removeAttribute('aria-invalid');
      form.reset();
    });
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
