import { track, getScene, getAll, reset, fetchSummary } from './counter.js?v=6';
import { icon, media, loadSite, renderChrome } from './chrome.js?v=6';
import { initDb, dbGotowa, select } from './db.js?v=6';
import { zBazy, formatujCene } from './mapowanie.js?v=6';

/** Od tej szerokości panel wjeżdża w kadr zdjęcia zamiast wysuwać się z dołu. */
const SZEROKI = 900;
const naSzerokim = () => window.innerWidth >= SZEROKI;

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const params = new URLSearchParams(location.search);

const state = {
  config: null,
  scene: null,
  current: null,   // aktualnie otwarty produkt
  analytics: null,
  supabase: null
};

/* ------------------------------------------------------------------ *
 * Wczytanie danych
 * ------------------------------------------------------------------ */

async function loadJSON(path) {
  const res = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

async function boot() {
  // Wspólna oprawa (nagłówek, menu, stopka) — ta sama co na stronie głównej.
  try {
    const site = await loadSite();
    renderChrome(site, 'scena.html');
    renderTrust(site.trust || []);
  } catch (err) {
    console.error(err);   // brak oprawy nie może zablokować samej sceny
  }

  try {
    state.config = await loadJSON('data/scenes.json');
  } catch (err) {
    return fail(err);
  }

  state.analytics = state.config.analytics || null;
  state.supabase = state.config.supabase || null;
  $('[data-foot-note]').textContent = state.config.site?.footerNote || '';

  const wanted = params.get('scene');

  // Źródłem prawdy jest baza. Pliki JSON zostają jako koło ratunkowe —
  // gdy baza nie odpowie, strona pokaże ostatnią wersję z repozytorium
  // zamiast pustego miejsca.
  state.scene = await zBazyDanych(wanted);

  if (!state.scene) {
    const known = state.config.scenes || [];
    const sceneId = known.includes(wanted) ? wanted : (state.config.defaultScene || known[0]);
    if (!sceneId) return fail(new Error('Brak scen w bazie i w data/scenes.json'));
    try {
      state.scene = await loadJSON(`data/scenes/${sceneId}.json`);
      console.warn('Baza nie odpowiedziała — scena wczytana z pliku w repozytorium.');
    } catch (err) {
      return fail(err);
    }
  }

  if (params.get('stats') !== null) return renderStats();

  renderScene();
}

/** Zwraca scenę z bazy albo null, gdy się nie udało. */
async function zBazyDanych(wanted) {
  try {
    await initDb();
    if (!dbGotowa()) return null;

    // Bez ?scene= bierzemy pierwszą opublikowaną scenę wg kolejności.
    const filtr = wanted
      ? `id=eq.${encodeURIComponent(wanted)}`
      : 'order=position.asc&limit=1';

    const sceny = await select('scenes', `select=*&${filtr}`);
    const scena = sceny?.[0];
    if (!scena) return null;

    const [produkty, zdjecia] = await Promise.all([
      select('products', `select=*&scene_id=eq.${encodeURIComponent(scena.id)}&order=position.asc`),
      select('scene_images', `select=*&scene_id=eq.${encodeURIComponent(scena.id)}&order=position.asc`)
    ]);

    return zBazy(scena, produkty || [], zdjecia || []);
  } catch (err) {
    console.warn('Nie udało się wczytać sceny z bazy:', err.message);
    return null;
  }
}

function fail(err) {
  const box = $('[data-stage-loading]');
  const local = location.protocol === 'file:';
  box.innerHTML = local
    ? 'Otwórz stronę przez lokalny serwer, nie klikając w plik.<br><br>W folderze projektu uruchom:<br><code>npx serve .</code>'
    : `Nie udało się wczytać danych.<br><small>${escapeHTML(err.message)}</small>`;
  console.error(err);
}

/* ------------------------------------------------------------------ *
 * Scena
 * ------------------------------------------------------------------ */

function renderTrust(items) {
  const box = $('[data-trust]');
  if (!box) return;
  box.innerHTML = items.map(t => `
    <li>
      <span class="trust__ico">${icon(t.icon)}</span>
      <span>
        <span class="trust__t">${escapeHTML(t.title)}</span>
        <span class="trust__s">${escapeHTML(t.text)}</span>
      </span>
    </li>`).join('');
}

function renderScene() {
  const s = state.scene;

  $('[data-scene-title]').textContent = s.title || '';
  $('[data-scene-subtitle]').textContent = s.subtitle || '';
  document.title = s.label ? `${s.label} — ${document.title}` : document.title;

  // Etykieta kategorii bierze się z danych — nigdzie nie jest zaszyta w kodzie.
  const label = s.label || s.products?.[0]?.category || '';
  const chip = $('[data-scene-label]');
  if (label) { chip.textContent = label; chip.hidden = false; }
  $('[data-crumb]').textContent = label;

  const img = $('[data-scene-img]');
  img.alt = s.imageAlt || '';
  img.addEventListener('load', () => {
    $('[data-stage-loading]').hidden = true;
    $('[data-stage-hint]').hidden = false;
  }, { once: true });
  img.addEventListener('error', () => fail(new Error(`Nie znaleziono pliku: ${s.image}`)), { once: true });
  img.src = s.image;

  renderHotspots(s.products || []);
  renderList(s.products || []);
  renderGallery(s.gallery || []);
  initFold();

  if (params.get('pick') !== null) enablePicker();

  // Deep link: #id-produktu otwiera panel od razu (przydatne do wysyłania linków)
  const fromHash = (s.products || []).find(p => p.id === location.hash.slice(1));
  if (fromHash) openProduct(fromHash, { silent: true });
}

function renderHotspots(products) {
  const wrap = $('[data-hotspots]');
  wrap.innerHTML = '';

  products.forEach((p, i) => {
    const hs = p.hotspot || { x: 50, y: 50 };
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hotspot';
    btn.style.left = `${hs.x}%`;
    btn.style.top = `${hs.y}%`;
    btn.dataset.id = p.id;
    btn.setAttribute('aria-label', `${p.name}${p.brand ? `, ${p.brand}` : ''} — pokaż szczegóły`);
    // Numer wiąże punkt na zdjęciu z pozycją na liście pod spodem.
    btn.innerHTML = `
      <span class="hotspot__label">${escapeHTML(p.name)}</span>
      <span class="hotspot__dot" aria-hidden="true">${i + 1}</span>`;
    btn.addEventListener('click', () => openProduct(p));
    wrap.appendChild(btn);
  });
}

function renderList(products) {
  const ul = $('[data-product-list]');
  ul.innerHTML = '';

  products.forEach((p, i) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'list__btn';
    btn.dataset.id = p.id;
    btn.innerHTML = `
      <span class="list__idx">${String(i + 1).padStart(2, '0')}</span>
      <span class="list__text">
        <span class="list__name">${escapeHTML(p.name)}</span>
        <span class="list__brand">${escapeHTML(p.brand || '')}</span>
      </span>
      <span class="list__price">${escapeHTML(p.price || '')}</span>`;
    btn.addEventListener('click', () => openProduct(p));
    li.appendChild(btn);
    ul.appendChild(li);
  });

  const count = $('[data-list-count]');
  if (count) count.textContent = products.length;
}

