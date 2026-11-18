# Pour·IQ que aprende de Toast y funciona solo

Axel, 2026-11-18: "me gustaría que uses Toast para entrenar Pour·IQ […]
¿qué pasa con negocios que no tienen Toast, o que tienen otro POS? Ahí es
donde entra Pour·IQ y es parte del pitch de venta […] haz de ello una
función robusta que se traslade a cualquier locación nueva desde el día 1".

Este documento es el plan. Nada está construido.

---

## 1. Lo que Pour·IQ sabe hoy, y lo que no

Pour·IQ (`src/par-intelligence.js`) sólo lee conteos:
`usado = inicio + pedido − final`, por semana y por producto.

- **El total de la semana**, con EWMA (α = 0.3, medido en
  `tools/backtest-par.js` sobre 1021 semanas de Crown) y su variación.
  Las semanas de evento se marcan a mano y se excluyen.
- **No sabe** cómo se reparte la semana: el sábado pesa lo mismo que el
  lunes cerrado.
- **Llega tarde** a lo que despega: el EWMA necesita semanas para subir
  (el Nino, a 24 en Toast y 29 en Pour·IQ el 2026-11-18, se dio cuenta
  tarde).
- **Necesita 4 semanas** de un producto antes de decir algo
  (`observing`). Una locación nueva pasa un mes a ciegas.
- **No ve semanas raras** si nadie las marca.

### Lo que Pour·IQ NO puede hacer solo, ni con todo esto

Sin POS no hay nada entre dos conteos: no hay LIVE (que es contado +
llegado − vendido en Toast), ni el ritmo de hoy, ni la fiesta del
mediodía. Sin POS, "cuándo se acaba" es una proyección desde el último
conteo con lo que se suele usar cada día. Sirve para pedir y para avisar
con días, pero no ve lo que pasa hoy. Eso hay que decirlo en la venta tal
cual. Harvest y Jockey son hoy ese caso.

## 2. Qué le enseña Toast a Pour·IQ

Donde hay Toast y conteos a la vez (Crown, Will's & Bill's), Toast es la
verdad día por día. Con ella se aprende lo que Pour·IQ guarda y usa en
cualquier locación, con o sin POS:

1. **La forma de la semana.** Qué parte se va cada día, por producto y
   por categoría (vino, licor, espumoso…). Se guarda. Una locación sin
   POS usa la de su categoría en la cuenta, recortada a los días que
   abre.
2. **Cómo seguir a lo que despega, sólo con conteos.** Con Toast como
   referencia se mide qué predice mejor la semana siguiente a partir de
   los conteos: el EWMA de hoy, uno con tendencia (Holt) o dos EWMA
   (rápido y lento). Se elige por medida, igual que se eligió α = 0.3.
   Lo elegido corre en todas las locaciones, también sin POS.
3. **Qué semanas fueron raras.** Toast ve una semana de toda la barra
   muy por encima de lo normal. Se le PROPONE a Axel marcarla como
   evento. No se marca sola: `is_event_week` está en
   `inventory_snapshots`, y nada de Toast escribe ahí
   (`test-toast-no-toca-conteo`).
4. **Cuánto se usa contra cuánto se vende**, por producto: la merma y lo
   que las recetas no ven. Ya existe a medias (`shrinkPct`, con
   MarginEdge). Sirve para el diagnóstico y para convertir ventas de
   otro POS en uso.

## 3. Desde el día 1: arrancar con lo que ya sabe la cuenta

Una locación nueva no empieza en blanco:

- **El mismo producto en otra locación de la cuenta** (Tito's en Crown),
  escalado por el tamaño de la locación nueva.
- **La categoría**, si el producto no está en ninguna otra.
- **El par que se ponga a mano** al dar de alta, si no hay nada más.

Ese punto de partida pesa como k semanas. Cada semana contada pesa una.
El número es `(n · lo propio + k · lo de partida) / (n + k)`: con 0
semanas es todo lo de partida, con 8 casi todo lo propio. Sustituye a
`observing`. k se elige midiendo, no a ojo.

Lo que se aprende sale de las locaciones de la MISMA cuenta. Cruzar
datos entre clientes distintos es otra decisión (ver la sección 6).

## 4. Dónde se guarda

Una tabla nueva, no `inventory_snapshots`: `pouriq_profiles` (por
cuenta, locación y producto o categoría), con la forma de la semana, los
parámetros elegidos, la proporción uso/venta y cuándo se calculó. Se
rehace al cerrar cada conteo, así que Pour·IQ sigue aprendiendo semana
a semana. Migración nueva, la corre Axel.

`pedido.demanda()` la lee: con Toast, como ahora; sin Toast, Pour·IQ con
la forma guardada en vez de repartir por igual.

## 5. Fases

0. **Medir antes de construir.** Una herramienta de sólo lectura que,
   con Crown, diga cuánto se equivoca Pour·IQ prediciendo la semana
   siguiente, y cuánto ganaría con cada pieza de la sección 2. Lo que no
   gane, no se construye.
1. **La forma de la semana** aprendida, guardada y usada por
   `pedido.demanda()` cuando no hay Toast. Harvest y Jockey la estrenan.
2. **La tendencia desde los conteos**, con el método que gane en la
   fase 0.
3. **El arranque desde el día 1** (sección 3).
4. **Las semanas raras**, propuestas a Axel.
5. **Otro POS:** lo vendido entra por la misma puerta que Toast (por
   día y por producto) y todo lo de arriba sirve igual. Se diseña cuando
   haya un cliente con uno.

## 6. Decisiones pendientes de Axel

- ¿Se puede aprender de una locación para otra **dentro de la misma
  cuenta**? (Propuesto: sí.)
- A futuro, con clientes: ¿un punto de partida anónimo hecho con todos
  (la forma de la semana de "un bar", sin nombres ni números de nadie)?
  Eso es de contrato y privacidad, no de código.
- ¿Empezamos por la fase 0 antes de terminar las fases 3 y 4 de
  `docs/plan-pedido.md`?
