/**
 * Panel produktów.
 *
 * Wszystko dzieje się w przeglądarce — zapisywać może tylko ktoś zalogowany,
 * bo tego pilnuje RLS po stronie bazy (db/products.sql). Panel nie ma
 * własnych uprawnień: gdyby ktoś obszedł ten ekran, i tak nic nie zapisze.
 */

import {
  initDb, dbGotowa, konfiguracja,
  zaloguj, wyloguj, zalogowany, ktoZalogowany,
  select, upsert, usun, wgrajZdjecie
} from './db.js?v=6';
import { formatujCene, naGrosze } from './mapowanie.js?v=6';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const stan = {
  sceny: [],
  scena: null,
  produkty: [],
  galeria: [],
  wybrany: null,        // id edytowanego produktu, '' = nowy
  brudne: false
};

/* ------------------------------------------------------------------ *
 * Start
 * ------------------------------------------------------------------ */

async function start() {
  try {
    await initDb();
  } catch (err) {
    return alert(`Nie udało się wczytać konfiguracji: ${err.message}`);
  }

  if (!dbGotowa()) {
    return alert('Brak połączenia z bazą w data/scenes.json (blok "supabase").');
  }

  if (await zalogowany()) pokazPanel();
  else pokazLogowanie();
}

function pokazLogowanie() {
  $('[data-login]').hidden = false;
  $('[data-panel]').hidden = true;
}

async function pokazPanel() {
  $('[data-login]').hidden = true;
  $('[data-panel]').hidden = false;
  $('[data-user]').textContent = ktoZalogowany() || '';
  await wczytajSceny();
}

$('[data-login-form]').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('.log__btn');
  const err = $('[data-login-err]');
  const email = e.target.email.value.trim();
  const haslo = e.target.haslo.value;

  btn.disabled = true;
  btn.textContent = 'Logowanie…';
  err.hidden = true;

  try {
    await zaloguj(email, haslo);
    e.target.reset();                 // hasło znika z formularza od razu
    await pokazPanel();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Zaloguj';
  }
});

$('[data-logout]').addEventListener('click', async () => {
  if (stan.brudne && !confirm('Masz niezapisane zmiany. Wylogować mimo to?')) return;
  await wyloguj();
  location.reload();
});

/* ------------------------------------------------------------------ *
 * Komunikaty
 * ------------------------------------------------------------------ */

let toastTimer = null;
function toast(tekst, blad = false) {
  const el = $('[data-toast]');
  el.textContent = tekst;
  el.classList.toggle('is-error', blad);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, blad ? 8000 : 3000);
}

function brudne(tak) {
  stan.brudne = tak;
  $('[data-dirty]').hidden = !tak;
}

window.addEventListener('beforeunload', e => {
  if (stan.brudne) { e.preventDefault(); e.returnValue = ''; }
});

/* ------------------------------------------------------------------ *
 * Sceny
 * ------------------------------------------------------------------ */

async function wczytajSceny() {
  try {
    stan.sceny = await select('scenes', 'select=*&order=position.asc', { zAutoryzacja: true }) || [];
  } catch (err) {
    return toast(`Nie udało się wczytać scen: ${err.message}`, true);
  }

  const sel = $('[data-scene-select]');
  sel.innerHTML = stan.sceny
    .map(s => `<option value="${s.id}">${s.label || s.id}${s.published ? '' : '  · szkic'}</option>`)
    .join('');

  if (!stan.sceny.length) {
    sel.innerHTML = '<option value="">— brak scen —</option>';
    return;
  }

  const zapamietana = localStorage.getItem('admin:scena');
  const id = stan.sceny.some(s => s.id === zapamietana) ? zapamietana : stan.sceny[0].id;
  sel.value = id;
  await wybierzScene(id);
}

async function wybierzScene(id) {
  localStorage.setItem('admin:scena', id);
  stan.scena = stan.sceny.find(s => s.id === id) || null;
  if (!stan.scena) return;

  $('[data-preview]').href = `scena.html?scene=${encodeURIComponent(id)}`;

  $('[data-scene-id]').value = stan.scena.id;
  $('[data-scene-label]').value = stan.scena.label || '';
  $('[data-scene-title]').value = stan.scena.title || '';
  $('[data-scene-subtitle]').value = stan.scena.subtitle || '';
  $('[data-scene-alt]').value = stan.scena.image_alt || '';
  $('[data-scene-published]').checked = Boolean(stan.scena.published);

  rysujZdjecie();

  try {
    [stan.produkty, stan.galeria] = await Promise.all([
      select('products', `select=*&scene_id=eq.${encodeURIComponent(id)}&order=position.asc`, { zAutoryzacja: true }),
      select('scene_images', `select=*&scene_id=eq.${encodeURIComponent(id)}&order=position.asc`, { zAutoryzacja: true })
    ]);
  } catch (err) {
    return toast(`Nie udało się wczytać produktów: ${err.message}`, true);
  }

  stan.produkty ||= [];
  stan.galeria ||= [];
  zamknijFormularz();
  rysujListe();
  rysujPunkty();
  rysujGalerie();
}

