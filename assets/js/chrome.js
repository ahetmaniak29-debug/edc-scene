/**
 * Wspólna oprawa stron: nagłówek, menu mobilne, stopka.
 * Używają tego i strona główna, i strony kategorii — dzięki temu nie da się
 * zmienić menu na jednej stronie i zapomnieć o drugiej.
 *
 * Treść bierze się z data/home.json.
 */

export const ICONS = {
  chevron: '<path d="M6 9l6 6 6-6"/>',
  arrow:   '<path d="M5 12h14M13 6l6 6-6 6"/>',
  truck:   '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  return:  '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v5h5"/>',
  shield:  '<path d="M12 3l7 3v6c0 4.4-3 8-7 9-4-1-7-4.6-7-9V6z"/><path d="M9.5 12l1.8 1.8L15 10"/>',
  help:    '<path d="M4 13a8 8 0 0 1 16 0"/><path d="M4 13v3a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2zM20 13v3a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2z"/>',
  star:    '<path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8z"/>',
  tag:     '<path d="M4 4h7l9 9-7 7-9-9z"/><circle cx="8.5" cy="8.5" r="1.4"/>',
  trend:   '<path d="M4 17l5-5 3.5 3.5L20 8"/><path d="M15 8h5v5"/>',
  people:  '<circle cx="9" cy="9" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 7.2A3.2 3.2 0 0 1 16 13M17.5 20c0-2.4-1-4.5-2.6-5.6"/>',
  image:   '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6"/><path d="M21 16l-5-5-6 6"/>',
  heart:   '<path d="M12 20s-8-4.9-8-10a4.6 4.6 0 018-3 4.6 4.6 0 018 3c0 5.1-8 10-8 10z"/>'
};

export const icon = (name, cls = '') =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${ICONS[name] || ''}</svg>`;

export const esc = str => String(str ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Ramka zastępcza pod zdjęcie — mówi wprost, jaki plik gdzie wrzucić.
 * variant: '' pełna | 'sm' ciasna | 'bare' sama ikonka
 */
export const ph = (folder, size, variant = '') => `
  <div class="ph${variant ? ` ph--${variant}` : ''}">
    <div class="ph__inner">
      ${icon('image', 'ph__icon')}
      <div class="ph__path">ZDJECIA/${folder}/</div>
      <div class="ph__size">${size}</div>
    </div>
  </div>`;

/** Zdjęcie albo ramka zastępcza — zależnie od tego, czy w JSON jest ścieżka. */
export const media = (src, alt, folder, size, variant = '') =>
  src ? `<img class="img" src="${esc(src)}" alt="${esc(alt || '')}" loading="lazy">` : ph(folder, size, variant);

import { naZmiane, pobierz, ustawIlosc, ile as ileWKoszyku, suma } from './koszyk.js?v=36';
import { initDb, dbGotowa, select } from './db.js?v=36';
import { formatujCene } from './mapowanie.js?v=36';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Wspólna konfiguracja strony.
 *
 * Źródłem prawdy jest tabela `site` (klucz 'home') — dzięki temu treść
 * zmienia się w panelu, a nie przez commit. Plik data/home.json zostaje
 * jako koło ratunkowe, gdy baza nie odpowie albo nie ma jeszcze wiersza.
 */
export async function loadSite() {
  try {
    await initDb();
    if (dbGotowa()) {
      const wiersze = await select('site', 'select=value&key=eq.home');
      const zBazy = wiersze?.[0]?.value;
      if (zBazy && Object.keys(zBazy).length) return zBazy;
    }
  } catch (err) {
    console.warn('Ustawienia strony z bazy niedostepne:', err.message);
  }

  const res = await fetch(`data/home.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`data/home.json → HTTP ${res.status}`);
  return res.json();
}

/** Opublikowane sceny — sluza za kategorie na stronie glownej. */
export async function loadScenes() {
  try {
    await initDb();
    if (!dbGotowa()) return [];
    const sceny = await select('scenes', 'select=*&order=position.asc') || [];
    // Kadry kolekcji (sceny z rodzicem) nie są osobnymi kategoriami —
    // wchodzi się w nie ze zdjęcia wnętrza, a nie z menu.
    return sceny.filter(s => !s.parent_id);
  } catch (err) {
    console.warn('Nie udalo sie wczytac kategorii:', err.message);
    return [];
  }
}

/**
 * Wypełnia nagłówek, menu mobilne i stopkę.
 * @param {object} data zawartość data/home.json
 * @param {string} [activePath] adres bieżącej strony, żeby podświetlić pozycję menu
 */
