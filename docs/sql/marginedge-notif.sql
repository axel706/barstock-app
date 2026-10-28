-- Avisos descartados.
--
-- El centro de notificaciones no guarda avisos: los DERIVA de lo que
-- ya hay —el registro de precios, la conciliación de órdenes— cada vez
-- que se abre. Una tabla de avisos sería una segunda copia de datos
-- que ya existen, y dos copias se desincronizan.
--
-- Lo único que hay que recordar es cuáles cerraste, y eso va aquí.
-- Compartido entre dispositivos: cerrarlo en el teléfono también lo
-- quita del iPad y del escritorio.
--
-- `clave` identifica el aviso de forma estable: para un cambio de
-- precio es la fila del registro, así que el mismo cambio no puede
-- volver con otro nombre y reaparecer.

create table if not exists marginedge_notif_descartadas (
  location_id uuid not null references locations(id) on delete cascade,
  clave       text not null,
  descartada  timestamptz not null default now(),
  primary key (location_id, clave)
);

alter table marginedge_notif_descartadas enable row level security;

drop policy if exists me_notif_all on marginedge_notif_descartadas;
create policy me_notif_all on marginedge_notif_descartadas
  for all using (true) with check (true);

notify pgrst, 'reload schema';