$('[data-scene-select]').addEventListener('change', e => {
  if (stan.brudne && !confirm('Masz niezapisane zmiany. Przełączyć scenę?')) {
    e.target.value = stan.scena.id;
    return;
  }
  brudne(false);
  wybierzScene(e.target.value);
});

$('[data-scene-new]').addEventListener('click', async () => {
  const id = (prompt('Identyfikator nowej sceny (bez polskich znaków i spacji):', 'nowa-scena') || '').trim();
  if (!id) return;
  if (!/^[a-z0-9-]+$/.test(id)) return toast('Dozwolone są tylko małe litery, cyfry i myślnik.', true);
  if (stan.sceny.some(s => s.id === id)) return toast('Scena o tym identyfikatorze już istnieje.', true);

  try {
    await upsert('scenes', {
      id, label: 'Nowa scena',
      position: stan.sceny.length,
      published: false
    });
    toast('Scena utworzona. Uzupełnij ustawienia i wgraj zdjęcie.');
    await wczytajSceny();
    $('[data-scene-select]').value = id;
    await wybierzScene(id);
    $('[data-scene-pane]').open = true;
  } catch (err) {
    toast(`Nie udało się utworzyć sceny: ${err.message}`, true);
  }
});

$('[data-scene-save]').addEventListener('click', async () => {
  if (!stan.scena) return;
  try {
    await upsert('scenes', {
      id: stan.scena.id,
      label: $('[data-scene-label]').value.trim(),
      title: $('[data-scene-title]').value.trim(),
      subtitle: $('[data-scene-subtitle]').value.trim(),
      image: stan.scena.image || null,
      image_alt: $('[data-scene-alt]').value.trim(),
      position: stan.scena.position ?? 0,
      published: $('[data-scene-published]').checked
    });
    toast('Scena zapisana.');
    await wczytajSceny();
  } catch (err) {
    toast(`Nie udało się zapisać: ${err.message}`, true);
  }
});

$('[data-scene-delete]').addEventListener('click', async () => {
  if (!stan.scena) return;
  const ile = stan.produkty.length;
  const pytanie = ile
    ? `Usunąć scenę "${stan.scena.label}" RAZEM z ${ile} produktami? Tego nie da się cofnąć.`
    : `Usunąć scenę "${stan.scena.label}"?`;
  if (!confirm(pytanie)) return;

  try {
    await usun('scenes', `id=eq.${encodeURIComponent(stan.scena.id)}`);
    toast('Scena usunięta.');
    localStorage.removeItem('admin:scena');
    await wczytajSceny();
  } catch (err) {
    toast(`Nie udało się usunąć: ${err.message}`, true);
  }
});

/* ---------- zdjęcie sceny ---------- */

function rysujZdjecie() {
  const img = $('[data-foto-img]');
  const pusto = $('[data-foto-empty]');
  const src = stan.scena?.image || '';
  if (src) {
    img.src = src;
    img.hidden = false;
    pusto.hidden = true;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    pusto.hidden = false;
  }
}

$('[data-scene-image-file]').addEventListener('change', async e => {
  const plik = e.target.files?.[0];
  if (!plik || !stan.scena) return;

  const stanEl = $('[data-scene-image-stan]');
  stanEl.textContent = 'Wgrywanie…';

  try {
    const adres = await wgrajZdjecie(plik, 'sceny');
    await upsert('scenes', { id: stan.scena.id, image: adres });
    stan.scena.image = adres;
    rysujZdjecie();
    stanEl.textContent = '';
    toast('Zdjęcie sceny podmienione.');
  } catch (err) {
    stanEl.textContent = '';
    toast(err.message, true);
  } finally {
    e.target.value = '';
  }
});

/* ------------------------------------------------------------------ *
 * Punkty na zdjęciu
 * ------------------------------------------------------------------ */

