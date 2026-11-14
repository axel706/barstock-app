# El esperado: el LIVE al cerrar el ciclo, contra lo contado

Plan, 2026-11-14. **Sin construir.** Idea de Axel, aterrizada aquí para
que no se pierda y para construirla por fases. Él recuerda que hablamos de
más usos: cuando los recuerde, van en *Usos* y *Fases*.

> "Antes de reiniciar el ciclo, la aplicación dice que debería tener 5
> botellas de Tito's, es un número live. Si cuando cuento resulta que
> tengo una, esa diferencia entre el expected y lo que en realidad
> encontré ayuda para dos cosas: darnos cuenta que a lo mejor una receta
> está mal […] o que hay una merma, incluso un robo." — Axel

---

## 1. Qué es

Para cada producto y cada ciclo:

```
esperado  = contado al abrir + lo que llegó − lo vendido en Toast    (el LIVE)
contado   = lo que se contó al cerrar
diferencia = contado − esperado
```

- **Diferencia negativa** (esperaba 5, hay 1): se fue algo que Toast no
  vio. Una receta que falta o descuenta de menos, un pour mal puesto,
  merma, robo, o un error al contar.
- **Diferencia positiva** (esperaba 5, hay 8): una receta o un pour que
  descuenta de más, algo que llegó sin factura ni orden, o un error al
  contar.

El esperado es el MISMO número que la app enseña con "≈" durante la
semana (`live-stock.js`). No es otra cuenta: es esa cuenta, congelada al
final del ciclo y puesta al lado del conteo.

**Lo que no cambia:** `on_hand` sigue siendo sólo lo contado, e
`inventory_snapshots` y Pour·IQ no se tocan. El esperado va en su propia
tabla. Nada de esto escribe en el conteo
(`test-toast-no-toca-conteo` se amplía para cubrirlo).

---

## 2. El problema de la hora, y la solución: dos tiempos

Ventas, llegadas y conteo no van al mismo reloj:

- Toast guarda las ventas **por día de negocio**, no por hora. Las del
  domingo no están completas hasta la carga de la madrugada del lunes,
  salvo que se haga Sync.
- El conteo dura un rato, y el bar puede estar vendiendo mientras tanto.

Si el esperado se calculara en el momento de reiniciar, el domingo
saldría a medias y cada producto parecería tener "de más". Por eso se
guarda en **dos tiempos**:

1. **Al cerrar el conteo, se congelan los datos de entrada** de cada
   producto: el contado al abrir, las llegadas con su hora (las de
   `live-stock`, con su `arrives_at` o la fecha de su factura), lo
   contado al cerrar, la hora del conteo y el estado de las ventas de
   Toast en ese momento. La fila queda **provisional**.
2. **La mañana siguiente**, cuando el día del conteo ya está cargado y
   cerrado en Toast (`toast_sales_days.closed`), se calcula lo vendido
   del ciclo con las ventas completas y la fila queda **final**. Lo hace
   la tarea diaria de Vercel que ya existe (`lib/morning-cron.js`, que
   corre los mismos archivos de `src/`): sin función nueva en `api/`.

Una fila final no se recalcula nunca. Si después cambia una receta o un
pour, el esperado de ese ciclo sigue siendo el que era, porque es lo que
la app decía con lo que sabía entonces. El pasado no se mueve. Para ver
qué habría dicho con la receta nueva está el *recálculo* (uso 6), que no
pisa lo guardado.

**Decisión pendiente (pregunta 1):** si el conteo se hace con el bar
abierto, las ventas del día del conteo se reparten mal: un día de negocio
no dice qué parte se vendió antes y qué parte después. Opciones: contar
siempre el día entero como antes del conteo, como ninguno, o hacerlo por
hora con el detalle de órdenes de Toast (más trabajo).

---

## 3. Dónde se guarda

Una tabla nueva, `live_expected` (migración 040, la corre Axel). Una
fila por **locación × ciclo × producto**:

