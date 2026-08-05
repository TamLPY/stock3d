-- JOKER 3D — Liste de commande automatique
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor.
-- Cette migration ne supprime et ne modifie aucun produit existant.

alter table public.products
  add column if not exists target_stock numeric not null default 0;

alter table public.products
  drop constraint if exists products_target_stock_nonnegative;

alter table public.products
  add constraint products_target_stock_nonnegative check (target_stock >= 0);
