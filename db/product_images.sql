-- =============================================================
--  Zdjęcia produktów — galeria pokazywana po kliknięciu w punkt
--
--  JAK URUCHOMIĆ:
--  Supabase → SQL Editor → New query → wklej całość → Run.
--  Idempotentne, można puszczać wielokrotnie.
--
--  Wymaga wcześniejszego db/products.sql (tabela products).
-- =============================================================

create table if not exists public.product_images (
  id         bigint generated always as identity primary key,
  product_id text not null references public.products(id) on delete cascade,
  image      text not null,
  alt        text,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_images_product_idx
  on public.product_images (product_id, position);


-- -------------------------------------------------------------
--  Uprawnienia — jak przy produktach:
--  anon widzi zdjęcia tylko opublikowanych produktów,
--  zmieniać może wyłącznie ktoś zalogowany.
-- -------------------------------------------------------------
alter table public.product_images enable row level security;

drop policy if exists "anon czyta zdjecia opublikowanych produktow" on public.product_images;
create policy "anon czyta zdjecia opublikowanych produktow"
  on public.product_images for select to anon
  using (exists (
    select 1 from public.products p
    where p.id = product_id and p.published
  ));

drop policy if exists "zalogowany zarzadza zdjeciami produktow" on public.product_images;
create policy "zalogowany zarzadza zdjeciami produktow"
  on public.product_images for all to authenticated
  using (true) with check (true);


-- -------------------------------------------------------------
--  PODGLĄD
-- -------------------------------------------------------------
-- select p.name, i.position, i.image
--   from public.product_images i
--   join public.products p on p.id = i.product_id
--  order by p.position, i.position;
