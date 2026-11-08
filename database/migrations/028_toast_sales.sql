-- ── Lo vendido en Toast, día por día ─────────────────────────────────
--
-- Para el inventario en vivo ("deberías tener") y para aprender cuánto se
-- gasta cada día de la semana, hace falta lo vendido DÍA POR DÍA. Hasta
-- ahora sólo había semanas (theoretical_sales, del CSV de MarginEdge).
--
-- ── Se guarda lo que dijo Toast, no botellas ─────────────────────────
--
-- Cada fila es un artículo de Toast vendido un día, con su cantidad. La
-- conversión a botellas se hace AL LEER, con toast_item_links. Si se
-- guardaran botellas, corregir un emparejamiento (Undo en Wine from
-- Toast) dejaría toda la historia calculada con el vino equivocado.
--
-- Se guarda todo lo vendido, no sólo el vino: cuando lleguen las recetas,
-- el licor ya tendrá su historia. Los modificadores van en `mods` porque
-- en Toast el modificador dice cómo se sirvió (Martini, Rocks, Double):
-- es lo que una receta va a necesitar. Sin texto libre.
--
-- ── Dos tablas ───────────────────────────────────────────────────────
--
-- 1. `toast_sales_days`: qué días se cargaron. Sin esto, un día sin
--    ventas y un día que nunca se cargó son lo mismo (ninguna fila), y
--    el segundo se leería como "no se vendió nada": un fallo disfrazado
--    de dato.
--    - `complete`: si se leyeron todas las páginas de órdenes del día.
--    - `closed`: si el día de negocio ya terminó. Un día abierto (hoy) se
--      vuelve a cargar entero cada vez.
--
-- 2. `toast_sales`: lo vendido. Volver a cargar un día BORRA sus filas y
--    las escribe de nuevo: si se anuló una orden después, la carga nueva
--    ya no la trae, y un upsert la habría dejado ahí.
--
-- Las escribe la función de Toast (api/integrations.js) con su llave de
-- servicio, para que el correo de la mañana pueda cargar ventas sin que
-- nadie abra la app.

create table if not exists public.toast_sales_days (
  location_id    uuid        not null,
  business_date  date        not null,
  orders         integer     not null default 0,
  complete       boolean     not null default false,
  closed         boolean     not null default false,
  fetched_at     timestamptz not null default now(),
  primary key (location_id, business_date)
);

create table if not exists public.toast_sales (
  id               bigserial   primary key,
  location_id      uuid        not null,
  business_date    date        not null,
  toast_item_guid  text        not null,
  toast_item_name  text        not null,
  toast_group      text,                   -- "DRINKS › Liquor › Vodka"
  mods             text        not null default '',  -- modificadores, ordenados, "Martini · Up"
  quantity         numeric     not null,
  -- Un artículo con los mismos modificadores, una fila por día.
  unique (location_id, business_date, toast_item_guid, mods)
);

-- Lo que más se va a preguntar: lo vendido de un artículo entre dos
-- fechas (la semana, desde el conteo, los martes del último año).
create index if not exists toast_sales_articulo
  on public.toast_sales (location_id, toast_item_guid, business_date);

alter table public.toast_sales_days enable row level security;
alter table public.toast_sales enable row level security;

-- ── Las políticas ───────────────────────────────────────────────────
--
-- La app sólo LEE: escribe la función de Toast con la llave de servicio,
-- que no pasa por RLS. Por eso aquí sólo hay lectura.

drop policy if exists toast_sales_days_read on public.toast_sales_days;
create policy toast_sales_days_read
  on public.toast_sales_days for select
  using (true);

drop policy if exists toast_sales_read on public.toast_sales;
create policy toast_sales_read
  on public.toast_sales for select
  using (true);
