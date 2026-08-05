/**
 * Licznik kliknięć.
 *
 * Zapisuje dwa zdarzenia na produkt:
 *   open     — ktoś otworzył panel produktu (zainteresowanie)
 *   outbound — ktoś kliknął przycisk do sprzedawcy (zamiar zakupu)
 *
 * Zapis lokalny (localStorage) działa zawsze i bez konfiguracji, ale liczy
 * tylko na jednym urządzeniu. Żeby zbierać dane od wszystkich odwiedzających,
 * ustaw analytics.endpoint w data/scenes.json — patrz README.
 */

const KEY = 'scena:clicks:v1';

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
    /* tryb prywatny / brak miejsca — trudno, licznik jest opcjonalny */
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

/**
 * @param {object} opts
 * @param {string} opts.sceneId
 * @param {string} opts.productId
 * @param {'open'|'outbound'} opts.event
 * @param {string} [opts.category]
 * @param {string} [opts.endpoint] adres zdalnego zbierania (opcjonalny)
 */
export function track({ sceneId, productId, event, category, endpoint }) {
  const data = read();
  const scene = (data[sceneId] ||= {});
  const item = (scene[productId] ||= { open: 0, outbound: 0 });
  item[event] = (item[event] || 0) + 1;
  item.last = new Date().toISOString();
  write(data);

  if (!endpoint) return;

  const payload = JSON.stringify({
    scene: sceneId,
    product: productId,
    category: category || null,
    event,
    ts: new Date().toISOString(),
    ref: document.referrer || null,
    w: window.innerWidth
  });

  // sendBeacon przeżywa zamknięcie karty — kluczowe przy 'outbound',
  // bo użytkownik zaraz wychodzi na stronę sprzedawcy.
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([payload], { type: 'text/plain;charset=UTF-8' }));
      return;
    }
  } catch {}

  try {
    fetch(endpoint, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: payload
    }).catch(() => {});
  } catch {}
}
