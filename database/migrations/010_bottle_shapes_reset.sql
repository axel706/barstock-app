-- ─────────────────────────────────────────────────────────────────────
-- 010 · Borrón y cuenta nueva en las formas de botella
-- ─────────────────────────────────────────────────────────────────────
--
-- Se retira la silueta propia por producto y se vacían las formas
-- asignadas. La geometría se va a rehacer con un estándar nuevo, medido,
-- y arrancar sobre asignaciones viejas dejaría media biblioteca en el
-- criterio antiguo sin forma de distinguir cuál es cuál.
--
-- ── Por qué se va la silueta propia ──────────────────────────────────
--
-- `bottle_profile` guardaba el contorno de CADA producto, trazado sobre
-- una foto de la botella. Prometía la botella exacta de cada marca y
-- entregaba un contorno aproximado que había que corregir a mano,
-- producto por producto, doscientas sesenta veces.
--
-- Y había algo peor, que solo se vio al ir a retirarla: el perfil se
-- escribía aquí pero NUNCA se volvía a leer. `inventory-realtime.js`
-- solo trae `bottle_size_ml` y `bottle_shape`, así que una silueta
-- trazada funcionaba hasta que se recargaba la página y a partir de ahí
-- el conteo usaba la forma de familia igualmente. La columna llevaba
-- meses guardando datos que nadie consultaba.
--
-- Se DROPEA en vez de vaciarse. Una columna vacía que nadie lee es una
-- invitación a que alguien la vuelva a llenar dentro de seis meses.
--
-- ── Por qué se vacía bottle_shape ────────────────────────────────────
--
-- Incluidas las marcadas 'none' —cerveza, latas, refrescos, lo que se
-- cuenta entero y no lleva deslizador—. Es una decisión consciente: son
-- correctas y habrá que volver a ponerlas. Se prefiere reasignar todo
-- con un solo criterio a convivir con dos.
--
-- ── Lo que NO se toca ────────────────────────────────────────────────
--
-- `bottle_size_ml` se queda. El tamaño casi siempre se dedujo del nombre
-- del producto —1.75, 750 ml, 375— y esas lecturas son buenas. Tirarlas
-- sería trabajo perdido sin ganar nada, y además el tamaño es
-- justamente lo que el estándar nuevo necesita para deformar cada forma.
--
-- ── Antes de correr esto ─────────────────────────────────────────────
--
-- Los conteos ya cerrados no cambian: `inventory_snapshots` guarda
-- cantidades, no geometría. Lo que queda sin forma es el maestro, y
-- hasta reasignarlo el panel de conteo dibuja la botella genérica.

-- Una copia por si acaso. Cuesta nada y hace reversible lo que si no
-- sería definitivo.
create table if not exists public.bottle_shapes_backup_010 as
  select id, location_id, item_name, bottle_shape, bottle_size_ml,
         now() as saved_at
    from public.inventory_items
   where bottle_shape is not null;

update public.inventory_items
   set bottle_shape = null
 where bottle_shape is not null;

alter table public.inventory_items
  drop column if exists bottle_profile;
