-- Qué producto de MarginEdge es cada botella de tu estante.
--
-- Antes vivía en `inventory_items.marginedge_id`, un solo identificador
-- por artículo. Dos problemas con eso:
--
--   1. El mismo vino de la casa se compra en 750 ml y en 1.5 L, o al
--      mismo producto a dos proveedores: son fichas distintas en
--      MarginEdge y todas esas compras tienen que caer en la misma
--      botella del estante. Una columna sólo admitía una.
--
--   2. `replaceInventoryMaster` borra y reinserta el inventario entero
--      en cada import del Excel semanal. Había que acordarse de
--      arrastrar la columna en tres sitios distintos, y olvidar uno
--      solo habría borrado el emparejado cada lunes sin dar un error.
--      Fuera de esa tabla, el problema desaparece.
--
-- La clave primaria es (location_id, product_id): un producto de
-- MarginEdge pertenece a UN artículo tuyo, pero un artículo tuyo puede
-- tener varios productos. Es exactamente la relación que hay.

create table if not exists marginedge_links (
  location_id uuid not null references locations(id) on delete cascade,
  product_id  text not null,           -- companyConceptProductId
  code        text not null default '',
  item_name   text not null,
  created_at  timestamptz not null default now(),
  primary key (location_id, product_id)
);

create index if not exists marginedge_links_item
  on marginedge_links (location_id, item_name);

alter table marginedge_links enable row level security;

drop policy if exists marginedge_links_all on marginedge_links;
create policy marginedge_links_all on marginedge_links
  for all using (true) with check (true);

-- Traerse lo ya emparejado para no perder el trabajo hecho a mano.
-- Si prefieres empezar de cero, salta esta sentencia.
insert into marginedge_links (location_id, product_id, code, item_name)
select location_id, marginedge_id, coalesce(code, ''), item_name
  from inventory_items
 where marginedge_id is not null
   and marginedge_id <> ''
on conflict (location_id, product_id) do nothing;
