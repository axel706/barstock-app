# BarStock Pro — Project Handover v15

**Fecha:** 4 de agosto 2026 · **Estado:** `main` y `develop` sincronizados en `5e3da61`
**Sesión anterior:** v14 (27 de julio 2026)

---

## 0. Lo más importante de esta sesión

Si solo lees una sección, que sea esta.

Se encontraron **tres bugs de fondo** que llevaban meses corrompiendo datos en silencio. Ninguno se manifestaba como un error: los tres producían números plausibles pero falsos, del tipo que se confunden con la realidad del negocio.

**1. Supabase corta toda respuesta REST en 1000 filas.** Ese único hecho causaba dos síntomas que parecían no tener relación:
- Órdenes colocadas que aparecían con 0 artículos (solo en The Crown Tavern, la locación con más historial).
- Productos que decían tener 1-3 semanas de datos en Pour-IQ cuando en realidad tenían 6 u 8.

Los datos en la nube **siempre estuvieron completos**. Lo que fallaba era la lectura. Ahora todas las lecturas masivas paginan.

**2. El botón Apply de Pour-IQ nunca funcionó.** Usaba `window.supabase.from(...)` — pero `window.supabase` es la librería, no un cliente conectado, y no tiene método `.from()`. Además filtraba por `item.id`, un campo que los objetos de `state.master` nunca han tenido. Un `try/catch` se tragaba el error. Los 44 pendientes nunca bajaban porque no había forma de aplicarlos desde esa pantalla.

**3. El detector de semanas de evento se auto-alimentaba.** Marcaba una semana como "evento" si el uso superaba el promedio × 1.5, pero ese promedio **excluía las semanas ya marcadas**. Una vez que un producto empezaba a marcarse, el punto de referencia se congelaba y todas las semanas siguientes se marcaban también. Un producto cuyo consumo simplemente crecía terminaba con todo su historial descartado. Se eliminó la detección automática; las semanas de evento ahora solo se marcan a mano desde Theoretical Usage, que es como ya funcionaba el botón y como lo entiende la base de datos.

**Patrón repetido en los tres:** el dato existía y era correcto; lo que fallaba era leerlo o consumirlo. Vale la pena tenerlo presente al depurar en este proyecto.

---

## 1. Contexto del proyecto

**BarStock Pro** es una app SaaS de inventario para bares, construida por Axel Torres como sole developer para WJM Hospitality. Gestiona inventario, órdenes a vendors, reportes de costos, uso teórico y análisis con IA.

**Axel:** Bilingual ES/EN — responder en el idioma en que escribe. No asumir variante de español. Trabaja en operaciones de restaurante/bar además de desarrollar la app.

---

## 2. Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | Vanilla JS, HTML, CSS — monolito `index.html` (~5,800 líneas) + módulos en `src/` |
| Hosting | Vercel (auto-deploy desde `main`) |
| Base de datos | Supabase (raw fetch, sin SDK) |
| Email | Resend (`orders@barstockpro.com`, `reports@barstockpro.com`) |
| PDF | jsPDF + autotable |
| AI | Claude API via `/api/weekly-briefing.js` (Haiku) |
| DNS | `app.barstockpro.com` → Vercel |
| Repo | github.com/axel706/barstock-app |
| Local repo | `/Users/aj/Desktop/barstock-app` |

---

## 3. Locaciones

| Nombre | Uso |
|---|---|
| The Crown Tavern | Principal — datos completos, precios poblados |
| The Jockey Tavern | Activo |
| Will's & Bill's | Activo |
| DEVELOP | Sandbox para pruebas |

---

## 4. Reglas de trabajo — CRÍTICAS

