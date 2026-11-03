-- ── De dónde salió cada enlace ──────────────────────────────────────
--
-- `invoice_order_links` guardaba sólo enlaces hechos a mano, así que
-- no hacía falta decir quién los puso. Ahora también los escribe el
-- calculador automático, y la diferencia importa en tres sitios:
--
--   · Un enlace a mano NUNCA se sobrescribe. Lo dijo quien estuvo
--     ahí, y eso gana sobre cualquier regla.
--   · Un 'auto' equivocado se puede borrar en bloque sin tocar los
--     tuyos:
--
--       delete from public.invoice_order_links where origen = 'auto';
--
--   · Y si mañana se cambian los pesos, se puede rehacer sólo lo que
--     calculó la máquina.
--
-- Las filas que ya existen son todas a mano: cuando esto se escribe,
-- el calculador no ha guardado nada todavía. Por eso el default es
-- 'manual' y no 'auto' — marcar como automático algo que decidió una
-- persona sería mentir sobre su origen, y encima dejaría ese enlace
-- expuesto al borrado en bloque de arriba.

alter table public.invoice_order_links
  add column if not exists origen text not null default 'manual';

-- Para el borrado en bloque y para contar cuántos puso cada uno.
create index if not exists invoice_order_links_origen
  on public.invoice_order_links (location_id, origen);
