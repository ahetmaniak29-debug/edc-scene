-- =============================================================
--  Katalog produktów + magazyn zdjęć
--
--  JAK URUCHOMIĆ:
--  Supabase → SQL Editor → New query → wklej całość → Run.
--  Skrypt jest idempotentny, można go puszczać wielokrotnie.
--
--  POTEM ZAŁÓŻ SOBIE KONTO DO PANELU:
--  Supabase → Authentication → Users → Add user →
--  wpisz swój e-mail i hasło, zaznacz "Auto Confirm User".
--  Tym kontem logujesz się na /admin.html.
-- =============================================================


-- -------------------------------------------------------------
--  1. Sceny (kategorie ze zdjęciem)
-- -------------------------------------------------------------
create table if not exists public.scenes (
  id         text primary key,               -- slug, np. 'outdoor-edc'
  label      text not null,                  -- 'EDC'
  title      text,
  subtitle   text,
  image      text,                           -- ścieżka w repo albo adres z Storage
  image_alt  text,
  position   int     not null default 0,
  published  boolean not null default false,
  created_at timestamptz not null default now()
);


-- -------------------------------------------------------------
--  2. Produkty
--
--  id celowo jest SLUGIEM, nie UUID-em: tabela events trzyma
--  identyfikatory produktów jako tekst. Gdyby produkty dostały
--  UUID-y, zerwałoby to powiązanie z dotychczasowymi kliknięciami.
-- -------------------------------------------------------------
create table if not exists public.products (
  id          text primary key,              -- slug, np. 'latarka-aa'
  scene_id    text references public.scenes(id) on delete cascade,
  name        text not null,
  brand       text,
  category    text,
  price_cents int,                           -- liczba, nie tekst — da się sortować
  currency    text    not null default 'PLN',
  why         text,
  url         text,
  cta_label   text,
  specs       jsonb   not null default '[]'::jsonb,
  hotspot_x   numeric(5,2),                  -- procent szerokości zdjęcia
  hotspot_y   numeric(5,2),                  -- procent wysokości zdjęcia
  position    int     not null default 0,
  published   boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists products_scene_idx
  on public.products (scene_id, position);


-- -------------------------------------------------------------
--  3. Karuzela pod zdjęciem sceny
-- -------------------------------------------------------------
create table if not exists public.scene_images (
  id       bigint generated always as identity primary key,
  scene_id text references public.scenes(id) on delete cascade,
  image    text not null,
  title    text,
  body     text,
  position int not null default 0
);

create index if not exists scene_images_scene_idx
  on public.scene_images (scene_id, position);


-- -------------------------------------------------------------
--  4. Uprawnienia
--
--  Odwrotnie niż przy zdarzeniach: tutaj anon CZYTA, ale tylko to,
--  co odhaczone jako opublikowane. Zapisywać może wyłącznie ktoś
--  zalogowany, czyli Ty w panelu.
-- -------------------------------------------------------------
alter table public.scenes       enable row level security;
alter table public.products     enable row level security;
alter table public.scene_images enable row level security;

-- sceny
drop policy if exists "anon czyta opublikowane sceny" on public.scenes;
create policy "anon czyta opublikowane sceny"
  on public.scenes for select to anon using (published = true);

drop policy if exists "zalogowany zarzadza scenami" on public.scenes;
create policy "zalogowany zarzadza scenami"
  on public.scenes for all to authenticated using (true) with check (true);

-- produkty
drop policy if exists "anon czyta opublikowane produkty" on public.products;
create policy "anon czyta opublikowane produkty"
  on public.products for select to anon using (published = true);

drop policy if exists "zalogowany zarzadza produktami" on public.products;
create policy "zalogowany zarzadza produktami"
  on public.products for all to authenticated using (true) with check (true);

-- zdjęcia karuzeli — widoczne, gdy ich scena jest opublikowana
drop policy if exists "anon czyta zdjecia opublikowanych scen" on public.scene_images;
create policy "anon czyta zdjecia opublikowanych scen"
  on public.scene_images for select to anon
  using (exists (select 1 from public.scenes s where s.id = scene_id and s.published));

drop policy if exists "zalogowany zarzadza zdjeciami" on public.scene_images;
create policy "zalogowany zarzadza zdjeciami"
  on public.scene_images for all to authenticated using (true) with check (true);


-- -------------------------------------------------------------
--  5. Magazyn zdjęć (Supabase Storage)
--
--  Kubełek publiczny do odczytu — zdjęcia mają się wyświetlać
--  każdemu. Wgrywać, nadpisywać i kasować może tylko zalogowany.
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('zdjecia', 'zdjecia', true)
on conflict (id) do update set public = true;

drop policy if exists "zdjecia publiczny odczyt" on storage.objects;
create policy "zdjecia publiczny odczyt"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'zdjecia');

