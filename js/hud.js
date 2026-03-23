import * as tools from './tools.js';

// ============================================================
//  hud.js — HUD・UI 描画管理 (統合版 v5.2 MOLスタイル)
// ============================================================

// --- HUD用のグローバル変数 ---
let canvas, ctx;
const gaugeBarHeight = 120; // 計器バーの高さ
let overloadTimer = 0;

// --- 滑らかな描画のための「表示用変数（Visual values）」 ---
let V = { telegraph: 0, windDir: 0, windSpeed: 0, shipSpeed: 0, rudderAngle: 0, yawRate: 0, rpm: 0 };
const smoothRate = 4.0;
const angleSmoothRate = 2.0;

// --- 補助関数 ---
const degToRad = (deg) => deg * Math.PI / 180;
const map = (value, in_min, in_max, out_min, out_max) => (value - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
function smoothAngle(current, target, rate, delta) {
    let diff = target - current;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    return current + diff * (1 - Math.exp(-rate * delta));
}
function smoothValue(current, target, rate, delta) {
    return current + (target - current) * (1 - Math.exp(-rate * delta));
}

// ============================================================
//  新HUDの初期化
// ============================================================
export function initHUD() {
    if (canvas) return; // 既に作成済みならスキップ
    canvas = document.createElement('canvas');
    canvas.id = 'hudCanvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none'; // クリック操作を貫通させる
    canvas.style.zIndex = '9999';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    
    const resizeHUD = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', resizeHUD);
    resizeHUD();

    // ★原因解決：古いアナログ計器（個別Canvas）をDOMから非表示にする
    const oldContainer = document.getElementById('gauges-container');
    if (oldContainer) oldContainer.style.display = 'none';
}

// ============================================================
//  メインループから毎フレーム呼ばれる描画処理
// ============================================================
export function updateDashboard(P, simTime = 0, curM = null, mst = null) {
    // 初回実行時に自動で新しいHUDをセットアップ
    if (!ctx) initHUD(); 

    const dt = 0.016; // 60fps想定のデルタタイム
    const hdgDeg = P.heading * 180 / Math.PI;
    const relWind = ((P.windDir - hdgDeg) % 360 + 360) % 360; // 相対風向

    // 1. 値のスムージング（カクカクした数値を滑らかに追従させる）
    V.telegraph = smoothValue(V.telegraph, P.engineOrder, smoothRate * 2.0, dt);
    V.windDir = smoothAngle(V.windDir, relWind, angleSmoothRate, dt);
    V.windSpeed = smoothValue(V.windSpeed, P.windSpeed, smoothRate, dt);
    V.shipSpeed = smoothValue(V.shipSpeed, P.speed, smoothRate, dt);
    V.rudderAngle = smoothValue(V.rudderAngle, P.rudder, smoothRate, dt);
    V.yawRate = smoothValue(V.yawRate, P.yawRate * (180 / Math.PI) * 60, angleSmoothRate, dt); // deg/minに変換
    V.rpm = smoothValue(V.rpm, P.rpm, smoothRate, dt);

    // 2. 描画エリアのクリアと背景描画
    ctx.clearRect(0, 0, canvas.width, gaugeBarHeight);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // 半透明の黒帯（海が透ける）
    ctx.fillRect(0, 0, canvas.width, gaugeBarHeight);

    // 3. 各計器の描画
    const gw = canvas.width / 8; // 8個の計器を均等配置
    const yc = gaugeBarHeight / 2;
    const fS = "12px 'BIZ UDMincho', serif";
    const fB = "bold 14px 'BIZ UDMincho', serif";
    const fL = "bold 18px 'BIZ UDMincho', serif";

    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    drawTelegraphGauge(ctx, gw * 0.5, yc, 50, V.telegraph, fS);
    drawWindGauge(ctx, gw * 1.5, yc, 50, V.windDir, V.windSpeed, fB, fS);
    drawSpeedGauge(ctx, gw * 2.5, yc, 50, V.windSpeed, 'WIND SPD', 'Knots', 60, fB, fS, fL);
    drawSpeedGauge(ctx, gw * 3.5, yc, 50, V.shipSpeed, 'SHIP SPD', 'Knots', 30, fB, fS, fL);
    drawRudderGauge(ctx, gw * 4.5, yc, 50, V.rudderAngle, fB, fS);
    drawRotGauge(ctx, gw * 5.5, yc, 50, V.yawRate, fB, fS);
    drawRpmGauge(ctx, gw * 6.5, yc, 50, V.rpm, P.engineOverload, overloadTimer, fB, fS, fL);
    drawClockGauge(ctx, gw * 7.5, yc, 50, simTime, fB, fS);

    overloadTimer += dt;
}

// ============================================================
//  各計器の具体的な描画関数群
// ============================================================

function drawBaseCircle(ctx, x, y, r, title) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#444'; ctx.lineWidth = 1; ctx.stroke();
    
    // 内側の少し明るい背景
    ctx.beginPath(); ctx.arc(x, y, r - 2, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f5f5'; ctx.fill();

    ctx.font = "14px 'BIZ UDMincho', serif";
    ctx.fillStyle = '#aaa';
    ctx.fillText(title, x, y - r * 1.2);
    ctx.fillStyle = 'white';
}

function drawNeedle(ctx, x, y, length, angleDeg, color, width) {
    const rad = degToRad(angleDeg - 90);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(rad) * length, y + Math.sin(rad) * length);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    
    // 中心の黒ポチ
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#111'; ctx.fill();
}

