# Pour-IQ — Ideas de rediseño y capacidades

**Fecha:** 5 de agosto 2026
**Estado:** ninguna implementada. Todo esto son propuestas exploradas en sesión, guardadas para retomar.

---

## Contexto: qué está mal hoy

Observaciones sobre la pantalla actual, verificadas contra el código y una captura real:

| Problema | Detalle |
|---|---|
| Título duplicado | "Pour-IQ™ — Par Intelligence" aparece como encabezado de sección con descripción, y otra vez adentro con el badge. ~80px de alto sin información nueva. |
| Columna "Weeks" inútil | Dice `8` en todas las filas. Solo varía en artículos que aún construyen baseline, y esos están filtrados de la vista. |
| Columna "Adjustment" inútil | Dice `−1` en todas las filas, y siempre lo dirá — esa es la regla de negocio. Una columna con valores idénticos no es información. |
| Seis chips con el mismo peso | Over par, On par, Under par, Frees up, Adjusted, Observing. Pero "On par 196" no pide nada del usuario y "Under par 31" son quiebres potenciales. |
| Los bajo par están escondidos | La tabla abre en "Over par". Los 31 bajo par —que cuestan ventas— viven detrás de un chip. |
| Dos filas de filtros | Estado y vendor en renglones separados. |

Entre "Weeks" y "Adjustment" se llevan ~15% del ancho de tabla sin decir nada.

---

## Propuestas de diseño exploradas

### A · Dos grupos separados
Lista con dos secciones: **"Running out"** (bajo par, ordenado por días de existencia restante) y **"Carrying too much"** (sobre par, ordenado por dinero). Encabezado en una línea, tres cifras con jerarquía, filtros unificados en un renglón.

**Razón del split:** los dos problemas se miden en unidades distintas — días contra dólares. Mezclarlos obliga a comparar peras con manzanas.

**Riesgo:** bajo. Es lo más cercano a lo actual.

---

### B · Cola de prioridad única
Una sola lista numerada, sin grupos ni filtros de estado. Todo ordenado por "lo que más te cuesta hoy", mezclando riesgo de quiebre y dinero inmovilizado. El color y el icono indican de qué tipo es.

**Ventaja:** la más rápida de recorrer, cero decisiones de navegación.
**Costo:** pierdes la vista de cuánto hay de cada tipo.

---

### C · Lista + panel lateral
Tabla adelgazada a tres columnas y todo el contexto en un panel a la derecha: historial de 8 semanas, por qué la recomendación, y la acción. Mismo patrón que Inventory y Ordering ya usan.

**Ventaja:** es la única que explica el **porqué**. Ver ocho barras en cero comunica más que cualquier cifra.

---

### D · Mezcla de A + C  ← **la que más le gustó a Axel**
El esqueleto aprobado:
- Encabezado en una línea: nombre, pendientes, y las dos acciones
- Tres cifras con jerarquía (no seis chips)
- Filtros de estado y vendor en un solo renglón, separados por una línea
- Lista con los dos grupos de A, adelgazada a tres columnas
- Panel lateral de C con el contexto

**Regla de reparto que funcionó:** en la tabla solo lo que sirve para **comparar entre filas** (nombre, señales, progreso, impacto). Lo que solo tiene sentido de un artículo a la vez (promedio, historial, porqué, acción) se va al panel.

**Decisiones tomadas:** la acción vive solo en el panel, no en cada fila, para no tener 48 botones idénticos. Las señales ("Ran out 8×", "Erratic") sí se quedan en la tabla porque determinan a cuál fila le das click.

---

### E · Triaje: rutina contra criterio
**Descartada por Axel — demasiado minimalista.** Se anota porque la idea de fondo puede servir en otro formato.

La premisa: hoy la pantalla pide 48 decisiones, pero el sistema ya sabe qué recomienda. La pregunta real no es "¿cuáles aplico?" sino "¿hay alguno que NO deba aplicar tal cual?". Separar los ~45 rutinarios (producto estable, sin quiebres, movimiento de un punto) de los ~3 con señales en conflicto.

**Lo rescatable:** la noción de "señales en conflicto" como criterio de priorización, aunque no se use para esconder el resto.

---

## Capacidades nuevas propuestas

Todas usan datos que la app **ya tiene**. Ninguna requiere columnas ni tablas nuevas.

### 1. Ventana de orden ⭐ (la de mayor valor)

`vendor_orders` guarda las fechas de cada orden, así que se puede calcular **cada cuándo surte realmente cada proveedor**. Cruzando eso con los días de cobertura:

> "Tito's se acaba en 4 días, pero LOOP no entrega hasta el lunes — ordénalo hoy o te quedas seco tres días."

