/**
 * Licznik kliknięć.
 *
 * Mierzymy dwa zdarzenia na produkt:
 *   open     — ktoś otworzył panel produktu (zainteresowanie)
 *   outbound — ktoś kliknął przycisk do sprzedawcy (zamiar zakupu)
 *
 * Zapis idzie w dwa miejsca naraz:
 *   1. localStorage — natychmiast, bez sieci, ale liczy jedno urządzenie.
 *   2. Supabase     — prawdziwe dane od wszystkich odwiedzających.
 *
 * Konfiguracja siedzi w data/scenes.json → analytics.
 * Schemat bazy i uprawnienia: db/schema.sql.
 */

const KEY = 'scena:clicks:v1';

/* ------------------------------------------------------------------ *
 * Zapis lokalny
 * ------------------------------------------------------------------ */

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* tryb prywatny / brak miejsca — trudno, licznik lokalny jest tylko podglądem */
  }
}

export function getAll() {
  return read();
}

export function getScene(sceneId) {
  return read()[sceneId] || {};
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch {}
}

/* ------------------------------------------------------------------ *
 * Supabase
 * ------------------------------------------------------------------ */

const cfg = (a, sb) => ({
  url:     (sb?.url || '').replace(/\/+$/, ''),
  key:     sb?.anonKey || '',
  table:   a?.table || 'events',
  summary: a?.summaryView || 'events_summary'
});

const gotowe = c => Boolean(c.url && c.key);

const naglowki = key => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json'
});

/**
 * @param {object} opts
 * @param {string} opts.sceneId
 * @param {string} opts.productId
 * @param {'open'|'outbound'} opts.event
 * @param {string} [opts.category]
 * @param {object} [opts.analytics] blok analytics z data/scenes.json
 * @param {object} [opts.supabase] blok supabase z data/scenes.json
 */
export function track({ sceneId, productId, event, category, analytics, supabase }) {
  // 1. lokalnie — zawsze i natychmiast
  const data = read();
  const scene = (data[sceneId] ||= {});
  const item = (scene[productId] ||= { open: 0, outbound: 0 });
  item[event] = (item[event] || 0) + 1;
  item.last = new Date().toISOString();
  write(data);

  // 2. do bazy
  const c = cfg(analytics, supabase);
  if (!gotowe(c)) return;

  const row = {
    scene: sceneId,
    product: productId,
    category: category || null,
    event,
    viewport: window.innerWidth,
    referrer: document.referrer || null
  };

  // keepalive pozwala żądaniu dokończyć się po zamknięciu karty — bez tego
  // gubilibyśmy najważniejsze zdarzenie, bo przy 'outbound' użytkownik
  // natychmiast wychodzi na stronę sprzedawcy.
  // (sendBeacon by tu nie zadziałał — nie umie ustawić nagłówka apikey.)
  try {
    fetch(`${c.url}/rest/v1/${c.table}`, {
      method: 'POST',
      headers: { ...naglowki(c.key), Prefer: 'return=minimal' },
      body: JSON.stringify(row),
      keepalive: true,
      mode: 'cors'
    }).catch(() => {});   // zliczanie nigdy nie może popsuć strony
  } catch {}
}

/**
 * Próbuje pobrać zsumowane liczby z bazy.
 * Zwraca null, gdy widok nie jest udostępniony na zewnątrz (domyślnie nie jest)
 * albo gdy sieć nie odpowiada — wtedy strona pokazuje dane lokalne.
 */
export async function fetchSummary(sceneId, analytics, supabase) {
  const c = cfg(analytics, supabase);
  if (!gotowe(c)) return null;

  try {
    const res = await fetch(
      `${c.url}/rest/v1/${c.summary}?scene=eq.${encodeURIComponent(sceneId)}&select=*`,
      { headers: naglowki(c.key) }
    );
    if (!res.ok) return null;          // najczęściej 401: brak grantu na widok
    const rows = await res.json();
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}
