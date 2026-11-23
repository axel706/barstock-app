-- ── Las semanas que no se contaron ("Skip this week") ───────────────
--
-- Axel, 2026-11-22: "¿qué pasa cuando una locación NO PUEDE HACER SU
-- CONTEO? […] para no dañar el historial, y que aun así puedan ver los
-- productos en órdenes". Saltar la semana abre el ciclo de pedidos
-- (locations.weekly_reset_at) SIN tocar el on hand.
--
-- Por qué hace falta guardarlo: el LIVE arranca de lo más nuevo entre el
-- último conteo y el inicio del ciclo (toast-usage.ultimoConteo). Si el
-- ciclo se abre sin conteo, el LIVE volvería a empezar en ese instante
-- desde el on hand de la semana pasada y se olvidaría de todo lo vendido
-- en la semana. Con esta fila, todos los teléfonos (y el correo de la
-- mañana) saben que ese inicio de ciclo no es un conteo y siguen
-- contando desde el de antes.
--
-- Una fila por salto:
--   skipped_at     el weekly_reset_at que puso el salto
--   prev_reset_at  el que había antes: desde dónde sigue el LIVE, y a
--                  dónde vuelve "Undo skip"
--   undone_at      si se deshizo (la fila se queda: es historial)

create table if not exists public.count_skips (
  id             bigserial   primary key,
  location_name  text        not null,
  skipped_at     timestamptz not null,
  prev_reset_at  timestamptz,
  skipped_by     text,
  undone_at      timestamptz,
  created_at     timestamptz not null default now(),
  unique (location_name, skipped_at)
);

create index if not exists count_skips_loc
  on public.count_skips (location_name, skipped_at desc);

alter table public.count_skips enable row level security;

-- Leer, añadir y marcar como deshecho. Sin borrar: un salto deshecho se
-- queda con su undone_at, que es lo que dice que no cuenta.
drop policy if exists count_skips_read on public.count_skips;
create policy count_skips_read on public.count_skips for select using (true);

drop policy if exists count_skips_insert on public.count_skips;
create policy count_skips_insert on public.count_skips for insert with check (true);

drop policy if exists count_skips_update on public.count_skips;
create policy count_skips_update on public.count_skips for update using (true) with check (true);
