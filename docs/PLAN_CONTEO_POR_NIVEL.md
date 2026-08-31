# Conteo por nivel de botella · plan

Estado: **en revisión, nada construido.** El prototipo de `/prototype/pour-slider.html` valida el gesto y la matemática; esto es lo que haría falta para integrarlo.

## Decisiones tomadas

| Decisión | Elegido |
|---|---|
| Papel del deslizador | Solo botellas **abiertas**. El archivo sigue trayendo las selladas y la fracción se **suma**. |
| Quién cuenta | Axel y el staff de cada locación. |
| Punto de entrada | Solo desde **Inventory**: el panel de detalle gana un botón "Contar abierta". |
| Forma de la botella | **Siluetas paramétricas** por arquetipo, no fotos. |

Consecuencia de contar desde Inventory: se cuenta de una botella en una, no en sesiones de trescientas. Si se cae la señal se pierde **un** conteo, no una tarde. Eso baja lo offline de bloqueante a deseable.

---

## Las tres preguntas abiertas

Las tres cambian el diseño, así que van antes que el código.

### 1. ¿El archivo de conteo ya incluye botellas parciales?

Es la más importante. El modelo "selladas + abiertas" solo funciona si el archivo trae **solo enteros**. Si hoy ya estimas las parciales al contar y eso viaja en el archivo, sumar la fracción del deslizador **contaría dos veces la misma botella**.

Si el archivo ya trae parciales, hay salida: el deslizador **reemplaza** la fracción en vez de sumarla, y el número del archivo se toma como parte entera. Pero hay que saberlo antes.

### 2. ¿La fracción de abiertas se borra al importar un conteo nuevo?

Mi lectura, siguiendo tu propia regla sobre los overrides — *"un conteo nuevo abre la semana desde cero"* —, es que **sí**: el archivo nuevo manda y la fracción de la semana pasada es información vieja. Pero es tu decisión, no la mía, y esta vez pregunto antes.

### 3. ¿Calibramos los perfiles contra botellas reales?

Los siete perfiles del prototipo me los inventé. Son plausibles y la matemática que los usa es correcta, pero **una forma equivocada da un número preciso y falso**, que es peor que un número obviamente malo.

Calibrar es barato: coger una botella de cada arquetipo, llenarla con agua en tramos medidos y anotar a qué altura queda cada volumen. Una tarde, y los siete perfiles quedan anclados a la realidad. Lo recomiendo antes de que el staff cuente con esto.

---

## Restricciones del proyecto

Dos cosas que ya están decididas por el estado actual del código y condicionan todo lo demás.

**Queda un solo hueco de función serverless.** Vas 11 de 12 en el plan Hobby de Vercel. La asignación automática de forma y tamaño **extiende `api/categorize.js`**, no crea un endpoint nuevo. Si gastamos ese hueco aquí, la siguiente función que necesites obliga a cambiar de plan.

**`replaceInventoryMaster()` borra y reinserta la tabla entera.** Solo sobrevive lo que aparece en su lista de columnas. Las columnas nuevas de forma y tamaño **tienen que entrar ahí** o cada importación semanal las borra. Es exactamente lo que pasó con `category`; esta vez lo sabemos de antemano.

---

## Modelo de datos

Columnas nuevas en `inventory_items`:

| Columna | Tipo | Para qué | ¿Sobrevive al import? |
|---|---|---|---|
| `open_qty` | `numeric` | Fracción de botella abierta (0.62) | **No** — se limpia, pendiente de confirmar |
| `bottle_size_ml` | `integer` | 750 / 1000 / 1750 | **Sí** — va en `replaceInventoryMaster` |
| `bottle_shape` | `text` | Clave del arquetipo | **Sí** — va en `replaceInventoryMaster` |
| `open_counted_at` | `timestamptz` | Cuándo se contó | No |
| `open_counted_by` | `text` | Quién lo contó | No |

