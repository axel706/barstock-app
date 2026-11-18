# Transfers entre locaciones

Axel, 2026-11-18. El domingo 15 llevó 12 Triage Vodka de Will's & Bill's
a Crown y las contó. El lunes MarginEdge trajo la factura de "Internal
Transfers" y el LIVE de Crown sumó otras 12 (≈31.8 con 19.8 en la
estantería). Pour·IQ vio la semana del 9 en Crown con 8.85 usadas en vez
de 20.85. Se arregló a mano (SQL de la semana y el lápiz); esto es para
que no haga falta, en cualquier locación, desde el día 1.

Láminas aprobadas: el flujo (camino 1 y 2) y la confirmación C (tarjeta
en el Home, campana y chip en la ficha).

## Lo decidido

- **Quién:** sólo con "Make and send orders", en las dos locaciones.
- **Quien lo registra** lo aplica al momento en SU locación. **La otra**
  lo ve sin mover un dedo y sólo confirma (o "Not right"). Hasta
  confirmar, ahí no cuenta: botellas que nadie ha visto.
- **El producto de cada lado** (Triage Vodka en Crown, Triage House
  Vodka en W+B): quien lo registra pone el suyo; la otra elige el suyo
  al confirmar, y la pareja se recuerda (de los transfers pasados).
- **La que da también lo ve** (−12), si tiene ese producto.
- **La factura se enlaza sola** cuando coinciden producto y cantidad.
- **Al confirmar, la que recibe tiene el transfer en Orders › Sent**
  (Axel: "no fue una orden enviada, pero debe estar ahí para enlazar
  cuando llegue la factura"): una orden marcada como transfer, sin
  correo ni proveedor de verdad, que espera su factura como cualquier
  otra. Así el enlace, el "waiting / received" y el LIVE salen de la
  maquinaria de órdenes que ya existe, no de una segunda.

## Las cuentas

- **LIVE de la que recibe:** su orden de Sent llega a la hora del
  transfer (`moved_at`). Antes del último conteo (`before_count`) no
  suma: ya estaba al contar. Con la factura enlazada, manda la factura,
  como en cualquier orden.
- **LIVE de la que da:** −qty desde `moved_at`, por el transfer (no es
  una orden: no hay factura que esperar).
- **Pour·IQ:** +qty en `ordered` de la semana de la que recibe y −qty en
  la de la que da. Si es de antes del conteo, en la semana que ese
  conteo cerró (y su `used` se rehace), como el SQL del 2026-11-18.
- **Undo** mientras no haya un conteo después; deshace las dos cosas.

## Fases

1. **(Hecha.) Migración 045** (`location_transfers`) — escrita y probada contra
   Postgres 16. La corre Axel.
2. **(Hecha.) Registrar y confirmar:** el botón ⇄ Transfer en la ficha, la hoja,
   la tarjeta del Home, la campana y el chip; "Not right" y Undo.
3. **(Hecha.) Las cuentas:** la orden en Sent al confirmar, el −qty de la que da
   en el LIVE, y Pour·IQ.
4. **(Hecha.) La factura:** enlazarla sola, y "It arrived before the count" (el
   camino 2) que crea el transfer desde la factura.
5. **(Hecha, 2026-11-18.) La sección:** More › *Transfers* a pantalla completa
   (`src/mobile-transfers.js`): "New transfer" con varios productos (−/+, "Add a
   product", Now / Before the count), "To confirm" por grupo con "Confirm all" y
   "This week" con su estado y Undo. El botón ⇄ de la ficha se quitó. Migración
   046 (`group_id`) para agrupar las filas de un mismo envío.
