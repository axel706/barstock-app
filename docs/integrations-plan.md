# Integraciones: MarginEdge y Toast — plan

Acceso concedido a ambas APIs el 26 oct 2026. Se empieza por **MarginEdge
completo**, Toast después.

## Regla que no se rompe

`barstock-app` es un repositorio **público**. Ninguna credencial entra en el
repo, ni en `src/config.js`, ni en un archivo ignorado por git. Van en
variables de entorno de Vercel y sólo las leen las funciones de `api/`. El
navegador nunca ve una clave. Mismo patrón que `ANTHROPIC_API_KEY`.

Una clave que entra una vez en git queda en el historial para siempre y hay
que rotarla.

## Reparto de datos

|                                   | MarginEdge | Toast |
|-----------------------------------|------------|-------|
| Catálogo (nombre, vendor, categoría) | Sí      | No    |
| Compras: qué, cuánto, precio pagado | Sí       | No    |
| Ventas por artículo                | No         | Sí    |
| **Conteo de inventario**           | **No**     | **No** |

El conteo es lo único que ninguna de las dos tiene. Es lo que hace BarStock.
Las APIs no compiten con la app, la alimentan.

Confirmado: el reporte de ventas que se sube hoy trae **botellas/productos**,
no tragos de menú. Toast enchufa directo cuando llegue su turno — no hacen
falta recetas.

## Lo que no hay que construir

La app ya calcula todo esto en `theoretical-usage.js`:

    used     = on_hand_inicial + recibido − on_hand_final
    variance = used − sold
    loss     = variance × coste

Hoy `recibido` y el coste entran escaneando facturas; `sold`, subiendo un CSV.
Las APIs sustituyen esas dos entradas manuales. **No hay pantalla nueva que
inventar**: Consumption Match, Cost Report y Pour·IQ se llenan solos.

## El problema que sí resuelven

`soldFor()` empareja nombres del POS con nombres de inventario: exacto →
alias → **subcadena difusa**. De ahí salen `sales-fix.js`, la tabla
`sales_overrides` y los 94 UNKNOWN.

Con las APIs se guarda el **ID de MarginEdge** y el **GUID de Toast** en cada
artículo. Se empareja una vez, a mano, y nunca más. Ese es el premio real.

---

# MarginEdge

## La API, verificada contra la real (26 oct 2026)

- Base: `https://api.marginedge.com/public`
- Auth: cabecera `x-api-key`
- Sólo lectura (GET). Imposible dañar datos en MarginEdge desde aquí.
- Paginación por cursor `nextPage`, 100 registros por página.
- **Una ruta que no existe contesta `403 Missing Authentication Token`, no
  404.** Es AWS API Gateway no confirmando qué rutas tiene. El mensaje suena
  a problema de credenciales y no lo es.

### Rutas que existen

| Ruta | Devuelve |
|---|---|
| `/restaurantUnits` | `id`, `name` |
| `/categories` | `categoryId`, `categoryName`, `categoryType`, `accountingCode` |
| `/products` | `companyConceptProductId`, `centralProductId`, `productName`, `categories[{categoryId, percentAllocation}]`, `itemCount`, `taxExempt`, `reportByUnit`, `latestPrice` |
| `/vendors` | `vendorId`, `centralVendorId`, `vendorName`, `vendorAccounts[{vendorAccountNumber}]` |
| `/orders?startDate&endDate` | Cabeceras: `orderId`, `createdDate`, `vendorId`, `vendorName`, `customerNumber`, `invoiceNumber`, `invoiceDate`, `paymentAccount`, `status`, `orderTotal` |
| `/orders/{orderId}` | Líneas: `vendorItemCode`, `vendorItemName`, `companyConceptProductId`, `categoryId`, `packagingId`, `unitPrice`, `quantity`, `linePrice` |

`/orders` exige `startDate` y `endDate`; sin ellos, 400.

### Rutas que NO existen

`/packaging`, `/packagings`, `/vendorItems`, `/vendors/items`, `/units`.

### El filtro de bebida

`categoryType` en The Crown Tavern reparte así las 94 categorías:

    OTHER 59 · LABOR 14 · FOOD 8 · BEER 7 · LIQUOR 4 · NA_BEVERAGES 1 · WINE 1

