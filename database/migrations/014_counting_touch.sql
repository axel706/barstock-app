-- ─────────────────────────────────────────────────────────────────────
-- 014 · Un conteo vivo se nota, y uno pausado lo dice
-- ─────────────────────────────────────────────────────────────────────
--
-- El botón del ciclo decía "Count abandoned · 138 of 260" sobre un
-- conteo en el que se estaba trabajando esa misma semana. Dos fallos,
-- y el de fondo no era el que se veía.
--
-- ── 1 · Se medía desde el principio ──────────────────────────────────
--
-- "Abandonado" salía de `counting_since`, que es CUÁNDO EMPEZÓ el
-- conteo. Pasados tres días, abandonado — aunque se hubieran contado
-- 138 productos por el camino.
--
-- Un conteo de 260 artículos en varias barras no se hace de una
-- sentada. La pregunta correcta no es cuánto lleva abierto sino cuánto
-- lleva SIN QUE NADIE LO TOQUE. Para eso hace falta la segunda marca.
--
-- ── 2 · Pausar no se enteraba nadie ──────────────────────────────────
--
-- `pausedAt` vivía en el localStorage del teléfono que contaba. El iPad
-- de la barra no tenía forma de saberlo, así que veía un conteo quieto
-- desde hace días y lo llamaba abandonado.
--
-- Y pausado no es abandonado: pausar es deliberado, abandonar es
-- olvidar. Un conteo que alguien pausó a propósito no debe ofrecerse
-- para reclamar, lleve lo que lleve.
--
-- ── Por qué dos columnas y no una ────────────────────────────────────
--
-- Son tres preguntas distintas y cada una tiene su respuesta:
--
--   counting_since      ¿cuándo empezó?      para decir "lleva 7 días"
--   counting_touched_at ¿sigue vivo?         para decidir si se abandonó
--   counting_paused_at  ¿se dejó a propósito? para no llamarlo abandonado
--
-- Reutilizar `counting_since` como marca de actividad habría borrado la
-- primera: el botón ya no podría decir desde cuándo lleva abierto, que
-- es justo lo que hace que alguien se dé cuenta de que se le fue la
-- semana.

alter table public.locations
  add column if not exists counting_touched_at timestamptz,
  add column if not exists counting_paused_at  timestamptz;

comment on column public.locations.counting_touched_at is
  'Ultima vez que alguien conto algo en la sesion abierta. Null = nunca '
  'se toco desde que empezo; ahi manda counting_since.';

comment on column public.locations.counting_paused_at is
  'Cuando se pauso el conteo a proposito. Null = no esta pausado. Un '
  'conteo pausado NUNCA se llama abandonado.';

-- ── Las sesiones que ya estén abiertas ───────────────────────────────
--
-- Se siembra `counting_touched_at` con `counting_since` para las que
-- tengan un conteo en marcha. No es exacto —se perdió el rastro de la
-- última vez que se tocaron— pero es la mejor suposición disponible y
-- evita que al desplegar esto todas aparezcan como recién abandonadas
-- por tener la marca vacía.
update public.locations
   set counting_touched_at = counting_since
 where counting_since is not null
   and counting_touched_at is null;
