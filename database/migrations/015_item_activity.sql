-- ─────────────────────────────────────────────────────────────────────
-- 015 · Esconder lo que no se usa, sin borrar nada
-- ─────────────────────────────────────────────────────────────────────
--
-- De 270 articulos, 187 se movieron en las ultimas cuatro semanas. Los
-- otros 83 se parten en dos grupos que no tienen nada que ver:
--
--   61  sin stock y sin movimiento   → ruido puro, no dicen nada
--   22  con stock y sin movimiento   → inventario muerto, es dinero
--
-- Solo se esconde el primer grupo. El segundo hay que verlo.
--
-- ── Por que no hay una columna `archivado` ───────────────────────────
--
-- Porque seria un estado que alguien tiene que mantener. Se pone mal una
-- vez, o se queda puesta cuando el producto vuelve, y a partir de ahi la
-- app miente sin que nada avise.
--
-- La base ya sabe la respuesta: si el articulo tiene stock, o par, o se
-- movio hace poco, no esta muerto. Es una regla calculada, no un dato
-- guardado, y por eso se cura sola: en cuanto el producto reaparece en
-- un conteo vuelve a la lista sin que nadie se acuerde de desarchivarlo.
--
-- Esta migracion solo aporta las dos piezas que faltaban para poder
-- calcularla: cuando se creo cada articulo y cuando se movio por ultima
-- vez. No esconde nada por si misma — eso lo decide el front.

-- ── 1 · Cuando se creo el articulo ───────────────────────────────────
--
-- Hace falta para la gracia de los recien creados: uno dado de alta hoy
-- tiene cero stock y cero historial, y sin esto desapareceria en el acto.

alter table public.inventory_items
  add column if not exists created_at timestamptz;

-- ── El relleno de las filas viejas, que es la parte delicada ─────────
--
-- Un `default now()` le habria puesto la fecha de HOY a los 270
-- articulos, y la gracia de cuatro semanas los habria protegido a todos:
-- la funcion no escondería nada hasta dentro de un mes y pareceria rota.
--
-- Asi que cada articulo hereda la fecha de su primer snapshot, que es lo
-- mas cercano a "cuando entro en la app" que existe en los datos.
update public.inventory_items i
set created_at = s.primera
from (
  select location_id, item_name, min(week_start)::timestamptz as primera
  from public.inventory_snapshots
  group by location_id, item_name
) s
where i.created_at is null
  and s.location_id = i.location_id
  and s.item_name  = i.item_name;

-- Los que nunca tuvieron snapshot no tienen de donde heredar. Se les
-- pone una fecha deliberadamente vieja en vez de la de hoy: son
-- precisamente los candidatos a esconderse, y darles la fecha de hoy los
-- blindaria un mes por el accidente de haber corrido esta migracion.
update public.inventory_items
set created_at = timestamptz '2000-01-01'
where created_at is null;

alter table public.inventory_items
  alter column created_at set default now();

comment on column public.inventory_items.created_at is
  'Cuando entro el articulo. Las filas anteriores a la migracion 015 '
  'heredaron la fecha de su primer snapshot, o 2000-01-01 si nunca '
  'tuvieron uno. Se usa para la gracia de los recien creados: un '
  'articulo nuevo no se esconde aunque no tenga stock ni par.';

-- ── 2 · Cuando se movio por ultima vez ───────────────────────────────
--
-- PostgREST no agrupa, asi que sin esta vista el front tendria que
-- bajarse el historial entero —miles de filas— en cada carga solo para
-- sacar una fecha por articulo.
--
-- `abs(used) > 0.05` y no `used <> 0`: los conteos dejan restas con cola
-- decimal (0.0168723466127495 es una semana en la que no se movio nada).
-- Tratar eso como movimiento mantendria vivo medio inventario muerto.
--
-- Cuenta el movimiento en cualquier direccion: un `used` negativo es una
-- entrega sin registrar, y es tan buena señal de que el producto sigue
-- en uso como una positiva.

create or replace view public.item_activity as
select
  location_id,
  item_name,
  max(week_start)                             as last_moved,
  count(*)                                    as weeks_moved
from public.inventory_snapshots
where used is not null
  and abs(used) > 0.05
group by location_id, item_name;

comment on view public.item_activity is
  'Ultima semana en que cada articulo registro consumo. La usa el front '
  'para decidir que esconder de la lista de inventario sin guardar '
  'ningun estado de archivado.';

-- La vista hereda los permisos de quien la consulta, no los del dueño.
-- Sin esto una vista puede saltarse el RLS de la tabla de abajo, que es
-- justo lo que no se quiere en una base cuyas politicas hay que apretar.
alter view public.item_activity set (security_invoker = on);

grant select on public.item_activity to anon, authenticated;