**13 categorías de bebida.** Un producto entra si alguna de sus
`categories[].categoryId` es de tipo BEER, LIQUOR, WINE o NA_BEVERAGES. Así el
catálogo del restaurante entero (incluye comida, químicos y desechables —
el primer producto que salió fue film de cocina) se reduce a la barra.

### El ancla

`companyConceptProductId` aparece **en el catálogo y en las líneas de
factura**. Un solo emparejado sirve para las dos cosas.

### Lo que no resuelve la API: el empaque

Una línea dice `quantity: 6` y `packagingId: 12345`, y no hay forma de
preguntar qué es ese empaque. Seis botellas y seis cajas de doce son el mismo
número en pantalla y un error de 1200 % en el inventario. El total en dinero
cuadra con la factura igual, así que el fallo no se delata solo.

Se resuelve preguntando una vez por empaque y recordando la respuesta, con una
propuesta calculada de `unitPrice ÷ latestPrice`. Ver paso 2.

### Decisiones tomadas con los datos reales delante

- **Sólo facturas cerradas.** De 308 en 30 días: 266 `CLOSED`, 29
  `PENDING_APPROVAL`, el resto en revisión. Una pendiente todavía puede
  cambiar de cantidad o precio, y un precio provisional metido en el coste de
  mercancía no lo vuelve a mirar nadie.
- **Fecha: `invoiceDate`, y `createdDate` cuando venga nula** (12 de 308 lo
  están). Hay una factura fechada en abril: sin esta regla aterrizaría en un
  ciclo cerrado hace medio año.
- **Filtrar por producto, no por proveedor.** Los 53 proveedores incluyen
  mayoristas que traen comida y bebida en la misma factura.

### Un cabo suelto

`/vendors` cortó el recorrido a las 4 páginas con el cursor aún activo. Con 53
proveedores no debería paginar tanto. Cuando la sincronización sea automática,
un recorrido que para a la mitad son facturas que no entran, y en silencio:
hay que registrar y avisar cuando una pasada quede incompleta.

## Variables de entorno en Vercel

    MARGINEDGE_API_KEY      la clave emitida para el restaurante
    MARGINEDGE_UNIT_ID      el restaurant unit de Crown Tavern — Concord

## Fases

1. **Conectar y leer.** `api/marginedge.js` con acciones `ping`, `products`,
   `vendors`, `invoices`. Botón "Probar conexión" en Ajustes → Integraciones
   que muestra crudo lo que llega. **No escribe nada en Supabase.** Con los
   datos reales delante, el resto deja de ser suposición.
2. **Emparejar IDs.** Pantalla de una sola vez: artículos de BarStock a la
   izquierda, productos de MarginEdge a la derecha, con sugerencias por
   nombre. Guarda la decisión.
3. **Compras automáticas.** Las facturas llenan `recibido` y actualizan el
   coste. Sustituye el escaneo de facturas.
4. **Sync programado.** Cron de Vercel por la noche + botón de "sincronizar
   ahora". Registro de la última sincronización.

## Dónde vive esto

**Sólo escritorio.** Emparejar catálogos y definir empaques son tablas anchas,
dos columnas enfrentadas y un rato largo de decisiones: en el teléfono no se
hace bien. El grupo "Connections" de la portada de Ajustes lleva
`soloEscritorio: true` y no se pinta cuando el shell móvil está montado.

Lo que sí llega al móvil es el **resultado**: cuando las facturas entren solas,
Consumption Match y el coste de mercancía se llenan igual en las dos versiones.

## SQL que hay que correr (fase 2, no antes)

    alter table inventory_items add column if not exists marginedge_id text;
    alter table inventory_items add column if not exists toast_guid text;
    create index if not exists inventory_items_me_id
      on inventory_items (location_id, marginedge_id);

## Cómo se muestra

Casi todo aparece solo en las pantallas existentes. Lo nuevo:

- **Ajustes → Integraciones**: estado de cada conexión, última sincronización,
  cuántos artículos sin emparejar.
- **Chip de origen** en las cifras: si `recibido` vino de MarginEdge o de una
  factura escaneada, que se vea. Cuando un número se empieza a llenar solo,
  hay que poder saber de dónde salió.

## Siguiente paso concreto

Poner las dos variables en Vercel y redeploy. Sin eso, la fase 1 no arranca.
