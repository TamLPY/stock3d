-- STOCK 3D — gestion des conditionnements et des prix par unité / lot
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor.
-- Cette migration conserve tous les produits et stocks existants.

alter table public.products
  add column if not exists stock_package_type text not null default 'unité',
  add column if not exists stock_package_quantity numeric not null default 1,
  add column if not exists stock_content_unit text not null default 'unité',
  add column if not exists price_type text not null default 'unit',
  add column if not exists price_amount numeric,
  add column if not exists price_package_type text,
  add column if not exists price_package_quantity numeric not null default 1;

-- Pour les produits déjà présents, le prix actuel reste considéré comme un prix à l'unité.
update public.products
set price_amount = unit_price
where price_amount is null;

alter table public.products
  alter column price_amount set default 0;

-- Garde-fous simples contre les quantités nulles ou négatives.
alter table public.products drop constraint if exists products_stock_package_quantity_positive;
alter table public.products add constraint products_stock_package_quantity_positive check (stock_package_quantity > 0);
alter table public.products drop constraint if exists products_price_package_quantity_positive;
alter table public.products add constraint products_price_package_quantity_positive check (price_package_quantity > 0);
