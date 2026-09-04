-- ─────────────────────────────────────────────────────────────────────
-- 009 · De qué archivo vino cada venta
-- ─────────────────────────────────────────────────────────────────────
--
-- Las ventas de un ciclo llegan en DOS archivos, no en uno: el del licor
-- y el del vino. Salen de informes distintos del POS y casi nunca se
-- suben a la vez.
--
-- Hasta ahora `theoretical_sales` guardaba el nombre del archivo en
-- `source_file` pero no de qué tipo era. Las etiquetas "Liquor" y "Wine"
-- existían solo en el mensaje de estado de la pantalla y se perdían al
-- refrescar. Eso hacía imposible responder a la única pregunta que
-- importa al abrir un ciclo: ¿falta alguno de los dos?
--
-- Y la pregunta importa porque un artículo sin línea de ventas no se lee
-- como "no hay dato", se lee como PÉRDIDA TOTAL. Un ciclo al que le
-- falta el archivo del vino no enseña un hueco: enseña una pérdida
-- inventada, y parece un problema de inventario.
--
-- ── Por qué se admite nulo ───────────────────────────────────────────
--
-- Todo lo cargado antes de hoy no tiene tipo y no hay forma de deducirlo
-- —el nombre del archivo no sirve, cada semana se llama distinto—. En
-- lugar de adivinar, esas filas se quedan en nulo y la app las trata
-- como "cargado, tipo desconocido": no monta el aviso, porque el aviso
-- diría que falta algo que en realidad está.
--
-- Poner un valor por defecto habría sido peor que dejarlo vacío: una
-- semana con solo el archivo del licor quedaría marcada como si tuviera
-- los dos, y el aviso no saltaría nunca donde más falta hace.

alter table public.theoretical_sales
  add column if not exists kind text;

-- Solo dos valores, o ninguno. Sin esto, un 'Liquor' con mayúscula o un
-- 'liquors' en plural pasarían y el recuento de qué falta saldría mal
-- sin que nada fallara a la vista.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'theoretical_sales_kind_chk'
  ) then
    alter table public.theoretical_sales
      add constraint theoretical_sales_kind_chk
      check (kind is null or kind in ('liquor', 'wine'));
  end if;
end $$;

-- La pregunta que se hace al abrir un ciclo es siempre la misma: qué
-- tipos hay cargados en esta semana. Sin índice, eso recorre todas las
-- ventas de la locación cada vez.
create index if not exists theoretical_sales_kind_idx
  on public.theoretical_sales (location_id, week_start, kind);
