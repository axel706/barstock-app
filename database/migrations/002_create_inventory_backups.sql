-- Respaldos automáticos del inventario por locación.
--
-- Motivo: el 17 de agosto de 2026 un operador presionó "Load master" por
-- error en Will's & Bill's y borró los códigos y los suggested de 218
-- artículos. Se recuperó reconstruyendo desde inventory_snapshots, que
-- por suerte guardaba code y suggested_at_time. Eso fue suerte, no
-- diseño. Esta tabla lo vuelve deliberado.
--
-- Una fila por respaldo, con el inventario completo en payload. Con ~260
-- artículos el JSON pesa unas decenas de kilobytes, así que no vale la
-- pena normalizarlo a una fila por artículo: listarlos y restaurarlos es
-- mucho más simple así.
--
-- location_id va como text a propósito. app_logs ya evita las llaves
-- foráneas a locations, y guardarlo como texto funciona igual si el id de
-- la locación es uuid o entero, sin tener que adivinar el tipo.

create table if not exists public.inventory_backups (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  location_id   text not null,
  location_name text,
  reason        text not null default 'manual',
  item_count    integer not null default 0,
  payload       jsonb not null
);

create index if not exists inventory_backups_loc_idx
  on public.inventory_backups (location_id, created_at desc);

-- Nadie llega a esta tabla desde el navegador: todo pasa por
-- api/backup.js, que usa la llave de servicio. RLS activo y sin políticas
-- deja fuera a la llave pública, que es justo lo que se busca.
alter table public.inventory_backups enable row level security;
