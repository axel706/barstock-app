# BarStock Pro

Inventario de barra para los restaurantes de WJM Hospitality. En producción
en `app.barstockpro.com`, usado a diario por personal de bar que no es
técnico. **Esto no es un proyecto de juguete: si rompes algo, alguien se
queda sin poder contar su inventario esa noche.**

Un solo desarrollador: **Axel**. Las locaciones son Crown Tavern, Will's &
Bill's, Jockey Tavern, Harvest Seasonal y DEVELOP (la de pruebas).

---

## Cómo se trabaja aquí

**El idioma.** La interfaz va en inglés. La conversación con Axel y **todos
los comentarios del código** van en español. Los comentarios explican *por
qué*, no *qué*: el qué ya lo dice el código. Y cuando algo está escrito de
una forma rara porque la obvia falló, el comentario cuenta ese fallo. Medio
proyecto está comentado así y es la razón de que los mismos errores no
vuelvan.

**Diseño antes que código.** Para cualquier cambio visual, se ofrecen
opciones dibujadas y se espera a que elija. No se construye a ciegas: ya
pasó, y acabó en "lo hiciste MIERDA literalmente".

**Un cambio a la vez.** Dos cambios juntos que fallan son dos horas
averiguando cuál fue.

**No des por buena su premisa sin comprobarla.** Él describe el síntoma
correctamente casi siempre, y el diagnóstico a veces no. Si dice "pasa X
porque Y", comprueba Y en el código antes de arreglarlo. Una vez se
implementó una función entera sobre una causa que no existía, y la pregunta
justa fue: *"¿por qué no dijiste esto antes de que implementáramos?"*.

**Verifícalo tú.** Nunca digas que algo funciona sin haberlo corrido.

---

## Git

Axel trabaja en `develop`. Producción despliega desde `main`.

Si eres una sesión en la nube: **trabaja en una rama y haz push ahí.** No
toques `main`. El merge a producción lo decide él.

Si eres una sesión local en su máquina: **tú no corres git.** Le das el
bloque entero y lo corre él. Sólo lecturas: `git --no-optional-locks
log/status/diff/show`.

El bloque completo que usa:

```
cd ~/Desktop/barstock-app
git add -A
git commit -m "..."
git push origin develop
git checkout main && git merge --ff-only develop && git push origin main
git checkout develop
```

### zsh

Su terminal es zsh. Dos reglas que no son opcionales:

- **Nunca un `!` dentro de comillas dobles.** zsh lo expande y el comando
  revienta. Esto incluye los mensajes de commit.
- **Nunca comentarios `#` dentro de un bloque de comandos.**

### Los mensajes de commit

Largos y explicativos, en español, contando *qué estaba mal y por qué*. No
"fix bug". Mira `git log` para el tono.

---

## La base de datos

**Nunca escribas en su Supabase.** Ni para probar.

Las migraciones viven en `database/migrations/` y **las corre él a mano** en
el panel de Supabase. Si tu cambio necesita una, escribe el archivo y dale
el SQL para que lo corra; no asumas que ya está corrido.

### Lo que muerde

- **PostgREST corta en 1000 filas en silencio.** Cualquier lectura que pueda
  pasar de ahí se pagina. Una lectura corta que se tomó por completa borró
  un producto del inventario de verdad (Baileys) y costó una noche.
- **`resolution=merge-duplicates` resuelve contra la LLAVE PRIMARIA** salvo
  que pases `?on_conflict=col,col`. Si la restricción real es un `unique`
  que no es la primaria, el segundo insert choca con un 409. Ya pasó.
- **`vendor_orders` y otras tablas viejas no tienen migración en el repo.**
  No adivines tipos de columna. Declarar `bigint` sin mirar dio
  `Number(uuid)` → `NaN` → `null` → un error de "campo vacío" que en
  realidad era de tipo.

### Credenciales

Toast, MarginEdge y TripleSeat viven en variables de entorno de Vercel,
detrás de las funciones de `api/`. **El repo es público.** Nunca en
`src/config.js`, nunca en un commit, y nunca pegadas en la conversación.

### Pendiente grave

Las 16 políticas RLS están en `using (true)` con el repo público. Está sin
resolver y él lo sabe. No es un descubrimiento que haya que anunciarle.

---

## La arquitectura

Frontend estático, sin build. `index.html` es un monolito y hay ~95 módulos
`src/*.js`, cada uno un IIFE que se cuelga de `window.BarStock*`. 29 hojas
en `styles/`. Supabase se habla con `fetch` crudo contra PostgREST.

