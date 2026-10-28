-- Qué le hemos metido ya al ciclo desde MarginEdge.
--
-- `inventory_snapshots.ordered` es acumulativo: `stock-in.js` le SUMA
-- lo que registras a mano. Si la sincronización sumara también, pulsar
-- dos veces duplicaría las entradas, y el error no se vería: el estante
-- subiría el doble y `used = inicial + recibido − final` daría un
-- consumo inflado que nadie podría explicar.
--
-- Con esta tabla la sincronización no suma lo que ve, suma la
-- DIFERENCIA contra lo que ya aplicó. Pulsar diez veces seguidas deja
-- el mismo número que pulsar una. Y si mañana llega una factura
-- atrasada de este ciclo, entra sólo la parte nueva.
--
-- Además deja rastro: cuánto de lo que hay en `ordered` vino de
-- MarginEdge y cuánto lo registró una persona.

create table if not exists marginedge_applied (
  location_id uuid not null references locations(id) on delete cascade,
  week_start  date not null,
  item_name   text not null,
  units       numeric not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (location_id, week_start, item_name)
);

alter table marginedge_applied enable row level security;

drop policy if exists marginedge_applied_all on marginedge_applied;
create policy marginedge_applied_all on marginedge_applied
  for all using (true) with check (true);

notify pgrst, 'reload schema';
