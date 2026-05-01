# BarStock Backend Logging

## Status

Backend logging is active through Vercel.

## Endpoints

- `/api/health`
- `/api/log`
- `/api/validate-order`

## Frontend modules

- `src/logger.js`
- `src/order-validator.js`

## Active logged events

- `quick_order_saved`
- `quick_order_validation_warnings`
- `place_order_saved`

## Current behavior

Logging is passive. It does not block order saving.

Order validation is passive. It reports warnings but does not block saving.

## Backend URL

Configured in `src/config.js`:

`https://barstock-app.vercel.app`

## Notes

GitHub Pages hosts the frontend.
Vercel hosts backend API routes.
Supabase remains the database and realtime provider.

## Persistent storage

Backend logs are now persisted to Supabase table:

- `public.app_logs`

The `/api/log` endpoint writes to Supabase using:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Both are stored as Vercel environment variables and must never be exposed in frontend code.

## Verified

Test event confirmed:

- `db_test`

Flow verified:

Frontend/curl → Vercel `/api/log` → Supabase `app_logs`
