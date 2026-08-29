-- Silueta propia de cada producto
--
-- Hasta ahora un articulo guardaba solo la CLAVE de un arquetipo
-- ('tequila'), y los nueve arquetipos vivian en el front. Esto guarda la
-- geometria concreta de ESE producto, generada por la IA a partir del
-- nombre: la botella de Patron no es la de Casamigos aunque las dos sean
-- tequila.
--
-- El formato es el mismo que usan los arquetipos:
--   {"yFull":0.72,"p":[[0,0.95],[0.06,1],...,[1,0.30]]}
--
-- Y se usa para dibujar Y para calcular, a proposito: si la silueta esta
-- mal, se ve a simple vista en vez de esconderse en el numero.
--
-- bottle_shape se queda: es el respaldo cuando no hay perfil propio, y
-- tambien lo que distingue lo que se cuenta entero (none) de lo que se
-- cuenta por nivel.

alter table public.inventory_items
  add column if not exists bottle_profile jsonb;

comment on column public.inventory_items.bottle_profile is
  'Geometria propia del producto: {yFull, p:[[y,r],...]}. Dibuja y calcula. Null = usar el arquetipo de bottle_shape.';

-- RECORDATORIO: replaceInventoryMaster() borra y reinserta la tabla
-- entera en cada importacion de conteo. Esta columna ya esta añadida a su
-- lista. Si se agrega otra y se olvida ese detalle, se borrara sola cada
-- semana sin dar ningun error. Ya paso con category.
