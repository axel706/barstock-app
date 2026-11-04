-- ── El fondo del teléfono, aparte del del escritorio ────────────────
--
-- El fondo de la app se guarda por locación en `locations.background_src`
-- y lo leen igual el escritorio y el teléfono: si en el escritorio de
-- Crown se elige "Crown Lounge", lo ven también todos los teléfonos de
-- Crown. Axel quiere que el teléfono tenga el suyo.
--
-- Una columna nueva, también por locación (opción B: todos los teléfonos
-- de una locación ven el mismo). Cualquiera lo puede cambiar, como el del
-- escritorio; Axel lo decidió así.
--
-- Nace vacía y la app la lee así: un teléfono de una locación sin fondo
-- de teléfono sigue viendo el de la locación, como hasta ahora. Correr
-- esto no cambia nada de lo que se ve; sólo deja sitio para elegirlo.
--
-- Sin políticas nuevas: `locations` ya deja leer y actualizar (las
-- dieciséis políticas en `using (true)` son la Fase 0 pendiente), y el
-- escritorio ya escribe `background_src` por ese mismo camino.

alter table public.locations
  add column if not exists mobile_background_src text;
