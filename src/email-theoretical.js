(() => {
  if (window.BarStockEmailTheoretical?.active) return;

  const ENDPOINT = 'https://barstock-app.vercel.app/api/send-theoretical-report';

  function isValidEmail(e) {
    if (!e) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
  }

  function generatePreviewCanvas(d) {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, canvas.height);

    // Header bar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, 52);

    // Logo
    ctx.font = 'bold 22px -apple-system, Helvetica, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('BarStock', 24, 33);
    const bw = ctx.measureText('BarStock').width;
    ctx.fillStyle = '#93c5fd';
    ctx.fillText('.', 24 + bw, 33);
    const dw = ctx.measureText('.').width;
    ctx.font = 'bold 11px -apple-system, Helvetica, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('PRO', 24 + bw + dw + 3, 31);

    ctx.font = 'bold 13px -apple-system, Helvetica, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText('Theoretical Usage Report', W - 24, 33);
    ctx.textAlign = 'left';

    let y = 80;
    const loc = (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || 'BarStock';
    ctx.font = 'bold 15px -apple-system, Helvetica, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(loc, 24, y);

    ctx.font = '12px -apple-system, Helvetica, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Week of ' + (d.weekLabel || d.weekStart || ''), 24, y + 18);
    y += 48;

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(W - 24, y); ctx.stroke();
    y += 24;

    // Metrics
    const metrics = [
      { label: 'Total Loss', value: '$' + (Number(d.totalLoss) || 0).toFixed(2), color: Number(d.totalLoss) > 0 ? '#D85A30' : '#1D9E75' },
      { label: 'Items analyzed', value: String(d.itemsAnalyzed || 0), color: '#0f172a' },
      { label: 'No sales data', value: String(d.noSalesCount || 0), color: '#64748b' },
    ];
    const colW = (W - 48) / metrics.length;
    metrics.forEach((m, i) => {
      const x = 24 + i * colW;
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.roundRect(x, y, colW - 10, 72, 8);
      ctx.fill();
      ctx.strokeStyle = '#e2e8f0';
      ctx.stroke();
      ctx.font = '11px -apple-system, Helvetica, sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText(m.label, x + 12, y + 22);
      ctx.font = 'bold 20px -apple-system, Helvetica, sans-serif';
      ctx.fillStyle = m.color;
      ctx.fillText(m.value, x + 12, y + 52);
    });

    return canvas;
  }

  async function openModal() {
    const modal   = document.getElementById('emailTheoreticalModalBg');
    const preview = document.getElementById('emailTheoreticalPreview');
    const toInput = document.getElementById('emailTheoreticalTo');
    const ccInput = document.getElementById('emailTheoreticalCc');
    if (!modal) return;

    // Load sender profile defaults
    if (window.BarStockSenderProfile) {
      try {
        const p = await window.BarStockSenderProfile.load();
        if (p) {
          if (toInput && !toInput.value && p.reportRecipients) toInput.value = p.reportRecipients;
          if (ccInput && !ccInput.value && p.ccRecipients) ccInput.value = p.ccRecipients;
        }
      } catch(e) {}
    }

    // Generate preview
    const tu = window.BarStockTheoreticalUsage;
    const currentWeek = tu?._currentWeek || tu?.getCurrentWeek?.();
    const summaryGrid = document.getElementById('tuSummaryGrid');
    const totalLoss = parseFloat(summaryGrid?.querySelector('.tu-metric-val')?.textContent?.replace(/[^0-9.]/g,'')) || 0;
    const itemsAnalyzed = parseInt(summaryGrid?.querySelectorAll('.tu-metric-val')?.[1]?.textContent) || 0;
    const noSalesCount = parseInt(summaryGrid?.querySelectorAll('.tu-metric-val')?.[2]?.textContent) || 0;

    const weekLabel = currentWeek?.week_start ? (() => {
      const d = new Date(currentWeek.week_start + 'T12:00:00');
      return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    })() : '';

    if (preview) {
      const canvas = generatePreviewCanvas({ weekLabel, weekStart: currentWeek?.week_start, totalLoss, itemsAnalyzed, noSalesCount });
      preview.innerHTML = '';
      canvas.style.cssText = 'width:100%;border-radius:8px;border:1px solid rgba(255,255,255,.1)';
      preview.appendChild(canvas);
    }

    modal.classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('emailTheoreticalModalBg')?.classList.add('hidden');
  }

  async function sendEmail() {
    const overlay = document.getElementById('emailTheoreticalSuccessOverlay');
    const circle  = document.getElementById('emailTheoreticalCheckCircle');
    const svg     = document.getElementById('emailTheoreticalCheckSvg');
    const msg     = document.getElementById('emailTheoreticalSuccessMsg');
    const sub     = document.getElementById('emailTheoreticalSuccessSub');

    const to  = String(document.getElementById('emailTheoreticalTo')?.value  || '').trim();
    const cc  = String(document.getElementById('emailTheoreticalCc')?.value  || '').trim();
    const btn = document.getElementById('emailTheoreticalSendBtn');

    if (!to || !to.split(',').map(e => e.trim()).filter(Boolean).every(isValidEmail)) {
      alert('Please enter a valid recipient email address.');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    try {
      const tu = window.BarStockTheoreticalUsage;
      const currentWeek = tu?._currentWeek;
      const summaryGrid = document.getElementById('tuSummaryGrid');
      const totalLoss = parseFloat(summaryGrid?.querySelector('.tu-metric-val')?.textContent?.replace(/[^0-9.]/g,'')) || 0;
      const itemsAnalyzed = parseInt(summaryGrid?.querySelectorAll('.tu-metric-val')?.[1]?.textContent) || 0;
      const noSalesCount = parseInt(summaryGrid?.querySelectorAll('.tu-metric-val')?.[2]?.textContent) || 0;

      const weekLabel = currentWeek?.week_start ? (() => {
        const d = new Date(currentWeek.week_start + 'T12:00:00');
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      })() : '';

      let senderName = '', senderEmail = '';
      if (window.BarStockSenderProfile) {
        try { const p = await window.BarStockSenderProfile.load(); senderName = p?.name || ''; senderEmail = p?.email || ''; } catch(e) {}
      }

      const pdfBase64 = await tu.generatePdf(true);
      if (!pdfBase64) throw new Error('PDF generation returned empty.');

      const loc = (window.BARSTOCK_CONFIG || {}).LOCATION_NAME || 'BarStock';
      const payload = {
        to, cc,
        locationName: loc,
        weekStart: currentWeek?.week_start,
        weekLabel,
        totalLoss, itemsAnalyzed, noSalesCount,
        senderName, senderEmail,
        pdfBase64,
        filename: `theoretical_usage_${currentWeek?.week_start}.pdf`,
      };

      closeModal();

      const res  = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Unknown error');

      if (overlay && circle && svg && msg && sub) {
        overlay.classList.remove('hidden');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
        circle.style.cssText = 'width:72px;height:72px;border-radius:50%;background:#1D9E75;display:flex;align-items:center;justify-content:center;margin:0 auto 16px';
        svg.setAttribute('viewBox','0 0 24 24');
        svg.innerHTML = '<polyline points="4 12 9 17 20 7" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        msg.textContent = 'Report sent!';
        sub.textContent = `Theoretical Usage report delivered to ${to}`;
        setTimeout(() => overlay.classList.add('hidden'), 3500);
      }
      if (typeof setStatus === 'function') setStatus('Theoretical Usage report emailed successfully.');
    } catch (err) {
      console.error('[EmailTheoretical]', err);
      alert('Could not send report: ' + (err.message || String(err)));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
    }
  }

  window.BarStockEmailTheoretical = { active: true, openModal, closeModal, sendEmail };
})();