12 funciones en `api/` sobre Vercel. **El tope del plan son 12, y está lleno**
desde `api/integrations.js`, que es la de Toast y será la de TripleSeat: cada
integración vive en `lib/` y esa función sólo reparte. Antes de
crear una nueva, mira si cabe en una que ya existe.

Las pruebas son 67 suites en `tools/test-*.js`, con `jsdom`. Se corren con
`npm test` y tienen que pasar enteras antes de entregar nada.

### El rompe-caché

Cada `<script>` y cada `<link>` de `index.html` lleva `?v=algo`. **Si tocas
un `.js` o un `.css`, súbele la versión.** Si no, el navegador de su
teléfono sirve el viejo y parece que tu cambio no hizo nada.

### El orden de carga

Un módulo compartido va **antes** que quien lo usa. Funcionaría igual
después —las llamadas son en tiempo de ejecución—, pero "funciona por
casualidad" ya mordió una vez y hay tests que congelan el orden.

---

## Las trampas de CSS

**`app.css` fuerza `border-radius: 999px !important` sobre todo `<button>`**,
con un selector de 21 `:not()` (especificidad 0,21,1). La única forma fiable
de vencerlo es **un prefijo de ID** (1,0,0). `mobile-app.css` ya lo
documenta con `:is(#mScreens, #mTabs, #mBand, #mSheet)`, y `#cfPanel` se
añadió para la pantalla de cierre de conteo. Esto costó tres rondas de
*"que noooooooo"* antes de encontrarse.

**iOS hace zoom en cualquier `input` por debajo de 16px**, y con el zoom
bloqueado no se sale de ahí. `--m-strong` es 14 × 1.14 = **15.96px, no
sirve**. La forma correcta es `max(16px, var(--m-x))`, dentro de
`@media (pointer: coarse)`. Y **que no afecte al escritorio**: eso fue una
corrección suya explícita.

**Nada de tamaños sueltos en lo que ve el teléfono.** Todo cuelga de la
escala de `:root` en `mobile-app.css` (`--m-base: 14px` y sus múltiplos).
Si necesitas algo más grande que `--m-figure`, usa `calc(var(--m-figure) *
1.5)`. Hay un test que lo exige.

**El aire va por arriba.** `margin-top`, nunca `margin-bottom`. Dos
convenciones en la misma columna se encuentran en algún sitio y ahí el hueco
desaparece o se dobla. Ya pasó dos veces en dos días.

El radio de las tarjetas del carrusel (`.m-hero`) es **20px**, y es la
referencia cuando pida "como las tarjetas".

---

## Reglas del dominio que no son obvias

**`on_hand` es lo que alguien contó, y nada más lo escribe.** Ni `Received`
ni una factura. Es el ancla de `inicio + entradas − final = usado`, y si
algo más lo toca, Pour·IQ calcula los pares con basura. `Received` suma a
`ordered` del snapshot semanal, que es lo correcto.

**`replaceInventoryMaster()` borra la tabla entera y reinserta** desde
`state.master`. Cinco sitios la llaman. Lleva guardas de merma; no las
quites.

**El par no salta de golpe:** ±2 por paso (`BarStockProductWeeks.paso`). Un
óptimo de 9 sobre un par de 1 puede venir de un mes raro.

**Cerrar un conteo abre el ciclo siguiente** si no estaba abierto:
`cicloYaCorrio()` → `runCycle()` + `marcarCicloAbierto()` → y después
`rebuildPlacedOrdersFromHistory()` contra la frontera NUEVA. `cycleWeekFor()`
es lunes-base y mete el domingo en la semana del lunes *siguiente*.

**El emparejamiento factura↔orden** va línea por línea y el primero que pide
un recibo se lo queda. `src/invoice-order-auto.js` decide una sola vez de
qué orden es cada factura y lo escribe como enlace, **sólo del ciclo
abierto**: los ciclos cerrados ya están bien y no se tocan. Eso fue
explícito.

---

## Los seis fallos que se repiten

Si algo se comporta raro, mira primero aquí. Todos han mordido ya, varias
veces:

1. **Lo mismo escrito en dos sitios.** Los márgenes de pantalla (×4), el
   catálogo de fondos (×2), el dibujado del logo (×4), la cabecera de
   producto (×2), el armado de facturas (×2), el gesto de las hojas (×6), el
   consumo semanal (×2). Siempre acaba igual: se toca una y las dos dejan de
   decir lo mismo. **Antes de copiar un bloque, sácalo a un módulo.**
2. **Un comentario que dice lo contrario del código.** El de "delegación" de
   `admin-panel.js`, el `:last-of-type` que quitaba un margen inexistente.
   Mandan a buscar la causa donde no está.
