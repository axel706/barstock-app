-- ─────────────────────────────────────────────────────────────────────
-- 017 · Arreglar created_at, que decia la fecha equivocada
-- ─────────────────────────────────────────────────────────────────────
--
-- `inventory_items.created_at` ya existia con `default now()`. El
-- problema es que `replaceInventoryMaster` BORRA y reinserta la tabla
-- entera en cada import de conteo, asi que el default se volvia a
-- aplicar y los 270 articulos quedaban "creados" el mismo lunes, al
-- mismo microsegundo:
--
--     2026-10-20T18:57:49.665711   ×270
--
-- No era un dato, era la hora del ultimo import. Nadie lo noto porque
-- nadie lo leia. En cuanto se empezo a usar para la gracia de los
-- recien creados, el inventario entero conto como recien creado y la
-- funcion de esconder no escondia nada.
--
-- La causa esta arreglada en src/inventory-cloud.js: el import ahora
-- reenvia el created_at de cada fila en vez de dejar que el default lo
-- pise. Esta migracion arregla lo que ya quedo mal.
--
-- ── Por que SOBRESCRIBE y no rellena nulos ──────────────────────────
--
-- La 015 solo tocaba filas con created_at nulo, y no habia ninguna: la
-- columna ya venia llena de fechas incorrectas. Rellenar nulos no
-- arregla un dato equivocado.
--
-- El sustituto es la fecha del primer snapshot del articulo, que es lo
-- mas cercano a "cuando entro en la app" que existe en los datos.

update public.inventory_items i
set created_at = s.primera
from (
  select location_id, item_name, min(week_start)::timestamptz as primera
  from public.inventory_snapshots
  group by location_id, item_name
) s
where s.location_id = i.location_id
  and s.item_name  = i.item_name;

-- ── Los que nunca tuvieron snapshot ──────────────────────────────────
--
-- No hay de donde sacarles una fecha. Se les pone una deliberadamente
-- vieja, no la de hoy, porque son precisamente los candidatos a
-- esconderse y la fecha de hoy los blindaria un mes por el accidente de
-- haber corrido esta migracion.
--
-- Efecto secundario que conviene tener claro: si acabas de dar de alta
-- un articulo a mano y todavia no ha entrado en ningun ciclo, esto le
-- pone 2000-01-01 y se escondera en cuanto se encienda la vista. Son los
-- mismos que ya aparecen en la consulta de revision previa — convendria
-- mirar esa lista antes de correr esto.
--
-- A partir de aqui deja de pasar: los articulos nuevos conservan su
-- fecha real porque el import ya no la pisa.

update public.inventory_items i
set created_at = timestamptz '2000-01-01'
where not exists (
  select 1 from public.inventory_snapshots s
  where s.location_id = i.location_id
    and s.item_name  = i.item_name
);

comment on column public.inventory_items.created_at is
  'Cuando entro el articulo. OJO: replaceInventoryMaster borra y '
  'reinserta la tabla en cada import, asi que esta columna SOLO '
  'sobrevive porque esa funcion la reenvia explicitamente. Si se quita '
  'de ahi, vuelve a convertirse en la hora del ultimo conteo sin que '
  'nada de error.';
