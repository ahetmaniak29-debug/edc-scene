import { track, getScene, getAll, reset } from './counter.js';
import { icon, loadSite, renderChrome } from './chrome.js';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const params = new URLSearchParams(location.search);

const state = {
  config: null,
  scene: null,
  current: null,   // aktualnie otwarty produkt
  endpoint: ''
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

  state.endpoint = state.config.analytics?.endpoint || '';
  $('[data-foot-note]').textContent = state.config.site?.footerNote || '';

  // Która scena? ?scene=<id>, inaczej defaultScene, inaczej pierwsza z listy.
  const wanted = params.get('scene');
  const known = state.config.scenes || [];
  const sceneId = known.includes(wanted) ? wanted : (state.config.defaultScene || known[0]);

  if (!sceneId) return fail(new Error('Brak scen w data/scenes.json'));

  try {
    state.scene = await loadJSON(`data/scenes/${sceneId}.json`);
  } catch (err) {
    return fail(err);
  }

  if (params.get('stats') !== null) return renderStats();

  renderScene();
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

  lastFocus = document.activeElement;
  sheet.hidden = false;
  scrim.hidden = false;
  document.body.classList.add('is-locked');
  sheet.style.transform = '';
  void sheet.offsetHeight; // wymuszony reflow — bez tego przeglądarka scala oba stany w jeden i animacja nie rusza
  sheet.classList.add('is-open');
  scrim.classList.add('is-open');

  $('[data-stage-hint]')?.classList.add('is-hidden');
  $('[data-sheet-close]').focus({ preventScroll: true });

  if (!silent) {
    track({ sceneId: state.scene.id, productId: p.id, event: 'open', category: p.category, endpoint: state.endpoint });
  }
}

function closeSheet() {
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

// Kliknięcie do sprzedawcy — najważniejszy sygnał, jaki mierzymy.
$('[data-sheet-link]').addEventListener('click', () => {
  const p = state.current;
  if (!p) return;
  track({ sceneId: state.scene.id, productId: p.id, event: 'outbound', category: p.category, endpoint: state.endpoint });
});

/* ---- przeciąganie panelu w dół (telefon) ---- */
(() => {
  let startY = 0, dy = 0, dragging = false;
  const grip = $('[data-sheet-grip]');

  const start = e => {
    if (window.innerWidth >= 860) return;
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

function renderStats() {
  $('#tresc').hidden = true;
  $('.ftr').hidden = true;

  const box = $('[data-stats]');
  const counts = getScene(state.scene.id);
  const products = state.scene.products || [];

  const rows = products
    .map(p => ({ p, open: counts[p.id]?.open || 0, out: counts[p.id]?.outbound || 0 }))
    .sort((a, b) => (b.open + b.out * 3) - (a.open + a.out * 3));

  const max = Math.max(1, ...rows.map(r => r.open));
  const totalOpen = rows.reduce((s, r) => s + r.open, 0);
  const totalOut  = rows.reduce((s, r) => s + r.out, 0);

  box.hidden = false;
  box.innerHTML = `
    <h2>Statystyki — ${escapeHTML(state.scene.label || state.scene.id)}</h2>
    <p>
      Otwarcia panelu: <strong>${totalOpen}</strong> · przejścia do sprzedawcy: <strong>${totalOut}</strong>.
      ${state.endpoint
        ? 'Zdalne zbieranie danych jest włączone — pełne liczby znajdziesz w swoim narzędziu.'
        : 'Uwaga: to liczby <strong>tylko z tej przeglądarki</strong>. Żeby zbierać dane od wszystkich odwiedzających, ustaw <code>analytics.endpoint</code> w <code>data/scenes.json</code>.'}
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
      <button type="button" data-reset>Wyczyść liczniki</button>
    </div>`;

  $('[data-copy]', box).addEventListener('click', async e => {
    await navigator.clipboard.writeText(JSON.stringify(getAll(), null, 2));
    e.target.textContent = 'Skopiowano ✓';
  });
  $('[data-reset]', box).addEventListener('click', () => {
    if (confirm('Wyczyścić liczniki w tej przeglądarce?')) { reset(); location.reload(); }
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
