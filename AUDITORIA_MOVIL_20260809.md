# Auditoría móvil — BarStock Pro

**Fecha:** 9 de agosto 2026
**Base:** commit `2e23e3e`
**Objetivo de referencia:** iPhone en vertical, 390px de ancho

---

## Antes de leer: qué es esto y qué no

Este análisis es **estático**. Leí los 15 archivos CSS, el `index.html` y los módulos de `src/`, y medí anchos, breakpoints y estructura. **No vi la app corriendo en un teléfono.** Chrome no está conectado a esta sesión, así que no pude tomar capturas a 390px ni confirmar cómo se ve realmente.

Eso importa para cómo leer lo que sigue. Cuando digo "la tabla queda en 134px" es aritmética de las reglas CSS, no algo que haya observado. La aritmética puede ser correcta y el resultado en pantalla ser distinto por alguna regla que se me pasó, o por el comportamiento real del navegador.

**Antes de escribir una línea de código conviene confirmar visualmente al menos los tres hallazgos de Prioridad 1.** Se hace en un minuto: abre la app en Chrome, F12, el iconito de teléfono, elige iPhone 14 Pro.

Y algo que no se puede resolver desde aquí: **un simulador no es un teléfono**. El pulgar, el brillo del bar, contar botellas con una mano ocupada. Esa parte solo la sabes tú.

---

## Prioridad 1 — Lo que hace la app inusable, no incómoda

### 1.1 Los paneles laterales nunca se apilan

**Hallazgo:** no existe **ni una sola** media query que toque `.vsp-layout`, `.inv-layout`, `.vsp-panel` o `.inv-panel`. Busqué en los 15 archivos CSS. Cero coincidencias.

Esos layouts son `display:flex` en fila. El panel mide `width:240px` con `flex-shrink:0`, y la tabla al lado tiene `max-width: calc(100% - 256px)`.

**Consecuencia aritmética:** en 390px de ancho, el panel se queda con sus 240px y a la tabla le tocan 134px. Menos de un tercio de la pantalla para la tabla, y el panel ocupando el resto.

Afecta a **Ordering, Inventory y Cost Report** — las tres usan el mismo patrón.

**Arreglo:** una media query que cambie `flex-direction` a columna y le quite el ancho fijo al panel. Es CSS puro, no toca el HTML. La decisión de diseño no es técnica sino tuya: **si el panel va arriba o abajo de la tabla**. Arriba te da el resumen sin scroll; abajo te deja ver la tabla primero.

**Riesgo:** bajo — todo dentro de `@media`, el desktop no se entera. **Esfuerzo:** chico.

---

### 1.2 Las tablas tienen anchos mínimos que fuerzan scroll horizontal

**Hallazgo:**

```
#vendorExportArea table   min-width: 720px
.history-items table      min-width: 720px
.quick-order-table table  min-width: 640px
```

Y están **definidos dos veces**, en `app.css:1961` y en `fixes.css:674`, con la misma sangría. Ver 3.1.

**Consecuencia:** 720px en una pantalla de 390px es casi el doble. La tabla de Ordering y el historial se navegan de lado obligatoriamente.

**Matiz importante:** el scroll horizontal no siempre es malo. Para una tabla de referencia que solo consultas, es aceptable. Para Ordering — donde escribes cantidad artículo por artículo — es donde más estorba, porque pierdes de vista el nombre del producto mientras escribes el número.

**Arreglo:** quitar el `min-width` en móvil es una línea. Pero solo sirve si además se reduce el número de columnas visibles, o las celdas se aplastan hasta ser ilegibles.

**Riesgo:** bajo. **Esfuerzo:** chico, pero incompleto sin 1.3.

---

### 1.3 Densidad de columnas

Hay **17 tablas** en la app. Las que importan en móvil:

| Tabla | Columnas | Sección |
|---|---|---|
| `tuDetailBody` | **12** | Usage |
| `inventoryBody` | 8 | Inventory |
| `vendorBody` | 7 | Ordering |
| `invoicePreviewBody` | 7 | Escaneo de facturas |
| `previewBody` | 5 | Preview de conteo |
| `quickOrderItemsBody` | 5 | Quick Order |

**Consecuencia:** ninguna cantidad de CSS mete 12 columnas en 390px de forma legible. A partir de unas 4 columnas, una tabla en teléfono deja de ser tabla.

**Arreglo:** dos caminos, y aquí es donde se decide el alcance del proyecto.

**Ocultar columnas en móvil.** CSS puro, `display:none` a las columnas secundarias dentro de la media query. En Ordering quedarían Item, To Order y Final Order. Barato, reversible, y no toca ni una línea de JavaScript. Lo que pierdes: los datos ocultos no están, no hay forma de consultarlos sin girar el teléfono.

**Convertir filas en tarjetas.** Cada fila se vuelve un bloque apilado con el nombre arriba y los datos debajo. Es lo que se siente "hecho para el teléfono". Pero requiere tocar el JavaScript que dibuja las filas — `render()` en `index.html`, más los módulos que generan tablas — con una guarda de ancho para que el desktop siga por el camino de siempre.

**Riesgo:** ocultar columnas, bajo. Tarjetas, medio: es el único punto de toda la auditoría donde se toca código que también corre en desktop.
**Esfuerzo:** ocultar, chico. Tarjetas, grande — y hay que hacerlo tabla por tabla.

---

## Prioridad 2 — Específico de iOS

### 2.1 Safari hace zoom solo cada vez que tocas un campo

