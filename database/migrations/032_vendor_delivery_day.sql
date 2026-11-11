-- ── El día y la hora en que llega el pedido de cada proveedor ────────
--
-- Para el LIVE (Axel, 2026-11-11): lo ordenado empieza a contar a la
-- hora de entrega de su proveedor, una por proveedor y por locación. En
-- Crown: LOOP martes 7:00 AM (lo recoge Axel el lunes, que está cerrado),
-- Breakthru martes 4:00 PM, Southern miércoles 4:00 PM, Wine Merchant
-- jueves 4:00 PM. Se pone en Settings → Delivery, en la lista de
-- proveedores (opción B de la lámina).
--
-- Va en vendor_defaults, que ya es la ficha de cada proveedor por
-- locación (correo, cuenta, representante...). Su `delivery_window` es
-- texto libre para el PDF ("8am – 2pm") y la app no lo puede leer: por
-- eso dos columnas aparte.
--
--   delivery_day   0 = domingo … 6 = sábado, como Date.getDay().
--   delivery_time  la hora local de la locación (Nueva York).
--
-- Vacías = el proveedor todavía no tiene día: la app lo dice en rojo y
-- no inventa uno.
--
-- La tabla no tiene migración en el repo; sus columnas se miraron en
-- information_schema antes de escribir esto (2026-11-11). Sólo se
-- AÑADEN columnas: lo que ya hay no se toca.

alter table public.vendor_defaults
  add column if not exists delivery_day smallint
    check (delivery_day between 0 and 6),
  add column if not exists delivery_time time;

comment on column public.vendor_defaults.delivery_day is
  'Día en que llega el pedido de este proveedor: 0 = domingo … 6 = sábado. Null = sin día.';
comment on column public.vendor_defaults.delivery_time is
  'Hora local (Nueva York) desde la que el pedido cuenta en el LIVE.';