1. **Un comando a la vez** — esperar output antes del siguiente
2. **No deployar sin confirmación explícita de Axel**
3. **No commitear sin que Axel lo pida**
4. **Editar archivos con `python3 << 'EOF'` heredocs**
5. **Sin cascading changes** — un problema a la vez, grep/analizar antes de escribir código
6. **`node --check src/archivo.js`** para validar JS antes de commitear
7. **Lenguaje plain** — no jerga técnica, no preambles largos
8. **`git stash`** cuando algo se rompe, analizar antes de continuar

### Reglas aprendidas en esta sesión

9. **Antes de rediseñar, dar opciones visuales.** Axel responde muy bien a maquetas y muy mal a que le entreguen algo sin haber acordado la dirección. Si dice "rediseña X", la respuesta correcta es proponer 2-4 opciones, no empezar a escribir código.
10. **Subir la versión del CSS al tocarlo.** `index.html` carga las hojas con `?v=algo`. Si se modifica un CSS sin subir ese número, el navegador sirve la copia vieja. Se olvidó cuatro veces en esta sesión.
11. **Validar `index.html` con el extractor de `<script>`** (ver §11), porque `node --check` no funciona con HTML.
12. **Al eliminar elementos del DOM, buscar quién les escribe sin guarda.** `render()` escribía en cuatro contadores del header con `getElementById(...).textContent` directo; quitarlos habría reventado la app en cada renderizado.

---

## 5. Git workflow

```bash
git checkout develop
# ... cambios ...
git add -A && git commit -m "feat/fix: descripción"

# Deploy a producción
git push origin develop
git checkout main
git reset --hard develop
git push origin main --force
git checkout develop
```

Hay un **pre-commit hook** que estampa el número de build (`BUILD-YYYYMMDD-HHMMSS`) en `index.html`. Por eso cada commit toca ese archivo aunque no lo hayas editado.

---

## 6. Supabase — tablas clave

- `inventory_items` — master. Columnas: `code`, `item_name`, `vendor`, `on_hand`, `suggested`, `value`, `category`, `par_adjusted_week` (date), **`order_override`** (numeric, nueva en esta sesión)
- `inventory_snapshots` — historial semanal: `used`, `ordered`, `on_hand_start`, `on_hand_end`, `week_start`, `is_event_week`
- `locations` — `id`, `name`, `account_id`, `weekly_reset_at`
- `cost_reports` — `period_from`, `period_to`, `total_wine`, `total_liquor`, `wine_sales`, `liquor_sales`, `wine_target`, `liquor_target`, `wine_sales_ly`, `liquor_sales_ly`, `vendors`, `notes`
- `vendor_orders` — órdenes colocadas
- `vendor_order_items` — `item_name`, `quantity`, `unit_price`, `line_total`, `app_order_id`
- `theoretical_sales` — `item_name`, `sold`, `week_start`
- `signup_requests` — solicitudes de acceso pendientes de aprobación

### ⚠️ El COGS NO es una columna

En `cost_reports` **no existe** `wine_cogs` ni `liquor_cogs`. Se calculan al vuelo:

```js
wineCogs = wine_sales > 0 ? (total_wine / wine_sales) * 100 : 0
```

Usar `BarStockCostReport.normalizeCloudReport(row)` en vez de leer columnas por nombre. Leerlas directamente devuelve cero — eso causó un bug en esta sesión.

### ⚠️ El tope de 1000 filas

Supabase corta cualquier respuesta REST en 1000 filas. **Toda lectura que pueda crecer con el tiempo debe paginar.** Ya paginan:

- `vendor_orders` y `vendor_order_items` (`src/orders-cloud.js`)
- `inventory_snapshots` (`src/par-intelligence.js`, helper `fetchAllSnapshotRows`)
- `theoretical_sales` (mismo helper)

Patrón: `&order=id.asc&limit=1000&offset=N`, pidiendo página tras página hasta que devuelva menos de 1000.

---

## 7. Archivos clave

