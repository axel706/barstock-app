# BarStock Architecture

## Current app status

BarStock is currently a frontend-first web app using Supabase directly from the browser.

## Current frontend modules

- src/config.js
- src/events.js
- src/auth.js
- src/inventory-realtime.js
- src/orders-cloud.js
- src/place-order.js
- src/quick-order.js
- styles/auth.css

## Target product architecture

### frontend
User interface, screens, client-side state, rendering, interactions.

### backend
Secure server-side logic for integrations, Gmail API, scheduled tasks, permissions, invoice processing, and future automation.

### database
Supabase tables, policies, migrations, schemas, location/user models.

### shared
Shared validation, types, constants, and business rules used across frontend and backend.

## Rules

1. No feature work before architecture is stable.
2. Every module must declare its dependencies.
3. Realtime updates must go through BarStockEvents.
4. No duplicated cloud/auth/order logic.
5. Frontend UI changes must not touch backend or database logic.
6. Backend changes must not directly alter UI behavior.
