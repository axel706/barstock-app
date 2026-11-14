-- ── 040 · El esperado: el LIVE al cerrar el ciclo, contra lo contado ──
--
-- Axel, 2026-11-14 (el plan entero en docs/plan-esperado.md): el LIVE
-- justo antes de reiniciar el ciclo es lo que DEBERÍA haber en la
-- estantería. Puesto al lado de lo que se contó, la diferencia, semana
-- tras semana, señala recetas o pours mal puestos, merma o robo, y
-- errores al contar.
--
-- ── Por qué tablas propias ───────────────────────────────────────────
--
-- `on_hand` es lo que alguien contó y nada más lo escribe; es el ancla de
-- Pour·IQ. `inventory_snapshots` es de lo contado y lo escriben tres
-- sitios. Meter aquí un número calculado mezclaría las dos cosas. Esto
-- vive aparte y nada de lo de antes cambia.
--
-- ── Dos tablas ───────────────────────────────────────────────────────
--
-- 1. `live_expected_cycles`: un ciclo cerrado de una locación. Cuándo
--    empezó (el conteo anterior) y cuándo acabó (este), qué días de
--    Toast entran, qué días estaban cargados al guardarlo y lo que Toast
--    vendió y no se pudo pasar a botellas (sin receta, sin emparejar).
--    Eso último es de todo el ciclo, no de un producto: un cóctel sin
--    receta pudo llevar cualquier botella.
-- 2. `live_expected`: una fila por producto contado en ese ciclo, con
--    las piezas de la cuenta (lo contado al abrir, lo que llegó, lo
--    vendido) y lo contado al cerrar, COPIADO: un ajuste posterior del
--    inventario no mueve el pasado.
--
-- `expected` y `difference` son columnas calculadas por Postgres: la
-- cuenta vive en un solo sitio y no puede decir otra cosa que sus
-- piezas.
--
-- ── Provisional y final ──────────────────────────────────────────────
--
-- Toast guarda por día de negocio, y el día del conteo no está completo
-- al cerrarlo. El ciclo se guarda `provisional` al cerrar el conteo y
-- pasa a `final` cuando sus días de Toast están cargados y cerrados. Un
-- ciclo final NO se vuelve a calcular: si después cambia una receta, el
-- esperado de esa semana sigue siendo lo que la app sabía entonces. El
-- trigger `live_expected_congelado` lo hace cumplir en la base.
--
-- ── El nombre ────────────────────────────────────────────────────────
--
-- El nombre es la llave del producto, como en todas las tablas. Al
-- renombrar (rename_inventory_item, migración 038) el historial sigue al
-- producto: el trigger `live_expected_renombrar` de inventory_items lo
-- cambia aquí también. Renombrar sí se deja en un ciclo final: cambia la
-- etiqueta, no las cantidades.
--
-- ── Quién escribe ────────────────────────────────────────────────────
--
-- La app, al cerrar el conteo (insertar) y al cerrar el ciclo cuando ya
-- hay ventas completas (actualizar). Lectura, inserción y actualización
-- abiertas, como el resto de tablas mientras RLS siga en `using (true)`;
-- sin política de borrado: la historia no se borra desde la app.

create table if not exists public.live_expected_cycles (
  id             uuid        primary key default gen_random_uuid(),
  location_id    uuid        not null,
  -- El conteo anterior (desde) y este (hasta), como instantes.
  cycle_start    timestamptz not null,
  cycle_end      timestamptz not null,
  -- Los días de negocio de Toast que entran: DESPUÉS de start_day, hasta
  -- end_day incluido. Así cada día pertenece a un solo ciclo: el LIVE ya
  -- no descuenta el día de su conteo (toast-usage lee desde el día
  -- siguiente), así que ese día es del ciclo que se cierra.
  start_day      date        not null,
  end_day        date        not null,
  -- La semana de inventory_snapshots que este ciclo cierra, para unirlas
  -- sin adivinar.
  week_start     date,
  status         text        not null default 'provisional'
                 check (status in ('provisional', 'final')),
  -- [{ "d": "2026-11-15", "complete": true, "closed": true }]: los días
  -- de Toast cargados al guardar. Un día sin entrada es un día que no se
  -- sabe, no un día sin ventas.
  sales_days     jsonb       not null default '[]'::jsonb,
  -- [{ "nombre", "motivo", "unidades" }]: lo vendido sin pasar a botellas.
  unconverted    jsonb       not null default '[]'::jsonb,
  notes          jsonb       not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  finalized_at   timestamptz,
  -- El mismo cierre no se guarda dos veces.
  unique (location_id, cycle_end)
);

