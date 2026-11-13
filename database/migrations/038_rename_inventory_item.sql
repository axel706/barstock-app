-- ── 038 · Renombrar un artículo, con todo lo que lleva su nombre ─────
--
-- Axel, 2026-11-13: "no puedo creer que a estas alturas no tengamos la
-- opción de editar un artículo". Nombre, código y borrar, en la hoja del
-- teléfono (opción A).
--
-- El problema de renombrar: la app une cada producto por su NOMBRE en
-- una veintena de tablas (lista sacada de information_schema el
-- 2026-11-13, no adivinada). El renombrar del escritorio sólo cambiaba
-- inventory_items, y el artículo perdía en silencio su emparejamiento
-- con Toast, sus recetas, su código de barras, su zona y su historial.
--
-- Esta función lo cambia en TODAS a la vez, en una sola transacción: o
-- todo o nada. Si algo choca (un nombre que ya existe en otra tabla), no
-- cambia nada y devuelve el error de Postgres tal cual.
--
--   Por locación (location_id): el inventario, el historial de semanas,
--     las correcciones, las zonas, la actividad, MarginEdge (enlaces y
--     precios), los "no match", los borradores de quick order, los alias
--     y ajustes de ventas, lo teórico y Toast. Las recetas y las líneas
--     de pedidos, por su padre (toast_recipes / vendor_orders). En los
--     pedidos y semanas pasadas sólo cambia la etiqueta: las cantidades
--     no se tocan.
--   Compartidas en la cuenta (account_id): códigos de barras y siluetas
--     (y las imágenes sin locación). Si OTRA locación tiene un artículo
--     con el nombre viejo, NO se tocan (serían suyas también) y se dice
--     en `compartidas`.
--   Por nombre normalizado (item_norm): los alias del conteo y las
--     imágenes. La normalización la hace la app (normalizeName) y llega
--     ya hecha, para que no viva en dos sitios.
--   No se tocan: marginedge_not_mine (es el nombre de MarginEdge, no el
--     tuyo) e inventory_items_backup_20260817 (un respaldo viejo).
--
-- p_location es el id de la locación como texto: no se adivina su tipo.
-- p_new_code: el código nuevo, o null para dejarlo. Sólo inventory_items:
-- en item_barcodes, `code` va junto al UPC y no es lo que se edita aquí.

create or replace function public.rename_inventory_item(
  p_location text, p_old text, p_new text,
  p_old_norm text, p_new_norm text, p_new_code text default null
) returns jsonb language plpgsql as $$
declare
  v_loc_name text;
  v_account  text;
  v_n        int;
  v_out      jsonb := '{}'::jsonb;
  v_shared   boolean;
  t          text;
begin
  p_new := trim(coalesce(p_new, ''));
  if p_new = '' then raise exception 'The new name is empty.'; end if;

  select name, account_id::text into v_loc_name, v_account from public.locations where id::text = p_location;
  if v_loc_name is null then raise exception 'Location % was not found.', p_location; end if;

  if not exists (select 1 from public.inventory_items where location_id::text = p_location and item_name = p_old) then
    raise exception 'There is no item called "%" at %.', p_old, v_loc_name;
  end if;

  -- Sólo el código: no hay nombre que arrastrar.
  if p_new = p_old then
    update public.inventory_items set code = coalesce(p_new_code, code), updated_at = now()
      where location_id::text = p_location and item_name = p_old;
    get diagnostics v_n = row_count;
    return jsonb_build_object('inventory_items', v_n, 'renamed', false);
  end if;

  if exists (select 1 from public.inventory_items
             where location_id::text = p_location and lower(item_name) = lower(p_new) and item_name <> p_old) then
    raise exception 'There is already an item called "%" at %.', p_new, v_loc_name;
  end if;

  update public.inventory_items
     set item_name = p_new, code = coalesce(p_new_code, code), updated_at = now()
   where location_id::text = p_location and item_name = p_old;
  get diagnostics v_n = row_count;
  v_out := v_out || jsonb_build_object('inventory_items', v_n);

  foreach t in array array[
    'inventory_snapshots', 'count_corrections', 'count_zones', 'item_activity',
    'marginedge_links', 'marginedge_price_log', 'no_match_items', 'quick_order_drafts',
    'sales_aliases', 'sales_overrides', 'theoretical_exclusions', 'theoretical_sales', 'toast_item_links'
  ] loop
    execute format('update public.%I set item_name = $1 where location_id::text = $2 and item_name = $3', t)
      using p_new, p_location, p_old;
    get diagnostics v_n = row_count;
    v_out := v_out || jsonb_build_object(t, v_n);
  end loop;

  update public.toast_recipe_lines set item_name = p_new
   where item_name = p_old
     and recipe_id in (select id from public.toast_recipes where location_id::text = p_location);
  get diagnostics v_n = row_count;
  v_out := v_out || jsonb_build_object('toast_recipe_lines', v_n);

  update public.vendor_order_items set item_name = p_new
   where item_name = p_old
     and vendor_order_id in (select id from public.vendor_orders where location_id::text = p_location);
  get diagnostics v_n = row_count;
  v_out := v_out || jsonb_build_object('vendor_order_items', v_n);

  update public.inventory_aliases set item_norm = p_new_norm
   where location_id::text = p_location and item_norm = p_old_norm;
  get diagnostics v_n = row_count;
  v_out := v_out || jsonb_build_object('inventory_aliases', v_n);

  -- Las imágenes de ESTA locación son suyas.
  update public.bottle_images set item = p_new, item_norm = p_new_norm, updated_at = now()
   where item_norm = p_old_norm and location = v_loc_name;
  get diagnostics v_n = row_count;
  v_out := v_out || jsonb_build_object('bottle_images', v_n);

  -- Lo compartido en la cuenta, sólo si nadie más usa el nombre viejo.
  v_shared := exists (
    select 1 from public.inventory_items i join public.locations l on l.id = i.location_id
     where l.account_id::text = v_account and i.location_id::text <> p_location and i.item_name = p_old);
  if not v_shared then
    update public.item_barcodes set item_name = p_new where account_id::text = v_account and item_name = p_old;
    get diagnostics v_n = row_count;
    v_out := v_out || jsonb_build_object('item_barcodes', v_n);
    update public.item_shapes set item_name = p_new, updated_at = now() where account_id::text = v_account and item_name = p_old;
    get diagnostics v_n = row_count;
    v_out := v_out || jsonb_build_object('item_shapes', v_n);
    update public.bottle_images set item = p_new, item_norm = p_new_norm, updated_at = now()
     where item_norm = p_old_norm and location is null;
    get diagnostics v_n = row_count;
    v_out := v_out || jsonb_build_object('bottle_images_shared', v_n);
  end if;

  return v_out || jsonb_build_object('renamed', true, 'compartidas', v_shared);
end;
$$;
