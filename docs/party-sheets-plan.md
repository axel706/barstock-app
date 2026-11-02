# Party Sheets — plan (pausado 26 oct, retomar jueves)

Subir los kitchen sheets de los eventos de la semana, leerlos y sacar un resumen
que oriente las compras. **Nada implementado todavía.** Esto es sólo lo acordado.

## Decidido

- **Entrada:** opción `UPLOAD PARTY SHEETS` dentro del botón Upload del header
  (escritorio), selección múltiple de PDFs.
- **Campos:** fecha, tipo de evento, área, nº de invitados (el del encabezado,
  `EVENT SUMMARY`), y el paquete de BEVERAGE con lo que incluye.
- **Alcance día uno:** orientación, no matemáticas. Cuánta gente, qué paquetes,
  y qué categorías/productos van a sufrir. El consumo estimado (tragos por
  persona por hora) se construye más adelante, con aprendizaje.
- **Los términos se aprenden preguntando.** Cuando aparece un término nuevo
  ("house wine", "house liquor highballs"), la app pregunta una vez a qué
  productos corresponde y lo recuerda. Editable después en Ajustes.
- **Salida en móvil:** un tab en el carrusel de Home con el resumen; al pulsarlo,
  pantalla completa.

## Pendiente de decidir

- La ventana del resumen: ¿el ciclo abierto, los próximos 7 días, o todo
  agrupado por semana? (quedó sin responder)

## Hallazgo que justifica el aviso de discrepancia

En el PDF de ejemplo (Crown Tavern, 10/29) el `EVENT SUMMARY` dice **33
invitados**, pero `SPECIAL INSTRUCTIONS` dice:

> first two hours buffet & open Bar (**32 ppl**) … last two hours welcome party
> & Cash Bar (**97 ppl**)

El número oficial sigue siendo 33, pero el modelo lee el documento entero de
todos modos, así que marca la discrepancia en el evento. Comprar para 33 una
noche de 97 es el error que esto evita.

## Qué hay que construir (poco)

1. `pdfjs-dist` por CDN en `index.html` — la app tiene `jspdf` (escribe) pero
   nada que lea PDFs. El PDF no sale del navegador, sólo su texto.
2. `api/party-sheets.js` — mismo molde que `api/categorize.js` y
   `api/weekly-briefing.js`: `ANTHROPIC_API_KEY` desde Vercel, contrato de JSON
   estricto, **una sola llamada** con el texto de todos los documentos.
3. Tabla `party_events` en Supabase (+ mapeo de términos aprendidos). SQL para
   que lo corras tú.
4. UI: entrada en el menú de Upload, diálogo de aprendizaje, pantalla de
   resumen, tab en Home móvil.

## Mockups

`party-1-upload-learn.html` y `party-2-summary.html` (carpeta de salida de la
sesión del 26 oct). Sin aprobar: no los llegó a ver.
