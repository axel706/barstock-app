# Cuánto pedir: de orden a orden, sin quedarse corto ni llenar el estante

Axel, 2026-11-18: "que la app me enseñe a ordenar productos sin
overstock, que duren de orden a orden de proveedor, sin gastar de más,
sin exceso de producto en el estante, pero lo necesario para cubrir mis
ventas". Y entre semana, que avise con al menos dos días si algo se va
a acabar, y por qué. Después de la última entrega (el jueves, Wine
Merchant) lo que falte se compra en LOOP, sea del proveedor que sea: el
aviso sólo dice que se acaba, no dónde comprarlo.

Este documento es el plan. Cada fase se puede usar y probar sola.

---

## 1. Lo que hay hoy y por qué no basta

| Pieza | Qué hace | Lo bueno | Lo que le falta |
|---|---|---|---|
| **Pour·IQ** (`par-intelligence.js`) | Uso semanal por conteo (inicio + pedido − final), EWMA, sin semanas de evento. Par = máx(uso × 1.35, uso + 1.28 σ), más si hubo quiebres. Lo que se pide = par − on hand. | Mide el consumo REAL: merma, open bar, cócteles sin receta. Es la mejor base de "cuánto se usa". | Sólo sabe por semana y con retraso (cuenta lo ya pasado). El par es un nivel al que llenar, no sabe cuándo llega el pedido ni cuándo el siguiente. ±2 por paso para que no salte. |
| **Toast** (`run-out.js`) | Venta por día de la semana (mediana de 13 semanas), día por día desde el LIVE. | Sabe la forma de la semana (el sábado pesa más) y lo de hoy. | La mediana de 13 semanas no sigue la tendencia: el Nino vende el doble que en agosto y la app cree que no. No ve open bar ni lo que no tiene receta. |
| **Settings › Delivery** | Día y hora de entrega de cada proveedor, por locación. | Ya está configurado. | Nadie lo usa para decidir cuánto pedir. |
| **TripleSeat** | Eventos por fecha e invitados (sólo lectura). | Se sabe qué viene. | Falta la lista de paquetes de bar para saber qué consume cada evento. |

El Nino Ardevi (2026-11-18): 13 semanas de miércoles dan una mediana de
1.3; las últimas 4 semanas, 3.3. La app lo daba por durar.

## 2. La idea: cubrir de entrega a entrega

Para cada producto, al pedir (domingo o lunes):

```
pedir = lo que se va a usar desde que llega este pedido
        hasta que llega el siguiente del MISMO proveedor
      + un colchón
      − lo que habrá en la estantería cuando llegue
```

- **Desde que llega hasta el siguiente:** con las horas de Settings ›
  Delivery. Breakthru martes 4 PM → el martes siguiente a las 4 PM.
- **Lo que habrá cuando llegue:** el LIVE de ahora menos lo que se va a
  usar hasta la hora de la entrega, más lo que ya venga de otros pedidos.
- **Redondeado hacia arriba a botellas.**

Eso es "durar de orden a orden" sin llenar de más: se pide lo de UNA
vuelta del proveedor, no un nivel fijo.

## 3. Cuánto se usa: Pour·IQ para el total, Toast para la forma y la tendencia

1. **El total de la semana sale de Pour·IQ** (uso por conteo, EWMA), porque
   es el consumo de verdad, con merma y open bar.
2. **La forma de la semana sale de Toast:** qué parte de lo semanal se va
   cada día (el sábado 30 %, el lunes 0 %). Así se puede contar "hasta el
   martes a las 4 PM".
3. **La tendencia sale de Toast:** lo vendido en las últimas 4 semanas
   contra las 13. Si un producto se está vendiendo 2× (el Nino), el uso de
   Pour·IQ se sube en esa proporción, porque Pour·IQ, al contar el pasado,
   llega tarde.
4. **Sin Pour·IQ** (producto nuevo, menos de 4 semanas): Toast solo, con
   la proporción uso/venta de la locación.
5. **Sin Toast** (lo que no se vende por Toast): Pour·IQ solo, repartido
   por igual en los días abiertos.

## 4. El colchón: pequeño, porque LOOP existe

Pour·IQ hoy pide para cubrir ~90 % de las semanas (1.28 σ) y además
multiplica por 1.35. Con LOOP a mano el mismo día, quedarse corto un
viernes cuesta un viaje, no una venta perdida. El colchón propuesto: el
que cubre ~80 % de las vueltas (0.84 σ del uso de esa vuelta), sin el
1.35. **Decisión de Axel.**

Decidido: 80 %. Ajustes tras la tabla de Crown (2026-11-18): el colchón
crece con lo que se USA, no con el reloj (un lunes cerrado no lo
agranda), la σ es la de los conteos sin escalar a lo reciente y como
mucho media semana. Vino: de 3 en 3 siempre en Wine Merchant; en los
demás sólo si al múltiplo le falta una botella o menos.

