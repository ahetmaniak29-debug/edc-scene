-- =============================================================
--  KOLEKCJE — scena w scenie
--
--  JAK URUCHOMIĆ:
--  Supabase → SQL Editor → New query → wklej całość → Run.
--  Skrypt jest idempotentny, można go puszczać wielokrotnie.
--
--  PO CO TO JEST:
--  Kolekcja to zdjęcie wnętrza. Zaznaczasz na nim obszary — stolik
--  kawowy, lampa, komoda — a każdy obszar prowadzi do zbliżenia,
--  czyli do zwykłej sceny z punktami i produktami.
--
--  Dlatego kadr NIE jest nową tabelą: to ta sama tabela `scenes`,
--  tylko z rodzicem i prostokątem, który zajmuje na zdjęciu rodzica.
--  Wszystko, co już działa dla scen (produkty, punkty, zdjęcia,
--  liczniki kliknięć), działa dla kadrów bez jednej linijki więcej.
-- =============================================================


-- -------------------------------------------------------------
--  1. Rodzic i obszar na zdjęciu rodzica
-- -------------------------------------------------------------
alter table public.scenes
  add column if not exists parent_id text references public.scenes(id) on delete cascade;

-- Prostokąt w procentach szerokości i wysokości zdjęcia rodzica.
-- Procenty, a nie piksele — zdjęcie skaluje się razem z ekranem,
-- a obszar ma trzymać się tego samego mebla na każdym monitorze.
alter table public.scenes add column if not exists area_x numeric(5,2);  -- lewa krawędź
alter table public.scenes add column if not exists area_y numeric(5,2);  -- górna krawędź
alter table public.scenes add column if not exists area_w numeric(5,2);  -- szerokość
alter table public.scenes add column if not exists area_h numeric(5,2);  -- wysokość

-- Podpis obszaru na zdjęciu wnętrza („Stolik kawowy").
-- Osobny od `label`, bo w okruszkach i w menu chcesz często czegoś krótszego.
alter table public.scenes add column if not exists area_label text;

create index if not exists scenes_parent_idx
  on public.scenes (parent_id, position);


-- -------------------------------------------------------------
--  2. Uprawnienia
--
--  Nic nowego: kadry siedzą w tej samej tabeli, więc obowiązują je
--  te same reguły RLS co sceny — anonim czyta opublikowane,
--  zapisuje tylko zalogowany. Ten blok jest tu po to, żeby skrypt
--  dało się puścić na świeżej bazie i nie zostawić dziury.
-- -------------------------------------------------------------
alter table public.scenes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'scenes'
       and policyname = 'scenes_read_published'
  ) then
    create policy scenes_read_published on public.scenes
      for select using (published = true);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'scenes'
       and policyname = 'scenes_write_authenticated'
  ) then
    create policy scenes_write_authenticated on public.scenes
      for all to authenticated using (true) with check (true);
  end if;
end $$;


-- -------------------------------------------------------------
--  3. Sprawdzenie
--
--  Po uruchomieniu powinieneś zobaczyć nowe kolumny.
-- -------------------------------------------------------------
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'scenes'
   and column_name in ('parent_id', 'area_x', 'area_y', 'area_w', 'area_h', 'area_label')
 order by column_name;
