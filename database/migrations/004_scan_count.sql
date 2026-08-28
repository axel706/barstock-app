-- Conteo por escaneo · fase 0, los datos
--
-- Dos cosas independientes que llegan juntas porque las necesita la misma
-- función:
--
--   1. Qué botella es cada artículo (forma y tamaño), para poder convertir
--      una altura en un volumen.
--   2. Qué código de barras corresponde a qué artículo.
--
-- Nada de esto se ve en pantalla todavía.


-- ─────────────────────────────────────────────────────────────────────
-- 1 · Forma y tamaño de botella
-- ─────────────────────────────────────────────────────────────────────
--
-- El deslizador mide ALTURA, y convertirla en volumen depende de la
-- geometría: media botella de Burdeos no es medio litro porque el hombro
-- se cierra arriba; en una botella recta de vodka sí lo es. Sin estos dos
-- campos el deslizador daría un número preciso y falso.
--
-- bottle_shape guarda la clave de un arquetipo (bordeaux, whiskey,
-- tequila…), no una figura. Los perfiles viven en un único archivo del
-- front, para que corregir una forma mal medida sea editar tres cifras.

alter table public.inventory_items
  add column if not exists bottle_size_ml integer,
  add column if not exists bottle_shape   text;

comment on column public.inventory_items.bottle_size_ml is
  'Capacidad nominal en ml: 750, 1000, 1750. Sin esto no hay conversión posible.';
comment on column public.inventory_items.bottle_shape is
  'Clave del arquetipo de forma. Los perfiles están en el front, no aquí.';

-- IMPORTANTE para quien venga después: replaceInventoryMaster() en
-- src/inventory-cloud.js BORRA y reinserta la tabla entera en cada
-- importación del conteo semanal, y solo sobrevive lo que aparece en su
-- lista de columnas. Estas dos ya están añadidas ahí. Si se agrega otra
-- columna a esta tabla y se olvida ese detalle, se borrará sola cada
-- semana sin que nadie se entere. Ya pasó con `category`.


-- ─────────────────────────────────────────────────────────────────────
-- 2 · Códigos de barras aprendidos
-- ─────────────────────────────────────────────────────────────────────
--
-- El campo inventory_items.code guarda el código del PROVEEDOR, que no
-- tiene nada que ver con el UPC impreso en la botella. Así que escanear
-- no encuentra nada, y no hay forma de arreglarlo salvo aprender la
-- correspondencia.
--
-- El sistema la aprende sobre la marcha: se escanea un código
-- desconocido, la persona elige el artículo, y queda asociado para
-- siempre. La primera vuelta es lenta; a partir de la segunda, directa.
--
-- Va por CUENTA y no por locación a propósito: una botella de Casamigos
-- es la misma en todos los bares. Aprenderla en uno la deja aprendida en
-- todos, que es la diferencia entre hacer el trabajo una vez o cuatro.

create table if not exists public.item_barcodes (
  id          uuid primary key default gen_random_uuid(),
  account_id  text not null,
  upc         text not null,
  item_name   text not null,
  code        text,
  created_at  timestamptz not null default now(),
  created_by  text
);

-- Un UPC identifica un producto, así que dentro de una cuenta no puede
-- apuntar a dos artículos. Si alguien reasigna, se actualiza esta fila.
create unique index if not exists item_barcodes_account_upc_idx
  on public.item_barcodes (account_id, upc);

-- Camino inverso: dado un artículo, saber si ya tiene códigos. Un mismo
-- producto puede tener varios (750 ml y 1 L llevan UPC distintos).
create index if not exists item_barcodes_account_item_idx
  on public.item_barcodes (account_id, item_name);

alter table public.item_barcodes enable row level security;

-- Lectura y escritura para usuarios autenticados. Aquí no hay nada
-- sensible —son códigos de producto impresos en el envase— y quien
-- cuenta necesita poder enseñarle uno nuevo a la app sin pedir permiso a
-- nadie. Cerrarlo al admin convertiría cada botella nueva en un trámite.
drop policy if exists "item_barcodes lectura" on public.item_barcodes;
create policy "item_barcodes lectura"
  on public.item_barcodes for select
  to authenticated
  using (true);

drop policy if exists "item_barcodes alta" on public.item_barcodes;
create policy "item_barcodes alta"
  on public.item_barcodes for insert
  to authenticated
  with check (true);

drop policy if exists "item_barcodes correccion" on public.item_barcodes;
create policy "item_barcodes correccion"
  on public.item_barcodes for update
  to authenticated
  using (true);

-- Sin política de DELETE, y es deliberado: un código aprendido es trabajo
-- acumulado de todo el equipo. Corregir a qué artículo apunta, sí;
-- borrarlo desde la app, no.
