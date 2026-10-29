-- Proveedores y facturas que NO son de la barra.
--
-- ── Por qué no basta el filtro por categoría ──────────────────────
--
-- La pantalla de facturas ya se queda sólo con las líneas cuyo
-- producto es BEER, LIQUOR, WINE o NA_BEVERAGES. Aun así se colaban
-- Gordon Food Service, US Foods y The Chefs Warehouse: te venden
-- zumo, refresco, leche y café, y MarginEdge los categoriza como
-- bebida. Técnicamente lo son. Para una barra, no.
--
-- Esa distinción no la puede hacer una categoría: hace falta tu
-- criterio, y esta tabla es donde se guarda.
--
-- ── Dos clases en una tabla ───────────────────────────────────────
--
--   kind='vendor'  → `clave` es el nombre del proveedor NORMALIZADO
--                    (mayúsculas, sin acentos ni signos). MarginEdge
--                    no da un id de proveedor en las líneas de
--                    factura, sólo el nombre, y los nombres llegan
--                    con puntuación distinta según el día.
--   kind='invoice' → `clave` es el order_id. Para la factura suelta
--                    de un proveedor que por lo demás sí es tuyo.
--
-- `label` guarda el nombre tal cual se vio, sólo para poder enseñar
-- la lista de ocultos sin cruzarla con nada.
--
-- ── Qué hace el servidor con esto ─────────────────────────────────
--
-- `api/marginedge.js` la lee ANTES de guardar: un proveedor oculto ni
-- se descarga ni se escribe. Sin eso, el sync volvería a meter cada
-- hora lo que acabas de borrar y la tabla crecería con comida para
-- siempre.
--
-- Ocultar borra además lo ya guardado de ese proveedor. Volver a
-- mostrarlo trae las facturas NUEVAS, no las borradas.

create table if not exists marginedge_hidden (
  location_id uuid not null references locations(id) on delete cascade,
  kind        text not null check (kind in ('vendor', 'invoice')),
  clave       text not null,
  label       text not null default '',
  created_at  timestamptz not null default now(),
  primary key (location_id, kind, clave)
);

alter table marginedge_hidden enable row level security;

drop policy if exists marginedge_hidden_all on marginedge_hidden;
create policy marginedge_hidden_all on marginedge_hidden
  for all using (true) with check (true);

notify pgrst, 'reload schema';
