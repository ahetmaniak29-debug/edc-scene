/**
 * Strona główna — cała treść pochodzi z data/home.json.
 * Nagłówek, menu i stopka siedzą we wspólnym module chrome.js.
 */

import { icon, esc, media, loadSite, loadScenes, renderChrome } from './chrome.js?v=40';
import { initDb, dbGotowa, select } from './db.js?v=40';
import { zBazy } from './mapowanie.js?v=40';

const $ = (sel, root = document) => root.querySelector(sel);

let data = null;
let sceny = [];

async function boot() {
  try {
    data = await loadSite();
  } catch (err) {
    document.body.innerHTML = `<p style="padding:40px;text-align:center;font:16px system-ui">
      Nie udało się wczytać <code>data/home.json</code>.<br><br>
      ${location.protocol === 'file:'
        ? 'Otwórz stronę przez lokalny serwer, nie klikając w plik: <code>npx serve .</code>'
        : esc(err.message)}</p>`;
    return;
  }

  document.title = data.brand || 'Sklep';
  // sceny sluza i za kategorie w menu, i za sekcje kategorii
  sceny = (await loadScenes()).filter(s => s.published);
  await renderChrome(data, 'index.html', sceny);

  hero();
  trust();
  cats();
  tiles();
  collections();
  products();
  about();
  values();
  newsletter();
}

/* ---------- hero ---------- */

function hero() {
  const slides = data.hero || [];
  const track = $('[data-hero-track]');
  const dots = $('[data-hero-dots]');

  track.innerHTML = slides.map((s, i) => `
    <article class="slide" role="group" aria-roledescription="slide" aria-label="Slajd ${i + 1} z ${slides.length}">
      <div class="slide__text">
        <p class="slide__badge">${esc(s.badge)}</p>
        <h1 class="slide__title">${esc(s.title)}</h1>
        <p>${esc(s.text)}</p>
        <div class="slide__btns">
          ${s.primary   ? `<a class="btn-solid" href="${esc(s.primary.href)}">${esc(s.primary.label)}${icon('arrow')}</a>` : ''}
          ${s.secondary ? `<a class="btn-ghost" href="${esc(s.secondary.href)}">${esc(s.secondary.label)}</a>` : ''}
        </div>
      </div>
      <div class="slide__media">${media(s.image, s.title, 'hero', '1600 × 900 px')}</div>
    </article>`).join('');

  dots.innerHTML = slides.map((_, i) =>
    `<button type="button" role="tab" aria-label="Slajd ${i + 1}" aria-selected="${i === 0}"></button>`).join('');

  let at = 0;
  const go = i => {
    at = (i + slides.length) % slides.length;
    track.style.transform = `translateX(-${at * 100}%)`;
    [...dots.children].forEach((d, k) => d.setAttribute('aria-selected', String(k === at)));
  };

  $('[data-hero-prev]').addEventListener('click', () => { go(at - 1); rearm(); });
  $('[data-hero-next]').addEventListener('click', () => { go(at + 1); rearm(); });
  [...dots.children].forEach((d, i) => d.addEventListener('click', () => { go(i); rearm(); }));

  // Automatyczne przewijanie — pauza, gdy karta jest w tle albo kursor jest na hero.
  let timer = null;
  const arm = () => { if (slides.length > 1) timer = setInterval(() => go(at + 1), 6000); };
  const stop = () => { clearInterval(timer); timer = null; };
  const rearm = () => { stop(); arm(); };

  const heroEl = $('.hero');
  heroEl.addEventListener('mouseenter', stop);
  heroEl.addEventListener('mouseleave', arm);
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : rearm());

  // Przesuwanie palcem
  let x0 = null;
  heroEl.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; stop(); }, { passive: true });
  heroEl.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) go(at + (dx < 0 ? 1 : -1));
    x0 = null; arm();
  });

  arm();
}

/* ---------- pasek zaufania ---------- */

function trust() {
  $('[data-trust]').innerHTML = (data.trust || []).map(t => `
    <li>
      <span class="trust__ico">${icon(t.icon)}</span>
      <span>
        <span class="trust__t">${esc(t.title)}</span>
        <span class="trust__s">${esc(t.text)}</span>
      </span>
    </li>`).join('');
}

/* ---------- kategorie ---------- */

