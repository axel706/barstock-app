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
