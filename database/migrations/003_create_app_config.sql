-- Configuración global de la aplicación, no de una locación.
--
-- Nace para el fondo de la pantalla de entrada. Ese fondo tiene una
-- exigencia rara: se pinta ANTES de iniciar sesión, así que quien lo lee
-- no está autenticado — y aun así debe ser el mismo en todas las
-- locaciones y en cualquier dispositivo.
--
-- localStorage no sirve para eso: es por navegador. Una tabla normal
-- tampoco: sin sesión no se puede leer. La combinación que funciona es
-- una tabla con lectura pública y escritura cerrada.

create table if not exists public.app_config (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

-- LECTURA abierta. Es deliberado y hay que entenderlo antes de usar esta
-- tabla para otra cosa: cualquiera con la llave pública puede leer lo
-- que haya aquí. Sirve para un fondo de pantalla. NO metas aquí
-- direcciones, correos, precios ni nada que no pondrías en un cartel.
drop policy if exists "app_config lectura publica" on public.app_config;
create policy "app_config lectura publica"
  on public.app_config for select
  using (true);

-- ESCRITURA cerrada. No hay política de insert ni de update, así que solo
-- la llave de servicio puede escribir — y esa vive únicamente en
-- api/admin.js, detrás de la comprobación de ADMIN_EMAIL.
