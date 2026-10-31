-- ── Cuánto se tarda en contar ───────────────────────────────────────
--
-- Una fila por conteo cerrado. Tabla y no una columna en `locations`
-- porque el valor está en comparar: una columna sólo recuerda el
-- último, y entonces no se puede ver que pasaste de dos horas a una y
-- cuarto.
--
-- `active_ms` es tiempo ACTIVO, no el reloj de pared. Lo reconstruye
-- `src/count-session.js` de los huecos entre botellas: un hueco corto
-- es que estabas contando y suma; uno largo es que te fuiste y no.
-- Por eso `finished_at - started_at` casi siempre será mayor.

create table if not exists public.count_sessions (
  id            bigserial   primary key,
  location_name text        not null,
  week_key      text        not null,
  started_at    timestamptz not null,
  finished_at   timestamptz not null default now(),
  active_ms     bigint      not null,
  items         integer     not null,
  created_at    timestamptz not null default now()
);

create index if not exists count_sessions_loc_week
  on public.count_sessions (location_name, week_key desc);

alter table public.count_sessions enable row level security;

-- ── Las políticas ───────────────────────────────────────────────────
--
-- El resto de las tablas de este proyecto están con `using (true)`, que
-- con el repositorio público significa que cualquiera con la llave
-- —que está en src/config.js— puede leerlas y escribirlas. Eso es la
-- Fase 0 pendiente y no se arregla aquí.
--
-- Pero esta tabla nace hoy, así que al menos nace sin lo peor: se puede
-- leer y añadir, no modificar ni borrar. Un historial al que sólo se
-- añade no se puede falsear borrando la semana mala.
--
-- Si luego se cierra todo con auth de verdad, esto se sustituye; el
-- cliente no cambia.

drop policy if exists count_sessions_read on public.count_sessions;
create policy count_sessions_read
  on public.count_sessions for select
  using (true);

drop policy if exists count_sessions_insert on public.count_sessions;
create policy count_sessions_insert
  on public.count_sessions for insert
  with check (true);

-- Sin política de update ni de delete: sin ellas, RLS las niega.
