-- ─────────────────────────────────────────────────────────────────────
-- 018 · Zonas · donde esta cada botella
-- ─────────────────────────────────────────────────────────────────────
--
-- El caso real: Axel no esta en el restaurante y le escriben "no hay St
-- Germain". Con esto abre el producto en el telefono y ve si hay, y
-- donde: main bar 2.3, closet 1, wine cellar 0.
--
-- ── Por que NO hay historial por semana ─────────────────────────────
--
-- La pregunta es "¿donde esta?", no "¿donde estaba en agosto?". Una fila
-- por producto y zona que se sobrescribe en cada conteo. Guardar una
-- version por semana seria construir un almacen de datos para una
-- pregunta que siempre se hace en presente.
--
-- Si algun dia hace falta la historia, el desglose por semana se puede
-- reconstruir de los pases del conteo. Hoy no hace falta.
--
-- ── counted_at no es decoracion ──────────────────────────────────────
--
-- "Hay 1 en el closet" sin fecha es peor que no decir nada: si el conteo
-- fue el lunes y preguntan el viernes, mandas a alguien a buscar algo
-- que ya se acabo. La pantalla SIEMPRE enseña la fecha junto al numero,
-- y por eso la columna es not null.

-- ── 1 · Las zonas de cada locacion ───────────────────────────────────
--
-- Un array de texto en `locations` y no una tabla aparte: son tres o
-- cuatro nombres por locacion, se editan juntos en una pantalla de
-- ajustes y nada mas los referencia por id. Una tabla con su clave
-- foranea seria mas correcta en abstracto y mas trabajo en todo lo
-- demas.
--
-- El orden del array es el orden en que salen los chips en el escaner,
-- asi que el usuario puede poner primero el que mas usa.

alter table public.locations
  add column if not exists zones text[] not null default '{}';

comment on column public.locations.zones is
  'Zonas fisicas de la locacion (main bar, closet, wine cellar). El '
  'orden es el de los chips del escaner. Vacio = la funcion esta '
  'apagada y el conteo se comporta como siempre.';

-- ── 2 · El reparto del ultimo conteo ─────────────────────────────────

create table if not exists public.count_zones (
  location_id  uuid        not null references public.locations(id) on delete cascade,
  item_name    text        not null,
  zone         text        not null,
  bottles      numeric     not null default 0,
  counted_at   timestamptz not null default now(),
  primary key (location_id, item_name, zone)
);

-- La clave primaria ES la regla de negocio: un producto solo puede
-- tener un numero por zona. Sin ella, un conteo que se sincroniza dos
-- veces —y se sincroniza cada dos minutos— dejaria filas duplicadas y
-- el desglose sumaria el doble.

create index if not exists count_zones_item_idx
  on public.count_zones (location_id, item_name);

comment on table public.count_zones is
  'Reparto por zona del ULTIMO conteo de cada producto. Se sobrescribe, '
  'no se acumula. Lo escribe la sesion de conteo mientras se cuenta, no '
  'al cerrar: las preguntas de "¿hay o no hay?" llegan antes de que el '
  'ciclo se cierre.';

alter table public.count_zones enable row level security;

-- Nota: esta politica es tan abierta como las demas de este proyecto.
-- Va en la lista de la Fase 0 junto con las otras 16, no es una
-- excepcion ni una decision nueva.
drop policy if exists count_zones_all on public.count_zones;
create policy count_zones_all on public.count_zones
  for all using (true) with check (true);

grant select, insert, update, delete on public.count_zones to anon, authenticated;
