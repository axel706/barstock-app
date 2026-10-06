-- ─────────────────────────────────────────────────────────────────────
-- 013 · Un código de barras identifica un FORMATO, no solo un producto
-- ─────────────────────────────────────────────────────────────────────
--
-- Hendrick's se compra en litro. Un día se acaba, alguien va a la tienda
-- y trae uno de 750 ml. Ese 750 tiene su propio código, así que al
-- escanearlo la app no lo reconoce y hay que asignarlo — otra vez a
-- "Hendrick's Gin", porque al proveedor no se le pide "Hendrick's 750":
-- se le pide Hendrick's.
--
-- Hasta aquí todo bien, y de hecho ya funcionaba: la clave única de esta
-- tabla es (account_id, upc), no el producto, así que diez códigos
-- pueden apuntar al mismo artículo.
--
-- ── Lo que estaba roto ───────────────────────────────────────────────
--
-- El tamaño vivía en el PRODUCTO, uno solo. Así que las dos botellas se
-- contaban como si fueran iguales:
--
--     1.5 botellas de 750 ml  +  1.5 botellas de 1 L  =  3.0
--
-- Y no son 3. Son 1,125 ml + 1,500 ml = 2,625 ml, que en botellas de
-- litro —las que se ordenan— son 2.625.
--
-- Lo grave es la dirección del error: la app enseñaba MENOS inventario
-- del que hay, y como el par compara contra on_hand, pedía de más.
--
-- ── Qué cambia ───────────────────────────────────────────────────────
--
-- El código se queda con su tamaño. A partir de ahí el conteo se suma en
-- mililitros, que es la única unidad en la que un 750 y un litro se
-- pueden sumar, y el on_hand sale de dividir por el tamaño que se ordena
-- —`inventory_items.bottle_size_ml`, que pasa a significar exactamente
-- eso: la botella que le pides al proveedor.
--
-- ── Por qué aquí y no en una tabla de formatos ───────────────────────
--
-- Un formato sin código de barras no existe para el escáner, y contar
-- por nombre usa el tamaño del producto. Una tabla aparte solo añadiría
-- una fila que decir lo mismo que esta columna.

alter table public.item_barcodes
  add column if not exists size_ml integer;

comment on column public.item_barcodes.size_ml is
  'Tamaño del envase de ESTE codigo, en ml. Null = usar el del producto '
  '(inventory_items.bottle_size_ml), que es el que se ordena.';

-- ── Los códigos que ya existen ───────────────────────────────────────
--
-- Se quedan en null a propósito, y null significa "el del producto".
-- Eso reproduce EXACTAMENTE el comportamiento de hoy: nada cambia de
-- valor al correr esta migración.
--
-- Rellenarlos con el tamaño del producto habría dado los mismos números
-- pero habría borrado la diferencia entre "este código es de 1 L" y
-- "nadie ha dicho de qué tamaño es este código". La segunda es la que
-- permite preguntarlo más adelante solo donde hace falta.