## 5. El aviso entre semana (lo que ya es Running out, corregido)

- La misma demanda (Pour·IQ + forma y tendencia de Toast), día por día
  desde el LIVE.
- Para avisar, un día FUERTE (el 75 % de los mismos días de las últimas
  6 semanas), no el del medio: mejor un aviso de más que uno tarde.
- La entrega cuenta a SU hora, no al empezar el día.
- Sale cuando se acaba en los próximos días, con al menos dos de
  anticipación cuando se puede.
- **Con su por qué**, en una línea: "Selling 2.3× its usual", "Saturday
  sold 19.7, usual 3.2", "Event Thu · 80 guests". Por lámina.

## 6. Los eventos (TripleSeat)

- **Ya se puede:** saber que hay un evento, cuándo y con cuántos
  invitados, y decirlo junto al pedido y en el aviso ("Event Thu · 80
  guests"), sin inventar botellas.
- **Con la lista de paquetes de bar** (pendiente del coordinador): cada
  paquete con lo que suele consumir por invitado y hora, aprendido de los
  eventos pasados, sumado a la demanda de ese día.
- Las semanas de evento ya se excluyen del promedio de Pour·IQ: el evento
  se suma aparte, no se mezcla con lo normal.

### Lo medido del open bar (Crown, 2026-11-19)

Cómo se hace (Axel): los tragos del open bar se timbran uno por uno, como
cualquier venta, y al pagar se DESCUENTA el cheque con "Open Bar" como
concepto. Lo que se cobra es el paquete por persona, "Banquet Beverage"
en Toast (`quantity` = invitados; 382 invitados = $10,412, ~$27 cada uno,
el Silver Open Bar de $26). `lib/toast.js` deja fuera sólo lo anulado:
**los tragos descontados entran y el LIVE ya los resta.**

Medido con `bsOpenBarDias` (tools/open-bar.js), días con open bar contra
la mediana del mismo día de la semana sin él, agosto–noviembre:

| Día | Invitados | Tragos de más | Por invitado |
|---|---|---|---|
| Sat 10-17 | 187 | +413 | 2.21 |
| Thu 10-01 | 152 | +331 | 2.18 |
| Sat 09-19 | 94 | +225 | 2.39 |
| Sat 08-22 | 56 | +115 | 2.05 |
| Fri 10-16 | 101 | +140 | 1.39 |
| Sat 10-24 | 95 | +147 | 1.55 |

**~2.2 tragos de más por invitado en los eventos grandes**, muy parejo
(1.4–2.4 de 95 invitados para arriba). Los eventos chicos (30–65) salen
entre −4 y +7: menos que lo que un día cambia solo; varios negativos,
probablemente porque el evento ocupa el sitio de la clientela de siempre.
No hay señales de tragos anulados en vez de descontados.

Y con `bsOpenBar`: lo que falta en los licores de la casa (conteos −
Toast, ~3 botellas a la semana de Kentucky Tavern, Pedro Morales, Cinzano
Sweet) NO sube con los invitados (r ≈ 0). El open bar no lo explica.

**Para la fase 5:** un evento de N invitados ≈ 2.2 × N tragos de más ese
día. Falta saber QUÉ se sirve (qué parte licor de la casa, vino, cerveza)
para pasarlo a botellas de cada producto: medirlo de los eventos pasados,
producto por producto (lo vendido en Toast esos días contra un día
normal), y separarlo por paquete cuando esté la lista del coordinador.

## 7. Fases

1. **(Hecha.) El motor, sin pantalla.** `src/pedido.js`: demanda por día (sección
   3), cuánto pedir por producto y proveedor (2 y 4), y la proyección
   para el aviso (5). Funciones puras con su prueba. Nada cambia en la app.
2. **El aviso corregido:** Running out y el correo usan la demanda nueva
   y la hora de la entrega. Se ve en qué entra, no cómo se ve. **Hecha
   (2026-11-18).**
3. **El por qué** en la tarjeta y en el correo. Lámina. **Hecha
   (2026-11-18, opción E).**
4. **La sugerencia en Orders**, al lado del par al principio ("Par 6 ·
   Suggested 9") para comparar unas semanas. Lámina. **Hecha (2026-11-18, opción C):** franja
   "Suggested N" con "Use N", y lo que el par no pide con "Add N".
5. **Eventos con número**, cuando esté la lista de paquetes.

Antes de las fases 2 y 4: una tabla con lo que diría la regla nueva
contra la de hoy, sobre datos de Crown, para que Axel lo compare con la
barra.

## 8. Decisiones pendientes de Axel

- El colchón: ¿80 % de las vueltas (propuesto) o 90 % como Pour·IQ?
- ¿Se pide en botellas, o hay productos que sólo vienen por caja (6/12)?
- ¿La tendencia con 4 semanas recientes, o 6?
