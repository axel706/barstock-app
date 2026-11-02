# Auditoría de navegación y visual — BarStock Pro

**Fecha:** 5 de agosto 2026
**Base:** commit `2e7b2c6`
**Método:** análisis del código completo (`index.html`, `src/*.js`, `styles/*.css`), no inspección visual.

Esta es una lista de trabajo, no un plan cerrado. Cada punto tiene el hallazgo, por qué importa, y qué implicaría arreglarlo.

---

## Prioridad 1 — Navegación rota

### 1.1 El botón Atrás del navegador saca de la app

**Hallazgo:** no existe `pushState`, `popstate` ni `location.hash` en ninguna parte del código.

**Consecuencia:** estando en cualquier sección, el botón Atrás — o el gesto de deslizar en trackpad, que es fácil de disparar sin querer — abandona la aplicación. En una app de una sola página el usuario espera que Atrás lo regrese a la pantalla anterior.

**Arreglo:** `history.pushState` al entrar a cada sección y un listener de `popstate` que llame a `bsOpenSection`/`bsCloseSection`. Es contenido: la navegación ya está centralizada en esas dos funciones.

**Riesgo:** bajo. **Esfuerzo:** chico.

---

### 1.2 Al recargar siempre se abre en Overview

**Hallazgo:** no se guarda la sección activa en ningún lado.

**Consecuencia:** un refresh accidental — o el cierre por inactividad de 30 minutos que agregamos — obliga a volver a navegar. Se agrava con 1.1: no hay forma de regresar.

**Arreglo:** guardar el nombre de la sección en `sessionStorage` al navegar y restaurarla al cargar. Si se hace 1.1 con `hash`, esto sale casi gratis.

**Riesgo:** bajo. **Esfuerzo:** chico.

---

## Prioridad 2 — Modales inconsistentes

Hay **17 modales** en la app y se comportan de cinco maneras distintas.

### 2.1 Escape cierra solo 1 de 17

**Hallazgo:** el único `key === 'Escape'` está en `par-intelligence-section.js` (la cola de Pour-IQ, hecha ayer).

**Consecuencia:** Escape es una expectativa universal. Que funcione en uno y en dieciséis no, enseña a no intentarlo.

**Arreglo:** un listener global que cierre el modal visible más alto. Se puede hacer en un solo lugar sin tocar los 17.

**Riesgo:** bajo. **Esfuerzo:** chico.

---

### 2.2 Click fuera cierra solo 5 de 17

**Hallazgo:** implementado en `emailCostReportModalBg`, `emailOrderModalBg`, `settingsModalBg`, `invoiceScanModalBg`, `invoiceLinkModalBg`. Los otros doce no.

**Consecuencia:** peor que no tenerlo. El usuario aprende que funciona en Settings, lo intenta en Edit Item, no pasa nada, y deja de confiar.

**Arreglo:** mismo listener global del punto anterior. Ojo: en modales con formulario a medio llenar conviene pedir confirmación en vez de cerrar directo.

**Riesgo:** bajo-medio (hay que decidir cuáles piden confirmación). **Esfuerzo:** chico.

---

### 2.3 Once modales sin botón de cerrar detectable

`newItemModalBg`, `editModalBg`, `linkModalBg`, `previewModalBg`, `invoiceScanModalBg`, `invoiceLinkModalBg`, `quickOrderModalBg`, `emailCostReportModalBg`, `emailOrderModalBg`, `settingsModalBg`, `excludedItemsModalBg`.

**Nota:** el análisis busca `closeModal`, `classList.add('hidden')` o un icono `ti-x` cerca de la declaración. Algunos probablemente sí cierran por un botón "Cancel" más abajo. **Requiere verificación visual antes de tocar nada.**

**Riesgo:** bajo. **Esfuerzo:** chico, después de verificar.

---

## Prioridad 3 — Teclado

### 3.1 Nada es alcanzable con Tab

**Hallazgo:** 201 `onclick` en línea en toda la app. 14 `div` clickeables en `index.html` con cero `role` o `tabindex`. En los módulos: `order-history-ui.js` tiene 24, `par-intelligence-section.js` 13, `cost-report.js` 12.

**Consecuencia:** la app solo se puede usar con mouse. Además de la barrera de accesibilidad, impide moverse rápido a quien ya sabe dónde está todo.

