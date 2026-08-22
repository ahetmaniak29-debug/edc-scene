/**
 * Strona jednego produktu — produkt.html?id=<slug>
 *
 * Osobna strona, a nie nakładka, bo adres da się wysłać, a przycisk
 * „wstecz" działa tak, jak człowiek się spodziewa.
 *
 * Źródłem prawdy jest baza; przy jej awarii wracamy do plików JSON,
 * dokładnie tak samo jak strona kategorii.
 */

import { track } from './counter.js?v=10';
import { icon, esc, loadSite, renderChrome } from './chrome.js?v=10';
import { initDb, dbGotowa, select } from './db.js?v=10';
import { zBazy, naGrosze } from './mapowanie.js?v=10';
import { dodaj as doKoszyka } from './koszyk.js?v=10';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const params = new URLSearchParams(location.search);

const stan = {
  config: null,
  scena: null,
  produkt: null,
  zdjecia: [],
  nr: 0
};

/* ------------------------------------------------------------------ *
 * Start
 * ------------------------------------------------------------------ */

async function start() {
  try {
    const site = await loadSite();
    renderChrome(site, 'produkt.html');
  } catch (err) {
    console.error(err);          // brak oprawy nie może zablokować produktu
  }

  try {
    stan.config = await (await fetch(`data/scenes.json?v=${Date.now()}`, { cache: 'no-store' })).json();
  } catch (err) {
    return blad('Nie udało się wczytać konfiguracji.');
  }

  const id = params.get('id');
  if (!id) return blad('Brak identyfikatora produktu w adresie.');

  stan.scena = await zBazyDanych(id) || await zPliku(id);
  if (!stan.scena) return blad('Nie znaleziono takiego produktu.');

  stan.produkt = stan.scena.products.find(p => p.id === id);
  if (!stan.produkt) return blad('Nie znaleziono takiego produktu.');

  rysuj();
}

/** Scena zawierająca dany produkt — prosto z bazy. */
async function zBazyDanych(id) {
  try {
    await initDb();
    if (!dbGotowa()) return null;

    const produkty = await select('products', `select=*&id=eq.${encodeURIComponent(id)}`);
    const p = produkty?.[0];
    if (!p) return null;

    const sceny = await select('scenes', `select=*&id=eq.${encodeURIComponent(p.scene_id)}`);
    const scena = sceny?.[0];
    if (!scena) return null;

    // Rodzeństwo bierzemy od razu — służy sekcji "reszta z tego zdjęcia".
    const rodzenstwo = await select(
      'products',
      `select=*&scene_id=eq.${encodeURIComponent(scena.id)}&order=position.asc`
    ) || [];

    let zdjecia = [];
    const ids = rodzenstwo.map(q => q.id);
    if (ids.length) {
      try {
        zdjecia = await select(
          'product_images',
          `select=*&product_id=in.(${ids.map(encodeURIComponent).join(',')})&order=position.asc`
        ) || [];
      } catch (err) {
        console.warn('Brak zdjęć produktów:', err.message);
      }
    }

    return zBazy(scena, rodzenstwo, [], zdjecia);
  } catch (err) {
    console.warn('Nie udało się wczytać z bazy:', err.message);
    return null;
  }
}