```
index.html                       — app principal (~5,800 líneas)
src/par-intelligence.js          — cálculos Pour-IQ
src/par-intelligence-section.js  — UI de Pour-IQ (rediseñada hoy)
src/theoretical-usage.js         — Theoretical Usage
src/cost-report.js               — Cost Report (lógica y PDF)
src/cost-report-steps.js         — UI por pasos de Cost Report   ← NUEVO
src/focus-stats.js               — mini-cards de la pantalla principal ← NUEVO
src/skeleton.js                  — estados de carga              ← NUEVO
src/toast.js                     — avisos flotantes              ← NUEVO
src/empty-state.js               — estados vacíos                ← NUEVO
src/order-history-ui.js          — Order History UI
src/inventory-realtime.js        — Realtime sync Supabase
src/inventory-cloud.js           — escrituras a inventory_items
src/place-order.js               — lógica colocar orden
src/orders-cloud.js              — vendor_orders y vendor_order_items
src/auth.js                      — login, signup, inactividad
src/admin-panel.js               — panel de aprobación de usuarios
api/send-order.js                — email de órdenes
api/send-cost-report.js          — email de cost reports
api/admin.js                     — endpoint admin (service-role key)
api/notify-signup.js             — notificación de solicitudes
styles/app.css                   — estilos principales
styles/cost-report.css           — Cost Report
styles/motion.css                — capa de movimiento            ← NUEVO
styles/skeleton.css              — esqueletos de carga           ← NUEVO
styles/toast.css                 — avisos flotantes              ← NUEVO
styles/empty-state.css           — estados vacíos                ← NUEVO
styles/pour-iq.css               — Pour-IQ rediseñado            ← NUEVO
```

---

## 8. Lógica de negocio crítica

### Ciclo semanal
- La semana corre de **lunes a domingo**.
- `getEffectiveWeekStart()` en `par-intelligence.js` devuelve el lunes.
- Al importar count → cierra snapshots de la semana anterior → navega a Ordering.

### Pour-IQ (AVG/WK)
- `avgUsed = suma(used de semanas normales) / número de semanas`
- `used = on_hand_start + ordered - on_hand_end`
- Mínimo **4 semanas normales** para activarse.
- **Par óptimo (nuevo en esta sesión):**
  ```
  base    = avgUsed × 1.35
  colchón = avgUsed + 1.28 × desviaciónEstándar
  óptimo  = ceil(máximo(base, colchón))
  si hubo quiebres: óptimo × (1 + min(0.30, quiebres × 0.08))
  ```
  Se toma el **mayor** de los dos a propósito: esto solo puede subir el par de productos erráticos, nunca recortar el de los estables. No puede causar quiebres nuevos.
- **Ajuste: siempre ±1 por semana.** Es intencional, decisión explícita de Axel. No "optimizarlo" para saltar al óptimo.
- **`par_adjusted_week` bloquea re-ajustar el mismo artículo en la misma semana.** Se escribe al aplicar y se lee en `wasAdjustedThisWeek()`. Los artículos ajustados pasan al estado `adjusted` ("Done this week"), **no** a `on` — porque siguen lejos del óptimo, solo gastaron su paso.
- **`is_event_week` ya no se detecta automáticamente.** Solo se marca a mano desde Theoretical Usage, y aplica a la semana completa.

### Señales de salud (nuevas)
- **`erratic`**: coeficiente de variación ≥ 0.6 **y** avgUsed ≥ 1/semana. El piso de volumen evita marcar como errático un producto que simplemente casi no se vende (0,1,0,0,1,0 da 141% de variación pero no hay nada que gestionar).
- **`stockoutWeeks`**: semanas donde `on_hand_end <= 0`. Importante: si un producto se acabó, el uso registrado **subestima la demanda real** — no puedes vender lo que no tienes. Por eso el par se compensa hacia arriba.
- **`shrinkPct`**: `(used - sold) / used` cruzando snapshots contra `theoretical_sales`. Requiere ≥3 semanas con ambos datos. **Deliberadamente NO afecta el par sugerido**: subir el par para cubrir la merma sería financiar la fuga en vez de mostrarla.

