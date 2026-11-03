-- ── Reconstruir los ciclos pasados desde los respaldos ──────────────
--
-- `cycle_periods` (migración 021) empieza a registrar aperturas desde
-- que se instala. Lo anterior no existe, así que la pantalla de
-- facturas mete todo el historial en un solo cajón: "Before Nov 1".
--
-- Pero hay un rastro. Se toma un respaldo ANTES de cada operación
-- destructiva, y dos de esas operaciones SON abrir un ciclo:
--
--   reset-on-hand  el botón "Start new cycle"
--   scan-count     cerrar un conteo del teléfono, que abre el siguiente
--   import-count   cargar el conteo desde un archivo
--
-- Así que `inventory_backups.created_at` de esas tres es, con unos
-- segundos de diferencia, el momento en que se abrió un ciclo.
--
-- ── Lo que esto NO es ───────────────────────────────────────────────
--
-- Es una RECONSTRUCCIÓN, no un registro. Dos avisos honestos:
--
--   · Un "Start new cycle" seguido de su conteo dos horas después son
--     DOS respaldos y UNA sola apertura. Se colapsan los eventos que
--     caen a menos de dos días uno de otro, quedándose con el primero.
--   · Un recuento a media semana no abre ciclo, pero deja su respaldo.
--     Ese sí se colaría como una frontera que no existió.
--
-- Por eso las filas van marcadas `origen = 'backup'`: se distinguen de
-- las que registra la app en vivo, y si alguna no cuadra se borra sin
-- tocar las buenas:
--
--   delete from public.cycle_periods where origen = 'backup';
--
-- Y sólo se conservan los 10 respaldos más recientes por locación, así
-- que esto llega hasta donde llegue esa ventana. No hay más.

insert into public.cycle_periods (location_name, started_at, origen)
select b.location_name, b.created_at, 'backup'
  from (
    select
      bk.location_name,
      bk.created_at,
      -- El evento anterior de la MISMA locación. Si está muy cerca,
      -- este no es una apertura nueva: es la segunda mitad de la
      -- misma (apretar "Start new cycle" y contar después).
      lag(bk.created_at) over (
        partition by bk.location_name order by bk.created_at
      ) as anterior
    from public.inventory_backups bk
    where bk.reason in ('reset-on-hand', 'scan-count', 'import-count')
  ) b
 where b.anterior is null
    or b.created_at - b.anterior > interval '2 days'
on conflict (location_name, started_at) do nothing;
