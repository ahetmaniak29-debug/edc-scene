/**
 * Koszyk.
 *
 * Siedzi w localStorage przeglądarki. Bramki płatności jeszcze nie ma,
 * więc koszyk niczego nie rezerwuje ani nie wysyła — zbiera wybór
 * użytkownika i czeka. Gdy dojdzie płatność, to jest miejsce, z którego
 * pójdzie zamówienie.
 *
 * Cena trzymana jest w groszach jako liczba, żeby sumowanie nie gubiło
 * końcówek na zaokrągleniach.
 */

const KLUCZ = 'sklep:koszyk:v1';

const sluchacze = new Set();

function czytaj() {
  try {
    const dane = JSON.parse(localStorage.getItem(KLUCZ) || '[]');
    return Array.isArray(dane) ? dane : [];
  } catch {
    return [];
  }
}

function zapisz(pozycje) {
  try {
    localStorage.setItem(KLUCZ, JSON.stringify(pozycje));
  } catch {
    /* tryb prywatny — koszyk po prostu nie przeżyje odświeżenia */
  }
  powiadom(pozycje);
}

function powiadom(pozycje) {
  sluchacze.forEach(cb => {
    try { cb(pozycje); } catch (err) { console.error(err); }
  });
}

/** Wywołuje cb od razu i przy każdej zmianie — także z innej karty. */
export function naZmiane(cb) {
  sluchacze.add(cb);
  cb(czytaj());
  return () => sluchacze.delete(cb);
}

window.addEventListener('storage', e => {
  if (e.key === KLUCZ) powiadom(czytaj());
});

/* ------------------------------------------------------------------ */

export const pobierz = () => czytaj();

export const ile = () => czytaj().reduce((s, p) => s + (p.ile || 0), 0);

export const suma = () => czytaj().reduce((s, p) => s + (p.groszy || 0) * (p.ile || 0), 0);

/**
 * @param {object} produkt {id, name, brand, priceCents, currency, image}
 * @param {number} ileSztuk
 */
export function dodaj(produkt, ileSztuk = 1) {
  const pozycje = czytaj();
  const juz = pozycje.find(p => p.id === produkt.id);

  if (juz) {
    juz.ile += ileSztuk;
  } else {
    pozycje.push({
      id: produkt.id,
      nazwa: produkt.name || produkt.nazwa || '',
      marka: produkt.brand || '',
      groszy: Number(produkt.priceCents) || 0,
      waluta: produkt.currency || 'PLN',
      zdjecie: produkt.image || produkt.images?.[0]?.src || '',
      ile: ileSztuk
    });
  }

  zapisz(pozycje);
  return pozycje;
}

export function ustawIlosc(id, ileSztuk) {
  let pozycje = czytaj();
  if (ileSztuk <= 0) {
    pozycje = pozycje.filter(p => p.id !== id);
  } else {
    const p = pozycje.find(q => q.id === id);
    if (p) p.ile = ileSztuk;
  }
  zapisz(pozycje);
  return pozycje;
}

export const usun = id => ustawIlosc(id, 0);

export function wyczysc() {
  zapisz([]);
}
