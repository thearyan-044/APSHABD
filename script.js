/* ===== PIN DROP SILENCE — HOME JS (dark-only) ===== */

// ─── CUSTOM CURSOR ───────────────────────────────────────────────────────────
const cursor = document.getElementById('cursor');
const aura   = document.getElementById('cursor-aura');
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

document.querySelectorAll('a, button, .city-row').forEach(el => {
  el.addEventListener('mouseenter', () => cursor.classList.add('big'));
  el.addEventListener('mouseleave', () => cursor.classList.remove('big'));
});

// ─── NAV ACTIVE LINK ON SCROLL ───────────────────────────────────────────────
const sections = [
  { id: 'story',    link: document.querySelector('.nav-link[href="#story"]')    },
  { id: 'cities',   link: document.querySelector('.nav-link[href="#cities"]')   },
  { id: 'waitlist', link: document.querySelector('.nav-link[href="#waitlist"]') },
];
const navObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    const found = sections.find(s => s.id === entry.target.id);
    if (!found || !found.link) return;
    if (entry.isIntersecting) {
      sections.forEach(s => s.link && s.link.classList.remove('active'));
      found.link.classList.add('active');
    }
  });
}, { threshold: 0.35 });

sections.forEach(s => {
  const el = document.getElementById(s.id);
  if (el) navObserver.observe(el);
});

// ─── MAGNETIC BUTTON ─────────────────────────────────────────────────────────
document.querySelectorAll('.btn').forEach(btn => {
  btn.addEventListener('mousemove', e => {
    const r  = btn.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width  / 2);
    const dy = e.clientY - (r.top  + r.height / 2);
    btn.style.transform = `translate(${dx * 0.18}px, ${dy * 0.18}px)`;
  });
  btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
});

// ─── LETTER SCRAMBLE (hero title) ────────────────────────────────────────────
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#✦$%';
function scramble(el) {
  const original = el.textContent.trim();
  let frame = 0;
  const total = 20;
  const id = setInterval(() => {
    el.textContent = original.split('').map((ch, i) => {
      if (ch === ' ') return ' ';
      if (frame / total > i / original.length) return ch;
      return CHARS[Math.floor(Math.random() * CHARS.length)];
    }).join('');
    if (++frame > total) { el.textContent = original; clearInterval(id); }
  }, 40);
}

window.addEventListener('load', () => {
  setTimeout(() => {
    document.querySelectorAll('.hero-title .line').forEach((span, i) => {
      setTimeout(() => scramble(span), i * 150);
    });
  }, 300);
});

// ─── STICKER PARALLAX ────────────────────────────────────────────────────────
const sticker = document.getElementById('heroSticker');
if (sticker) {
  document.addEventListener('mousemove', e => {
    const dx = (e.clientX / window.innerWidth  - .5) * -20;
    const dy = (e.clientY / window.innerHeight - .5) * -14;
    sticker.style.transform = `rotate(-15deg) translate(${dx}px,${dy}px)`;
  });
}

// ─── CITY ROW NUMBER TICKER ───────────────────────────────────────────────────
document.querySelectorAll('.city-row').forEach(row => {
  const numEl  = row.querySelector('.city-num');
  if (!numEl) return;
  const target = parseInt(numEl.textContent, 10);
  let anim = null;
  row.addEventListener('mouseenter', () => {
    clearInterval(anim); let n = 0;
    anim = setInterval(() => {
      numEl.textContent = String(n).padStart(2, '0');
      if (n++ >= target) { numEl.textContent = String(target).padStart(2, '0'); clearInterval(anim); }
    }, 38);
  });
  row.addEventListener('mouseleave', () => {
    clearInterval(anim);
    numEl.textContent = String(target).padStart(2, '0');
  });
});

// ─── SCROLL REVEAL ───────────────────────────────────────────────────────────
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      entry.target.style.transitionDelay = `${(i % 4) * 80}ms`;
      entry.target.classList.add('in');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// ─── WAITLIST ────────────────────────────────────────────────────────────────
const notifyBtn  = document.getElementById('notifyBtn');
const waitNote   = document.getElementById('waitNote');
const emailInput = document.getElementById('emailInput');

if (notifyBtn) {
  notifyBtn.addEventListener('click', () => {
    const val = emailInput.value.trim();
    if (!val || !val.includes('@')) {
      waitNote.textContent = 'Drop a real email — we only speak once.';
      waitNote.style.color = '#e05555';
      return;
    }
    waitNote.textContent = "Heard. You'll know before the city does.";
    waitNote.style.color = '#f5b301';
    emailInput.value = '';
    notifyBtn.style.transform = 'scale(.94)';
    setTimeout(() => notifyBtn.style.transform = '', 200);
  });
}