/** Koło ratunkowe: przeszukujemy sceny zapisane w repozytorium. */
async function zPliku(id) {
  for (const sceneId of stan.config.scenes || []) {
    try {
      const res = await fetch(`data/scenes/${sceneId}.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const scena = await res.json();
      if ((scena.products || []).some(p => p.id === id)) {
        console.warn('Baza nie odpowiedziała — produkt wczytany z pliku.');
        return scena;
      }
    } catch {}
  }
  return null;
}

function blad(tekst) {
  const box = $('[data-loading]');
  box.hidden = false;
  box.innerHTML = `${esc(tekst)}<br><br><a class="mini" href="index.html">Wróć na stronę główną</a>`;
}

/* ------------------------------------------------------------------ *
 * Rysowanie
 * ------------------------------------------------------------------ */

function rysuj() {
  const p = stan.produkt;
  const s = stan.scena;

  document.title = `${p.name} — ${document.title}`;
  $('[data-loading]').hidden = true;
  $('[data-produkt]').hidden = false;

  const adresSceny = `scena.html?scene=${encodeURIComponent(s.id)}`;
  $('[data-crumb-scene]').textContent = s.label || s.id;
  $('[data-crumb-scene]').href = adresSceny;
  $('[data-crumb-product]').textContent = p.name;

  $('[data-pr-brand]').textContent = p.brand || '';
  $('[data-pr-name]').textContent = p.name || '';
  $('[data-pr-price]').textContent = p.price || '';
  $('[data-pr-why]').textContent = p.why || '';

  // Kafel z parametrami znika, gdy produkt ich nie ma — mozaika sama się domyka.
  const maSpecs = Array.isArray(p.specs) && p.specs.length > 0;
  $('[data-bt-specs]').hidden = !maSpecs;
  if (maSpecs) {
    $('[data-pr-specs]').innerHTML = p.specs.map(({ k, v }) =>
      `<li><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></li>`).join('');
  }

  $('[data-pr-note]').textContent = 'Wysyłka i zwroty na zasadach sklepu';

  $('[data-pr-back]').href = `${adresSceny}#${encodeURIComponent(p.id)}`;
  $('[data-pr-back-label]').textContent = `Wróć do: ${s.label || 'scena'}`;

  rysujGalerie(p);
  rysujNawigacje();
  rysujInne(adresSceny);
  podepnijKoszyk(p, s);
}

/* ------------------------------------------------------------------ *
 * Koszyk
 * ------------------------------------------------------------------ */

function podepnijKoszyk(p, s) {
  const btn = $('[data-do-koszyka]');
  const napis = btn.querySelector('span');

  btn.addEventListener('click', () => {
    doKoszyka({
      id: p.id,
      name: p.name,
      brand: p.brand,
      // W trybie awaryjnym z pliku mamy tylko sformatowany tekst ceny,
      // więc odzyskujemy z niego liczbę.
      priceCents: p.priceCents ?? naGrosze(p.price),
      currency: p.currency || 'PLN',
      image: p.images?.[0]?.src || ''
    });

    btn.classList.add('is-dodane');
    napis.textContent = 'Dodano do koszyka';
    setTimeout(() => {
      btn.classList.remove('is-dodane');
      napis.textContent = 'Dodaj do koszyka';
    }, 1800);

    // Najmocniejszy sygnał zamiaru, jaki mamy. Zapis do bazy wymaga
    // rozszerzenia ograniczenia (db/events_cart.sql) — do tego czasu
    // zdarzenie liczy się tylko lokalnie.
    track({
      sceneId: s.id, productId: p.id, event: 'cart',
      category: p.category, analytics: stan.config.analytics, supabase: stan.config.supabase
    });
  });
}

/* ------------------------------------------------------------------ *
 * Nawigacja między produktami sceny
 * ------------------------------------------------------------------ */

function rysujNawigacje() {
  const lista = stan.scena.products;
  const i = lista.findIndex(q => q.id === stan.produkt.id);

  const poprz = $('[data-nav-prev]');
  const nast = $('[data-nav-next]');

  if (lista.length < 2) {
    poprz.hidden = true;
    nast.hidden = true;
    return;
  }

  const p = lista[(i - 1 + lista.length) % lista.length];
  const n = lista[(i + 1) % lista.length];
  poprz.href = `produkt.html?id=${encodeURIComponent(p.id)}`;
  nast.href = `produkt.html?id=${encodeURIComponent(n.id)}`;
}

/* ------------------------------------------------------------------ *
 * Galeria
 * ------------------------------------------------------------------ */

function rysujGalerie(p) {
  stan.zdjecia = Array.isArray(p.images) ? p.images : [];
  stan.nr = 0;

  const jest = stan.zdjecia.length > 0;
  const wiele = stan.zdjecia.length > 1;

  $('[data-pr-pusto]').hidden = jest;
  $('[data-pr-img]').hidden = !jest;
  $('[data-pr-prev]').hidden = !wiele;
  $('[data-pr-next]').hidden = !wiele;
  $('[data-pr-licznik]').hidden = !wiele;

  // Drugie i trzecie zdjęcie dostają własne kafle w mozaice.
  // Wszystkie razem są dostępne w pasku miniatur.
  [1, 2].forEach(nr => {
    const kafel = $(`[data-bt-foto-${nr}]`);
    const z = stan.zdjecia[nr];
    if (!z) { kafel.hidden = true; return; }

    const img = $('img', kafel);
    img.addEventListener('load', () => img.classList.add('is-widoczne'), { once: true });
    img.src = z.src;
    img.alt = z.alt || p.name || '';
    kafel.hidden = false;
    kafel.style.cursor = 'pointer';
    kafel.addEventListener('click', () => pokaz(nr));
  });

  const thumbs = $('[data-pr-thumbs]');
  thumbs.innerHTML = wiele
    ? stan.zdjecia.map((z, i) => `
        <button class="bt__thumb" type="button" role="tab"
                aria-selected="${i === 0}" aria-label="Zdjęcie ${i + 1}">
          <img src="${esc(z.src)}" alt="" loading="lazy">
        </button>`).join('')
    : '';

  $$('.bt__thumb', thumbs).forEach((b, i) => b.addEventListener('click', () => pokaz(i)));

  ustawUklad();

  if (jest) pokaz(0);
}

/**
 * Wybiera wariant mozaiki. Kafle mają stałe rozmiary, więc to, ile ich
 * jest, decyduje o tym, czy siatka domknie się bez pustego rogu.
 *   a — dwa dodatkowe zdjęcia i parametry
 *   b — jedno dodatkowe zdjęcie
 *   c — bez dodatkowych zdjęć, są parametry
 *   d — bez zdjęć i bez parametrów
 */
function ustawUklad() {
  const dodatkowe = Math.min(Math.max(stan.zdjecia.length - 1, 0), 2);
  const maSpecs = !$('[data-bt-specs]').hidden;

  let uklad;
  if (dodatkowe >= 2 && maSpecs) uklad = 'a';
  else if (dodatkowe >= 1)       uklad = 'b';
  else if (maSpecs)              uklad = 'c';
  else                           uklad = 'd';

  $('[data-produkt]').dataset.uklad = uklad;
}

function pokaz(i) {
  if (!stan.zdjecia.length) return;
  stan.nr = (i + stan.zdjecia.length) % stan.zdjecia.length;

  const z = stan.zdjecia[stan.nr];
  const img = $('[data-pr-img]');

  // Przenikanie: gasimy, podmieniamy, zapalamy dopiero po wczytaniu.
  img.classList.remove('is-widoczne');
  const zapal = () => img.classList.add('is-widoczne');
  img.addEventListener('load', zapal, { once: true });
  img.addEventListener('error', zapal, { once: true });
  img.src = z.src;
  img.alt = z.alt || stan.produkt.name || '';

  $('[data-pr-licznik]').textContent = `${stan.nr + 1} / ${stan.zdjecia.length}`;
  $$('.bt__thumb').forEach((b, k) => b.setAttribute('aria-selected', String(k === stan.nr)));
}

$('[data-pr-prev]').addEventListener('click', e => { e.stopPropagation(); pokaz(stan.nr - 1); });
$('[data-pr-next]').addEventListener('click', e => { e.stopPropagation(); pokaz(stan.nr + 1); });

document.addEventListener('keydown', e => {
  if (stan.zdjecia.length < 2) return;
  if (e.key === 'ArrowLeft')  pokaz(stan.nr - 1);
  if (e.key === 'ArrowRight') pokaz(stan.nr + 1);
});

(() => {
  let x0 = null;
  const hero = $('[data-bt-hero]');
  hero.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  hero.addEventListener('touchend', e => {
    if (x0 === null || stan.zdjecia.length < 2) { x0 = null; return; }
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 45) pokaz(stan.nr + (dx < 0 ? 1 : -1));
    x0 = null;
  });
})();

/* ---------- reszta sceny ---------- */

function rysujInne(adresSceny) {
  const inne = stan.scena.products.filter(q => q.id !== stan.produkt.id);
  if (!inne.length) return;

  $('[data-inne]').hidden = false;
  $('[data-inne-all]').innerHTML = `Zobacz całą scenę${icon('arrow')}`;
  $('[data-inne-all]').href = adresSceny;

  $('[data-inne-list]').innerHTML = inne.map(q => `
    <li class="prod">
      <a class="prod__link" href="produkt.html?id=${encodeURIComponent(q.id)}">
        <div class="prod__media">${q.images?.[0]
          ? `<img class="img" src="${esc(q.images[0].src)}" alt="" loading="lazy">`
          : '<div class="ph ph--sm"><div class="ph__inner">bez zdjęcia</div></div>'}</div>
        <div class="prod__body">
          <p class="prod__name">${esc(q.name)}</p>
          <p class="prod__price">${esc(q.price || '')}</p>
        </div>
      </a>
    </li>`).join('');
}

/* ------------------------------------------------------------------ */

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

start();
