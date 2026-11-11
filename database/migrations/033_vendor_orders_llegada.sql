-- ── Cuándo llega cada pedido, y si fue un quick order ────────────────
--
-- Axel, 2026-11-11: cada pedido pertenece al ciclo en el que LLEGA, no
-- en el que se colocó, y cuenta en el LIVE desde que llega. La llegada
-- se fija al colocarlo: la siguiente entrega de su proveedor (horario de
-- la 032), o la hora que diga un quick order.
--
--   arrives_at  el instante de la llegada. Null = no se sabe (el
--               proveedor no tenía horario, o es un pedido de antes de
--               esto): quien lo lea lo trata como "no se sabe", nunca
--               como "ahora".
--   is_quick    si fue un quick order. Hasta ahora la marca vivía sólo
--               en el teléfono que lo creó y se perdía al recargar: al
--               borrar o reabrir un quick order, la app le restaba al
--               ciclo una cantidad que nunca había sumado.
--
-- vendor_orders no tiene migración en el repo; sus columnas se miraron
-- en information_schema (2026-11-11). Sólo se AÑADEN columnas. Los
-- pedidos que ya existen quedan con arrives_at vacío y is_quick falso:
-- no se inventa una llegada para el pasado.

alter table public.vendor_orders
  add column if not exists arrives_at timestamptz,
  add column if not exists is_quick boolean not null default false;

comment on column public.vendor_orders.arrives_at is
  'Cuándo llega el pedido (la siguiente entrega de su proveedor, o la hora de un quick order). Null = no se sabe.';
comment on column public.vendor_orders.is_quick is
  'Si fue un quick order.';