3. **Código debajo de un `return` temprano.** El pie de la lista de facturas
   vacía.
4. **Dos reglas CSS para el mismo selector.** `.cp-stage` tenía tres.
5. **Una afordancia que miente.** El asa que no arrastraba, la etiqueta
   "counted" sobre algo que no se contó.
6. **Un mensaje de error que adivina.** "Falta la tabla, corre la migración
   022" ante cualquier error que mencionara la tabla. La migración estaba
   corrida y el mensaje mandaba a correrla otra vez. **Di lo que pasó, no lo
   que supones.**

---

## Las pruebas

`npm test` · 67 suites · ~2170 comprobaciones. Tienen que pasar enteras.

**Un test que no puede fallar no sirve.** Escribe el test, compruébalo
contra el código roto, y sólo entonces arréglalo. En esta sesión varios
mordieron de verdad y encontraron bugs que yo no había visto.

Lo que se prueba aquí no es que se vea bien, es **lo que no puede volver a
pasar**: que el pasado no se mueva, que un fallo no se disfrace de dato, que
un número no se calcule en dos sitios, que `on_hand` no lo escriba nadie más.

Los tests se registran a mano en el `scripts.test` de `package.json`.

---

## Herramientas de diagnóstico

En `tools/`, sólo lectura, se pegan en la consola del navegador:

- `diagnostico-waiting.js` → `await bsPorQue('CT-0207')` — por qué una orden
  dice "waiting"
- `forense.js` → `await bsCuando('Baileys')` — qué le pasó a un producto
- `existe.js` — si un producto está en la nube
- `toast.js` → `await bsToast('ping')` — qué contesta Toast (`ping`,
  `restaurant`, `menu`, `orders`), a través de `api/integrations.js`
- `ensayo-auto.js` → `await bsEnsayo()` — qué enlazaría el automático sin
  enlazarlo

---

## Dónde nos quedamos · 2026-11-03

**Esta sección caduca.** Es lo que estaba en el aire el día de la fecha, no
historia. Si la fecha es vieja, créela a medias: comprueba contra el código
y el `git log` antes de actuar, y actualízala o bórrala. Lo de abajo
—"Pendientes conocidos"— sí es estable.

**El enlace automático de facturas está recién conectado y sin estrenar.**
`src/invoice-order-auto.js` escribe en `invoice_order_links` con
`origen = 'auto'`, sólo para facturas del ciclo abierto, desde
`mobile-history.cargar()`. Las migraciones 022, 024 y 025 están corridas y
verificadas contra el esquema. Pero **nunca ha escrito una fila de verdad**:
no hubo facturas nuevas desde que se conectó. Axel quedó en mirar las
próximas.

Lo que hay que vigilar cuando lleguen: que enlace la factura a la orden
correcta, y que ninguna orden de un ciclo cerrado cambie de estado. Antes de
tocar nada, `tools/ensayo-auto.js` → `await bsEnsayo()` enseña qué haría sin
hacerlo. Los pesos y umbrales de ese módulo son un punto de partida mío, no
una verdad medida: si fallan, se ajustan ahí, con el ensayo delante.

La marcha atrás es una línea, y no toca los enlaces hechos a mano:

```sql
delete from public.invoice_order_links where origen = 'auto';
```

**Tres cosas más que están en producción pero casi sin usar**, todas de los
últimos dos días. Si algo se ve raro en ellas, es reciente y probablemente
mío:

- La pantalla `Count closed` rediseñada, que aún no se ha visto con una
  orden de verdad detrás.
- La ficha de producto con la gráfica de semanas en el hueco de la cabecera
  y el botón de aplicar Pour·IQ.
- `On the shelf` del Home, que ahora suma lo facturado desde el conteo.

**Lo que sigue sin resolverse** de todo esto: por qué dos órdenes de Crown
decían `waiting` teniendo factura. El enlace manual lo tapa, pero la causa
raíz no se encontró. `await bsPorQue('CT-0207','CT-0204')` en la consola lo
contestaría en segundos y nunca se corrió.

---

## Pendientes conocidos

- **Fase 0**: las 16 políticas RLS en `using (true)` con repo público.
- `Resend` sigue apareciendo en órdenes LOOP, que salen por CSV y nunca por
  correo.
- El `Delete` del escritorio (`deleteEditedItem`) no toma respaldo: es el
  único camino que borra un producto sin rastro.
- No hay forma de abrir el panel de una botella fuera de un conteo activo.
- El manual de usuario (`docs/manual-usuario.md`) le faltan las secciones
  5–9 y nueve capturas.
- La causa raíz de las órdenes `waiting` de Crown sigue sin encontrarse; el
  enlace manual la tapa.
