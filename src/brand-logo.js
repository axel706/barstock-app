(() => {
  if (window.BarStockBrandLogo) return;

  // ── El logo, dibujado ────────────────────────────────────────────────
  //
  // En pantalla el degradado de "Stock" se hace con
  // `background-clip: text`, que es CSS de navegador. En un PDF y en un
  // canvas no hay CSS: hay que dibujarlo.
  //
  // Estaba escrito a mano en tres archivos —el PDF de la orden, el del
  // reporte de consumo y la imagen del correo de costes— y los tres
  // ponían el wordmark en blanco. Al teñir uno, los otros dos se
  // quedaron atrás: el mismo producto con dos marcas según el papel que
  // te llegue.
  //
  // Así que se dibuja desde aquí, y las paradas de color viven en UN
  // sitio. Son las mismas que `--bs-stock-grad` en theme.css; hay una
  // prueba que compara los dos.

  const PARADAS = [[0x6e, 0xe7, 0xb7], [0x5e, 0xea, 0xd4], [0x38, 0xbd, 0xf8]];
  const AZUL = [0x38, 0xbd, 0xf8];   // el punto, y el final del recorrido
  const GRIS = [0x64, 0x74, 0x8b];   // PRO

  const hex = (c) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

  // El color a lo largo del recorrido, 0 → 1.
  function colorEn(t) {
    const n = PARADAS.length - 1;
    const i = Math.min(n - 1, Math.max(0, Math.floor(t * n)));
    const k = (t * n) - i;
    const a = PARADAS[i], b = PARADAS[i + 1];
    return a.map((v, j) => Math.round(v + (b[j] - v) * k));
  }

  // ── En un PDF (jsPDF) ────────────────────────────────────────────────
  //
  // jsPDF no sabe teñir texto con un degradado, así que "Stock" se pinta
  // LETRA A LETRA. A 22pt y cinco caracteres el escalón no se distingue
  // de un degradado continuo.
  //
  // `opc`: { x, y, size, font, blanco }  — `y` es la línea base.
  // Devuelve dónde acaba todo, por si quien llama necesita seguir.
  function enPdf(pdf, opc) {
    const o = opc || {};
    const x = o.x || 0, y = o.y || 0;
    const size = o.size || 22;
    const f = o.font || 'helvetica';
    const blanco = o.blanco || [248, 250, 252];

    pdf.setFont(f, 'bold');
    pdf.setFontSize(size);
    pdf.setTextColor(blanco[0], blanco[1], blanco[2]);
    pdf.text('Bar', x, y);

    let lx = x + pdf.getTextWidth('Bar');
    const STOCK = 'Stock';
    for (let i = 0; i < STOCK.length; i++) {
      // El color se toma en el CENTRO de cada letra, no en su borde: con
      // el borde, la última no llega al azul y el punto —que es azul—
      // queda descolgado justo donde el degradado tiene que aterrizar.
      const c = colorEn((i + 0.5) / STOCK.length);
      pdf.setTextColor(c[0], c[1], c[2]);
      pdf.text(STOCK[i], lx, y);
      lx += pdf.getTextWidth(STOCK[i]);
    }

    // El punto: un CÍRCULO, nunca un punto tipográfico. Las medidas
    // vienen del brandbook, en proporción al cuerpo.
    const r = size * 0.118;
    const cx = lx + size * 0.159;
    pdf.setFillColor(AZUL[0], AZUL[1], AZUL[2]);
    pdf.circle(cx, y - size * 0.114, r, 'F');

    // PRO
    const proX = lx + size * 0.41;
    pdf.setFont(f, 'bold');
    pdf.setFontSize(size * 0.37);
    pdf.setTextColor(GRIS[0], GRIS[1], GRIS[2]);
    pdf.text('PRO', proX, y);

    pdf.setTextColor(blanco[0], blanco[1], blanco[2]);
    return { fin: proX + pdf.getTextWidth('PRO'), wordmark: lx - x };
  }

  // ── En un canvas ─────────────────────────────────────────────────────
  //
  // Aquí no hace falta el truco: canvas sí sabe hacer degradados de
  // verdad, así que "Stock" sale continuo y queda mejor que en el PDF.
  function enCanvas(ctx, opc) {
    const o = opc || {};
    const x = o.x || 0, y = o.y || 0;
    const size = o.size || 22;
    const fam = o.fam || '-apple-system, Helvetica, sans-serif';
    const blanco = o.blanco || '#ffffff';

    ctx.font = 'bold ' + size + 'px ' + fam;
    ctx.textAlign = 'left';
    ctx.fillStyle = blanco;
    ctx.fillText('Bar', x, y);

    const bx = x + ctx.measureText('Bar').width;
    const sw = ctx.measureText('Stock').width;
    const g = ctx.createLinearGradient(bx, 0, bx + sw, 0);
    PARADAS.forEach((c, i) => g.addColorStop(i / (PARADAS.length - 1), hex(c)));
    ctx.fillStyle = g;
    ctx.fillText('Stock', bx, y);

    // El círculo, con las mismas proporciones que en el PDF.
    const lx = bx + sw;
    const r = size * 0.118;
    ctx.beginPath();
    ctx.arc(lx + size * 0.159, y - size * 0.114, r, 0, Math.PI * 2);
    ctx.fillStyle = hex(AZUL);
    ctx.fill();

    const proX = lx + size * 0.41;
    ctx.font = 'bold ' + Math.round(size * 0.37) + 'px ' + fam;
    ctx.fillStyle = hex(GRIS);
    ctx.fillText('PRO', proX, y);

    return { fin: proX + ctx.measureText('PRO').width, wordmark: lx - x };
  }

  window.BarStockBrandLogo = { enPdf, enCanvas, PARADAS, colorEn };
})();
