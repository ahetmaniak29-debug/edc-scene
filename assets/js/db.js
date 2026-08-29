/**
 * Cienka warstwa na REST-owe API Supabase — bez żadnej biblioteki.
 *
 * Projekt nie ma builda ani menedżera pakietów, więc zamiast wciągać
 * supabase-js z CDN-u (kolejna rzecz, która może paść albo się zmienić)
 * rozmawiamy z API wprost. To i tak tylko kilka adresów.
 *
 * Trzy obszary:
 *   Auth    — logowanie do panelu
 *   Dane    — odczyt i zapis tabel
 *   Storage — wgrywanie zdjęć
 */

const KLUCZ_SESJI = 'sklep:auth:v1';
const KUBELEK = 'zdjecia';

let cfg = null;

/**
 * fetch, który tłumaczy awarię sieci na zdanie po polsku.
 * Goły "Failed to fetch" nie mówi nic — a najczęstsza przyczyna jest
 * konkretna: projekt Supabase został uśpiony albo skasowany i jego
 * adres przestał istnieć.
 */
async function siec(url, opcje) {
  try {
    return await fetch(url, opcje);
  } catch (err) {
    const host = (() => { try { return new URL(url).host; } catch { return url; } })();
    throw new Error(
      `Brak połączenia z bazą (${host}). ` +
      'Sprawdź w panelu Supabase, czy projekt działa — uśpiony lub usunięty ' +
      'przestaje odpowiadać. Jeśli adres się zmienił, popraw go w data/scenes.json.'
    );
  }
}

/** Wczytuje adres projektu i klucz publikowalny z data/scenes.json. */
export async function initDb() {
  if (cfg) return cfg;
  const res = await fetch(`data/scenes.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`data/scenes.json → HTTP ${res.status}`);
  const json = await res.json();
  const s = json.supabase || {};
  cfg = {
    url: (s.url || '').replace(/\/+$/, ''),
    key: s.anonKey || '',
    plik: json
  };
  return cfg;
}

export const dbGotowa = () => Boolean(cfg?.url && cfg?.key);
export const konfiguracja = () => cfg;

/* ------------------------------------------------------------------ *
 * Sesja
 * ------------------------------------------------------------------ */

function zapiszSesje(s) {
  try {
    if (s) localStorage.setItem(KLUCZ_SESJI, JSON.stringify(s));
    else localStorage.removeItem(KLUCZ_SESJI);
  } catch {}
}

function odczytajSesje() {
  try {
    return JSON.parse(localStorage.getItem(KLUCZ_SESJI) || 'null');
  } catch {
    return null;
  }
}

/** Sekundy do wygaśnięcia tokenu (z ładunku JWT, bez weryfikacji podpisu). */
function zostaloSekund(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return (payload.exp || 0) - Math.floor(Date.now() / 1000);
  } catch {
    return 0;
  }
}

/**
 * Zwraca ważny token dostępu albo null.
 * Odświeża go sam, gdy zostało mniej niż minuta.
 */
export async function token() {
  const s = odczytajSesje();
  if (!s?.access_token) return null;

  if (zostaloSekund(s.access_token) > 60) return s.access_token;

  if (!s.refresh_token) { zapiszSesje(null); return null; }

  const res = await siec(`${cfg.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: cfg.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token })
  });

  if (!res.ok) { zapiszSesje(null); return null; }

  const nowa = await res.json();
  zapiszSesje(nowa);
  return nowa.access_token || null;
}

export async function zalogowany() {
  return Boolean(await token());
}

export function ktoZalogowany() {
  return odczytajSesje()?.user?.email || null;
}

/** Hasło wpisuje użytkownik w formularzu — nigdzie go nie zapisujemy. */
export async function zaloguj(email, haslo) {
  const res = await siec(`${cfg.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: cfg.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: haslo })
  });

  const dane = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(dane.error_description || dane.msg || dane.message || `Błąd logowania (${res.status})`);
  }

  zapiszSesje(dane);
  return dane;
}

export async function wyloguj() {
  const t = await token();
  if (t) {
    siec(`${cfg.url}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: cfg.key, Authorization: `Bearer ${t}` }
    }).catch(() => {});
  }
  zapiszSesje(null);
}

/* ------------------------------------------------------------------ *
 * Dane
 * ------------------------------------------------------------------ */

async function naglowki({ zAutoryzacja = false, dodatkowe = {} } = {}) {
  const h = { apikey: cfg.key, 'Content-Type': 'application/json', ...dodatkowe };
  if (zAutoryzacja) {
    const t = await token();
    if (t) h.Authorization = `Bearer ${t}`;
  }
  return h;
}

