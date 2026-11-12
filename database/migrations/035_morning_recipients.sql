-- ── 035 · A quién va el correo de la mañana ──────────────────────────
--
-- Axel, 2026-11-12: "necesito la posibilidad de mandarlo a más
-- destinatarios", con su propia lista, aparte de la del informe de
-- costes (report_recipients). Se escribe en Settings › Emails; el
-- servidor la lee al mandar (lib/morning-report.js), nunca la toma de
-- lo que mande la app.
--
-- Direcciones separadas por comas, como report_recipients. Vacía = nadie
-- más que quien lo manda a mano.

alter table public.location_settings
  add column if not exists morning_recipients text not null default '';
