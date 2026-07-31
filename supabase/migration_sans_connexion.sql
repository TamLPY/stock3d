-- STOCK 3D — suppression du portail de connexion
-- À exécuter UNE FOIS dans Supabase > SQL Editor.
-- Cette migration conserve les produits, catégories, techniciens et mouvements existants.

-- Autorisations SQL pour la clé publique utilisée par l'application.
grant usage on schema public to anon;
grant select, insert, update, delete on table public.categories to anon;
grant select, insert, update, delete on table public.technicians to anon;
grant select, insert, update, delete on table public.products to anon;
grant select, insert on table public.stock_movements to anon;
grant execute on function public.change_stock(uuid,text,numeric,uuid) to anon;

-- Accès public à l'inventaire, sans compte utilisateur.
alter table public.categories enable row level security;
alter table public.technicians enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists categories_anon_all on public.categories;
create policy categories_anon_all on public.categories
for all to anon using (true) with check (true);

drop policy if exists technicians_anon_all on public.technicians;
create policy technicians_anon_all on public.technicians
for all to anon using (true) with check (true);

drop policy if exists products_anon_all on public.products;
create policy products_anon_all on public.products
for all to anon using (true) with check (true);

drop policy if exists movements_anon_read on public.stock_movements;
create policy movements_anon_read on public.stock_movements
for select to anon using (true);

drop policy if exists movements_anon_insert on public.stock_movements;
create policy movements_anon_insert on public.stock_movements
for insert to anon with check (performed_by is null);

-- La fonction enregistre désormais les mouvements sans utilisateur connecté.
create or replace function public.change_stock(
  p_product_id uuid,
  p_type text,
  p_quantity numeric,
  p_technician_id uuid default null
) returns public.products
language plpgsql security invoker set search_path = public as $$
declare v_product public.products;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La quantité doit être supérieure à zéro';
  end if;
  if p_type not in ('entry','exit') then
    raise exception 'Type de mouvement invalide';
  end if;
  if p_type = 'exit' and p_technician_id is null then
    raise exception 'Un technicien est obligatoire pour une sortie';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then raise exception 'Produit introuvable'; end if;
  if p_type = 'exit' and v_product.stock < p_quantity then
    raise exception 'Stock insuffisant';
  end if;

  update public.products
  set stock = case when p_type='entry' then stock+p_quantity else stock-p_quantity end
  where id = p_product_id
  returning * into v_product;

  insert into public.stock_movements(product_id,movement_type,quantity,technician_id,performed_by)
  values(p_product_id,p_type,p_quantity,p_technician_id,null);

  return v_product;
end; $$;

grant execute on function public.change_stock(uuid,text,numeric,uuid) to anon;