export async function renderChrome(data, activePath = '', sceny = null) {
  // Menu potrafi rozwinąć listę kategorii, więc potrzebuje scen.
  // Strona główna ma je już wczytane i podaje z zewnątrz; pozostałe
  // strony pobierają je tutaj.
  const kategorie = (sceny || await loadScenes()).filter(s => s.published);

  header(data, activePath, kategorie);
  footer(data);
  mobileNav(data, activePath, kategorie);
  koszyk();
}

function header(data, activePath, kategorie) {
  const brand = $('[data-brand]');
  if (brand) brand.textContent = data.brand || '';

  const search = $('[data-search]');
  if (search) search.placeholder = data.searchPlaceholder || '';

  const nav = $('[data-nav]');
  if (!nav) return;

  nav.innerHTML = (data.nav || []).map((n, i) => {
    // Pozycja oznaczona jako 'kategorie' sama zaciąga listę scen —
    // dodanie kategorii w panelu od razu ją tu dokłada.
    if (n.dropdown === 'kategorie') {
      if (!kategorie.length) return '';
      return `
        <li class="ma-liste">
          <button type="button" aria-expanded="false" aria-controls="lista-${i}">
            ${esc(n.label)}${icon('chevron')}
          </button>
          <ul class="podlista" id="lista-${i}">
            ${kategorie.map(k => `
              <li><a href="scena.html?scene=${encodeURIComponent(k.id)}">${esc(k.label || k.id)}</a></li>`).join('')}
          </ul>
        </li>`;
    }
    return `
      <li><a href="${esc(n.href || '#')}"${isActive(n.href, activePath) ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`;
  }).join('');

  // Rozwijanie klikiem, nie najechaniem — na dotyku najechanie nie istnieje.
  $$('.ma-liste > button', nav).forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const otwarte = btn.getAttribute('aria-expanded') === 'true';
      $$('.ma-liste > button', nav).forEach(b => b.setAttribute('aria-expanded', 'false'));
      btn.setAttribute('aria-expanded', String(!otwarte));
    });
  });
  document.addEventListener('click', () => {
    $$('.ma-liste > button', nav).forEach(b => b.setAttribute('aria-expanded', 'false'));
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $$('.ma-liste > button', nav).forEach(b => b.setAttribute('aria-expanded', 'false'));
  });
}

function footer(data) {
  const box = $('[data-footer]');
  if (!box) return;
  const f = data.footer || {};
  box.innerHTML = `
    <div class="ftr__top">
      <div>
        <p class="ftr__brand">${esc(data.brand)}</p>
        <p class="ftr__about">${esc(f.about)}</p>
      </div>
      ${(f.columns || []).map(col => `
        <div class="ftr__col">
          <h3>${esc(col.title)}</h3>
          <ul>${(col.links || []).map(l => `<li><a href="#">${esc(l)}</a></li>`).join('')}</ul>
        </div>`).join('')}
    </div>
    <p class="ftr__legal">${esc(f.legal)}</p>`;
}

function mobileNav(data, activePath, kategorie) {
  const nav = $('[data-mnav]');
  const scrim = $('[data-mnav-scrim]');
  const burger = $('[data-burger]');
  if (!nav || !scrim || !burger) return;

  $('[data-mnav-list]').innerHTML = (data.nav || []).map(n => {
    // W menu mobilnym rozwijana lista byłaby schowana w schowanym —
    // kategorie wypisujemy od razu, wcięte pod nagłówkiem.
    if (n.dropdown === 'kategorie') {
      if (!kategorie.length) return '';
      return `<li><span class="mnav__grupa">${esc(n.label)}</span></li>` +
        kategorie.map(k => `
          <li><a class="mnav__pod" href="scena.html?scene=${encodeURIComponent(k.id)}">${esc(k.label || k.id)}</a></li>`).join('');
    }
    return `<li><a href="${esc(n.href || '#')}"${isActive(n.href, activePath) ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`;
  }).join('');

  const open = () => {
    nav.hidden = false; scrim.hidden = false;
    void nav.offsetHeight;            // reflow, żeby ruszyła animacja
    nav.classList.add('is-open'); scrim.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    nav.classList.remove('is-open'); scrim.classList.remove('is-open');
    document.body.style.overflow = '';
    const done = () => { nav.hidden = true; scrim.hidden = true; };
    nav.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 400);
  };

  burger.addEventListener('click', open);
  $('[data-mnav-close]').addEventListener('click', close);
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !nav.hidden) close(); });
}