/* ------------------------------------------------------------------ *
 * Płynne zwijanie listy
 *
 * <details> przełącza się skokowo — przeglądarka po prostu pokazuje albo
 * chowa treść. Żeby to płynęło, przejmujemy kliknięcie i sami animujemy
 * wysokość, a stan `open` ustawiamy dopiero na końcu animacji.
 * ------------------------------------------------------------------ */

function initFold() {
  const details = $('.fold');
  if (!details) return;

  const head = $('.fold__head', details);
  const body = $('.fold__body', details);
  if (!head || !body) return;

  // Kto prosił o mniej ruchu, dostaje natywne, natychmiastowe przełączanie.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!body.animate) return;   // stara przeglądarka — zostaje zachowanie natywne

  let anim = null;
  let closing = false;         // trwa animacja zamykania

  head.addEventListener('click', e => {
    e.preventDefault();

    // W trakcie zamykania `details.open` jest jeszcze true, więc sam stan
    // elementu nie wystarczy do ustalenia, co ma się stać po kliknięciu.
    const opening = closing || !details.open;

    if (anim) anim.cancel();
    if (opening) details.open = true;
    closing = !opening;

    const h = body.scrollHeight;
    anim = body.animate(
      {
        height:  opening ? ['0px', `${h}px`] : [`${h}px`, '0px'],
        opacity: opening ? [0, 1] : [1, 0]
      },
      { duration: 320, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' }
    );

    anim.onfinish = () => {
      details.open = opening;
      closing = false;
      anim = null;
    };
    anim.oncancel = () => { anim = null; };
  });
}

/* ------------------------------------------------------------------ *
 * Mniejsza karuzela pod zdjęciem
 * ------------------------------------------------------------------ */

function renderGallery(slides) {
  const box = $('[data-gallery]');
  if (!slides.length) return;          // brak slajdów = sekcja się nie pokazuje

  box.hidden = false;
  $('[data-gal-track]').innerHTML = slides.map((g, i) => `
    <article class="gslide" role="group" aria-roledescription="slide" aria-label="Zdjęcie ${i + 1} z ${slides.length}">
      <div class="gslide__media">${media(g.image, g.title, 'kolekcje', '1200 × 900 px')}</div>
      <div class="gslide__body">
        <h3 class="gslide__title">${escapeHTML(g.title)}</h3>
        <p class="gslide__text">${escapeHTML(g.text)}</p>
      </div>
    </article>`).join('');

  const dots = $('[data-gal-dots]');
  dots.innerHTML = slides.map((_, i) =>
    `<button type="button" role="tab" aria-label="Zdjęcie ${i + 1}" aria-selected="${i === 0}"></button>`).join('');

  // Jeden slajd nie potrzebuje sterowania.
  const single = slides.length < 2;
  $('[data-gal-prev]').hidden = single;
  $('[data-gal-next]').hidden = single;
  dots.hidden = single;
  if (single) return;

  const track = $('[data-gal-track]');
  let at = 0;
  const go = i => {
    at = (i + slides.length) % slides.length;
    track.style.transform = `translateX(-${at * 100}%)`;
    [...dots.children].forEach((d, k) => d.setAttribute('aria-selected', String(k === at)));
  };

  $('[data-gal-prev]').addEventListener('click', () => go(at - 1));
  $('[data-gal-next]').addEventListener('click', () => go(at + 1));
  [...dots.children].forEach((d, i) => d.addEventListener('click', () => go(i)));

  // Przesuwanie palcem — bez auto-przewijania, żeby nie odciągało od sceny.
  let x0 = null;
  const frame = $('.gal__frame');
  frame.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  frame.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) go(at + (dx < 0 ? 1 : -1));
    x0 = null;
  });
}

