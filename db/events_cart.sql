-- =============================================================
--  Dodanie zdarzenia "cart" do liczników
--
--  Sklep ma sprzedawać sam, więc zamiast wyjścia do sprzedawcy
--  najmocniejszym sygnałem zamiaru jest dodanie do koszyka.
--  Tabela events dopuszczała tylko 'open' i 'outbound' — poniższe
--  rozszerza tę listę.
--
--  URUCHOM: Supabase → SQL Editor → wklej → Run.
--  Do tego czasu kliknięcia "Dodaj do koszyka" liczą się tylko
--  lokalnie w przeglądarce; zapis do bazy jest odrzucany.
-- =============================================================

alter table public.events
  drop constraint if exists events_event_check;

alter table public.events
  add constraint events_event_check
  check (event in ('open', 'outbound', 'cart'));


-- Polityka zapisu też sprawdza dozwolone wartości — odświeżamy ją.
drop policy if exists "anon moze dopisywac zdarzenia" on public.events;
create policy "anon moze dopisywac zdarzenia"
  on public.events
  for insert
  to anon
  with check (
    length(scene)   between 1 and 64 and
    length(product) between 1 and 64 and
    event in ('open', 'outbound', 'cart')
  );


-- Podsumowanie z nową kolumną.
create or replace view public.events_summary as
select
  scene,
  category,
  product,
  count(*) filter (where event = 'open')     as otwarcia,
  count(*) filter (where event = 'cart')     as do_koszyka,
  count(*) filter (where event = 'outbound') as do_sklepu,
  round(
    100.0 * count(*) filter (where event = 'cart')
    / nullif(count(*) filter (where event = 'open'), 0)
  , 1)                                       as konwersja_proc,
  max(created_at)                            as ostatnie_klikniecie
from public.events
group by scene, category, product
order by do_koszyka desc, otwarcia desc;

-- select * from public.events_summary;
