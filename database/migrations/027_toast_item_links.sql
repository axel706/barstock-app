-- ── Emparejar los artículos de Toast con el inventario ─────────────────
--
-- Las ventas que usan Theoretical Usage y Consumption Match vienen de un
-- CSV semanal de MarginEdge, ya en BOTELLAS. Toast da copas y tragos.
-- Para pasar de unas a otras, cada artículo de Toast tiene que apuntar a
-- un producto del inventario, con cuánto lleva: una copa de vino son 6 oz
-- de su botella; una botella vendida es una botella.
--
-- Se empieza por el vino (Axel: copa de 6 oz siempre, y sí venden
-- botellas). `kind` deja sitio para el licor y la cerveza después, con la
-- misma tabla.
--
-- ── Dos cosas, dos sitios ────────────────────────────────────────────
--
-- 1. `locations.toast_restaurant_guid`: qué restaurante de Toast es cada
--    locación. En Vercel hay UN restaurante configurado (Crown); sin
--    esto, abrir la pantalla en Will's & Bill's emparejaría el vino de
--    Crown con el inventario de Will's. La pantalla compara este valor
--    con el restaurante del que vienen los datos y, si no coinciden, no
--    deja tocar nada. Nace vacía: hay que ponerla a mano para Crown (ver
--    el final de este archivo).
--
-- 2. `toast_item_links`: una fila por artículo de Toast revisado.
--    - Se identifica por el guid de Toast, no por el nombre: el nombre
--      se cambia en Toast ("Pio Pinot Grigio") y el guid no.
--    - VARIOS artículos de Toast pueden apuntar al mismo producto: el
--      house Pinot Grigio se vende a precio normal y en Happy Hour, dos
--      artículos, una sola botella.
--    - `item_name` es el producto del inventario, por nombre, igual que
--      `sales_aliases`: es como la app identifica un producto.
--    - `pour_oz` es lo que lleva una venta; NULL es "una botella entera".
--    - `status`: 'confirmed' (lo dijo una persona) o 'ignored' (no es un
--      producto del inventario). Lo que no tiene fila está por revisar.

alter table public.locations
  add column if not exists toast_restaurant_guid text;

create table if not exists public.toast_item_links (
  id               bigserial   primary key,
  location_id      uuid        not null,
  toast_item_guid  text        not null,
  toast_item_name  text        not null,   -- como lo llamaba Toast al revisarlo
  toast_group      text,                   -- "DRINKS › Wine › Red By The Glass"
  kind             text        not null default 'wine'
                   check (kind in ('wine', 'liquor', 'beer')),
  item_name        text,                   -- el producto; NULL si se ignoró
  pour_oz          numeric,                -- NULL = botella entera
  status           text        not null
                   check (status in ('confirmed', 'ignored')),
  updated_at       timestamptz not null default now(),
  -- Un artículo de Toast, una decisión. Revisarlo otra vez la reemplaza.
  unique (location_id, toast_item_guid),
  -- Confirmado siempre apunta a un producto.
  check (status = 'ignored' or item_name is not null)
);

create index if not exists toast_item_links_producto
  on public.toast_item_links (location_id, item_name);

alter table public.toast_item_links enable row level security;

-- ── Las políticas ───────────────────────────────────────────────────
--
-- Como en invoice_order_links: esto es una decisión humana y tiene que
-- poder corregirse. Emparejar un vino con la botella equivocada sin poder
-- deshacerlo sería peor que no poder emparejarlo.

drop policy if exists toast_item_links_read on public.toast_item_links;
create policy toast_item_links_read
  on public.toast_item_links for select
  using (true);

drop policy if exists toast_item_links_insert on public.toast_item_links;
create policy toast_item_links_insert
  on public.toast_item_links for insert
  with check (true);

drop policy if exists toast_item_links_update on public.toast_item_links;
create policy toast_item_links_update
  on public.toast_item_links for update
  using (true) with check (true);

drop policy if exists toast_item_links_delete on public.toast_item_links;
create policy toast_item_links_delete
  on public.toast_item_links for delete
  using (true);

-- ── Después de correr lo de arriba: decir cuál es Crown ──────────────
--
-- Primero mira cómo se llama la locación exactamente:
--
--   select id, name, toast_restaurant_guid from public.locations;
--
-- Y pon el Restaurant GUID de Toast (Toast Web, en la pantalla de la
-- credencial, abajo: "Restaurant GUID") en la fila de Crown, con su id:
--
--   update public.locations
--      set toast_restaurant_guid = 'EL-GUID-DE-CROWN'
--    where id = 'EL-ID-DE-CROWN';
