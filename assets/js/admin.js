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
  select, upsert, usun, wgrajZdjecie,
  listaZdjec, skasujZdjecie as skasujZeStorage
} from './db.js?v=38';
import { formatujCene, naGrosze } from './mapowanie.js?v=38';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const stan = {
  widok: 'sceny',
  strona: null,           // zawartość wiersza site/home
  wszystkieProdukty: [],
  sceny: [],
  scena: null,
  produkty: [],
  galeria: [],
  wybrany: null,        // id edytowanego produktu, '' = nowy
  zdjeciaProduktu: [],  // wiersze product_images dla wybranego produktu
  zaznaczanie: false,   // trwa obrysowywanie fragmentu na zdjęciu wnętrza
  biblioteka: [],       // pliki pokazane w zakładce ze zdjęciami
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

  // Potrzebne w zakładce „Strona główna" do wyboru wyróżnionych produktów.
  try {
    stan.wszystkieProdukty = await select(
      'products', 'select=id,name,scene_id&order=scene_id.asc,position.asc',
      { zAutoryzacja: true }) || [];
  } catch (err) {
    console.warn('Nie udało się wczytać listy produktów:', err.message);
  }
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
  // Kadry kolekcji wypisujemy z wcięciem — inaczej lista scen zamienia się
  // w worek, w którym nie widać, co jest wnętrzem, a co zbliżeniem.
  sel.innerHTML = stan.sceny
    .map(s => {
      const wciecie = s.parent_id ? '  ↳ ' : '';
      return `<option value="${s.id}">${wciecie}${s.label || s.id}${s.published ? '' : '  · szkic'}</option>`;
    })
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
  rysujWyborWnetrza();

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
      published: $('[data-scene-published]').checked,

      // Kolekcja: rodzic i fragment jego zdjęcia. Puste pole = null,
      // bo pusty tekst w kolumnie liczbowej wywala zapis.
      parent_id: $('[data-scene-parent]').value || null,
      area_label: $('[data-scene-area-label]').value.trim() || null,
      area_x: liczbaAlbo($('[data-area-x]').value),
      area_y: liczbaAlbo($('[data-area-y]').value),
      area_w: liczbaAlbo($('[data-area-w]').value),
      area_h: liczbaAlbo($('[data-area-h]').value)
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
 * Kolekcje — scena jako zbliżenie wewnątrz innej sceny
 *
 * W bazie to ta sama tabela `scenes`: kadr ma rodzica i prostokąt,
 * który zajmuje na jego zdjęciu. Tutaj obsługujemy dwie rzeczy:
 * wybór rodzica i narysowanie tego prostokąta myszą.
 * ------------------------------------------------------------------ */

/** Lista wnętrz do wyboru — wszystko poza samą sceną i jej kadrami. */
function rysujWyborWnetrza() {
  const sel = $('[data-scene-parent]');
  if (!sel || !stan.scena) return;

  const mozliwe = stan.sceny.filter(s =>
    s.id !== stan.scena.id &&           // scena nie może być własnym wnętrzem
    !s.parent_id                        // kadr w kadrze to już labirynt
  );

  sel.innerHTML = '<option value="">— osobna scena, nie kadr —</option>'
    + mozliwe.map(s =>
        `<option value="${escapeHTML(s.id)}">${escapeHTML(s.label || s.id)}</option>`).join('');
  sel.value = stan.scena.parent_id || '';

  $('[data-scene-area-label]').value = stan.scena.area_label || '';
  $('[data-area-x]').value = stan.scena.area_x ?? '';
  $('[data-area-y]').value = stan.scena.area_y ?? '';
  $('[data-area-w]').value = stan.scena.area_w ?? '';
  $('[data-area-h]').value = stan.scena.area_h ?? '';

  przelaczPolaObszaru();
}

/** Pola fragmentu mają sens tylko wtedy, gdy scena jest czyimś kadrem. */
function przelaczPolaObszaru() {
  const jestKadrem = Boolean($('[data-scene-parent]').value);
  $$('[data-area-only]').forEach(el => { el.hidden = !jestKadrem; });
}

/** Prostokąt fragmentu narysowany na podglądzie zdjęcia. */
function rysujObszar() {
  const box = $('[data-foto-area]');
  if (!box) return;

  const x = parseFloat($('[data-area-x]').value);
  const y = parseFloat($('[data-area-y]').value);
  const w = parseFloat($('[data-area-w]').value);
  const h = parseFloat($('[data-area-h]').value);

  const kompletny = [x, y, w, h].every(Number.isFinite) && w > 0 && h > 0;
  box.hidden = !kompletny || !stan.zaznaczanie;
  if (!kompletny) return;

  box.style.left = `${x}%`;
  box.style.top = `${y}%`;
  box.style.width = `${w}%`;
  box.style.height = `${h}%`;
}

/**
 * Tryb zaznaczania: podglądem staje się zdjęcie WNĘTRZA (bo to na nim
 * rysujemy fragment), a nie zdjęcie tej sceny. Po skończeniu wracamy
 * do zwykłego widoku, żeby nikt nie pomylił jednego z drugim.
 */
function wlaczZaznaczanie() {
  const rodzicId = $('[data-scene-parent]').value;
  const rodzic = stan.sceny.find(s => s.id === rodzicId);
  if (!rodzic) return toast('Najpierw wskaż wnętrze, w którym leży ten kadr.', true);
  if (!rodzic.image) return toast('To wnętrze nie ma jeszcze zdjęcia.', true);

  stan.zaznaczanie = true;
  $('[data-foto-img]').src = rodzic.image;
  $('[data-foto-img]').hidden = false;
  $('[data-foto-empty]').hidden = true;
  $('[data-foto-spots]').hidden = true;
  $('[data-foto]').classList.add('is-zaznacza');
  $('[data-area-pick]').textContent = 'Skończ zaznaczanie';
  $('[data-area-hint]').textContent = 'Przeciągnij myszą po zdjęciu, żeby obrysować fragment.';
  rysujObszar();
}

function wylaczZaznaczanie() {
  stan.zaznaczanie = false;
  $('[data-foto-spots]').hidden = false;
  $('[data-foto]').classList.remove('is-zaznacza');
  $('[data-area-pick]').textContent = 'Zaznacz fragment na zdjęciu';
  $('[data-area-hint]').textContent = '';
  $('[data-foto-area]').hidden = true;
  rysujZdjecie();
}

$('[data-scene-parent]')?.addEventListener('change', () => {
  przelaczPolaObszaru();
  if (stan.zaznaczanie) wylaczZaznaczanie();
  brudne(true);
});

$('[data-area-pick]')?.addEventListener('click', () => {
  if (stan.zaznaczanie) wylaczZaznaczanie();
  else wlaczZaznaczanie();
});

$$('[data-area-x], [data-area-y], [data-area-w], [data-area-h]')
  .forEach(el => el.addEventListener('input', () => { rysujObszar(); brudne(true); }));

/* ---------- rysowanie prostokąta myszą ---------- */

(() => {
  const foto = $('[data-foto]');
  if (!foto) return;

  let start = null;

  const procenty = e => {
    const img = $('[data-foto-img]');
    const r = img.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100))
    };
  };

  const zapisz = (a, b) => {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    $('[data-area-x]').value = +x.toFixed(1);
    $('[data-area-y]').value = +y.toFixed(1);
    $('[data-area-w]').value = +w.toFixed(1);
    $('[data-area-h]').value = +h.toFixed(1);
    rysujObszar();
  };

  foto.addEventListener('pointerdown', e => {
    if (!stan.zaznaczanie) return;
    e.preventDefault();
    start = procenty(e);
    foto.setPointerCapture(e.pointerId);
  });

  foto.addEventListener('pointermove', e => {
    if (!stan.zaznaczanie || !start) return;
    zapisz(start, procenty(e));
  });

  foto.addEventListener('pointerup', e => {
    if (!stan.zaznaczanie || !start) return;
    zapisz(start, procenty(e));
    start = null;
    brudne(true);

    // Przeciągnięcie na centymetr to zwykle pomyłka, nie fragment mebla.
    const w = parseFloat($('[data-area-w]').value);
    const h = parseFloat($('[data-area-h]').value);
    if (w < 3 || h < 3) {
      toast('Fragment jest bardzo mały — obrysuj większy kawałek zdjęcia.', true);
    }
  });
})();

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
  wczytajZdjeciaProduktu(nowy ? null : p.id);
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
    otworzProdukt(wrocDo);   // po zapisie produkt ma już wiersz, więc wgrywanie zdjęć się odblokowuje
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
 * Zdjęcia produktu (galeria pokazywana po kliknięciu punktu)
 * ------------------------------------------------------------------ */