function cats() {
  const box = $('[data-cats]');
  const sekcja = box.closest('.cats');

  // Brak scen w bazie = pokazujemy to, co siedzi w konfiguracji,
  // żeby świeżo postawiona strona nie miała pustej sekcji.
  const zrodlo = sceny.length
    ? sceny.map(s => ({
        name: s.label || s.id,
        href: `scena.html?scene=${encodeURIComponent(s.id)}`,
        image: s.thumb || s.image || '',
        badge: s.badge || ''
      }))
    : (data.categories || []);

  const n = zrodlo.length;
  sekcja.hidden = n === 0;
  if (!n) return;

  // Sklep rośnie etapami i układ ma rosnąć razem z nim.
  // Jedno kółko w rzędzie zaprojektowanym na dziewięć wygląda na pomyłkę,
  // więc przy małej liczbie kategorii pokazujemy szerokie karty.
  sekcja.dataset.ile = n <= 2 ? 'malo' : n <= 5 ? 'srednio' : 'duzo';

  const items = zrodlo.map(c => `
    <li>
      <a class="cat" href="${esc(c.href)}">
        <span class="cat__circle">
          ${c.badge ? `<span class="cat__badge">${esc(c.badge)}</span>` : ''}
          ${media(c.image, c.name, 'kategorie', '400 × 400 px', 'bare')}
        </span>
        <span class="cat__name">${esc(c.name)}</span>
      </a>
    </li>`).join('');

  // Kafel „zobacz wszystkie" ma sens dopiero, gdy jest czego nie widać.
  const all = n >= 6 ? `
    <li>
      <a class="cat cat--all" href="scena.html">
        <span class="cat__circle">${esc(data.categoriesAllLabel || '')}${icon('arrow')}</span>
        <span class="cat__name">&nbsp;</span>
      </a>
    </li>` : '';

  box.innerHTML = items + all;
}

/* ---------- kafelki ---------- */

function tiles() {
  $('[data-tiles]').innerHTML = (data.tiles || []).map(t => `
    <a class="tile${t.dark ? ' tile--dark' : ''}" href="${esc(t.href)}">
      <div class="tile__body">
        ${t.kicker ? `<p class="tile__kicker">${esc(t.kicker)}</p>` : ''}
        <h3 class="tile__title">${esc(t.title)}</h3>
        <p class="tile__text">${esc(t.text)}</p>
        <span class="tile__cta">${esc(t.cta)}${icon('arrow')}</span>
      </div>
      <div class="tile__media">${media(t.image, t.title, t.dark ? 'banery' : 'produkty', '800 × 800 px', 'sm')}</div>
    </a>`).join('');
}

/* ---------- kolekcje ---------- */

function collections() {
  $('[data-collections-title]').textContent = data.collectionsTitle || '';
  $('[data-collections-all]').innerHTML = `${esc(data.collectionsAllLabel || '')}${icon('arrow')}`;

  const c = data.collections || {};
  const f = c.featured || {};

  const boczne = c.side || [];
  $('[data-collections]').dataset.ile = boczne.length ? 'duzo' : 'malo';

  $('[data-collections]').innerHTML = `
    <a class="coll coll--big" href="${esc(f.href)}">
      <div class="coll__media">${media(f.image, f.title, 'kolekcje', '1200 × 900 px')}</div>
      <div class="coll__body">
        <p class="coll__kicker">${esc(f.kicker)}</p>
        <h3 class="coll__title">${esc(f.title)}</h3>
        <p class="coll__text">${esc(f.text)}</p>
        <span class="coll__cta">${esc(f.cta)}${icon('arrow')}</span>
      </div>
    </a>
    <div class="colls__side">
      ${boczne.map(s => `
        <a class="coll coll--side" href="${esc(s.href)}">
          <div class="coll__body">
            <h3 class="coll__title">${esc(s.title)}</h3>
            <p class="coll__text">${esc(s.text)}</p>
            <span class="coll__cta">${esc(s.cta)}${icon('arrow')}</span>
          </div>
          <div class="coll__media">${media(s.image, s.title, 'kolekcje', '600 × 600 px', 'sm')}</div>
        </a>`).join('')}
    </div>`;
}

/* ---------- produkty ---------- */

