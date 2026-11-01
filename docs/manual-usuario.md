# Manual de usuario · borrador

Texto aprobado del manual que vivirá dentro de la app, en **More › Help**.
Una sola pieza, nueve secciones, el índice cabe en una pantalla y se abre una
sección a la vez.

El texto va en inglés porque la interfaz va en inglés. Las notas de proceso,
en español, como el resto del repo.

---

## Dónde nos quedamos

| # | Sección | Estado |
|---|---------|--------|
| 0 | What this app does for you | **texto aprobado** · sin capturas (es conceptual) |
| 1 | Getting around | **texto aprobado** · capturas listas en `assets/help/` |
| 2 | The weekly cycle | **texto aprobado** · faltan 3 capturas |
| 3 | Counting | **texto aprobado** · faltan 4 capturas |
| 4 | Your bottles | **texto aprobado** · faltan 2 capturas |
| 5 | Orders | sin empezar |
| 6 | Invoices and prices | sin empezar |
| 7 | Settings | sin empezar |
| 8 | When something looks wrong | sin empezar |

**Lo siguiente:** redactar la 5 · Orders.

### Capturas que faltan

Las toma Axel desde el teléfono. Se guardan en `assets/help/`, reescaladas a
820px de ancho y por debajo de 90 KB (ver las dos que ya están).

**Sección 2 · The weekly cycle**
- la tarjeta del ciclo en *Step 1 of 3*
- la misma en *Step 2 of 3*
- la pantalla del ciclo con los tres pasos y sus fechas

**Sección 3 · Counting**
- el escáner con los chips de zona arriba
- el panel de contar: sellada + abierta
- el mismo con dos abiertas y los chips *Bottle 1 of 2*
- la pregunta de *Finish count* (dejar como estaban / poner a cero)

**Sección 4 · Your bottles**
- la lista con el segmentado *Need fixing / Everything*
- la ficha de una botella **que tenga sugerencia de Pour·IQ** visible

### Decisiones tomadas

- **Uno solo y completo**, no dos documentos por tipo de lector.
- **Vive en la app**, no en un PDF: un papel en la barra sigue diciendo lo de
  antes el día que cambiemos algo.
- **Una sección abierta a la vez**; el índice siempre visible.
- Cada sección dice **qué es, para qué y dónde**. La ruta va resaltada.
- La captura va **antes** de la lista que explica sus partes.
- Las imágenes **se cargan al abrir su sección**, no al entrar al manual.

### Pendiente de decidir

- Si la sección 0 sale sola la primera vez, y qué hacer entonces con
  `src/onboarding.js`, que ya ocupa ese hueco con otra bienvenida.
- Un test que compruebe que las rutas que nombra el manual siguen existiendo
  —igual que el de los consejos rechaza "las órdenes son solo de escritorio"—.

---

# 0 · What this app does for you

BarStock keeps track of what is on your shelves, how much you really go
through, and what to order — so you stop guessing and stop running out of the
things that sell.

### The words you will see

**On hand** is how many you have right now. It comes from one place only:
**counting**. Not from orders, not from invoices, not from what you type into
an order. You count, it changes; until then it stays where the last count left
it.

**Par** is how many you want to have. You set it, and after a few weeks the app
starts suggesting its own.

**What to order** is the gap between those two. That is the whole machine.

### What it does

**It knows your stock because you count it.** On hand is never a guess.

**It learns what you use.** The difference between two counts, plus whatever
came in between them, is your real usage. Week after week that becomes a
pattern, and the app starts telling you which bottles you keep running out of
and which ones just sit there.

**It tells you what to order.** Pick a vendor, look over the list, send it. The
order goes out as an email with its PDF, and it stays in your history so you
can resend or reopen it.

**Your costs stay current.** Invoices come in by themselves from MarginEdge.
When one brings a price different from yours, the app asks you before changing
anything.

### The one habit it needs

