/**
 * Tłumaczenie między kształtem bazy a kształtem, którego oczekuje strona.
 *
 * W bazie trzymamy dane surowo (cena jako liczba groszy, współrzędne jako
 * osobne kolumny), bo tak się je sortuje i liczy. Strona chce ich gotowych
 * do wyświetlenia. To miejsce, gdzie jedno zamienia się w drugie —
 * i jedyne, które trzeba ruszyć, gdy zmieni się schemat.
 */

/** 129900 → "1 299,00 zł" */
export function formatujCene(grosze, waluta = 'PLN') {
  if (grosze === null || grosze === undefined || grosze === '') return '';
  const liczba = Number(grosze);
  if (!Number.isFinite(liczba)) return '';
  try {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: waluta }).format(liczba / 100);
  } catch {
    return `${(liczba / 100).toFixed(2)} ${waluta}`;
  }
}

/** "1 299,00 zł" albo "1299" albo "1299,50" → 129950 */
export function naGrosze(tekst) {
  if (tekst === null || tekst === undefined) return null;
  const czysty = String(tekst).replace(/[^\d,.-]/g, '').replace(',', '.');
  if (czysty === '' || czysty === '-') return null;
  const liczba = Number(czysty);
  return Number.isFinite(liczba) ? Math.round(liczba * 100) : null;
}

/**
 * Adres zdjęcia. Storage zwraca pełny https, stare pliki leżą w repo
 * pod ścieżką względną — obie formy mają działać.
 */
export const adresObrazka = s => s || '';

/**
 * Składa scenę w kształt, którego używa reszta app.js.
 * @param {object} scena  wiersz z tabeli scenes
 * @param {object[]} produkty wiersze z tabeli products
 * @param {object[]} zdjecia  wiersze z tabeli scene_images
 */
export function zBazy(scena, produkty = [], zdjecia = []) {
  return {
    id: scena.id,
    label: scena.label || '',
    title: scena.title || '',
    subtitle: scena.subtitle || '',
    image: adresObrazka(scena.image),
    imageAlt: scena.image_alt || '',

    products: produkty.map(p => ({
      id: p.id,
      name: p.name || '',
      brand: p.brand || '',
      category: p.category || '',
      price: formatujCene(p.price_cents, p.currency || 'PLN'),
      why: p.why || '',
      specs: Array.isArray(p.specs) ? p.specs : [],
      url: p.url || '#',
      ctaLabel: p.cta_label || 'Zobacz u sprzedawcy',
      hotspot: {
        x: p.hotspot_x === null || p.hotspot_x === undefined ? 50 : Number(p.hotspot_x),
        y: p.hotspot_y === null || p.hotspot_y === undefined ? 50 : Number(p.hotspot_y)
      }
    })),

    gallery: zdjecia.map(z => ({
      image: adresObrazka(z.image),
      title: z.title || '',
      text: z.body || ''
    }))
  };
}
