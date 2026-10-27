# El ciclo con MarginEdge · diseño

Acordado el 26 oct 2026. Esto define QUÉ se hace con los datos de
MarginEdge y cómo encaja en el ciclo que la app ya tiene. Nada de esto
está implementado todavía salvo donde se indica.

## El ciclo, de domingo a domingo

1. **Conteo.** `completeSnapshot` cierra la semana anterior y
   `saveSnapshot` abre la nueva con `on_hand_start` = lo contado. Ya
   funciona así.
2. **Órdenes.** Se colocan y quedan en `vendor_order_items` con cantidad
   pedida, precio unitario y número de PO. Ya funciona así.
3. **Sincronizar MarginEdge.** Facturas cerradas con fecha dentro del
   ciclo.
4. **Conciliar** pedido contra recibido, por artículo.
5. **Escribir** cuatro cosas: recibido, precio, orden ajustada y el
   número de factura.
6. Durante la semana, `on_hand_live` se calcula y se muestra.
7. Al reiniciar, el live se congela como `expected` y se compara con el
   conteo nuevo.

## Las fórmulas

    on_hand_live = on_hand_start + recibido − vendido
    expected     = on_hand_live en el instante de cerrar
    used         = on_hand_start + recibido − on_hand_end
    diferencia   = expected − on_hand_end  (= used − vendido)

**La diferencia es la varianza que la app ya calcula.** No es una
métrica nueva: es la misma cifra enseñada durante la semana en vez de
sólo al cerrar. Por eso no pueden contradecirse — y por eso hay que
calcularla en un solo sitio.

### La columna `ordered` guarda lo RECIBIDO

El nombre miente. `stock-in.js` escribe ahí lo que llega ("recorded as
received") y `used = on_hand_start + ordered − on_hand_end` sólo cuadra
si es recibido. **No se renombra** —toca seis archivos y una tabla
viva— pero en pantalla se llama *received* y queda escrito aquí, porque
el día que alguien lea ese nombre literalmente y meta ahí lo pedido,
rompe el cálculo de consumo sin que salte ningún error.

### Mientras Toast no esté

`vendido` se sustituye por `avgUsed` de Pour·IQ (media ponderada de
semanas), **prorrateada por días transcurridos**: el martes se descuenta
2/7 de la semana, no la semana entera.

Y las dos cifras NO significan lo mismo, así que no pueden llamarse
igual en pantalla:

- con ventas de Toast, `expected − contado` es **merma**;
- con la media, es **semana atípica** (una fiesta grande, una ola de
  calor).

## Decisiones tomadas

| Pregunta | Decisión |
|---|---|
| Factura que cierra después del ciclo | Entra al ciclo que le toca por fecha y se recalcula esa semana. La app avisa de que una cifra ya vista ha cambiado. |
| Proveedor que está en MarginEdge | MarginEdge manda. El registro manual de ese proveedor se guarda marcado y no suma dos veces. |
| `on_hand` en vivo | `on_hand_start` no se toca nunca. `on_hand_live` se deriva. |
| Qué compara el par en la tabla de órdenes | El live. Si llegó el martes, el jueves no te lo vuelve a sugerir. |

## Qué se guarda y qué se calcula

**Se calcula al leer:** `on_hand_live`. En cuanto exista como columna,
alguien la escribirá desde dos sitios y se desviará del conteo.

**Se guarda:** `expected`, en una columna nueva del snapshot, escrita al
cerrar. Es derivable, pero congelarla la hace auditable.

**Matiz:** `expected` no queda congelada para siempre. Una factura
tardía cambia el `ordered` de una semana cerrada, y con él `used` y
`expected`. Es la consecuencia aceptada de la primera decisión: lo que
no se admite es que cambie en silencio.

## Reglas que no se rompen

1. **La pantalla de conteo no enseña ni el live ni el expected.** Si
   quien cuenta ve "deberías tener 6", escribe 6, la medición deja de
   ser independiente y la diferencia da cero siempre. Mataría la señal
   entera.
2. `on_hand_start` no se modifica después del conteo. Nunca.
3. `expected` se escribe en `completeSnapshot`, en la misma operación
   que `on_hand_end` y `used`, con los datos de la semana vieja.
4. El live negativo no se recorta a cero. Un −1 es información: falta
   una factura o alguien contó mal.
5. Toda escritura desde MarginEdge es por diferencia contra lo ya
   aplicado, nunca suma de lo que ve. Pulsar dos veces no duplica.

## Cómo se muestra el live

El número grande es el live, y debajo una línea pequeña con el detalle:

    6
    contados 2 · +4 recibidos

Cuando no se ha movido nada, no hay segunda línea. El color puede
acompañar (verde movido, gris sin mover) pero no puede ser lo único que
lo diga: no dice cuánto cambió y se pierde para quien no distingue esos
dos colores.

Al lado, la antigüedad del conteo: *contado hace 9 días*. El live se
aleja de la realidad cada día que pasa sin contar.

## Conciliar: por artículo, no por orden

Una orden puede llegar en dos entregas, una factura puede cubrir dos
órdenes, y a veces se pide por teléfono sin orden en la app. Así que la
unidad de conciliación es **el artículo dentro del ciclo**:

    pedido (vendor_order_items)  vs  recibido (facturas)  →  diferencia

El número de factura se adjunta como evidencia, no como vínculo
exclusivo.

**La cantidad pedida no se sobreescribe.** "Pedí 6 y llegaron 4" es
justo la señal que quieres para reclamar y ajustar pares; machacar el 6
la borra. Se añaden `received` y `invoice_number` al lado, y el gasto se
calcula de lo recibido.

## Casos que hay que cubrir

- **Línea de crédito o devolución** (cantidad negativa): resta, es
  legítima.
- **Línea sin mercancía** (flete, depósito): no debe actualizar el
  precio de ninguna botella.
- **Producto comprado que no existe en el inventario**: hoy desaparece
  en silencio; debe salir como "producto nuevo detectado".
- **Artículo sin fila en el ciclo abierto**: no se inventa nada, sale
  en la lista de problemas con su nombre.
- **Artículo nuevo sin semana anterior**: `expected` queda nulo.

## Orden de implementación

1. Conciliar y avisar (sólo lectura, no escribe).
2. Precio al día desde el precio pagado.
3. `received` e `invoice_number` contra la orden; el gasto pasa a
   calcularse de lo recibido.
4. `on_hand_live` derivado y mostrado, y el par comparando contra él.
5. `expected` congelado al cerrar y la comparación en su sección.
6. Toast: `vendido` real sustituye a la media prorrateada.
7. Cron nocturno.

Los pasos 1 a 3 no tocan existencias. El 4 cambia lo que se ve. El 5
cambia lo que se cierra. Conviene no adelantar el 5 al 4.