**Por qué importa:** estar bajo par no es urgente si tu proveedor llega mañana; sí lo es si llega en dos semanas. De 31 artículos bajo par, probablemente solo 2-3 son problema hoy. Convierte una lista de 31 en dos decisiones reales.

**Datos:** `vendor_orders.created_at` agrupado por vendor · `on_hand / (avgUsed/7)`

---

### 2. Par según frecuencia de entrega

Hoy el óptimo es `avgUsed × 1.35` para **todos**, sin importar cada cuándo llega ese proveedor. Si uno entrega cada dos semanas, ese producto necesita cubrir el doble de tiempo.

**Por qué importa:** es un supuesto de fondo que afecta las 258 recomendaciones, no un caso borde.

**Cuidado:** cambiar la fórmula base mueve todos los números a la vez. Conviene mostrar el antes/después antes de aplicar.

---

### 3. Deriva de precios → COGS

`vendor_order_items` guarda el `unit_price` de cada orden desde siempre. Comparando en el tiempo:

> "Tu COGS de vino subió 2 puntos y el 60% viene de aumentos de Wine Merchant, no de que estés sirviendo más."

**Por qué importa:** conecta Pour-IQ con Cost Report. Hoy ves el COGS subir sin saber si es volumen o precio — que son dos problemas con dos soluciones distintas.

---

### 4. Sobrecompra: ordenado contra usado

Los snapshots guardan `ordered` y `used`. Un artículo donde consistentemente ordenas más de lo que usas es una fuga **distinta** a tener el par alto.

Caso real detectado: **Casamigos Tequila — 14 unidades compradas, 0 vendidas, $378 gastados.** Aparece como "sobre par" pero el diagnóstico correcto es "deja de comprarlo".

---

### 5. Dinero en el anaquel

`sum(on_hand × value)` en toda la barra, y cuánto de eso está por encima del óptimo.

> "$18,400 en el anaquel · $2,100 arriba de lo óptimo"

**Por qué importa:** dimensiona el problema en dinero, no en número de filas.

---

### 6. Acumulado liberado y proyección

Cuánto se ha liberado desde que se empezó a usar Pour-IQ, y cuándo converge todo al ritmo de un paso por semana.

> "Liberado: $1,240 en 8 semanas · Todo en objetivo el 12 de octubre · 37% convergido"

**Por qué importa:** con ajustes de uno en uno, sin un horizonte el esfuerzo parece infinito. Y hoy no hay forma de saber si la herramienta está sirviendo.

---

### 7. Sesgo por categoría

`inventory_items.category` existe y Pour-IQ lo ignora por completo.

> "Tu vino corre 22% arriba del óptimo; el licor está en su lugar."

---

### 8. Producto muerto agrupado

> "$430 congelados en 9 artículos sin movimiento en 8 semanas"

Con la acción de dejar de cargarlos, que hoy no existe en ninguna parte de la app.

---

### 9. Simulación

> "Si aplicas los 48: el inventario baja de $18,400 a $16,300 y el COGS debería mejorar ~0.8 puntos."

Conecta la decisión de par con el número por el que te miden.

---

## Pendientes de Pour-IQ que vienen de antes

- **Merma con precio** — hoy se muestra el % servido sin vender, pero no cuánto dinero representa.
- **Tendencia de merma** — avisar cuando empeora, comparando semanas recientes contra anteriores.
- **Bloquear subidas de par** mientras la fuga esté abierta, para no financiar el problema.
- **3 productos partidos por código** — `Angel's Envy`, `Hendrick's Gin`, `Crown Russe Vodka` y compañía tienen snapshots con códigos distintos (`""` vs código real), así que sus semanas se cuentan por separado. Arreglo: agrupar solo por `item_name`, que es lo que la restricción de unicidad de la tabla ya trata como identidad.

---

## Por verificar antes de construir

- **Usage marca 43.8% servido sin vender.** Si es cierto es mucho dinero; también podría ser que pocos artículos tengan el cruce con `theoretical_sales` y el promedio salga inflado.
- **Ordering dice $0 pendiente con 0 vendors** mientras Inventory dice 73 por ordenar. Sospecha: los artículos ya están marcados como ordenados esta semana.

---

## Orden sugerido si se retoma

1. **Esqueleto D** — el rediseño visual aprobado. Bajo riesgo, no cambia ningún cálculo.
2. **Capacidad 1 (ventana de orden)** — la de mayor valor por esfuerzo. Requiere calcular frecuencia por proveedor.
3. **Capacidad 4 (sobrecompra)** — sale de datos ya en memoria.
4. **Capacidad 5 y 6** — dinero en anaquel y acumulado liberado.
5. **Capacidad 2 (par por frecuencia)** — la más delicada: mueve todas las recomendaciones a la vez.

---

# Parte 2 — Pour-IQ dentro de Ordering

