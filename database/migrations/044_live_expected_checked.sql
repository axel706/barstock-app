-- ── 044 · El esperado guarda también la verificación de media semana ──
--
-- Axel, 2026-11-15. El esperado (040) guarda la semana entera: lo
-- contado al abrir + lo que llegó − lo vendido. Es la cuenta que sirve
-- para recetas y merma. Pero si a media semana alguien verificó un
-- producto ("I have enough" o "Running low", tabla stock_checks, 042),
-- el LIVE de ese producto volvía a empezar desde ese número, y Finish
-- count lo compara contra ESE LIVE. Sin esta columna, lo que se veía al
-- cerrar y lo que quedaba guardado eran dos números distintos, y la
-- verificación —la señal de media semana— no llegaba al historial.
--
-- `checked` es la ÚLTIMA verificación del ciclo para ese producto, o
-- null si no hubo:
--   { "n": 6, "at": "2026-11-18T20:12:00Z", "live_said": 8.1,
--     "by": "Mia", "expected": 4.3 }
-- `expected` es el LIVE al cerrar partiendo de ella (lo que Finish count
-- enseñó). `expected` y `difference` de la fila siguen siendo los de la
-- semana entera: no cambian de significado.
--
-- Lo final no se mueve: el trigger de la 040 se rehace con `checked`
-- entre lo que un ciclo final no deja cambiar.

alter table public.live_expected add column if not exists checked jsonb;

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
    or new.checked is distinct from old.checked
    or new.cycle_id <> old.cycle_id or new.location_id <> old.location_id) then
    raise exception 'This cycle is final: its expected numbers do not change.';
  end if;
  return new;
end;
$$;
