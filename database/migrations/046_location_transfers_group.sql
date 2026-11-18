-- ── 046 · Un transfer con varios productos ───────────────────────────
--
-- Axel, 2026-11-18, sobre lámina: una sección "Transfers" (en More) con
-- "New transfer" como la Quick order, varios productos en uno. Un
-- transfer real casi nunca es un solo producto: una caja con Triage,
-- Tito's y dos vinos. Cada producto sigue siendo su fila (cada uno con su
-- producto en cada lado), y `group_id` dice cuáles van juntas: se
-- confirman a la vez y la que recibe tiene UNA orden en Sent con todas.
-- Una fila sin grupo (las de antes) es un transfer de un producto.

alter table public.location_transfers add column if not exists group_id uuid;

create index if not exists location_transfers_grupo
  on public.location_transfers (group_id);
