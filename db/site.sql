-- =============================================================
--  Treść strony głównej w bazie
--
--  Do tej pory strona główna czytała plik data/home.json, a sceny
--  siedziały już w bazie. Przez to nowa kategoria dodana w panelu
--  nie miała jak pojawić się na stronie głównej.
--
--  Teraz:
--   • kategorie generują się z tabeli scenes — każda opublikowana
--     scena jest kategorią i sama się linkuje,
--   • reszta treści leży w tabeli site pod kluczem 'home',
--   • plik data/home.json zostaje jako koło ratunkowe.
--
--  URUCHOM: Supabase → SQL Editor → wklej → Run. Idempotentne.
--  Wymaga wcześniejszego db/products.sql.
-- =============================================================


-- -------------------------------------------------------------
--  1. Miniatura kategorii przy scenie
--     Zdjęcie sceny jest szerokie, a kółko kategorii kwadratowe —
--     dlatego osobne pole.
-- -------------------------------------------------------------
alter table public.scenes add column if not exists thumb text;
alter table public.scenes add column if not exists badge text;


-- -------------------------------------------------------------
--  2. Ustawienia strony
--     Jeden wiersz na sekcję. Na razie używamy klucza 'home'.
-- -------------------------------------------------------------
create table if not exists public.site (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site enable row level security;

drop policy if exists "anon czyta ustawienia" on public.site;
create policy "anon czyta ustawienia"
  on public.site for select to anon using (true);

drop policy if exists "zalogowany zarzadza ustawieniami" on public.site;
create policy "zalogowany zarzadza ustawieniami"
  on public.site for all to authenticated using (true) with check (true);


-- -------------------------------------------------------------
--  3. Przeniesienie tego, co dziś siedzi w data/home.json
--     Puszczane ponownie NIE nadpisuje Twoich zmian z panelu.
-- -------------------------------------------------------------
insert into public.site (key, value) values ('home', '{
  "brand": "NAZWA SKLEPU",
  "searchPlaceholder": "Szukaj produktów, marek i nie tylko...",
  "nav": [
    { "label": "Sklep",     "href": "#", "dropdown": true },
    { "label": "Kategorie", "href": "#", "dropdown": true },
    { "label": "Nowości",   "href": "#" },
    { "label": "Wyprzedaż", "href": "#" },
    { "label": "Marki",     "href": "#" }
  ],
  "hero": [
    {
      "badge": "NAGŁÓWEK SEKCJI",
      "title": "Główne hasło.\nDruga linia.",
      "text": "Miejsce na jedno–dwa zdania, które tłumaczą, o co chodzi w sklepie.",
      "primary":   { "label": "Przycisk główny", "href": "#" },
      "secondary": { "label": "Przycisk drugi",  "href": "#" },
      "image": ""
    }
  ],
  "trust": [
    { "icon": "truck",  "title": "Darmowa dostawa",      "text": "Przy zamówieniach powyżej X zł" },
    { "icon": "return", "title": "Łatwe zwroty",         "text": "30 dni na zwrot towaru" },
    { "icon": "shield", "title": "Bezpieczne płatności", "text": "Szyfrowana transakcja" },
    { "icon": "help",   "title": "Wsparcie 24/7",        "text": "Jesteśmy do dyspozycji" }
  ],
  "categoriesTitle": "Kategorie",
  "categoriesAllLabel": "Zobacz wszystkie kategorie",
  "tiles": [
    { "title": "Kafelek pierwszy", "text": "Jedno zdanie opisu.", "cta": "Zobacz", "href": "#", "image": "" },
    { "title": "Kafelek drugi",    "text": "Jedno zdanie opisu.", "cta": "Zobacz", "href": "#", "image": "" },
    { "title": "Kafelek trzeci",   "text": "Jedno zdanie opisu.", "cta": "Zobacz", "href": "#", "image": "" },
    { "title": "Hasło promocyjne", "text": "Warunki promocji.", "cta": "Przejdź do promocji", "href": "#", "image": "", "dark": true, "kicker": "OFERTA OGRANICZONA CZASOWO" }
  ],
  "collectionsTitle": "Wybrane kolekcje",
  "collectionsAllLabel": "Zobacz wszystkie kolekcje",
  "collections": {
    "featured": { "kicker": "PODPIS NAD TYTUŁEM", "title": "Nazwa kolekcji", "text": "Dwa krótkie zdania o tym, co jest w tej kolekcji i dla kogo.", "cta": "Zobacz kolekcję", "href": "#", "image": "" },
    "side": [
      { "title": "Kolekcja druga",  "text": "Krótki podpis pod tytułem.", "cta": "Zobacz", "href": "#", "image": "" },
      { "title": "Kolekcja trzecia","text": "Krótki podpis pod tytułem.", "cta": "Zobacz", "href": "#", "image": "" }
    ]
  },
  "productsTitle": "Najczęściej kupowane",
  "productsAllLabel": "Zobacz wszystkie produkty",
  "featuredIds": [],
  "about": { "kicker": "O NAS", "title": "Hasło o marce.", "text": "Dwa–trzy zdania o tym, kim jesteście i dlaczego warto u was kupować.", "cta": "Dowiedz się więcej", "href": "#", "image": "" },
  "values": [
    { "icon": "star",   "title": "Wartość pierwsza", "text": "Krótkie wyjaśnienie." },
    { "icon": "tag",    "title": "Wartość druga",    "text": "Krótkie wyjaśnienie." },
    { "icon": "trend",  "title": "Wartość trzecia",  "text": "Krótkie wyjaśnienie." },
    { "icon": "people", "title": "Wartość czwarta",  "text": "Krótkie wyjaśnienie." }
  ],
  "newsletter": { "title": "Tytuł zapisu na newsletter", "text": "Jedno zdanie zachęty.", "placeholder": "Twój adres e-mail", "cta": "Zapisz się" },
  "footer": {
    "about": "Jedno–dwa zdania o sklepie pod logotypem w stopce.",
    "columns": [
      { "title": "Sklep", "links": ["Odnośnik 1", "Odnośnik 2", "Odnośnik 3", "Odnośnik 4"] },
      { "title": "Pomoc", "links": ["Odnośnik 1", "Odnośnik 2", "Odnośnik 3", "Odnośnik 4"] },
      { "title": "Firma", "links": ["Odnośnik 1", "Odnośnik 2", "Odnośnik 3", "Odnośnik 4"] }
    ],
    "legal": "© NAZWA SKLEPU. Wszystkie prawa zastrzeżone."
  }
}'::jsonb)
on conflict (key) do nothing;


-- -------------------------------------------------------------
--  PODGLĄD
-- -------------------------------------------------------------
-- select jsonb_pretty(value) from public.site where key = 'home';
-- select id, label, published, thumb from public.scenes order by position;