### Urgencia en Ordering
- 🔴 `onHand/suggested ≤ 0.25` · 🟡 `≤ 0.60` · ⬜ resto

### Final Order override
- Se guarda en `inventory_items.order_override` (**antes solo vivía en localStorage**, por eso desaparecía al cambiar de navegador).
- Se limpia al importar un conteo nuevo — `replaceInventoryMaster` borra y reinserta, así que queda en nulo solo.

---

## 9. Qué se hizo en esta sesión (47 commits)

### Bugs de fondo
| Commit | Qué |
|---|---|
| `643eae4` `80625f0` `e545474` | Paginar `vendor_order_items` y `vendor_orders` |
| `caaf984` | Paginar `inventory_snapshots` (4 consultas) |
| `e3e957c` | Eliminar detección automática de semana de evento |
| `7814e1d` | **Apply de Pour-IQ nunca funcionó** — cliente inexistente + búsqueda por id inexistente |
| `077e9d3` | Respetar `par_adjusted_week` — un ajuste por semana |
| `4d03771` | Persistir `order_override` en Supabase |
| `1eda9e8` | Apóstrofos rompían el `onclick` del chip de Pour-IQ y los filtros de vendor |
| `bd59e8d` | Recent Periods mostraba 0% (COGS no es columna) |
| `7572678` | Redondeo de decimales de punto flotante (`1506.199999999999`) |
| `b03ff67` `2db1fdf` | Reconstruir `placedOrders` y usar el id real de la orden |

### Pour-IQ
- Rediseño completo: orden por impacto en dólares, días de existencia para bajo par, progreso "par → destino" con semanas restantes, y **modo cola** (una decisión a la vez, con teclado).
- Intro de brindis con copas de martini al abrir la cola.
- Colchón por variabilidad, historial de quiebres, cruce uso contra venta.

### Cost Report
- Reestructurado de lista larga a **4 pasos + Saved**, en dos columnas de alto fijo con panel lateral persistente.
- Paso 1: tarjetas de periodo en vez de dos campos de fecha.
- Paso 2: grid de vendors 3×2 con celda "Add custom vendor".
- Paso 3: una tarjeta por categoría con COGS en vivo y comparación contra el año pasado.
- Paso 4: pestañas internas con **Findings** como primera vista.
- Panel lateral con resumen, mini-cards de COGS y acciones con color.
- **Ni un input, id ni cálculo fue alterado.** El PDF y el email leen exactamente lo mismo que antes.

### Capa visual (4 fases)
1. **Movimiento** (`styles/motion.css`) — unifica dos definiciones que se pisaban; anima secciones, paneles, modales y respuesta al mouse. Respeta `prefers-reduced-motion`.
2. **Esqueletos de carga** (`src/skeleton.js`) — sin banderas de estado, se sobreescriben con el render normal.
3. **Avisos flotantes** (`src/toast.js`) — envuelve `setStatus()`, así los 94 mensajes existentes se convierten sin tocarlos.
4. **Estados vacíos** (`src/empty-state.js`) — distinguen "no hay datos" de "tu filtro no encontró nada".

### Pantalla principal
- Tarjetas centradas con mini-cards de datos en vivo.
- Header reducido a dos líneas; contadores redundantes eliminados.

### Otros
- Cierre de sesión automático tras **30 minutos** de inactividad.
- Desglose por vendor eliminado del email de cost report (sigue en el PDF).

---

## 10. Pendientes

### Confirmados, sin empezar
- **Merma con precio**: mostrar cuánto dinero representa el % de producto servido sin vender.
- **Tendencia de merma**: avisar cuando empeora comparando semanas recientes contra anteriores.
- **Bloquear subidas de par** mientras la fuga esté abierta, para no financiar el problema.
- **3 productos partidos por código**: `Angel's Envy`, `Hendrick's Gin`, `Crown Russe Vodka` y compañía tienen snapshots con códigos distintos (`""` vs código real), así que Pour-IQ cuenta sus semanas por separado. El arreglo es agrupar solo por `item_name`, que es lo que la restricción de unicidad de la tabla ya trata como identidad.