**Fecha:** 5 de agosto 2026 · **Estado:** propuesta acordada, nada implementado.

Esta es la parte que Axel priorizó: **no rediseñar la pantalla de Pour-IQ, sino integrarlo en el momento de colocar la orden**, para reducir gasto innecesario con los datos que la app ya recolecta.

---

## La idea de fondo

La orden que estás por colocar es una decisión de par hecha concreta. Si el par está mal, ahorita mismo estás pidiendo la cantidad equivocada — y a diferencia de ajustar el par, que surte efecto la próxima semana, **la orden es dinero que sale hoy**.

Hoy Pour-IQ te dice después lo que debiste haber hecho. Integrado en Ordering, te lo dice **antes de gastarlo**.

---

## Restricciones que Axel estableció

Estas cierran el diseño. No inventar alrededor de ellas.

1. **Todas las órdenes se colocan los lunes, sin excepción.** Siempre cubres lunes a lunes. La ventana es fija: 7 días. El día de entrega de cada proveedor es irrelevante.
2. **Nunca modificar cantidades automáticamente.** Solo avisar. Él decide.
3. **La mayoría de las veces envía lo que la app propone**, y ajusta una o dos líneas cuando algo se ve raro.
4. **El chip de Pour-IQ no se toca.** Ni su texto ni su lugar — si crece, se va a una segunda línea. Sigue abriendo el modal con el análisis y el historial.
5. **Conservar las columnas actuales.** `ON HAND` y `SUGGESTED` sirven para la comparación mental rápida contra lo que ordena. No eliminarlas.
6. **El panel lateral NO puede ser más alto que la tabla.** Altura fija.
7. **No reducir el tamaño del texto** al angostar columnas.

---

## El cálculo: cobertura, no par

```
cobertura (días) = (existencia + cantidad pedida) ÷ (uso semanal ÷ 7)
```

**Por qué no es lo mismo que el par.** El par dice cuánto deberías tener; la cobertura dice si con lo que tienes más lo que pides llegas al lunes. Puedes tener el par correcto y aun así pedir de más porque ya te quedaba existencia.

Caso real: White Haven tiene 12.52 en existencia y usa 8.1 por semana — **con lo que hay ya llegaba al lunes**. Las 12 que propone la app son enteramente adelanto, aunque el par de 24 esté bien.

### El colchón lo decide la volatilidad

Pour-IQ ya calcula la desviación estándar y el historial de quiebres. Eso define cuánto margen necesita cada artículo:

| Tipo | Colchón sugerido |
|---|---|
| Estable | ~1.15 semanas (8 días) |
| Errático o con quiebres previos | ~1.6 semanas (11 días) |

**Sin esto el recorte es peligroso.** Cinzano queda en 2.4 semanas y NO debe marcarse como exceso, porque su consumo varía ±180%. White Haven en 3.0 sí, porque es estable.

⚠️ **Los números 1.15 y 1.6 los propuso Claude, Axel no los confirmó.** Definirlos antes de construir: de eso depende cuántas líneas salen marcadas. Si el umbral es muy sensible, la mitad de la tabla queda en ámbar y se vuelve ruido.

### Zonas de color

- **Rojo** — menos de ~6.5 días: no llega al lunes
- **Verde** — entre ~6.5 y 9 días: cubre la semana
- **Ámbar** — más de ~9 días: compra adelantada

La zona verde es un rango, no un punto. Si fuera exacto, casi nada saldría verde.

---

## Cambios en la tabla

### Angostar sin quitar columnas ni encoger la letra

Anchos actuales (`styles/app.css`, líneas 64-70):

| Columna | Hoy | Propuesta |
|---|---|---|
| vendor | 11% | igual (ya se oculta al filtrar) |
| badge | 5% | 4% |
| item | 34% | ~42% |
| on hand | 10% | 8% |
| suggested | 10% | 8% |
| to order | 12% | ~14% |
| final order | **18%** | ~11% |

Dos cambios concretos:
- **El input de Final Order mide 110px fijos** (`style="width:110px"` en `index.html`). Solo escribes números de una o dos cifras. Baja a ~40px, y el botón Auto se compacta.
- **El relleno de celda es `padding:10px`** (`styles/tables.css` línea 2). En las cuatro columnas numéricas baja a `10px 4px` — el vertical intacto, así que ni el renglón ni la letra cambian.

El ancho recuperado se va al nombre del artículo, que hoy se parte en dos líneas con nombres largos.

### La barra de cobertura vive DENTRO de la celda de To Order

Sin columna nueva:
- Arriba: la píldora con la cantidad (ya existe), coloreada por estado
- En medio: barra de ~5px con una **marca vertical = el lunes que vuelves a ordenar**
- Abajo: **una sola palabra** — `Thu`, `Mon`, `Aug 25`

