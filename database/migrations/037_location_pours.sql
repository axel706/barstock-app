-- ── 037 · Los pours de cada restaurante ─────────────────────────────
--
-- Axel, 2026-11-13: "necesito que los restaurantes puedan configurar sus
-- pours, pueden ser distintos entre restaurante". Hasta hoy las medidas
-- del licor solo (Single 1.5, Double 2.5, Up/Rocks 3, Shot 1.5, Mix 1.5)
-- eran una tabla fija en src/toast-liquor.js, igual para todos.
--
--   pours  { "single": 1.5, "double": 2, "neat": 2, ... } — la medida de
--          Toast en minúsculas y sin espacios, y sus onzas. Sólo lo que la
--          locación cambió o añadió; lo que no está, sale de las de
--          siempre (src/toast-pours.js). NULL: todas las de siempre.
--
-- Se lee al calcular (src/toast-usage.js), no al emparejar: cambiar una
-- medida recalcula también los licores ya emparejados (Axel, "y sí
-- recalcula"). toast_item_links.pour_oz se queda como estaba, de reserva.

alter table public.location_settings
  add column if not exists pours jsonb;
