-- ─────────────────────────────────────────────────────────────────────
-- 019 · Cuanto quedaba en las botellas abiertas el conteo pasado
-- ─────────────────────────────────────────────────────────────────────
--
-- El problema: el deslizador de botella abierta se aprecia a ojo, y dos
-- lecturas de la MISMA botella casi nunca coinciden. Una semana 0.60, la
-- siguiente 0.58, y la app registra un consumo que no ocurrio.
--
-- En el historial de The Crown, el 12% de las semanas-producto tiene
-- consumo NEGATIVO. Nadie des-bebe: eso es el deslizador oscilando.
--
-- El paso de 0.05 en el deslizador (count-panel.js) mata la mayor parte
-- de ese ruido. Esta columna resuelve la otra mitad: poder ENSEÑAR
-- donde quedo la botella la vez anterior, para que quien cuenta tenga
-- una referencia en vez de empezar de cero cada semana.
--
-- ── Por que un array y no un numero ──────────────────────────────────
--
-- Un producto puede tener varias botellas abiertas a la vez: media en
-- la barra y un cuarto en el closet son dos lecturas, no una. Guardar
-- solo el total no permitiria enseñar la referencia de cada una.
--
-- ── Por que no se deduce del on hand ─────────────────────────────────
--
-- Seria tentador sacar la parte abierta de la parte decimal de on_hand
-- —2.71 → 0.71— y funciona con UNA botella abierta. Con dos (0.5 + 0.3)
-- la parte decimal es 0.8, que no es ninguna de las dos. Una referencia
-- que es correcta casi siempre es peor que no tenerla: el dia que falla
-- nadie lo nota.
--
-- ── OJO al añadir esto a replaceInventoryMaster ──────────────────────
--
-- Esa funcion BORRA y reinserta inventory_items en cada import. Lo que
-- no viaje en su lista se pierde cada lunes, sin dar error. Ya paso con
-- category, y volvio a pasar con created_at. Esta columna describe el
-- ARTICULO —su ultimo conteo—, asi que va en la lista.

alter table public.inventory_items
  add column if not exists last_opens numeric[];

comment on column public.inventory_items.last_opens is
  'Fracciones de las botellas abiertas en el ultimo conteo cerrado, una '
  'por botella. Solo se usa para enseñar la referencia al contar de '
  'nuevo; no entra en ningun calculo. Se conserva en '
  'replaceInventoryMaster, igual que category y bottle_size_ml.';
