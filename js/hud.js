import * as tools from './tools.js';

// ============================================================
//  hud.js — HUD・UI 描画管理 (元の美しいデザイン ＋ 滑らかな針の動き)
// ============================================================

// --- 滑らかな描画のための「表示用変数（Visual values）」 ---
let V = { windDir: 0, windSpeed: 0, shipSpeed: 0, rudderAngle: 0, yawRate: 0, rpm: 0 };
const smoothRate = 4.0;
const angleSmoothRate = 2.0;

function smoothAngle(current, target, rate, delta) {
    let diff = target - current;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    return current + diff * (1 - Math.exp(-rate * delta));
}
function smoothValue(current, target, rate, delta) {
    return current + (target - current) * (1 - Math.exp(-rate * delta));
}

// --- 初期化 ---
export function initHUD() {
    // もし前回作ってしまった全画面キャンバスがあれば削除
    const oldCanvas = document.getElementById('hudCanvas');
    if (oldCanvas) oldCanvas.remove();

    // 個別メーターのコンテナを確実に表示
    const container = document.getElementById('gauges-container');
    if (container) {
        container.style.display = 'flex';
        container.classList.remove('h');
    }
}

// ============================================================
//  メイン描画ループ
// ============================================================
export function updateDashboard(P, simTime = 0, curM = null, mst = null) {
    const dt = 0.016;
    const hdgDeg = P.heading * 180 / Math.PI;
    const relWind = ((P.windDir - hdgDeg) % 360 + 360) % 360;

    // --- 値のスムージング処理 ---
    V.windDir = smoothAngle(V.windDir, relWind, angleSmoothRate, dt);
    V.windSpeed = smoothValue(V.windSpeed, P.windSpeed, smoothRate, dt);
    V.shipSpeed = smoothValue(V.shipSpeed, P.speed, smoothRate, dt);
    V.rudderAngle = smoothValue(V.rudderAngle, P.rudder, smoothRate, dt);
    V.yawRate = smoothValue(V.yawRate, P.yawRate * (180 / Math.PI) * 60, angleSmoothRate, dt);
    V.rpm = smoothValue(V.rpm, P.rpm, smoothRate, dt);

    // --- 各Canvasの取得 ---
    const cvs = {
        windDir: document.getElementById('wind-dir-canvas'),
        windSpeed: document.getElementById('wind-speed-canvas'),
        shipSpeed: document.getElementById('ship-speed-canvas'),
        rudder: document.getElementById('rudder-canvas'),
        rot: document.getElementById('rot-canvas'),
        rpm: document.getElementById('rpm-canvas'),
        clock: document.getElementById('clock-canvas')
    };

    // --- メーター描画（元の美しいデザイン） ---
    if (cvs.windDir) {
        drawWindDirGauge(cvs.windDir.getContext('2d'), V.windDir);
    }
    if (cvs.windSpeed) {
        let ctx = cvs.windSpeed.getContext('2d');
        drawBase(ctx, 'WIND SPEED', 'KNOTS', 0, 100, 20, 5);
        drawNeedle(ctx, V.windSpeed, 0, 100);
    }
    if (cvs.shipSpeed) {
        let ctx = cvs.shipSpeed.getContext('2d');
        drawBase(ctx, 'SPEED', 'KNOTS', 0, 40, 10, 1);
        drawColorArc(ctx, 0, 40, 0, 10, '#d32f2f', 40, 4);
        drawNeedle(ctx, V.shipSpeed, 0, 40);
    }
    if (cvs.rudder) {
        let ctx = cvs.rudder.getContext('2d');
        drawBase(ctx, 'RUDDER', 'DEG', -35, 35, 10, 5);
        drawColorArc(ctx, -35, 35, -35, 0, '#d32f2f', 40, 5);
        drawColorArc(ctx, -35, 35, 0, 35, '#388e3c', 40, 5);
        ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#d32f2f'; ctx.fillText('PORT', 45, 90);
        ctx.fillStyle = '#388e3c'; ctx.fillText('STBD', 115, 90);
        drawNeedle(ctx, V.rudderAngle, -35, 35, true);
    }
    if (cvs.rot) {
        let ctx = cvs.rot.getContext('2d');
        drawBase(ctx, 'RATE OF TURN', 'DEG/MIN', -30, 30, 10, 5);
        drawColorArc(ctx, -30, 30, -30, 0, '#d32f2f', 40, 5);
        drawColorArc(ctx, -30, 30, 0, 30, '#388e3c', 40, 5);
        ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#d32f2f'; ctx.fillText('PORT', 45, 80);
        ctx.fillStyle = '#388e3c'; ctx.fillText('STBD', 115, 80);
        drawNeedle(ctx, V.yawRate, -30, 30);
    }
    if (cvs.rpm) {
        let ctx = cvs.rpm.getContext('2d');
        drawBase(ctx, 'ENGINE', 'RPM', -50, 120, 20, 5);
        drawColorArc(ctx, -50, 120, -50, 0, '#d32f2f', 40, 4);
        drawColorArc(ctx, -50, 120, 60, 90, '#388e3c', 40, 4);
        drawColorArc(ctx, -50, 120, 90, 120, '#d32f2f', 40, 4);
        drawNeedle(ctx, V.rpm, -50, 120);

        if (P.engineOverload && Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#d32f2f'; ctx.textAlign = 'center'; ctx.fillText('OVERLOAD', 80, 115);
        }
    }
    if (cvs.clock) {
        updateClockOriginal(cvs.clock.getContext('2d'), simTime, curM, mst);
    }
}

