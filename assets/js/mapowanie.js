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
 * @param {object[]} zdjeciaProduktow wiersze z tabeli product_images
 * @param {object[]} kadry  sceny-dzieci (kolekcja) — wiersze z tabeli scenes
 */
export function zBazy(scena, produkty = [], zdjecia = [], zdjeciaProduktow = [], kadry = []) {
  // Zdjęcia pogrupowane po produkcie — jeden przebieg zamiast filtrowania w pętli.
  const wgProduktu = new Map();
  for (const z of zdjeciaProduktow) {
    if (!wgProduktu.has(z.product_id)) wgProduktu.set(z.product_id, []);
    wgProduktu.get(z.product_id).push({ src: adresObrazka(z.image), alt: z.alt || '' });
  }

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
      priceCents: p.price_cents ?? null,      // liczba dla koszyka, tekst dla oka
      currency: p.currency || 'PLN',
      why: p.why || '',
      specs: Array.isArray(p.specs) ? p.specs : [],
      url: p.url || '#',
      ctaLabel: p.cta_label || 'Zobacz u sprzedawcy',
      images: wgProduktu.get(p.id) || [],
      hotspot: {
        x: p.hotspot_x === null || p.hotspot_x === undefined ? 50 : Number(p.hotspot_x),
        y: p.hotspot_y === null || p.hotspot_y === undefined ? 50 : Number(p.hotspot_y)
      }
    })),

    gallery: zdjecia.map(z => ({
      image: adresObrazka(z.image),
      title: z.title || '',
      text: z.body || ''
    })),

    // Kolekcja: obszary na zdjęciu wnętrza, każdy prowadzi do zbliżenia.
    // Kadr bez prostokąta nie ma jak się pokazać na zdjęciu, więc odpada.
    kadry: kadry
      .filter(k => k.area_w !== null && k.area_w !== undefined && Number(k.area_w) > 0)
      .map(k => ({
        id: k.id,
        label: k.area_label || k.label || '',
        image: adresObrazka(k.image),
        area: {
          x: Number(k.area_x) || 0,
          y: Number(k.area_y) || 0,
          w: Number(k.area_w) || 0,
          h: Number(k.area_h) || 0
        }
      }))
  };
}
