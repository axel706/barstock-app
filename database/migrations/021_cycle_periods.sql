-- ── La historia de los ciclos ───────────────────────────────────────
--
-- `locations.weekly_reset_at` sólo recuerda CUÁNDO se abrió el ciclo
-- que está abierto. En cuanto se abre otro, el anterior deja de existir
-- para la app: no hay forma de saber que hubo una semana del 19 al 26.
--
-- Eso bastaba mientras todo lo que se miraba era el ciclo en curso.
-- Dejó de bastar con las facturas de MarginEdge: al abrir un ciclo
-- nuevo, las del anterior salen de la pantalla y caen en un cajón
-- plano —"N from earlier cycles"— que en dos meses son cuatrocientas
-- ordenadas por fecha y nada más.
--
-- Una fila por apertura. El FIN de un ciclo es el inicio del
-- siguiente, así que no se guarda: guardarlo sería el mismo dato en
-- dos sitios, y un día dirían cosas distintas.
--
-- Esto NO reconstruye el pasado. La historia anterior a la primera
-- fila no existe y no hay de dónde sacarla; esas facturas se agrupan
-- aparte y la pantalla lo dice con esas palabras.

create table if not exists public.cycle_periods (
  id            bigserial   primary key,
  location_name text        not null,
  started_at    timestamptz not null,
  -- Cómo se abrió: 'reset' (el botón), 'file' (importar un conteo),
  -- 'count' (cerrar un conteo del teléfono) o 'seed' (la fila que
  -- siembra esta misma migración). No cambia nada de lo que se
  -- enseña; sirve para entender un ciclo raro sin adivinar.
  origen        text,
  created_at    timestamptz not null default now(),
  -- Dos dispositivos pueden cerrar el mismo ciclo a la vez. Con la
  -- única, el segundo no duplica la fila: choca y no pasa nada.
  unique (location_name, started_at)
);

create index if not exists cycle_periods_loc
  on public.cycle_periods (location_name, started_at desc);

alter table public.cycle_periods enable row level security;

-- ── Las políticas ───────────────────────────────────────────────────
--
-- Mismo criterio que `count_sessions`: se puede leer y añadir, no
-- modificar ni borrar. Un historial al que sólo se añade no se puede
-- maquillar borrando la semana mala.
--
-- El resto de las tablas siguen con `using (true)` y el repositorio
-- público. Eso es la Fase 0 pendiente y no se arregla aquí; pero esta
-- tabla nace hoy y al menos nace sin lo peor.

drop policy if exists cycle_periods_read on public.cycle_periods;
create policy cycle_periods_read
  on public.cycle_periods for select
  using (true);

drop policy if exists cycle_periods_insert on public.cycle_periods;
create policy cycle_periods_insert
  on public.cycle_periods for insert
  with check (true);

-- Sin política de update ni de delete: sin ellas, RLS las niega.

-- ── Sembrar el ciclo que ya está abierto ────────────────────────────
--
-- Se abrió antes de que esta tabla existiera. Sin esto, el ciclo en
-- curso tampoco tendría fila y el primer grupo de la pantalla
-- aparecería recién la semana que viene.
--
-- Sólo las locaciones que tengan `weekly_reset_at`. `on conflict do
-- nothing` para que correr la migración dos veces no duplique.

insert into public.cycle_periods (location_name, started_at, origen)
select l.name, l.weekly_reset_at, 'seed'
  from public.locations l
 where l.weekly_reset_at is not null
on conflict (location_name, started_at) do nothing;
