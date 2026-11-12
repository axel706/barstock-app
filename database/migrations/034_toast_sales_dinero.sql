-- 034 · El dinero de cada venta de Toast (Axel, 2026-11-12)
--
-- La tarjeta Toast Sales del Home enseña net sales, partido en licor
-- (con cócteles) y vino; la cerveza fuera. Hasta aquí toast_sales sólo
-- guardaba cantidades. Tres columnas, todas opcionales: lo cargado antes
-- de esta migración queda en null (no se sabe), no en 0 (no se vendió).
--
--   net             Σ price de las líneas de la fila: después de
--                   descuentos y sin impuesto (Net sales de Toast). null
--                   si alguna línea vino sin precio.
--   mods_price      Σ precio de sus modificadores, aparte: no se ha
--                   medido si Toast ya los incluye en price.
--   sales_category  la categoría de venta de Toast (Liquor, Wine…).
--
-- Sólo añade columnas. No toca ninguna fila ni el conteo. Para llenar la
-- historia, después de correrla: bsToastHistoria(91, { otraVez: true }).

alter table public.toast_sales add column if not exists net            numeric;
alter table public.toast_sales add column if not exists mods_price     numeric;
alter table public.toast_sales add column if not exists sales_category text;

-- Que PostgREST vea las columnas nuevas sin esperar.
notify pgrst, 'reload schema';
