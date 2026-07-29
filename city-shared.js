/* ===== PDS — SHARED CITY JS ===== */

// ─── CUSTOM CURSOR ───────────────────────────────────────────────────────────
const cursor = document.getElementById('cursor');
const aura   = document.getElementById('cursor-aura');
if (cursor && aura) {
  let mx = 0, my = 0, ax = 0, ay = 0;
  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    cursor.style.left = mx + 'px';
    cursor.style.top  = my + 'px';
  });
  (function lerpAura() {
    ax += (mx - ax) * 0.10;
    ay += (my - ay) * 0.10;
    aura.style.left = ax + 'px';
    aura.style.top  = ay + 'px';
    requestAnimationFrame(lerpAura);
  })();
  document.querySelectorAll('a, button, .card, .cta').forEach(el => {
    el.addEventListener('mouseenter', () => cursor.classList.add('big'));
    el.addEventListener('mouseleave', () => cursor.classList.remove('big'));
  });
}

// ─── BG WORD PARALLAX ────────────────────────────────────────────────────────
const bgWord = document.querySelector('.bg-word');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (bgWord && !reduceMotion) {
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const y = window.scrollY;
        bgWord.style.transform = `translate(-50%, calc(-50% + ${y * 0.14}px)) rotate(${y * 0.005}deg)`;
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
  // Mouse drift
  document.addEventListener('mousemove', e => {
    const dx = (e.clientX / window.innerWidth  - .5) * -30;
    const dy = (e.clientY / window.innerHeight - .5) * -20;
    bgWord.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
}

// ─── LETTER SCRAMBLE ─────────────────────────────────────────────────────────
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#✦$%&?';
function scramble(el) {
  const original = el.dataset.text || el.textContent.trim();
  el.dataset.text = original;
  let frame = 0;
  const totalFrames = 22;
  const id = setInterval(() => {
    el.textContent = original.split('').map((ch, i) => {
      if (ch === ' ') return ' ';
      if (frame / totalFrames > i / original.length) return ch;
      return CHARS[Math.floor(Math.random() * CHARS.length)];
    }).join('');
    if (++frame > totalFrames) { el.textContent = original; clearInterval(id); }
  }, 38);
}

window.addEventListener('load', () => {
  setTimeout(() => {
    document.querySelectorAll('.hero-title span').forEach((span, i) => {
      setTimeout(() => scramble(span), i * 180);
    });
  }, 250);
});

// ─── 3D CARD TILT ────────────────────────────────────────────────────────────
document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const rect  = card.getBoundingClientRect();
    const cx    = rect.left + rect.width  / 2;
    const cy    = rect.top  + rect.height / 2;
    const rotX  = ((e.clientY - cy) / (rect.height / 2)) * -10;
    const rotY  = ((e.clientX - cx) / (rect.width  / 2)) *  10;
    card.style.transform    = `perspective(700px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-6px) scale(1.02)`;
    card.style.boxShadow    = `${-rotY}px ${rotX + 18}px 36px rgba(0,0,0,.28)`;
    card.style.transition   = 'box-shadow .15s, transform .08s';
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform  = '';
    card.style.boxShadow  = '';
    card.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1), box-shadow .6s';
  });
});

// ─── MAGNETIC CTA ────────────────────────────────────────────────────────────
document.querySelectorAll('.cta').forEach(el => {
  el.addEventListener('mousemove', e => {
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width  / 2);
    const dy = e.clientY - (rect.top  + rect.height / 2);
    el.style.transform = `translate(${dx * 0.2}px, ${dy * 0.2 - 3}px)`;
  });
  el.addEventListener('mouseleave', () => { el.style.transform = ''; });
});

// ─── MARQUEE PAUSE ───────────────────────────────────────────────────────────
document.querySelectorAll('.marquee-track, .marquee-track.rev').forEach(t => {
  t.parentElement.addEventListener('mouseenter', () => t.style.animationPlayState = 'paused');
  t.parentElement.addEventListener('mouseleave', () => t.style.animationPlayState = '');
});

// ─── SCROLL REVEAL ───────────────────────────────────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      entry.target.style.transitionDelay = `${(i % 4) * 90}ms`;
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