**Arreglo:** convertir los `div` clickeables en `<button>` donde se pueda, o agregarles `role="button"` y `tabindex="0"` más manejo de Enter/Espacio. No hay que hacer los 201 de golpe: se puede priorizar por pantalla.

**Riesgo:** medio (tocar 201 puntos invita a errores). **Esfuerzo:** grande. **Sugerencia:** por secciones, empezando por Ordering e Inventory, que es donde pasas más tiempo.

---

### 3.2 No hay atajos

Solo existen los de la cola de Pour-IQ (Enter, flecha, Escape).

**Candidatos naturales:** número para saltar de sección, `/` para enfocar el buscador, `Cmd+S` en Cost Report.

**Riesgo:** bajo. **Esfuerzo:** medio.

---

## Prioridad 4 — El CSS pelea consigo mismo

Este es el que menos se ve y el que más tiempo cuesta.

### 4.1 146 clases con estilo y sin uso

De **615 clases** definidas en los CSS, **146 no aparecen** en ningún HTML ni JS. Casi una cuarta parte.

Ejemplos: `hero`, `theme-toggle`, `brand-lockup`, `version-tag`, `notice`, `vendorbar`, `history-controls-top`, `compare-toolbar`, `topbar`, `history-card`.

**Consecuencia:** al buscar por qué algo se ve de cierta forma, un cuarto de los resultados son pistas falsas.

**Riesgo:** medio — "sin uso" según análisis estático puede fallar si una clase se arma con concatenación de strings. **Hay que verificar una por una.**

---

### 4.2 Setenta y siete selectores definidos tres o más veces

Los peores: `.brand-name` (18 veces), `.brand-lockup` (14), `.brand-header-logo` (14), `.brand-text` (12), `.grid` (8), `.wrap` (7). `.card` está definida cuatro veces con valores distintos.

**Consecuencia:** esto no es teórico. **En la sesión de ayer costó tiempo dos veces:**

- Las tarjetas de periodo salían con forma de pastilla por una regla en `app.css` que redondea *todos* los `<button>` a 999px con `!important` y una lista de quince exclusiones. Tomó varios intentos encontrarla.
- Las tarjetas del menú principal se veían opacas porque les estaba encimando fondos sin darme cuenta de que ya heredaban el cristal de `.card` — que está definida cuatro veces, y la que manda es la última.

**Arreglo:** consolidar cada selector en una sola definición, empezando por `.card`, `.wrap` y `.grid`, que son los que más se usan.

**Riesgo:** alto si se hace de golpe. **Esfuerzo:** grande. **Sugerencia:** uno por uno, con captura antes y después.

---

### 4.3 `app.css` tiene 3,430 líneas

De 7,507 líneas de CSS totales, casi la mitad están en un archivo. Los archivos nuevos de ayer (`motion`, `toast`, `skeleton`, `empty-state`, `pour-iq`) demostraron que separar por propósito funciona bien y es fácil de revertir.

**Sugerencia:** ir extrayendo bloques temáticos de `app.css` a archivos propios conforme se toquen, sin una gran reescritura.

---

## Cosas menores anotadas

- CSS huérfano de la segunda línea del header (`.bs-header-line2`, `.bs-stat-tab`) — 10 reglas, eliminadas del HTML ayer.
- `isCurrentCycle()` duplicada: encerrada en `order-history-ui.js` y replicada en `focus-stats.js`.
- `buildTrendCell()` en `par-intelligence-section.js` quedó sin uso tras el rediseño.
- **Mobile iPhone** sigue sin ser usable (viene de v14). Requiere sesión dedicada con dispositivo conectado.

---

## Orden sugerido

1. **1.1 + 1.2 + 2.1** juntos — historial, memoria de sección y Escape. Bajo riesgo, se nota todos los días.
2. **2.2 + 2.3** — consistencia de modales, después de verificar visualmente cuáles ya cierran.
3. **4.2 selectivo** — consolidar solo `.card`, `.wrap` y `.grid`. Los tres que más estorban.
4. **3.1 por secciones** — teclado, empezando por Ordering e Inventory.
5. **4.1** — limpieza de clases muertas, una por una, cuando haya tiempo tranquilo.

Lo que **no** recomiendo hacer nunca de golpe: 4.1 y 4.2 completos en un solo commit. Son exactamente el tipo de cambio que rompe cosas invisibles y difíciles de rastrear.