**Hallazgo:** Safari en iOS hace zoom automático al enfocar cualquier input con `font-size` menor a 16px. Y no regresa solo: te deja la página acercada y descuadrada.

Los que encontré:

```
#vendorSearchInput          font-size: 14px
.cr-card-input input        font-size: 12px
.cr-cat-input.sm input      font-size: 13px
.scan-toolbar select        font-size: 14px
```

**Consecuencia:** en Ordering, cada vez que tocas el campo de cantidad la pantalla salta. Contando 40 artículos, eso son 40 saltos.

**Por qué lo pongo aparte:** es de los que más molestan en el uso real y de los más baratos de arreglar. Subir a 16px solo dentro de la media query de móvil, y ya.

**Riesgo:** bajo. **Esfuerzo:** chico. **Es el mejor cambio por peso en esta lista.**

---

### 2.2 Áreas táctiles

**Hallazgo:** en general está bien. Hay 25 reglas con `min-height:52px`, que es cómodo. Pero conviven con 8 reglas de `min-height:36px` y 2 de `min-height:22px`, por debajo de los 44px que recomienda Apple.

**Nota:** no identifiqué exactamente qué botones son los de 22px. Requiere revisión visual antes de tocarlos.

**Riesgo:** bajo. **Esfuerzo:** chico, después de verificar.

---

## Prioridad 3 — El terreno donde habría que construir

Esta sección no es de síntomas visibles. Es sobre por qué cualquier trabajo de móvil va a costar más de lo que debería si no se atiende antes.

### 3.1 `fixes.css` es 88% copia literal de `app.css`

**Hallazgo:** de las 718 líneas con contenido de `fixes.css`, **633 son idénticas a líneas de `app.css`** — mismo texto, misma sangría.

Incluye bloques `@media (max-width:640px)` completos, duplicados con los mismos selectores: `.wrap`, `.hero`, `.brand-header-logo`, `.brand-name`, `.section-card`, `.tablewrap`, `.rowactions`.

**Consecuencia:** cualquier regla de móvil que escriba compite contra dos copias del mismo estilo, y gana la última que carga. Esto ya costó tiempo antes — la auditoría del 5 de agosto documenta dos casos, el de los botones tipo pastilla y el de las tarjetas opacas, que fueron exactamente esto.

**Arreglo:** determinar cuál de las dos copias manda y borrar la otra. **No de golpe.** Bloque por bloque, con captura antes y después.

**Riesgo:** alto si se hace completo de una sentada. **Esfuerzo:** medio.

---

### 3.2 Catorce breakpoints sin sistema

640, 700, 800, 820, 900, 980, 1100, 1150, 1200, 1280, 1320, 1400 — más `prefers-reduced-motion`. Repartidos en 6 archivos, escritos en dos sintaxis distintas (`@media (max-width: 640px)` y `@media(max-width:640px)`), lo que además rompe cualquier búsqueda de texto que no contemple las dos.

**Consecuencia:** no hay forma de saber qué se rompe a qué ancho sin probar los catorce.

**Arreglo:** reducir a tres — teléfono, tableta, escritorio — conforme se vayan tocando. No como una reescritura.

---

### 3.3 Qué hay hoy en la capa móvil

Los 14 bloques de `max-width:640px` suman unas 85 reglas, y son casi todas del **header y las tarjetas del menú principal**. Encontré reglas para `.wrap`, `.hero`, `.brand-name`, `.bs-nav-tab`, `.bs-focus-grid`, `.metric-card-icon`.

**Nada de tablas. Nada de paneles laterales. Nada de formularios.**

Eso dice que el trabajo de móvil que se hizo en su momento llegó hasta la portada y ahí se detuvo. La parte que usas trabajando nunca se atendió.

---

## Los 22 modales

El ancho base está bien: `.modal{width:min(560px,100%)}` se adapta solo. Los overrides usan `width:min(900px, calc(100vw - 36px))`, que también.

El problema no es el ancho del modal sino **lo que llevan dentro**: Quick Order es un modal responsivo con una tabla de `min-width:640px` adentro. El contenedor se adapta y el contenido no.

Se resuelve junto con 1.2 y 1.3, no aparte.

---

## Orden sugerido

1. **Confirmar visualmente** los tres hallazgos de Prioridad 1 en el simulador. Un minuto, y evita construir sobre una deducción equivocada.
2. **2.1, el zoom de los inputs.** El cambio más barato con el efecto más notorio. Se puede hacer solo, hoy, sin depender de nada.
3. **1.1, apilar los paneles.** CSS puro, riesgo nulo para desktop, arregla tres pantallas de un golpe.
4. **1.2 + 1.3 por la vía de ocultar columnas.** Sigue siendo CSS. Deja Ordering usable en el teléfono.
5. **Probarlo en el bar, en tu teléfono, contando de verdad.** Antes de decidir si hace falta el paso 6.
6. **1.3 por la vía de tarjetas**, y solo para Ordering e Inventory, si el paso 5 dice que hace falta.
7. **3.1, la duplicación de `fixes.css`**, cuando haya tiempo tranquilo y no bajo presión de terminar otra cosa.

Los pasos 2, 3 y 4 son todos CSS dentro de media queries: **el desktop no cambia**, con garantía técnica, no con promesa. El paso 6 es el único que toca código compartido.

Lo que **no** recomiendo: empezar por el 6 porque es el que se ve más impresionante, ni hacer el 3.1 completo en un solo commit.
