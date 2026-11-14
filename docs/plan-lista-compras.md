# La lista de compras y la verificación

Plan, 2026-11-14. **Sin construir.** Idea de Axel: que "Running out
first" no sólo avise, sino que un manager pueda confirmarlo, corregirlo
y convertirlo en compra, y que todos los managers vean lo mismo.

> "Me dice que Tito's se va a terminar, pero no, el manager confirma que
> tengo suficiente. […] A lo mejor confirmo que tengo Tito's, pero tal
> vez me estoy quedando sin Whitehaven." — Axel

Va de la mano de `docs/plan-esperado.md`: las dos miden lo mismo (lo que
la app cree que hay contra lo que hay de verdad), una al cerrar el ciclo
y otra a media semana.

---

## 1. El corazón: la verificación es un número

"Tengo suficiente" no puede ser un sí o un no. Un sí sin número calla el
aviso, pero deja el LIVE mal: lo seguirían diciendo Inventory, el correo
de la mañana y "Order N", y el aviso volvería al día siguiente.

Con un número ("hay 6"):

1. **El LIVE de ese producto parte de ahí:** `verificado + lo que llegó
   después − lo vendido después`, hasta el siguiente conteo. Lo corrige
   en toda la app, no sólo en la tarjeta.
2. **No toca `on_hand`.** `on_hand` sigue siendo lo contado el domingo,
   el ancla de Pour·IQ. La verificación va en su propia tabla y caduca
   con el conteo siguiente.
3. **La diferencia se guarda y enseña algo.** La app decía 1 y había 6:
   algo descuenta de más (una receta con demasiadas onzas). Decía 8 y
   hay 1: algo no se descuenta (un cóctel sin receta, merma, un error de
   captura). Es la señal del esperado, a media semana y en los productos
   que importan.

## 2. Cómo se usa

1. **Desde "Running out first"**, una pantalla de revisión con todo lo
   que avisa. Por producto: **Add to list** (con su "Order N" ya puesto)
   o **I have enough** (pide cuántos hay, teclado numérico).
2. **Cualquier producto, aunque no avise:** "Running low" desde "Do we
   have" o su ficha. Pide cuántos hay y entra a la lista.
3. **Una lista por locación, compartida.** Cada línea dice quién, cuándo
   y por qué ("App: runs out Thu", "Ana: only 1 left").
4. **De la lista a la compra:** agrupada por proveedor, un botón por
   grupo arma la quick order rellena. A media semana casi todo es LOOP
   (lo decidido para el correo de la mañana). Enviada, la línea pasa a
   "Ordered" y se queda hasta que llega: nadie compra dos veces.
5. **La misma página para todos:** el Home ("3 to buy · 2 ordered"), la
   tarjeta deja de repetir lo verificado o ya en la lista, el correo de
   la mañana añade "On the list" y "Checked by …", y la campana avisa
   cuando alguien añade algo.

## 3. Dónde se guarda

Dos tablas nuevas (migración; la corre Axel):

- **`stock_checks`**: locación, producto, cuántos había, cuántos decía la
  app en ese momento (el LIVE), quién, cuándo. No se edita: es historia.
- **`shopping_list`**: locación, producto, cantidad, motivo (app o
  persona), quién, estado (`to_buy` → `ordered` → `arrived`) y la orden
  que la cerró.

## 4. Fases, una a la vez

1. **Verificar:** la tabla y que el LIVE la use. Sin pantalla. Es lo
   delicado (cambia la cuenta del LIVE): pruebas de que `on_hand` no se
   toca.
2. La pantalla de revisión desde la tarjeta, con "I have enough".
3. La lista compartida y "Running low" desde cualquier producto.
4. De la lista a la quick order, con "Ordered".
5. El correo de la mañana y la campana.

## 5. Preguntas para Axel

1. ¿La lista vive en una pestaña "To buy" de Orders, más su resumen en
   el Home?
2. ¿Los bartenders pueden reportar "Running low" (con su número), y sólo
   un manager lo convierte en compra? Sería un permiso nuevo.
3. ¿"I have enough" pide siempre el número? (Propuesta: sí.)
4. ¿Las verificaciones salen en el cierre del conteo ("Tito's: checked
   Wed 6, counted Sun 4")? Encaja con el esperado.
