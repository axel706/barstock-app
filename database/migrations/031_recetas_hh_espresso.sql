-- ── Rum, Tequila y Whiskey de Happy Hour, y el Espresso Martini Dark ──
--
-- Axel, 2026-11-11:
--
-- 1. Rum, Tequila y Whiskey de HH son 1.5 oz. Estaban sin líneas y con
--    `pending`, así que no contaban. La marca (Calypso, Pedro Morales,
--    Kentucky Tavern) va sólo como pista para la sugerencia: la botella
--    se elige en Recipes, como todas ("no sé para qué me lo preguntas si
--    en el menú me vas a hacer elegir las botellas").
--
-- 2. "Espresso martini que no trae Creamy ni Dark es Dark por default,
--    así que no usa Baileys." Se contaba al revés: Baileys salvo con
--    "Dark", y de 36 HH Espresso de un día, 25 no traían ninguno de los
--    dos. Ahora el Baileys va sólo con "Creamy", en el Espresso Martini
--    y en el de HH. El Seasonal Espresso Martini no cambia: en Toast se
--    vende sin esos modificadores y su hoja lleva el Baileys.
--
-- La 029 ya trae esto para quien la corra desde cero; ésta es para la
-- base donde ya se corrió. Se puede correr dos veces: las líneas nuevas
-- sólo se añaden a una receta que no tiene ninguna, y lo demás pone
-- valores fijos. No toca las botellas elegidas en la app.

do $$
declare
  loc uuid;
  n   integer;
  x   record;
begin
  select count(*) into n from public.locations where toast_restaurant_guid is not null;
  if n <> 1 then
    raise exception 'Se esperaba UNA locación con toast_restaurant_guid (Crown) y hay %', n;
  end if;
  select id into loc from public.locations where toast_restaurant_guid is not null;

  for x in select * from (values
      ('Rum',     'Calypso rum',           'Happy Hour rum, any mixer.'),
      ('Tequila', 'Pedro Morales tequila', 'Happy Hour tequila, any mixer. With the Margarita modifier, only the tequila counts for now.'),
      ('Whiskey', 'Kentucky Tavern',       'Happy Hour whiskey, any mixer.')
    ) as t(receta, etiqueta, nota)
  loop
    insert into public.toast_recipe_lines (recipe_id, position, label, oz)
    select r.id, 1, x.etiqueta, 1.5
      from public.toast_recipes r
     where r.location_id = loc and r.tipo = 'cocktail' and r.happy_hour and r.toast_name = x.receta
       and not exists (select 1 from public.toast_recipe_lines l where l.recipe_id = r.id);

    update public.toast_recipes
       set pending = null, note = x.nota, updated_at = now()
     where location_id = loc and tipo = 'cocktail' and happy_hour and toast_name = x.receta;
  end loop;

  update public.toast_recipe_lines l
     set only_with = 'Creamy', not_with = '{}'
    from public.toast_recipes r
   where l.recipe_id = r.id and r.location_id = loc
     and r.tipo = 'cocktail' and r.toast_name in ('Espresso Martini', 'HH Espresso Martini')
     and l.label = 'Baileys';

  update public.toast_recipes
     set note = 'Dark by default: Baileys only with Creamy.', updated_at = now()
   where location_id = loc and tipo = 'cocktail' and toast_name in ('Espresso Martini', 'HH Espresso Martini');
end $$;

-- ── Para comprobar ───────────────────────────────────────────────────
--
-- Tienen que salir 41 recetas y 70 líneas.
