-- ─────────────────────────────────────────────────────────────────────
-- 012 · La silueta es del PRODUCTO, no de la locación
-- ─────────────────────────────────────────────────────────────────────
--
-- Un código de barras aprendido vale para todas las locaciones: vive en
-- `item_barcodes`, que es de la cuenta. La silueta no: vivía en
-- `inventory_items.bottle_shape`, y esa tabla tiene una fila por artículo
-- POR LOCACIÓN.
--
-- El resultado era una incoherencia que no se sostiene:
--
--   Escaneas un Beefeater en The Crown, la app aprende su código y le
--   asignas la silueta. Alguien escanea el mismo Beefeater en Will's &
--   Bill's: el código lo reconoce —bien— pero la silueta está vacía y el
--   conteo usa la botella genérica.
--
-- Y no hay motivo para que difieran. Un código de barras identifica un
-- producto; la forma de su botella es física. La misma botella no cambia
-- de forma al cruzar la calle.
--
-- ── Qué es global y qué no ───────────────────────────────────────────
--
-- La FORMA sí. El TAMAÑO también se guarda aquí, pero como sugerencia y
-- no como verdad: el nombre de un artículo no siempre lleva el formato
-- ("Beefeater London Dry Gin" a secas), y dos barras pueden stockear el
-- mismo nombre en 750 y en 1 L. La fila local manda sobre el tamaño; la
-- forma la manda esta tabla.
--
-- ── Por qué no se mueve la columna ───────────────────────────────────
--
-- `inventory_items.bottle_shape` se queda y se sigue escribiendo. Pasa a
-- ser una copia local de lo que dice esta tabla, no la verdad. Dos
-- motivos: el import semanal ya sabe conservarla, y si esta tabla no
-- responde el conteo sigue teniendo una forma con la que dibujar en vez
-- de caer a la genérica.
--
-- ── La clave ─────────────────────────────────────────────────────────
--
-- (account_id, item_name). La misma con la que `item_barcodes` relaciona
-- un UPC con un artículo, así que las dos tablas hablan el mismo idioma
-- y un producto se identifica igual en toda la aplicación.

create table if not exists public.item_shapes (
  id             uuid primary key default gen_random_uuid(),
  account_id     text not null,
  item_name      text not null,
  code           text,
  bottle_shape   text,
  bottle_size_ml integer,
  updated_at     timestamptz not null default now(),
  updated_by     text
);

-- Un artículo tiene una forma. Si alguien la corrige, se actualiza esta
-- fila en vez de crear una segunda.
create unique index if not exists item_shapes_account_item_idx
  on public.item_shapes (account_id, item_name);

alter table public.item_shapes enable row level security;

-- Mismo criterio que el resto de tablas del proyecto por ahora. Está en
-- la Fase 0 del plan de escalado, junto con las otras diez.
drop policy if exists item_shapes_all on public.item_shapes;
create policy item_shapes_all on public.item_shapes
  for all using (true) with check (true);

-- ── Sembrar con lo que ya está asignado ──────────────────────────────
--
-- Las formas asignadas hasta ahora viven en las filas de inventario. Se
-- suben aquí para no empezar de cero.
--
-- distinct on (item_name) porque el mismo artículo puede tener forma en
-- dos locaciones y hay que elegir una: se toma la más reciente, que es la
-- que más probablemente se revisó.
insert into public.item_shapes (account_id, item_name, code, bottle_shape, bottle_size_ml)
select distinct on (l.account_id, i.item_name)
       l.account_id, i.item_name, i.code, i.bottle_shape, i.bottle_size_ml
  from public.inventory_items i
  join public.locations l on l.id = i.location_id
 where i.bottle_shape is not null
 order by l.account_id, i.item_name, i.id desc
on conflict (account_id, item_name) do nothing;