async function wczytajZdjeciaProduktu(id) {
  // Nowy produkt nie ma jeszcze wiersza w bazie, więc nie ma do czego
  // podpiąć zdjęć — wgrywanie odblokowuje się po pierwszym zapisie.
  $('[data-pi-upload]').hidden = !id;
  stan.zdjeciaProduktu = [];

  if (id) {
    try {
      stan.zdjeciaProduktu = await select(
        'product_images',
        `select=*&product_id=eq.${encodeURIComponent(id)}&order=position.asc`,
        { zAutoryzacja: true }
      ) || [];
    } catch (err) {
      toast(`Zdjęcia produktu: ${err.message}`, true);
    }
  }
  rysujZdjeciaProduktu();
}

function rysujZdjeciaProduktu() {
  const ul = $('[data-pi-list]');
  const lista = stan.zdjeciaProduktu;
  $('[data-pi-count]').textContent = lista.length;

  ul.innerHTML = lista.map((z, i) => `
    <li class="pimg">
      <img src="${escapeHTML(z.image)}" alt="">
      <span class="pimg__nr">${i + 1}</span>
      <span class="pimg__akcje">
        <button type="button" title="W lewo" data-pi-lewo="${z.id}" ${i === 0 ? 'disabled' : ''}>←</button>
        <button type="button" title="W prawo" data-pi-prawo="${z.id}" ${i === lista.length - 1 ? 'disabled' : ''}>→</button>
        <button type="button" title="Usuń" data-pi-del="${z.id}">×</button>
      </span>
    </li>`).join('');

  $$('[data-pi-lewo]', ul).forEach(b => b.addEventListener('click', () => przesun(Number(b.dataset.piLewo), -1)));
  $$('[data-pi-prawo]', ul).forEach(b => b.addEventListener('click', () => przesun(Number(b.dataset.piPrawo), +1)));
  $$('[data-pi-del]', ul).forEach(b => b.addEventListener('click', () => skasujZdjecie(Number(b.dataset.piDel))));
}