**Count once a week, on the same day.** That is the whole deal. Everything
else — the suggestions, the costs, what is running out — is built on the gap
between one count and the next, so an irregular week throws it off.

### What it does not do

It does not watch your register. If you want to compare what you sold against
what actually left the shelf, you upload the week's sales and the app does the
comparison — but it will not know on its own.

---

# 1 · Getting around

> captura: `assets/help/barra-abajo.jpg`

Five places, and the bar at the bottom is all of them.

**Home** — what needs your attention today. The cards at the top move with the
week: the cycle, orders waiting, what came in. Under them, what you spent and
what is sitting on the shelf, and the bottles moving fastest.

**Inventory** — every bottle you have. Search it, fix a par or a price, change
a vendor. This is the list the rest of the app works from.

**The green button** — counting. It is the middle of the bar because it is what
you do most. If it is grey, counting does not apply right now; tap it and it
tells you why.

**Orders** — three places in one. **Open** is what is waiting to be ordered,
**Sent** is everything you already sent, and **Invoices** is what actually
arrived.

**More** — Settings and logging out.

### Up top

> captura: `assets/help/cabecera.jpg`

**The bell** tells you what changed while you were away — mostly prices from
new invoices, and anything that needs fixing. A red dot means there is
something.

**The circle next to it** is Settings: who the order emails come from, your
vendors' addresses, zones, how the app looks.

**The name of the bar** at the top right switches locations, if you run more
than one.

---

# 2 · The weekly cycle

The app works in weeks, and every week has the same three steps. Once you see
them, the rest of the app makes sense.

### The very first time

Before any of this, the app needs to know what bottles you have. That is a
one-time load from a spreadsheet, on a computer: **Import › Load master**.
Until it is there, the app is an empty shelf and nothing else works.

After that you set a **par** for the ones you care about — see *Your bottles*.
You do not need all of them on day one.

### The three steps

**Step 1 — Start a new cycle.** This sets every on hand to zero. That sounds
alarming and it is the point: you are about to count, and counting on top of
last week's numbers mixes the two.

**Step 2 — Count the bottles.** Scan your way around the bar. This is the part
that takes time, and it has its own section.

**You do not have to scan.** If you already count on a sheet, the cycle card
has a second button that takes your file — `.csv`, `.xlsx` or `.xls` — and
loads the whole count at once. Same result; the app does not care how the
numbers got there.

**Step 3 — Close the count.** What you counted becomes your stock. The week is
done, and the app now knows what you used since the last one.

### Where you see it

The **cycle card on Home** always shows which step you are on and the button
for it — *Start*, then *Load it*, then *Keep counting*. You never have to go
looking.

The **small icon next to the button** opens the cycle screen, with the three
steps laid out and the dates.

### What the week gives you

Closing a count is what feeds everything else:

- what you **used** this week — the drop since the last count, plus whatever
  arrived
- what to **order**, because now the app knows what is low
- what you **spent**, once the invoices come in
- and, after a few weeks, which bottles you keep running out of

Skip a week and the next count covers two weeks in one. Nothing breaks, but the
"per week" numbers are now per two weeks, and the suggestions get worse.

### Starting over

If a count went badly wrong, **Restart cycle** on Home begins the week again
from scratch. It asks first, and it says how many items go back to zero.

**That is not the same as throwing away a count.** Restarting the cycle resets
the week; discarding a count keeps the week open and only tears up what you
scanned. If you just miscounted, you want the second one — it is in *Counting*.

---

# 3 · Counting

This is the one thing the app really needs from you. Everything else is built
on it.

**Before you start, the cycle has to be open.** If the green button is grey,
counting does not apply right now — and **tapping it offers the way out**. With
no cycle open it offers to start one; with the week already counted it offers
to restart it so you can count again. It never just sits there.

### Your first count

Tap the green button. The camera opens and you point it at a barcode. That is
the whole loop: point, enter what you have, point at the next one.