Un detalle que sale gratis con este diseño: **`on_hand` no cambia de naturaleza.** Sigue siendo el entero que escribe el archivo. La fracción vive aparte, en `open_qty`. Así que la duda de si la columna aceptaba decimales deja de importar, y no hay que tocar los treinta sitios que ya leen `on_hand`.

La suma se hace al cargar, al construir `state.master`:

```
onHand = on_hand (selladas)  +  open_qty (abierta)
```

Todo lo de aguas abajo — to order, valor, Pour-IQ, informes — recibe el número combinado sin enterarse de que hubo un cambio.

**Quién contó y cuándo** no es decoración: con varias personas contando, la última escritura gana, y sin saber de quién es el número no hay forma de resolver una discrepancia. También permite distinguir "esta botella está a cero" de "esta botella no la ha contado nadie todavía", que son cosas muy distintas.

---

## Fases

### Fase 0 · Los datos (nada visible todavía)

1. Migración SQL con las cinco columnas.
2. Añadir `bottle_size_ml` y `bottle_shape` a `replaceInventoryMaster()`.
3. Extender `api/categorize.js` para que devuelva también forma y tamaño.
4. Motor de asignación, calcado del de categorías: reglas primero, IA para lo que las reglas no resuelvan, modal de revisión antes de guardar.

Las reglas se apoyan en trabajo que ya está hecho. El tamaño casi siempre está en el nombre (`1.75`, `1L`, `375`). Y la forma se deduce de la **categoría que ya asignaste**: vino → borgoña o burdeos, tequila → tequila, vodka → vodka. La IA solo ve lo que sobra.

### Fase 1 · Contar desde Inventory

5. Botón "Contar abierta" en el panel de detalle.
6. El deslizador del prototipo, portado a un módulo `src/`.
7. Escritura de `open_qty` con su marca de quién y cuándo.
8. Mostrar el desglose donde hoy hay un solo número: `2 selladas + 0.62 abierta = 2.62`.

El punto 8 importa más de lo que parece. Si la app enseña 2.62 sin explicar de dónde sale, el primer número raro destruye la confianza en el sistema entero.

### Fase 2 · Offline

9. Cola en `localStorage` por locación; se vacía al recuperar señal.
10. Indicador de conteos sin sincronizar.

No es un service worker ni una PWA: es una cola de escrituras pendientes, que es lo que resuelve el riesgo real sin construir infraestructura.

### Fase 3 · Calibración

11. Medir una botella real por arquetipo y ajustar los perfiles.
12. Reunir el ajuste en un solo archivo de perfiles, para que corregir una forma sea cambiar unos números y no tocar código.

---

## Lo legal

En un prototipo la duda era teórica. Integrado en un producto por el que cobras, no.

Partender se anuncia públicamente como *patented*, con *proprietary design*, describiendo justo esto: deslizar una barra en pantalla para estimar el nivel del líquido por comparación visual. No es que la idea sea impatentable ni que copiarla sea automáticamente infringir — **una patente protege lo que dicen sus reivindicaciones**, y suelen ser específicas. Puede que esto caiga fuera con holgura.

Recomendación: constrúyelo y pruébalo en tus locaciones. Antes de venderlo a un cliente que no seas tú, busca la patente en Google Patents o la USPTO y lee las reivindicaciones, o paga una consulta de *freedom to operate*. No soy abogado y esto no es asesoría legal.

Lo que sí es seguro sin dudas: los perfiles son dibujo vectorial propio, no fotos de marca. Bajar imágenes de producto de webs de destilerías sería un problema de copyright bastante más claro que la duda de la patente.

---

## Lo que este plan NO incluye

- Sustituir la importación del archivo. Sigue siendo la vía principal.
- Contar botellas selladas con el deslizador. Son enteros; se cuentan a mano más rápido.
- Escáner de código de barras.
- Modo de conteo a pantalla completa. Descartado a favor de entrar desde Inventory; si algún día una ronda completa se hace pesada, se añade encima sin rehacer nada.