async function products() {
  $('[data-products-title]').textContent = data.productsTitle || '';
  $('[data-products-all]').innerHTML = `${esc(data.productsAllLabel || '')}${icon('arrow')}`;

  const list = $('[data-products]');
  const sekcja = list.closest('.block');
  const wybrane = await wczytajWyroznione();

  // Pusta sekcja z komunikatem dla właściciela nie ma czego szukać
  // na stronie oglądanej przez klientów — chowamy ją w całości.
  sekcja.hidden = wybrane.length === 0;
  if (!wybrane.length) return;

  // Sześć kolumn przy trzech produktach zostawia połowę rzędu pustą.
  sekcja.dataset.ile = wybrane.length <= 3 ? 'malo' : 'duzo';

  list.innerHTML = wybrane.map(p => `
    <li class="prod">
      <button class="prod__fav" type="button" aria-pressed="false" aria-label="Dodaj ${esc(p.name)} do ulubionych">
        ${icon('heart')}
      </button>
      <a class="prod__link" href="produkt.html?id=${encodeURIComponent(p.id)}">
        <div class="prod__media">${p.images?.[0]
          ? `<img class="img" src="${esc(p.images[0].src)}" alt="" loading="lazy">`
          : media('', p.name, 'produkty', '800 × 800 px', 'sm')}</div>
        <div class="prod__body">
          <p class="prod__name">${esc(p.name)}</p>
          <p class="prod__price">${esc(p.price || '')}</p>
        </div>
      </a>
    </li>`).join('');

  list.addEventListener('click', e => {
    const btn = e.target.closest('.prod__fav');
    if (!btn) return;
    btn.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  });
}

/**
 * Produkty wybrane do sekcji na stronie głównej.
 * Kolejność bierze się z listy identyfikatorów, a nie z bazy — to Ty
 * decydujesz, co stoi pierwsze.
 */
async function wczytajWyroznione() {
  const ids = Array.isArray(data.featuredIds) ? data.featuredIds : [];
  if (!ids.length) return [];

  try {
    await initDb();
    if (!dbGotowa()) return [];

    const lista = ids.map(encodeURIComponent).join(',');
    const produkty = await select('products', `select=*&id=in.(${lista})`) || [];

    let zdjecia = [];
    try {
      zdjecia = await select('product_images', `select=*&product_id=in.(${lista})&order=position.asc`) || [];
    } catch { /* tabela zdjęć może jeszcze nie istnieć */ }

    const gotowe = zBazy({ id: 'home' }, produkty, [], zdjecia).products;
    // przywracamy kolejność z listy identyfikatorów
    return ids.map(id => gotowe.find(p => p.id === id)).filter(Boolean);
  } catch (err) {
    console.warn('Nie udało się wczytać wyróżnionych produktów:', err.message);
    return [];
  }
}

/* ---------- o nas ---------- */

function about() {
  const a = data.about || {};
  $('[data-about]').innerHTML = `
    <div class="about__media">${media(a.image, a.title, 'banery', '1600 × 600 px')}</div>
    <div class="about__body">
      <p class="about__kicker">${esc(a.kicker)}</p>
      <h2 class="about__title">${esc(a.title)}</h2>
      <p class="about__text">${esc(a.text)}</p>
      <a class="about__cta" href="${esc(a.href)}">${esc(a.cta)}${icon('arrow')}</a>
    </div>`;
}

/* ---------- wartości ---------- */

function values() {
  $('[data-values]').innerHTML = (data.values || []).map(v => `
    <li>
      <span class="vals__ico">${icon(v.icon)}</span>
      <span>
        <span class="vals__t">${esc(v.title)}</span>
        <span class="vals__s">${esc(v.text)}</span>
      </span>
    </li>`).join('');
}

/* ---------- newsletter ---------- */

function newsletter() {
  const n = data.newsletter || {};
  $('[data-newsletter]').innerHTML = `
    <div>
      <h2 class="news__title">${esc(n.title)}</h2>
      <p class="news__text">${esc(n.text)}</p>
    </div>
    <form class="news__form" onsubmit="return false">
      <input type="email" placeholder="${esc(n.placeholder)}" aria-label="${esc(n.placeholder)}">
      <button type="submit">${esc(n.cta)}</button>
    </form>`;
}

boot();