The first time the app sees a barcode it does not know, it asks **Which item is
this?** Pick it from your list once and it remembers the code forever — the
next count, that bottle is instant.

**No barcode, or a label that will not read?** Tap **Find by name** and search
for it. Nothing gets stuck because of a torn label.

### Sealed and open

For each bottle the panel asks two things.

**Sealed** is how many unopened bottles you have — the − and + buttons.

**Open** is the one in use. You drag on the bottle on screen until the level
matches what you are holding. If the shape on screen is not your bottle, tap
**not this bottle?** and pick the right one — it changes how the level is
measured.

**More than one open?** Tap **+ another open**. A second bottle appears,
starting empty, and you set its level too. The chips above let you move between
them — *Bottle 1 of 3* — and each one has its own remove button. There is no
limit.

Then **Next**, and you are back to scanning.

### Zones

If you set up zones, the chips at the top of the scanner say where you are
counting right now. Tap the one you are in before you start that area.

**The same bottle can be counted in two zones and both count.** Scan it in the
cellar, scan it again behind the bar, and the app adds them up — it does not
overwrite. That is what zones are for.

Zones are optional. Without them everything counts as one place and the totals
are the same; what you lose is knowing where things are.

### Fixing a mistake

**One bad scan:** under the bottle you are counting there is a list of what you
already entered for it. *Tap a scan to fix it*, or use its bin icon to delete
just that one.

**The whole count:** the counting card on Home has a small bin next to *Keep
counting*. That throws away everything you counted and **keeps the cycle
open** — you start the count again, not the week. It asks first, and tells you
how many bottles you are about to lose.

### Stopping and coming back

**Nothing is ever lost.** Close the scanner with the X, hit Pause, lock your
phone, or let the app go to the background — the count is saved on the device
as you go.

When you come back, the Home card says *Count paused*, how many you have done,
how long you have been at it and where your last scan was. **Keep counting**
picks it up exactly where you left it.

**The green button pulses** when a count is open and you are not in it. That is
the app reminding you that you left something half done — it does not pulse
otherwise.

### Finishing

In the scanner, **Finish count**. The app asks what to do with the bottles you
never scanned:

**Leave them as they were** keeps their previous number. This is the normal
answer.

**Set them to zero** is only right if you counted absolutely everything and the
ones missing are genuinely empty.

Then it applies the count, closes the week and tells you how long it took — and
how that compares with last time.

---

# 4 · Your bottles

Everything the app knows about each product lives here. Tap **Inventory**.

### Finding one

Type in the search bar — a few letters of the name or the code. The button next
to it sorts the list: by **name**, by **money on the shelf**, or by **closest
to empty**, which is the one you want the day before an order.

### Need fixing, and Everything

Two tabs at the top.

**Need fixing** is where the app puts the bottles that are missing something —
no vendor, no price, no par. Those three are what make an order work, so a
bottle without them is invisible when it matters. Clearing this tab is the
single most useful hour you will spend in the app.

**Everything** is the full list.

### Inside a bottle

Tap any one and a sheet comes up.

**Vendor** — who you buy it from. Pick one of the chips. Without it the bottle
never joins an order, because the app does not know whose order to put it in.

**Par** — how many you want on the shelf. Below it, once there is enough
history, the app's own suggestion.

**Unit price** — what you pay for one. This is where "money on the shelf" and
the cost of an order come from. If MarginEdge is connected you will rarely type
this yourself: invoices bring it and you approve the change.

### Par, and the app's opinion

You guess the first par. **After about four closed weeks the app has seen
enough** and starts suggesting its own — a line appears saying *Pour·IQ says
9 — use it*, and one tap takes it.

It only speaks when its number is different from yours, and only for bottles
with enough history behind them. A quiet bottle means either your par looks
right or it has not seen enough weeks yet.

### What you will not find here

**On hand.** You cannot type it. It is whatever your last count said, and the
only way to change it is to count again — or, if something arrived off the
books, *Received* (see *Invoices and prices*).
