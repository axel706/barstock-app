-- ─────────────────────────────────────────────────────────────────────
-- 007 · Corregir las ventas de un artículo
-- ─────────────────────────────────────────────────────────────────────
--
-- Dos problemas distintos, dos tablas distintas.
--
-- ── 1. El POS llama al producto de otra forma ────────────────────────
--
-- El fichero de ventas trae "AVIARY CAB SAUV" y el inventario dice
-- "Aviary Cabernet Sauvignon 2021". Hoy eso se resuelve con un emparejado
-- difuso —si un nombre contiene al otro— que falla de dos maneras: no
-- encuentra el vino, o lo engancha a la línea equivocada porque las dos
-- contienen "Cabernet".
--
-- El enlace es PERMANENTE y no lleva semana: el POS no va a cambiarle el
-- nombre al producto de un ciclo a otro. Se dice una vez y todas las
-- importaciones futuras lo aprovechan.
--
-- ── 2. El número simplemente está mal ────────────────────────────────
--
-- La venta no se registró, el POS reportó otra cosa, o se vendió fuera
-- del sistema. Aquí no hay línea que enlazar: hace falta escribir la
-- cifra. Eso SÍ lleva semana, porque corrige un ciclo concreto.
--
-- ── Por qué no se editan directamente las filas de theoretical_sales ─
--
-- Porque volver a cargar el CSV las sobreescribe: el upsert de
-- saveSalesToSupabase machaca `sold` con lo que venga del fichero, y la
-- corrección desaparecería sin aviso justo cuando alguien recarga el
-- fichero por otro motivo. Separadas, el fichero manda sobre lo
-- importado y la persona manda sobre el fichero.

-- ── Enlaces de nombre ────────────────────────────────────────────────
create table if not exists public.sales_aliases (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,

  -- Como viene en el fichero de ventas, ya normalizado a MAYÚSCULAS y con
  -- los espacios colapsados: es la misma forma que usa la app al leer el
  -- CSV, y compararlos crudos fallaría por un espacio doble.
  pos_name    text not null,

  -- El artículo del maestro de inventario, tal cual.
  item_name   text not null,

  created_at  timestamptz not null default now(),

  -- Una línea del POS apunta a un solo artículo. Al revés no: un artículo
  -- puede recibir varias líneas —el mismo vino por copa y por botella— y
  -- se suman.
  unique (location_id, pos_name)
);

create index if not exists sales_aliases_item_idx
  on public.sales_aliases (location_id, item_name);

-- ── Números escritos a mano ──────────────────────────────────────────
create table if not exists public.sales_overrides (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  week_start  date not null,
  item_name   text not null,

  -- Las ventas de ese artículo en ese ciclo. Acepta decimales porque el
  -- POS vende copas, no solo botellas enteras.
  sold        numeric not null,

  -- Quién y por qué. Sin esto, dentro de dos meses nadie sabrá si el 6.4
  -- salió de un ticket real o de una suposición, y una cifra corregida a
  -- mano que nadie puede justificar contamina el informe entero.
  reason      text not null default '',
  created_by  text not null default '',
  updated_at  timestamptz not null default now(),

  unique (location_id, week_start, item_name)
);

create index if not exists sales_overrides_cycle_idx
  on public.sales_overrides (location_id, week_start);

-- ── RLS ──────────────────────────────────────────────────────────────
--
-- anon Y authenticated. La app habla con Supabase con la clave ANON, no
-- con una sesión iniciada. En la migración 004 las políticas se
-- escribieron solo para `authenticated` y guardar fallaba en silencio
-- hasta que se corrigió a mano.
alter table public.sales_aliases  enable row level security;
alter table public.sales_overrides enable row level security;

drop policy if exists "sales_aliases lectura" on public.sales_aliases;
create policy "sales_aliases lectura" on public.sales_aliases
  for select to anon, authenticated using (true);

drop policy if exists "sales_aliases alta" on public.sales_aliases;
create policy "sales_aliases alta" on public.sales_aliases
  for insert to anon, authenticated with check (true);

drop policy if exists "sales_aliases correccion" on public.sales_aliases;
create policy "sales_aliases correccion" on public.sales_aliases
  for update to anon, authenticated using (true);

-- Un enlace mal hecho manda las ventas al artículo equivocado, así que
-- deshacerlo tiene que ser posible.
drop policy if exists "sales_aliases baja" on public.sales_aliases;
create policy "sales_aliases baja" on public.sales_aliases
  for delete to anon, authenticated using (true);

drop policy if exists "sales_overrides lectura" on public.sales_overrides;
create policy "sales_overrides lectura" on public.sales_overrides
  for select to anon, authenticated using (true);

drop policy if exists "sales_overrides alta" on public.sales_overrides;
create policy "sales_overrides alta" on public.sales_overrides
  for insert to anon, authenticated with check (true);

drop policy if exists "sales_overrides correccion" on public.sales_overrides;
create policy "sales_overrides correccion" on public.sales_overrides
  for update to anon, authenticated using (true);

drop policy if exists "sales_overrides baja" on public.sales_overrides;
create policy "sales_overrides baja" on public.sales_overrides
  for delete to anon, authenticated using (true);
