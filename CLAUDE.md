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

Frontend estático, sin build. `index.html` es un monolito y hay ~148 módulos
`src/*.js`, cada uno un IIFE que se cuelga de `window.BarStock*`. 29 hojas
en `styles/`. Supabase se habla con `fetch` crudo contra PostgREST.

12 funciones en `api/` sobre Vercel. **El tope del plan son 12, y está lleno**
desde `api/integrations.js`, que es la de Toast y TripleSeat: cada
integración vive en `lib/`, y esa función comprueba la sesión una vez y
reparte. Antes de
crear una nueva, mira si cabe en una que ya existe.

Las pruebas son 165 suites en `tools/test-*.js`, con `jsdom`. Se corren con
`npm test` y tienen que pasar enteras antes de entregar nada.

### El rompe-caché

Cada `<script>` y cada `<link>` de `index.html` lleva `?v=algo`. **Si tocas
un `.js` o un `.css`, súbele la versión.** Si no, el navegador de su
teléfono sirve el viejo y parece que tu cambio no hizo nada.

### El sello del build

`index.html` lleva un `BUILD-AAAAMMDD-HHMMSS` (`#buildBadge`, hora de Nueva
York) con el que Axel sabe qué versión está viendo. **Es texto fijo: se
pone a mano en cada commit que cambia la app.** Durante días no se tocó y
producción enseñaba un build del 3 de noviembre con cambios de días
después. En el teléfono está escondido (`app.css`); sólo se ve en el
escritorio. `tools/test-sello.js` falla si el último commit que tocó la
app es más de dos horas más nuevo que el sello.

**Y cada build lleva su nota en `changelog.json`**, la primera de la lista:
una a tres líneas, en inglés y cortas, de lo que nota quien usa la app
("Clear button in the Inventory search"), no del código. Es lo que enseña
el centro de versiones de More en el teléfono. `tools/test-changelog.js`
falla si la build de `index.html` no tiene su entrada. Una build sin
cambios visibles también la lleva: "Behind-the-scenes fixes".

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

**La barra de "Do we have"** (Home, su copia acoplada y la de Buscar,
marcadas `.m-vidrio`) lleva el cristal de Time Machine, la campana y el
escáner (Axel, 2026-11-13, opción A): comparte LA MISMA regla que
`#mBand .m-ico`, no una copia. Esa regla no puede llevar `position`: con
su id le ganaba al `absolute` de la copia y al `fixed` de Buscar.
Acoplada o fija va sin desenfoque propio (detrás ya está la escalera).
La de Inventory también (2026-11-14, opción B sin las pestañas), con su
filtro y su + en la misma regla: el + de cristal verde, sin desenfoque
propio (va pegado bajo el header), y los tres con un solo alto,
`--m-inv-alto` (medían 50, 52 y 44: la barra arrastraba el margen de
`.m-searchbar.on`). Las demás barras de búsqueda, no. Los botones de las tres cifras del
Home y "All products" de Toast, también (opción B): su texto va suelto,
así que el reflejo va en `z-index: -1` con `isolation`, y **Review (y
Retry) sigue amarillo sólido**, el único que avisa. Las pestañas Sales /
Movement / Changes (`#mhTabs`, opción B: la elegida también de cristal,
azul) y Bottles / $ de Toast (opción A: la elegida sigue sólida), con el
mismo cristal en el carril; a sus botones se les quita el desenfoque y la
sombra de `app.css`, que sobre el cristal dibujaban una pastilla fantasma.
`.m-sx-tabs` de People y Orders no se tocó.

**Las filas de las listas no llevan desenfoque** (2026-11-15, a prueba:
"si no me gusta lo eliminamos"). `app.css` le pone `blur(6px)` a todo
`<button>`, y las filas son botones: cada fila visible se desenfocaba en
cada fotograma del scroll. Una regla en `mobile-app.css` lo quita en
`#mScreens` salvo a los botones de cristal (en su `:not`, o con id).
Medido en Chromium: ~100 → ~140 fotogramas en 3 s. Un botón de cristal
nuevo en las pantallas tiene que entrar en ese `:not` (o llevar id).
Prueba: `test-listas-sin-blur`. Lo que queda: las escaleras del
desenfoque progresivo (6 capas cada una), por lámina.

