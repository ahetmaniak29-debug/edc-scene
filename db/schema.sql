-- =============================================================
--  Liczniki kliknięć — Supabase
--
--  JAK URUCHOMIĆ:
--  Supabase → SQL Editor → New query → wklej całość → Run.
--  Skrypt jest idempotentny: można go puszczać wielokrotnie.
--
--  STAN NA 2026-08-07 (sprawdzony na żywo w projekcie sfajnuvpvvprjocqqbpe):
--  tabela events oraz RLS JUŻ ISTNIEJĄ i działają poprawnie —
--  klucz publikowalny może wyłącznie dopisywać wiersze.
--  Sekcja 1 jest więc u Ciebie pustym przebiegiem; realnie potrzebna
--  jest sekcja 2 (indeks) i 3 (widok podsumowania).
-- =============================================================


-- -------------------------------------------------------------
--  1. Tabela zdarzeń i zabezpieczenia
--
--  Jeden wiersz = jedno kliknięcie.
--    open     — ktoś otworzył panel produktu (zainteresowanie)
--    outbound — ktoś kliknął przycisk do sprzedawcy (zamiar zakupu)
--
--  Klucz publikowalny siedzi jawnie w kodzie strony — każdy odczyta go
--  z podglądu źródła. Tak ma być, ale to znaczy, że RLS jest JEDYNĄ
--  ochroną tych danych. Anon dostaje prawo dopisywania i nic więcej.
-- -------------------------------------------------------------
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  scene      text        not null,
  category   text,
  product    text        not null,
  event      text        not null check (event in ('open', 'outbound')),
  viewport   int,
  referrer   text
);

alter table public.events enable row level security;

-- UWAGA: jeśli masz już własną politykę INSERT pod inną nazwą, poniższe
-- doda drugą obok niej. Polityki permisywne sumują się (OR), więc nic się
-- nie zepsuje, ale warto zajrzeć w Authentication → Policies i zostawić jedną.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'events' and cmd = 'INSERT'
  ) then
    create policy "anon moze dopisywac zdarzenia"
      on public.events
      for insert
      to anon
      with check (
        length(scene)   between 1 and 64 and
        length(product) between 1 and 64 and
        event in ('open', 'outbound')
      );
  end if;
end $$;

-- Świadomie NIE MA polityk SELECT / UPDATE / DELETE.
-- Bez nich anon nie odczyta, nie zmieni i nie skasuje żadnego wiersza.


-- -------------------------------------------------------------
--  2. Indeks pod najczęstsze pytanie: "co klikali w tej scenie"
-- -------------------------------------------------------------
create index if not exists events_scene_created_idx
  on public.events (scene, created_at desc);


-- -------------------------------------------------------------
--  3. Widok podsumowania — do czytania przez Ciebie
-- -------------------------------------------------------------
create or replace view public.events_summary as
select
  scene,
  category,
  product,
  count(*) filter (where event = 'open')     as otwarcia,
  count(*) filter (where event = 'outbound') as do_sklepu,
  round(
    100.0 * count(*) filter (where event = 'outbound')
    / nullif(count(*) filter (where event = 'open'), 0)
  , 1)                                       as konwersja_proc,
  max(created_at)                            as ostatnie_klikniecie
from public.events
group by scene, category, product
order by do_sklepu desc, otwarcia desc;


-- -------------------------------------------------------------
--  4. Sprzątanie po testach połączenia
--     Wstawiłem dwa wiersze, żeby sprawdzić, czy zapis dochodzi.
--     Nie mogłem ich usunąć — anon nie ma prawa kasować, i dobrze.
-- -------------------------------------------------------------
delete from public.events where scene = 'test-polaczenia';


-- =============================================================
--  BLOK OPCJONALNY — statystyki widoczne na stronie pod ?stats=1
--
--  Domyślnie strona nie ma prawa czytać z bazy, więc ?stats=1 pokazuje
--  liczby tylko z Twojej przeglądarki. Odkomentuj poniższe dwie linie,
--  żeby pokazywał PRAWDZIWE sumy od wszystkich odwiedzających.
--
--  ZANIM TO ZROBISZ, WIEDZ CO ODDAJESZ:
--  adres ...github.io/edc-scene/scena.html?stats=1 stanie się publiczny.
--  Każdy, kto go zna, zobaczy, który produkt ile razy kliknięto.
--  Pojedyncze wiersze zostają ukryte — na zewnątrz idą wyłącznie sumy.
-- =============================================================

-- alter view public.events_summary set (security_invoker = off);
-- grant select on public.events_summary to anon;


-- -------------------------------------------------------------
--  PODGLĄD WYNIKÓW — uruchamiaj, kiedy chcesz zobaczyć dane
-- -------------------------------------------------------------
-- select * from public.events_summary;
-- select * from public.events order by created_at desc limit 50;

-- Kontrola uprawnień — powinna zwrócić wyłącznie wiersze z cmd = INSERT:
-- select policyname, cmd, roles from pg_policies
--   where schemaname = 'public' and tablename = 'events';