/* ------------------------------------------------------------------ *
 * Panel produktu
 * ------------------------------------------------------------------ */

const sheet  = $('[data-sheet]');
const scrim  = $('[data-scrim]');
let lastFocus = null;

function openProduct(p, { silent = false } = {}) {
  state.current = p;

  $('[data-sheet-brand]').textContent = p.brand || '';
  $('[data-sheet-name]').textContent  = p.name || '';
  $('[data-sheet-price]').textContent = p.price || '';
  $('[data-sheet-why]').textContent   = p.why || '';

  const specs = $('[data-sheet-specs]');
  specs.innerHTML = '';
  if (Array.isArray(p.specs) && p.specs.length) {
    p.specs.forEach(({ k, v }) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="k">${escapeHTML(k)}</span><span class="v">${escapeHTML(v)}</span>`;
      specs.appendChild(li);
    });
    specs.hidden = false;
  } else {
    specs.hidden = true;
  }

  const link = $('[data-sheet-link]');
  link.href = p.url || '#';
  $('[data-sheet-cta]').textContent = p.ctaLabel || 'Zobacz u sprzedawcy';

  // Pokazujemy domenę sprzedawcy — widać, dokąd prowadzi przycisk, zanim się w niego kliknie.
  const note = state.config.site?.outboundNote || '';
  $('[data-sheet-note]').textContent = [note, hostOf(p.url)].filter(Boolean).join(' · ');

  markActive(p.id);

  // Panel ucieka na stronę przeciwną do klikniętego punktu, żeby go nie zasłonić.
  const hx = p.hotspot?.x ?? 50;
  sheet.classList.toggle('glass--left', hx > 55);

  lastFocus = document.activeElement;
  sheet.hidden = false;
  scrim.hidden = false;
  // Blokada przewijania ma sens tylko przy panelu wysuwanym z dołu ekranu.
  document.body.classList.toggle('is-locked', !naSzerokim());
  sheet.style.transform = '';
  void sheet.offsetHeight; // wymuszony reflow — bez tego przeglądarka scala oba stany w jeden i animacja nie rusza
  sheet.classList.add('is-open');
  scrim.classList.add('is-open');

  $('[data-stage-hint]')?.classList.add('is-hidden');
  $('[data-sheet-close]').focus({ preventScroll: true });

  if (!silent) {
    track({ sceneId: state.scene.id, productId: p.id, event: 'open', category: p.category, analytics: state.analytics, supabase: state.supabase });
  }
}

function closeSheet() {
  if (sheet.hidden) return;
  sheet.classList.remove('is-open');
  scrim.classList.remove('is-open');
  document.body.classList.remove('is-locked');
  markActive(null);
  state.current = null;

  const done = () => { sheet.hidden = true; scrim.hidden = true; sheet.style.transform = ''; };
  sheet.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 420); // zabezpieczenie, gdyby transitionend nie przyszedł

  lastFocus?.focus?.({ preventScroll: true });
}

function markActive(id) {
  $$('.hotspot, .list__btn').forEach(el => el.classList.toggle('is-active', !!id && el.dataset.id === id));
}

$('[data-sheet-close]').addEventListener('click', closeSheet);
scrim.addEventListener('click', closeSheet);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !sheet.hidden) closeSheet();
});

// Kliknięcie gdziekolwiek poza panelem go zamyka.
// Wyjątkiem są punkty i pozycje listy — one mają przełączać produkt, nie zamykać.
document.addEventListener('click', e => {
  if (sheet.hidden || !sheet.classList.contains('is-open')) return;
  if (e.target.closest('[data-sheet]')) return;
  if (e.target.closest('.hotspot, .list__btn')) return;
  closeSheet();
});

// Kliknięcie do sprzedawcy — najważniejszy sygnał, jaki mierzymy.
$('[data-sheet-link]').addEventListener('click', () => {
  const p = state.current;
  if (!p) return;
  track({ sceneId: state.scene.id, productId: p.id, event: 'outbound', category: p.category, analytics: state.analytics, supabase: state.supabase });
});

/* ---- przeciąganie panelu w dół (telefon) ---- */
(() => {
  let startY = 0, dy = 0, dragging = false;
  const grip = $('[data-sheet-grip]');

  const start = e => {
    if (naSzerokim()) return;   // w kadrze zdjęcia nie ma czego ściągać w dół
    dragging = true; dy = 0;
    startY = (e.touches ? e.touches[0].clientY : e.clientY);
    sheet.classList.add('is-dragging');
  };
  const move = e => {
    if (!dragging) return;
    const y = (e.touches ? e.touches[0].clientY : e.clientY);
    dy = Math.max(0, y - startY);
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('is-dragging');
    if (dy > 110) { sheet.style.transform = ''; closeSheet(); }
    else sheet.style.transform = '';
  };

  grip.addEventListener('touchstart', start, { passive: true });
  grip.addEventListener('touchmove', move, { passive: true });
  grip.addEventListener('touchend', end);
  grip.addEventListener('mousedown', start);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
})();

/* ------------------------------------------------------------------ *
 * Statystyki (?stats=1)
 * ------------------------------------------------------------------ */

async function renderStats() {
  $('#tresc').hidden = true;
  $('.ftr').hidden = true;

  const box = $('[data-stats]');
  const products = state.scene.products || [];

  // Najpierw próbujemy prawdziwych, zsumowanych danych z bazy. Widok jest
  // domyślnie zamknięty na zewnątrz, więc zwykle wracamy do liczb lokalnych.
  const zdalne = await fetchSummary(state.scene.id, state.analytics, state.supabase);
  const zBazy = Boolean(zdalne);

  let rows;
  if (zBazy) {
    const wg = Object.fromEntries(zdalne.map(r => [r.product, r]));
    rows = products.map(p => ({
      p,
      open: Number(wg[p.id]?.otwarcia) || 0,
      out:  Number(wg[p.id]?.do_sklepu) || 0
    }));
  } else {
    const counts = getScene(state.scene.id);
    rows = products.map(p => ({
      p,
      open: counts[p.id]?.open || 0,
      out:  counts[p.id]?.outbound || 0
    }));
  }

  rows.sort((a, b) => (b.open + b.out * 3) - (a.open + a.out * 3));

  const max = Math.max(1, ...rows.map(r => r.open));
  const totalOpen = rows.reduce((s, r) => s + r.open, 0);
  const totalOut  = rows.reduce((s, r) => s + r.out, 0);

  const podlaczone = Boolean(state.supabase?.url && state.supabase?.anonKey);

  box.hidden = false;
  box.innerHTML = `
    <h2>Statystyki — ${escapeHTML(state.scene.label || state.scene.id)}</h2>
    <p>
      Otwarcia panelu: <strong>${totalOpen}</strong> · przejścia do sprzedawcy: <strong>${totalOut}</strong>.
      ${zBazy
        ? 'Liczby <strong>od wszystkich odwiedzających</strong>, prosto z bazy.'
        : podlaczone
          ? 'Kliknięcia <strong>trafiają do bazy</strong>, ale ta strona nie ma prawa ich odczytać — poniżej widzisz liczby <strong>tylko z tej przeglądarki</strong>. Pełne dane znajdziesz w Supabase → SQL Editor: <code>select * from events_summary;</code>'
          : 'Uwaga: to liczby <strong>tylko z tej przeglądarki</strong>. Podłącz Supabase w <code>data/scenes.json</code>, żeby zbierać dane od wszystkich odwiedzających.'}
    </p>
    <table>
      <thead>
        <tr><th>Produkt</th><th></th><th class="num">Otwarcia</th><th class="num">Do sklepu</th></tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${escapeHTML(r.p.name)}<br><small style="color:var(--ink-dim)">${escapeHTML(r.p.brand || '')}</small></td>
            <td style="width:34%"><div class="bar" style="width:${Math.round((r.open / max) * 100)}%"></div></td>
            <td class="num">${r.open}</td>
            <td class="num">${r.out}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div class="stats__actions">
      <a href="${location.pathname}">← Wróć do sceny</a>
      <button type="button" data-copy>Skopiuj dane (JSON)</button>
      ${zBazy ? '' : '<button type="button" data-reset>Wyczyść liczniki tej przeglądarki</button>'}
    </div>`;

  $('[data-copy]', box).addEventListener('click', async e => {
    await navigator.clipboard.writeText(JSON.stringify(zBazy ? zdalne : getAll(), null, 2));
    e.target.textContent = 'Skopiowano ✓';
  });
  $('[data-reset]', box)?.addEventListener('click', () => {
    if (confirm('Wyczyścić liczniki w tej przeglądarce? Dane w bazie zostaną nietknięte.')) {
      reset();
      location.reload();
    }
  });
}

/* ------------------------------------------------------------------ *
 * Tryb ustawiania punktów (?pick=1)
 * Klikasz w przedmiot na zdjęciu → dostajesz gotowe współrzędne do JSON-a.
 * ------------------------------------------------------------------ */

function enablePicker() {
  document.body.classList.add('is-picking');

  const bar = document.createElement('div');
  bar.className = 'pickbar';
  bar.innerHTML = 'Tryb ustawiania punktów — kliknij przedmiot na zdjęciu.';
  document.body.appendChild(bar);

  $('[data-stage]').addEventListener('click', e => {
    const img = $('[data-scene-img]');
    const r = img.getBoundingClientRect();
    const x = +(((e.clientX - r.left) / r.width) * 100).toFixed(1);
    const y = +(((e.clientY - r.top) / r.height) * 100).toFixed(1);
    const snippet = `"hotspot": { "x": ${x}, "y": ${y} }`;
    bar.innerHTML = `Skopiowano do schowka:<br><code>${snippet}</code>`;
    navigator.clipboard?.writeText(snippet).catch(() => {});
  });
}

/* ------------------------------------------------------------------ */

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

boot();
