-- ─────────────────────────────────────────────────────────────────────
-- 011 · El conteo en curso, visible desde cualquier dispositivo
-- ─────────────────────────────────────────────────────────────────────
--
-- La sesión de conteo vive en localStorage, y eso está bien: sobrevive a
-- que Safari descarte la pestaña, a que se bloquee el teléfono y a
-- quedarse sin cobertura, que son los tres casos que hay que aguantar en
-- una bodega.
--
-- Lo que NO puede vivir solo en el teléfono es el HECHO de que hay un
-- conteo abierto. El botón del ciclo decide qué ofrecer leyendo la nube,
-- así que con el estado en un único dispositivo pasaba esto:
--
--   Axel cuenta con su teléfono. En el iPad, el botón sigue diciendo
--   "1 · Start new cycle". Alguien lo pulsa. El on hand se va a cero
--   mientras el conteo sigue en marcha.
--
-- Esta columna es la señal compartida. No guarda el conteo —eso sigue en
-- el teléfono que cuenta— sino que hay uno y desde cuándo.
--
-- ── Por qué una marca de tiempo y no un booleano ─────────────────────
--
-- Un conteo empezado hace veinte minutos y uno empezado el jueves pasado
-- son cosas distintas. Con la fecha, el botón puede decir "contando desde
-- hace 20 min" y, pasados tres días, cambiar a "abandonado" y ofrecer
-- descartarlo. Con un booleano solo se puede decir que hay algo, y un
-- conteo olvidado bloquearía el ciclo para siempre.
--
-- ── Quién la escribe ─────────────────────────────────────────────────
--
--   se pone   al guardar el PRIMER artículo de una sesión
--   se borra  al cerrar el conteo, y al descartarlo
--
-- Se pone en el primero y no al abrir el escáner a propósito: abrir la
-- cámara, mirar y salir sin escanear nada no es un conteo, y dejaría el
-- ciclo bloqueado por un gesto que no hizo nada.

alter table public.locations
  add column if not exists counting_since timestamptz;

comment on column public.locations.counting_since is
  'Cuando empezo el conteo por escaneo que esta abierto ahora. NULL = no hay ninguno. El conteo en si vive en el dispositivo; esto solo avisa al resto de pantallas de que existe.';