| Columna | Qué guarda |
|---|---|
| `location_id`, `item_name` | De quién. El nombre es la llave, como en todas: entra en la lista de `rename_inventory_item` (migración 038). |
| `cycle_start`, `cycle_end` | Los dos instantes del ciclo (`resetAt` al abrir, el cierre del conteo). |
| `week_start` | La semana de `inventory_snapshots` a la que corresponde, para unirlas sin adivinar. |
| `start_count` | Lo contado al abrir. |
| `arrived` | Lo que llegó en el ciclo, y `arrivals` (jsonb) con cada llegada: cuánto, cuándo, de qué orden o factura. |
| `sold` | Lo vendido en Toast en botellas, y `sold_by_day` (jsonb). |
| `expected` | `start_count + arrived − sold`. |
| `counted` | Lo contado al cerrar, copiado (no unido) para que un ajuste posterior no mueva el pasado. |
| `difference` | `counted − expected`. |
| `unit_price` | El precio de ese momento, para poner la diferencia en dinero sin depender del precio de hoy. |
| `coverage` | Qué tan completo es el dato de ventas: `full` (todo lo vendido se pudo pasar a botellas), `partial` (cócteles sin receta, medidas desconocidas), `none` (Toast no lo vende o no está emparejado). |
| `event_week` | Si hubo ventas de "Banquet Beverage" (open bar), que no se pueden pasar a botellas. |
| `status` | `provisional` o `final`. |
| `notes` | jsonb con lo que explique la fila: recetas usadas, pours, avisos. |

Índices por `(location_id, item_name, cycle_start)` y por
`(location_id, cycle_start)`. Lectura con la llave pública; escritura
por el servidor o con una política acotada, igual que las tablas nuevas
recientes.

**Por qué una tabla aparte y no columnas en `inventory_snapshots`:**
esa tabla la escriben Pour·IQ, el stock-in y el cierre de ciclo en tres
sitios distintos, y de ella sale el usage. Meter el esperado ahí
mezclaría lo contado con lo calculado, que es justo lo que la regla de
`on_hand` prohíbe. Aparte, se une por `week_start` + `item_name` cuando
haga falta.

---

## 4. Cómo se compara

Con una fila por semana, cada producto acumula un **historial de
diferencias**. Cada comparación se basa en él, nunca en una semana sola.

- **Sólo cuentan las filas con `coverage = full` y sin `event_week`.**
  Un licor que Toast no vende "pierde" toda su venta, y eso no es merma.
  Esos productos salen aparte, como "sin datos de venta", sin acusar.
- **En botellas y en dinero.** La diferencia × su `unit_price`.
- **Contra su propio ruido.** Medio litro de diferencia en un producto
  que vende 20 botellas a la semana es nada; en uno que vende 2 es
  mucho. Se mide en proporción a lo vendido en el ciclo, y contra la
  diferencia típica de ese producto.

### Los patrones, y lo que suelen querer decir

| Patrón en el historial | Lo más probable | Qué propone la app |
|---|---|---|
| Siempre falta, y en proporción a lo vendido (vende el doble, falta el doble) | Receta o pour que descuenta de menos | "Las recetas de X podrían estar cortas" con el factor que cuadraría (p. ej., el pour real parece 1.8 oz, no 1.5) |
| Siempre sobra, en proporción a lo vendido | Receta o pour que descuenta de más | Lo mismo, al revés |
| Una semana falta mucho y la siguiente sobra lo mismo | Error al contar | "Posible error de conteo la semana del …" |
| Sobra justo una caja (6, 12) | Llegó algo sin orden ni factura | "¿Llegó una caja de X sin factura?" |
| Cuadra casi siempre y de pronto falta | Merma o robo | Aviso, con el dinero |
| Falta un poco todas las semanas, sin relación con lo vendido | Merma constante (derrames, cortesías sin marcar) | Va al total de merma |

Las frases salen de plantillas que eligen los números, como el correo de
la mañana: nunca dicen nada que los datos no digan. Y siempre con un
"podría": la app señala, Axel decide.

---

## 5. Cómo se accede al historial

- **Por producto:** en su ficha, una gráfica semana a semana de esperado
  contra contado, con la diferencia, y su **confianza** (uso 3).