function drawTick(ctx, x, y, r, angleDeg, length) {
    const rad = degToRad(angleDeg - 90);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(rad) * (r - length), y + Math.sin(rad) * (r - length));
    ctx.lineTo(x + Math.cos(rad) * r, y + Math.sin(rad) * r);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke();
}

function drawTelegraphGauge(ctx, x, y, r, value, fontSmall) {
    drawBaseCircle(ctx, x, y, r, 'TELEGRAPH');
    const steps = ['FULL', 'HALF', 'SLOW', 'DEAD', 'STOP', 'DEAD', 'SLOW', 'HALF', 'FULL'];
    const angles = [-150, -120, -90, -60, 0, 60, 90, 120, 150];

    ctx.font = fontSmall;
    ctx.fillStyle = '#222';
    steps.forEach((step, i) => {
        const rad = degToRad(angles[i] - 90);
        ctx.fillText(step, x + Math.cos(rad) * r * 0.7, y + Math.sin(rad) * r * 0.7);
    });

    const angle = map(value, -4, 4, -150, 150);
    drawNeedle(ctx, x, y, r * 0.85, angle, '#d32f2f', 4);
}

function drawWindGauge(ctx, x, y, r, dir, speed, fontBold, fontSmall) {
    drawBaseCircle(ctx, x, y, r, '');

    // 船体シルエット
    ctx.save();
    ctx.fillStyle = 'rgba(60,80,100,0.18)';
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.35);
    ctx.lineTo(r * 0.15, 0);
    ctx.lineTo(r * 0.12, r * 0.28);
    ctx.lineTo(0, r * 0.35);
    ctx.lineTo(-r * 0.12, r * 0.28);
    ctx.lineTo(-r * 0.15, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 360度の目盛り
    for (let i = 0; i < 360; i += 10) {
        const ac = degToRad(i - 90);
        const isMaj = i % 30 === 0;
        const len = isMaj ? 12 : 6;
        
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ac) * (r - 3 - len), y + Math.sin(ac) * (r - 3 - len));
        ctx.lineTo(x + Math.cos(ac) * (r - 3),       y + Math.sin(ac) * (r - 3));
        ctx.lineWidth = isMaj ? 1.8 : 0.8;
        ctx.strokeStyle = '#111'; ctx.stroke();

        if (isMaj && i !== 0) {
            ctx.font = 'bold 9px sans-serif'; ctx.fillStyle = '#222';
            ctx.fillText(i, x + Math.cos(ac) * (r - 19), y + Math.sin(ac) * (r - 19));
        }
    }

    ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#222'; ctx.fillText('WIND DIR', x, y + r * 0.4);
    ctx.font = '8px sans-serif'; ctx.fillStyle = '#555'; ctx.fillText('DEG (REL)', x, y + r * 0.55);

    // 風向専用のひし形針
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(degToRad(dir));
    ctx.beginPath(); ctx.moveTo(0, -r * 0.9 + 8); ctx.lineTo(-4, 5); ctx.lineTo(4, 5); ctx.closePath();
    ctx.fillStyle = '#1a237e'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, r * 0.3); ctx.lineTo(-4, 5); ctx.lineTo(4, 5); ctx.closePath();
    ctx.fillStyle = '#7986cb'; ctx.fill();
    ctx.restore();

    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = '#333'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = '#ddd'; ctx.fill();
}

function drawSpeedGauge(ctx, x, y, r, speed, title, unit, maxSpeed, fontBold, fontSmall, fontLarge) {
    drawBaseCircle(ctx, x, y, r, title);
    for (let i = 0; i <= maxSpeed; i += (maxSpeed / 6)) {
        const ang = map(i, 0, maxSpeed, -140, 140);
        drawTick(ctx, x, y, r, ang, i % (maxSpeed/3) === 0 ? 12 : 6);
        if (i % (maxSpeed/3) === 0) {
            ctx.font = fontSmall; ctx.fillStyle = '#222';
            ctx.fillText(i.toFixed(0), x + Math.cos(degToRad(ang - 90)) * r * 0.65, y + Math.sin(degToRad(ang - 90)) * r * 0.65);
        }
    }
    drawNeedle(ctx, x, y, r * 0.85, map(speed, 0, maxSpeed, -140, 140), '#111', 3);
    ctx.font = fontLarge; ctx.fillStyle = '#111'; ctx.fillText(speed.toFixed(1), x, y + r * 0.3);
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#555'; ctx.fillText(unit, x, y + r * 0.55);
}

