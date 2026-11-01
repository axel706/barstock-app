-- ── Enlazar una factura con su orden, a mano ────────────────────────
--
-- Las órdenes y las facturas casan solas por PRODUCTO dentro del
-- ciclo: para cada línea de la orden se buscan recibos con el mismo
-- nombre de botella. Funciona casi siempre y no se toca.
--
-- Casi. En Crown se pide en el portal de LOOP, se va a la tienda, y la
-- factura llega a nombre de Fine Wine & Good Spirits. Son el mismo
-- pedido y la app no tiene cómo saberlo: dos órdenes del mismo
-- proveedor en la misma semana se disputan los mismos recibos, y la
-- que pierde dice "waiting" con la factura delante.
--
-- La respuesta NO es afinar el emparejamiento automático. Es dejar que
-- la persona que estuvo ahí lo diga, y que eso gane sobre cualquier
-- regla. Una fila por factura.
--
-- `order_id` es el id de la factura en MarginEdge —el mismo que agrupa
-- `marginedge_invoice_lines`—, no un id nuestro.
-- `vendor_order_id` es el id de Supabase de la orden, no `app_order_id`:
-- esa tabla tiene DOS ids y confundirlos ya costó una tarde.

create table if not exists public.invoice_order_links (
  id              bigserial   primary key,
  location_id     uuid        not null,
  order_id        text        not null,   -- la factura, en MarginEdge
  vendor_order_id bigint      not null,   -- la orden, en vendor_orders
  created_at      timestamptz not null default now(),
  -- Una factura pertenece a UNA orden. Volver a enlazarla reemplaza.
  unique (location_id, order_id)
);

create index if not exists invoice_order_links_loc
  on public.invoice_order_links (location_id, vendor_order_id);

alter table public.invoice_order_links enable row level security;

-- ── Las políticas ───────────────────────────────────────────────────
--
-- Aquí SÍ hacen falta update y delete, al revés que en los
-- historiales: esto es una corrección humana, y una corrección tiene
-- que poder corregirse. Enlazar la factura a la orden equivocada sin
-- forma de deshacerlo sería peor que no poder enlazarla.

drop policy if exists invoice_order_links_read on public.invoice_order_links;
create policy invoice_order_links_read
  on public.invoice_order_links for select
  using (true);

drop policy if exists invoice_order_links_insert on public.invoice_order_links;
create policy invoice_order_links_insert
  on public.invoice_order_links for insert
  with check (true);

drop policy if exists invoice_order_links_update on public.invoice_order_links;
create policy invoice_order_links_update
  on public.invoice_order_links for update
  using (true) with check (true);

drop policy if exists invoice_order_links_delete on public.invoice_order_links;
create policy invoice_order_links_delete
  on public.invoice_order_links for delete
  using (true);
