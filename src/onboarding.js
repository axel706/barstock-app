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
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:max(28px, env(safe-area-inset-top, 0px)) 16px 28px;overflow-y:auto;box-sizing:border-box;background:rgba(15,23,42,0.72);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);';

    el.innerHTML = `
      <div id="bsObContent" style="width:440px;max-width:100%;display:flex;flex-direction:column;align-items:center;opacity:0;transform:translateY(28px);transition:opacity 0.5s ease,transform 0.5s ease;margin:auto;">

        <div id="bsObWelcome" style="font-size:12px;font-weight:500;color:#38bdf8;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:6px;opacity:0;transition:opacity 0.5s ease;">Welcome to</div>

        <div style="position:relative;display:inline-flex;align-items:baseline;margin-bottom:16px;">
          <div id="bsObBarstock" style="font-size:52px;font-weight:800;letter-spacing:-0.03em;line-height:1;color:#f8fafc;opacity:0;transform:translateX(-10px);transition:opacity 0.5s ease,transform 0.5s ease;">Bar<b class="bs-stock">Stock</b></div>
          <div style="position:relative;display:inline-flex;align-items:flex-end;justify-content:center;width:14px;margin-bottom:8px;">
            <div id="bsObBurst1" style="position:absolute;border-radius:50%;background:#38bdf8;pointer-events:none;transform:translate(-50%,-50%);left:50%;top:50%;width:10px;height:10px;opacity:0;"></div>
            <div id="bsObBurst2" style="position:absolute;border-radius:50%;background:rgba(56,189,248,0.4);pointer-events:none;transform:translate(-50%,-50%);left:50%;top:50%;width:10px;height:10px;opacity:0;"></div>
            <div id="bsObDot" style="width:13px;height:13px;border-radius:50%;background:#38bdf8;opacity:0;transition:opacity 0.3s ease;position:relative;flex-shrink:0;"></div>
          </div>
          <div id="bsObPro" style="font-size:19px;font-weight:700;color:#64748b;margin-left:7px;letter-spacing:0.08em;text-transform:uppercase;opacity:0;transform:translateX(10px);transition:opacity 0.5s ease,transform 0.5s ease;">PRO</div>
        </div>

        <!-- ── La tarjeta, en dos pasos ───────────────────────────────
             Era una tarjeta de dos columnas (explicación a la izquierda,
             cinco campos a la derecha) que en el teléfono quedaba
             apretada y con los campos cortados. Diseño que Axel eligió
             sobre lámina: dos pasos, lo obligatorio primero y solo. Pidió
             que se quedaran la explicación y el "Skip for now" de antes. -->
        <div id="bsObCard" class="bsob-card" style="opacity:0;transform:translateY(16px);transition:opacity 0.5s ease,transform 0.5s ease;">
          <div class="bsob-pasos"><b class="on"></b><b id="bsObPaso2Marca"></b></div>

          <div id="bsObPaso1">
            <div class="bsob-k">Step 1 of 2</div>
            <div class="bsob-t">Where should vendors reply?</div>
            <p class="bsob-p">BarStock Pro sends order emails and cost reports directly to your vendors on your behalf.</p>
            <p class="bsob-p">We need a <strong>Reply To</strong> address so vendors know who to respond to. Their replies come straight back to it.</p>
            <label class="bsob-lab" for="bsObReplyTo">Reply To <span class="bsob-req">Required</span></label>
            <input id="bsObReplyTo" class="bsob-in" type="email" inputmode="email" autocomplete="email" placeholder="manager@yourbar.com">
            <div class="bsob-err" id="bsObErr"></div>
            <button id="bsObNext" class="bsob-btn" type="button">Continue</button>
          </div>

          <div id="bsObPaso2" hidden>
            <div class="bsob-k">Step 2 of 2 · Optional</div>
            <div class="bsob-t">How should emails be signed?</div>
            <p class="bsob-p">Your <strong>Sender Profile</strong> appears as the signature on every email sent from BarStock Pro.</p>
            <div class="bsob-firma" aria-hidden="true">
              <small>Signature preview</small>
              <b id="bsObFName">Your name</b>
              <span id="bsObFTitle"></span>
              <span id="bsObFContact"></span>
            </div>
            <div class="bsob-dos">
              <div><label class="bsob-lab" for="bsObName">Name</label>
                <input id="bsObName" class="bsob-in" type="text" autocomplete="name" placeholder="Jamie Rivera"></div>
              <div><label class="bsob-lab" for="bsObTitle">Title</label>
                <input id="bsObTitle" class="bsob-in" type="text" autocomplete="organization-title" placeholder="Bar Manager"></div>
            </div>
            <div class="bsob-dos">
              <div><label class="bsob-lab" for="bsObEmail">Email</label>
                <input id="bsObEmail" class="bsob-in" type="email" inputmode="email" autocomplete="email" placeholder="jamie@bar.com"></div>
              <div><label class="bsob-lab" for="bsObPhone">Phone</label>
                <input id="bsObPhone" class="bsob-in" type="tel" autocomplete="tel" placeholder="312 555 0192"></div>
            </div>
            <button id="bsObSaveBtn" class="bsob-btn" type="button">Save & continue</button>
            <div class="bsob-links">
              <button id="bsObBack" class="bsob-link" type="button">Back</button>
              <button id="bsObSkipPerfil" class="bsob-link" type="button">Skip this step</button>
            </div>
          </div>
        </div>

        <div id="bsObSkip" style="font-size:12px;color:#64748b;margin-top:14px;cursor:pointer;opacity:0;transition:opacity 0.5s ease;padding:8px;">Skip for now</div>
      </div>
    `;

    document.body.appendChild(el);
    document.getElementById('bsObNext').onclick = siguiente;
    document.getElementById('bsObSaveBtn').onclick = () => save(true);
    document.getElementById('bsObSkipPerfil').onclick = () => save(false);
    document.getElementById('bsObBack').onclick = () => paso(1);
    document.getElementById('bsObSkip').onclick = dismiss;
    ['bsObName', 'bsObTitle', 'bsObEmail', 'bsObPhone'].forEach(id => {
      document.getElementById(id).oninput = firma;
    });
    document.getElementById('bsObReplyTo').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); siguiente(); }
    });
    rellenar();

    runAnimation();
  }

  // Lo que ya hubiera guardado se trae puesto: la pantalla sale si falta
  // el Reply To O el perfil, y pedir otra vez lo que ya se dio obliga a
  // escribirlo dos veces.
  async function rellenar() {
    try {
      const [settings, profile] = await Promise.all([
        window.BarStockLocationSettings?.getSettings?.(),
        window.BarStockSenderProfile?.getProfile?.()
      ]);
      const pon = (id, v) => { const x = document.getElementById(id); if (x && v && !x.value) x.value = v; };
      pon('bsObReplyTo', settings?.reply_to_email);
      pon('bsObName', profile?.name); pon('bsObEmail', profile?.email);
      pon('bsObPhone', profile?.phone); pon('bsObTitle', profile?.title);
      firma();
    } catch (e) {}
  }

  // La firma de ejemplo se escribe sola mientras se llena el perfil: es
  // lo que de verdad explica para qué sirve.
  function firma() {
    const v = (id) => (document.getElementById(id)?.value || '').trim();
    const n = document.getElementById('bsObFName');
    if (!n) return;
    n.textContent = v('bsObName') || 'Your name';
    document.getElementById('bsObFTitle').textContent = v('bsObTitle');
    document.getElementById('bsObFContact').textContent = [v('bsObEmail'), v('bsObPhone')].filter(Boolean).join(' · ');
  }

  function paso(n) {
    document.getElementById('bsObPaso1').hidden = n !== 1;
    document.getElementById('bsObPaso2').hidden = n !== 2;
    document.getElementById('bsObPaso2Marca').classList.toggle('on', n === 2);
    // "Skip for now" (no guardar nada) solo tiene sentido en el paso 1;
    // en el 2 ya está "Skip this step", que sí guarda el Reply To.
    const sk = document.getElementById('bsObSkip');
    if (sk) sk.style.display = n === 1 ? '' : 'none';
    const foco = document.getElementById(n === 1 ? 'bsObReplyTo' : 'bsObName');
    // Sin foco automático en el teléfono: abriría el teclado encima de la
    // explicación antes de que se lea.
    if (foco && !(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) foco.focus();
  }

  // Un @ con algo a cada lado y un punto después: lo justo para cazar el
  // error de dedo, no una validación de correo de verdad.
  const pareceCorreo = (t) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);

  function siguiente() {
    const inp = document.getElementById('bsObReplyTo');
    const err = document.getElementById('bsObErr');
    const v = (inp?.value || '').trim();
    if (!v || !pareceCorreo(v)) {
      inp.classList.add('mal');
      err.textContent = v ? "That doesn't look like an email address." : 'Add an email address to continue.';
      inp.focus();
      return;
    }
    inp.classList.remove('mal'); err.textContent = '';
    paso(2);
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

  // conPerfil=false es "Skip this step": se guarda solo el Reply To del
  // paso 1, que es lo obligatorio.
  async function save(conPerfil) {
    const btn = document.getElementById(conPerfil ? 'bsObSaveBtn' : 'bsObSkipPerfil');
    const replyTo = document.getElementById('bsObReplyTo')?.value?.trim();
    const name    = document.getElementById('bsObName')?.value?.trim();
    const email   = document.getElementById('bsObEmail')?.value?.trim();
    const phone   = document.getElementById('bsObPhone')?.value?.trim();
    const title   = document.getElementById('bsObTitle')?.value?.trim();

    if (!replyTo || !pareceCorreo(replyTo)) { paso(1); siguiente(); return; }

    const texto = btn ? btn.textContent : '';
    if (btn) { btn.disabled=true; btn.textContent='Saving...'; }

    try {
      await Promise.all([
        window.BarStockLocationSettings?.saveSettings?.({ reply_to_email: replyTo }),
        conPerfil && (name || email) && window.BarStockSenderProfile?.saveProfile?.({ name, email, phone, title })
      ]);
      runOutroAndDismiss();
    } catch(err) {
      console.error('Onboarding save error:', err);
      if (btn) { btn.disabled=false; btn.textContent=texto; }
    }
  }

  function runOutroAndDismiss() {
    const el = document.getElementById(OVERLAY_ID);
    if (!el) { dismiss(); return; }

    // Ocultar card y skip
    const card = document.getElementById('bsObCard');
    const skip = document.getElementById('bsObSkip');
    const welcome = document.getElementById('bsObWelcome');
    if (card) { card.style.transition='opacity 0.5s ease'; card.style.opacity='0'; card.style.pointerEvents='none'; }
    if (skip) { skip.style.opacity='0'; }
    if (welcome) { welcome.style.opacity='0'; }

    // Reemplazar logo con version animable
    const logoWrap = document.getElementById('bsObContent');
    const outroDiv = document.createElement('div');
    outroDiv.style.cssText = 'display:inline-flex;align-items:baseline;font-size:64px;font-weight:800;letter-spacing:-0.03em;line-height:1;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100000;';
    outroDiv.innerHTML = `
      <div class="bsOutroBarstock" id="bsOutroBarstock">BarStock</div>
      <div style="position:relative;display:inline-flex;align-items:flex-end;justify-content:center;width:14px;margin-bottom:8px;">
        <div class="bsGlowRing" id="bsGlowRing1" style="width:40px;height:40px;background:radial-gradient(circle, rgba(56,189,248,0.95) 0%, rgba(56,189,248,0.5) 35%, transparent 70%);"></div>
        <div class="bsGlowRing" id="bsGlowRing2" style="width:80px;height:80px;background:radial-gradient(circle, rgba(56,189,248,0.6) 0%, rgba(56,189,248,0.2) 45%, transparent 70%);"></div>
        <div class="bsOutroDot" id="bsOutroDot"></div>
      </div>
      <div class="bsOutroPro" id="bsOutroPro">PRO</div>
    `;

    // Ocultar logo original
    const origLogo = logoWrap.querySelector('div[style*="inline-flex"][style*="margin-bottom"]');
    if (origLogo) origLogo.style.display = 'none';
    logoWrap.appendChild(outroDiv);

    // Correr animacion
    setTimeout(() => {
      document.getElementById('bsOutroBarstock').classList.add('hide');
      document.getElementById('bsOutroPro').classList.add('hide');
    }, 400);

    setTimeout(() => {
      const r1 = document.getElementById('bsGlowRing1');
      const r2 = document.getElementById('bsGlowRing2');
      r1.style.transition = 'opacity 0.5s ease';
      r2.style.transition = 'opacity 0.5s ease';
      r1.style.opacity = '1';
      r2.style.opacity = '1';
      setTimeout(() => {
        r1.style.transition = 'transform 1.8s cubic-bezier(0.4,0,0.15,1), opacity 1.8s ease';
        r2.style.transition = 'transform 1.8s cubic-bezier(0.4,0,0.15,1), opacity 1.4s ease';
        r1.style.transform = 'translate(-50%,-50%) scale(0)';
        r2.style.transform = 'translate(-50%,-50%) scale(0)';
        r2.style.opacity = '0';
      }, 80);
    }, 1100);

    setTimeout(() => {
      const dot = document.getElementById('bsOutroDot');
      dot.classList.add('flash');
      setTimeout(() => {
        dot.classList.remove('flash');
        dot.classList.add('hide');
      }, 200);
    }, 2950);

    // Dismiss completo
    setTimeout(() => dismiss(), 3400);
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
    /* Todo con el id del overlay delante: app.css fuerza 999px de radio a
       todo <button> y le da a <input> fondo, borde y sombra propios. */
    #bsOnboardingOverlay .bsob-card { background:rgba(10,18,35,0.92);border:1px solid rgba(255,255,255,0.16);border-radius:20px;padding:20px 18px;width:100%;box-sizing:border-box;text-align:left; }
    #bsOnboardingOverlay .bsob-pasos { display:flex;gap:6px;justify-content:center;margin-bottom:16px; }
    #bsOnboardingOverlay .bsob-pasos b { width:24px;height:4px;border-radius:4px;background:rgba(255,255,255,0.15); }
    #bsOnboardingOverlay .bsob-pasos b.on { background:#38bdf8; }
    #bsOnboardingOverlay .bsob-k { font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#7dd3fc; }
    #bsOnboardingOverlay .bsob-t { margin-top:6px;font-size:19px;font-weight:800;color:#fff;letter-spacing:-0.2px;line-height:1.25; }
    #bsOnboardingOverlay .bsob-p { margin:10px 0 0;font-size:14px;color:#cbd5e1;line-height:1.55; }
    #bsOnboardingOverlay .bsob-p strong { color:#fff;font-weight:700; }
    #bsOnboardingOverlay .bsob-lab { display:block;margin-top:14px;font-size:12.5px;font-weight:700;color:#cbd5e1; }
    #bsOnboardingOverlay .bsob-req { font-size:11px;background:rgba(239,68,68,0.15);color:#f87171;padding:1px 7px;border-radius:20px;margin-left:4px;font-weight:600; }
    #bsOnboardingOverlay .bsob-in { display:block;width:100%;box-sizing:border-box;margin-top:6px;height:46px;padding:0 13px;border-radius:12px !important;border:1px solid rgba(255,255,255,0.14) !important;background:rgba(255,255,255,0.07) !important;box-shadow:none !important;color:#f1f5f9;font-size:14px; }
    #bsOnboardingOverlay .bsob-in::placeholder { color:#64748b; }
    #bsOnboardingOverlay .bsob-in:focus { outline:none;border-color:#38bdf8 !important;background:rgba(56,189,248,0.07) !important; }
    #bsOnboardingOverlay .bsob-in.mal { border-color:#f87171 !important; }
    /* iOS amplía la pantalla al enfocar un campo de menos de 16px y la
       app no deja volver. Los de antes eran de 13px. Solo en táctil: en
       el escritorio se quedan en 14. */
    @media (pointer: coarse) { #bsOnboardingOverlay .bsob-in { font-size:max(16px, 14px); } }
    #bsOnboardingOverlay .bsob-err { min-height:0;margin-top:6px;font-size:12.5px;color:#f87171; }
    #bsOnboardingOverlay .bsob-err:empty { display:none; }
    #bsOnboardingOverlay .bsob-dos { display:grid;grid-template-columns:1fr 1fr;gap:10px; }
    #bsOnboardingOverlay .bsob-firma { margin-top:14px;padding:11px 13px;border-radius:14px;background:rgba(255,255,255,0.04);border:1px dashed rgba(255,255,255,0.2); }
    #bsOnboardingOverlay .bsob-firma small { display:block;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#64748b; }
    #bsOnboardingOverlay .bsob-firma b { display:block;margin-top:5px;font-size:14.5px;color:#fff; }
    #bsOnboardingOverlay .bsob-firma span { display:block;margin-top:2px;font-size:12.5px;color:#94a3b8;overflow-wrap:anywhere; }
    #bsOnboardingOverlay .bsob-firma span:empty { display:none; }
    #bsOnboardingOverlay .bsob-btn { display:block;width:100%;height:50px;margin-top:18px;border-radius:14px !important;background:#22c55e;border:none;box-shadow:none;color:#fff;font-size:15.5px;font-weight:800;cursor:pointer;-webkit-backdrop-filter:none;backdrop-filter:none; }
    #bsOnboardingOverlay .bsob-btn:hover { background:#16a34a; }
    #bsOnboardingOverlay .bsob-btn:disabled { opacity:0.6;cursor:default; }
    #bsOnboardingOverlay .bsob-links { display:flex;justify-content:space-between;margin-top:10px; }
    #bsOnboardingOverlay .bsob-link { background:none;border:none;box-shadow:none;padding:8px 4px;font-size:13px;color:#94a3b8;cursor:pointer;-webkit-backdrop-filter:none;backdrop-filter:none; }
    #bsOnboardingOverlay .bsob-link:hover { color:#e2e8f0; }
    /* En el teléfono, más apretado: el paso 2 (firma y cuatro campos)
       tiene que caber con su botón sin desplazar. El logo a 52px se comía
       un tercio de la pantalla. */
    @media (max-width: 640px) {
      #bsObBarstock { font-size:36px !important; } #bsObPro { font-size:14px !important; }
      #bsOnboardingOverlay .bsob-card { padding:16px 16px; }
      #bsOnboardingOverlay .bsob-pasos { margin-bottom:12px; }
      #bsOnboardingOverlay .bsob-lab { margin-top:11px; }
      #bsOnboardingOverlay .bsob-in { height:44px; }
      #bsOnboardingOverlay .bsob-firma { margin-top:11px;padding:9px 12px; }
      #bsOnboardingOverlay .bsob-btn { margin-top:15px;height:48px; }
    }
    #bsObSkip:hover { color:#94a3b8 !important; }
    .bsOutroBarstock { color:#f8fafc;opacity:1;transition:opacity 0.9s ease,transform 0.9s ease; }
    .bsOutroBarstock.hide { opacity:0 !important;transform:translateX(-10px) !important; }
    .bsOutroPro { color:#64748b;font-size:22px;font-weight:700;margin-left:7px;letter-spacing:0.08em;text-transform:uppercase;opacity:1;transition:opacity 0.9s ease,transform 0.9s ease;align-self:flex-end;margin-bottom:6px; }
    .bsOutroPro.hide { opacity:0 !important;transform:translateX(10px) !important; }
    .bsOutroDot { width:13px;height:13px;border-radius:50%;background:#38bdf8;position:relative;z-index:3;transition:opacity 0.2s ease,box-shadow 0.2s ease;flex-shrink:0; }
    .bsOutroDot.flash { box-shadow:0 0 0 6px rgba(56,189,248,0.6),0 0 30px 10px rgba(56,189,248,0.8),0 0 60px 20px rgba(56,189,248,0.4);background:#fff; }
    .bsOutroDot.hide { opacity:0 !important;box-shadow:none !important; }
    .bsGlowRing { position:absolute;border-radius:50%;left:50%;top:50%;transform:translate(-50%,-50%) scale(10);opacity:0;pointer-events:none;z-index:2; }
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
