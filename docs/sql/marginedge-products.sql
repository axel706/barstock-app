-- Copia local del catálogo de MarginEdge.
--
-- Por qué existe: MarginEdge limita a un par de peticiones por segundo y
-- el catálogo pasa de los miles de productos. Leerlo en vivo cada vez que
-- se abre la pantalla de emparejar da 429 siempre. Se trae una vez, se
-- guarda aquí, y la pantalla trabaja contra esta tabla.
--
-- Es una copia, no la verdad: la verdad sigue siendo MarginEdge. Por eso
-- `updated_at`, para saber cuándo se refrescó.

create table if not exists marginedge_products (
  location_id uuid not null references locations(id) on delete cascade,
  product_id  text not null,          -- companyConceptProductId
  name        text,
  type        text,                   -- BEER, LIQUOR, WINE, NA_BEVERAGES, o vacío
  category_id text,
  price       numeric,                -- latestPrice, por `unit`
  unit        text,                   -- reportByUnit
  updated_at  timestamptz not null default now(),
  primary key (location_id, product_id)
);

create index if not exists marginedge_products_loc
  on marginedge_products (location_id);

alter table marginedge_products enable row level security;

-- Nota: esta política es tan abierta como las otras 16 de la base. Entra
-- en la misma deuda pendiente (Fase 0), no la empeora.
drop policy if exists marginedge_products_all on marginedge_products;
create policy marginedge_products_all on marginedge_products
  for all using (true) with check (true);

-- Cuándo se sincronizó por última vez, por locación.
alter table location_settings
  add column if not exists marginedge_synced_at timestamptz;