// ============================================================
//  元の美しい描画ロジック群（script.js から移植）
// ============================================================

function drawBase(ctx, title, unit, min, max, majorTicks, minorTicks) {
    const cx = 80; const cy = 80; const radius = 70;
    ctx.clearRect(0, 0, 160, 160);
    let grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#d5d5d5');
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();

    for (let i = min; i <= max; i += minorTicks) {
        let percent = (i - min) / (max - min);
        let angle = (percent * 270 - 135) * Math.PI / 180 - (Math.PI / 2);
        let startR = radius - 6; let endR = radius; if (i % majorTicks === 0) startR -= 6;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * startR, cy + Math.sin(angle) * startR); ctx.lineTo(cx + Math.cos(angle) * endR, cy + Math.sin(angle) * endR);
        ctx.lineWidth = i % majorTicks === 0 ? 2 : 1; ctx.strokeStyle = '#333'; ctx.stroke();
        if (i % majorTicks === 0) {
            ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            let textR = radius - 18; ctx.fillText(i, cx + Math.cos(angle) * textR, cy + Math.sin(angle) * textR);
        }
    }

    ctx.textAlign = 'center';
    let textY = cy - 36;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = 'bold 11px sans-serif';
    ctx.strokeText(title, cx, textY);
    ctx.fillStyle = '#111';
    ctx.fillText(title, cx, textY);
    
    ctx.font = '10px sans-serif';
    ctx.strokeText(unit, cx, textY + 11);
    ctx.fillStyle = '#444';
    ctx.fillText(unit, cx, textY + 11);
}

function drawColorArc(ctx, minVal, maxVal, arcMin, arcMax, color, radius, width) {
    let p1 = (arcMin - minVal) / (maxVal - minVal); let p2 = (arcMax - minVal) / (maxVal - minVal);
    let a1 = (p1 * 270 - 135) * Math.PI / 180 - (Math.PI / 2); let a2 = (p2 * 270 - 135) * Math.PI / 180 - (Math.PI / 2);
    ctx.beginPath(); ctx.arc(80, 80, radius, a1, a2); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.stroke();
}

