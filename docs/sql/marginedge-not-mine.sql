-- Productos de MarginEdge que NO son tuyos.
--
-- La pantalla "Arrived but unclaimed" lista lo que llegó en una
-- factura y ninguna botella del estante reclama. Esa lista tiene que
-- poder llegar a cero, porque una lista que nunca se vacía se deja de
-- mirar a la semana — y entonces vuelve a pasar lo de Smith & Hook:
-- una factura entra, no la reclama nadie, y desaparece en silencio.
--
-- Siempre va a entrar comida, papel y cosas que no llevas en el
-- estante, así que hace falta una salida. Eso es "Not mine", y es lo
-- único que guarda esta tabla.
--
-- ── Por qué el product_id y no el nombre ──────────────────────────
--
-- Los nombres de MarginEdge cambian: "Smith Hook Cabernet" y
-- "Smith & Hook Reserve Cabernet" son dos productos distintos que un
-- humano lee casi igual. Descartar por nombre descartaría los dos. El
-- product_id es estable y señala a uno solo.
--
-- Se guarda también el nombre, pero sólo para poder enseñar la lista
-- de descartados sin tener que cruzarla con el catálogo.
--
-- Es reversible: borrar la fila devuelve el producto a la cola. El
-- sitio para deshacerlo vive en Developer tools, que es donde va lo
-- que se usa una vez al año.
--
-- OJO: esta tabla NO es `marginedge_ignored`. Aquella guarda
-- ARTÍCULOS TUYOS que no quieres emparejar; ésta guarda PRODUCTOS DE
-- MARGINEDGE que no son tuyos. Son los dos lados de la misma relación
-- y mezclarlos sería el mismo error que ya costó caro en los enlaces.

create table if not exists marginedge_not_mine (
  location_id  uuid not null references locations(id) on delete cascade,
  product_id   text not null,          -- companyConceptProductId
  product_name text not null default '',
  created_at   timestamptz not null default now(),
  primary key (location_id, product_id)
);

alter table marginedge_not_mine enable row level security;

drop policy if exists marginedge_not_mine_all on marginedge_not_mine;
create policy marginedge_not_mine_all on marginedge_not_mine
  for all using (true) with check (true);

notify pgrst, 'reload schema';
