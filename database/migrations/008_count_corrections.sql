-- ─────────────────────────────────────────────────────────────────────
-- 008 · Correcciones del conteo de cierre
-- ─────────────────────────────────────────────────────────────────────
--
-- "Se me pasó contar estos artículos, pero sé que están ahí."
--
-- ── Por qué esto no es lo mismo que corregir las ventas ──────────────
--
-- Corregir las ventas (007) cambia una comparación. Corregir el conteo
-- cambia el INVENTARIO: las botellas existen, así que el stock de hoy
-- sube, el "to order" baja, el valor de la estantería sube y el par
-- óptimo se recalcula con un consumo distinto.
--
-- Por eso lleva tabla propia y por eso guarda las dos cifras. Tocar el
-- stock sin dejar rastro de por qué sería peor que no poder tocarlo:
-- dentro de un mes, ante un descuadre, la pregunta es "¿esto se contó o
-- se escribió?", y sin este registro no hay respuesta.
--
-- ── La aritmética que hay detrás ─────────────────────────────────────
--
--   poured = stock inicial + recibido − stock final
--
-- `poured` no es un dato: es una resta. No se puede "bajar el poured"
-- directamente; se sube el stock final, y el poured baja solo. Y ese
-- stock final ES el stock inicial de la semana siguiente, que ES el
-- on-hand que se ve hoy en Inventory. No son tres números conectados:
-- es el mismo número escrito en tres sitios.

create table if not exists public.count_corrections (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,

  -- El ciclo cuyo CIERRE se corrige.
  week_start  date not null,
  item_name   text not null,

  -- Lo que dijo el conteo y lo que realmente había. Se guardan los dos:
  -- la diferencia entre ambos es la medida de cuánto se fía uno del
  -- conteo de esa semana, y esa señal se pierde si solo se guarda el
  -- valor bueno.
  counted     numeric,
  actual      numeric not null,

  -- Obligatorio en la práctica: la interfaz no deja guardar sin él.
  reason      text not null default '',
  created_by  text not null default '',
  updated_at  timestamptz not null default now(),

  unique (location_id, week_start, item_name)
);

create index if not exists count_corrections_cycle_idx
  on public.count_corrections (location_id, week_start);

-- ── RLS ──────────────────────────────────────────────────────────────
-- anon Y authenticated: la app usa la clave anon. En la 004 las
-- políticas fueron solo para authenticated y guardar fallaba en silencio.
alter table public.count_corrections enable row level security;

drop policy if exists "count_corrections lectura" on public.count_corrections;
create policy "count_corrections lectura" on public.count_corrections
  for select to anon, authenticated using (true);

drop policy if exists "count_corrections alta" on public.count_corrections;
create policy "count_corrections alta" on public.count_corrections
  for insert to anon, authenticated with check (true);

drop policy if exists "count_corrections correccion" on public.count_corrections;
create policy "count_corrections correccion" on public.count_corrections
  for update to anon, authenticated using (true);

-- Se permite borrar para poder deshacer una corrección equivocada. El
-- registro es una ayuda para entender el histórico, no un libro contable
-- inmutable: si el ajuste estuvo mal, dejarlo ahí confunde más que
-- borrarlo.
drop policy if exists "count_corrections baja" on public.count_corrections;
create policy "count_corrections baja" on public.count_corrections
  for delete to anon, authenticated using (true);
