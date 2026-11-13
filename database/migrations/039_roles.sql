-- ── 039 · Los roles y sus permisos ──────────────────────────────────
--
-- Axel, 2026-11-13, sobre lámina (3A): roles como Owner, Manager o
-- Bartender, cada uno con sus permisos, y por persona las excepciones.
-- El mismo rol en todas sus locaciones. Todos entran con nombre y PIN.
--
-- Esta tabla guarda SÓLO la definición de cada rol: su nombre y la lista
-- de permisos (las claves de src/permisos.js, CATALOGO). Owner no está:
-- tiene todo y no se edita. Manager y Bartender nacen aquí con lo de
-- fábrica, y Axel los puede cambiar desde Settings › People › Roles.
--
-- Lo de cada persona (su rol, lo que se le quitó y lo que puede) no va
-- en una tabla: va en su app_metadata, que sólo escribe el servidor y
-- viaja dentro de su sesión.
--
-- Se lee con la llave pública (la app enseña los roles). NO tiene
-- políticas de escritura: sólo la escribe api/admin.js con la llave de
-- servicio, después de comprobar que quien lo pide es Owner.
--
-- account_id como texto: se compara con el ACCOUNT_ID de api/admin.js y
-- no se adivina el tipo de la columna de `locations`.

create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  account_id  text not null,
  key         text not null,
  name        text not null,
  perms       text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (account_id, key)
);

alter table public.roles enable row level security;

drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select using (true);

-- Los dos de fábrica, para la cuenta de WJM. Si ya están (la migración se
-- corre dos veces), no se tocan: pueden haberse editado.
insert into public.roles (account_id, key, name, perms) values
  ('wjm-hospitality', 'manager', 'Manager',
   array['ver_dinero','ver_ordenes','ver_ajustes','contar','cerrar_ciclo','editar_productos',
         'ordenes','facturas','recetas','toast','sincronizar']),
  ('wjm-hospitality', 'bartender', 'Bartender',
   array['ver_dinero','ver_ordenes','ver_ajustes','recetas'])
on conflict (account_id, key) do nothing;
