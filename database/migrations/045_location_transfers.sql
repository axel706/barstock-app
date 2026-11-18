-- ── 045 · Transfers entre locaciones ─────────────────────────────────
--
-- Axel, 2026-11-18. El domingo llevó 12 Triage Vodka de Will's & Bill's
-- a Crown y las contó; el lunes MarginEdge trajo la factura de "Internal
-- Transfers" y el LIVE de Crown sumó otras 12. Sin un sitio donde decir
-- "esto vino de otra locación", la factura y el conteo contaban lo mismo
-- dos veces, y Pour·IQ veía 12 botellas aparecer en una y desaparecer en
-- la otra. El flujo, sobre lámina: docs/plan-transfer.md.
--
--   · Quien lo registra lo aplica al momento en SU locación; la otra lo
--     ve y sólo lo confirma (o dice "Not right"). Hasta confirmar, en la
--     otra no cuenta: botellas que nadie ha visto.
--   · El producto se llama distinto en cada locación (Triage Vodka en
--     Crown, Triage House Vodka en W+B): cada lado guarda el SUYO. El de
--     la otra puede quedar vacío hasta que confirme y lo elija.
--   · moved_at es cuándo se movieron de verdad, no cuándo se registró:
--     un transfer de antes del conteo ya estaba en la estantería al
--     contar y no suma al LIVE (before_count lo dice sin tener que
--     comparar fechas).
--   · Al confirmarse, la que recibe tiene su orden en Orders › Sent
--     (vendor_order_id) para que la factura se enlace como a cualquier
--     orden.
--
-- Una fila no se borra: deshacer la pasa a 'undone' y rechazar a
-- 'rejected', con quién y cuándo.

create table if not exists public.location_transfers (
  id               uuid        primary key default gen_random_uuid(),
  account_id       text        not null,
  from_location    uuid        not null,
  to_location      uuid        not null,
  from_item        text,
  to_item          text,
  qty              numeric     not null check (qty > 0),
  moved_at         timestamptz not null,
  before_count     boolean     not null default false,
  started_at       uuid        not null,          -- la locación que lo registró
  created_by       text,
  created_at       timestamptz not null default now(),
  status           text        not null default 'pending'
                   check (status in ('pending', 'confirmed', 'rejected', 'undone')),
  status_by        text,
  status_at        timestamptz,
  note             text,
  vendor_order_id  text,                           -- su orden en Sent de quien recibe
  check (from_location <> to_location),
  check (started_at = from_location or started_at = to_location),
  -- Quien lo registra tiene que poner SU producto.
  check ((started_at = from_location and from_item is not null) or
         (started_at = to_location and to_item is not null))
);

create index if not exists location_transfers_desde
  on public.location_transfers (from_location, status, moved_at);
create index if not exists location_transfers_hacia
  on public.location_transfers (to_location, status, moved_at);

-- El producto sigue al renombrarlo, en su lado, como stock_checks (042)
-- y shopping_list (043).
create or replace function public.location_transfers_renombrar() returns trigger
language plpgsql as $$
begin
  update public.location_transfers set from_item = new.item_name
   where from_location::text = new.location_id::text and from_item = old.item_name;
  update public.location_transfers set to_item = new.item_name
   where to_location::text = new.location_id::text and to_item = old.item_name;
  return new;
end;
$$;

drop trigger if exists location_transfers_renombrar on public.inventory_items;
create trigger location_transfers_renombrar after update of item_name on public.inventory_items
  for each row when (old.item_name is distinct from new.item_name)
  execute function public.location_transfers_renombrar();

alter table public.location_transfers enable row level security;

drop policy if exists location_transfers_read on public.location_transfers;
create policy location_transfers_read on public.location_transfers for select using (true);
drop policy if exists location_transfers_insert on public.location_transfers;
create policy location_transfers_insert on public.location_transfers for insert with check (true);
drop policy if exists location_transfers_update on public.location_transfers;
create policy location_transfers_update on public.location_transfers for update using (true) with check (true);
