-- ── 042 · La verificación: "I have enough" con un número ─────────────
--
-- docs/plan-lista-compras.md (Axel, 2026-11-14). Cuando alguien mira la
-- estantería a media semana y dice "hay 6", se guarda aquí. Desde ese
-- momento el LIVE de ese producto parte de 6 (más lo que llegue, menos lo
-- que se venda), hasta el siguiente conteo. NUNCA se escribe en on_hand:
-- on_hand es lo que se contó en el conteo, el ancla de Pour·IQ.
--
-- `live_said` es lo que decía la app en ese momento: la diferencia con
-- `counted` es la misma señal que el esperado (docs/plan-esperado.md),
-- a media semana, y se enseñará en Finish count.
--
-- Es historia: la app inserta y lee, no edita ni borra.

create table if not exists public.stock_checks (
  id           bigserial   primary key,
  location_id  uuid        not null,
  item_name    text        not null,
  counted      numeric     not null check (counted >= 0),
  live_said    numeric,
  checked_by   text,
  checked_at   timestamptz not null default now()
);

create index if not exists stock_checks_producto
  on public.stock_checks (location_id, item_name, checked_at);

-- El historial sigue al producto al renombrarlo (rename_inventory_item,
-- migración 038, hace un UPDATE del nombre en inventory_items). Como el
-- de live_expected (040): un trigger, no otra copia de la 038.
create or replace function public.stock_checks_renombrar() returns trigger
language plpgsql as $$
begin
  update public.stock_checks set item_name = new.item_name
   where location_id::text = new.location_id::text and item_name = old.item_name;
  return new;
end;
$$;

drop trigger if exists stock_checks_renombrar on public.inventory_items;
create trigger stock_checks_renombrar after update of item_name on public.inventory_items
  for each row when (old.item_name is distinct from new.item_name)
  execute function public.stock_checks_renombrar();

alter table public.stock_checks enable row level security;

drop policy if exists stock_checks_read on public.stock_checks;
create policy stock_checks_read on public.stock_checks for select using (true);
drop policy if exists stock_checks_insert on public.stock_checks;
create policy stock_checks_insert on public.stock_checks for insert with check (true);
