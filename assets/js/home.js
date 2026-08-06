/**
 * Strona główna — cała treść pochodzi z data/home.json.
 * Puste pole "image" rysuje ramkę zastępczą z podpowiedzią,
 * jaki plik i o jakim rozmiarze tam wrzucić.
 */

const $ = (sel, root = document) => root.querySelector(sel);

const ICONS = {
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

const icon = (name, cls = '') =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${ICONS[name] || ''}</svg>`;

/**
 * Ramka zastępcza: mówi wprost, jaki plik gdzie wrzucić.
 * variant: '' pełna | 'sm' ciasna | 'bare' sama ikonka (kółka kategorii)
 */
const ph = (folder, size, variant = '') => `
  <div class="ph${variant ? ` ph--${variant}` : ''}">
    <div class="ph__inner">
      ${icon('image', 'ph__icon')}
      <div class="ph__path">ZDJECIA/${folder}/</div>
      <div class="ph__size">${size}</div>
    </div>
  </div>`;

/** Zdjęcie albo ramka zastępcza — zależnie od tego, czy w JSON jest ścieżka. */
const media = (src, alt, folder, size, variant = '') =>
  src ? `<img class="img" src="${esc(src)}" alt="${esc(alt || '')}" loading="lazy">` : ph(folder, size, variant);

const esc = str => String(str ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ */

let data = null;

async function boot() {
  try {
    const res = await fetch(`data/home.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    document.body.innerHTML = `<p style="padding:40px;text-align:center;font:16px system-ui">
      Nie udało się wczytać <code>data/home.json</code>.<br><br>
      ${location.protocol === 'file:'
        ? 'Otwórz stronę przez lokalny serwer, nie klikając w plik: <code>npx serve .</code>'
        : esc(err.message)}</p>`;
    return;
  }

  header();
  hero();
  trust();
  cats();
  tiles();
  collections();
  products();
  about();
  values();
  newsletter();
  footer();
  mobileNav();
}

/* ---------- nagłówek ---------- */

function header() {
  $('[data-brand]').textContent = data.brand || '';
  document.title = data.brand || 'Sklep';
  $('[data-search]').placeholder = data.searchPlaceholder || '';

  $('[data-nav]').innerHTML = (data.nav || []).map(n => `
    <li><a href="${esc(n.href)}">${esc(n.label)}${n.dropdown ? icon('chevron') : ''}</a></li>`).join('');
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
  const items = (data.categories || []).map(c => `
    <li>
      <a class="cat" href="${esc(c.href)}">
        <span class="cat__circle">
          ${c.badge ? `<span class="cat__badge">${esc(c.badge)}</span>` : ''}
          ${media(c.image, c.name, 'kategorie', '400 × 400 px', 'bare')}
        </span>
        <span class="cat__name">${esc(c.name)}</span>
      </a>
    </li>`).join('');

  const all = `
    <li>
      <a class="cat cat--all" href="#">
        <span class="cat__circle">${esc(data.categoriesAllLabel || '')}${icon('arrow')}</span>
        <span class="cat__name">&nbsp;</span>
      </a>
    </li>`;

  $('[data-cats]').innerHTML = items + all;
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
  const more = $('[data-collections-all]');
  more.innerHTML = `${esc(data.collectionsAllLabel || '')}${icon('arrow')}`;

  const c = data.collections || {};
  const f = c.featured || {};

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
      ${(c.side || []).map(s => `
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

function stars(rating = 0) {
  const full = Math.round(Number(rating) || 0);
  return `<span class="prod__stars">${
    Array.from({ length: 5 }, (_, i) =>
      `<svg viewBox="0 0 24 24"${i < full ? '' : ' class="is-empty"'} aria-hidden="true">${ICONS.star}</svg>`).join('')
  }</span>`;
}

function products() {
  $('[data-products-title]').textContent = data.productsTitle || '';
  $('[data-products-all]').innerHTML = `${esc(data.productsAllLabel || '')}${icon('arrow')}`;

  $('[data-products]').innerHTML = (data.products || []).map(p => `
    <li class="prod">
      <button class="prod__fav" type="button" aria-pressed="false" aria-label="Dodaj ${esc(p.name)} do ulubionych">
        ${icon('heart')}
      </button>
      <a class="prod__link" href="${esc(p.href)}">
        <div class="prod__media">${media(p.image, p.name, 'produkty', '800 × 800 px', 'sm')}</div>
        <div class="prod__body">
          <p class="prod__name">${esc(p.name)}</p>
          <p class="prod__price">${esc(p.price)}</p>
          <p class="prod__rate">${stars(p.rating)}<span class="prod__revs">(${esc(p.reviews ?? 0)})</span></p>
        </div>
      </a>
    </li>`).join('');

  $('[data-products]').addEventListener('click', e => {
    const btn = e.target.closest('.prod__fav');
    if (!btn) return;
    btn.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  });
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

/* ---------- stopka ---------- */

function footer() {
  const f = data.footer || {};
  $('[data-footer]').innerHTML = `
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

/* ---------- menu mobilne ---------- */

function mobileNav() {
  const nav = $('[data-mnav]');
  const scrim = $('[data-mnav-scrim]');

  $('[data-mnav-list]').innerHTML = (data.nav || [])
    .map(n => `<li><a href="${esc(n.href)}">${esc(n.label)}</a></li>`).join('');

  const open = () => {
    nav.hidden = false; scrim.hidden = false;
    void nav.offsetHeight;             // reflow, żeby ruszyła animacja
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

  $('[data-burger]').addEventListener('click', open);
  $('[data-mnav-close]').addEventListener('click', close);
  scrim.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !nav.hidden) close(); });
}

boot();
