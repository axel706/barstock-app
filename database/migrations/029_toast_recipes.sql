-- ── Las recetas: de un cóctel de Toast a sus botellas ────────────────
--
-- El licor solo ya está (toast_item_links, kind 'liquor'): la marca es el
-- artículo y la medida su pour. Pero Tito's se va casi todo en cócteles,
-- y un cóctel gasta VARIAS botellas. Sin recetas no hay "deberías tener"
-- del licor que más se mueve.
--
-- Las recetas salen de las hojas que llenó Axel a mano (2026-11-10) y de
-- sus respuestas del 2026-11-11 (también Martini y Cosmo, 2.5 de licor,
-- ver la 030; Rum, Tequila y Whiskey de HH y el Espresso Dark, la 031). Sólo lo que sale del inventario: el
-- jugo, el sirope y el refresco no se cuentan. Onzas por UN trago.
--
-- ── Dos tablas ───────────────────────────────────────────────────────
--
-- 1. `toast_recipes`: una receta por cosa que vende Toast.
--    - `tipo = 'cocktail'`: un ARTÍCULO de Toast ("Golden Vesper", "HH
--      Cosmopolitan"). Se busca por `toast_name`, como lo escribe Toast.
--    - `tipo = 'modifier'`: un MODIFICADOR que convierte un licor solo en
--      un trago ("Grey Goose" + "Martini"). Cuando una venta de licor lo
--      trae, la receta manda sobre el pour de su medida: un Martini de
--      Grey Goose son 2.5 de Grey Goose y 0.5 de vermouth, no el 3 del
--      UP/RX.
--    - Por nombre y no por guid, a diferencia de toast_item_links: un
--      modificador no tiene artículo propio, y así las dos clases de
--      receta se buscan igual. Si Toast le cambia el nombre a algo, la
--      pantalla de recetas lo enseñará sin ventas, no se perderá en
--      silencio.
--    - `pending`: lo que falta que diga Axel. Una receta con `pending` y
--      sin líneas NO es "no gasta nada": es "no se sabe", y quien la lea
--      tiene que tratarla así.
--
-- 2. `toast_recipe_lines`: lo que lleva cada una.
--    - `label` es cómo lo escribió Axel en la hoja ("St. Elder"). Es la
--      pista para elegir la botella, no la botella.
--    - `item_name` es el producto del inventario, por nombre, igual que
--      toast_item_links. NACE VACÍO: lo elige una persona en la app. Aquí
--      no se adivina con un LIKE: "Triage" es la vodka, la de vainilla y
--      la de naranja, y "Cinzano" es el dulce y el seco.
--    - `chosen = true`: el licor que elige el cliente ("un Martini de
--      Grey Goose"). No tiene botella fija; la pone la venta.
--    - `only_with` / `not_with`: las líneas que dependen de un
--      modificador de Toast. El Baileys del Espresso Martini no va si
--      piden "Dark"; el vermouth del Martini no va si es "Dirty".

create table if not exists public.toast_recipes (
  id           bigserial   primary key,
  location_id  uuid        not null,
  tipo         text        not null check (tipo in ('cocktail', 'modifier')),
  toast_name   text        not null,
  happy_hour   boolean     not null default false,
  price        numeric,
  note         text,
  pending      text,
  updated_at   timestamptz not null default now(),
  unique (location_id, tipo, toast_name)
);

create table if not exists public.toast_recipe_lines (
  id          bigserial primary key,
  recipe_id   bigint    not null references public.toast_recipes (id) on delete cascade,
  position    integer   not null default 0,
  label       text      not null,
  item_name   text,
  oz          numeric   not null check (oz > 0),
  chosen      boolean   not null default false,
  only_with   text,
  not_with    text[]    not null default '{}',
  -- El licor que elige el cliente no tiene botella propia.
  check (not (chosen and item_name is not null))
);

create index if not exists toast_recipe_lines_receta
  on public.toast_recipe_lines (recipe_id, position);

alter table public.toast_recipes enable row level security;
alter table public.toast_recipe_lines enable row level security;

-- ── Las políticas ───────────────────────────────────────────────────
--
-- Como en toast_item_links: elegir la botella de un ingrediente es una
-- decisión humana y tiene que poder corregirse desde la app.

drop policy if exists toast_recipes_read on public.toast_recipes;
create policy toast_recipes_read on public.toast_recipes for select using (true);
drop policy if exists toast_recipes_insert on public.toast_recipes;
create policy toast_recipes_insert on public.toast_recipes for insert with check (true);
drop policy if exists toast_recipes_update on public.toast_recipes;
create policy toast_recipes_update on public.toast_recipes for update using (true) with check (true);
drop policy if exists toast_recipes_delete on public.toast_recipes;
create policy toast_recipes_delete on public.toast_recipes for delete using (true);

drop policy if exists toast_recipe_lines_read on public.toast_recipe_lines;
create policy toast_recipe_lines_read on public.toast_recipe_lines for select using (true);
drop policy if exists toast_recipe_lines_insert on public.toast_recipe_lines;
create policy toast_recipe_lines_insert on public.toast_recipe_lines for insert with check (true);
drop policy if exists toast_recipe_lines_update on public.toast_recipe_lines;
create policy toast_recipe_lines_update on public.toast_recipe_lines for update using (true) with check (true);
drop policy if exists toast_recipe_lines_delete on public.toast_recipe_lines;
create policy toast_recipe_lines_delete on public.toast_recipe_lines for delete using (true);

-- ── Las recetas de Crown ─────────────────────────────────────────────
--
-- Crown es la única locación con restaurante de Toast
-- (locations.toast_restaurant_guid, migración 027). Si hubiera cero o
-- más de una, esto se para en vez de cargar las recetas de Crown en otra.
--
-- Se puede correr dos veces: una receta que ya existe no se toca, ni sus
-- líneas, para no pisar las botellas que ya se hayan elegido en la app.
--
-- Cada línea: [etiqueta, oz] o [etiqueta, oz, {opciones}], con
-- "chosen", "only_with" y "not_with".

do $$
declare
  loc     uuid;
  n       integer;
  r       jsonb;
  l       jsonb;
  rid     bigint;
  pos     integer;
begin
  select count(*) into n from public.locations where toast_restaurant_guid is not null;
  if n <> 1 then
    raise exception 'Se esperaba UNA locación con toast_restaurant_guid (Crown) y hay %', n;
  end if;
  select id into loc from public.locations where toast_restaurant_guid is not null;

  for r in select * from jsonb_array_elements($recetas$[
    {"tipo":"cocktail","toast":"Thai Basil Gimlet","price":14,"lines":[["Hendrick's Gin",1.5],["St. Elder",1]]},
    {"tipo":"cocktail","toast":"Golden Vesper","price":12,"lines":[["Tito's vodka",0.75],["Beefeater gin",0.75],["Lillet Blanc",0.75],["Cointreau",0.25]]},
    {"tipo":"cocktail","toast":"Honey & Fig Margarita","price":16,"lines":[["Casa Noble tequila",2],["Triple sec Phillips",0.75]]},
    {"tipo":"cocktail","toast":"Hugo 75","price":14,"lines":[["Empress Indigo gin",1],["St. Elder",0.75],["Prosecco Nino Ardevi",4.5]]},
    {"tipo":"cocktail","toast":"Rosemary Negroni","price":13,"lines":[["Bombay gin",0.75],["Sweet vermouth Cinzano",0.75],["Campari",0.75]]},
    {"tipo":"cocktail","toast":"Seasonal Martini","price":14,"lines":[],"pending":"Changes every week; the sheet was left blank."},
    {"tipo":"cocktail","toast":"Proper Perry","price":12,"lines":[["Prosecco Nino Ardevi",4],["St. Elder",0.5]]},
    {"tipo":"cocktail","toast":"Her Majesty","price":15,"lines":[["Tito's vodka",2],["St. Elder",0.75]]},
    {"tipo":"cocktail","toast":"Blood Orange Cosmo","price":15,"lines":[["Triage Blood Orange vodka",2.5],["Triple sec",0.5]]},
    {"tipo":"cocktail","toast":"Wimbledon Cup","price":12,"lines":[["Pimm's No. 1 Cup",2]]},
    {"tipo":"cocktail","toast":"Mustique Margarita","price":12,"lines":[["Pedro Morales tequila (jalapeño infusion)",1.5],["Triple sec Phillips",0.5]]},
    {"tipo":"cocktail","toast":"Smoky Old Fashioned","price":18,"lines":[["Dad's Hat rye",3]]},
    {"tipo":"cocktail","toast":"Tito's + Berries","price":11,"note":"The Vodka Soda on the sheet.","lines":[["Tito's vodka",1.5]]},
    {"tipo":"cocktail","toast":"Pistachio Martini","price":15,"note":"Any pistachio liqueur: this is the only cocktail that uses it.","lines":[["Grey Goose vodka",1.5],["Pistachio liqueur",1.5]]},
    {"tipo":"cocktail","toast":"S'mores Martini","price":15,"lines":[["Smirnoff Vanilla vodka",1.5],["Godiva chocolate liqueur",1.5],["Baileys",1]]},
    {"tipo":"cocktail","toast":"Seasonal Espresso Martini","price":13,"lines":[["Smirnoff Vanilla vodka",1],["Kamora coffee liqueur",1],["Baileys",0.75,{"not_with":["Dark"]}]]},
    {"tipo":"cocktail","toast":"Espresso Martini","note":"Dark by default: Baileys only with Creamy.","lines":[["Smirnoff Vanilla vodka",1],["Kamora coffee liqueur",1],["Baileys",0.75,{"only_with":"Creamy"}]]},
    {"tipo":"cocktail","toast":"House Cosmo","lines":[["Triage vodka",2.5],["Triple sec",0.75]]},
    {"tipo":"cocktail","toast":"Aperol Spritz","lines":[["Aperol",2],["Prosecco Nino Ardevi",4.5]]},
    {"tipo":"cocktail","toast":"Hugo Spritz","lines":[["St. Elder",2],["Prosecco Nino Ardevi",4.5]]},

    {"tipo":"cocktail","toast":"Bloody Mary","lines":[],"pending":"Not on the sheet."},
    {"tipo":"cocktail","toast":"Margarita","lines":[],"pending":"Not on the sheet."},
    {"tipo":"cocktail","toast":"Moscow Mule","lines":[],"pending":"Not on the sheet."},
    {"tipo":"cocktail","toast":"Old Fashioned Well","lines":[],"pending":"Not on the sheet."},
    {"tipo":"cocktail","toast":"LIT - House","lines":[],"pending":"Not on the sheet."},

    {"tipo":"cocktail","toast":"HH Cosmopolitan","hh":true,"note":"Same as the House Cosmo.","lines":[["Triage vodka",2.5],["Triple sec",0.75]]},
    {"tipo":"cocktail","toast":"HH Vodka Martini","hh":true,"lines":[["Triage vodka",2.5],["Dry vermouth Cinzano",0.5,{"not_with":["Dirty"]}]]},
    {"tipo":"cocktail","toast":"HH Gin Martini","hh":true,"lines":[["Mr Boston gin",2.5],["Dry vermouth Cinzano",0.5,{"not_with":["Dirty"]}]]},
    {"tipo":"cocktail","toast":"HH Titos Martini","hh":true,"note":"With Cosmo it is the HH Cosmo made with Tito's.","lines":[["Tito's vodka",2.5],["Dry vermouth Cinzano",0.5,{"not_with":["Dirty","Cosmo"]}],["Triple sec",0.75,{"only_with":"Cosmo"}]]},
    {"tipo":"cocktail","toast":"HH Lemon Drop Martini","hh":true,"lines":[["Triage vodka",2.5],["Triple sec",0.5]]},
    {"tipo":"cocktail","toast":"HH House Manhattan","hh":true,"lines":[["Kentucky Tavern",2.5],["Sweet vermouth Cinzano",0.5]]},
    {"tipo":"cocktail","toast":"HH Espresso Martini","hh":true,"note":"Dark by default: Baileys only with Creamy.","lines":[["Triage Vanilla vodka",1],["Kamora coffee liqueur",1],["Baileys",0.75,{"only_with":"Creamy"}]]},
    {"tipo":"cocktail","toast":"Vodka","hh":true,"note":"Happy Hour vodka, any mixer.","lines":[["Triage vodka",2]]},
    {"tipo":"cocktail","toast":"Gin","hh":true,"note":"Happy Hour gin, any mixer.","lines":[["Mr Boston gin",2]]},
    {"tipo":"cocktail","toast":"Rum","hh":true,"note":"Happy Hour rum, any mixer.","lines":[["Calypso rum",1.5]]},
    {"tipo":"cocktail","toast":"Tequila","hh":true,"note":"Happy Hour tequila, any mixer. With the Margarita modifier, only the tequila counts for now.","lines":[["Pedro Morales tequila",1.5]]},
    {"tipo":"cocktail","toast":"Whiskey","hh":true,"note":"Happy Hour whiskey, any mixer.","lines":[["Kentucky Tavern",1.5]]},

    {"tipo":"modifier","toast":"Martini","note":"Dirty = no vermouth.","lines":[["Liquor the guest picks",2.5,{"chosen":true}],["Dry vermouth Cinzano",0.5,{"not_with":["Dirty"]}]]},
    {"tipo":"modifier","toast":"Cosmo","note":"The HH Cosmo with the liquor the guest picks.","lines":[["Liquor the guest picks",2.5,{"chosen":true}],["Triple sec",0.75]]},
    {"tipo":"modifier","toast":"Manhattan","lines":[["Liquor the guest picks",2.5,{"chosen":true}],["Sweet vermouth Cinzano",0.5]]},
    {"tipo":"modifier","toast":"Old Fashioned","lines":[["Liquor the guest picks",3,{"chosen":true}]]}
  ]$recetas$::jsonb)
  loop
    insert into public.toast_recipes (location_id, tipo, toast_name, happy_hour, price, note, pending)
    values (loc, r->>'tipo', r->>'toast', coalesce((r->>'hh')::boolean, false),
            (r->>'price')::numeric, r->>'note', r->>'pending')
    on conflict (location_id, tipo, toast_name) do nothing
    returning id into rid;

    -- Ya estaba: ni la receta ni sus líneas se tocan.
    if rid is null then continue; end if;

    pos := 0;
    for l in select * from jsonb_array_elements(r->'lines') loop
      pos := pos + 1;
      insert into public.toast_recipe_lines (recipe_id, position, label, oz, chosen, only_with, not_with)
      values (rid, pos, l->>0, (l->>1)::numeric,
              coalesce((l->2->>'chosen')::boolean, false),
              l->2->>'only_with',
              coalesce(array(select jsonb_array_elements_text(l->2->'not_with')), '{}'));
    end loop;
  end loop;
end $$;

-- ── Para comprobar después de correrlo ───────────────────────────────
--
--   select r.toast_name, r.tipo, r.pending, l.label, l.oz, l.only_with, l.not_with
--     from public.toast_recipes r
--     left join public.toast_recipe_lines l on l.recipe_id = r.id
--    order by r.tipo, r.happy_hour, r.toast_name, l.position;
--
-- Tienen que salir 41 recetas y 70 líneas.
