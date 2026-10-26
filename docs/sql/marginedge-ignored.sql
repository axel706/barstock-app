-- Artículos que, a propósito, no se emparejan con nada.
--
-- Por qué hace falta. Un producto de MarginEdge pertenece a un solo
-- artículo del estante: si dos compiten por el mismo —"Smith Hook
-- Cabernet" y "Smith & Hook Reserve Cabernet", que son dos filas del
-- inventario—, uno de los dos tiene que quedarse sin él. Sin esta
-- tabla, ese perdedor vuelve a la cola cada vez y la pantalla lo pide
-- eternamente: se lo quitan el uno al otro y nada avanza.
--
-- También cubre lo que se compra fuera de MarginEdge, y los duplicados
-- del inventario que no quieres borrar todavía.
--
-- Es reversible: quitar la fila lo devuelve a la cola.

create table if not exists marginedge_ignored (
  location_id uuid not null references locations(id) on delete cascade,
  item_name   text not null,
  created_at  timestamptz not null default now(),
  primary key (location_id, item_name)
);

alter table marginedge_ignored enable row level security;

drop policy if exists marginedge_ignored_all on marginedge_ignored;
create policy marginedge_ignored_all on marginedge_ignored
  for all using (true) with check (true);

notify pgrst, 'reload schema';
