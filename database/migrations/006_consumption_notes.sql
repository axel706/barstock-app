-- ─────────────────────────────────────────────────────────────────────
-- 006 · Notas del reporte de Consumption Match
-- ─────────────────────────────────────────────────────────────────────
--
-- Una nota escrita sobre un artículo o sobre una categoría, dentro de un
-- ciclo concreto, para que salga impresa en el PDF que se envía.
--
-- ── Por qué no se reutiliza theoretical_comments ─────────────────────
--
-- Esa tabla ya guarda comentarios por artículo y semana, y encaja casi.
-- Se descartó a propósito: sus notas salen en la tabla de Usage y en su
-- PDF, y estas van dirigidas a quien recibe el reporte de consumo. Un
-- comentario interno del tipo "revisar con el bar back" acabaría en un
-- correo a un tercero sin que nadie lo hubiera decidido. Además aquí
-- hace falta anotar CATEGORÍAS, que allí no existen.
--
-- El precio de esta decisión, dicho para que conste: hay dos sitios
-- donde anotar sobre el mismo artículo y ninguno sabe del otro.

create table if not exists public.consumption_notes (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  week_start  date not null,

  -- 'item' o 'category'. Guardar los dos en la misma tabla evita una
  -- segunda tabla idéntica salvo por una columna.
  scope       text not null check (scope in ('item', 'category')),

  -- El nombre del artículo o el de la categoría. Se guarda el nombre y no
  -- un id porque las filas de Usage tampoco tienen id de artículo: se
  -- unen por nombre en toda la app. Ser coherente con esa decisión pesa
  -- más que ser purista aquí.
  ref         text not null,

  note        text not null default '',
  updated_at  timestamptz not null default now(),

  -- Una nota por cosa y por ciclo. Sin esto, guardar dos veces crea dos
  -- filas y el PDF imprime la que llegue primero.
  unique (location_id, week_start, scope, ref)
);

-- El reporte pide todas las notas de un ciclo de una vez.
create index if not exists consumption_notes_cycle_idx
  on public.consumption_notes (location_id, week_start);

alter table public.consumption_notes enable row level security;

-- ── anon Y authenticated ─────────────────────────────────────────────
--
-- La app habla con Supabase con la clave ANON, no con una sesión
-- iniciada. En la migración 004 las políticas se escribieron solo para
-- `authenticated` y el resultado fue que guardar un código de barras
-- fallaba en silencio hasta que se corrigió a mano. Aquí van los dos
-- roles desde el principio.
drop policy if exists "consumption_notes lectura" on public.consumption_notes;
create policy "consumption_notes lectura"
  on public.consumption_notes for select
  to anon, authenticated
  using (true);

drop policy if exists "consumption_notes alta" on public.consumption_notes;
create policy "consumption_notes alta"
  on public.consumption_notes for insert
  to anon, authenticated
  with check (true);

drop policy if exists "consumption_notes correccion" on public.consumption_notes;
create policy "consumption_notes correccion"
  on public.consumption_notes for update
  to anon, authenticated
  using (true);

-- Borrar sí se permite, al revés que con los códigos de barras: una nota
-- es de quien la escribió y vaciarla es la forma natural de retirarla
-- antes de enviar el reporte.
drop policy if exists "consumption_notes baja" on public.consumption_notes;
create policy "consumption_notes baja"
  on public.consumption_notes for delete
  to anon, authenticated
  using (true);
