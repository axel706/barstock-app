-- ── Martini y Cosmo: el licor base, 2.5 oz en todos ──────────────────
--
-- Axel, 2026-11-11: "la medida de vodka es la misma" en un Martini y en
-- un Cosmo, "esa debe ser el estándar": 2.5, el Blood Orange incluido.
--
-- Venían de dos hojas distintas: el Martini decía 2.5 y el House Cosmo
-- 2. Por eso el HH Titos Martini salía en la pantalla con DOS líneas de
-- Tito's, 2.5 sin Cosmo y 2 con Cosmo, y parecía un trago de cuatro
-- ingredientes. Con la misma medida queda una sola línea de Tito's, que
-- vale para las dos versiones; el vermouth (sin Cosmo) y el triple sec
-- (con Cosmo) siguen dependiendo del modificador.
--
-- La 029 ya trae estas medidas para quien la corra desde cero. Ésta es
-- para la base donde la 029 ya se corrió. Se puede correr dos veces.
--
-- No toca las botellas elegidas en la app: sólo las onzas, y borra la
-- línea de Tito's "only with Cosmo", que sobra.

do $$
declare
  loc uuid;
  n   integer;
begin
  select count(*) into n from public.locations where toast_restaurant_guid is not null;
  if n <> 1 then
    raise exception 'Se esperaba UNA locación con toast_restaurant_guid (Crown) y hay %', n;
  end if;
  select id into loc from public.locations where toast_restaurant_guid is not null;

  update public.toast_recipe_lines l
     set oz = 2.5
    from public.toast_recipes r
   where l.recipe_id = r.id and r.location_id = loc
     and (   (r.tipo = 'cocktail' and r.toast_name in ('House Cosmo', 'HH Cosmopolitan') and l.label = 'Triage vodka')
          or (r.tipo = 'cocktail' and r.toast_name = 'Blood Orange Cosmo' and l.label = 'Triage Blood Orange vodka')
          or (r.tipo = 'modifier' and r.toast_name = 'Cosmo' and l.chosen));

  delete from public.toast_recipe_lines l
   using public.toast_recipes r
   where l.recipe_id = r.id and r.location_id = loc
     and r.tipo = 'cocktail' and r.toast_name = 'HH Titos Martini'
     and l.label = 'Tito''s vodka' and l.only_with = 'Cosmo';

  update public.toast_recipe_lines l
     set not_with = '{}'
    from public.toast_recipes r
   where l.recipe_id = r.id and r.location_id = loc
     and r.tipo = 'cocktail' and r.toast_name = 'HH Titos Martini'
     and l.label = 'Tito''s vodka';
end $$;

-- ── Para comprobar ───────────────────────────────────────────────────
--
-- Tienen que salir 41 recetas y 67 líneas, y ninguna de esas recetas con
-- el licor a 2:
--
--   select r.toast_name, l.label, l.oz, l.only_with, l.not_with
--     from public.toast_recipes r
--     join public.toast_recipe_lines l on l.recipe_id = r.id
--    where r.toast_name in ('House Cosmo', 'HH Cosmopolitan', 'Blood Orange Cosmo', 'Cosmo', 'HH Titos Martini')
--    order by r.toast_name, l.position;