**Tinta es el fondo de las tarjetas, desde ahora el estándar** (Axel,
2026-11-18, lámina B: "vamos a ir ajustando las distintas pantallas a
él"). Es el de *From Toast* en Recipes: un panel azul marino casi opaco
(`--tinta`, `rgba(15,23,42,.62)`) con borde fino (`--tinta-borde`), en
`:root` de `mobile-app.css`. **No lleva `backdrop-filter`**: lo que se
ve borroso detrás es la foto del fondo, que ya viene desenfocada. Se lee
mejor que el blanco al 6–12 % de antes y no cuesta nada al rodar (el
lag de las listas no venía de ahí: las filas ya iban sin desenfoque).
Lo que avisa conserva su borde ámbar o rojo y un toque de su color en
la esquina, sobre la tinta (`.m-fic-ojo` / `.m-fic-mal`). Ya la llevan
Inventory (`.m-inv`), las tarjetas de Do we have y la ficha (`.m-fic`),
Running out (`.m-ro-c`), las tres cifras del Home (`.m-cf-c`, sin
sus botones), Orders entero (Open `.m-ordv`/`.m-ord-l`, To buy
`.m-tb-l`, Sent `.m-hcard`/`.m-hlist`, Invoices `.m-icard`/`.m-iatar`/
`.m-itot`), More y Settings (`.m-item`, que usa también People; la
tarjeta de versión, `.m-hero-ver`, con su azul) y Recipes. Cuando Axel diga "ponle Tinta" a una pantalla, es esto:
**las variables, nunca el color copiado**; `test-listas-sin-blur`
falla si el color aparece fuera de `:root` o si una regla de Tinta
lleva desenfoque.

**Buscar un producto escribiendo es UN buscador, a pantalla completa**
(Axel, 2026-11-18, lámina A): `BarStockBottleSearch.abrir({ pantalla:
true, … })` de `src/bottle-search.js`. Un campo DENTRO de la página no
sirve en el iPhone: al escribir, Safari desplaza la página para ver el
campo, se lleva la banda y la lista queda flotando sobre un hueco
(pasaba en la factura y en Transfers). El buscador ocupa la pantalla
entera con el teclado encima (`BarStockSheet.alTeclado(h, { completo:
true })`; medir sólo lo de encima del teclado dejaba un hueco), es un
velo transparente sobre el FONDO de la app (la página, la banda y las
pestañas se esconden mientras está abierto), con el campo y Cancel
arriba, la sugerida, la lista con su scroll y las salidas al
final (`pie`: "Not mine", "Unlink"); sólo elige, guarda quien lo abre.
Ya lo usan la factura (`mobile-invoices.abrirBuscador`), Transfers
("Add a product" y "Which is yours?"), Liquor from Toast, Recipes y
Wine from Toast (que tenía la rueda nativa, un `<select>`): es
la ÚNICA forma de `BarStockBottleSearch.abrir` (la hoja de abajo de
antes, `.m-tl-hoja`, se quitó). La línea de debajo de cada botella es
`BarStockBottleSearch.ficha()`, la misma en todos. **Un buscador nuevo no se
escribe: se abre éste.**

**Cada tarjeta del carrusel dibuja lo suyo** (Axel, 2026-11-21, lámina
de las siete; Running out R2): los dibujos viven en `src/home-cartas.js`
(`BarStockHomeCartas`), sólo HTML con datos ya calculados, y
`mobile-home.js` los pasa en `libre` a `pintarTarjeta`, que pone el
encabezado (con `kr` a la derecha) y los botones de siempre. El cuerpo
libre mide lo mismo que los tres renglones de la plantilla: todas iguales
de alto. Las siete ya lo usan: Running out (cada botella con la silueta del conteo,
`formaDe`, llena contra su par), Orders waiting (una columna por
proveedor con su logo), Orders placed (la semana desde hoy con cada
logo en el día en que llega su orden, `arrivesAt`; sin llegadas, la
plantilla), el ciclo (la pista de lunes al domingo de
`home-orden.finCiclo`, "Count tomorrow", "Day N of 7"), los pasos del
domingo (1 y 2, como losetas), el conteo (lámina D, 2026-11-21: tres
columnas iguales, botellas, tiempo y lo que falta, con una barra hacia lo
esperado de `bottleProgress`; sin conteo anterior, la tercera son las
zonas y no hay barra; el anillo de antes amontonaba todo a la izquierda
y perdió el tiempo) y el transfer (de
dónde a dónde, en `transfer-confirm.js`, por eso `home-cartas.js` carga
antes que él). Pruebas:
`test-carrusel-cartas` y 1b de `test-transfer-confirm`.

El radio de las tarjetas del carrusel (`.m-hero`) es **20px**, y es la
referencia cuando pida "como las tarjetas". Las filas de Inventory (`.m-inv`) son
del tamaño de las tarjetas de Running out (Axel, 2026-11-15, opción B):
radio 20, el nombre en `--m-strong` negrita, la cifra en `--m-figure`
con su "/par" pegado, y la línea de abajo en una sola fila.

### El header al hacer scroll (patrón para todas las secciones)

Axel, 2026-11-09, empezando por el Home (opción A sobre lámina). Va a
repetirse en otras secciones, igual:

- **Arriba, todo como siempre.** Nada cambia en reposo.
- **Al bajar, lo que titula la pantalla se va**: en el Home, el saludo
  y la píldora de locación. Se desvanecen con el scroll antes de llegar
  al logo; nunca pasan por debajo de él leyéndose.
- **La búsqueda se acopla bajo el logo, tal cual**: mismo tamaño y
  estilo, 8 px bajo la banda. Desde ahí es parte del header.
- **El desenfoque es PROGRESIVO y empieza justo debajo de la
  búsqueda**: nítido 10 px por debajo de ella, creciendo en 50 px por
  detrás de ella (seis capas de 1 a 22 px de radio, la escalera
  `.m-dock-esc`, igual que la banda), y del todo borroso en su parte
  alta y en el header. **No es un blur con
  una máscara que lo transparenta**: eso se hizo primero en las tres
  pantallas y Axel lo notó ("pedí progressive blur y estás poniendo
  blur"). Cuando pida desenfoque progresivo, es la escalera.
- **Todo regresa sólo al volver arriba**, no con cualquier gesto hacia
  arriba a media página (no se le preguntó a Axel; si pide lo de
  Safari, se cambia).

Vive en `src/band-dock.js` (`BarStockBandDock.enganchar({ pantalla,
barra, desvanecer })`), que la pantalla llama en cada pintado. Hay dos
formas: con algo encima que se va (el Home), una copia fija aparece al
llegar la barra a su sitio; con la barra ya arriba y siendo un `<input>`
de verdad (Buscar), `fija: true` con `scroll`, la barra misma va fija,
la lista lleva su propio scroll por debajo de ella y la página no se
mueve. Una copia de un `<input>` no sirve: el teclado escribiría en el
escondido. Y sticky en la página tampoco: en el iPhone el teclado se
lleva el header y el elástico arrastra la barra
(`overscroll-behavior` en el `<html>` no lo para ahí).

Con título **y** campo de verdad (Inventory), la tercera forma:
`pegado`, con `scroll`, `titulo` y `nombre`. La lista lleva su propio
scroll; el bloque que se queda (pestañas y filtro) se pega con sticky
*dentro* de la lista, que lo mueve el navegador y por eso es suave; y
el título de la pantalla sustituye al logo en el header con un fundido
ligado al scroll, no disparado: primero se va el logo, después entra
el título. Axel lo pidió así: "que la animación sea suave". Orders
usa la misma forma: se quedan las pestañas (Open / Sent / Invoices);
"Quick order" sube con la lista. Inventory y Orders entran ya
acopladas (`siempre`): el bloque empieza justo donde se pega, sin
recorrido. Dentro de un detalle de Sent o de Invoices (2026-11-12), el
nombre del proveedor va a la banda con `enBanda` (el botón de Time
Machine pasa a ser atrás, como Settings) y la sección pega su bloque
con `BarStockBandDock.fijar(el)`: la tira de tres totales (`.m-itot`;
en Invoices total, líneas y unidades; en Sent, desde el 2026-11-21,
recibido, pedido y productos, y los totales del final de la lista se
fueron a ella). La línea chica de debajo ("PO · sent · invoice") se
quitó en las dos y va a la banda bajo el nombre, con el estado:
`enBanda(titulo, sub)` ("CT-0221 · Tue Nov 18 · All in", "#1296630 ·
Thu Nov 19 · Closed"; opción B); cada llamada la pone o la quita
(Resend / Reopen de Sent iban pegados así hasta el 2026-11-21; desde
entonces van fijos donde Done en `#mhAcc`, opción B: Resend en el
cristal azul a lo ancho y Reopen redondo en cristal rojo, con su icono;
el aviso de confirmar sale en el mismo sitio, Cancel / Delete and
reopen debajo). Lo marca con `.m-det-fijo` porque su aviso rehace el
marco de Orders, y el marco lo vuelve a pegar; sin la marca, el aviso
deshacía lo pegado. El detalle de un proveedor en Open, igual desde el
2026-11-20 (Axel: "estilo de un submenú de Settings"): el proveedor en
la banda, el atrás en el sitio de Time Machine. Desde el 2026-11-22
(lámina B ajustada: "Review and send" y "Add a product" competían) el
total y las líneas van en la banda bajo el proveedor (`enBanda(titulo,
sub, aviso)`, "8 without price" en ámbar), y abajo, donde Done, `#moAcc`
como `#mhAcc` de Sent: "Review and send" (`#moSend`) a lo ancho en el
cristal azul, sin el total, y el + (`#moAdd`) redondo, verde como Quick
order, a la DERECHA; al tocarlo su cristal crece hasta la pantalla
(`crecerYAbrir`, sin animar con reducir movimiento) y abre el diálogo de
añadir (`add-to-order.js`, aún no el buscador a pantalla completa). La revisión de enviar
sigue con su cabecera. Prueba: "2c" de `test-sugerencia`. La lista de
Open (2026-11-20, "combina A y C"): cada proveedor con su insignia de
iniciales y la tarjeta teñida en la esquina, los dos del color de
`vendorDotColor()` (en `--vc`; sin precio, el ámbar gana), y "Quick
order" (`#moRun`) fijo donde Done, en cristal verde. Y en Settings (2026-11-21, "como Done"): los
Save (`#msSave` de Sender, Emails, Zones y la ficha de Delivery) y en
People "+ Add person", "+ New role" y "Create …", fijos donde Done con
el cristal azul, cada uno tras su `.m-tx-hueco`. Ese mismo día, la
insignia pasó a ser el LOGO del proveedor donde lo hay ("el logo solo",
sin recuadro), en Open, Sent e Invoices: `src/vendor-logo.js`
(`BarStockVendorLogo.html(v)`), una sola regla para reconocerlo (la
factura dice "PLCB", la orden "LOOP"); sin logo, las iniciales. Los
archivos en `assets/vendors/` (LCB para LOOP, de Breakthru sólo la
flecha; el sello de Fine Wine & Good Spirits desde el 2026-11-21); si se cambia uno, se sube `V` en el módulo. En Sent, la fila del
buscador y los filtros también se queda, debajo de las pestañas: la
pinta la sección, así que se pasa con `tambien` (una función). **Lo que se pega tiene
que colgar directamente de la lista**: un sticky sólo dura lo que su
padre.

Dos cosas que muerden con listas de scroll propio: **el tirón de
recargar** del armazón miraba sólo la página y le robaba el gesto a la
lista (ya mira dónde cae el dedo), y **una página corta sube la barra
de pestañas** en la app instalada (no quitarle el alto mínimo a la
pantalla ni fijar el `body`).

**La barra de pestañas que se sube** (con franja negra debajo) ha
mordido tres veces: al fijar el `body`, al quitarle el alto mínimo a
Buscar, y el 2026-11-12 al **acortar** ese alto mínimo para que More y
Settings no rodaran (restando las zonas seguras: la página cabía
exacta). Las tres tienen la misma causa: en la app instalada del
iPhone, **el documento tiene que medir más que la pantalla**. Por eso
`.m-screen.on` lleva `min-height: calc(100dvh - 200px)` y una página
corta rueda unos 47 px: es el precio, no un error. No se ve en Chromium
(ahí las zonas seguras valen 0), así que **cualquier cambio en el alto
del documento, del `body` o de `.m-screen` se prueba en el teléfono
antes de darlo por bueno**. `test-banda-acoplada` congela el valor. Si
algún día se quita ese rodar sobrante, es haciendo que el documento no
ruede, no acortándolo.
**Durante el scroll no se mide.** `band-dock.js` tiene dos funciones
y no se mezclan: `medir()` (lo caro: posiciones y tamaños, al pintar,
al cambiar de tamaño o de contenido y al poner el dedo) y `animar()`
(cada fotograma: sólo lee lo bajado y escribe lo que cambió, con
`est`). Medía y reescribía variables del documento en cada fotograma,
y eso era lo que restaba fluidez, no los fundidos. Lo que añadas al
header va en una de las dos; si lee una posición, es `medir()`.

**Una sección nueva lo usa, no lo copia.** La prueba es
`tools/test-banda-acoplada.js`.

---

## Reglas del dominio que no son obvias

**`on_hand` es lo que alguien contó, y nada más lo escribe.** Ni `Received`
ni una factura. Es el ancla de `inicio + entradas − final = usado`, y si
algo más lo toca, Pour·IQ calcula los pares con basura. `Received` suma a
`ordered` del snapshot semanal, que es lo correcto.

**Nada de Toast escribe en el conteo.** El "deberías tener" es un número
aparte que se calcula al vuelo (`src/toast-usage.js`) y nunca se guarda.
Lo de Toast sólo escribe en sus tablas (ventas, emparejamientos,
recetas). `tools/test-toast-no-toca-conteo.js` revisa toda pieza con
"toast" en el nombre y falla si escribe en el inventario, los snapshots,
los conteos o `locations`. Axel lo pidió así antes de la prueba y error:
"el conteo, los datos actuales es lo que me preocupa".

**`replaceInventoryMaster()` borra la tabla entera y reinserta** desde
`state.master`. Cinco sitios la llaman. Lleva guardas de merma; no las
quites.

**El nombre es la llave de un producto en ~20 tablas** (lista de
`information_schema`, 2026-11-13): inventario, historial de semanas,
correcciones, zonas, actividad, MarginEdge, Toast, recetas, pedidos,
alias, códigos de barras, siluetas, imágenes… Renombrar NO es cambiar un
campo: lo hace `rename_inventory_item` (migración 038) en una sola
transacción, por locación, y lo compartido en la cuenta (códigos de
barras, siluetas) sólo si ninguna otra locación usa el nombre viejo.
Probada contra un Postgres 16 de verdad. La usa la pantalla de editar del
teléfono (`src/item-edit.js`; nombre, código y Delete con respaldo de
Time Machine antes). **Editar un producto en el teléfono es una
PANTALLA, no una hoja** (Axel, 2026-11-13, sobre lámina): fija encima
de la lista de Inventory (`.m-ed`, la lista no se toca), "Edit item" en
la banda con su atrás, la tarjeta del producto igual que antes, el
nombre una sola vez (fila "Name & code · Rename" que se abre ahí), el
proveedor como una fila con su color (`vendorDotColor()` en
`index.html`) que abre la lista, par y precio lado a lado, lo usado
las últimas 8 semanas (opción C: tocar una barra dice su número; datos
de `BarStockProductWeeks`, el promedio el de Pour·IQ, y su sugerencia
en la cabecera), y Delete y Save en la misma línea, abajo sobre las
pestañas. Cabe sin rodar a la altura útil de un iPhone; lo que se le
añada tiene que caber también. Sin "Save and next" ni Cancel. **Save no saca de la pantalla**
(Axel, 2026-11-13): se queda con la fila nueva del maestro
(bsSaveItemFields la cambia por un objeto nuevo; quedarse con la vieja
hacía que un Delete posterior trabajara sobre una copia), y tras
renombrar, la recarga vuelve a abrir ese producto (`sessionStorage`).
Y el modal del escritorio
(`saveEditedItem`) desde el mismo día: los dos pasan por
`BarStockItemEdit.renombrar()`. Nada más renombra. Y borrar, en los dos,
por `BarStockItemEdit.borrar()`: respaldo de Time Machine antes, y sin
respaldo no borra (el `Delete` del escritorio borraba sin rastro hasta
el 2026-11-13).

**Las marcas de la botella** (Axel, 2026-11-21, lámina A2·7): una
silueta puede llevar `marcas` (etiquetas, sello, renglones de texto, a
su altura), y el panel de conteo las pinta sobre el líquido para contar
con "llega al nombre". Etiquetas y sello, contorno punteado tenue y sin
relleno; cada renglón, el nombre incluido, barras del grueso de sus
letras cortadas por palabras. **Ninguna palabra real** ("no dejes eso
como palabra real"): los datos sólo dicen cuántas letras tiene cada
palabra. Como el asa, se dibujan y no cuentan (`marcasFor` en
`bottle-profiles.js`, aparte de `p`). Las llevan Woodford, Elijah Craig
y Basil Hayden; las demás se añaden botella por botella con su foto.
Prueba: `test-silueta-marcas`.

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

`npm test` · 165 suites · ~2340 comprobaciones. Tienen que pasar enteras.

**Un test que no puede fallar no sirve.** Escribe el test, compruébalo
contra el código roto, y sólo entonces arréglalo. En esta sesión varios
mordieron de verdad y encontraron bugs que yo no había visto.

Lo que se prueba aquí no es que se vea bien, es **lo que no puede volver a
pasar**: que el pasado no se mueva, que un fallo no se disfrace de dato, que
un número no se calcule en dos sitios, que `on_hand` no lo escriba nadie más.

Los tests se registran a mano en el `scripts.test` de `package.json`.

---

## Herramientas de diagnóstico

En `tools/`, sólo lectura, se pegan en la consola del navegador.
**Cada vez que le pidas usar una, dale el código entero para pegar**, junto
con la llamada: él no tiene el repo abierto en el teléfono ni en el
navegador, y lo pidió así (2026-11-08). En Safari no hay `await` suelto
en la consola: la llamada va dentro de `(async () => { ... })();`.

- `diagnostico-waiting.js` → `await bsPorQue('CT-0207')` — por qué una orden
  dice "waiting"
- `forense.js` → `await bsCuando('Baileys')` — qué le pasó a un producto
- `existe.js` — si un producto está en la nube
- `por-que-se-acaba.js` → `await bsSeAcaba('Laboure')` — por qué un producto
  dice que se acaba: cada pieza de la cuenta y la fecha sin cada una
- `demanda.js` → `await bsDemanda()` / `bsDemanda('Laboure')` — de dónde sale
  la demanda semanal de cada producto (Pour·IQ o lo reciente de Toast),
  cuánto subió y si el salto es casualidad
- `cocteles.js` → `await bsCocteles()` — en qué recetas va cada producto
  (onzas, vendidos y onzas en 30 días), las líneas sin botella y lo que
  Toast vendió como cóctel sin receta
- `open-bar.js` → `await bsOpenBar()` — si lo que falta en los licores de
  la casa (conteos − Toast) sube con los invitados de open bar de cada
  semana ("Banquet Beverage"): base, botellas por invitado y r
  · `bsOpenBarDias()`: los días con open bar, tragos en Toast contra un día
  normal del mismo día de la semana (¿los tragos descontados entran?)
- `sin-botella.js` → `await bsSinBotella()` — lo que Toast vende y la cuenta
  del LIVE no resta de ninguna botella, con su motivo, y lo marcado "no es
  del inventario" con lo que vendió
- `toast.js` → `await bsToast('ping')` — qué contesta Toast (`ping`,
  `restaurant`, `menu`, `orders`, `drinks`, `wine`, `sales`), a través de `api/integrations.js`.
  `await bsToastVentas('liquor')` es el DINERO vendido hoy por categoría
  de venta (acción `sales`): bruto, descuentos, neto e impuesto, con los
  modificadores con precio aparte. Medido contra el informe de Toast
  (2026-11-10, al centavo): **el neto es Net sales, y los modificadores
  ya van dentro**; sumarlos los cuenta dos veces. La carga diaria guarda
  ese neto por fila en `toast_sales.net` (migración 034, corrida, con la
  historia de 91 días rehecha), con `sales_category` para partirlo.
  Lo mismo con botones, sin consola y desde el teléfono: Settings →
  Connections → *Toast · Developer tools* (`src/toast-panel.js`), con
  Ping, Sales y Drinks. No tiene botón para `sync`. La llamada y el
  copiar de los dos paneles viven en `src/dev-panel.js`.
  `drinks` resume un día entero de ventas por categoría, con modificadores,
  sin texto libre: es para ver cómo cuenta Toast los tragos.
  **`await bsToastHistoria(365)` NO es sólo lectura:** carga lo vendido día
  por día en `toast_sales` / `toast_sales_days` (acción `sync`, la única de
  Toast que escribe, y sólo esas dos tablas). Se salta lo ya cargado y se
  para en el primer error; `bsToastParar = true` la detiene
- `tripleseat.js` → `await bsTripleseat('ping')` — qué contesta TripleSeat
  (`ping`, `locations`, `events`, `bookings`, `search`, `menu`, `detalle`, `catalogo`), por la misma función.
  Lo mismo con botones, sin consola: Settings → Connections →
  *TripleSeat · Developer tools* (`src/tripleseat-panel.js`)
- `ensayo-auto.js` → `await bsEnsayo()` — qué enlazaría el automático sin
  enlazarlo

---

## Dónde nos quedamos · 2026-11-08

**Esta sección caduca.** Es lo que estaba en el aire el día de la fecha, no
historia. Si la fecha es vieja, créela a medias: comprueba contra el código
y el `git log` antes de actuar, y actualízala o bórrala. Lo de abajo
—"Pendientes conocidos"— sí es estable.

### Toast: de las ventas a botellas, para el inventario en vivo

**Lo que se busca:** dejar el CSV de MarginEdge y sacar las ventas de
Toast, convertidas a botellas. Y sobre eso, el "deberías tener" en vivo
y un correo cada mañana con lo que se va a acabar.

**Hecho y en producción:** *Wine from Toast* (`src/toast-wine.js`, la
tabla del escritorio y las tarjetas del teléfono). Y *Liquor from Toast*
(`src/toast-liquor.js`, sólo en el teléfono: Settings → Toast), con el
mismo motor (`src/toast-links.js`): en Toast el licor solo es la MARCA y
la medida la dice el grupo del menú (`DRINKS › Liquor › Vodka › UP/RX`).
Una fila por marca; la botella se guarda para todas sus medidas. **Los
pours son de cada restaurante** (Axel, 2026-11-13, opción A): Settings ›
Toast › *Pours* (`src/mobile-toast-pours.js`), una fila por cada medida
que ESA locación usa en Toast, guardadas en `location_settings.pours`
(migración 037) sólo si cambian; las de siempre (Single 1.5, Double
2.5, Up/Rocks 3, Shot 1.5, Mix 1.5, de la hoja de Axel) por defecto, y
"2oz"/"3oz" por su nombre. Viven en `src/toast-pours.js`. **Cambiar
una recalcula todo**, también lo ya emparejado: `toast-usage.js` lee
el pour al calcular, por la medida del grupo de Toast
(`medidaDeGrupo`, la regla de `lib/toast.js`); `pour_oz` de
`toast_item_links` queda de reserva. Una medida desconocida no se
guarda ni se cuenta: vacío sería "botella entera". Los cócteles y lo de Happy Hour van por receta (pendiente). Cada vino de Toast
apunta a un producto en `toast_item_links` (migración 027, corrida).
Crown tiene su `toast_restaurant_guid`; las demás locaciones no. Axel ya
emparejó todos los vinos de Crown. **Desde el 2026-11-12, Toast va por
locación:** cada una con su `locations.toast_restaurant_guid` (Will's &
Bill's: `02fb0d1b-5b41-4c7c-80eb-c9a5a06a9116`, la misma credencial lo
abre aunque no tenga "Restaurants: read"). `toast-links.js` manda el de
la locación abierta en cada llamada, `sync` carga el de su locación (con
el menú guardado por restaurante), y la carga diaria recorre todas las
locaciones enlazadas. `TOAST_RESTAURANT_GUID` de Vercel sigue siendo el
de por defecto (Crown) para el panel; el correo de la mañana ya no lo
usa (2026-11-15: sale para cada locación enlazada). Copa = 6 oz siempre; se venden
botellas. La lista de opciones es el inventario entero: casi nada tiene
categoría.

**Decidido con Axel, sin construir:**

- **El "deberías tener" en vivo** = contado + lo que llegó desde el
  conteo − lo vendido en Toast desde el conteo. Es un número aparte:
  **nunca se escribe en `on_hand`**, vuelve a empezar en cada conteo y
  va con "≈".
- **Lo que llegó** sale de `marginedge_invoice_lines` (`product_id`,
  `quantity`, `invoice_date`) → `marginedge_links` → producto. Para
  licor, Axel confirma que `quantity` son botellas, no cajas (la comida
  sí puede ser caja, pero no está en el inventario). Protección
  acordada: una línea que cueste por unidad mucho más que la botella
  (4× o más) se marca para revisar, no se suma a ciegas. El vino
  también se factura siempre por botella (Axel, 2026-11-08).
- **Cuándo se acaba:** desde lo que queda HOY (con las ventas reales),
  día por día hacia adelante con lo que se suele gastar CADA día de la
  semana, aprendido de Toast (mediana, para que un evento no lo
  infle). No dividir entre un promedio: una semana movida tiene que
  adelantar el aviso. Así lo pidió Axel.
- **Dónde se ve:**
  - Inventory, opción A: el número grande es el estimado ("≈3.1/4",
    "Out Sat"), con "● Live" al principio de la línea pequeña de abajo
    (opción 3 de la marca). Lo que no tiene datos en vivo (el licor sin
    receta, la cerveza) enseña lo contado, sin marca.
  - Ficha del producto: la cuenta línea por línea y la semana día por
    día, lo vendido contra lo que se suele gastar ese día.
  - Home: tarjeta "Running out", lo mismo que dirá el correo.
- **Comparación Toast vs MarginEdge del vino:** opción C (barras), con
  semanas viejas de `theoretical_sales`, sólo lectura. Axel no sabe si
  MarginEdge seguirá dando los CSV sin su báscula, y por eso se compara
  contra lo ya cargado.
- **Pantalla de ventas:** lo vendido cada día, y los promedios por día
  de la semana y por semana. Falta su diseño.

**La matemática del LIVE** (Axel, 2026-11-11; sustituye a "lo que llegó
sale de marginedge_invoice_lines" de arriba):

- `LIVE = contado + lo que llegó − lo vendido en Toast desde el conteo`.
- **Lo ordenado no cambia nunca.** Lo que cambia es CUÁNTO LLEGÓ de lo
  ordenado: hasta que se casa contra la factura, llegó lo ordenado; desde
  la factura, lo que dice la factura (corto, nada o de más).
- **Lo ordenado empieza a contar a la hora de entrega del proveedor**, una
  por proveedor y por locación, en Settings › Delivery (`delivery_day` y
  `delivery_time` de cada proveedor; ya construido y configurado a mano
  por Axel en cada locación, 2026-11-14). El pedido fija con ella su
  `arrives_at`, que es lo que lee `live-stock.js`. Crown: LOOP martes 7:00 AM (Axel lo recoge el lunes y el lunes
  está cerrado), Breakthru martes 4:00 PM, Southern miércoles 4:00 PM, Wine
  Merchant jueves 4:00 PM.
- **Una línea de factura sin pedido** también llegó: suma desde que entra
  la factura.
- **Antes de su hora de entrega, un pedido sigue en camino aunque ya
  tenga factura** (con lo que dice la factura). Hasta el 2026-11-19 la
  factura que entraba antes de la entrega lo hacía desaparecer: ni
  "viene" ni "llegó" (el Nino, "Nothing on the way" a las 3 PM con Wine
  Merchant a las 4). Prueba: "la factura llega antes que el pedido" en
  `test-live`.
- **Quick order:** antes de enviar pregunta si se añade al LIVE ya. Sí =
  cuenta desde ese momento (ya llegó, o viene un proveedor de emergencia);
  no = cuenta desde la siguiente entrega del proveedor. Después la factura
  manda, como en un pedido normal.
- **Cada pedido pertenece al ciclo en el que LLEGA, no en el que se
  colocó** (Axel, 2026-11-11, confirmado). Su fecha de llegada se fija al
  enviarlo: la siguiente entrega de su proveedor, o "ahora" en un quick
  order con sí. De ella cuelgan cuándo suma al LIVE, en qué ciclo sale
  como "ordered" (con una leyenda si se colocó en otro: "Placed Thu Nov 12
  · arrives Thu Nov 19") y a qué ciclo cuenta su gasto. Vale también para
  un pedido normal colocado tarde (Breakthru el miércoles, después de su
  entrega del martes, llega el martes siguiente). El conteo del domingo no
  lo incluye porque no estaba en la estantería: no se cuenta dos veces.
- Sin pedido no hay nada que sumar, y lo contado sólo pasa a LIVE al
  descontar la primera venta.
- Ejemplo de Axel: contó 3 Tito's el domingo, ordenó 5 → martes 7 AM, 8 →
  miércoles con las ventas del martes, 7 → la factura dice que no llegó, 2.

**La semana en la tarjeta de "Do we have"** (Axel, 2026-11-13, opción
A sobre lámina): lo que tiene "Live" lleva una línea con lo que quedaba
al final de cada día desde el conteo, cada punto con su número y hoy
relleno, en el color de la tarjeta. Sólo con Live y sólo en esa lista
(`product-hero.html(r, { semana: true })`); la ficha no. Los datos son
los del LIVE (`live-cache.semana` → `live-stock.diaADia`: lo contado,
las llegadas por su día y lo vendido por día), así que el último punto
ES el número grande. Compacta a propósito ("que las tarjetas no crezcan
demasiado"): 48 px de gráfica, unos 105 px más por tarjeta; con más de
ocho días, los ocho últimos y "Since …". Prueba: `test-semana-tarjeta`.

**"On the shelf" del Home lleva las botellas** bajo el título (Axel,
2026-11-13): "≈1,204 bottles" con LIVE, lo contado sin "≈" si no. Es la
suma del número de cada producto (`live-cache.botellas()`, con
`cuanto()`), así que cuadra con Inventory. Todo el inventario es licor y
vino ("no tenemos cerveza ni kegs"): sumar unidades es sumar botellas.
Se descartó "−$X vs count": el estante es contado + llegó − vendido, y
compararlo con el conteo mezclaba las dos cosas.

**El orden del carrusel del Home sigue la semana** (Axel, 2026-11-13,
`src/home-orden.js`): desde el domingo a las 4:00 PM de Nueva York hasta
que se cierra un conteo (`resetAt` en o después de ese corte), el ciclo
primero; cerrado, las órdenes; colocadas (o si no salió ninguna), Running
out el resto de la semana; sin nada que se acabe, el ciclo. Un conteo
hecho el lunes cuenta igual. Un conteo a medias va delante de eso. La
tarjeta de update ya no está en el carrusel (Axel, 2026-11-17): la
versión y "Update now" viven sólo en More (`version-center.js`).
Prueba: `test-home-orden` y `test-tarjeta-version`.

**La tarjeta de Toast va por semanas de lunes a domingo** (Axel,
2026-11-14, opción B): las siete barras son una
semana de calendario (la de Toast), con ‹ › para ir a las anteriores
(hasta donde haya ventas cargadas, ~13 semanas) y en medio la semana y su
total, que se toca (control SIN cristal, un carril oscuro como la
primera lámina: fue de cristal y Axel lo quitó; elegida la semana, el
centro en azul sólido), y pone la semana entera en el número grande, con su
licor y vino, lo más vendido de la semana y su "vs usual" (la mediana de
las semanas ENTERAS anteriores). Se sigue viendo un día al tocar una
barra. Lo que aún no llega de la semana de hoy, apagado. Abre en hoy si
el Sync trajo ventas, si no en ayer (un lunes, el domingo de la semana
anterior). Los números son `toast-sales.semanaCal()`: los mismos días de
`resumir` (`V.dia`) y el total, su suma. Ojo: en lo que devuelve
`ahora()`, `V.hoy` es la ENTRADA de hoy y la fecha es `V.base.hoy`.
`resumir().semana` (los siete días hasta ayer) sigue igual para el correo.
Las hojas (*All products* / *Full report*) abren en la misma semana y en
lo elegido, con la pastilla *Week* primero.

**Cuándo sale la marca "Live"** (Axel, 2026-11-08): durante un conteo
activo se enseña lo contado, sin marca. Al cerrar el conteo todo vuelve
a cero: el número es lo contado y NO lleva "Live". La marca aparece con
el primer movimiento después del conteo, la primera venta de Toast o la
primera factura recibida, lo que llegue antes. Una tarjeta con "Live"
tiene que tener algo restado o sumado detrás; si no, es una afordancia
que miente.

**El orden acordado:**
1. Guardar las ventas diarias de Toast, con la historia hacia atrás.
   Migración 028 corrida (`toast_sales`, `toast_sales_days`). Toast
   contesta hasta un año atrás (comprobado: 2025-11-01). Se guarda lo
   que dijo Toast, sólo bebida, sin texto libre; las botellas se
   calculan al leer. Acción `sync` en `lib/toast.js` y
   `bsToastHistoria` en `tools/toast.js`. Cargados 90 días (Axel
   preguntó si hacía falta un año: para la mediana por día de la semana
   bastan ~13 semanas, y lo viejo tiene otro menú). La carga diaria la
   hace Vercel (`lib/toast-cron.js`, dos llamadas en `vercel.json`, un
   día por llamada por el tope de 10 s); necesita `CRON_SECRET` en
   Vercel o no corre. "Beverage" en Toast es sin alcohol y se queda
   fuera; "Banquet Beverage" se guarda pero es el paquete de open bar
   por persona y no se puede pasar a botellas.
2. La comparación C.
3. La pantalla de ventas: primero el diseño.
4. El "deberías tener" en Inventory, la ficha y el Home.
5. Recetas y licor: Tito's va casi todo en cócteles, sin recetas no hay
   estimado. Faltan de Axel las recetas y los pours (Single, Double,
   3oz, UP/RX).
   **Escribirlas desde la app (2026-11-12, opción A):** Settings › Toast
   › Recipes. "+ New recipe" (de cero), Edit en cada tarjeta (onzas de
   0.25 en 0.25, borrar con dos toques), y la pestaña *From Toast*: lo
   que Toast vendió en 30 días como cóctel (categoría Liquor, o colgado
   de un grupo "Cocktails" en cualquier categoría —la Mimosa es Wine y no
   salía, 2026-11-19—, fuera del grupo "Liquor", que es el licor solo)
   sin receta, con *Write recipe*,
   *Same as…* (añade el nombre a `also`) y *Not a drink* (fila
   `ignored` en `toast_item_links`; lo marcado sale al final de From
   Toast, "Not drinks · N", con *Restore*, que borra esa fila —opción A,
   2026-11-13, tras marcar varios por accidente—; se distingue del "Not
   in inventory" de Liquor from Toast porque no cuelga de un grupo
   "Liquor"). Una receta que Toast no vende con
   su nombre lleva "Not in Toast · Match": emparejar cambia
   `toast_name` y guarda el tuyo en `name`. Migración 036 (`name`,
   `also`). Los datos en `src/toast-recipes.js`, la pantalla en
   `src/mobile-toast-recipes.js`; la prueba, `test-recetas-editar`.
6. El correo de la mañana. Resend ya está; la tarea diaria tiene que
   caber en una función de `api/` que ya exista (están las 12).
   **Diseño acordado (Axel, 2026-11-12, sobre lámina; sin construir):**
   el molde de `lib/email-shell.js` (el del correo de órdenes), con el
   orden de la opción A y una o dos frases en palabras encima de cada
   bloque: ni lista seca ni carta. Las frases salen de plantillas que
   eligen los números, no de una IA: nunca dicen nada que los datos no
   digan. Secciones: el saludo con una línea del día; *Yesterday* (Net
   de Toast en dinero —total, licor con cócteles, vino— y luego en
   botellas, cada uno contra lo de siempre de ese día de la semana, y lo
   más vendido); *Needs attention today* (lo que se acaba hoy) y *Later
   this week* (lo que se acaba antes del domingo). "What stood out" se
   quitó: le sobraba. Un día sin nada urgente, la sección no sale.
   **Cuánto pedir:** cada producto que se acaba lleva su "Order N":
   lo que se suele vender cada día desde hoy **hasta el domingo,
   incluidas todas sus ventas**, menos lo que queda y lo que ya viene,
   redondeado hacia arriba. Se acaba el miércoles → pide más; el sábado
   → pide menos. **No hasta la siguiente entrega del proveedor:** a
   mitad de semana ningún proveedor vuelve a entregar, así que lo que
   falta se busca igual o parecido en LOOP, que se recoge al momento
   (Axel). Sin la etiqueta "from LOOP" (Axel la descartó), y "Won't
   make it to Sunday" es UNA sección: se acaba hoy y no llega al domingo
   juntos, por el día en que se acaba.
   **Construido (2026-11-12), sólo a mano:** Settings › Toast › *Morning
   email* (`src/morning-report.js`) reúne los números con los mismos
   módulos del Home (`toast-sales.js`, `run-out.js` y su `cuantoPedir`),
   enseña la vista y "Send to me" lo manda con "[Test]" en el asunto.
   Las frases y el HTML los escribe `lib/morning-report.js`, por
   `api/integrations.js?provider=report` (`preview` / `send`), y se
   manda al correo de la sesión ("Send to me", con "[Test]") o, con
   "Send to the list" (dos toques), a la lista de Settings › Emails ›
   *Morning email recipients* (`location_settings.morning_recipients`,
   migración 035, corrida), que el servidor lee de la base: nunca acepta
   destinatarios de la petición.
   Si no se sabe qué se acaba (conteo a medias, poca historia, un
   fallo), lo dice en vez de "nothing runs out".
   **Automático (2026-11-12), sólo para Axel:** Vercel lo llama cada día
   a las 13 UTC (`vercel.json`; Hobby lo dispara dentro de esa hora: 8–9
   AM en Nueva York en invierno, 9–10 en verano), después de las cargas
   de Toast, y va **sólo al reply-to** de cada locación enlazada a
   Toast (Settings › Emails), cada una con sus números (2026-11-15, para
   Will's & Bill's; antes sólo Crown). Una sin reply-to se salta y la
   respuesta dice cuál; las demás salen igual. Si ayer está cargado y no tuvo
   ni una venta (el lunes cerrado), no sale correo (2026-11-17); sin
   cargar, sí: un lunes abierto por un evento tiene ventas y sale.
   **El del lunes es el resumen de la semana** (2026-11-17, sobre
   lámina): sustituye al de cada día. La semana pasada de lunes a
   domingo (`semanaCal(V, 1)`, con su "vs usual"), el domingo en su caja
   ("Yesterday · Sunday"), lo más vendido, lo que suele dar esta semana
   día por día (lo de siempre de cada día; cero es "closed") y lo que no
   llega al domingo. `datos()` lo reúne el lunes, o con `{ semanal: true }`
   desde Weekly en Settings (abajo).
   Lo escribe `armarSemana` de `lib/morning-report.js`.
   **Live vs count** va dentro (2026-11-17, "que sugiera qué estuvo
   mal"): del último ciclo de `live_expected` cerrado desde el lunes de
   la semana pasada, lo que se alejó (la regla de Finish count, que vive
   en `src/live-diagnostico.js` y `live-expected.js` usa) con "Less/More
   than expected" y "What it could be", por la tabla de
   `docs/plan-esperado.md`: caja justa (6/12) sin factura, una semana que
   deshace la anterior (error al contar), la misma parte de lo vendido
   2+ semanas (receta o pour, con cuánto más o menos se usa; "very
   likely" desde 3), cuadraba 3 semanas y falta (merma); si no, "too
   early to tell". El ciclo no guarda de qué tragos salió cada botella:
   no se dice "va en cócteles". Lo vendido sin receta se dice del ciclo,
   sin colgárselo a un producto. Prueba: `test-live-diagnostico`.
   **A quién (2026-11-17, lámina B):** el automático va al reply-to y a
   la lista *Morning email recipients* ("Every morning"), sin repetir
   (`partirLista`, la regla de leerla). En Settings › Toast › Morning
   email: Daily | Weekly arriba (la vista cambia; un lunes abre en
   Weekly), "Send a test" (al reply-to, "[Test]") y "Send to…": una hoja
   con la lista puesta, quitar y añadir correos, y "Every morning"
   (apagado de entrada) la guarda. Guarda con TODO lo de la locación:
   `saveSettings` pone a vacío lo que no le llega y borraría el
   reply-to. `para: 'otros'` es lo único que acepta direcciones de la
   petición: con `ajustes_locacion`, válidas y 10 como mucho, sin
   "[Test]". `lib/morning-cron.js`
   corre en el servidor **los mismos archivos de `src/`** (vm, con un
   `window` de mentira) y llama a `BarStockMorningReport.datos()`: un
   solo cálculo. No carga `inventory-cloud.js` (trae los borrados);
   `state.master` sale de `inventory_items` con `src/inventory-row.js`,
   la conversión que usa la app. `vercel.json` le pone a
   `api/integrations.js` `includeFiles: src/**` (se leen al correr, no
   con `require`, y sin eso Vercel no los empaqueta) y `maxDuration: 60`.
   La llave la exige `cronAutorizado()` de `lib/integracion.js`, la
   misma de la carga de Toast.

**Visto de paso, sin tocar:** el pie de la lista de facturas del
teléfono (`src/mobile-invoices.js`) dice que el stock sale del
"confirmed packaging", y en el código no hay ningún sitio que confirme
un empaque. Es una afordancia que miente: se arregla aparte.

### Roles y permisos (2026-11-13, lámina 3A)

Settings › People (`src/mobile-bartenders.js`, el nombre se quedó por el
orden de carga): Owner, Manager, Bartender y los roles que Axel cree,
**todos con nombre y PIN**, el mismo rol en todas sus locaciones, y por
persona las excepciones ("aun cuando tengan el rol de manager pueda yo
quitarle acceso a ciertas funciones"): la ficha enseña TODOS los permisos
del rol con su interruptor, lo quitado sólo a ella en ámbar ("Off for
…"), lo que el rol no da en gris.

- **El catálogo y la cuenta viven en `src/permisos.js`** (navegador y
  servidor, como `bartender-id.js`): 15 permisos; lo que puede una
  persona = su rol − sus excepciones. `dePin()` dice quién es persona de
  PIN, una sola regla para la app y el servidor.
- **Los roles en la tabla `roles`** (migración 039): nombre y permisos.
  Sólo lectura con la llave pública; la escribe el servidor. Owner no
  está: el rol da todo, fijo. Pero a cada Owner se le pueden quitar
  permisos como a un Manager (2026-11-17, "mientras aprenden"), y sólo
  otro Owner (o Axel) toca sus excepciones.
- **De cada persona, en `app_metadata`** (sólo el servidor): `role`,
  `off` y `perms` ya calculados. Cambiar un rol se lo recalcula a quien lo
  tiene; llega con su próxima sesión (una hora como mucho).
- **Un usuario de correo sin rol** (Axel, y los de antes) lo puede todo,
  como siempre, y un rol viejo que no salió de aquí (`staff`) también.
  Pero NO administra gente: `api/admin.js` sólo deja People a Axel o a
  quien tenga "People and roles"; los roles y el Owner, sólo un Owner.
  Nadie se cambia a sí mismo.
- **Qué se cumple y qué no** (hablado con Axel): un permiso apagado
  esconde sus botones (`html.bs-sin-<permiso>`, bloque al final de
  `mobile-app.css`), y el servidor niega lo que pasa por él (People,
  `sync`, `send`). El candado de escrituras de `guest.js` es sólo para
  quien no puede hacer nada más que recetas. Un candado por permiso
  necesita RLS por usuario: Fase 0.
- **Sin hacer, por dibujar:** "Money" y "Orders and invoices" salen como
  "Soon" y no se pueden tocar.
- **El login** (2026-11-13, opción A): arriba de la tarjeta, antes del
  título, las pestañas "Email | PIN" (`src/pin-login.js`). Sin
  "Bartender" en ningún sitio: con PIN entra cualquiera. En Sign up y
  Reset password no salen (`html.auth-no-login`, lo pone `auth.js`).
- **Pausar el acceso sin borrar** (2026-11-15, opción A sobre lámina;
  login opción 1): "Access · Can sign in", arriba de la ficha.
  `setPerson { pausar }` bloquea en Supabase (`ban_duration`, 100 años;
  `'none'` lo quita) y guarda quién y cuándo en `app_metadata.pausa`;
  nada más cambia, y el mismo PIN vuelve a funcionar. La app abierta
  pierde la sesión al renovarla (una hora como mucho). En el login,
  `auth.js` ve `user_banned` y `pin-login.pausado(nombre)` pone la
  tarjeta "Hi Leo, your access is paused" en lugar del teclado.
  **Supabase mira el bloqueo ANTES que la contraseña**: la tarjeta sale
  con cualquier PIN para ese nombre (comprobado en `token.go` de
  supabase/auth). Nadie se pausa a sí mismo; a un Owner, sólo otro.
- **Alta sin PIN** (2026-11-16, opción C sobre lámina): en Add person,
  "They set it" (de entrada) o "Set it now". Sin PIN, la cuenta nace con
  una contraseña al azar y `app_metadata.alta` (huella sha256 con el id,
  24 h, 5 intentos; nunca el código). Quien la crea ve el QR
  (`?alta=Nombre&c=código`, `src/qrcode.js`, MIT, en el repo) y el
  código; People dice "Waiting for PIN" y la ficha "Show code and QR
  again" (`nuevoCodigo`, uno nuevo) o "Set the PIN for …" (cierra el
  alta). En el login, **el código va en las casillas del PIN**: si el
  login falla, `auth.js` prueba esos dígitos con `altaVerificar`, y con
  uno bueno `pin-login.js` pide crear el PIN dos veces
  (`altaReclamar`) y entra. Ese paso es otra pantalla (2026-11-17,
  opción C): el ✓, "Welcome, Drew" y sin el campo del nombre; Drew no
  vio el de antes y su PIN quedó igual al código. El código no vale
  como PIN, ni en la app ni en el servidor. **Supabase MEZCLA
  `app_metadata`**: una clave que no se manda se queda, sólo `null` la
  borra. Quitar el alta con `delete` dejaba "Waiting for PIN" a quien ya
  lo había puesto (Una, 2026-11-17); ahora va `alta: null` (y `pausa:
  null`), el simulacro de `test-roles` mezcla como Supabase, y People
  no marca a quien entró después de recibir su código (así se arreglan
  las altas que quedaron puestas). La fila de People dice su último
  login ("Last in today 3:12 PM", "Never signed in"), no sus
  locaciones, que están en la ficha. `altaVerificar`/`altaReclamar` son lo único
  de `api/admin.js` sin sesión, y contestan IGUAL a un código malo, a un
  nombre que no existe y a quien ya tiene PIN: el login es público. El
  QR se borra de la dirección al leerlo. Prueba: 3d de `test-roles`, la
  pantalla en `test-bartenders`, 3c de `test-pin-login`.
- **El código por correo** (2026-11-17, sobre lámina: texto 1, pasos en
  estilo B y YOUR ACCOUNT antes del código): con "They set it", un campo
  **Email · optional**. Al crear, `createPerson { email }` lo manda con
  `lib/alta-email.js` (el marco de `email-shell.js`; la línea de los
  pasos es una celda de 2 px, no un degradado, por Outlook) y lo guarda
  en `app_metadata.contacto` sólo para reenviar. La ficha: "Code emailed
  to …" y **Email a new code** (`nuevoCodigo { enviar }`). El código
  sólo existe al crearlo: el correo sale ahí o con uno nuevo, nunca
  después. Si Resend falla, la persona se crea igual, el panel lo dice y
  el código sigue en pantalla. Lo firma quien la crea: el nombre de su
  sesión o, en una cuenta de correo, el del perfil de remitente (el del
  saludo del Home); sin ninguno no firma "BarStock". YOUR ACCOUNT va
  al pie, y el encabezado nombra la locación sólo si es una. Prueba: `test-alta-correo`, 3e de
  `test-roles` y la pantalla en `test-bartenders`.
- Pruebas: `test-roles`, `test-bartenders`, `test-invitado`,
  `test-invitado-pantallas`, `test-pin-login`.

### Bartender invitado: nombre y PIN (2026-11-12)

Axel: "puede seguir viendo todo, absolutamente toda la información, pero
no puede editar nada que no son las recetas". Elegido sobre lámina:
login **C** (nombre y teclado numérico), dentro **1** (lo que edita
desaparece), alta **A** (Settings › People › Bartenders, sólo Axel). La
marca es "BARTENDER MODE" en ámbar DENTRO de la banda, bajo el logo o el
título (2026-11-13, opción A): la primera píldora colgaba por debajo y
tapaba las pestañas de Orders. El saludo del Home usa el nombre de su
sesión (el perfil de remitente es de la locación) y el botón del
escáner va apagado con un aviso.

- **Billie es un usuario de Supabase.** Correo sacado del nombre
  (`billie@bartenders.barstockpro.com`, nadie lo ve) y el PIN de
  contraseña. La cuenta vive en `src/bartender-id.js`, que usan el login
  y `api/admin.js` (require): una sola.
- **Lo que lo hace invitado es `app_metadata.role = 'bartender'`**, que
  sólo escribe el servidor. `user_location_access.role` también dice
  `bartender`, pero no es lo que se lee.
- **El candado es `src/guest.js`**, cargado justo tras `config.js`:
  envuelve `window.fetch` y para un invitado sólo deja salir lecturas,
  `toast_recipes`, `toast_recipe_lines`, el "Not a drink" y su Restore
  (crear o borrar sólo filas `ignored` de licor en `toast_item_links`),
  "Tell the team it’s low" (antes "Running low") con su permiso (añadir UNA fila a `stock_checks` y una
  de persona a `shopping_list`; ni cambiar ni quitar) y la sesión. Va
  bajo el candado quien sólo puede recetas y avisar
  (`permisos.bajoCandado`, antes `soloRecetas`). supabase-js
  pasa por él (`global.fetch` en `supabase-client.js`). Esconder botones
  (`html.bs-guest` en el CSS) es para que se vea limpio; lo que impide
  escribir es el candado. El servidor niega además `sync` y `send` en
  `api/integrations.js` (`lib/integracion.js`) y todo `api/admin.js`.
- **No es un candado de verdad** mientras RLS siga en `using (true)`:
  con la sesión de Billie y conocimientos se escribe saltándose la app.
- Quitar a un bartender lo borra de verdad (el nombre queda libre). Una
  app ya abierta sigue con su sesión hasta que caduca (una hora); al
  volver a abrirla, fuera.
- **Lo que se esconde** está en un solo bloque al final de
  `mobile-app.css` (`html.bs-guest`), acotado para no tocar Recipes ni
  la hoja de botellas que comparte. Dos toques mezclaban mirar y editar
  y se cambiaron en JS: la fila de Inventory abre la ficha (la de
  Buscar), y la tarjeta del ciclo del Home lleva `data-kind="cycle"`.
  Settings le enseña sólo lo de Toast y letra/tamaño. **Un control nuevo
  que edite tiene que entrar en ese bloque.** El escritorio no tiene
  nada escondido: el candado lo cubre igual, pero los botones se ven.
- Pruebas: `test-invitado`, `test-bartenders`, `test-pin-login`,
  `test-invitado-pantallas`.

### TripleSeat: en pausa, esperando la lista de paquetes de bar

**Lo que se busca:** que BarStock sepa qué eventos vienen en cada
restaurante y con qué bar, para tenerlo delante al pedir. Todo es sólo
lectura; no se ha guardado nada de TripleSeat en Supabase.

**Lo que ya se sabe**, medido contra producción con el panel
(Settings → Connections → *TripleSeat · Developer tools*):

- Locaciones: Crown `15361`, Jockey `15362`, Will's & Bill's `22225`, todas
  bajo el site `8469`. Harvest no usa TripleSeat. Se emparejan por id: el
  nombre de Crown en TripleSeat empieza con un espacio y Will's & Bill's se
  escribe con `+`.
- `/v1/events.json` viene por orden de CREACIÓN, no por fecha (121
  páginas). Para "lo de las próximas dos semanas" se usa
  `/v1/events/search.json` con `event_start_date` / `event_end_date`.
- Los `LOST` y los que traen `deleted_at` también llegan: hay que
  descartarlos. `guest_count` viene casi siempre.
- **El tipo de bar no es un campo.** No está en los campos del evento, ni en
  los personalizados (sólo dos fechas de depósito, vacías), ni en
  `menu_item_selections` (vacío incluso en eventos con bar), ni en el
  catálogo (`/v1/menus.json` contesta cero menús: WJM no los carga).
- **Está en el documento del evento.** `/v1/events/{id}.json?show_financial=true`
  trae `documents[].line_items`, con `category` Food / Beverage, `price`,
  `quantity`, `total_price`. Es el "Contract & Event Order" del que sale la
  hoja de cocina. Ejemplo: evento `58038602` (Crown, 11/6, 31 invitados),
  hoja de cocina con "Silver Open Bar · 2 hours | per person" ($26) y
  "Consumption bar (after 8pm)".
- **Pero el nombre no se puede cortar del texto.** `display_name` y
  `long_description` vienen vacíos y `menu_item_id` es null: las líneas se
  escriben a mano. `description` es texto plano que pega el nombre a su
  descripción sin separarlo ("Silver Open Barhand crafted brews…").
- Los eventos que entran por el planificador online traen además una línea
  `Drinks:` en `description` (sólo ~6 de 50).

**El plan acordado:** el coordinador de eventos le da a Axel la lista de
paquetes de bar, escritos como en TripleSeat (Silver Open Bar, Consumption
Bar, los demás niveles, y la duración si la hay). Con ella, cada línea de
Beverage se RECONOCE por cómo empieza su texto, sin adivinar. Uno que no esté
en la lista sale como "Beverage sin reconocer", sin inventarle nombre.
Después se decide con Axel dónde se enseña en la app (diseño antes que
código).

**Limpieza pendiente, como cambio aparte:** en `lib/tripleseat.js`, los
campos de diagnóstico de cada línea de `lineas()` (`texto`, `esqueleto`,
`primero`, `menu_item_id`) ya cumplieron su función. Se quitan junto con sus
tests cuando se haga el reconocimiento.

**Lo que no se debe repetir:** el resumen de valores (`resumir`) enseñó
entera la `description` de 50 eventos, con nombres de clientes, en un
bloque del que se había dicho que era seguro copiar. Ya está tapado
(`sinTextoLibre`, y lo copiable sale de una lista cerrada de claves), pero
cualquier bloque nuevo del panel tiene que pasar por esas reglas.

### Del 2026-11-03, sin volver a mirar desde entonces

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

**Estrenado el 2026-11-18, y no enlazaba nada:** MarginEdge da
`invoice_date` sin hora, y `new Date('2026-11-16')` es la medianoche
UTC, el DÍA ANTERIOR a las 7 PM en Nueva York. El conteo cierra el
domingo por la noche (lunes ~02:30 UTC), así que una factura del lunes
quedaba "antes del ciclo": el automático no la miraba (PLCB 2716029
casaba al 100 % con CT-0219) y el reparto no se la daba a una orden
colocada después del cierre, que decía `waiting` con su factura delante.
Ahora una fecha sin hora es el mediodía de ese día en Nueva York
(`order-receipts.fechaFactura`), y la usan el reparto y el automático.
Es muy probablemente la causa de las órdenes `waiting` de Crown
(CT-0207/CT-0204, entregas del lunes), sin comprobar con sus datos.
Prueba: los dos grupos del 2026-11-16 en `test-enlace-auto`.

---

### El esperado: el LIVE al cerrar el ciclo (2026-11-14, fase 1 hecha)

Idea de Axel: el LIVE justo antes de reiniciar el ciclo es lo que
DEBERÍA haber en la estantería. Puesto al lado de lo contado, la
diferencia, semana tras semana, señala recetas o pours mal puestos,
merma o robo, y errores al contar, y dice cuánto fiarse del LIVE de cada
producto. Se guarda aparte (tabla nueva, nunca en `on_hand` ni en
`inventory_snapshots`), en dos tiempos (provisional al cerrar el conteo,
final cuando Toast tiene el día completo), y lo guardado no se recalcula.
El plan entero, con la tabla, los patrones, las fases y las preguntas
pendientes para Axel: **`docs/plan-esperado.md`**. La fase 2 (empezar a
guardar) es la urgente: cada semana sin guardar es historial perdido.

**Dónde quedó (2026-11-14, se sigue el 2026-11-15 temprano para tenerlo
por la tarde):**

- **Fase 1 hecha** (`e099375`): migración 040 (`live_expected_cycles` y
  `live_expected`), probada contra un Postgres 16 local; prueba
  `test-esperado`. **Corrida por Axel el 2026-11-15** (comprobada en
  `information_schema`).
- **Fase 2 hecha (2026-11-14, guardar):** `src/live-expected.js`.
  `count-finish` llama a `antes(master)` ANTES del bucle que escribe el
  on hand (on hand y precio copiados, y `ultimoConteo()` de
  toast-usage, ya exportado), y tras cerrar, sólo si `!yaHayCiclo`, a
  `guardar()` SIN esperarla, con `.catch`. `guardar` pide el LIVE a
  `live-stock.entre()` (el maestro de antes, desde el conteo anterior,
  hasta el cierre), que arma con `armarFilas`, la MISMA función que
  `ahora()`. Escribe el ciclo (`provisional`, `return=representation`
  para su id) y luego sus filas, sólo de lo contado; si algo falla, dice
  lo que contestó el servidor y no escribe filas sueltas. Pruebas:
  `test-esperado-guardar` y "el esperado no puede tumbar el cierre" en
  `test-cierre-conteo`.
  **Corregido el 2026-11-17:** `antes()` usaba `ultimoConteo()` y el on
  hand del maestro, y el paso 1 de cada domingo ("Start new cycle",
  `resetOnHand`) pone todo a 0 y mueve `weekly_reset_at` a la hora en
  que se empieza a contar: el ciclo del 15 de Crown midió 2 horas desde
  0 (Tito's −0.1 esperado contra 8.3). Ahora mide desde el conteo de la
  semana ANTERIOR: el primer `count_sessions.finished_at` de la última
  semana antes de la que se cierra, y lo contado entonces,
  `inventory_snapshots.on_hand_start` de esa semana. Sin los dos, no
  guarda y lo dice. Y `live-diagnostico` no diagnostica un ciclo de
  menos de 72 h (`MIN_HORAS`) ni lo usa como historia: el correo dice
  que no se puede comparar.
- **Cerrar lo provisional, hecho:** `cerrarPendientes()` en
  `live-expected.js`, solo (`cerrarSolo`: 20 s después de abrir la app y
  cada 30 min). Busca los ciclos `provisional` de la locación; si TODOS
  sus días (después de `start_day`, hasta `end_day`) están cargados,
  completos y cerrados, rehace `sold` y `sold_by_day` de cada fila con
  esos días (upsert por `id`, con las columnas que exige un INSERT) y
  pasa el ciclo a `final`. Un día sin cargar lo deja esperando. Lo de
  antes no se toca.
- **Fase 3, en "Finish count" (2026-11-14, sobre lámina: 1, 2 y C):**
  `live-expected.previo()` hace el Sync de hoy (si falla, sigue y lo
  dice con `sincronizado: false`) y calcula lo esperado con lo mismo
  que se guarda (`entre`); `comparar()` decide qué sale: más de
  `UMBRAL` (1) botella Y más de `PARTE` (¼) de lo vendido en la semana,
  sólo lo que Toast vende, ordenado por dinero. En `count-finish`:
  (1) antes de cerrar, la tarjeta "N counts far from what Live
  expected" ("Tap to recount" primero) SUSTITUYE a "do not look right"
  cuando hay Toast; sin Toast, sigue la vieja. (2) Su vista
  `esperado`: "Less than expected" y "More than expected", filas
  `.cf-ex` que abren su panel de conteo. (C) Después de cerrar, "Live
  vs count · −$X this week", los tres que más pesan y "See all N" que
  despliega el resto ahí mismo (el separador va dentro de lo que se
  esconde). Estilos `.cf-ex*` en `count-panel.css`. Pruebas: "3c" en
  `test-esperado-guardar` y "lo que se aleja del LIVE" en
  `test-cierre-conteo`.
- **La verificación también se guarda (2026-11-15, migración 044,
  corrida y verificada por Axel el mismo día):** `live_expected.checked` (jsonb) con
  la última verificación del ciclo (`n`, `at`, `live_said`, `by`, y
  `expected`: el LIVE al cerrar partiendo de ella, lo que enseñó Finish
  count). `expected`/`difference` de la fila siguen siendo los de la
  semana entera, la cuenta para recetas y merma. Un ciclo final no deja
  cambiarla. Sin la columna, `guardar` repite sin ella y lo dice
  (`aviso`, "044"). Probada contra Postgres 16. Prueba: "2b" de
  `test-esperado-guardar`.
- **Las verificaciones en Finish count (2026-11-15, A y B sobre
  lámina):** (A) bajo cada fila de "Far from Live" (antes de cerrar, con
  día y hora) y de "Live vs count" (después, con el día): "✓ Checked Thu
  3:12 PM: 6 (Live said ≈8.1) · Mia"; el expected de esa fila ya parte de
  la verificación. (B) Después de cerrar, "Checked this week · N": TODO
  lo verificado y contado, cuadre o no, con "since check"
  (`live-expected.verificados`). Pruebas: el final del grupo "lo que se
  aleja del LIVE" de `test-cierre-conteo`.
- **Falta:** la ficha del producto (su historial), los patrones y el
  resumen semanal (fases 4 en adelante del plan), sobre lámina.
- *(Lo de abajo es lo que se planeó; ya construido.)* **Guardar al cerrar el conteo**, en
  `count-finish.js`, sólo cuando el conteo abre ciclo (`!yaHayCiclo`;
  un reconteo no). El LIVE se calcula con lo de ANTES: hay que tomar
  los `onHand` del maestro y el instante del conteo anterior
  (`ultimoConteo()` de `toast-usage.js`, hoy privado) antes del bucle
  que los sobrescribe. `BarStockLive.ahora()` no sirve tal cual: lee
  `state.master` y el último conteo, y con un conteo activo contesta
  `contando`. La idea: una función de `live-stock.js` que reciba el
  maestro y los dos instantes, y que `ahora()` pase a usar. Ventas de
  los días DESPUÉS del día del conteo anterior hasta el de éste
  incluido (cada día en un solo ciclo, como ya hace el LIVE). Sólo filas
  de lo contado; con el modo `zero`, decidir. Si guardar falla, el
  conteo se cierra igual y se avisa con lo que pasó. Después, cerrar
  los provisionales cuando Toast tenga el día (en `lib/morning-cron.js`,
  que ya corre `src/` en el servidor, o al abrir la app).
- **La hora del conteo (Axel, 2026-11-14):** "se cuenta después de las
  6 o 7 pm […] sí hay ventas durante el conteo; en ocasiones después
  del cierre". Por eso el día del conteo se PARTE por la hora:
  `toast-usage.ventasEntre(desde, hasta)` pesa los días de las puntas
  con la curva por hora de ESE día (`fraccionDia`, toast_sales_days.
  hours): del día de `desde`, lo vendido después; del de `hasta`, lo de
  antes; los de en medio, enteros. Cada botella cuenta en un solo
  ciclo. Lo usan el LIVE (`desdeElConteo`), el esperado (`entre`) y el
  cierre de lo provisional (desde `cycle_start` hasta `cycle_end`). Un
  día sin horas va como antes, y un conteo después del cierre da lo
  mismo que antes. La línea de la semana de "Do we have" ya resta el
  día del conteo (sólo lo de después). `run-out.fraccionDelDia` usa la
  misma `fraccionDia`. Es una aproximación: la curva es de toda la
  barra, no de cada producto.
- **Quién ve la merma en dinero:** managers, owners y Axel (2026-11-14).
  Hoy no hace falta tocar nada: el bartender no tiene "contar" ni
  "cerrar el conteo" y no llega a Finish count. Cuenta para cuando se
  construya el permiso "Money".

### El ritmo de hoy: "Out today" con lo que se lleva vendido (2026-11-14)

Axel, con una fiesta a mediodía: el prosecco iba a 12.5 botellas a las
3 PM, quedaban 6, y la app decía "Out Thu". La causa: `run-out.js` resta
para hoy `max(0, lo de siempre − lo ya vendido)`, y como ya se había
pasado de un sábado normal, daba el resto del día por terminado. Las
ventas se guardaban por día, sin hora: no se sabía si 12.5 a las 3 PM era
mucho o poco. (Se descartó antes un "factor de semana movida": sus
conteos dicen ~30 a la semana, y esta semana era normal.)

El arreglo acordado, en tres fases:
1. **Hecha:** `sync` guarda lo vendido de bebida por HORA de Nueva York,
   de toda la barra, en `toast_sales_days.hours` (`{ q:[24], net:[24],
   sin_hora }`, migración 041, **corrida el 2026-11-15**). La hora es la de la
   línea (`createdDate`), si no la de su cuenta, si no la de su orden;
   sin ninguna, `sin_hora`. Sin el open bar. Sin la columna, la carga
   sigue sin horas y lo dice (`horas: false`, aviso con "041").
   **Comprobado contra Toast** (2026-11-14, Crown): las horas llegan,
   `sin_hora` 0; un sábado va de las 11 AM a las 8 PM, con el pico de 4
   a 7 PM.
2. **La herramienta está:** `await bsToastHistoria(90, { sinHoras: true
   })` vuelve a cargar sólo los días sin horas (`tools/toast.js`), y se
   para si la función contesta que guardó sin ellas. **Corrida en una
   locación (2026-11-14, 92 días, 8,903 filas) y en Will's & Bill's.**
3. **Hecha:** `run-out.js` → `fraccionDelDia(dias, fecha, instante)`:
   qué parte del día suele llevar vendida la barra a esa hora (mediana
   de los mismos días de la semana, cerrados, completos y con horas;
   mínimo 4; las horas desde las 4 AM, así que la madrugada va al
   final). El resto de hoy (`restaDia`, día 0) = lo MAYOR de lo de
   siempre − lo vendido y lo vendido × (1 − f) / f; con f por debajo del
   15 % (`FRAC_MIN`) no se extrapola. La hora es la del último Sync de
   hoy (`fetched_at`). `proyectar` y `cuantoPedir` reciben `hoyFrac`;
   `ahora()` lo calcula y lo deja en cada fila, y el correo lo pasa a
   `cuantoPedir`. Prueba: `test-run-out` ("el ritmo de hoy").
4. **Cuánto creerle a hoy (2026-11-18):** extrapolar lo vendido tal
   cual convertía tres copas del Laboure Roi (0.71 a las 5 PM, f 22 %,
   un miércoles de 0.40) en 2.5 botellas esa noche y "Out today". Axel:
   nada de parchar productos, que el motor reconozca el tipo. Ahora
   `run-out.ritmoHoy`: a hoy se le cree Z = f / (f + cv), con `cv` lo
   que ESE producto varía de un día a otro (`pedido.variacionDiaria`,
   sus 13 semanas, en `dem.cv`; sin datos, 1; entre 0.25 y 2); λ = 1 +
   Z(ρ − 1), ρ = vendido / (lo de siempre × f); resto = lo de siempre ×
   (1 − f) × λ, nunca menos que lo de siempre − lo vendido. Parejo y
   tarde → se le cree a hoy; a saltos y temprano → manda lo de siempre.
   El prosecco de la fiesta sigue "Out today". Diagnóstico de un
   producto: `tools/por-que-se-acaba.js` → `bsSeAcaba('Laboure')`.
   Prueba: "cuánto creerle a hoy" en `test-run-out`.

### La fecha prudente: media botella de margen (2026-11-14)

Axel, con el Dad's Hat a ≈1.0 un sábado por la noche y "Out Wed": "no
sé si hay más de una, pero puede haber menos de una". El LIVE es un
estimado y la fecha se calculaba como si fuera exacto. `run-out.js`
`proyectar` y `cuantoPedir` reciben `margen` (0 si no se pasa) y restan
esas botellas a lo que queda; `ahora()` pasa el de cada fila y lo deja
en ella, y el correo se lo pasa a `cuantoPedir` (la fecha y el "Order
N" con el mismo margen, o se contradirían). **El margen es del tamaño de
la duda** (`margenDe`): `MARGEN_PARTE` (0.25) de lo que Toast restó
desde el conteo, nunca más de `MARGEN` (0.5). La primera versión, media
botella fija para todo y también en la rama de Pour·IQ de
`running-out.js`, metía en "Running out first" lo que casi no se mueve
(Don Julio ≈0.5 con su fila diciendo "19 days"; Axel: "exactamente de
qué me sirve?"). Lo que Toast no descuenta va SIN margen: su número es
lo contado. El número grande NO cambia, ni
`fuera` ("Out now" mira el estante). **Es provisional:** cuando el
esperado tenga ~4 semanas de un producto, su margen pasa a ser lo que
ese producto suele fallar por el lado de "había menos" (algo como el
80 % de las últimas ~8 semanas), y se encoge solo si sus recetas se
arreglan. Hablado y aceptado así con Axel. Prueba: `test-run-out`
("la fecha prudente").

### Cuánto pedir, de entrega a entrega (2026-11-18, fase 1 hecha)

Axel: "que la app me enseñe a ordenar sin overstock, que duren de orden
a orden de proveedor", y que avise con al menos dos días si algo se
acaba, con su por qué. El plan entero: **`docs/plan-pedido.md`**.
Decidido: colchón del 80 % (0.84 σ, LOOP cubre lo demás), botellas, el
vino en múltiplos de 3 (Wine Merchant o vino), tendencia con la MEDIANA
de las 4 últimas semanas contra las 13 (de ½ a 3×). Sin frases tipo
"Order by Tue" ni "LOOP today": el aviso sólo dice que se acaba.
**Fase 1 hecha:** `src/pedido.js`, puro:
`demanda` (lo MAYOR de Pour·IQ y la mediana de Toast de las 4 últimas
semanas, repartido con la forma de la semana de Toast; la σ de los
conteos sin escalar, como mucho media semana), `cuantoPedir` (uso de la
vuelta + colchón − lo que habrá al llegar; vino de 3 en 3 en Wine
Merchant, en los demás sólo si cuesta una botella o menos:
`redondeoPara`) y `seAcaba` (lo típico más el colchón, que crece con lo
que se USA —un lunes cerrado no lo agranda—, y entregas a su hora). Las
dos tablas de Crown del 2026-11-18 sacaron: Pour·IQ × tendencia (el Nino
a 42/semana), un día fuerte CADA día, el colchón con el reloj (White
Haven "Mon"), la σ escalada (Cinzano Dry) y el vino siempre ×3 (Red
Schooner). Triage no tiene día de entrega fijo (Axel): sin sugerido.
**La fuga del "Order N" (2026-11-18, tarde):** con una entrega YA en
camino que llega después de que se acabe, el "Order N" de Running out,
de "Tell the team it's low" y del correo es lo que FALTA hasta esa
entrega (`run-out.hastaLaEntrega` → `pedido.recorrido({ hasta })
.falta`: lo mínimo de más para no bajar del colchón antes de que
llegue; la misma cuenta que las barras), la compra de LOOP para
aguantar. El Canyon Oaks pedía 15 con 24 llegando al día siguiente: la
cuenta hasta el domingo daba 0 y `shopping-list.sugerido` tomaba el 0
por "no hay" y caía al par − lo que hay. Ahora un 0 vale 0 ("Covered to
Sun", sin "Add"); el par sólo cuando la cuenta no puede hacerse. Sin
nada en camino, sigue hasta el domingo. La entrega que se busca es la
que llega EN el momento del cruce o después (`>=`): `recorrido` mira
justo antes de sumar cada llegada y el cruce suele caer en su hora (el
Nino, 7.1 con 48 a las 4 PM, decía "Out Thu" y "Covered to Sun"). Prueba: el grupo "Order N" de
`test-run-out`.
**Fase 2 hecha (2026-11-18):** `run-out.proyectar` es `pedido.seAcaba`
(una sola cuenta), con la demanda de `pedido.demanda` en `ahora()` para
lo que Toast vende, el ritmo de hoy (`hoyResta`) y el margen de antes;
la fila lleva `dem` y `med` = su `porDia`. El "Order N" hasta el domingo
(`run-out.cuantoPedir` con `dem`) lleva el mismo colchón. Pour·IQ es
`window.parAdjustments`: la app avisa `parAdjustmentsUpdated` al tenerlo
(llega 2.5 s tarde) y `live-cache` se rehace; el correo lo calcula en el
servidor (`week` y `par-intelligence` en `MODULOS`; si falla, Toast
solo). Pruebas: `test-pedido` y "fase 2" de `test-run-out`.
**Fase 3 hecha (2026-11-18, lámina E):** en cada tarjeta de la revisión
de Running out, bajo el nombre, lo que quedará al final de cada día (5
días: hoy en ámbar, el 0 en rojo, una entrega pedida en azul con su
"+N", un día cerrado o lo que sigue en 0 apagado) y debajo la frase en
una franja ámbar. Las barras son `pedido.recorrido` (seAcaba sin
pararse: una sola cuenta) y enseñan lo que queda MENOS el colchón, así
que llegan a 0 el día del "Out". La frase es `run-out.porQue`, de
plantillas: hoy muy por encima de lo normal (×1.3 y 1 botella, sola) ›
"Selling N× its usual" (`dem.tendencia` ≥ 1.3) + lo que se usa hasta
que se acaba › lo que se usa + lo que viene o "Nothing on the way". La
lee `live-cache.fila(r)`. El correo lleva la misma frase bajo cada
producto (`porque`, recortada a 160). Sin demanda (lo que Toast no
vende), ni barras ni frase. Estilos `.m-ro-dia*` y `.m-ro-why`. Prueba:
`test-por-que`.
**Fase 4 hecha (2026-11-18, lámina C):** en el detalle de un proveedor
de Orders › Open, cada línea lleva bajo la cantidad una franja azul con
"Suggested N" y su cuenta ("to last until next Tue 4 PM: uses 6.6 +
cushion 1.4, 0.6 left Tue") y "Use N" si no coincide; al final, "Not
on this order · BarStock would add N": lo de ese proveedor que está en
su par (no sale en la orden) y la app pediría, con "Add N". Ni lo
excluido a mano ni lo ya colocado. "Use"/"Add" ponen la cantidad a
mano por `updateFinalOrder` (sale "edited" y su undo); mirar no cambia
nada, y el par no se toca. La cuenta vive en `src/sugerencia.js`
(`preparar(vendor)`, `para(r)`): `pedido.cuantoPedir` de la siguiente
entrega del proveedor a la de después (Settings › Delivery), con la
demanda, `viene` y `vino` de la fila de run-out (`live-cache.fila`) y
lo que hay de `live-cache.cuanto`; lo que Toast no vende, con Pour·IQ
solo. Sin horario (Triage, UNKNOWN), nada. `.m-ord-use` está en el
bloque `bs-sin-ordenes`. Un proveedor sin ninguna línea por debajo del
par no sale en Open, así que su "Not on this order" tampoco. Prueba:
`test-sugerencia`. Sigue: los eventos (fase 5), cuando esté la lista
de paquetes de bar.
**El open bar, medido (2026-11-19):** los tragos se timbran uno por uno
y el cheque se DESCUENTA; Toast cobra el paquete como "Banquet Beverage"
(`quantity` = invitados). Lo descontado entra en `toast_sales` y el LIVE
lo resta (sólo se descarta lo anulado). Los eventos grandes de Crown dan
**~2.2 tragos de más por invitado** contra un día normal (Sat 10-17: 187
invitados, +413), y lo que falta en los licores de la casa NO depende del
open bar. La tabla y lo que falta para pasarlo a botellas, en
`docs/plan-pedido.md` § 6. Herramientas: `bsOpenBar`, `bsOpenBarDias`.
**Cuánto fiarse del LIVE, la conclusión (2026-11-19).** Medido con
`bsDemanda`, `bsCocteles`, `bsOpenBar` y `bsSinBotella`: el motor cuenta
bien; lo que falla es lo que le entra. Vinos y licores pedidos por marca
cuadran con los conteos (White Haven 19.0/18.3, Tito's 12.2/12.4, Villa
Brici, Canyon Oaks, Grey Goose, Maker's: dentro de un 10–20 %). Lo que va
en cócteles no: Toast ve un 40–60 % (Kentucky Tavern, Pedro Morales,
triple sec, Kamora, Cinzano Sweet, los gins, Smirnoff Vanilla; el Nino
por la Mimosa, 92 al mes sin receta), así que su LIVE resta de menos y
el "Out" llega tarde; Cinzano Dry (martini a 0.5 oz, de verdad ~0.15) y
Mirabeau restan de más. El "cuánto pedir" ya va protegido (lo MAYOR de
Pour·IQ y Toast); la fecha no. Lo que queda tras las recetas (~3
botellas/semana en los de la casa, igual con o sin open bar) es servir de
más o merma. **Decidido con Axel: esperar ~2 ciclos de `live_expected`
(Live vs count) mientras él escribe las recetas** (Mimosa, las 6 vacías:
Bloody Mary, Margarita, Old Fashioned Well, Moscow Mule, LIT - House,
Seasonal Martini; el martini a 0.25), y con eso decidir, sobre lámina,
si la app corrige el LIVE con lo que Toast ve de cada producto o marca
dónde no es de fiar. Hoy el "≈ Live" enseña la misma seguridad en todos.

### La lista de compras y la verificación (2026-11-14, sin construir)

Desde "Running out first", un manager confirma lo que se acaba (a una
lista de compras compartida por locación, que se convierte en quick
order) o dice "I have enough" CON UN NÚMERO: esa verificación corrige el
LIVE del producto hasta el siguiente conteo, nunca toca `on_hand`, y su
diferencia con lo que decía la app es la misma señal del esperado, a
media semana. "Running low" desde cualquier producto para lo que la app
no avisó. El plan: **`docs/plan-lista-compras.md`**. Decidido con Axel
el 2026-11-14: pestaña "To buy" en Orders con resumen en el Home; los
bartenders avisan y sólo quien pide compra (permiso nuevo); "I have
enough" pide siempre el número; las verificaciones salen en Finish
count.

**Fase 1 hecha (2026-11-14): la verificación, sin pantalla.** Migración
042 (`stock_checks`: `counted`, `live_said`, `checked_by`,
`checked_at`; insertar y leer, sin editar ni borrar; trigger para
renombrar), probada contra Postgres 16 y **corrida por Axel el 2026-11-15**.
`src/stock-checks.js` (`guardar`, `leer`), cargado antes de
`live-stock.js`. `live-stock.calcular` recibe `verificaciones`,
`fraccion` y `diaDe`: con una verificación después del conteo, LIVE =
lo verificado + lo que llegó DESPUÉS − lo vendido DESPUÉS (su día
partido por la hora; gana la última; `contado`, `llego` y `vendido`
siguen siendo desde el conteo). `armarFilas` las lee y, si no puede,
sigue sin ellas. `diaADia` salta a lo verificado ese día.
`run-out.margenDe` mide la duda desde la verificación (`vendidoVerif`).
`toast-usage.ventasEntre` devuelve también `porDiaBruto`. Prueba:
`test-verificar`.

**Fase 2 hecha (2026-11-14, lámina B): revisar lo que se acaba.** "See
them" de la tarjeta "Running out first" abre `src/mobile-running-out.js`
(`BarStockRunningOutReview.abrir`): una PANTALLA fija (`.m-ro`, como
`.m-ed`) con "Running out" en la banda y su atrás, una tarjeta por
producto (LIVE, "Out", "Order N" de `live-cache.pedir`, el mismo del
correo) y dos botones: "Add N to list" (permiso `ordenes`) e "I have
enough" (permiso `contar`), que abre la hoja del número (teclado de
botones, sin campo de texto: nada de zoom de iOS; ".5" para la botella
abierta; desde el 2026-11-15 un punto con UN decimal: .2, .5, .7). Lo decidido se queda en la tarjeta con quién y cuándo: "On the
list · 2 by Ana · Undo" y "Checked: 6 on the shelf · Wed 3:12 PM · Mia ·
Change" (CHANGE, no Undo: una verificación no se deshace, se corrige con
otra). Lo revisado sigue en la pantalla aunque deje de acabarse. La
lista vive en `shopping_list` (migración 043, **corrida por Axel el 2026-11-15**: probada
contra Postgres 16; quitar pasa a `removed`, no borra) y
`src/shopping-list.js` (`anadir`, `quitar`, `leer`). Si la revisión no
está cargada, "See them" abre Inventory filtrado como antes. Prueba:
`test-revisar`.

**Fase 3 (2026-11-15, sobre lámina):**
- **To buy** (`src/mobile-to-buy.js`): pestaña de Orders ANTES de Open
  y SÓLO con algo por comprar; vacía, las tres de siempre. Una sola
  lista, sin agrupar por proveedor: la orden de la fase 4 irá entera
  como LOOP (Axel). Cada línea con quién, cuándo y por qué, −/+ y el
  número que abre el teclado (el "Order N" se propone y se ajusta), ✕
  que pasa a `removed`. Lo pedido, aparte y sin botones. El cuerpo de
  Orders es el mismo elemento para las cuatro: lleva `data-sec` y To
  buy sólo pinta si es la suya. Prueba: `test-to-buy`.
- **El teclado** vive en `src/num-pad.js` (lo usan la revisión, To buy
  y Running low) y **cuánto pedir** en `shopping-list.sugerido(r,
  quedan)`, con `live-cache.pedir(r, quedan)`.
- **Running low** en cada tarjeta de "Do we have" (dentro de la
  tarjeta: `product-hero.html(r, { pie })`). Pide cuántas quedan,
  guarda la verificación (corrige el LIVE: "el número del bartender sí
  corrige") y una línea de persona con el "Order N" de ese número y
  "only N left". Ya en la lista, "On the list · Leo: only 1 left" y
  "Remove" (sólo quien compra; quita la línea, no la verificación).
  Permiso nuevo **"Report running low"** (`avisar_bajo`), de fábrica en
  Bartender. Prueba: `test-running-low`.
- **El Home** (opción 1, botón B): "To buy · N" en blanco al lado de
  "See them" de "Running out first", sólo con algo en la lista; lleva
  a la pestaña. Sin nada que se acabe no hay tarjeta, y tampoco botón.
  Prueba: el último grupo de `test-tarjeta-pronto`.

**Fase 4 (2026-11-15, opción A): de la lista a la compra.** "Order N
items" arriba de To buy (sólo con "Make and send orders") abre Quick
order YA RELLENA como LOOP (`BarStockMobileQuick.precargar`), con la
pregunta del LIVE de siempre; al guardar, las líneas que siguen en el
borrador pasan a `ordered` con `order_ref` = el id de la orden y la
cantidad pedida de verdad (`shopping-list.marcarPedidas`). **No cambia
el proveedor de ningún producto**: LOOP va sólo en la línea de esa
orden (Axel lo preguntó). Cambiar de proveedor vacía el borrador y
suelta la lista. Si marcar falla, la pantalla de hecho lo dice. Lo
pedido se enseña como "LOOP · CT-0220 · Sun 2:10 PM · Axel · arrives
Tue 7 AM" hasta la llegada de SU orden (`state.orderHistory`; sin la
orden, 8 días), calculado al leer, sin escribir nada; la pestaña sigue
mientras haya algo pedido sin llegar. La regla vive en `shopping-list.js`
(`llego`, `vigentes`) y la usan To buy y la revisión de Running out:
ésta leía la lista entera y lo pedido que ya llegó seguía "On the list"
sin "Add" para siempre (2026-11-17). Pedido sin llegar: "Ordered", sin
Undo. La firma es el nombre de la
sesión: cada quien usa su teléfono (Axel). Prueba: `test-pedir-lista`.

**Check the shelf: el lápiz junto al número (2026-11-18, lámina C).**
Un transfer de Will's & Bill's contado el domingo en Crown, con su
factura de "Internal Transfers" del lunes, dejó Triage Vodka con 12 de
más en el LIVE, y "I have enough" sólo sale en lo que se acaba. Ahora un
lápiz junto al número grande de la tarjeta de "Do we have" y de la ficha
abre "cuántas hay" en CUALQUIER producto: la misma verificación de
`stock_checks` (corrige el LIVE hasta el siguiente conteo, on_hand no se
toca, sale en Finish count) y nada en la lista de compras. Lo verificado
se queda en la tarjeta: "✓ Checked 19.8 · Wed 10:30 AM · Axel · Change",
y la semana dice "checked N". El teclado y el guardado viven en
`src/check-shelf.js` (`abrir`, `lapiz`, `linea`); "I have enough" de
Running out lo usa también. `product-hero.html(r, { lapiz: i })` (el
índice del maestro) sólo donde se pide: en Inventory la fila es un botón.
Permiso "Count" (`contar`). Prueba: `test-check-shelf`. **Pendiente, por
lámina ya enseñada:** el Transfer entre locaciones (ficha, chips en las
dos locaciones, enlazar la factura de "Internal Transfers"); Axel aún no
lo ha confirmado. Lo de Crown se arregló a mano (semana del 9 de
noviembre de Triage Vodka: `ordered` 12, `used` 20.85); W+B se dejó
como estaba (Axel: su conteo de hace 15 días ya salió bajo).

**Transfers entre locaciones (2026-11-18, fases 1–4 hechas; plan en
`docs/plan-transfer.md`).** Migración 045 (`location_transfers`),
corrida por Axel. Quien lo registra (More › *Transfers*,
`src/mobile-transfers.js`, 2026-11-18: lista B con la pantalla A, como
las subsecciones de Settings: "New transfer", "To confirm" y "This
week" con Undo; la ficha ya no lleva botón) lo aplica al momento en SU locación; la otra lo
confirma sin mover un dedo (`src/transfer-confirm.js`: la primera tarjeta
del Home, la campana y el bloque "Transfers" de la ficha) o dice "Not
right", que llega a la campana de quien lo mandó. Cada lado pone SU
producto (Triage Vodka en Crown, Triage House Vodka en W+B); la pareja se
recuerda; sin pareja ni nombre igual, se elige de una lista (nunca a
ciegas). Sólo con "Make and send orders". **Las cuentas**
(`src/transfers.js`, `aplicar`/`revertir`): cada app aplica su lado al
registrar o confirmar. Pour·IQ ±qty en `ordered` de su semana (con
"Before the count", en la semana que cerró el conteo, también `used`);
la que RECIBE tiene una orden "TRANSFER" (quick-order.save, sin
proveedor en sus líneas: no marca el suyo como colocado) que llega a la
hora del transfer: sale en Sent, suma al LIVE y es a lo que se enlaza la
factura de "Internal Transfers"; la que DA resta en el LIVE
(`live-stock` › `salidas`). Undo (mientras no haya un conteo después) y
"Not right" quitan lo aplicado y borran la orden. `transfers.js` va antes
de `live-stock.js` y también en `MODULOS` del correo. Pruebas:
`test-transfers`, `test-transfer-confirm`. **Varios productos en un
transfer** (migración 046, `group_id`, corrida por Axel el 2026-11-18): las filas del mismo envío
comparten grupo, se confirman o se rechazan juntas ("Confirm all") y
la que recibe tiene UNA orden TRANSFER con todas las líneas. Un
transfer de un solo producto no manda `group_id` (funciona sin la 046). **Fase 4 (la factura):** el
enlace automático (`invoice-order-auto.proponer`) tiene en cuenta las
órdenes TRANSFER aunque sean de antes del ciclo (las demás no: el pasado
no se mueve), y la factura sin enlazar ofrece "It arrived before the
count" (`mobile-invoices.llegoAntes`): elige de qué locación, crea un
transfer "antes del conteo" por línea con producto y enlaza la factura a
la orden del primero. Sin enlace, el reparto ya se la daba a la orden
TRANSFER por producto (no exige proveedor).

**"This week" es la semana del ciclo (2026-11-19).** Running out decía
"10 run out this week" un jueves y todos se acababan el martes o el
miércoles SIGUIENTE: `running-out.lista()` contaba los 7 días desde hoy.
Ahora entra lo que se acaba hasta el domingo del ciclo
(`home-orden.finCiclo`: cerrado el conteo del domingo, el domingo
siguiente; el domingo desde las 4 PM sin cerrar, ese domingo; si no, el
que viene). Desde el domingo por la noche ya se ve la semana nueva (Axel
lo eligió frente al lunes: es cuando se piensa el pedido). Fuera de esa
ventana, la etiqueta dice "Out next Tue" (`live-cache.agota`). Lo que se
acaba la semana que viene tiene que avisarse al hacer la orden (Orders ›
Open), por lámina (hecho, abajo). `home-orden.js` carga antes de `live-cache` y
`running-out`. Pruebas: el último grupo de `test-home-orden` y "this
week es la semana del ciclo" en `test-tarjeta-pronto`.

**Lo que no llega a su entrega, al hacer la orden (2026-11-19, lámina
C).** Arriba del detalle de un proveedor en Orders › Open, un bloque
ámbar sobre Tinta (`.m-ord-pte`): lo suyo que se acaba ANTES de que
llegue esta orden ("Out Wed · 2 from LOOP") con "To buy". Rediseñado el
2026-11-20 (lámina B, "el contenido necesita respirar"): una tarjeta
resumen con el número grande arriba ("2 won't last until their
delivery"), cada producto separado por una línea fina con el día en
ámbar al principio de su renglón, 16 px dentro y 22 px hasta lo que
sigue; las tarjetas de "Not on this order" también a 16 px. Y en **LOOP**,
lo mismo de TODOS los demás proveedores, con su proveedor y su entrega
(Axel: "cualquier vendor se resurte en LOOP"); LOOP sale en Open aunque
no tenga líneas propias. "To buy" lo manda a la lista de compras
(`shopping-list.anadir`, con la nota "Out Wed · before BREAKTHRU Tue 4
PM"); ya en la lista (`mobile-to-buy.deProducto`), desaparece de los dos
sitios. La sugerencia de la línea se queda y lleva el porqué: "short
this week · to last until next Thu…". La cuenta es
`sugerencia.antes(r)` → `run-out.antesDe(fila, llegada)`: la misma de
Running out (LIVE con margen, ritmo de hoy, colchón, lo que viene) hasta
la siguiente entrega del proveedor; sólo lo que Toast vende. Los
horarios de todos los proveedores se piden juntos una vez
(`prepararTodos`). Prueba: "1b" y "2b" de `test-sugerencia`.

**Fijar arriba en Running out (2026-11-15, lámina B).** "Edit order"
en la pantalla de revisión: las tarjetas sin botones y con asa (≡);
arrastrar por encima de "By date" fija, por debajo suelta; "Reset" y
"Done". Lo fijado va primero y en su orden, el resto por la app
(`running-out.lista()`; `{ porFecha: true }` da el de la app). **De
cada persona**: `localStorage`, por locación (`fijados` / `fijar`),
sin migración. Vale para la tarjeta del Home (se repinta con
`runningOutOrder`) y la revisión; el correo no cambia. Lo fijado que
deja de acabarse se conserva y vuelve a su sitio. Prueba:
`test-orden-running-out`, con el arrastre simulado.

---

## Pendientes conocidos

- **Fase 0**: las 16 políticas RLS en `using (true)` con repo público.
- `Resend` sigue apareciendo en órdenes LOOP, que salen por CSV y nunca por
  correo.
- No hay forma de abrir el panel de una botella fuera de un conteo activo.
- El manual de usuario (`docs/manual-usuario.md`) le faltan las secciones
  5–9 y nueve capturas.
- Las órdenes `waiting` de Crown: muy probablemente la fecha de factura
  sin hora (arreglado el 2026-11-18, ver "Estrenado el 2026-11-18");
  confirmarlo cuando una entrega del lunes llegue sin enlace a mano.
- **Cargar hoy a mano desde Toast**: hecho (2026-11-13, sobre lámina).
  Es el botón **Sync** de la mini tarjeta "Sold" del Home, donde estaba
  Report (el reporte sigue en *Full report* de la tarjeta grande).
  `BarStockToastSales.sincronizarHoy()` llama a `sync` con el día de
  hoy y avisa `toastSalesUpdated`: toast-sales olvida lo leído y
  live-cache rehace el LIVE. Con ventas, la tarjeta dice "Sold today"
  con la hora del sync **bajo el título** (Axel: no bajo la cifra); sin
  ventas sigue ayer con "no sales yet"; si falla, ámbar, "Sync failed",
  Retry y un aviso con lo que dijo el servidor. La tarjeta grande y sus
  hojas enseñan hoy como "Today", con "So far today" en vez de un %
  (`semanaConHoy`); `resumir().semana` sigue acabando AYER porque el
  correo toma su último día como "ayer". No cuenta doble: `sync` borra
  el día y lo vuelve a escribir, y la carga de la madrugada rehace los
  días `closed: false`. `run-out.js` ya resta lo vendido hoy del día 0.
  El invitado no ve el botón (el servidor se lo niega igual).
