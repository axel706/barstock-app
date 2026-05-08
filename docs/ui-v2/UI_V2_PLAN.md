# BarStock UI V2 Plan

## Goal

Build a new UI in parallel without depending on legacy UI markup, legacy CSS, or legacy render functions.

## Rules

1. Legacy UI stays stable until each V2 section is complete.
2. UI V2 uses existing cloud modules and state/events.
3. UI V2 must not depend on legacy HTML structure.
4. Each section is migrated, tested, then the legacy section is removed.
5. No big-bang rewrite.

## Migration Order

1. Inventory V2
2. No Match V2
3. Orders / Order History V2
4. Quick Order V2
5. Exports / Tools V2
6. Legacy cleanup

## Shared Dependencies

- src/events.js
- src/inventory-cloud.js
- src/no-match-cloud.js
- src/orders-cloud.js
- src/quick-order.js
- src/place-order.js
- src/supabase-client.js

## Do Not Depend On

- legacy render()
- legacy table DOM
- legacy section markup
- legacy app.css components
