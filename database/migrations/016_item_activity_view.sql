-- ─────────────────────────────────────────────────────────────────────
-- 016 · item_activity · EL INTERRUPTOR de esconder lo quieto
-- ─────────────────────────────────────────────────────────────────────
--
-- Correr esta migracion ENCIENDE la funcion. Antes de correrla, el
-- codigo ya esta en produccion y no esconde nada.
--
-- Para apagarla:
--
--     drop view public.item_activity;
--
-- Y listo: a la siguiente carga vuelve a verse todo. No hay que
-- redesplegar, ni revertir un commit, ni tocar ningun dato — porque no
-- se guardo ningun estado de archivado en ninguna parte. Esa es la
-- ventaja de que la regla sea calculada.
--
-- ── Que comprobar justo despues de correrla ──────────────────────────
--
-- El chip ambar del inventario deberia decir unos 61 escondidos. Si dice
-- un numero muy distinto —200, o 3— algo no cuadra: dropea la vista,
-- vuelve a estar todo visible, y se mira con calma.
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
