-- ── 043 · La lista de compras, compartida por locación ───────────────
--
-- docs/plan-lista-compras.md (Axel, 2026-11-14). Desde "Running out
-- first", un manager pone en la lista lo que se acaba ("Add 2 to list");
-- todos los managers ven la misma lista, con quién añadió cada cosa y
-- por qué. Después se convierte en compra (la quick order) y pasa a
-- "ordered", y no se pide dos veces.
--
-- Una fila no se borra: quitarla la pasa a `removed`. Así queda quién la
-- puso y quién la quitó, y un "Undo" no hace desaparecer la historia.
--
--   reason: 'app' (la app avisó que se acaba) o 'person' (alguien vio
--           que se acaba: "Running low", fase 3).

create table if not exists public.shopping_list (
  id           bigserial   primary key,
  location_id  uuid        not null,
  item_name    text        not null,
  qty          numeric     not null check (qty > 0),
  reason       text        not null default 'app' check (reason in ('app', 'person')),
  note         text,
  added_by     text,
  added_at     timestamptz not null default now(),
  status       text        not null default 'to_buy'
               check (status in ('to_buy', 'ordered', 'arrived', 'removed')),
  status_by    text,
  status_at    timestamptz,
  order_ref    text
);

create index if not exists shopping_list_abierta
  on public.shopping_list (location_id, status, added_at);

-- El historial sigue al producto al renombrarlo, como stock_checks (042).
create or replace function public.shopping_list_renombrar() returns trigger
language plpgsql as $$
begin
  update public.shopping_list set item_name = new.item_name
   where location_id::text = new.location_id::text and item_name = old.item_name;
  return new;
end;
$$;

drop trigger if exists shopping_list_renombrar on public.inventory_items;
create trigger shopping_list_renombrar after update of item_name on public.inventory_items
  for each row when (old.item_name is distinct from new.item_name)
  execute function public.shopping_list_renombrar();

alter table public.shopping_list enable row level security;

drop policy if exists shopping_list_read on public.shopping_list;
create policy shopping_list_read on public.shopping_list for select using (true);
drop policy if exists shopping_list_insert on public.shopping_list;
create policy shopping_list_insert on public.shopping_list for insert with check (true);
drop policy if exists shopping_list_update on public.shopping_list;
create policy shopping_list_update on public.shopping_list for update using (true) with check (true);