async function wynik(res) {
  const tekst = await res.text();
  if (!res.ok) {
    let msg = tekst;
    try { msg = JSON.parse(tekst).message || tekst; } catch {}
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return tekst ? JSON.parse(tekst) : null;
}

/** Odczyt. Przykład: select('products', 'scene_id=eq.edc&order=position') */
export async function select(tabela, zapytanie = '', { zAutoryzacja = false } = {}) {
  const res = await siec(`${cfg.url}/rest/v1/${tabela}?${zapytanie}`, {
    headers: await naglowki({ zAutoryzacja })
  });
  return wynik(res);
}

/** Zapis z nadpisaniem po kluczu głównym. Wymaga zalogowania. */
export async function upsert(tabela, wiersze) {
  const res = await siec(`${cfg.url}/rest/v1/${tabela}`, {
    method: 'POST',
    headers: await naglowki({
      zAutoryzacja: true,
      dodatkowe: { Prefer: 'resolution=merge-duplicates,return=representation' }
    }),
    body: JSON.stringify(Array.isArray(wiersze) ? wiersze : [wiersze])
  });
  return wynik(res);
}

/** Kasowanie. Przykład: usun('products', 'id=eq.latarka-aa') */
export async function usun(tabela, zapytanie) {
  if (!zapytanie) throw new Error('Kasowanie bez warunku jest zablokowane.');
  const res = await siec(`${cfg.url}/rest/v1/${tabela}?${zapytanie}`, {
    method: 'DELETE',
    headers: await naglowki({ zAutoryzacja: true, dodatkowe: { Prefer: 'return=representation' } })
  });
  return wynik(res);
}

/* ------------------------------------------------------------------ *
 * Zdjęcia
 * ------------------------------------------------------------------ */

/** Adres, pod którym zdjęcie widzi każdy odwiedzający. */
export function adresZdjecia(sciezka) {
  return `${cfg.url}/storage/v1/object/public/${KUBELEK}/${sciezka}`;
}

/**
 * Wgrywa plik i zwraca jego publiczny adres.
 * @param {File} plik
 * @param {string} folder np. 'sceny' albo 'produkty'
 */
export async function wgrajZdjecie(plik, folder = 'inne') {
  const t = await token();
  if (!t) throw new Error('Najpierw się zaloguj.');

  // Nazwa bez polskich znaków i spacji — inaczej adres się sypie.
  const czysta = plik.name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const sciezka = `${folder}/${Date.now()}-${czysta}`;

  const res = await siec(`${cfg.url}/storage/v1/object/${KUBELEK}/${sciezka}`, {
    method: 'POST',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${t}`,
      'Content-Type': plik.type || 'application/octet-stream',
      'x-upsert': 'true'
    },
    body: plik
  });

  if (!res.ok) {
    const tekst = await res.text();
    throw new Error(`Nie udało się wgrać zdjęcia: ${tekst.slice(0, 160)}`);
  }

  return adresZdjecia(sciezka);
}

/* ---------- biblioteka zdjęć ---------- */

/**
 * Zawartość kubełka. Storage nie ma prawdziwych folderów — to tylko
 * przedrostki w nazwie pliku — więc listę bierzemy per przedrostek.
 * Wpisy bez `id` to właśnie przedrostki, nie pliki.
 */
export async function listaZdjec(folder = '', { limit = 200 } = {}) {
  const t = await token();
  if (!t) throw new Error('Najpierw się zaloguj.');

  const res = await siec(`${cfg.url}/storage/v1/object/list/${KUBELEK}`, {
    method: 'POST',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${t}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prefix: folder ? `${folder}/` : '',
      limit,
      offset: 0,
      sortBy: { column: 'created_at', order: 'desc' }
    })
  });

  const lista = await wynik(res) || [];
  return lista
    .filter(w => w.id)                       // pomijamy same przedrostki
    .map(w => ({
      nazwa: w.name,
      sciezka: folder ? `${folder}/${w.name}` : w.name,
      adres: adresZdjecia(folder ? `${folder}/${w.name}` : w.name),
      rozmiar: w.metadata?.size ?? null,
      kiedy: w.created_at || w.updated_at || null
    }));
}

/** Foldery (przedrostki) w kubełku. */
export async function folderyZdjec() {
  const t = await token();
  if (!t) throw new Error('Najpierw się zaloguj.');

  const res = await siec(`${cfg.url}/storage/v1/object/list/${KUBELEK}`, {
    method: 'POST',
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${t}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prefix: '', limit: 100, offset: 0 })
  });

  const lista = await wynik(res) || [];
  return lista.filter(w => !w.id).map(w => w.name);
}

/** Kasowanie pliku z kubełka. Ścieżka, nie adres. */
export async function skasujZdjecie(sciezka) {
  const t = await token();
  if (!t) throw new Error('Najpierw się zaloguj.');

  const res = await siec(`${cfg.url}/storage/v1/object/${KUBELEK}/${sciezka}`, {
    method: 'DELETE',
    headers: { apikey: cfg.key, Authorization: `Bearer ${t}` }
  });

  if (!res.ok) {
    const tekst = await res.text();
    throw new Error(`Nie udało się skasować: ${tekst.slice(0, 160)}`);
  }
  return true;
}
