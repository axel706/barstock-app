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

## Lo que se sabe de la API

Pendiente de verificar contra el portal de desarrollador (lo de abajo viene de
perfiles de terceros, no de la documentación oficial):

- Base: `https://api.marginedge.com/public`
- Auth: cabecera `x-api-key`
- **Sólo lectura (GET).** Imposible dañar datos en MarginEdge desde aquí.
- Paginación por cursor opaco: parámetro y campo `nextPage`
- APIs publicadas: Orders (facturas y pedidos), Products, Categories, Vendors,
  Restaurant Units
- Rate limits no publicados; los aplica AWS API Gateway por clave

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
