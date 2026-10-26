-- Las líneas de factura de MarginEdge.
--
-- `/orders` sólo da cabeceras —proveedor, número, fecha, total—; las
-- líneas están en `/orders/{id}`, una llamada por factura. Con unas
-- diez facturas al día y un límite de dos peticiones por segundo, esto
-- no se lee en vivo: se copia aquí y la app trabaja contra la copia.
--
-- Se guardan TODAS las líneas, también las de comida. Filtrar al
-- guardar ya nos costó caro una vez con el catálogo: si mañana cambia
-- el criterio, no hay que volver a pedirle nada a MarginEdge.

create table if not exists marginedge_invoice_lines (
  location_id      uuid not null references locations(id) on delete cascade,
  order_id         text not null,
  line_no          int  not null,
  invoice_date     date,
  created_date     date,
  vendor_name      text,
  invoice_number   text,
  status           text,
  product_id       text,          -- companyConceptProductId
  vendor_item_name text,          -- como lo llama el proveedor
  vendor_item_code text,
  packaging_id     text,
  unit_price       numeric,
  quantity         numeric,
  line_price       numeric,
  primary key (location_id, order_id, line_no)
);

create index if not exists me_lines_loc_date
  on marginedge_invoice_lines (location_id, invoice_date);
create index if not exists me_lines_product
  on marginedge_invoice_lines (location_id, product_id);

alter table marginedge_invoice_lines enable row level security;

drop policy if exists me_lines_all on marginedge_invoice_lines;
create policy me_lines_all on marginedge_invoice_lines
  for all using (true) with check (true);

alter table location_settings
  add column if not exists marginedge_invoices_synced_at timestamptz;

notify pgrst, 'reload schema';