/* ------------------------------------------------------------------ *
 * Koszyk — licznik w nagłówku i wysuwana szuflada
 * Wspólny dla wszystkich stron, bo koszyk nie należy do żadnej z nich.
 * ------------------------------------------------------------------ */

function koszyk() {
  const przycisk = $('[data-cart-open]');
  if (!przycisk) return;

  // Szufladę wstrzykujemy z kodu, żeby nie powielać jej w czterech plikach HTML.
  if (!$('[data-cart]')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="kszscrim" data-cart-scrim hidden></div>
      <aside class="ksz" data-cart hidden aria-label="Koszyk">
        <div class="ksz__head">
          <h2 class="ksz__title">Koszyk</h2>
          <button class="ksz__close" type="button" data-cart-close aria-label="Zamknij">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div class="ksz__body" data-cart-body></div>
        <div class="ksz__foot" data-cart-foot hidden>
          <p class="ksz__suma"><span>Razem</span><strong data-cart-total></strong></p>
          <button class="btn" type="button" disabled>Przejdź do płatności</button>
          <p class="ksz__note">Płatności jeszcze nie podłączyliśmy — koszyk zapamiętuje wybór na tym urządzeniu.</p>
        </div>
      </aside>`);
  }

  const szuflada = $('[data-cart]');
  const scrim = $('[data-cart-scrim]');

  const otworz = () => {
    szuflada.hidden = false; scrim.hidden = false;
    void szuflada.offsetHeight;
    szuflada.classList.add('is-open'); scrim.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  };
  const zamknij = () => {
    szuflada.classList.remove('is-open'); scrim.classList.remove('is-open');
    document.body.style.overflow = '';
    const koniec = () => { szuflada.hidden = true; scrim.hidden = true; };
    szuflada.addEventListener('transitionend', koniec, { once: true });
    setTimeout(koniec, 420);
  };

  przycisk.addEventListener('click', e => { e.preventDefault(); otworz(); });
  $('[data-cart-close]').addEventListener('click', zamknij);
  scrim.addEventListener('click', zamknij);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !szuflada.hidden) zamknij();
  });

  naZmiane(rysujKoszyk);
}

function rysujKoszyk() {
  const pozycje = pobierz();

  // licznik przy ikonie
  const licznik = $('[data-cart-count]');
  if (licznik) {
    const n = ileWKoszyku();
    licznik.textContent = n;
    licznik.classList.toggle('is-pusty', n === 0);
  }

  const body = $('[data-cart-body]');
  if (!body) return;

  const stopka = $('[data-cart-foot]');
  stopka.hidden = pozycje.length === 0;

  if (!pozycje.length) {
    body.innerHTML = '<p class="ksz__pusto">Koszyk jest pusty.</p>';
    return;
  }

  body.innerHTML = pozycje.map(p => `
    <div class="kszp" data-id="${esc(p.id)}">
      <div class="kszp__foto">${p.zdjecie
        ? `<img src="${esc(p.zdjecie)}" alt="" loading="lazy">`
        : ''}</div>
      <div class="kszp__opis">
        <a class="kszp__nazwa" href="produkt.html?id=${encodeURIComponent(p.id)}">${esc(p.nazwa)}</a>
        <p class="kszp__marka">${esc(p.marka || '')}</p>
        <p class="kszp__cena">${esc(formatujCene(p.groszy, p.waluta))}</p>
      </div>
      <div class="kszp__ile">
        <button type="button" data-mniej aria-label="Mniej">−</button>
        <span>${p.ile}</span>
        <button type="button" data-wiecej aria-label="Więcej">+</button>
        <button type="button" data-usun aria-label="Usuń z koszyka">✕</button>
      </div>
    </div>`).join('');

  $('[data-cart-total]').textContent = formatujCene(suma(), pozycje[0].waluta);

  $$('.kszp', body).forEach(el => {
    const id = el.dataset.id;
    const p = pozycje.find(q => q.id === id);
    $('[data-mniej]', el).addEventListener('click', () => ustawIlosc(id, p.ile - 1));
    $('[data-wiecej]', el).addEventListener('click', () => ustawIlosc(id, p.ile + 1));
    $('[data-usun]', el).addEventListener('click', () => ustawIlosc(id, 0));
  });
}

const isActive = (href, activePath) =>
  Boolean(activePath) && href !== '#' && href.split('?')[0] === activePath;