- **Por semana:** en *Count closed*, al cerrar, la lista de lo que más
  se separó, en botellas y en dinero. El aviso "el número no cuadra" de
  `count-insight.js` pasa a usar este esperado cuando lo hay, y se queda
  con el de antes cuando no.
- **Por locación, en el tiempo:** un informe con la merma de cada
  semana en dinero, la tendencia y los productos que más pesan.
- **Para comparar locaciones:** la misma cuenta en las cuatro.

Cómo se ve cada pantalla se decide con láminas, como siempre. Lo que ve
el dinero respeta el permiso *Money* de los roles.

---

## 6. Usos

1. **Merma y robo.** La diferencia en dinero, semana a semana y por
   producto. El número que le falta hoy a la app.
2. **Recetas y pours mal puestos.** El patrón proporcional a lo vendido
   (sección 4) dice cuál, y en qué factor.
3. **La confianza del LIVE, producto por producto.** Cuántas semanas
   cuadró dentro de un margen. Con ella:
   - el "≈" puede decir cuánto fiarse ("≈ 5 · usually within 0.5");
   - "cuándo se acaba", el correo de la mañana y "Order N" pueden
     avisar de los productos en los que el LIVE no es de fiar, en vez de
     acertar o fallar en silencio;
   - se sabe qué recetas faltan por escribir, ordenadas por cuánto
     dinero se escapa.
4. **Comprobar mientras se cuenta.** Al escanear o meter una cantidad,
   si se aleja mucho del esperado: "Expected about 5 — recount?". Atrapa
   el error de conteo antes de que se guarde, que es cuando se arregla
   sin costo.
5. **Llegadas sin registrar.** El sobrante del tamaño de una caja.
6. **Recalcular con lo nuevo.** Al corregir una receta, ver qué habrían
   dicho los ciclos pasados con ella, sin pisar lo guardado: así se
   comprueba que la corrección cuadra antes de darla por buena.
7. **Comparar locaciones.** La misma marca, la misma receta: si una
   locación pierde el triple, es la locación, no la receta.

*(Pendiente: los usos que Axel recuerde de la conversación anterior.)*

---

## 7. Fases

Cada fase se puede usar y probar sola. Ninguna toca `on_hand`.

1. **La tabla.** Migración 040 y su prueba. Sin pantalla.
2. **Guardar.** Al cerrar el conteo, las filas provisionales. La mañana
   siguiente, la tarea diaria las cierra. Una herramienta de diagnóstico
   en `tools/` para mirar las filas sin pantalla. **Desde aquí se
   acumula historial**, aunque todavía no se enseñe: cuanto antes
   empiece, antes sirven los patrones.
3. **El cierre del conteo.** *Count closed* enseña lo que más se separó,
   y "el número no cuadra" usa el esperado nuevo.
4. **La ficha del producto.** Su historial y su confianza.
5. **Los patrones.** Recetas sospechosas, errores de conteo, cajas sin
   factura, y el informe de merma por semana.
6. **Comprobar mientras se cuenta.** El aviso al escanear.
7. **La confianza en el resto de la app.** El "≈", "cuándo se acaba" y
   el correo de la mañana, sabiendo cuánto fiarse de cada producto.

La fase 2 es la que no puede esperar: un patrón necesita semanas de
historial, y cada semana sin guardar es una semana perdida.

---

## 8. Preguntas para Axel

1. **¿Se cuenta con el bar abierto o cerrado?** Decide cómo se reparten
   las ventas del día del conteo (sección 2).
2. **¿Qué diferencia merece un aviso?** Una propuesta para discutir: más
   de 1 botella **y** más del 25 % de lo vendido en el ciclo, o más de
   $50.
3. **¿Quién ve la merma en dinero?** ¿Sólo Owner, o también Manager con
   *Money*?
4. **¿Las semanas de evento (open bar) cuentan?** La propuesta es
   guardarlas marcadas y dejarlas fuera de los patrones.
5. **Los otros usos** que recuerdes.
