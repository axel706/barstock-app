-- Cada vez que una factura cambia el precio de una botella.
--
-- Sin esto, después de actualizar un precio la ficha pone $28.50 y no
-- hay forma de saber si eso se tecleó en marzo o vino de la factura
-- del martes. Cuando los números empiezan a llenarse solos, poder
-- rastrear de dónde salió uno deja de ser un lujo.
--
-- Tabla aparte y no columnas en `inventory_items` por dos razones:
--
--   1. `replaceInventoryMaster` borra y reinserta el inventario entero
--      en cada import del Excel. Toda columna nueva hay que acordarse
--      de arrastrarla en tres sitios, y olvidar uno la borra cada
--      lunes sin dar un error. Aquí el problema no existe.
--
--   2. Da HISTORIA, no sólo origen. No «esto vino de una factura»,
--      sino «26.99 → 28.50 el 20 de octubre, factura 468081». Eso es
--      lo que contesta si algo subió un 10 % o bajó un 30 %.

create table if not exists marginedge_price_log (
  id             bigserial primary key,
  location_id    uuid not null references locations(id) on delete cascade,
  item_name      text not null,
  price_before   numeric,
  price_after    numeric not null,
  invoice_number text,
  invoice_date   date,
  vendor_name    text,
  applied_at     timestamptz not null default now()
);

create index if not exists me_price_log_item
  on marginedge_price_log (location_id, item_name, applied_at desc);
create index if not exists me_price_log_fecha
  on marginedge_price_log (location_id, applied_at desc);

alter table marginedge_price_log enable row level security;

drop policy if exists me_price_log_all on marginedge_price_log;
create policy me_price_log_all on marginedge_price_log
  for all using (true) with check (true);

notify pgrst, 'reload schema';
