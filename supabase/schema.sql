-- À exécuter une seule fois dans Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.technicians (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  supplier_reference text not null default '',
  internal_reference text not null unique,
  name text not null,
  description text not null default '',
  category_id uuid references public.categories(id) on delete set null,
  supplier text not null default '',
  target_pest text not null default '',
  stock numeric(12,2) not null default 0 check (stock >= 0),
  alert_threshold numeric(12,2) not null default 0 check (alert_threshold >= 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null check (movement_type in ('entry','exit')),
  quantity numeric(12,2) not null check (quantity > 0),
  technician_id uuid references public.technicians(id) on delete set null,
  performed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at before update on public.products
for each row execute function public.touch_updated_at();

-- Modifie le stock et crée le mouvement dans une seule transaction.
create or replace function public.change_stock(
  p_product_id uuid,
  p_type text,
  p_quantity numeric,
  p_technician_id uuid default null
) returns public.products
language plpgsql security invoker set search_path = public as $$
declare v_product public.products;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La quantité doit être supérieure à zéro'; end if;
  if p_type not in ('entry','exit') then raise exception 'Type de mouvement invalide'; end if;
  if p_type = 'exit' and p_technician_id is null then raise exception 'Un technicien est obligatoire pour une sortie'; end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then raise exception 'Produit introuvable'; end if;
  if p_type = 'exit' and v_product.stock < p_quantity then raise exception 'Stock insuffisant'; end if;

  update public.products
  set stock = case when p_type='entry' then stock+p_quantity else stock-p_quantity end
  where id=p_product_id returning * into v_product;

  insert into public.stock_movements(product_id,movement_type,quantity,technician_id,performed_by)
  values(p_product_id,p_type,p_quantity,p_technician_id,auth.uid());
  return v_product;
end; $$;

grant execute on function public.change_stock(uuid,text,numeric,uuid) to authenticated;

alter table public.categories enable row level security;
alter table public.technicians enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

-- Tous les comptes connectés partagent le même inventaire Joker 3D.
drop policy if exists categories_auth_all on public.categories;
create policy categories_auth_all on public.categories for all to authenticated using (true) with check (true);
drop policy if exists technicians_auth_all on public.technicians;
create policy technicians_auth_all on public.technicians for all to authenticated using (true) with check (true);
drop policy if exists products_auth_all on public.products;
create policy products_auth_all on public.products for all to authenticated using (true) with check (true);
drop policy if exists movements_auth_read on public.stock_movements;
create policy movements_auth_read on public.stock_movements for select to authenticated using (true);
drop policy if exists movements_auth_insert on public.stock_movements;
create policy movements_auth_insert on public.stock_movements for insert to authenticated with check (performed_by = auth.uid());

insert into public.categories(name) values
('Rodenticides'),('Insecticides liquides'),('Gels insecticides'),('Poudres insecticides'),
('Désinfectants'),('Répulsifs'),('Postes d''appâtage'),('Pièges et plaques engluées'),
('Matériel de pulvérisation'),('Équipements de protection'),('Proofing et colmatage'),
('Dépigeonnage'),('Chenilles processionnaires'),('Consommables et étiquettes')
on conflict do nothing;

insert into public.technicians(name) values ('Dominique'),('Carlos'),('Philippe') on conflict do nothing;

-- Active les événements temps réel pour ces tables.
do $$ begin
  alter publication supabase_realtime add table public.products;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.stock_movements;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.categories;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.technicians;
exception when duplicate_object then null; end $$;