drop policy if exists "zdjecia wgrywanie" on storage.objects;
create policy "zdjecia wgrywanie"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'zdjecia');

drop policy if exists "zdjecia nadpisywanie" on storage.objects;
create policy "zdjecia nadpisywanie"
  on storage.objects for update to authenticated
  using (bucket_id = 'zdjecia') with check (bucket_id = 'zdjecia');

drop policy if exists "zdjecia kasowanie" on storage.objects;
create policy "zdjecia kasowanie"
  on storage.objects for delete to authenticated
  using (bucket_id = 'zdjecia');


-- -------------------------------------------------------------
--  6. Przeniesienie tego, co dziś siedzi w plikach JSON
--     Puszczane wielokrotnie nie duplikuje — nadpisuje po id.
-- -------------------------------------------------------------
insert into public.scenes (id, label, title, subtitle, image, image_alt, position, published)
values (
  'outdoor-edc',
  'EDC',
  'Główne hasło kategorii.',
  'Dwa–trzy zdania o tym, co jest na zdjęciu i dla kogo. Dotknij numeru, żeby zobaczyć szczegóły przedmiotu.',
  'ZDJECIA/kolekcje/edc-scena-duza.jpg',
  'Ekwipunek ułożony równo z góry wokół czarnego plecaka.',
  0,
  true
)
on conflict (id) do update set
  label = excluded.label, title = excluded.title, subtitle = excluded.subtitle,
  image = excluded.image, image_alt = excluded.image_alt, published = excluded.published;

insert into public.products
  (id, scene_id, name, brand, category, price_cents, why, url, cta_label, specs, hotspot_x, hotspot_y, position, published)
values
  ('przedmiot-1','outdoor-edc','Nazwa produktu 1','Nazwa marki','outdoor-edc',0,
   'Tu wpisujesz jedno–dwa zdania: dlaczego akurat ten przedmiot trafił na listę i co go wyróżnia.',
   '#','Zobacz u sprzedawcy','[{"k":"Parametr","v":"wartość"}]'::jsonb, 50.0, 52.0, 1, true),
  ('przedmiot-2','outdoor-edc','Nazwa produktu 2','Nazwa marki','outdoor-edc',0,
   'Tu wpisujesz jedno–dwa zdania: dlaczego akurat ten przedmiot trafił na listę i co go wyróżnia.',
   '#','Zobacz u sprzedawcy','[{"k":"Parametr","v":"wartość"}]'::jsonb, 24.0, 10.0, 2, true),
  ('przedmiot-3','outdoor-edc','Nazwa produktu 3','Nazwa marki','outdoor-edc',0,
   'Tu wpisujesz jedno–dwa zdania: dlaczego akurat ten przedmiot trafił na listę i co go wyróżnia.',
   '#','Zobacz u sprzedawcy','[{"k":"Parametr","v":"wartość"}]'::jsonb, 72.0, 16.0, 3, true),
  ('przedmiot-4','outdoor-edc','Nazwa produktu 4','Nazwa marki','outdoor-edc',0,
   'Tu wpisujesz jedno–dwa zdania: dlaczego akurat ten przedmiot trafił na listę i co go wyróżnia.',
   '#','Zobacz u sprzedawcy','[{"k":"Parametr","v":"wartość"}]'::jsonb, 10.5, 33.5, 4, true),
  ('przedmiot-5','outdoor-edc','Nazwa produktu 5','Nazwa marki','outdoor-edc',0,
   'Tu wpisujesz jedno–dwa zdania: dlaczego akurat ten przedmiot trafił na listę i co go wyróżnia.',
   '#','Zobacz u sprzedawcy','[{"k":"Parametr","v":"wartość"}]'::jsonb, 38.0, 85.0, 5, true),
  ('przedmiot-6','outdoor-edc','Nazwa produktu 6','Nazwa marki','outdoor-edc',0,
   'Tu wpisujesz jedno–dwa zdania: dlaczego akurat ten przedmiot trafił na listę i co go wyróżnia.',
   '#','Zobacz u sprzedawcy','[{"k":"Parametr","v":"wartość"}]'::jsonb, 83.0, 83.0, 6, true)
on conflict (id) do nothing;

insert into public.scene_images (scene_id, image, title, body, position)
select 'outdoor-edc', 'ZDJECIA/produkty/image-1786014155651.png',
       'Podpis pierwszego zdjęcia',
       'Dwa–trzy zdania o tym ujęciu: co widać, w jakich warunkach, dlaczego tak ułożone.', 1
where not exists (select 1 from public.scene_images where scene_id = 'outdoor-edc');


-- -------------------------------------------------------------
--  PODGLĄD
-- -------------------------------------------------------------
-- select * from public.products order by position;
-- select policyname, cmd, roles from pg_policies
--   where schemaname = 'public' and tablename in ('scenes','products','scene_images');