create table if not exists public.live_expected (
  id             bigserial   primary key,
  cycle_id       uuid        not null references public.live_expected_cycles (id) on delete cascade,
  location_id    uuid        not null,
  item_name      text        not null,
  start_count    numeric     not null,
  arrived        numeric     not null default 0,
  -- [{ "n": 6, "cuando": "…", "de": "Breakthru · CT-0211" }]
  arrivals       jsonb       not null default '[]'::jsonb,
  sold           numeric     not null default 0,
  -- { "2026-11-10": 1.25, … } en botellas
  sold_by_day    jsonb       not null default '{}'::jsonb,
  -- { "Tito's Mule": 2.1, "Tito's 1.5oz": 0.8 }: de qué se vendió
  sold_from      jsonb       not null default '{}'::jsonb,
  counted        numeric     not null,
  expected       numeric     generated always as (start_count + arrived - sold) stored,
  difference     numeric     generated always as (counted - (start_count + arrived - sold)) stored,
  -- El precio de ese momento: la diferencia en dinero no depende del de hoy.
  unit_price     numeric,
  -- ¿Toast vende este producto? Sin Toast, todo lo usado parecería merma.
  in_toast       boolean     not null default false,
  unique (cycle_id, item_name)
);

-- Lo que más se va a preguntar: la historia de un producto, y un ciclo.
create index if not exists live_expected_producto
  on public.live_expected (location_id, item_name);
create index if not exists live_expected_cycles_loc
  on public.live_expected_cycles (location_id, cycle_end);

-- ── Lo final no se mueve ─────────────────────────────────────────────
--
-- Una fila de un ciclo final no cambia sus cantidades; sólo su nombre
-- (renombrar el producto). Un ciclo final no vuelve a provisional ni
-- cambia sus fechas o lo que se guardó de Toast.
create or replace function public.live_expected_congelado() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'live_expected_cycles' then
    if old.status = 'final' and (
         new.status <> 'final' or new.cycle_start <> old.cycle_start or new.cycle_end <> old.cycle_end
      or new.start_day <> old.start_day or new.end_day <> old.end_day
      or new.sales_days <> old.sales_days or new.unconverted <> old.unconverted) then
      raise exception 'This cycle is final: its expected numbers do not change.';
    end if;
    return new;
  end if;
  if exists (select 1 from public.live_expected_cycles c where c.id = old.cycle_id and c.status = 'final') and (
       new.start_count <> old.start_count or new.arrived <> old.arrived or new.sold <> old.sold
    or new.counted <> old.counted or new.unit_price is distinct from old.unit_price
    or new.arrivals <> old.arrivals or new.sold_by_day <> old.sold_by_day
    or new.sold_from <> old.sold_from or new.in_toast <> old.in_toast
    or new.cycle_id <> old.cycle_id or new.location_id <> old.location_id) then
    raise exception 'This cycle is final: its expected numbers do not change.';
  end if;
  return new;
end;
$$;

drop trigger if exists live_expected_congelado on public.live_expected;
create trigger live_expected_congelado before update on public.live_expected
  for each row execute function public.live_expected_congelado();
drop trigger if exists live_expected_cycles_congelado on public.live_expected_cycles;
create trigger live_expected_cycles_congelado before update on public.live_expected_cycles
  for each row execute function public.live_expected_congelado();

-- ── El historial sigue al producto al renombrarlo ───────────────────
--
-- Un trigger en inventory_items y no una línea más en
-- rename_inventory_item: así no hay que reescribir la 038 entera (dos
-- copias de la misma función acaban diciendo cosas distintas). Sólo se
-- dispara al cambiar el nombre con un UPDATE, que es lo que hace la 038;
-- replaceInventoryMaster borra y reinserta, y eso no es renombrar.
create or replace function public.live_expected_renombrar() returns trigger
language plpgsql as $$
begin
  update public.live_expected set item_name = new.item_name
   where location_id::text = new.location_id::text and item_name = old.item_name;
  return new;
end;
$$;

drop trigger if exists live_expected_renombrar on public.inventory_items;
create trigger live_expected_renombrar after update of item_name on public.inventory_items
  for each row when (old.item_name is distinct from new.item_name)
  execute function public.live_expected_renombrar();

-- ── Las políticas ───────────────────────────────────────────────────

alter table public.live_expected_cycles enable row level security;
alter table public.live_expected enable row level security;

drop policy if exists live_expected_cycles_read on public.live_expected_cycles;
create policy live_expected_cycles_read on public.live_expected_cycles for select using (true);
drop policy if exists live_expected_cycles_insert on public.live_expected_cycles;
create policy live_expected_cycles_insert on public.live_expected_cycles for insert with check (true);
drop policy if exists live_expected_cycles_update on public.live_expected_cycles;
create policy live_expected_cycles_update on public.live_expected_cycles for update using (true) with check (true);

drop policy if exists live_expected_read on public.live_expected;
create policy live_expected_read on public.live_expected for select using (true);
drop policy if exists live_expected_insert on public.live_expected;
create policy live_expected_insert on public.live_expected for insert with check (true);
drop policy if exists live_expected_update on public.live_expected;
create policy live_expected_update on public.live_expected for update using (true) with check (true);