function drawNeedle(ctx, value, min, max, isRudder = false) {
    const cx = 80; const cy = 80; const radius = 55;
    const clampedValue = Math.max(min, Math.min(max, value));
    const percent = (clampedValue - min) / (max - min);
    const angle = (percent * 270 - 135) * Math.PI / 180 - (Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.lineWidth = 4; ctx.strokeStyle = isRudder ? '#d32f2f' : '#222'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fillStyle = '#222'; ctx.fill();
}

function drawTextOverlay(ctx, title, unit) {
    const cx = 80; const cy = 80; let textY = cy - 36;
    ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = 'bold 11px sans-serif'; ctx.strokeText(title, cx, textY); ctx.fillStyle = '#111'; ctx.fillText(title, cx, textY);
    ctx.font = '10px sans-serif'; ctx.strokeText(unit, cx, textY + 11); ctx.fillStyle = '#444'; ctx.fillText(unit, cx, textY + 11);
}

function drawWindDirGauge(ctx, windDirDeg) {
    const cx = 80; const cy = 80; const radius = 70;
    ctx.clearRect(0, 0, 160, 160);
    let grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius); grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#d5d5d5');
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();

    ctx.save(); ctx.fillStyle = 'rgba(100, 100, 100, 0.3)'; ctx.translate(cx, cy);
    ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(12, 1); ctx.lineTo(10, 23); ctx.lineTo(0, 28); ctx.lineTo(-10, 23); ctx.lineTo(-12, 1); ctx.closePath(); ctx.fill(); ctx.restore();

    for (let i = 0; i < 360; i += 10) {
        let angleCompass = (i * Math.PI / 180) - (Math.PI / 2);
        let startR = radius - 6; let endR = radius; if (i % 30 === 0) startR -= 6;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(angleCompass) * startR, cy + Math.sin(angleCompass) * startR); ctx.lineTo(cx + Math.cos(angleCompass) * endR, cy + Math.sin(angleCompass) * endR);
        ctx.lineWidth = i % 30 === 0 ? 2 : 1; ctx.strokeStyle = '#333'; ctx.stroke();
        if (i % 30 === 0 && i !== 0) {
            ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            let textR = radius - 18; ctx.fillText(i, cx + Math.cos(angleCompass) * textR, cy + Math.sin(angleCompass) * textR);
        }
    }
    
    const angleNeedle = (windDirDeg * Math.PI / 180) - (Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angleNeedle) * 55, cy + Math.sin(angleNeedle) * 55);
    ctx.lineWidth = 4; ctx.strokeStyle = '#222'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fillStyle = '#222'; ctx.fill();

    drawTextOverlay(ctx, 'WIND DIR', 'DEG (REL)');
}

function updateClockOriginal(ctx, simTime, curM, mst) {
    const cx = 80; const cy = 80; ctx.clearRect(0, 0, 160, 160);
    let grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 70); grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#d5d5d5');
    ctx.beginPath(); ctx.arc(cx, cy, 70, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
    for (let i = 0; i < 60; i++) { let angle = (i * 6 - 90) * Math.PI / 180; let startR = 64; let endR = 70; if (i % 5 === 0) startR -= 6; ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * startR, cy + Math.sin(angle) * startR); ctx.lineTo(cx + Math.cos(angle) * endR, cy + Math.sin(angle) * endR); ctx.lineWidth = 2; ctx.strokeStyle = '#333'; ctx.stroke(); }
    ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; for (let i = 1; i <= 12; i++) { let angle = (i * 30 - 90) * Math.PI / 180; ctx.fillText(i, cx + Math.cos(angle) * 50, cy + Math.sin(angle) * 50); }
    
    let elapsed = (mst && mst.t0) ? simTime - mst.t0 : simTime;
    let baseTime = 10*3600*1000, dateTxt = '4/01';
    if (curM) { if (curM.wx==='ngt') { baseTime=2*3600*1000; dateTxt='12/15'; } else if (curM.wx==='str') { baseTime=17*3600*1000; dateTxt='9/10'; } else if (curM.wx==='rain') { baseTime=14*3600*1000; dateTxt='6/20'; } }
    let ts=(baseTime+elapsed)/1000, hr=(ts/3600)%12, min=(ts/60)%60, sec=ts%60;

    const drawHand = (pos, length, width, color) => { const handAngle = (pos * (360 / (color === 'red' ? 60 : (color === '#333' ? 60 : 12))) - 90) * Math.PI / 180; ctx.beginPath(); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(handAngle) * length, cy + Math.sin(handAngle) * length); ctx.stroke(); };
    drawHand(hr, 35, 4, '#333'); drawHand(min, 50, 3, '#333'); drawHand(sec, 55, 1, 'red'); ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fillStyle = '#222'; ctx.fill();

    ctx.font = '9px sans-serif'; ctx.fillStyle = '#555'; ctx.fillText(dateTxt, cx, cy + 30);
}

