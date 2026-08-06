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

const $ = (sel, root = document) => root.querySelector(sel);

/** Wczytuje wspólną konfigurację strony. */
export async function loadSite() {
  const res = await fetch(`data/home.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`data/home.json → HTTP ${res.status}`);
  return res.json();
}

/**
 * Wypełnia nagłówek, menu mobilne i stopkę.
 * @param {object} data zawartość data/home.json
 * @param {string} [activePath] adres bieżącej strony, żeby podświetlić pozycję menu
 */
export function renderChrome(data, activePath = '') {
  header(data, activePath);
  footer(data);
  mobileNav(data, activePath);
}

function header(data, activePath) {
  const brand = $('[data-brand]');
  if (brand) brand.textContent = data.brand || '';

  const search = $('[data-search]');
  if (search) search.placeholder = data.searchPlaceholder || '';

  const nav = $('[data-nav]');
  if (nav) {
    nav.innerHTML = (data.nav || []).map(n => `
      <li><a href="${esc(n.href)}"${isActive(n.href, activePath) ? ' aria-current="page"' : ''}>${
        esc(n.label)}${n.dropdown ? icon('chevron') : ''}</a></li>`).join('');
  }
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

function mobileNav(data, activePath) {
  const nav = $('[data-mnav]');
  const scrim = $('[data-mnav-scrim]');
  const burger = $('[data-burger]');
  if (!nav || !scrim || !burger) return;

  $('[data-mnav-list]').innerHTML = (data.nav || []).map(n =>
    `<li><a href="${esc(n.href)}"${isActive(n.href, activePath) ? ' aria-current="page"' : ''}>${esc(n.label)}</a></li>`).join('');

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

const isActive = (href, activePath) =>
  Boolean(activePath) && href !== '#' && href.split('?')[0] === activePath;
