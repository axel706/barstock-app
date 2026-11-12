-- ── 036 · Recetas: escribirlas de cero y casarlas con Toast ──────────
--
-- Axel, 2026-11-12, opción A sobre lámina: escribir una receta de cero,
-- emparejarla con un artículo de Toast cuando el nombre no casa, y decir
-- que un trago de Toast es "el mismo" que otro ya escrito.
--
--   name  el nombre que le diste al escribirla, para enseñarla, cuando al
--         emparejarla con Toast su toast_name cambió al de Toast. NULL: se
--         enseña toast_name.
--   also  otros nombres de Toast que gastan lo mismo ("Same as…"): el
--         cálculo de botellas los casa con esta receta.
--
-- El "Not a drink" no necesita columna: va a toast_item_links como
-- 'ignored', que el cálculo ya se salta.

alter table public.toast_recipes
  add column if not exists name text,
  add column if not exists also text[] not null default '{}';