/** Zamienia zdjęcie miejscami z sąsiadem i zapisuje obie pozycje. */
async function przesun(id, kierunek) {
  const lista = stan.zdjeciaProduktu;
  const i = lista.findIndex(z => z.id === id);
  const j = i + kierunek;
  if (i < 0 || j < 0 || j >= lista.length) return;

  try {
    await upsert('product_images', [
      { id: lista[i].id, product_id: lista[i].product_id, image: lista[i].image, position: j + 1 },
      { id: lista[j].id, product_id: lista[j].product_id, image: lista[j].image, position: i + 1 }
    ]);
    await wczytajZdjeciaProduktu(stan.wybrany);
  } catch (err) {
    toast(`Nie udało się przestawić: ${err.message}`, true);
  }
}

async function skasujZdjecie(id) {
  if (!confirm('Usunąć to zdjęcie z galerii produktu?')) return;
  try {
    await usun('product_images', `id=eq.${id}`);
    await wczytajZdjeciaProduktu(stan.wybrany);
    toast('Zdjęcie usunięte.');
  } catch (err) {
    toast(`Nie udało się usunąć: ${err.message}`, true);
  }
}

$('[data-pi-file]').addEventListener('change', async e => {
  const pliki = [...(e.target.files || [])];
  if (!pliki.length || !stan.wybrany) return;

  const stanEl = $('[data-pi-stan]');
  let nr = stan.zdjeciaProduktu.length;

  try {
    for (const [i, plik] of pliki.entries()) {
      stanEl.textContent = `Wgrywanie ${i + 1} z ${pliki.length}…`;
      const adres = await wgrajZdjecie(plik, `produkty/${stan.wybrany}`);
      await upsert('product_images', {
        product_id: stan.wybrany,
        image: adres,
        alt: $('[data-p-name]').value.trim() || null,
        position: ++nr
      });
    }
    stanEl.textContent = '';
    toast(pliki.length > 1 ? `Wgrano ${pliki.length} zdjęć.` : 'Zdjęcie wgrane.');
    await wczytajZdjeciaProduktu(stan.wybrany);
  } catch (err) {
    stanEl.textContent = '';
    toast(err.message, true);
  } finally {
    e.target.value = '';
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


/* ==================================================================== *
 * ZAKŁADKA „STRONA GŁÓWNA"
 *
 * Sceny i produkty siedziały w bazie, a strona główna czytała plik —
 * przez to nowa kategoria nie miała jak się na niej pojawić. Teraz
 * kategorie generują się ze scen, a resztę treści trzyma tabela site.
 * ==================================================================== */

$$('[data-zakladka]').forEach(b => b.addEventListener('click', () => {
  if (stan.brudne && !confirm('Masz niezapisane zmiany. Przełączyć widok?')) return;
  brudne(false);
  przelacz(b.dataset.zakladka);
}));

function przelacz(widok) {
  stan.widok = widok;
  $$('[data-zakladka]').forEach(b => b.classList.toggle('is-aktywna', b.dataset.zakladka === widok));
  $('[data-widok="sceny"]').hidden = widok !== 'sceny';
  $('[data-widok-strona]').hidden = widok !== 'strona';
  $('[data-widok-zdjecia]').hidden = widok !== 'zdjecia';
  $('[data-widok-sceny-wybor]').hidden = widok !== 'sceny';
  if (widok === 'strona') wczytajStrone();
  if (widok === 'zdjecia') wczytajBiblioteke();
}

async function wczytajStrone() {
  if (stan.strona) return;                    // już wczytane

  try {
    const wiersze = await select('site', 'select=value&key=eq.home', { zAutoryzacja: true });
    stan.strona = wiersze?.[0]?.value || null;
  } catch (err) {
    return toast('Nie udało się wczytać ustawień strony: ' + err.message, true);
  }

  if (!stan.strona) {
    return toast('Brak wiersza site/home w bazie — uruchom db/site.sql.', true);
  }

  const d = stan.strona;
  $('[data-s-brand]').value = d.brand || '';
  $('[data-s-search]').value = d.searchPlaceholder || '';
  $('[data-s-products-title]').value = d.productsTitle || '';
  $('[data-s-cats-title]').value = d.categoriesTitle || '';

  $('[data-s-coll-title]').value = d.collectionsTitle || '';
  $('[data-s-coll-all]').value = d.collectionsAllLabel || '';
  $('[data-s-ftr-about]').value = d.footer?.about || '';
  $('[data-s-ftr-legal]').value = d.footer?.legal || '';

  rysujKategorie();
  rysujHero();
  rysujWyroznione();
  rysujSekcje();
}

/* ---------- kategorie = sceny ---------- */

function rysujKategorie() {
  const ul = $('[data-kat-list]');

  if (!stan.sceny.length) {
    ul.innerHTML = '<li class="pusto">Nie masz jeszcze żadnej sceny. Dodaj ją w zakładce obok.</li>';
    return;
  }

  ul.innerHTML = stan.sceny.map(s => `
    <li class="kat" data-kat="${escapeHTML(s.id)}">
      <div class="kat__kolo">${s.thumb || s.image
        ? `<img src="${escapeHTML(s.thumb || s.image)}" alt="">`
        : '<span>brak</span>'}</div>
      <div class="kat__pola">
        <p class="kat__nazwa">${escapeHTML(s.label || s.id)}
          <span class="kat__stan">${s.published ? 'widoczna' : 'szkic — niewidoczna'}</span>
        </p>
        <div class="kat__akcje">
          <label class="upload">
            <input type="file" accept="image/*" hidden data-kat-file>
            <span class="mini">Miniatura do kółka</span>
          </label>
          <input class="kat__badge" placeholder="Plakietka, np. NOWE" value="${escapeHTML(s.badge || '')}" data-kat-badge>
          <button class="mini" type="button" data-kat-save>Zapisz</button>
          <span class="upload__stan" data-kat-stan></span>
        </div>
      </div>
    </li>`).join('');

  $$('.kat', ul).forEach(li => {
    const id = li.dataset.kat;

    $('[data-kat-save]', li).addEventListener('click', async () => {
      try {
        await upsert('scenes', { id, badge: $('[data-kat-badge]', li).value.trim() || null });
        toast('Zapisane.');
        await wczytajSceny();
        rysujKategorie();
      } catch (err) { toast(err.message, true); }
    });

    $('[data-kat-file]', li).addEventListener('change', async e => {
      const plik = e.target.files?.[0];
      if (!plik) return;
      const st = $('[data-kat-stan]', li);
      st.textContent = 'Wgrywanie…';
      try {
        const adres = await wgrajZdjecie(plik, 'kategorie');
        await upsert('scenes', { id, thumb: adres });
        st.textContent = '';
        toast('Miniatura ustawiona.');
        await wczytajSceny();
        rysujKategorie();
      } catch (err) {
        st.textContent = '';
        toast(err.message, true);
      } finally {
        e.target.value = '';
      }
    });
  });
}

/* ---------- karuzela na górze ---------- */

function rysujHero() {
  const slajdy = stan.strona.hero || [];
  $('[data-hero-count]').textContent = slajdy.length;

  const ul = $('[data-hero-list]');
  if (!slajdy.length) {
    ul.innerHTML = '<li class="pusto">Brak slajdów.</li>';
    return;
  }

  ul.innerHTML = slajdy.map((h, i) => `
    <li class="gitem" data-hero="${i}">
      <div class="gitem__foto">${h.image ? `<img src="${escapeHTML(h.image)}" alt="">` : 'brak zdjęcia'}</div>
      <div class="gitem__pola">
        <input placeholder="Nadtytuł" value="${escapeHTML(h.badge || '')}" data-h-badge>
        <textarea rows="2" placeholder="Hasło" data-h-title>${escapeHTML(h.title || '')}</textarea>
        <textarea rows="2" placeholder="Opis" data-h-text>${escapeHTML(h.text || '')}</textarea>
        <div class="gitem__akcje">
          <label class="upload">
            <input type="file" accept="image/*" hidden data-h-file>
            <span class="mini">Wgraj zdjęcie</span>
          </label>
          <button class="mini mini--danger" type="button" data-h-del>Usuń slajd</button>
          <span class="upload__stan" data-h-stan></span>
        </div>
      </div>
    </li>`).join('');

  $$('.gitem', ul).forEach(li => {
    const i = Number(li.dataset.hero);

    $$('input, textarea', li).forEach(el => el.addEventListener('input', () => {
      const h = stan.strona.hero[i];
      h.badge = $('[data-h-badge]', li).value;
      h.title = $('[data-h-title]', li).value;
      h.text  = $('[data-h-text]', li).value;
      brudne(true);
    }));

    $('[data-h-del]', li).addEventListener('click', () => {
      if (!confirm('Usunąć ten slajd?')) return;
      stan.strona.hero.splice(i, 1);
      rysujHero();
      brudne(true);
    });

    $('[data-h-file]', li).addEventListener('change', async e => {
      const plik = e.target.files?.[0];
      if (!plik) return;
      const st = $('[data-h-stan]', li);
      st.textContent = 'Wgrywanie…';
      try {
        stan.strona.hero[i].image = await wgrajZdjecie(plik, 'hero');
        st.textContent = '';
        rysujHero();
        brudne(true);
        toast('Zdjęcie wgrane. Pamiętaj o zapisaniu strony.');
      } catch (err) {
        st.textContent = '';
        toast(err.message, true);
      } finally {
        e.target.value = '';
      }
    });
  });
}

$('[data-hero-new]').addEventListener('click', () => {
  if (!stan.strona) return;
  (stan.strona.hero ||= []).push({
    badge: 'NOWY SLAJD', title: 'Hasło', text: '',
    primary: { label: 'Przycisk', href: '#' }, image: ''
  });
  rysujHero();
  brudne(true);
});

/* ---------- wyróżnione produkty ---------- */

function rysujWyroznione() {
  const ids = stan.strona.featuredIds ||= [];
  const ul = $('[data-wyr-list]');

  ul.innerHTML = ids.length
    ? ids.map((id, i) => {
        const p = stan.wszystkieProdukty.find(q => q.id === id);
        return `
          <li class="wyb" data-wyb="${escapeHTML(id)}">
            <span class="wyb__nr">${i + 1}</span>
            <span class="wyb__nazwa">${escapeHTML(p ? p.name : id)}${p ? '' : ' — nie ma takiego produktu'}</span>
            <button type="button" data-wyb-gora ${i === 0 ? 'disabled' : ''} aria-label="W górę">&uarr;</button>
            <button type="button" data-wyb-dol ${i === ids.length - 1 ? 'disabled' : ''} aria-label="W dół">&darr;</button>
            <button type="button" data-wyb-usun aria-label="Usuń">&times;</button>
          </li>`;
      }).join('')
    : '<li class="pusto">Nic nie wybrano — sekcja będzie pusta.</li>';

  $$('.wyb', ul).forEach(li => {
    const i = ids.indexOf(li.dataset.wyb);
    $('[data-wyb-gora]', li).addEventListener('click', () => przestaw(ids, i, -1));
    $('[data-wyb-dol]', li).addEventListener('click', () => przestaw(ids, i, +1));
    $('[data-wyb-usun]', li).addEventListener('click', () => {
      ids.splice(i, 1);
      rysujWyroznione();
      brudne(true);
    });
  });

  const sel = $('[data-wyr-select]');
  const wolne = stan.wszystkieProdukty.filter(p => !ids.includes(p.id));
  sel.innerHTML = '<option value="">— wybierz produkt —</option>' +
    wolne.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)} · ${escapeHTML(p.scene_id || '')}</option>`).join('');
  sel.onchange = () => {
    if (!sel.value) return;
    ids.push(sel.value);
    rysujWyroznione();
    brudne(true);
  };
}

function przestaw(tab, i, o) {
  const j = i + o;
  if (j < 0 || j >= tab.length) return;
  [tab[i], tab[j]] = [tab[j], tab[i]];
  rysujWyroznione();
  brudne(true);
}


/* ------------------------------------------------------------------ *
 * Generyczny edytor sekcji
 *
 * Kafelki, kolekcje, wartości i pasek zaufania to w gruncie rzeczy ta
 * sama rzecz: lista bloków z tytułem, opisem, odnośnikiem i zdjęciem.
 * Zamiast czterech osobnych formularzy jest jeden, opisany zestawem pól.
 * ------------------------------------------------------------------ */

const IKONY_DO_WYBORU = [
  ['truck', 'ciężarówka'], ['return', 'zwrot'], ['shield', 'tarcza'], ['help', 'słuchawki'],
  ['star', 'gwiazdka'], ['tag', 'metka'], ['trend', 'wykres'], ['people', 'ludzie']
];

/**
 * @param {string} sel        gdzie wstawić
 * @param {object[]|object} dane  tablica bloków albo pojedynczy blok
 * @param {object[]} pola     [{k, label, typ}]  typ: text|obszar|zdjecie|ptaszek|ikona|linie
 * @param {object} opcje      {folder, licznik, poZmianie}
 */
function edytorSekcji(sel, dane, pola, opcje = {}) {
  const box = $(sel);
  if (!box) return;

  const lista = Array.isArray(dane) ? dane : [dane];
  const pojedynczy = !Array.isArray(dane);

  if (opcje.licznik) $(opcje.licznik).textContent = lista.length;

  if (!lista.length) {
    box.innerHTML = '<p class="pusto">Nic tu jeszcze nie ma.</p>';
    return;
  }

  box.innerHTML = lista.map((el, i) => `
    <div class="blok" data-blok="${i}">
      ${pojedynczy ? '' : `<div class="blok__gora">
        <span class="blok__nr">${i + 1}</span>
        <button class="mini" type="button" data-blok-gora ${i === 0 ? 'disabled' : ''}>&uarr;</button>
        <button class="mini" type="button" data-blok-dol ${i === lista.length - 1 ? 'disabled' : ''}>&darr;</button>
        <button class="mini mini--danger" type="button" data-blok-usun>Usuń</button>
      </div>`}
      <div class="blok__pola">
        ${pola.map(f => polePodglad(f, el)).join('')}
      </div>
    </div>`).join('');

  $$('.blok', box).forEach((div, i) => {
    const el = lista[i];

    // zapisujemy prosto w obiekcie — zapis całej strony bierze go potem
    $$('[data-pole]', div).forEach(input => {
      const klucz = input.dataset.pole;
      const typ = input.dataset.typ;
      input.addEventListener(typ === 'ptaszek' ? 'change' : 'input', () => {
        if (typ === 'ptaszek') el[klucz] = input.checked;
        else if (typ === 'linie') el[klucz] = input.value.split('\n').map(t => t.trim()).filter(Boolean);
        else el[klucz] = input.value;
        brudne(true);
      });
    });

    const plik = $('[data-blok-foto]', div);
    if (plik) {
      plik.addEventListener('change', async e => {
        const f = e.target.files?.[0];
        if (!f) return;
        const st = $('[data-blok-stan]', div);
        st.textContent = 'Wgrywanie…';
        try {
          el[plik.dataset.pole] = await wgrajZdjecie(f, opcje.folder || 'banery');
          st.textContent = '';
          brudne(true);
          opcje.poZmianie?.();
        } catch (err) {
          st.textContent = '';
          toast(err.message, true);
        } finally {
          e.target.value = '';
        }
      });
    }

    if (pojedynczy) return;
    $('[data-blok-gora]', div).addEventListener('click', () => { przestawBlok(lista, i, -1, opcje); });
    $('[data-blok-dol]',  div).addEventListener('click', () => { przestawBlok(lista, i, +1, opcje); });
    $('[data-blok-usun]', div).addEventListener('click', () => {
      if (!confirm('Usunąć ten blok?')) return;
      lista.splice(i, 1);
      brudne(true);
      opcje.poZmianie?.();
    });
  });
}

function polePodglad(f, el) {
  const v = el[f.k];
  if (f.typ === 'zdjecie') {
    return `
      <div class="blok__foto">
        <div class="blok__podglad">${v ? `<img src="${escapeHTML(v)}" alt="">` : 'brak zdjęcia'}</div>
        <label class="upload">
          <input type="file" accept="image/*" hidden data-blok-foto data-pole="${f.k}">
          <span class="mini">${v ? 'Podmień zdjęcie' : 'Wgraj zdjęcie'}</span>
        </label>
        <span class="upload__stan" data-blok-stan></span>
      </div>`;
  }
  if (f.typ === 'ptaszek') {
    return `<label class="chk"><input type="checkbox" data-pole="${f.k}" data-typ="ptaszek" ${v ? 'checked' : ''}><span>${f.label}</span></label>`;
  }
  if (f.typ === 'ikona') {
    return `<label class="fld"><span class="fld__label">${f.label}</span>
      <select data-pole="${f.k}" data-typ="ikona">${IKONY_DO_WYBORU.map(([id, n]) =>
        `<option value="${id}" ${v === id ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
  }
  if (f.typ === 'obszar' || f.typ === 'linie') {
    const tekst = f.typ === 'linie' ? (Array.isArray(v) ? v.join('\n') : '') : (v || '');
    return `<label class="fld"><span class="fld__label">${f.label}</span>
      <textarea rows="${f.typ === 'linie' ? 4 : 2}" data-pole="${f.k}" data-typ="${f.typ}">${escapeHTML(tekst)}</textarea></label>`;
  }
  return `<label class="fld"><span class="fld__label">${f.label}</span>
    <input data-pole="${f.k}" value="${escapeHTML(v || '')}"></label>`;
}

function przestawBlok(lista, i, o, opcje) {
  const j = i + o;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  brudne(true);
  opcje.poZmianie?.();
}

/* ---------- podpięcie wszystkich sekcji ---------- */

const POLA_BLOKU = [
  { k: 'kicker', label: 'Nadtytuł (opcjonalny)' },
  { k: 'title',  label: 'Tytuł' },
  { k: 'text',   label: 'Opis', typ: 'obszar' },
  { k: 'cta',    label: 'Napis na przycisku' },
  { k: 'href',   label: 'Dokąd prowadzi' },
  { k: 'image',  typ: 'zdjecie' }
];

function rysujSekcje() {
  const d = stan.strona;
  d.nav ||= []; d.tiles ||= []; d.trust ||= []; d.values ||= [];
  d.collections ||= { featured: {}, side: [] };
  d.collections.side ||= [];
  d.footer ||= { columns: [] };
  d.footer.columns ||= [];

  edytorSekcji('[data-ed-nav]', d.nav, [
    { k: 'label', label: 'Napis' },
    { k: 'href',  label: 'Dokąd prowadzi (puste, gdy rozwijana lista)' },
    { k: 'dropdown', label: 'Rozwijana lista kategorii — wpisz: kategorie' }
  ], { licznik: '[data-cnt-nav]', poZmianie: rysujSekcje });

  edytorSekcji('[data-ed-tiles]', d.tiles,
    [...POLA_BLOKU, { k: 'dark', label: 'Ciemny kafelek', typ: 'ptaszek' }],
    { folder: 'produkty', licznik: '[data-cnt-tiles]', poZmianie: rysujSekcje });

  edytorSekcji('[data-ed-coll-main]', d.collections.featured, POLA_BLOKU,
    { folder: 'kolekcje', poZmianie: rysujSekcje });

  edytorSekcji('[data-ed-coll-side]', d.collections.side, POLA_BLOKU,
    { folder: 'kolekcje', licznik: '[data-cnt-side]', poZmianie: rysujSekcje });

  edytorSekcji('[data-ed-trust]', d.trust, [
    { k: 'icon',  label: 'Ikonka', typ: 'ikona' },
    { k: 'title', label: 'Tytuł' },
    { k: 'text',  label: 'Opis' }
  ], { licznik: '[data-cnt-trust]', poZmianie: rysujSekcje });

  edytorSekcji('[data-ed-values]', d.values, [
    { k: 'icon',  label: 'Ikonka', typ: 'ikona' },
    { k: 'title', label: 'Tytuł' },
    { k: 'text',  label: 'Opis' }
  ], { licznik: '[data-cnt-values]', poZmianie: rysujSekcje });

  edytorSekcji('[data-ed-about]', d.about ||= {}, POLA_BLOKU,
    { folder: 'banery', poZmianie: rysujSekcje });

  edytorSekcji('[data-ed-news]', d.newsletter ||= {}, [
    { k: 'title',       label: 'Tytuł' },
    { k: 'text',        label: 'Zachęta' },
    { k: 'placeholder', label: 'Podpowiedź w polu e-mail' },
    { k: 'cta',         label: 'Napis na przycisku' }
  ], { poZmianie: rysujSekcje });

  edytorSekcji('[data-ed-ftr]', d.footer.columns, [
    { k: 'title', label: 'Nagłówek kolumny' },
    { k: 'links', label: 'Odnośniki — jeden na linię', typ: 'linie' }
  ], { licznik: '[data-cnt-ftr]', poZmianie: rysujSekcje });
}

const DODAJ = {
  '[data-add-nav]':    () => stan.strona.nav.push({ label: 'Nowa pozycja', href: '#' }),
  '[data-add-tiles]':  () => stan.strona.tiles.push({ title: 'Nowy kafelek', text: '', cta: 'Zobacz', href: '#', image: '' }),
  '[data-add-side]':   () => stan.strona.collections.side.push({ title: 'Nowa kolekcja', text: '', cta: 'Zobacz', href: '#', image: '' }),
  '[data-add-trust]':  () => stan.strona.trust.push({ icon: 'star', title: 'Nowa pozycja', text: '' }),
  '[data-add-values]': () => stan.strona.values.push({ icon: 'star', title: 'Nowa wartość', text: '' }),
  '[data-add-ftr]':    () => stan.strona.footer.columns.push({ title: 'Nowa kolumna', links: [] })
};

Object.entries(DODAJ).forEach(([sel, akcja]) => {
  $(sel)?.addEventListener('click', () => {
    if (!stan.strona) return toast('Najpierw wczytaj stronę główną.', true);
    akcja();
    rysujSekcje();
    brudne(true);
  });
});

/* ---------- zapis ---------- */

$('[data-s-save]').addEventListener('click', async () => {
  if (!stan.strona) return;

  const d = stan.strona;
  const nowa = {
    ...d,
    brand: $('[data-s-brand]').value.trim(),
    searchPlaceholder: $('[data-s-search]').value.trim(),
    productsTitle: $('[data-s-products-title]').value.trim(),
    categoriesTitle: $('[data-s-cats-title]').value.trim(),
    collectionsTitle: $('[data-s-coll-title]').value.trim(),
    collectionsAllLabel: $('[data-s-coll-all]').value.trim(),
    footer: {
      ...(d.footer || {}),
      about: $('[data-s-ftr-about]').value.trim(),
      legal: $('[data-s-ftr-legal]').value.trim()
    }
  };

  try {
    await upsert('site', { key: 'home', value: nowa, updated_at: new Date().toISOString() });
    stan.strona = nowa;
    brudne(false);
    toast('Strona główna zapisana.');
  } catch (err) {
    toast('Nie udało się zapisać: ' + err.message, true);
  }
});

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Biblioteka zdjęć
 *
 * Wszystkie wgrane pliki w jednym miejscu: wrzucasz wiele naraz,
 * widzisz co już jest, kopiujesz adres albo kasujesz.
 *
 * Storage nie ma prawdziwych folderów — folder to tylko przedrostek
 * w nazwie pliku. Dlatego zawsze oglądamy jeden przedrostek naraz,
 * a nie „wszystko", którego API i tak by nie zwróciło jednym strzałem.
 * ------------------------------------------------------------------ */

async function wczytajBiblioteke() {
  const siatka = $('[data-bib-siatka]');
  const folder = $('[data-bib-folder]').value;

  siatka.innerHTML = '<p class="bib__pusto">Wczytywanie…</p>';

  let pliki = [];
  try {
    pliki = await listaZdjec(folder);
  } catch (err) {
    siatka.innerHTML = '';
    return toast(`Nie udało się wczytać zdjęć: ${err.message}`, true);
  }

  stan.biblioteka = pliki;
  $('[data-bib-pusto]').hidden = pliki.length > 0;

  siatka.innerHTML = pliki.map(p => `
    <figure class="bib__kafel" data-sciezka="${escapeHTML(p.sciezka)}">
      <button class="bib__foto" type="button" title="Kopiuj adres">
        <img src="${escapeHTML(p.adres)}" alt="" loading="lazy">
      </button>
      <figcaption class="bib__opis">
        <span class="bib__nazwa" title="${escapeHTML(p.nazwa)}">${escapeHTML(p.nazwa)}</span>
        <span class="bib__waga">${p.rozmiar ? Math.round(p.rozmiar / 1024) + ' kB' : ''}</span>
      </figcaption>
      <button class="bib__kasuj mini mini--danger" type="button" title="Usuń z serwera">Usuń</button>
    </figure>`).join('');
}

/** Kopiowanie adresu — z zapasowym sposobem, gdy schowek jest zablokowany. */
async function skopiuj(tekst) {
  try {
    await navigator.clipboard.writeText(tekst);
    return true;
  } catch {
    const pole = document.createElement('textarea');
    pole.value = tekst;
    pole.style.position = 'fixed';
    pole.style.opacity = '0';
    document.body.appendChild(pole);
    pole.select();
    const ok = document.execCommand?.('copy');
    pole.remove();
    return Boolean(ok);
  }
}

$('[data-bib-siatka]')?.addEventListener('click', async e => {
  const kafel = e.target.closest('.bib__kafel');
  if (!kafel) return;

  const sciezka = kafel.dataset.sciezka;
  const plik = stan.biblioteka.find(p => p.sciezka === sciezka);
  if (!plik) return;

  if (e.target.closest('.bib__kasuj')) {
    // Zdjęcie może gdzieś wisieć na stronie — kasowanie zostawia po nim
    // puste miejsce, więc pytamy wprost.
    if (!confirm(`Usunąć „${plik.nazwa}" z serwera?\n\nJeśli jest gdzieś użyte, zostanie po nim puste miejsce.`)) return;
    try {
      await skasujZeStorage(sciezka);
      toast('Zdjęcie usunięte.');
      wczytajBiblioteke();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }

  if (e.target.closest('.bib__foto')) {
    const ok = await skopiuj(plik.adres);
    toast(ok ? 'Adres skopiowany.' : plik.adres, !ok);
  }
});

$('[data-bib-folder]')?.addEventListener('change', wczytajBiblioteke);

$('[data-bib-plik]')?.addEventListener('change', async e => {
  const pliki = [...(e.target.files || [])];
  if (!pliki.length) return;

  const folder = $('[data-bib-folder]').value;
  const stanEl = $('[data-bib-stan]');
  let udane = 0;

  for (const [i, plik] of pliki.entries()) {
    stanEl.textContent = `Wgrywanie ${i + 1} z ${pliki.length}…`;
    try {
      await wgrajZdjecie(plik, folder);
      udane++;
    } catch (err) {
      toast(`${plik.name}: ${err.message}`, true);
    }
  }

  stanEl.textContent = '';
  e.target.value = '';
  toast(udane === pliki.length
    ? `Wgrane: ${udane}.`
    : `Wgrane: ${udane} z ${pliki.length}.`, udane !== pliki.length);
  wczytajBiblioteke();
});

/** "" → null, "12,5" → 12.5. Puste pole nie może pójść do kolumny liczbowej. */
function liczbaAlbo(tekst) {
  const t = String(tekst ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

start();