### La barra es dinámica ⭐

Al escribir en el campo de Final Order, la barra, el día, la píldora, el subtotal y los avisos del panel se actualizan al instante.

**Esto no es adorno: resuelve la ambigüedad sin texto.** Al mover el número y ver responder la barra, queda evidente que mide lo que vas a ordenar, no lo que tienes. La interacción lo demuestra mejor que cualquier explicación.

---

## Lenguaje: la ambigüedad detectada

Axel identificó un problema real. **"Runs out Thursday" se puede leer de dos formas opuestas:**
- ¿Con lo que voy a ordenar, me quedo sin producto el jueves?
- ¿Si no ordeno, me quedo sin producto el jueves?

Son consejos contrarios: uno dice "ordena", el otro "ordena **más**".

**Solución:** el sujeto siempre es el usuario, y el momento siempre es después de que llegue la orden.

| Ambiguo | Sin ambigüedad |
|---|---|
| Runs out Thursday | **You're covered to Thursday** |
| Lasts past Aug 25 | **You're covered past Aug 25** |
| Covers the week | **You're covered all week** |
| +$41 | **$41 you could hold** — lo compras de nuevo el lunes |
| −7 | **7 bottles short** |
| avg cover 1.9 wks | **This order lasts ~13 days**, you reorder in 7 |
| right-sized $267 | **Just the week: $267** |

**En la tabla no cabe la frase completa** — ahí va solo la palabra (`Thu`). La frase completa vive en el panel y al pasar el mouse.

**Arriba de 14 días muestra fecha** (`Aug 25`) en vez de día de la semana: `Thu` a tres semanas no significa nada.

---

## El panel lateral

### Restricción: altura fija

Para que quepa lo nuevo sin crecer, hay que comprimir lo que ya está:
- `Items` y `Bottles` de dos renglones a una línea, junto con la cobertura promedio
- `Last order` de cuatro líneas a una: `$467.81 · ↘$17` con la fecha

### Estado por defecto

- Encabezado del vendor (como está)
- Una línea: `14 items · 50 btl · lasts 13 days`
- **Avisos**, con nombre y monto — nunca "6 líneas" a secas, eso es muy vago para decidir
- Los tres de mayor impacto; el resto agrupado en `+N más · $X ›`
- `Last order` comprimido
- Subtotal + `just the week: $267`
- Place & send

**Los rojos siempre van arriba de los ámbar**, aunque el monto sea menor: quedarte sin producto pesa más que adelantar dinero.

### Estados de detalle

Al tocar un aviso, el panel **cambia de contenido** (no crece). Lista completa con nombre, cobertura y monto, con scroll interno, y abajo:

> **Show these N in the table** — filtra la tabla a esas líneas para ajustarlas ahí mismo.

El panel dice qué pasa; la tabla deja arreglarlo.

### Aviso de ignorados ⭐

**Los artículos con `orderOverride = 0` no se renderizan en la tabla** — `getOrderRowsForVendor()` filtra por `effective > 0`. No están escondidos: no existen en pantalla. **El panel es el único lugar donde se puede avisar.**

El aviso va **triado por riesgo**, no como lista plana:

```
Ignoring this week — set to zero, not in the table

  Grey Goose    11/wk · you run out Wed     [Restore]   ← rojo
  Aperol        0.4/wk · lasts 5 weeks      [Restore]
  Campari       0.9/wk · lasts 3 weeks      [Restore]

  Two are fine to skip. Grey Goose isn't —
  you'd be dry before Monday.
```

En el resumen aparece como **`Ignoring 3 · 1 risky`**. Si ninguno fuera riesgoso, diría solo `Ignoring 3` en gris.

**Por qué el triaje importa:** si los tres se vieran igual, aprenderías a ignorar el aviso completo — que es exactamente lo que pasa hoy con el contador de excluidos.

---

## Preguntas abiertas antes de construir

1. **¿Los umbrales de colchón (1.15 / 1.6 semanas) son correctos?** Definen cuántas líneas salen marcadas.
2. **¿El override 0 es permanente o por semana?** Si Axel lo usa para productos que ya no carga, el aviso de ignorados le va a estorbar cada lunes. Podría necesitar un "no volver a avisar de este".
3. **¿Dónde va el bloque nuevo del panel** — arriba del "Last order" (donde está en la maqueta) o abajo, junto al botón?

---

## Orden de construcción sugerido

Esto toca `render()`, que es lo más frágil de la app.

1. **El cálculo de cobertura**, sin tocar la UI. Verificar contra la realidad de Axel.
2. **El panel lateral** con los avisos y sus vistas de detalle. No toca la tabla.
3. **La barra dinámica** dentro de la celda de To Order.
4. **El angostado de columnas.** Al final, cuando todo lo demás esté confirmado.
