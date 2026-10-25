(() => {
  if (window.BarStockCountPanel) return;

  // ── Panel del artículo ───────────────────────────────────────────────
  //
  // Se abre después de escanear. Dos formas de contar, porque son dos
  // cosas distintas:
  //
  //   SELLADAS  con + y −. Son enteros y se ven de un vistazo. Nada de
  //             teclado: quien cuenta tiene una botella en la otra mano.
  //
  //   ABIERTAS  con el deslizador sobre la silueta de SU botella. La
  //             altura se convierte en volumen usando la geometría real,
  //             que es lo único que distingue esto de estimar por
  //             décimas a ojo.
  //
  // Pueden coexistir varias abiertas: la de la barra y la de la bodega
  // son dos botellas y las dos cuentan. Se guardan por separado para que
  // corregir la segunda no obligue a rehacer la primera.
  //
  // ── Lo que NO hace ──────────────────────────────────────────────────
  //
  // No toca inventory_items. Escribe en la sesión, que vive en el
  // dispositivo. El inventario se actualiza solo al cerrar el conteo, en
  // un paso aparte y con respaldo previo.

  const S = () => window.BarStockCountSession;
  const P = () => window.BarStockBottleProfiles;

  // ── Sumar, no reemplazar ─────────────────────────────────────────────
  //
  // El panel edita UNA pasada, nunca el acumulado. Reescanear un producto
  // abre una pasada nueva en blanco y lo ya contado se queda intacto
  // detrás, porque no es un campo.
  //
  // Antes el panel cargaba el acumulado como valores editables y la
  // pantalla del segundo escaneo era idéntica a la del primero. Contando
  // Tito's de verdad: 0.5 abierta y 1 sellada en el closet, y al escanear
  // en la barra el panel abrió con esos mismos números. Lo natural fue
  // ajustar el 0.5 a 0.7 —la botella que se tenía delante— y con eso se
  // borró la del closet. 3.7 donde iban 4.2.
  //
  // Dos modos, y se distinguen a la vista porque hacen lo contrario:
  //
  //   sumar     `_editIdx === null`   Next AÑADE una pasada
  //   corregir  `_editIdx === 0,1…`   Save REEMPLAZA esa pasada
  //
  // A corregir solo se llega desde la hoja de detalle, a propósito y
  // sabiendo lo que se toca.

  let _row = null;         // artículo de state.master
  let _sealed = 0;
  // ── El paso del deslizador ───────────────────────────────────────────
  //
  // El deslizador devolvia cualquier numero: 0.5237, 0.5241, 0.58. Eso
  // es precision falsa — nadie mira una botella y acierta al 1%. Y la
  // resta de dos lecturas imprecisas es puro ruido: en el historial de
  // Axel, el 12% de las semanas tiene consumo NEGATIVO, que es
  // fisicamente imposible. Casa Noble registro −0.35 +0.27 −0.23 +0.26
  // −0.01 +0.02 en seis semanas sin moverse del estante.
  //
  // Con paso de 0.05 esos valores no existen: la misma botella leida dos
  // veces da el mismo numero, y el ruido desaparece por construccion en
  // vez de por un parche aguas abajo.
  //
  // 0.05 de una botella de 750 son 37 ml, por debajo de lo que se
  // distingue a ojo. Un paso mas fino no añadiria informacion, solo
  // volveria a abrir la puerta al ruido.
  //
  // Se redondea AQUI y no en bottle-profiles.fractionAt: esa funcion la
  // usa heightFor por biseccion, y una funcion escalonada rompe la
  // busqueda.
  const PASO = 0.05;

  function redondearAPaso(f) {
    const x = Math.max(0, Math.min(1, Number(f) || 0));
    // El segundo redondeo no sobra: 20 * 0.05 da 1.0000000000000002 y
    // 12 * 0.05 da 0.6000000000000001 en coma flotante. Sin el, el
    // paso limpiaria el ruido del dedo y metaria el suyo propio en la
    // base de datos.
    return Math.round(Math.round(x / PASO) * PASO * 100) / 100;
  }

  let _opens = [];         // fracciones, 0..1 — de ESTA pasada
  let _active = -1;        // índice de la abierta que está editando
  let _onNext = null;
  let _dragging = false;
  let _again = false;      // si este artículo ya se contó en esta sesión
  let _upc = null;         // el código que abrió este panel, si vino de un escaneo
  let _editIdx = null;     // null = sumando; un número = corrigiendo esa pasada
  // ── El tamaño de ESTA pasada ──────────────────────────────────────
  //
  // Un producto se ordena en un formato, pero en el estante puede haber
  // otro: se acabó el Hendrick's de litro y alguien trajo uno de 750 de
  // la tienda. Ese 750 tiene su propio código de barras y su propio
  // tamaño, y escanearlo tiene que contar 750 ml, no un litro.
  //
  // null = no vino del código, así que manda el del producto. Es lo que
  // pasa al contar por nombre, y es lo correcto.
  let _sizeMl = null;
  let _sizeAbrio = null;   // el del codigo que abrio el panel
  let _banked = 0;         // lo ya guardado en pasadas anteriores
  let _sheet = false;      // la hoja de detalle está abierta

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  // ── Qué botella se dibuja ────────────────────────────────────────────
  //
  // La familia (whiskey, bordeaux…) más el TAMAÑO. No son dos datos
  // sueltos: el cuello de una botella es una pieza normalizada de unos
  // 29 mm, la misma en un botellín y en un garrafón, así que cuanto más
  // ancho el cuerpo, más fino se ve el cuello en proporción. La forma
  // sale de combinar los dos.
  //
  // Sin forma asignada se cae a 'generic', que es una botella. Antes se
  // caía a 'cylinder', que es un rectángulo perfecto: la forma de control
  // del banco de pruebas. Por eso el deslizador salía cuadrado.
  //
  // Aquí vivía también el perfil PROPIO del producto, trazado desde una
  // foto. Se retiró: prometía la botella exacta de cada marca y entregaba
  // un contorno aproximado que había que corregir a mano producto por
  // producto. Doscientas sesenta veces. Una familia bien medida acierta
  // más que un trazado a ojo, y no cuesta trabajo a nadie.
  function shapeOf(row) {
    const k = row && row.bottleShape;
    return (P() && P().get(k)) ? k : 'generic';
  }

  // El tamaño que se está contando AHORA. El del código gana sobre el
  // del producto: es el que de verdad tiene la botella en la mano.
  function sizeOf(row) {
    return Number(_sizeMl) || Number(row && row.bottleSizeMl) || 750;
  }

  // El que se ORDENA, que es la unidad del inventario. No cambia aunque
  // se esté contando otro formato.
  function sizeOrden(row) {
    return Number(row && row.bottleSizeMl) || 750;
  }

  // "1 L", "1.5 L", "1.75 L", "750 ml". Cualquier cosa de un litro para
  // arriba se escribe en litros: "1500 ml" obliga a contar ceros en una
  // pantalla que se mira de reojo, y 1.5 L es como se llama la botella.
  function fmtSize(ml) {
    const n = Number(ml) || 0;
    if (!n) return '';
    if (n < 1000) return n + ' ml';
    return Number((n / 1000).toFixed(2)) + ' L';
  }

  // El perfil ya ajustado al formato. Es lo que se dibuja y lo que se
  // integra: una sola geometría, como siempre.
  function profileOf(row) {
    return (P() && P().forSize) ? P().forSize(shapeOf(row), sizeOf(row)) : shapeOf(row);
  }

  function shapeIsSet(row) {
    return !!(row && row.bottleShape && P() && P().get(row.bottleShape));
  }

  function pourable(row) {
    const p = P() && P().get(shapeOf(row));
    return p ? p.pourable !== false : true;
  }

  function total() {
    return _sealed + _opens.reduce((a, b) => a + b, 0);
  }

  // La línea bajo el nombre. Estaba escrita dentro de open(), y al poder
  // cambiar la silueta sin cerrar el panel había que poder rehacerla: si
  // se cambia el tamaño de 750 a 1000, la cabecera tiene que decirlo sin
  // esperar a la siguiente apertura.
  function subText(row) {
    // Se enseña el tamaño que se esta CONTANDO, y si no es el que se
    // ordena se marca: es la señal de que esta pasada vale distinto que
    // las demas.
    const esOtro = sizeOf(row) !== sizeOrden(row);
    const size = row.bottleSizeMl || _sizeMl
      ? (esOtro ? '<b class="cp-otro">' + esc(fmtSize(sizeOf(row))) + '</b>'
                : esc(fmtSize(sizeOf(row))))
      : 'size not set';
    const was = (row.onHand === 0 || row.onHand) ? ' · was ' + row.onHand : '';
    // "already counted" decía que había algo detrás pero no cuánto ni
    // qué se iba a hacer con ello. El número de pasada sí: dice que esta
    // es la tercera vez que aparece el producto y que se está sumando.
    let tail = '';
    if (_editIdx !== null) {
      tail = ' · <b class="cp-fixing">fixing scan ' + (_editIdx + 1) + '</b>';
    } else if (_again) {
      tail = ' · <b class="cp-again">scan ' + (passes().length + 1) + '</b>';
    }
    return size + esc(was) + tail;
  }

  function passes() { return (S().passesOf && S().passesOf(_row ? _row.item : '')) || []; }

  // Botellas de ESA pasada, en su propio tamaño. No se pueden sumar
  // entre pasadas de formatos distintos: para eso estan los ml.
  function passTotal(p) {
    return (Number(p.sealed) || 0) +
           (p.opens || []).reduce((a, b) => a + (Number(b) || 0), 0);
  }

  function passSize(p) { return Number(p.sizeMl) || sizeOrden(_row); }
  function passMl(p)   { return passTotal(p) * passSize(p); }

  // Mililitros de todo lo guardado, excepto la pasada que se este
  // corrigiendo —esa la reemplaza lo que hay en pantalla—.
  function mlGuardados() {
    return passes().reduce((a, p, i) => a + (i === _editIdx ? 0 : passMl(p)), 0);
  }

  function fmtMl(ml) {
    return Math.round(ml).toLocaleString('en-US') + ' ml';
  }

  // "1 sealed + 1 open (0.5)". Si no hay abiertas se omite esa mitad, y
  // al revés: escribir "0 open" por simetría es ruido.
  function passDetail(p) {
    const partes = [];
    const sl = Number(p.sealed) || 0;
    if (sl) partes.push(sl + (sl === 1 ? ' sealed' : ' sealed'));
    const op = p.opens || [];
    if (op.length) {
      partes.push(op.length + (op.length === 1 ? ' open' : ' open') +
        ' (' + op.map(f => f.toFixed(2)).join(', ') + ')');
    }
    return partes.join(' + ') || 'nothing';
  }

  function fmtNum(n) { return n.toFixed(2).replace(/\.?0+$/, '') || '0'; }

  // ── Estructura ───────────────────────────────────────────────────────
  function build() {
    if ($('cpPanel')) return;
    const el = document.createElement('div');
    el.id = 'cpPanel';
    el.className = 'cp-panel';
    el.innerHTML = `
      <div class="cp-head">
        <button class="sc-x" id="cpBack" type="button" aria-label="Back">
          <i class="ti ti-arrow-left" aria-hidden="true"></i>
        </button>
        <div class="cp-title">
          <div class="cp-name" id="cpName"></div>
          <div class="cp-sub" id="cpSub"></div>
        </div>
      </div>

      <!-- ── La botella manda ────────────────────────────────────────
           Esta pantalla se abre una vez por artículo: en un conteo
           completo, 261 veces. Antes tenía tres etiquetas —"Open bottle",
           "Sealed bottles", "Total"— y a la décima botella esas palabras
           ya no informan, solo ocupan. Ahora la silueta se lleva todo el
           alto que sobra y la cifra vive justo debajo, que es donde va a
           estar mirando el ojo después de arrastrar la línea. -->
      <div class="cp-body">
        <div class="cp-block" id="cpOpenBlock">
          <div class="cp-open" id="cpOpen"></div>
          <div class="cp-opens" id="cpOpens"></div>
          <div class="cp-chips">
            <button type="button" class="cp-chip" id="cpAdd">
              <i class="ti ti-plus" aria-hidden="true"></i> another open
            </button>
            <button type="button" class="cp-chip" id="cpShape">
              not this bottle?
            </button>
          </div>
        </div>
      </div>

      <!-- Sin etiqueta. Dos botones, un numero y nada mas: lo que hace
           es evidente y la palabra "Sealed" solo restaba alto a la
           botella, que es lo unico que de verdad hay que mirar. -->
      <div class="cp-sealed">
        <div class="cp-step">
          <button type="button" id="cpMinus" aria-label="One less">−</button>
          <!-- ── El contador se escribe, no solo se pulsa ─────────────
               Con el vodka de la casa son 20 y pico de botellas
               selladas, o sea 20 y pico de toques al +. Es un <input>
               desde el principio pero sin nada que lo delate: sin borde,
               sin fondo, con la misma tipografía y tamaño que tenía el
               número. En reposo es indistinguible; al tocarlo sale el
               teclado numérico.
               inputmode numeric y no type=number: el segundo trae
               flechitas en escritorio y en iOS acepta 'e' y signos. -->
          <input class="cp-num" id="cpSealed" type="text" size="3"
                 inputmode="numeric" pattern="[0-9]*"
                 autocomplete="off" autocorrect="off" spellcheck="false"
                 aria-label="Sealed bottles" value="0">
          <button type="button" id="cpPlus" aria-label="One more">+</button>
        </div>
      </div>

      <!-- El código que trajo hasta aquí, y la salida si está mal. Va
           abajo y pequeño a propósito: casi nunca hace falta, pero cuando
           hace falta no hay ningún otro sitio donde buscarlo. Hoy, un
           código mal aprendido no tenía arreglo desde ninguna pantalla. -->
      <div class="cp-upc" id="cpUpc" hidden>
        <i class="ti ti-barcode" aria-hidden="true"></i>
        <span id="cpUpcTxt"></span>
        <button type="button" id="cpUpcFix">wrong product?</button>
      </div>

      <!-- El total es ahora un BOTÓN, y es la única puerta a lo ya
           contado. Si reescanear suma, tiene que haber una forma de
           corregir; sin ella cambiaríamos perder conteo por duplicarlo,
           que es peor porque infla sin avisar. -->
      <div class="cp-foot">
        <button type="button" class="cp-total" id="cpTotalBtn">
          <span class="cp-total-l"><span>Total</span><b id="cpTotal">0</b>
            <small class="cp-ml" id="cpMl"></small></span>
          <span class="cp-total-go" id="cpPasses"></span>
        </button>
        <button type="button" class="cp-next" id="cpNext">
          <span id="cpNextTxt">Next</span> <i class="ti ti-arrow-right" aria-hidden="true"></i>
        </button>
      </div>

      <!-- La hoja de detalle. Vive dentro del panel y no en un modal
           aparte porque no es otra pantalla: es mirar debajo de la cifra
           que ya estás viendo. -->
      <div class="cp-sheet" id="cpSheet" hidden>
        <div class="cp-sheet-in">
          <div class="cp-grab"></div>
          <div class="cp-sheet-t" id="cpSheetT">How this adds up</div>
          <div class="cp-sheet-s">Tap a scan to fix it</div>
          <div id="cpPassList"></div>
          <div class="cp-sheet-sum"><span>Total</span>
            <small class="cp-ml" id="cpSheetMl"></small><b id="cpSheetTotal">0</b></div>
          <button type="button" class="cp-sheet-x" id="cpSheetX">Done</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    $('cpBack').onclick  = () => finish(false);
    $('cpNext').onclick  = () => finish(true);
    $('cpMinus').onclick = () => { _sealed = Math.max(0, _sealed - 1); paintNums(); };
    $('cpPlus').onclick  = () => { _sealed++; paintNums(); };

    // ── Escribir el contador ───────────────────────────────────────────
    const sealedEl = $('cpSealed');

    // Al enfocar se selecciona todo, para que teclear 24 REEMPLACE y no
    // deje 024. Es el gesto que se espera: toco, escribo, listo.
    sealedEl.onfocus = () => {
      try { sealedEl.select(); } catch (e) {}
      // El teclado del iPhone tapa la mitad baja, y el contador vive
      // justo encima del pie. Sin esto se escribe a ciegas.
      setTimeout(() => {
        try { sealedEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
      }, 250);
    };

    // El tope se aplica al CAMPO, no solo al valor guardado. Puesto solo
    // en `_sealed`, se veia 999999 mientras el total decia 9999 —dos
    // cifras distintas en la misma pantalla— y ademas el blur volvia a
    // leer del campo y se saltaba el limite.
    const TOPE = 9999;

    sealedEl.oninput = () => {
      // Solo dígitos. El teclado numérico de iOS deja colar guiones y
      // comas segun el idioma, y un NaN aqui se guardaria como conteo.
      let limpio = sealedEl.value.replace(/[^0-9]/g, '');
      if (limpio && Number(limpio) > TOPE) limpio = String(TOPE);
      if (limpio !== sealedEl.value) sealedEl.value = limpio;
      _sealed = Number(limpio) || 0;
      // No se repinta el campo mientras se escribe —eso movería el
      // cursor—, solo lo que depende de el.
      paintTotales();
    };

    // Vacío es cero, no "sin valor". Y Enter cierra el teclado en vez de
    // no hacer nada, que en un móvil es lo único que se puede esperar.
    sealedEl.onblur = () => {
      _sealed = Math.max(0, Math.min(TOPE, Number(sealedEl.value) || 0));
      paintNums();
    };
    sealedEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); sealedEl.blur(); } };
    $('cpAdd').onclick   = () => {
      // En CERO, no en 0.5. Media botella era un valor que nadie había
      // mirado todavía y que se guardaba solo con tocar el botón; si
      // además coincidía con la anterior, parecía que la pantalla había
      // arrastrado el dato de la botella pasada. Vacía obliga a arrastrar,
      // que es el gesto que de verdad mide.
      _opens.push(0);
      _active = _opens.length - 1;
      paintAll();
    };

    $('cpTotalBtn').onclick = () => { if (passes().length) openSheet(); };
    $('cpSheetX').onclick   = () => {
      if (_editIdx !== null) { sumarNuevo(); $('cpSub').innerHTML = subText(_row); }
      closeSheet();
      paintAll();
    };
    $('cpSheet').onclick    = (e) => { if (e.target === $('cpSheet')) closeSheet(); };
    // El botón de la silueta vive ya en la estructura y no se vuelve a
    // crear en cada repintado: antes se generaba dentro del HTML de la
    // botella, así que cada arrastre lo destruía y lo rehacía.
    $('cpShape').onclick = () => {
      if (!window.BarStockBottlePicker || !_row) return;
      window.BarStockBottlePicker.open(_row, () => {
        $('cpSub').innerHTML = subText(_row);
        $('cpOpenBlock').style.display = pourable(_row) ? '' : 'none';
        paintAll();
      });
    };
    $('cpUpcFix').onclick = () => {
      if (!_upc || !window.BarStockBarcodeFix || !_row) return;
      // El cuarto argumento es el tamaño de ESTE codigo, para que la
      // pantalla pueda ofrecer corregirlo y no solo reasignar el producto.
      window.BarStockBarcodeFix.open(_upc, _row, (nuevoRow) => {
        // El código apunta ya a otro producto. Si además se movió lo
        // contado, este panel está mirando un artículo que ya no es el
        // que se estaba contando: se cierra y se vuelve al escáner.
        finish(false);
        if (nuevoRow && window.BarStockCountPanel) {
          setTimeout(() => open(nuevoRow, _onNext, null), 60);
        }
      }, _sizeMl);
    };
  }

  // ── La botella ───────────────────────────────────────────────────────
  //
  // El SVG NO lleva colores. Van por clase y se definen en el CSS, que es
  // el unico sitio donde el modo claro puede alcanzarlos.
  //
  // Estaban escritos aqui dentro —rgba(255,255,255,.32) para el
  // contorno— y en modo claro eso es blanco sobre fondo claro: la
  // botella no existia hasta que el liquido azul, que si tenia color
  // propio, empezaba a subir. Un color dentro de un SVG generado por
  // JavaScript es un color que el tema no puede cambiar.
  const VB = { w: 200, h: 260, pad: 12 };

  // El trazado vive en bottle-profiles y lo comparten el panel y la
  // parrilla de revision: la silueta que apruebas es la misma que cuenta.
  function bottlePath(key) {
    return P().pathFor(key, VB.w, VB.h, VB.pad);
  }

  // El encuadre sale de bottle-profiles, no de aquí. Ahora que cada forma
  // tiene su propia esbeltez, la botella ya no ocupa siempre el mismo
  // rectángulo, y una fórmula local se habría separado del dibujo en
  // cuanto alguna silueta necesitara reducirse para caber.
  function yToPx(key, y) { return P().yToPx(key, y, VB.w, VB.h, VB.pad); }

  // La etiqueta encima de la cifra. Tiene que decir dos cosas distintas
  // segun el modo, porque son las que evitan el error original:
  //
  //   corrigiendo  de que pasada guardada salio lo que hay en pantalla
  //   sumando      que esta botella es nueva y no la que ya estaba
  //
  // Con una sola abierta y sin nada contado antes no dice nada: no hay
  // ambiguedad que deshacer y la etiqueta solo quitaria alto.
  function whichLabel() {
    const varias = _opens.length > 1;
    if (_editIdx !== null) {
      return `<span class="cp-which cp-which-fix">Scan ${_editIdx + 1}` +
             (varias ? ` · bottle ${_active + 1} of ${_opens.length}` : '') + `</span>`;
    }
    if (varias) {
      return `<span class="cp-which">Bottle ${_active + 1} of ${_opens.length}</span>`;
    }
    if (_again) return `<span class="cp-which">New bottle</span>`;
    return '';
  }

  // La lectura de esta misma botella en el conteo anterior, si la hay.
  // Se guarda una fraccion por botella abierta y se casan por posicion:
  // la primera con la primera. No es perfecto —nadie garantiza que la
  // botella 1 de hoy sea la botella 1 de la semana pasada— pero con una
  // sola abierta, que es el caso normal, siempre acierta.
  function antesDe(i) {
    const v = _row && Array.isArray(_row.lastOpens) ? _row.lastOpens[i] : null;
    const n = Number(v);
    return isFinite(n) && n > 0 ? redondearAPaso(n) : null;
  }

  // La comparacion en palabras. "Same as last week" no es un adorno:
  // confirma que NO se registro consumo donde no lo hubo, que es
  // precisamente la duda que deja un deslizador a ojo.
  function compararConAntes(antes, ahora) {
    if (antes === null) return '';
    const d = Math.round((ahora - antes) * 100) / 100;
    if (Math.abs(d) < 0.001) {
      return `<em class="cp-same"><i class="ti ti-equal" aria-hidden="true"></i> same as last count</em>`;
    }
    const signo = d > 0 ? '+' : '\u2212';
    return `<em class="cp-last">last count ${antes.toFixed(2)} ` +
           `<b class="${d < 0 ? 'cp-down' : 'cp-up'}">${signo}${Math.abs(d).toFixed(2)}</b></em>`;
  }

  function paintBottle() {
    const host = $('cpOpen');
    if (!host) return;


    // `key` es aquí un perfil YA ajustado al formato, no una clave. Todas
    // las funciones de BottleProfiles aceptan lo uno o lo otro, así que
    // el dibujo y la integral siguen saliendo de la misma geometría.
    const key = profileOf(_row);
    const prof = P().profOf(key);
    const frac = _opens[_active];
    const y = P().heightFor(key, frac);
    const ml = Math.round(frac * sizeOf(_row));

    // ── Donde quedo esta botella el conteo pasado ────────────────────
    //
    // Una linea punteada a esa altura y una comparacion debajo. NO se
    // precarga como valor: si al abrir el panel la linea ya estuviera
    // en el 0.60 de la semana pasada, el dia que la botella de verdad
    // bajo a 0.40 se confirmaria el 0.60 sin pensarlo —a las dos de la
    // mañana y con 260 articulos por delante, todos lo hariamos— y esa
    // botella no bajaria nunca.
    //
    // La marca informa; la decision sigue siendo del dedo.
    const antes = antesDe(_active);
    const yAntes = antes === null ? null : P().heightFor(key, antes);

    host.innerHTML = `
      <div class="cp-stage" id="cpStage">
        <svg viewBox="0 0 ${VB.w} ${VB.h}" preserveAspectRatio="xMidYMid meet">
          <defs><clipPath id="cpClip"><path d="${bottlePath(key)}"/></clipPath></defs>
          <path class="cp-glass" d="${bottlePath(key)}" stroke-width="2"/>
          <g clip-path="url(#cpClip)">
            <rect class="cp-liquid" x="0" y="${yToPx(key, y)}" width="${VB.w}" height="${VB.h}"/>
          </g>
          <line class="cp-fullline" x1="14" y1="${yToPx(key, prof.yFull)}"
                x2="${VB.w - 14}" y2="${yToPx(key, prof.yFull)}"
                stroke-width="1" stroke-dasharray="3 4"/>
          ${yAntes === null ? '' : `
          <line class="cp-lastline" x1="8" y1="${yToPx(key, yAntes)}"
                x2="${VB.w - 8}" y2="${yToPx(key, yAntes)}"
                stroke-width="1.4" stroke-dasharray="5 4"/>`}

          <!-- ── La línea de arrastre, DENTRO del SVG ──────────────
               Era un div colocado a mano: se leía el alto del visor
               con getBoundingClientRect y se le daba un top en
               píxeles. Eso falla de dos maneras y las dos se veían:
               si se mide antes de que el visor sepa su alto —al abrir
               desde el escáner— no se escribe nada y el div se queda
               en su posición estática, la misma para cualquier
               botella; y si se mide bien pero el layout cambia
               después, queda descolgada hasta el siguiente arrastre.
               La pista estaba a la vista: la punteada del conteo
               anterior SIEMPRE caía bien, y esa ya vivía aquí dentro.
               Aquí no hay nada que medir. La línea está en las mismas
               coordenadas que el vidrio, así que no pueden separarse.
               -->
          <line class="cp-dragline" x1="0" y1="${yToPx(key, y)}"
                x2="${VB.w}" y2="${yToPx(key, y)}"
                stroke-width="3" vector-effect="non-scaling-stroke"/>
          <rect class="cp-grip" x="${(VB.w - 42) / 2}" y="${yToPx(key, y) - 10}"
                width="42" height="20" rx="10"/>
        </svg>
      </div>
      <div class="cp-read">
        ${whichLabel()}
        <b>${frac.toFixed(2)}</b>
        <small>${ml} ml · drag the line</small>
        ${compararConAntes(antes, frac)}
      </div>
      ${shapeIsSet(_row) ? '' :
        `<div class="cp-hint">Bottle shape not set — using a generic one.</div>`}`;

    bindDrag();
  }


  // ── Cambiar la silueta ───────────────────────────────────────────────
  //
  // El botón vive en la estructura (cpShape) y se conecta una sola vez en
  // build(). El momento en que se descubre que la forma está mal es
  // escaneando y viendo el dibujo, no antes.
  //
  // La fracción NO se recalcula al cambiar de forma, a propósito. Lo que
  // se guardó es "esta botella está al 40%", y eso lo dijo una persona
  // mirando el vidrio; sigue siendo verdad con la silueta nueva. Lo que
  // cambia es a qué ALTURA se dibuja esa misma fracción, que es
  // precisamente lo que se estaba corrigiendo.

  // ── Del dedo a la fracción ───────────────────────────────────────────
  //
  // Esto sí mide, y aquí sí se puede: un arrastre sólo existe cuando
  // el layout ya existe. La escala es la que usa el navegador de
  // verdad —min() de las dos— y se resta el margen que deja al
  // encajar el dibujo; dar por hecho que el SVG llena el alto exacto
  // descuadraba el dedo con el vidrio en visores muy altos.
  function encuadre(svg) {
    const r = svg.getBoundingClientRect();
    if (!r.height || !r.width) return null;
    const escala = Math.min(r.width / VB.w, r.height / VB.h);
    return { r, escala, sobraY: (r.height - VB.h * escala) / 2 };
  }

  function bindDrag() {
    const stage = $('cpStage');
    if (!stage) return;
    const move = (clientY) => {
      const svg = stage.querySelector('svg');
      const e = encuadre(svg);
      if (!e) return;
      const key = profileOf(_row);
      const prof = P().profOf(key);
      // El mismo encuadre que dibuja la botella, no una copia. Con
      // esbelteces distintas por forma, calcularlo aparte era garantizar
      // que algún día el dedo y el vidrio dejaran de coincidir.
      const box = P().boxFor(key, VB.w, VB.h, VB.pad);
      const usable = box.usable * e.escala;
      const base = e.r.top + e.sobraY + box.base * e.escala;
      let y = (base - clientY) / usable;
      y = Math.max(0, Math.min(prof.yFull, y));
      _opens[_active] = redondearAPaso(P().fractionAt(key, y));
      paintBottle();
      paintNums();
    };
    stage.addEventListener('pointerdown', (e) => {
      _dragging = true;
      stage.setPointerCapture(e.pointerId);
      move(e.clientY);
    });
    stage.addEventListener('pointermove', (e) => { if (_dragging) move(e.clientY); });
    stage.addEventListener('pointerup',   () => { _dragging = false; });
    stage.addEventListener('pointercancel', () => { _dragging = false; });
  }

  // ── Varias botellas abiertas ─────────────────────────────────────────
  //
  // Aquí había una LISTA: una fila por botella abierta, con su número y
  // su papelera. Crecía hacia abajo, y como el alto de la pantalla es fijo
  // ese espacio salía de la botella: con dos abiertas la silueta ya se
  // encogía y la línea de arrastre se quedaba FUERA del vidrio, encima
  // del número. Con cuatro habría sido un sello.
  //
  // La interfaz no puede cambiar según cuántas botellas haya. Ahora es
  // siempre la misma —una botella, su deslizador, su cifra— y lo único
  // que se añade es una fila de pastillas numeradas que dice en cuál
  // estás. Una sola línea, ocupe lo que ocupe la barra.
  //
  // Con una sola abierta no aparece nada: no hay entre qué elegir.
  function paintOpens() {
    const host = $('cpOpens');
    if (!host) return;
    if (_opens.length < 2) { host.innerHTML = ''; return; }

    host.innerHTML = `
      <div class="cp-pager" role="tablist" aria-label="Open bottles">
        ${_opens.map((f, i) => `
          <button type="button" class="cp-pg${i === _active ? ' on' : ''}"
                  role="tab" aria-selected="${i === _active}" data-i="${i}">
            ${i + 1}
          </button>`).join('')}
        <button type="button" class="cp-pg-del" id="cpDelOpen"
                aria-label="Remove bottle ${_active + 1}">
          <i class="ti ti-trash" aria-hidden="true"></i>
        </button>
      </div>`;

    host.querySelectorAll('.cp-pg').forEach(el => {
      el.onclick = () => { _active = Number(el.dataset.i); paintAll(); };
    });
    // La papelera borra la ACTIVA, no una cualquiera. Con una papelera por
    // fila era fácil borrar la de al lado sin querer; con una sola, lo que
    // se borra es lo que estás mirando.
    $('cpDelOpen').onclick = () => {
      _opens.splice(_active, 1);
      if (!_opens.length) _opens = [0];
      _active = Math.max(0, Math.min(_active, _opens.length - 1));
      paintAll();
    };
  }

  function paintNums() {
    const se = $('cpSealed');
    // No se toca el campo mientras tiene el foco: reescribir su valor
    // manda el cursor al final y hace imposible corregir un dígito.
    if (se && document.activeElement !== se) se.value = String(_sealed);

    paintTotales();
    paintOpens();
    if (_sheet) paintSheet();
  }

  // Solo el pie: el total y lo que cuelga de el. Se separo de paintNums
  // porque al TECLEAR en el contador hay que refrescar la cifra pero no
  // el campo que se esta escribiendo.
  function paintTotales() {
    // El total de la pantalla es el del ARTÍCULO, no el de esta pasada:
    // es la cifra que acabará en el inventario y la que hay que poder
    // contrastar con el estante. Corrigiendo, lo guardado se cuenta sin
    // la pasada que se está tocando, porque esta la reemplaza.
    // ── Se suma en mililitros, se enseña en botellas ──────────────────
    //
    // Es la unica forma de juntar formatos distintos sin mentir. 1.5 de
    // 750 mas 1.5 de litro son 2,625 ml; en botellas de litro —las que
    // se ordenan— 2.625, no 3. El numero grande va en la unidad del
    // inventario y los ml quedan debajo, que es donde se comprueba.
    const orden = sizeOrden(_row);
    const mlOtras = mlGuardados();
    const mlAhora = total() * sizeOf(_row);
    const mlGran  = mlOtras + mlAhora;
    const gran    = orden ? mlGran / orden : 0;
    _banked = orden ? mlOtras / orden : 0;

    if ($('cpTotal')) $('cpTotal').textContent = fmtNum(gran);

    // Los ml solo aparecen cuando hay mas de un formato en juego. Con
    // todo del mismo tamaño no aportan nada y solo roban sitio.
    const mezcla = passes().some(p => passSize(p) !== orden) || sizeOf(_row) !== orden;
    const mlEl = $('cpMl');
    if (mlEl) mlEl.textContent = (mezcla && mlGran) ? fmtMl(mlGran) : '';

    // ── El total como puerta ───────────────────────────────────────────
    //
    // Era una etiqueta de 11 px pegada debajo de la cifra, y aunque el
    // botón ya ocupaba toda la fila, nada lo decía: el ojo iba al texto
    // chico y el dedo apuntaba ahí. Ahora la fila entera se ve tocable
    // —borde, fondo propio y una flecha que promete destino— y solo
    // cuando hay pasadas detrás que mirar.
    const sub = $('cpPasses');
    const btn = $('cpTotalBtn');
    const n = passes().length;

    if (sub) {
      if (_editIdx !== null) {
        sub.innerHTML = '<span class="cp-fix">replaces ' +
          esc(fmtNum(passTotal(passes()[_editIdx] || { sealed: 0, opens: [] }))) + '</span>';
      } else if (n) {
        sub.innerHTML = '<span>' + n + (n === 1 ? ' scan' : ' scans') + '</span>' +
          '<i class="ti ti-chevron-right cp-chev" aria-hidden="true"></i>';
      } else {
        sub.innerHTML = '';
      }
    }

    if (btn) {
      // Sin pasadas previas —la mayoría de los escaneos— se queda como el
      // total de siempre: ni borde ni flecha ni nada que tocar.
      //
      // Corrigiendo SÍ se puede tocar, aunque no lleve flecha. Es la
      // única salida: entrar a corregir por error dejaba atrapado entre
      // Save y abandonar el panel entero.
      const hay = n > 0;
      btn.disabled = !hay;
      btn.classList.toggle('cp-total-on', hay && _editIdx === null);
      btn.classList.toggle('cp-total-fix', _editIdx !== null);
      btn.setAttribute('aria-label', !hay
        ? 'Total ' + fmtNum(gran)
        : _editIdx !== null
          ? 'Total ' + fmtNum(gran) + '. Fixing scan ' + (_editIdx + 1)
          : 'Total ' + fmtNum(gran) + '. View ' + n + (n === 1 ? ' scan' : ' scans'));
    }

    const nxt = $('cpNextTxt');
    if (nxt) nxt.textContent = _editIdx === null ? 'Next' : 'Save';
    const nb = $('cpNext');
    if (nb) nb.classList.toggle('cp-next-fix', _editIdx !== null);
  }

  // ── La hoja: de dónde sale el total ──────────────────────────────────
  function openSheet()  { _sheet = true;  $('cpSheet').hidden = false; paintSheet(); }
  function closeSheet() { _sheet = false; $('cpSheet').hidden = true; }

  function paintSheet() {
    const host = $('cpPassList');
    if (!host) return;
    const ps = passes();

    host.innerHTML = ps.map((p, i) => `
      <div class="cp-pass${i === _editIdx ? ' on' : ''}">
        <div class="cp-pass-n">${i + 1}</div>
        <div class="cp-pass-d">
          <b>${esc(fmtNum(passTotal(p)))}</b>
          <span>${esc(passDetail(p))}</span>
          ${p.zona ? `<span class="cp-pass-z"><i class="ti ti-map-pin" aria-hidden="true"></i>${esc(p.zona)}</span>` : ''}
        </div>
        ${passSize(p) !== sizeOrden(_row)
          ? `<span class="cp-pass-sz cp-otro">${esc(fmtSize(passSize(p)))}</span>`
          : `<span class="cp-pass-sz">${esc(fmtSize(passSize(p)))}</span>`}
        <button type="button" class="cp-pass-b" data-fix="${i}" aria-label="Fix scan ${i + 1}">
          <i class="ti ti-pencil" aria-hidden="true"></i>
        </button>
        <button type="button" class="cp-pass-b cp-pass-del" data-del="${i}" aria-label="Delete scan ${i + 1}">
          <i class="ti ti-trash" aria-hidden="true"></i>
        </button>
      </div>`).join('');

    const t = $('cpSheetTotal');
    const orden = sizeOrden(_row);
    const mlT = ps.reduce((a, p) => a + passMl(p), 0);
    if (t) t.textContent = fmtNum(orden ? mlT / orden : 0);
    const tm = $('cpSheetMl');
    if (tm) tm.textContent = ps.some(p => passSize(p) !== orden) ? fmtMl(mlT) : '';

    // Corrigiendo, el botón de la hoja deja de ser "ya vi" y pasa a ser
    // la marcha atrás. Sin esto, tocar el lápiz equivocado no tenía
    // deshacer: o guardabas encima o te salías del artículo entero.
    const x = $('cpSheetX');
    if (x) x.textContent = _editIdx !== null ? 'Cancel fix' : 'Done';
    const st = $('cpSheetT');
    if (st) st.textContent = _editIdx !== null
      ? 'Fixing scan ' + (_editIdx + 1)
      : 'How this adds up';

    host.querySelectorAll('[data-fix]').forEach(b => {
      b.onclick = () => fixPass(Number(b.dataset.fix));
    });
    host.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => delPass(Number(b.dataset.del));
    });
  }

  // Cargar una pasada guardada para corregirla. Lo que está en pantalla
  // sin guardar se descarta: mezclar una pasada nueva a medias con la
  // corrección de otra sería justo la confusión que esto viene a quitar.
  function fixPass(i) {
    const p = passes()[i];
    if (!p) return;
    _editIdx = i;
    _sealed = Number(p.sealed) || 0;
    _opens = (p.opens || []).slice();
    // Se recupera el tamaño con el que se conto, no el del producto: si
    // esa pasada fue de un 750 de emergencia, corregirla sigue siendo
    // sobre un 750.
    _sizeMl = Number(p.sizeMl) || null;
    if (!_opens.length) _opens = [0];
    _active = 0;
    closeSheet();
    $('cpSub').innerHTML = subText(_row);
    $('cpPanel').classList.add('cp-fixing-on');
    paintAll();
  }

  function delPass(i) {
    const p = passes()[i];
    if (!p) return;
    if (!confirm('Delete scan ' + (i + 1) + ' (' + fmtNum(passTotal(p)) + ')?')) return;

    S().removePass(_row.item, i);

    // Borrada la última, el artículo deja de estar contado: vuelve a la
    // lista de faltantes del cierre. No contado y contado en cero no son
    // lo mismo, y confundirlos esconde justo lo que hay que revisar.
    if (!passes().length) { _again = false; closeSheet(); }

    // Si se borró la que se estaba corrigiendo, o una de antes, el índice
    // que se guardaba ya apunta a otra fila. Se sale del modo corregir en
    // vez de arriesgarse a reemplazar la equivocada.
    if (_editIdx !== null && i <= _editIdx) sumarNuevo();

    $('cpSub').innerHTML = subText(_row);
    paintAll();
  }

  // Volver al modo sumar, con la pasada en blanco.
  function sumarNuevo() {
    _editIdx = null;
    _sealed = 0;
    _opens = [0];
    _active = 0;
    // Al salir de corregir se vuelve al tamaño con el que se abrio el
    // panel —el del codigo escaneado—, no al de la pasada que se estaba
    // tocando.
    _sizeMl = _sizeAbrio;
    $('cpPanel').classList.remove('cp-fixing-on');
  }

  // ── El orden importa ─────────────────────────────────────────────────
  //
  // Los números primero porque son los que cambian el alto: al pasar de
  // una botella abierta a dos, la fila de pastillas aparece por primera
  // vez y empuja todo.
  //
  // Esto se escribió cuando la línea de arrastre se colocaba midiendo
  // el layout, y medirlo antes de ese empujón la dejaba descolgada del
  // vidrio. Ya no mide nada —vive dentro del SVG— así que el orden ya
  // no es crítico; se deja porque sigue siendo el correcto.
  function paintAll() {
    paintNums();
    paintBottle();
  }

  // ── Abrir y cerrar ───────────────────────────────────────────────────
  function open(row, onNext, upc, sizeMl) {
    build();
    _row = row;
    _onNext = onNext || null;
    _upc = upc || null;
    // El tamaño del codigo escaneado. Sin el manda el del producto.
    _sizeMl = Number(sizeMl) || null;
    _sizeAbrio = _sizeMl;
    _active = -1;

    // El panel SIEMPRE abre en blanco, haya o no conteo previo. Lo ya
    // contado se conserva —está en sus pasadas— pero no se carga aquí: se
    // mira tocando el total, y se corrige desde ahí.
    //
    // Cargarlo como valores editables era el bug: la pantalla del segundo
    // escaneo salía idéntica a la del primero, con el 0.5 del closet
    // puesto, y ajustarlo a la botella que se tenía delante borraba la
    // otra sin decir nada.
    _again = !!S().get(row.item);
    _editIdx = null;
    _sealed = 0;
    _opens = [];
    _sheet = false;
    if ($('cpSheet')) $('cpSheet').hidden = true;
    $('cpPanel').classList.remove('cp-fixing-on');
    // Siempre hay una abierta en pantalla, aunque valga cero. Un
    // deslizador que aparece solo despues de pulsar un boton obliga a
    // decidir antes de mirar, y lo natural es mirar la botella y ajustar.
    // Una abierta en cero no se guarda: el filtro de la sesion la
    // descarta, asi que no tocarla equivale a decir que no hay parcial.
    if (!_opens.length) _opens = [0];
    _active = 0;

    $('cpName').textContent = row.item || '';
    $('cpSub').innerHTML = subText(row);

    // La fila del código solo existe si se llegó aquí escaneando. Buscar
    // el artículo por nombre no deja código que corregir.
    $('cpUpc').hidden = !_upc;
    if (_upc) $('cpUpcTxt').textContent = _upc;

    // Cerveza, latas y mixers no se cuentan por nivel. Enseñar un
    // deslizador ahi seria pedir que se estime la fraccion de algo que
    // nunca esta a medias.
    $('cpOpenBlock').style.display = pourable(row) ? '' : 'none';

    $('cpPanel').classList.add('on');
    paintAll();
  }

  function finish(save) {
    if (save && _row) {
      if (_editIdx !== null) {
        // Corrigiendo: esta pasada sustituye a la que se cargó. Si quedó
        // en cero, replacePass la borra, que es lo que significa vaciarla.
        S().replacePass(_row.item, _editIdx, _sealed, _opens, _sizeMl);
      } else {
        // Sumando: se añade. Una pasada sin nada no deja rastro, así que
        // abrir un producto, mirarlo y dar Next no lo marca como contado.
        // La zona activa del escaner. Vacia si la funcion esta apagada,
        // y entonces la pasada se guarda sin zona, como siempre.
        const Z = window.BarStockZones;
        S().addPass(_row.item, _sealed, _opens, _sizeMl, Z ? Z.paraPasada() : '');
      }
    }
    closeSheet();
    $('cpPanel').classList.remove('on');
    $('cpPanel').classList.remove('cp-fixing-on');
    const cb = _onNext;
    _row = null; _onNext = null; _upc = null; _editIdx = null; _sizeMl = null;
    if (cb) cb(save);
  }

  function close() {
    const el = $('cpPanel');
    if (el) { el.classList.remove('on'); el.classList.remove('cp-fixing-on'); }
    closeSheet();
    _row = null; _onNext = null; _upc = null; _editIdx = null; _sizeMl = null;
  }

  // Ya lo cubre el observador del visor, pero esto repinta la silueta
  // entera —no sólo la línea— y hace falta al girar el teléfono.
  window.addEventListener('resize', () => { if ($('cpPanel')?.classList.contains('on')) paintBottle(); });

  window.BarStockCountPanel = { open, close };
})();