function rysujPunkty() {
  const wrap = $('[data-foto-spots]');
  wrap.innerHTML = '';

  stan.produkty.forEach((p, i) => {
    if (p.hotspot_x === null || p.hotspot_y === null) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'spot';
    b.style.left = `${p.hotspot_x}%`;
    b.style.top = `${p.hotspot_y}%`;
    b.textContent = i + 1;
    b.title = p.name || p.id;
    b.classList.toggle('is-active', p.id === stan.wybrany);
    b.classList.toggle('is-hidden', !p.published);
    b.addEventListener('click', ev => { ev.stopPropagation(); otworzProdukt(p.id); });
    wrap.appendChild(b);
  });

  $('[data-foto]').classList.toggle('is-picking', Boolean(stan.wybrany));
  $('[data-pick-hint]').textContent = stan.wybrany
    ? 'Kliknij w zdjęcie, żeby przestawić punkt wybranego produktu'
    : 'Wybierz produkt, potem kliknij w zdjęcie, żeby ustawić punkt';
}

$('[data-foto]').addEventListener('click', e => {
  if (!stan.wybrany) return;
  const img = $('[data-foto-img]');
  if (!img.src || img.hidden) return;

  const r = img.getBoundingClientRect();
  const x = +(((e.clientX - r.left) / r.width) * 100).toFixed(1);
  const y = +(((e.clientY - r.top) / r.height) * 100).toFixed(1);
  if (x < 0 || x > 100 || y < 0 || y > 100) return;

  $('[data-p-x]').value = x;
  $('[data-p-y]').value = y;

  // podgląd na żywo, jeszcze przed zapisem
  const p = stan.produkty.find(q => q.id === stan.wybrany);
  if (p) { p.hotspot_x = x; p.hotspot_y = y; }
  rysujPunkty();
  brudne(true);
});

/* ------------------------------------------------------------------ *
 * Lista produktów
 * ------------------------------------------------------------------ */

function rysujListe() {
  const ul = $('[data-prod-list]');
  $('[data-prod-count]').textContent = stan.produkty.length;

  if (!stan.produkty.length) {
    ul.innerHTML = '<li class="pusto">Brak produktów. Dodaj pierwszy przyciskiem powyżej.</li>';
    return;
  }

  ul.innerHTML = stan.produkty.map((p, i) => `
    <li>
      <button class="prow${p.id === stan.wybrany ? ' is-active' : ''}" type="button" data-id="${escapeHTML(p.id)}">
        <span class="prow__idx">${String(i + 1).padStart(2, '0')}</span>
        <span class="prow__main">
          <span class="prow__name">${escapeHTML(p.name || p.id)}</span>
          <span class="prow__meta">${escapeHTML(p.brand || '—')}${
            p.hotspot_x === null ? ' · brak punktu' : ''}</span>
        </span>
        <span class="prow__price">${escapeHTML(formatujCene(p.price_cents, p.currency))}</span>
        <span class="prow__stan${p.published ? ' is-on' : ''}" title="${p.published ? 'opublikowany' : 'szkic'}"></span>
      </button>
    </li>`).join('');

  $$('.prow', ul).forEach(b =>
    b.addEventListener('click', () => otworzProdukt(b.dataset.id)));
}

$('[data-prod-new]').addEventListener('click', () => {
  if (!stan.scena) return toast('Najpierw utwórz scenę.', true);
  otworzProdukt('');
});