### Por verificar contra la realidad
- **Usage marca 43.8% servido sin vender.** Si es cierto es mucho dinero; también podría ser que pocos artículos tengan el cruce de ventas y el promedio salga inflado.
- **Ordering dice $0 pendiente con 0 vendors** mientras Inventory dice 73 por ordenar. Sospecha: los artículos ya están marcados como ordenados esta semana.

### Deuda técnica menor
- CSS huérfano de la segunda línea del header (`.bs-header-line2`, `.bs-stat-tab`) — 10 reglas sin uso.
- `isCurrentCycle()` está duplicada: vive en `order-history-ui.js` (encerrada) y replicada en `focus-stats.js`. Si se expone la original, borrar la copia.
- `buildTrendCell()` en `par-intelligence-section.js` quedó sin uso tras el rediseño.

### Descartado
- Botón de admin para cerrar todas las sesiones — Axel lo descartó explícitamente. No hay código escrito.

### De v14, sin resolver
- **EA/CS en PDF de orden** — columna de unidad de medida por item.
- **Mobile iPhone** — la app sigue sin ser usable en iPhone. Requiere sesión dedicada con iPhone conectado.

---

## 11. Comandos útiles

```bash
# Validar JS
node --check src/archivo.js

# Validar los <script> de index.html (node --check no sirve con HTML)
node -e "
const fs=require('fs');const h=fs.readFileSync('index.html','utf8');
const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)];let n=0;
for(const s of m){try{new Function(s[1]);}catch(e){n++;console.log('FALLO:',e.message.slice(0,100));}}
console.log(n===0?'OK':'errores: '+n);
"

# Validar balance de llaves en CSS
node -e "
const c=require('fs').readFileSync('styles/archivo.css','utf8');
console.log((c.match(/{/g)||[]).length===(c.match(/}/g)||[]).length?'OK':'DESBALANCEADO');
"

# Balance de divs en una sección del HTML
node -e "
const h=require('fs').readFileSync('index.html','utf8');
const a=h.indexOf('id=\"costReportSection\"'), b=h.indexOf('id=\"theoreticalSection\"');
const s=h.slice(a,b);
console.log((s.match(/<div\b/g)||[]).length, (s.match(/<\/div>/g)||[]).length);
"

# Volver a un punto seguro
git checkout main && git reset --hard <commit> && git push origin main --force
```

---

## 12. Notas para la IA que retome el proyecto

- Responder en el idioma en que escriba Axel.
- **No deployar ni commitear sin que lo pida explícitamente.**
- **Dar opciones visuales antes de rediseñar.** Es la lección más repetida de esta sesión.
- Antes de tocar código: leer el archivo relevante con `sed -n` para entender el contexto exacto.
- `index.html` es el archivo más crítico y frágil — cualquier error de sintaxis rompe toda la app.
- **Al depurar en este proyecto, sospechar de la lectura antes que del dato.** Los tres bugs grandes de esta sesión tenían datos correctos en la nube y lecturas rotas.
- Hay una regla en `app.css` que redondea **todos** los `<button>` a 999px con `!important` y una lista de 17 exclusiones. Si un botón sale con forma de pastilla sin querer, agregarlo a esa lista es la forma correcta de resolverlo.
- Los elementos delgados dentro de contenedores `flex` con alto fijo **se aplastan a cero** si el contenido excede el alto. Si una línea o barra "no aparece" aunque esté en el DOM, revisar `flex-shrink`.
- El logo de BarStock Pro: nunca usar el carácter "." — siempre un `<span>` circular con `background:#38bdf8`.
- Los emails usan tablas HTML (no flexbox/grid) para compatibilidad con clientes de correo.