function drawRudderGauge(ctx, x, y, r, angle, fontBold, fontSmall) {
    drawBaseCircle(ctx, x, y, r, 'RUDDER');
    
    // 赤と緑のゾーン描画
    ctx.beginPath(); ctx.arc(x, y, r-3, degToRad(-140-90), degToRad(-90)); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(211,47,47,0.7)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r-3, degToRad(-90), degToRad(140-90)); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(56,142,60,0.7)'; ctx.stroke();

    for (let i = -35; i <= 35; i += 5) {
        const ang = map(i, -35, 35, -140, 140);
        drawTick(ctx, x, y, r, ang, i % 10 === 0 ? 12 : 6);
        if (i % 10 === 0 && i !== 0) {
            ctx.font = fontSmall; ctx.fillStyle = '#222';
            ctx.fillText(Math.abs(i), x + Math.cos(degToRad(ang - 90)) * r * 0.65, y + Math.sin(degToRad(ang - 90)) * r * 0.65);
        }
    }
    ctx.font = fontBold;
    ctx.fillStyle = '#d32f2f'; ctx.fillText('P', x - r * 0.6, y);
    ctx.fillStyle = '#388e3c'; ctx.fillText('S', x + r * 0.6, y);
    
    drawNeedle(ctx, x, y, r * 0.85, map(angle, -35, 35, -140, 140), '#111', 3);
    ctx.fillStyle = '#111'; ctx.fillText(Math.abs(angle).toFixed(1) + '°', x, y + r * 0.3);
}

function drawRotGauge(ctx, x, y, r, yawRate, fontBold, fontSmall) {
    drawBaseCircle(ctx, x, y, r, 'R.O.T.');

    ctx.beginPath(); ctx.arc(x, y, r-3, degToRad(-140-90), degToRad(-90)); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(211,47,47,0.7)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r-3, degToRad(-90), degToRad(140-90)); ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(56,142,60,0.7)'; ctx.stroke();

    for (let i = -60; i <= 60; i += 10) {
        const ang = map(i, -60, 60, -140, 140);
        drawTick(ctx, x, y, r, ang, i % 20 === 0 ? 12 : 6);
        if (i % 20 === 0 && i !== 0) {
            ctx.font = fontSmall; ctx.fillStyle = '#222';
            ctx.fillText(Math.abs(i), x + Math.cos(degToRad(ang - 90)) * r * 0.65, y + Math.sin(degToRad(ang - 90)) * r * 0.65);
        }
    }
    drawNeedle(ctx, x, y, r * 0.85, map(yawRate, -60, 60, -140, 140), '#111', 3);
    ctx.font = fontBold; ctx.fillStyle = '#111'; ctx.fillText(Math.abs(yawRate).toFixed(1), x, y + r * 0.3);
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#555'; ctx.fillText('DEG/MIN', x, y + r * 0.55);
}

function drawRpmGauge(ctx, x, y, r, rpm, isOverload, timer, fontBold, fontSmall, fontLarge) {
    drawBaseCircle(ctx, x, y, r, 'ENGINE');
    for (let i = -50; i <= 120; i += 10) {
        const ang = map(i, -50, 120, -140, 140);
        drawTick(ctx, x, y, r, ang, i % 20 === 0 ? 12 : 6);
        if (i % 20 === 0) {
            ctx.font = fontSmall; ctx.fillStyle = '#222';
            ctx.fillText(i, x + Math.cos(degToRad(ang - 90)) * r * 0.65, y + Math.sin(degToRad(ang - 90)) * r * 0.65);
        }
    }
    drawNeedle(ctx, x, y, r * 0.85, map(rpm, -50, 120, -140, 140), '#111', 3);
    ctx.font = fontLarge; ctx.fillStyle = '#111'; ctx.fillText(Math.abs(rpm).toFixed(0), x, y + r * 0.3);
    ctx.font = '9px sans-serif'; ctx.fillStyle = '#555'; ctx.fillText('RPM', x, y + r * 0.55);

    if (isOverload && timer % 1.0 < 0.5) {
        ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#d32f2f'; ctx.fillText('OVERLOAD', x, y - r * 0.5);
    }
}

function drawClockGauge(ctx, x, y, r, simTime, fontBold, fontSmall) {
    drawBaseCircle(ctx, x, y, r, 'CLOCK');
    ctx.font = fontSmall; ctx.fillStyle = '#222';
    for (let i = 1; i <= 12; i++) {
        const rad = degToRad(i * 30 - 90);
        ctx.fillText(i, x + Math.cos(rad) * r * 0.75, y + Math.sin(rad) * r * 0.75);
    }

    const totalSeconds = simTime / 1000;
    const hours = (totalSeconds / 3600) % 12;
    const minutes = (totalSeconds / 60) % 60;
    const seconds = totalSeconds % 60;

    drawNeedle(ctx, x, y, r * 0.5, (hours * 30) + (minutes * 0.5), '#111', 4);
    drawNeedle(ctx, x, y, r * 0.8, (minutes * 6) + (seconds * 0.1), '#111', 3);
    drawNeedle(ctx, x, y, r * 0.9, seconds * 6, '#d32f2f', 1.5);
}

// ============================================================
//  これ以下は元々あった他機能群（変更なし）
// ============================================================
export function animScore(target) { /* 中略（上記に含まれています） */
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