// ============================================================
//  これ以下は元々あった他機能群（変更なし）
// ============================================================
export function animScore(target) {
  const el = document.getElementById('drsn');
  if (!el) return;
  let cur = 0;
  const step = Math.ceil(target / 40);
  const tm = setInterval(() => {
    cur = Math.min(cur + step, target);
    el.textContent = cur;
    if (cur >= target) clearInterval(tm);
  }, 28);
}
export function showDockResult(scoreData, stars, collision, elapsed, curM) {
  const mm = Math.floor(elapsed / 60), ss = elapsed % 60;
  const dm = document.getElementById('drm');
  if (!dm) return;
  dm.textContent = collision ? '衝突！' : stars === 3 ? '完璧な接岸' : stars === 2 ? '接岸成功' : stars === 1 ? '接岸完了' : '接岸失敗';
  dm.className   = 'drm' + (collision ? ' col' : '');
  const sn = document.getElementById('drsn');
  if (sn) sn.className = 'drsn' + (collision ? ' col' : '');
  const s2 = document.getElementById('drs2');
  if (s2) s2.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  const mid = document.getElementById('drmid');
  if (mid) mid.textContent = curM ? curM.id : '';

  const ranks = ['', '3等航海士', '2等航海士', '1等航海士', '船長'];
  const rcols = ['', '#00ff88', '#00ccff', '#ffcc00', '#ff8844'];
  const ri = stars >= 3 ? 4 : stars >= 2 ? 3 : stars >= 1 ? 2 : 1;
  const rk = document.getElementById('drrank');
  if (rk) { rk.textContent = ranks[ri]; rk.style.color = rcols[ri]; }

  const bd = document.getElementById('drbd');
  if (bd) {
    bd.innerHTML = scoreData.items.map((it, i) => `
      <div class="dri">
        <div class="drih">
          <span class="drin">${it.n}</span>
          <span class="driv${it.p < it.m * 0.35 ? ' bad' : ''}">${it.p}/${it.m}pt</span>
        </div>
        <div class="dribw"><div class="drib" id="drb${i}" style="width:0%"></div></div>
      </div>`).join('')
      + `<div style="margin-top:5px;padding-top:5px;border-top:1px solid #00ff8812;font-size:9px;display:flex;justify-content:space-between;">
           <span style="color:#00ff8858">所要時間</span>
           <span style="color:#00ff88">${mm}分${String(ss).padStart(2,'0')}秒</span>
         </div>`;
    setTimeout(() => {
      scoreData.items.forEach((it, i) => {
        const b = document.getElementById('drb' + i);
        if (b) {
          b.style.width      = it.pct + '%';
          b.style.background = it.pct > 70 ? '#00ff88' : it.pct > 40 ? '#ffcc00' : '#ff6644';
          if (it.pct > 70) b.style.boxShadow = '0 0 4px #00ff88';
        }
      });
    }, 320);
  }

  const pen = document.getElementById('drp');
  if (pen) pen.innerHTML = scoreData.pens.length ? scoreData.pens.map(p => `<div>${p}</div>`).join('') : '';
  document.getElementById('dr')?.classList.add('v');
}
export function drawResultRadar(items, collision) {
  const cv  = document.getElementById('drrc2');
  if (!cv) return;
  const ctxR = cv.getContext('2d');
  const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, r = 50;
  ctxR.clearRect(0, 0, W, H);
  const n = items.length, angs = items.map((_, i) => i / n * Math.PI * 2 - Math.PI / 2);

  [0.25, 0.5, 0.75, 1].forEach(f => {
    ctxR.beginPath();
    angs.forEach((a, i) => {
      const x = cx + Math.cos(a)*r*f, y = cy + Math.sin(a)*r*f;
      i ? ctxR.lineTo(x, y) : ctxR.moveTo(x, y);
    });
    ctxR.closePath(); ctxR.strokeStyle = `rgba(0,255,136,${0.05+f*0.05})`; ctxR.lineWidth = 0.8; ctxR.stroke();
  });
  angs.forEach(a => {
    ctxR.beginPath(); ctxR.moveTo(cx, cy);
    ctxR.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
    ctxR.strokeStyle = 'rgba(0,255,136,.1)'; ctxR.lineWidth = 0.8; ctxR.stroke();
  });

  ctxR.beginPath();
  items.forEach((it, i) => {
    const f = it.pct / 100, x = cx + Math.cos(angs[i])*r*f, y = cy + Math.sin(angs[i])*r*f;
    i ? ctxR.lineTo(x, y) : ctxR.moveTo(x, y);
  });
  ctxR.closePath();
  const sc = collision ? '#ff4444' : '#00ff88';
  ctxR.fillStyle = collision ? 'rgba(255,68,68,.16)' : 'rgba(0,255,136,.14)'; ctxR.fill();
  ctxR.strokeStyle = sc; ctxR.lineWidth = 1.4; ctxR.shadowColor = sc; ctxR.shadowBlur = 5; ctxR.stroke(); ctxR.shadowBlur = 0;

  items.forEach((it, i) => {
    const f = it.pct / 100, x = cx + Math.cos(angs[i])*r*f, y = cy + Math.sin(angs[i])*r*f;
    ctxR.beginPath(); ctxR.arc(x, y, 2.5, 0, Math.PI * 2);
    ctxR.fillStyle = sc; ctxR.shadowColor = sc; ctxR.shadowBlur = 3; ctxR.fill(); ctxR.shadowBlur = 0;
  });

  ctxR.font = '8px Courier New'; ctxR.fillStyle = 'rgba(0,255,136,.55)'; ctxR.textAlign = 'center';
  items.forEach((it, i) => {
    const x = cx + Math.cos(angs[i]) * (r + 13), y = cy + Math.sin(angs[i]) * (r + 13) + 3;
    ctxR.fillText(it.n, x, y);
  });
}
export function showPenaltyToast(msg) {
  const el = document.getElementById('ptst');
  if (!el) return;
  el.textContent = msg; el.classList.add('on');
  if (window._ptTimer) clearTimeout(window._ptTimer);
  window._ptTimer = setTimeout(() => el.classList.remove('on'), 2600);
}
export function flashScreen(cls) {
  const f = document.getElementById('flash');
  if (!f) return;
  f.className = cls + ' on';
  setTimeout(() => f.className = '', 500);
}
export function applyWeatherOverlay(m) {
  const ni  = document.getElementById('night-ov');
  const wo  = document.getElementById('wx-ov');
  const rc  = document.getElementById('rain-cv');
  if (ni)  ni.style.background = 'rgba(0,4,16,0)';
  if (wo)  wo.style.background = 'rgba(0,0,0,0)';
  if (rc)  rc.style.opacity    = '0';
  if (m.wx === 'ngt' && ni) ni.style.background = 'rgba(0,4,18,.75)';
  if (m.wx === 'str' && wo) {
    if (rc) rc.style.opacity = '1';
    wo.style.background = 'rgba(40,55,65,.22)';
  }
  if (m.wx === 'rain' && rc) rc.style.opacity = '.7';
}
export function updateCompass(heading) {
  const cn = document.getElementById('cn');
  if (cn) cn.style.transform = `rotate(${-heading * 180 / Math.PI}deg)`;
}
export function drawRudder(rudder) {
  const cv  = document.getElementById('rucv');
  if (!cv) return;
  const ctxR = cv.getContext('2d');
  ctxR.clearRect(0, 0, cv.width, cv.height);
  const cx = cv.width / 2, cy = cv.height - 4, r = cv.height - 9;
  ctxR.beginPath(); ctxR.arc(cx, cy, r, Math.PI, 0);
  ctxR.strokeStyle = 'rgba(0,255,136,.09)'; ctxR.lineWidth = 7; ctxR.stroke();
  for (let d = -35; d <= 35; d += 5) {
    const a   = Math.PI - (d + 35) / 70 * Math.PI;
    const inn = d % 10 === 0 ? r - 11 : r - 6;
    ctxR.beginPath(); ctxR.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctxR.lineTo(cx + Math.cos(a) * inn, cy + Math.sin(a) * inn);
    ctxR.strokeStyle = d === 0 ? '#00ff8848' : '#00ff8820'; ctxR.lineWidth = d % 10 === 0 ? 1.4 : 0.7; ctxR.stroke();
  }
  const ra = Math.PI - (rudder + 35) / 70 * Math.PI;
  ctxR.beginPath(); ctxR.moveTo(cx, cy); ctxR.lineTo(cx+Math.cos(ra)*(r+2), cy+Math.sin(ra)*(r+2));
  ctxR.strokeStyle = '#00ccff'; ctxR.lineWidth = 2.2; ctxR.stroke();
}
export function updateNavData(P, curM) {
  const as = Math.abs(P.speed);
  const hdg = ((P.heading * 180 / Math.PI) % 360 + 360) % 360;
  if (document.getElementById('td1')) document.getElementById('td1').textContent = hdg.toFixed(1) + '°';
  if (document.getElementById('td2')) document.getElementById('td2').textContent = as.toFixed(1) + ' kt';
  if (document.getElementById('td3')) {
    const rotDeg = (P.yawRate * 180 / Math.PI * 60).toFixed(1);
    document.getElementById('td3').textContent = rotDeg + '°/min';
  }
  if (document.getElementById('td4')) document.getElementById('td4').textContent = P.rudder.toFixed(1) + '°';
  if (document.getElementById('td5')) document.getElementById('td5').textContent = Math.round(P.rpm) + ' RPM';
  const EL = ['FULL ASTERN','HALF ASTERN','SLOW ASTERN','DEAD SLOW ASTERN','STOP','DEAD SLOW AHEAD','SLOW AHEAD','HALF AHEAD','FULL AHEAD'];
  if (document.getElementById('td6')) document.getElementById('td6').textContent = EL[P.engineOrder + 4] || 'STOP';
  const rv = document.getElementById('ruv');
  if (rv) rv.textContent = (P.rudder >= 0 ? '+' : '') + P.rudder.toFixed(1) + '°';
}
export function updateTelegraph(engineOrder) {
  const NEW_ENG_IDS = ['tg-rev-full','tg-rev-half','tg-rev-slow','tg-rev-dead','tg-stop','tg-fwd-dead','tg-fwd-slow','tg-fwd-half','tg-fwd-full'];
  const ENG_IDS = ['tf0','tf1','tf2','tf3','tf4','tf5','tf6','tf7','tf8'];
  const ENG_LABELS = ['FULL ASTERN','HALF ASTERN','SLOW ASTERN','DEAD SLOW ASTERN','STOP','DEAD SLOW AHEAD','SLOW AHEAD','HALF AHEAD','FULL AHEAD'];
  const idx = engineOrder + 4; 
  NEW_ENG_IDS.forEach((id, i) => document.getElementById(id)?.classList.toggle('on', i === idx));
  ENG_IDS.forEach((id, i) => document.getElementById(id)?.classList.toggle('on', i === idx));
  const td = document.getElementById('td');
  if (td) td.textContent = ENG_LABELS[idx];
}
export function togglePanels(show) {
    const panels = document.querySelector('#hud .panels');
    if (!panels) return;
    panels.style.transform = show ? 'translateY(0)' : 'translateY(170px)';
    localStorage.setItem('ss_hud_panels', show);
}
export function setNight(night) {
    const n = document.getElementById('night');
    if (n) n.style.backgroundColor = night ? 'rgba(230, 60, 40, 0.25)' : 'transparent';
}