function otworzProdukt(id) {
  if (stan.brudne && id !== stan.wybrany && !confirm('Masz niezapisane zmiany. Porzucić je?')) return;
  brudne(false);

  stan.wybrany = id;
  const nowy = id === '';
  const p = nowy ? pustyProdukt() : stan.produkty.find(q => q.id === id);
  if (!p) return;

  $('[data-prod-form]').hidden = false;
  $('[data-prod-form-title]').textContent = nowy ? 'Nowy produkt' : 'Edycja produktu';

  const pole = $('[data-p-id]');
  pole.value = p.id;
  pole.readOnly = !nowy;
  $('[data-p-id-hint]').textContent = nowy
    ? 'Bez polskich znaków i spacji, np. latarka-aa.'
    : 'Nie zmieniamy — po tym identyfikatorze liczą się kliknięcia.';

  $('[data-p-name]').value = p.name || '';
  $('[data-p-brand]').value = p.brand || '';
  $('[data-p-price]').value = p.price_cents === null || p.price_cents === undefined
    ? '' : (p.price_cents / 100).toFixed(2).replace('.', ',');
  $('[data-p-position]').value = p.position ?? stan.produkty.length + 1;
  $('[data-p-why]').value = p.why || '';
  $('[data-p-url]').value = p.url || '';
  $('[data-p-cta]').value = p.cta_label || '';
  $('[data-p-x]').value = p.hotspot_x ?? '';
  $('[data-p-y]').value = p.hotspot_y ?? '';
  $('[data-p-published]').checked = Boolean(p.published);

  rysujParametry(Array.isArray(p.specs) ? p.specs : []);
  rysujListe();
  rysujPunkty();

  $('[data-prod-form]').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function pustyProdukt() {
  return {
    id: '', name: '', brand: '', price_cents: null, why: '', url: '',
    cta_label: '', specs: [], hotspot_x: null, hotspot_y: null,
    position: stan.produkty.length + 1, published: false
  };
}

function zamknijFormularz() {
  stan.wybrany = null;
  brudne(false);
  $('[data-prod-form]').hidden = true;
}

$('[data-prod-cancel]').addEventListener('click', () => {
  if (stan.brudne && !confirm('Masz niezapisane zmiany. Zamknąć?')) return;
  zamknijFormularz();
  rysujListe();
  rysujPunkty();
});

// każda zmiana w formularzu zapala znacznik "niezapisane"
$$('[data-prod-form] input, [data-prod-form] textarea').forEach(el =>
  el.addEventListener('input', () => brudne(true)));

/* ---------- parametry ---------- */

function rysujParametry(specs) {
  const box = $('[data-p-specs]');
  box.innerHTML = specs.map(s => wierszParametru(s.k, s.v)).join('');
  podepnijParametry();
}

const wierszParametru = (k = '', v = '') => `
  <div class="spec">
    <input placeholder="nazwa, np. Waga" value="${escapeHTML(k)}" data-spec-k>
    <input placeholder="wartość, np. 78 g" value="${escapeHTML(v)}" data-spec-v>
    <button class="spec__del" type="button" title="Usuń">×</button>
  </div>`;

function podepnijParametry() {
  const box = $('[data-p-specs]');
  $$('.spec__del', box).forEach(b =>
    b.addEventListener('click', () => { b.closest('.spec').remove(); brudne(true); }));
  $$('input', box).forEach(i =>
    i.addEventListener('input', () => brudne(true)));
}

$('[data-spec-add]').addEventListener('click', () => {
  $('[data-p-specs]').insertAdjacentHTML('beforeend', wierszParametru());
  podepnijParametry();
  brudne(true);
});

function zbierzParametry() {
  return $$('.spec', $('[data-p-specs]'))
    .map(w => ({
      k: $('[data-spec-k]', w).value.trim(),
      v: $('[data-spec-v]', w).value.trim()
    }))
    .filter(s => s.k || s.v);
}

/* ---------- zapis produktu ---------- */

$('[data-prod-save]').addEventListener('click', async () => {
  const nowy = stan.wybrany === '';
  const id = $('[data-p-id]').value.trim();

  if (!id) return toast('Identyfikator jest wymagany.', true);
  if (!/^[a-z0-9-]+$/.test(id)) return toast('Identyfikator: tylko małe litery, cyfry i myślnik.', true);
  if (nowy && stan.produkty.some(p => p.id === id)) return toast('Produkt o tym identyfikatorze już istnieje.', true);
  if (!$('[data-p-name]').value.trim()) return toast('Nazwa jest wymagana.', true);

  const x = $('[data-p-x]').value;
  const y = $('[data-p-y]').value;

  const wiersz = {
    id,
    scene_id: stan.scena.id,
    name: $('[data-p-name]').value.trim(),
    brand: $('[data-p-brand]').value.trim() || null,
    category: stan.scena.id,
    price_cents: naGrosze($('[data-p-price]').value),
    why: $('[data-p-why]').value.trim() || null,
    url: $('[data-p-url]').value.trim() || null,
    cta_label: $('[data-p-cta]').value.trim() || null,
    specs: zbierzParametry(),
    hotspot_x: x === '' ? null : Number(x),
    hotspot_y: y === '' ? null : Number(y),
    position: Number($('[data-p-position]').value) || 0,
    published: $('[data-p-published]').checked
  };

  try {
    await upsert('products', wiersz);
    brudne(false);
    toast(nowy ? 'Produkt dodany.' : 'Produkt zapisany.');
    const wrocDo = id;
    await wybierzScene(stan.scena.id);
    otworzProdukt(wrocDo);
  } catch (err) {
    toast(`Nie udało się zapisać: ${err.message}`, true);
  }
});

$('[data-prod-delete]').addEventListener('click', async () => {
  if (stan.wybrany === '' || !stan.wybrany) return zamknijFormularz();
  const p = stan.produkty.find(q => q.id === stan.wybrany);
  if (!p) return;
  if (!confirm(`Usunąć "${p.name || p.id}"? Zebrane kliknięcia zostaną w bazie, ale stracą powiązanie z produktem.`)) return;

  try {
    await usun('products', `id=eq.${encodeURIComponent(p.id)}`);
    toast('Produkt usunięty.');
    brudne(false);
    await wybierzScene(stan.scena.id);
  } catch (err) {
    toast(`Nie udało się usunąć: ${err.message}`, true);
  }
});

/* ------------------------------------------------------------------ *
 * Karuzela
 * ------------------------------------------------------------------ */

function rysujGalerie() {
  const ul = $('[data-gal-list]');
  $('[data-gal-count]').textContent = stan.galeria.length;

  if (!stan.galeria.length) {
    ul.innerHTML = '<li class="pusto">Brak ujęć. Karuzela nie pokaże się na stronie.</li>';
    return;
  }

  ul.innerHTML = stan.galeria.map(g => `
    <li class="gitem" data-gid="${g.id}">
      <div class="gitem__foto">${g.image
        ? `<img src="${escapeHTML(g.image)}" alt="">`
        : 'brak zdjęcia'}</div>
      <div class="gitem__pola">
        <input placeholder="Podpis" value="${escapeHTML(g.title || '')}" data-g-title>
        <textarea rows="2" placeholder="Opis ujęcia" data-g-body>${escapeHTML(g.body || '')}</textarea>
        <div class="gitem__akcje">
          <label class="upload">
            <input type="file" accept="image/*" hidden data-g-file>
            <span class="mini">Wgraj zdjęcie</span>
          </label>
          <button class="mini" type="button" data-g-save>Zapisz</button>
          <button class="mini mini--danger" type="button" data-g-del>Usuń</button>
          <span class="upload__stan" data-g-stan></span>
        </div>
      </div>
    </li>`).join('');

  $$('.gitem', ul).forEach(li => {
    const id = Number(li.dataset.gid);

    $('[data-g-save]', li).addEventListener('click', async () => {
      try {
        await upsert('scene_images', {
          id,
          scene_id: stan.scena.id,
          image: stan.galeria.find(g => g.id === id)?.image || '',
          title: $('[data-g-title]', li).value.trim(),
          body: $('[data-g-body]', li).value.trim(),
          position: stan.galeria.find(g => g.id === id)?.position ?? 0
        });
        toast('Ujęcie zapisane.');
        await wybierzScene(stan.scena.id);
        $('[data-gal-pane]').open = true;
      } catch (err) {
        toast(`Nie udało się zapisać: ${err.message}`, true);
      }
    });

    $('[data-g-del]', li).addEventListener('click', async () => {
      if (!confirm('Usunąć to ujęcie z karuzeli?')) return;
      try {
        await usun('scene_images', `id=eq.${id}`);
        toast('Ujęcie usunięte.');
        await wybierzScene(stan.scena.id);
        $('[data-gal-pane]').open = true;
      } catch (err) {
        toast(`Nie udało się usunąć: ${err.message}`, true);
      }
    });

    $('[data-g-file]', li).addEventListener('change', async e => {
      const plik = e.target.files?.[0];
      if (!plik) return;
      const stanEl = $('[data-g-stan]', li);
      stanEl.textContent = 'Wgrywanie…';
      try {
        const adres = await wgrajZdjecie(plik, 'karuzela');
        await upsert('scene_images', {
          id, scene_id: stan.scena.id, image: adres,
          title: $('[data-g-title]', li).value.trim(),
          body: $('[data-g-body]', li).value.trim()
        });
        toast('Zdjęcie wgrane.');
        await wybierzScene(stan.scena.id);
        $('[data-gal-pane]').open = true;
      } catch (err) {
        stanEl.textContent = '';
        toast(err.message, true);
      }
    });
  });
}

$('[data-gal-new]').addEventListener('click', async () => {
  if (!stan.scena) return toast('Najpierw utwórz scenę.', true);
  try {
    await upsert('scene_images', {
      scene_id: stan.scena.id,
      image: '',
      title: 'Nowe ujęcie',
      body: '',
      position: stan.galeria.length + 1
    });
    await wybierzScene(stan.scena.id);
    $('[data-gal-pane]').open = true;
    toast('Ujęcie dodane. Wgraj do niego zdjęcie.');
  } catch (err) {
    toast(`Nie udało się dodać: ${err.message}`, true);
  }
});

/* ------------------------------------------------------------------ */

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

start();
