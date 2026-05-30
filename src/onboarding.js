(() => {

  const OVERLAY_ID = 'bsOnboardingOverlay';

  async function checkAndShow() {
    try {
      const [settings, profile] = await Promise.all([
        window.BarStockLocationSettings?.getSettings?.(),
        window.BarStockSenderProfile?.getProfile?.()
      ]);

      const missingReplyTo = !settings?.reply_to_email;
      const missingProfile = !profile?.name && !profile?.email;

      if (!missingReplyTo && !missingProfile) return;

      show();
    } catch(err) {
      console.warn('Onboarding check failed:', err);
    }
  }

  function show() {
    if (document.getElementById(OVERLAY_ID)) return;

    const el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:40px 20px;overflow-y:auto;background:rgba(15,23,42,0.72);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);';

    el.innerHTML = `
      <div id="bsObContent" style="width:580px;max-width:95vw;display:flex;flex-direction:column;align-items:center;opacity:0;transform:translateY(28px);transition:opacity 0.5s ease,transform 0.5s ease;margin:auto;">

        <div id="bsObWelcome" style="font-size:12px;font-weight:500;color:#38bdf8;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:6px;opacity:0;transition:opacity 0.5s ease;">Welcome to</div>

        <div style="position:relative;display:inline-flex;align-items:baseline;margin-bottom:16px;">
          <div id="bsObBarstock" style="font-size:52px;font-weight:800;letter-spacing:-0.03em;line-height:1;color:#f8fafc;opacity:0;transform:translateX(-10px);transition:opacity 0.5s ease,transform 0.5s ease;">BarStock</div>
          <div style="position:relative;display:inline-flex;align-items:baseline;">
            <div id="bsObBurst1" style="position:absolute;border-radius:50%;background:#38bdf8;pointer-events:none;transform:translate(-50%,-50%);left:50%;top:40%;width:10px;height:10px;opacity:0;"></div>
            <div id="bsObBurst2" style="position:absolute;border-radius:50%;background:rgba(56,189,248,0.4);pointer-events:none;transform:translate(-50%,-50%);left:50%;top:40%;width:10px;height:10px;opacity:0;"></div>
            <div id="bsObDot" style="font-size:52px;font-weight:800;color:#38bdf8;opacity:0;transition:opacity 0.3s ease;position:relative;">.</div>
          </div>
          <div id="bsObPro" style="font-size:19px;font-weight:700;color:#64748b;margin-left:7px;letter-spacing:0.08em;text-transform:uppercase;opacity:0;transform:translateX(10px);transition:opacity 0.5s ease,transform 0.5s ease;">PRO</div>
        </div>

        <div id="bsObCard" style="background:rgba(10,18,35,0.92);border:0.5px solid rgba(255,255,255,0.2);border-radius:16px;padding:28px 32px;width:100%;box-sizing:border-box;opacity:0;transform:translateY(16px);transition:opacity 0.5s ease,transform 0.5s ease;">
          <div style="font-size:17px;font-weight:500;color:#ffffff;margin-bottom:10px;text-align:center;">One last thing before you get started</div>
          <div style="font-size:13px;color:#e2e8f0;line-height:1.65;margin-bottom:20px;text-align:center;">
            BarStock Pro sends order emails and cost reports directly to your vendors on your behalf.<br><br>
            We need a <strong style="color:#cbd5e1;font-weight:500;">Reply To</strong> address so vendors know who to respond to, and a <strong style="color:#cbd5e1;font-weight:500;">Sender Profile</strong> with your name and contact info — it appears as the signature on every email sent from BarStock Pro.
          </div>

          <div style="display:flex;flex-direction:column;gap:14px;">
            <div style="display:flex;flex-direction:column;gap:5px;">
              <div style="font-size:12px;font-weight:500;color:#cbd5e1;display:flex;align-items:center;gap:6px;">Reply To <span style="font-size:11px;background:rgba(239,68,68,0.15);color:#f87171;padding:1px 7px;border-radius:20px;">Required</span></div>
              <input id="bsObReplyTo" type="email" placeholder="manager@yourbar.com" style="height:38px;border-radius:8px;border:0.5px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.07);padding:0 12px;font-size:13px;color:#f1f5f9;width:100%;box-sizing:border-box;">
            </div>
            <div style="width:100%;height:0.5px;background:rgba(255,255,255,0.08);"></div>
            <div style="font-size:11px;font-weight:500;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;">Sender Profile</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div style="display:flex;flex-direction:column;gap:5px;">
                <div style="font-size:12px;font-weight:500;color:#cbd5e1;">Name</div>
                <input id="bsObName" type="text" placeholder="Jamie Rivera" style="height:38px;border-radius:8px;border:0.5px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.07);padding:0 12px;font-size:13px;color:#f1f5f9;width:100%;box-sizing:border-box;">
              </div>
              <div style="display:flex;flex-direction:column;gap:5px;">
                <div style="font-size:12px;font-weight:500;color:#cbd5e1;">Email</div>
                <input id="bsObEmail" type="email" placeholder="jamie@yourbar.com" style="height:38px;border-radius:8px;border:0.5px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.07);padding:0 12px;font-size:13px;color:#f1f5f9;width:100%;box-sizing:border-box;">
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div style="display:flex;flex-direction:column;gap:5px;">
                <div style="font-size:12px;font-weight:500;color:#cbd5e1;">Phone</div>
                <input id="bsObPhone" type="tel" placeholder="+1 312 555 0192" style="height:38px;border-radius:8px;border:0.5px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.07);padding:0 12px;font-size:13px;color:#f1f5f9;width:100%;box-sizing:border-box;">
              </div>
              <div style="display:flex;flex-direction:column;gap:5px;">
                <div style="font-size:12px;font-weight:500;color:#cbd5e1;">Title</div>
                <input id="bsObTitle" type="text" placeholder="Bar Manager" style="height:38px;border-radius:8px;border:0.5px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.07);padding:0 12px;font-size:13px;color:#f1f5f9;width:100%;box-sizing:border-box;">
              </div>
            </div>
          </div>

          <button id="bsObSaveBtn" style="width:100%;height:46px;border-radius:10px;background:#fff;border:none;color:#0f172a;font-size:15px;font-weight:700;cursor:pointer;margin-top:24px;">Save & continue</button>
        </div>

        <div id="bsObSkip" style="font-size:12px;color:#475569;margin-top:14px;cursor:pointer;opacity:0;transition:opacity 0.5s ease;">Skip for now</div>
      </div>
    `;

    document.body.appendChild(el);
    document.getElementById('bsObSaveBtn').onclick = save;
    document.getElementById('bsObSkip').onclick = dismiss;

    runAnimation();
  }

  function runAnimation() {
    const content = document.getElementById('bsObContent');
    const welcome = document.getElementById('bsObWelcome');
    const dot     = document.getElementById('bsObDot');
    const burst1  = document.getElementById('bsObBurst1');
    const burst2  = document.getElementById('bsObBurst2');
    const barstock = document.getElementById('bsObBarstock');
    const pro     = document.getElementById('bsObPro');
    const card    = document.getElementById('bsObCard');
    const skip    = document.getElementById('bsObSkip');

    setTimeout(() => { content.style.opacity='1'; content.style.transform='translateY(0)'; }, 50);
    setTimeout(() => { welcome.style.opacity='1'; }, 100);
    setTimeout(() => { dot.style.opacity='1'; }, 500);
    setTimeout(() => {
      burst1.style.transition='none'; burst2.style.transition='none';
      burst1.style.opacity='0.7'; burst2.style.opacity='0.5';
      burst1.style.animation='bsObBurst 0.7s ease-out forwards';
      burst2.style.animation='bsObRays 0.85s ease-out forwards';
    }, 700);
    setTimeout(() => { barstock.style.opacity='1'; barstock.style.transform='translateX(0)'; pro.style.opacity='1'; pro.style.transform='translateX(0)'; }, 1100);
    setTimeout(() => { card.style.opacity='1'; card.style.transform='translateY(0)'; skip.style.opacity='1'; }, 1500);
  }

  async function save() {
    const btn = document.getElementById('bsObSaveBtn');
    const replyTo = document.getElementById('bsObReplyTo')?.value?.trim();
    const name    = document.getElementById('bsObName')?.value?.trim();
    const email   = document.getElementById('bsObEmail')?.value?.trim();
    const phone   = document.getElementById('bsObPhone')?.value?.trim();
    const title   = document.getElementById('bsObTitle')?.value?.trim();

    if (!replyTo) {
      document.getElementById('bsObReplyTo').style.borderColor='#f87171';
      document.getElementById('bsObReplyTo').focus();
      return;
    }

    if (btn) { btn.disabled=true; btn.textContent='Saving...'; }

    try {
      await Promise.all([
        window.BarStockLocationSettings?.saveSettings?.({ reply_to_email: replyTo }),
        (name || email) && window.BarStockSenderProfile?.saveProfile?.({ name, email, phone, title })
      ]);
      dismiss();
    } catch(err) {
      console.error('Onboarding save error:', err);
      if (btn) { btn.disabled=false; btn.textContent='Save & continue'; }
    }
  }

  function dismiss() {
    const el = document.getElementById(OVERLAY_ID);
    if (!el) return;
    el.style.transition='opacity 0.4s ease';
    el.style.opacity='0';
    setTimeout(() => el.remove(), 400);
  }

  const style = document.createElement('style');
  style.textContent = `
    @keyframes bsObBurst { 0%{opacity:0.7;transform:translate(-50%,-50%) scale(1)} 100%{opacity:0;transform:translate(-50%,-50%) scale(18)} }
    @keyframes bsObRays  { 0%{opacity:0.5;transform:translate(-50%,-50%) scale(1) rotate(0deg)} 100%{opacity:0;transform:translate(-50%,-50%) scale(12) rotate(15deg)} }
    #bsObReplyTo:focus,#bsObName:focus,#bsObEmail:focus,#bsObPhone:focus,#bsObTitle:focus { outline:none;border-color:#38bdf8 !important;background:rgba(56,189,248,0.07) !important; }
    #bsObSaveBtn:hover { background:#e0f2fe !important; }
    #bsObSkip:hover { color:#94a3b8 !important; }
  `;
  document.head.appendChild(style);

  window.BarStockOnboarding = { checkAndShow, dismiss };

  // Esperar a que todos los modulos esten listos
  let _checked = false;
  function tryCheck() {
    if (_checked) return;
    if (!window.BarStockLocationSettings || !window.BarStockSenderProfile) {
      setTimeout(tryCheck, 300);
      return;
    }
    _checked = true;
    setTimeout(() => checkAndShow(), 800);
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(tryCheck, 1000));

})();
