import * as tools from './tools.js';

// ============================================================
//  hud.js — HUD・UI 描画管理 (統合版)
// ============================================================

// --- HUD用のグローバル変数 ---
let canvas, ctx;
const gaugeBarHeight = 120; // 新HUDの高さ
let overloadTimer = 0; // OVERLOAD点滅用タイマー

// --- 補助関数 ---
const degToRad = (deg) => deg * Math.PI / 180;
const map = (value, in_min, in_max, out_min, out_max) => {
    return (value - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
};
const mpsToKnots = 1.94384; 

// --- 滑らかな描画のための「表示用変数（Visual values）」 ---
let V = {
    telegraph: 0,
    windDir: 0,
    windSpeed: 0,
    shipSpeed: 0,
    rudderAngle: 0,
    yawRate: 0,
    rpm: 0
};

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

// ============================================================
//  初期化・基本エクスポート
// ============================================================

export function initHUD() {
    // 既存の個別のキャンバス初期化は不要 (main.jsなどで処理される想定)
    
    // 新しい最前面Canvasの自動生成
    canvas = document.getElementById('hudCanvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'hudCanvas';
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '9999';
        document.body.appendChild(canvas);
    }
    ctx = canvas.getContext('2d');
    resizeHUD();
    window.addEventListener('resize', resizeHUD);
}

function resizeHUD() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

// ============================================================
//  main.js から呼び出されるインポート関数群
// ============================================================

// ---- コンパス（画面上のHDG表示） ----
export function updateCompass(heading) {
  const cn = document.getElementById('cn');
  if (cn) cn.style.transform = `rotate(${-heading * 180 / Math.PI}deg)`;
}

// ---- 舵角アーク ----
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
    ctxR.beginPath();
    ctxR.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctxR.lineTo(cx + Math.cos(a) * inn, cy + Math.sin(a) * inn);
    ctxR.strokeStyle = d === 0 ? '#00ff8848' : '#00ff8820';
    ctxR.lineWidth   = d % 10 === 0 ? 1.4 : 0.7;
    ctxR.stroke();
  }

  const ra = Math.PI - (rudder + 35) / 70 * Math.PI;
  ctxR.beginPath(); ctxR.moveTo(cx, cy);
  ctxR.lineTo(cx + Math.cos(ra) * (r + 2), cy + Math.sin(ra) * (r + 2));
  ctxR.strokeStyle = '#00ccff'; ctxR.lineWidth = 2.2;
  ctxR.shadowColor = '#00ccff'; ctxR.shadowBlur = 7;
  ctxR.stroke(); ctxR.shadowBlur = 0;
  ctxR.beginPath(); ctxR.moveTo(cx, cy); ctxR.lineTo(cx, cy - r);
  ctxR.strokeStyle = '#00ff8828'; ctxR.lineWidth = 0.9; ctxR.stroke();
}

// ---- ナビゲーションデータ ----
export function updateNavData(P, curM) {
  const as = Math.abs(P.speed);
  const hdg = ((P.heading * 180 / Math.PI) % 360 + 360) % 360;

  if (document.getElementById('td1')) {
    document.getElementById('td1').textContent = hdg.toFixed(1) + '°';
  }
  if (document.getElementById('td2')) {
    document.getElementById('td2').textContent = as.toFixed(1) + ' kt';
  }
  if (document.getElementById('td3')) {
    const rotDeg = (P.yawRate * 180 / Math.PI * 60).toFixed(1);
    document.getElementById('td3').textContent = rotDeg + '°/min';
  }
  if (document.getElementById('td4')) {
    document.getElementById('td4').textContent = P.rudder.toFixed(1) + '°';
  }
  if (document.getElementById('td5')) {
    document.getElementById('td5').textContent = Math.round(P.rpm) + ' RPM';
  }

  const EL = ['FULL ASTERN','HALF ASTERN','SLOW ASTERN','DEAD SLOW ASTERN','STOP','DEAD SLOW AHEAD','SLOW AHEAD','HALF AHEAD','FULL AHEAD'];
  if (document.getElementById('td6')) {
    document.getElementById('td6').textContent = EL[P.engineOrder + 4] || 'STOP';
  }

  const rv = document.getElementById('ruv');
  if (rv) rv.textContent = (P.rudder >= 0 ? '+' : '') + P.rudder.toFixed(1) + '°';
}

// ---- エンジンテレグラフ ----
const NEW_ENG_IDS = ['tg-rev-full','tg-rev-half','tg-rev-slow','tg-rev-dead','tg-stop','tg-fwd-dead','tg-fwd-slow','tg-fwd-half','tg-fwd-full'];
const ENG_IDS    = ['tf0','tf1','tf2','tf3','tf4','tf5','tf6','tf7','tf8'];
const ENG_LABELS = ['FULL ASTERN','HALF ASTERN','SLOW ASTERN','DEAD SLOW ASTERN','STOP','DEAD SLOW AHEAD','SLOW AHEAD','HALF AHEAD','FULL AHEAD'];

export function updateTelegraph(engineOrder) {
    const idx = engineOrder + 4; 
    NEW_ENG_IDS.forEach((id, i) => {
        document.getElementById(id)?.classList.toggle('on', i === idx);
    });
    ENG_IDS.forEach((id, i) => document.getElementById(id)?.classList.toggle('on', i === idx));
    const td = document.getElementById('td');
    if (td) td.textContent = ENG_LABELS[idx];
}

export function togglePanels(show) {
    const panels = document.querySelector('#hud .panels');
    if (!panels) return;
    const HUD_MIN_Y = 170;
    panels.style.transform = show ? 'translateY(0)' : `translateY(${HUD_MIN_Y}px)`;
    localStorage.setItem('ss_hud_panels', show);
}

// ---- ペナルティトースト ----
let ptTimer = null;
export function showPenaltyToast(msg) {
  const el = document.getElementById('ptst');
  if (!el) return;
  el.textContent = msg; el.classList.add('on');
  clearTimeout(ptTimer);
  ptTimer = setTimeout(() => el.classList.remove('on'), 2600);
}

// ---- フラッシュ ----
export function flashScreen(cls) {
  const f = document.getElementById('flash');
  if (!f) return;
  f.className = cls + ' on';
  setTimeout(() => f.className = '', 500);
}

// ---- スコアレーダーチャート ----
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

// ---- スコアカウントアップ ----
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

// ---- スコア結果画面表示 ----
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

// ---- 天候インジケーター ----
export function applyWeatherOverlay(m) {
  const ni  = document.getElementById('night-ov');
  const wo  = document.getElementById('wx-ov');
  const rc  = document.getElementById('rain-cv');

  if (ni)  ni.style.background = 'rgba(0,4,16,0)';
  if (wo)  wo.style.background = 'rgba(0,0,0,0)';
  if (rc)  rc.style.opacity    = '0';

  if (m.wx === 'ngt') {
    if (ni) ni.style.background = 'rgba(0,4,18,.75)';
  }
  if (m.wx === 'str') {
    if (rc) rc.style.opacity = '1';
    if (wo) wo.style.background = 'rgba(40,55,65,.22)';
  }
  if (m.wx === 'rain') {
    if (rc) rc.style.opacity = '.7';
  }
}

// ------------------------------------------------------------
//  計器描画の補助関数 (旧式メーター用)
// ------------------------------------------------------------
function drawBase(ctxG, title, unit, minVal, maxVal, numStep, majStep, minStep) {
    const cx = 80, cy = 80, R = 70;
    ctxG.clearRect(0, 0, 160, 160);

    const bevelGrad = ctxG.createRadialGradient(cx, cy, R - 8, cx, cy, R + 2);
    bevelGrad.addColorStop(0, '#888');
    bevelGrad.addColorStop(0.4, '#ccc');
    bevelGrad.addColorStop(1, '#555');
    ctxG.beginPath(); ctxG.arc(cx, cy, R + 2, 0, Math.PI * 2);
    ctxG.fillStyle = bevelGrad; ctxG.fill();

    ctxG.beginPath(); ctxG.arc(cx, cy, R - 3, 0, Math.PI * 2);
    ctxG.fillStyle = '#f5f5f5'; ctxG.fill();

    const startA = -Math.PI * 1.25;
    const endA   =  Math.PI * 0.25;
    const range  = maxVal - minVal;

    for (let i = minVal; i <= maxVal; i += minStep) {
        const ratio = (i - minVal) / range;
        const angle = startA + ratio * (endA - startA);
        const c = Math.cos(angle), s = Math.sin(angle);
        const isMaj = (i % majStep === 0);
        const len   = isMaj ? 12 : 5;
        const lw    = isMaj ? 1.8 : 0.8;

        ctxG.beginPath();
        ctxG.moveTo(cx + c * (R - 3 - len), cy + s * (R - 3 - len));
        ctxG.lineTo(cx + c * (R - 3),       cy + s * (R - 3));
        ctxG.lineWidth = lw;
        ctxG.strokeStyle = '#111';
        ctxG.stroke();

        if (i % numStep === 0) {
            const textR = R - 3 - len - 8;
            ctxG.font = 'bold 10px sans-serif';
            ctxG.fillStyle = '#000';
            ctxG.textAlign = 'center';
            ctxG.textBaseline = 'middle';
            ctxG.fillText(Math.abs(i), cx + c * textR, cy + s * textR);
        }
    }
    ctxG.font = 'bold 9px sans-serif'; ctxG.fillStyle = '#222'; ctxG.textAlign = 'center'; ctxG.fillText(title, cx, cy + 28);
    ctxG.font = '8px sans-serif'; ctxG.fillStyle = '#555'; ctxG.fillText(unit, cx, cy + 38);
}

function drawColorArc(ctxG, minVal, maxVal, startVal, endVal, color, radius, width) {
    const startA = -Math.PI * 1.25, endA = Math.PI * 0.25, range = maxVal - minVal;
    const sa = startA + ((startVal - minVal) / range) * (endA - startA);
    const ea = startA + ((endVal   - minVal) / range) * (endA - startA);
    ctxG.beginPath(); ctxG.arc(80, 80, radius, sa, ea);
    ctxG.lineWidth = width; ctxG.strokeStyle = color; ctxG.stroke();
}

function drawNeedleGauge(ctxG, val, minVal, maxVal, isRudder=false) {
    const cx = 80, cy = 80, R = 70;
    const startA = -Math.PI * 1.25, endA = Math.PI * 0.25;
    const v = Math.min(Math.max(val, minVal), maxVal);
    const angle = startA + ((v - minVal) / (maxVal - minVal)) * (endA - startA);
    
    ctxG.save();
    ctxG.translate(cx, cy);
    ctxG.rotate(angle + Math.PI / 2);
    ctxG.beginPath(); ctxG.moveTo(0, -(R - 8)); ctxG.lineTo(-2.5, 10); ctxG.lineTo( 2.5, 10); ctxG.closePath();
    ctxG.fillStyle = '#111'; ctxG.fill();
    ctxG.beginPath(); ctxG.moveTo(0, 10); ctxG.lineTo(-3, 22); ctxG.lineTo( 3, 22); ctxG.closePath();
    ctxG.fillStyle = isRudder ? '#d32f2f' : '#555'; ctxG.fill();
    ctxG.restore();
    ctxG.beginPath(); ctxG.arc(cx, cy, 6, 0, Math.PI * 2); ctxG.fillStyle = '#333'; ctxG.fill();
    ctxG.beginPath(); ctxG.arc(cx, cy, 3, 0, Math.PI * 2); ctxG.fillStyle = '#ddd'; ctxG.fill();
}

function drawNeedleCompass(ctxG, valDeg, isWind=false) {
    const cx = 80, cy = 80, R = 70;
    const angle = (valDeg * Math.PI / 180) - (Math.PI / 2);
    ctxG.save();
    ctxG.translate(cx, cy); ctxG.rotate(angle + Math.PI / 2);
    ctxG.beginPath(); ctxG.moveTo(0, -(R - 8)); ctxG.lineTo(-3, 5); ctxG.lineTo( 3, 5); ctxG.closePath();
    ctxG.fillStyle = isWind ? '#1a237e' : '#111'; ctxG.fill();
    ctxG.beginPath(); ctxG.moveTo(0, 20); ctxG.lineTo(-3, 5); ctxG.lineTo( 3, 5); ctxG.closePath();
    ctxG.fillStyle = isWind ? '#7986cb' : '#888'; ctxG.fill();
    ctxG.restore();
    ctxG.beginPath(); ctxG.arc(cx, cy, 6, 0, Math.PI * 2); ctxG.fillStyle = '#333'; ctxG.fill();
}

export function setNight(night) {
    const n = document.getElementById('night');
    if (n) n.style.backgroundColor = night ? 'rgba(230, 60, 40, 0.25)' : 'transparent';
}

function updateClock(ctxG, simTime, curM, mst) {
    if (!ctxG) return;
    const cx = 80, cy = 80, r = 70;
    ctxG.clearRect(0, 0, 160, 160);
    let elapsed = (mst && mst.t0) ? simTime - mst.t0 : simTime;
    let baseTime = 10 * 3600 * 1000, dateTxt = '4/01';
    if (curM) {
        if (curM.wx === 'ngt') { baseTime = 2 * 3600 * 1000; dateTxt = '12/15'; }
        else if (curM.wx === 'str') { baseTime = 17 * 3600 * 1000; dateTxt = '9/10'; }
        else if (curM.wx === 'rain') { baseTime = 14 * 3600 * 1000; dateTxt = '6/20'; }
    }
    let totalSeconds = (baseTime + elapsed) / 1000;
    let h = (totalSeconds / 3600) % 12, m = (totalSeconds / 60) % 60, s = totalSeconds % 60;

    let grad = ctxG.createRadialGradient(cx, cy, 10, cx, cy, r);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#d5d5d5');
    ctxG.beginPath(); ctxG.arc(cx, cy, r, 0, Math.PI * 2); ctxG.fillStyle = grad; ctxG.fill();

    for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const isMaj = i % 5 === 0;
        ctxG.beginPath();
        ctxG.moveTo(cx + Math.cos(a) * (r - (isMaj ? 12 : 6)), cy + Math.sin(a) * (r - (isMaj ? 12 : 6)));
        ctxG.lineTo(cx + Math.cos(a) * r,     cy + Math.sin(a) * r);
        ctxG.lineWidth = isMaj ? 1.5 : 0.7; ctxG.strokeStyle = isMaj ? '#000' : '#555'; ctxG.stroke();
    }
    const ha = (h/12)*Math.PI*2-Math.PI/2, ma = (m/60)*Math.PI*2-Math.PI/2, sa = (s/60)*Math.PI*2-Math.PI/2;
    ctxG.lineWidth = 4; ctxG.strokeStyle = '#111'; ctxG.beginPath(); ctxG.moveTo(cx-Math.cos(ha)*10, cy-Math.sin(ha)*10); ctxG.lineTo(cx+Math.cos(ha)*r*0.5, cy+Math.sin(ha)*r*0.5); ctxG.stroke();
    ctxG.lineWidth = 2.5; ctxG.strokeStyle = '#222'; ctxG.beginPath(); ctxG.moveTo(cx-Math.cos(ma)*12, cy-Math.sin(ma)*12); ctxG.lineTo(cx+Math.cos(ma)*r*0.72, cy+Math.sin(ma)*r*0.72); ctxG.stroke();
    ctxG.lineWidth = 1.2; ctxG.strokeStyle = '#d32f2f'; ctxG.beginPath(); ctxG.moveTo(cx-Math.cos(sa)*14, cy-Math.sin(sa)*14); ctxG.lineTo(cx+Math.cos(sa)*r*0.85, cy+Math.sin(sa)*r*0.85); ctxG.stroke();
}

// ============================================================
//  updateDashboard (統合された描画エントリーポイント)
// ============================================================

export function updateDashboard(P, simTime = 0, curM = null, mst = null) {
    // 1. 旧式個別メーターの更新
    const cvs = {
        shipSpeed: document.getElementById('ship-speed-canvas'),
        rudder: document.getElementById('rudder-canvas'),
        rot: document.getElementById('rot-canvas'),
        rpm: document.getElementById('rpm-canvas'),
        windSpeed: document.getElementById('wind-speed-canvas'),
        windDir: document.getElementById('wind-dir-canvas'),
        clock: document.getElementById('clock-canvas')
    };

    if (cvs.shipSpeed) {
        let ctxG = cvs.shipSpeed.getContext('2d');
        drawBase(ctxG, 'SPEED', 'KNOTS', -10, 30, 5, 5, 1);
        drawColorArc(ctxG, -10, 30, -10, 0, 'rgba(200,30,30,0.7)', 62, 8);
        drawNeedleGauge(ctxG, P.speed, -10, 30);
    }
    if (cvs.rudder) {
        let ctxG = cvs.rudder.getContext('2d');
        drawBase(ctxG, 'RUDDER', 'DEG', -35, 35, 10, 5, 1);
        drawColorArc(ctxG, -35, 35, -35, 0, 'rgba(200,30,30,0.7)', 62, 8);
        drawColorArc(ctxG, -35, 35, 0, 35, 'rgba(40,140,60,0.7)', 62, 8);
        drawNeedleGauge(ctxG, P.rudder, -35, 35, true);
    }
    if (cvs.rot) {
        let ctxG = cvs.rot.getContext('2d');
        drawBase(ctxG, 'RATE OF TURN', 'DEG/MIN', -30, 30, 10, 5, 1);
        drawColorArc(ctxG, -30, 30, -30, 0, 'rgba(200,30,30,0.7)', 62, 8);
        drawColorArc(ctxG, -30, 30, 0, 30, 'rgba(40,140,60,0.7)', 62, 8);
        drawNeedleGauge(ctxG, P.yawRate * (180 / Math.PI) * 60, -30, 30, true);
    }
    if (cvs.rpm) {
        let ctxG = cvs.rpm.getContext('2d');
        drawBase(ctxG, 'ENGINE', 'RPM', -120, 120, 20, 10, 5);
        drawColorArc(ctxG, -120, 120, -120, 0, 'rgba(200,30,30,0.7)', 62, 8);
        drawColorArc(ctxG, -120, 120, 0, 120, 'rgba(40,140,60,0.7)', 62, 8);
        drawNeedleGauge(ctxG, P.rpm, -120, 120);
        if (P.engineOverload && Math.floor(Date.now() / 500) % 2 === 0) {
            ctxG.font = 'bold 11px sans-serif'; ctxG.fillStyle = '#ff0000'; ctxG.textAlign = 'center'; ctxG.fillText('OVERLOAD', 80, 115);
        }
    }
    if (cvs.windSpeed) {
        let ctxG = cvs.windSpeed.getContext('2d');
        drawBase(ctxG, 'WIND SPEED', 'KNOTS', 0, 100, 20, 10, 5);
        drawNeedleGauge(ctxG, P.windSpeed, 0, 100);
    }
    if (cvs.windDir) {
        let ctxG = cvs.windDir.getContext('2d');
        ctxG.clearRect(0,0,160,160);
        drawNeedleCompass(ctxG, ((P.windDir - P.heading * 180 / Math.PI) % 360 + 360) % 360, true);
    }
    if (cvs.clock) updateClock(cvs.clock.getContext('2d'), simTime, curM, mst);

    // 2. 新しい Canvas HUD (最前面パネル) の描画
    drawNewCanvasHUD(P, simTime);
}

// ============================================================
//  新設 HUD Canvas 描画ロジック
// ============================================================

function drawNewCanvasHUD(P, simTime) {
    if (!ctx) return;
    const dt = 0.016; // 固定デルタ

    // スムージング処理
    V.telegraph = smoothValue(V.telegraph, P.engineOrder, smoothRate * 2.0, dt);
    V.windDir = smoothAngle(V.windDir, P.windDir, angleSmoothRate, dt);
    V.windSpeed = smoothValue(V.windSpeed, P.windSpeed, smoothRate, dt);
    V.shipSpeed = smoothValue(V.shipSpeed, P.speed, smoothRate, dt);
    V.rudderAngle = smoothValue(V.rudderAngle, -P.rudder, smoothRate, dt);
    V.yawRate = smoothValue(V.yawRate, -P.yawRate, angleSmoothRate, dt);
    V.rpm = smoothValue(V.rpm, P.rpm, smoothRate, dt);

    ctx.clearRect(0, 0, canvas.width, gaugeBarHeight);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, gaugeBarHeight);

    const gaugeWidth = canvas.width / 8;
    const yCenter = gaugeBarHeight / 2;
    const fontSmall = "normal 14px 'BIZ UDMincho', serif";
    const fontBold = "bold 16px 'BIZ UDMincho', serif";
    const fontLarge = "bold 20px 'BIZ UDMincho', serif";

    ctx.fillStyle = 'white'; ctx.strokeStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    drawHUDTelegraph(ctx, gaugeWidth * 0.5, yCenter, 50, V.telegraph, fontSmall);
    drawHUDWind(ctx, gaugeWidth * 1.5, yCenter, 50, V.windDir, V.windSpeed, fontBold, fontSmall);
    drawHUDSpeed(ctx, gaugeWidth * 2.5, yCenter, 50, V.windSpeed, 'WIND SPD', 'Knots', 60, fontBold, fontSmall, fontLarge);
    drawHUDSpeed(ctx, gaugeWidth * 3.5, yCenter, 50, V.shipSpeed, 'SHIP SPD', 'Knots', 30, fontBold, fontSmall, fontLarge);
    drawHUDRudder(ctx, gaugeWidth * 4.5, yCenter, 50, V.rudderAngle, fontBold, fontSmall);
    drawHUDROT(ctx, gaugeWidth * 5.5, yCenter, 50, V.yawRate, fontBold, fontSmall);
    drawHUDRPM(ctx, gaugeWidth * 6.5, yCenter, 50, V.rpm, P.engineOverload, fontBold, fontSmall, fontLarge);
    drawHUDClock(ctx, gaugeWidth * 7.5, yCenter, 50, simTime, fontBold, fontSmall);

    overloadTimer += dt;
}

// --- 内部描画関数 (HUD Canvas用) ---

function drawHUDCircle(ctx, x, y, r, title) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.strokeStyle = '#444'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = "normal 14px 'BIZ UDMincho', serif"; ctx.fillStyle = '#aaa'; ctx.fillText(title, x, y - r * 1.2); ctx.fillStyle = 'white';
}

function drawHUDNeedle(ctx, x, y, length, angleDeg, color, width) {
    const rad = degToRad(angleDeg - 90);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(rad) * length, y + Math.sin(rad) * length);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

function drawHUDTick(ctx, x, y, r, angleDeg, length) {
    const rad = degToRad(angleDeg - 90);
    ctx.beginPath(); ctx.moveTo(x + Math.cos(rad) * (r - length), y + Math.sin(rad) * (r - length));
    ctx.lineTo(x + Math.cos(rad) * r, y + Math.sin(rad) * r);
    ctx.strokeStyle = 'white'; ctx.lineWidth = 1; ctx.stroke();
}

function drawHUDTelegraph(ctx, x, y, r, value, fontSmall) {
    drawHUDCircle(ctx, x, y, r, 'TELEGRAPH');
    const steps = ['FULL', 'HALF', 'SLOW', 'DEAD', 'STOP', 'DEAD', 'SLOW', 'HALF', 'FULL'];
    const angles = [-150, -120, -90, -60, 0, 60, 90, 120, 150];
    ctx.font = fontSmall;
    steps.forEach((step, i) => {
        const rad = degToRad(angles[i] - 90);
        ctx.fillText(step, x + Math.cos(rad) * r * 0.75, y + Math.sin(rad) * r * 0.75);
    });
    drawHUDNeedle(ctx, x, y, r * 0.9, map(value, -4, 4, -150, 150), 'red', 4);
}

function drawHUDWind(ctx, x, y, r, dir, speed, fontBold, fontSmall) {
    drawHUDCircle(ctx, x, y, r, 'WIND DIR');
    ctx.font = fontSmall;
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([label, ang]) => {
        const rad = degToRad(ang - 90);
        ctx.fillText(label, x+Math.cos(rad)*r*0.75, y+Math.sin(rad)*r*0.75);
    });
    drawHUDNeedle(ctx, x, y, r * 0.9, dir, 'skyblue', 3);
    ctx.font = fontBold; ctx.fillText(speed.toFixed(1), x, y + r * 0.2);
}

function drawHUDSpeed(ctx, x, y, r, speed, title, unit, maxSpeed, fontBold, fontSmall, fontLarge) {
    drawHUDCircle(ctx, x, y, r, title);
    for (let i = 0; i <= maxSpeed; i += (maxSpeed / 6)) {
        const ang = map(i, 0, maxSpeed, -140, 140);
        drawHUDTick(ctx, x, y, r, ang, i % (maxSpeed/3) === 0 ? 10 : 5);
        if (i % (maxSpeed/3) === 0) {
            ctx.font = fontSmall; const rad = degToRad(ang-90);
            ctx.fillText(i.toFixed(0), x+Math.cos(rad)*r*0.7, y+Math.sin(rad)*r*0.7);
        }
    }
    drawHUDNeedle(ctx, x, y, r * 0.9, map(speed, 0, maxSpeed, -140, 140), title.includes('WIND') ? 'skyblue' : 'white', 3);
    ctx.font = fontLarge; ctx.fillText(speed.toFixed(1), x, y + r * 0.2);
}

function drawHUDRudder(ctx, x, y, r, angle, fontBold, fontSmall) {
    drawHUDCircle(ctx, x, y, r, 'RUDDER');
    for (let i = -35; i <= 35; i += 5) {
        const ang = map(i, -35, 35, -140, 140);
        drawHUDTick(ctx, x, y, r, ang, i % 10 === 0 ? 10 : 5);
        if (i % 10 === 0 && i !== 0) {
            ctx.font = fontSmall; const rad = degToRad(ang-90);
            ctx.fillText(Math.abs(i), x+Math.cos(rad)*r*0.7, y+Math.sin(rad)*r*0.7);
        }
    }
    ctx.font = fontBold; ctx.fillStyle = 'red'; ctx.fillText('P', x - r * 0.8, y);
    ctx.fillStyle = 'green'; ctx.fillText('S', x + r * 0.8, y); ctx.fillStyle = 'white';
    drawHUDNeedle(ctx, x, y, r * 0.9, map(angle, -35, 35, -140, 140), 'white', 3);
    ctx.font = fontBold; ctx.fillText(Math.abs(angle).toFixed(1) + '°', x, y + r * 0.2);
}

function drawHUDROT(ctx, x, y, r, yawRate, fontBold, fontSmall) {
    drawHUDCircle(ctx, x, y, r, 'R.O.T.');
    for (let i = -60; i <= 60; i += 10) {
        const ang = map(i, -60, 60, -140, 140);
        drawHUDTick(ctx, x, y, r, ang, i % 20 === 0 ? 10 : 5);
        if (i % 20 === 0 && i !== 0) {
            ctx.font = fontSmall; const rad = degToRad(ang-90);
            ctx.fillText(Math.abs(i), x+Math.cos(rad)*r*0.7, y+Math.sin(rad)*r*0.7);
        }
    }
    drawHUDNeedle(ctx, x, y, r * 0.9, map(yawRate, -60, 60, -140, 140), 'white', 3);
    ctx.font = fontBold; ctx.fillText(Math.abs(yawRate).toFixed(1), x, y + r * 0.2);
}

function drawHUDRPM(ctx, x, y, r, rpm, isOverload, fontBold, fontSmall, fontLarge) {
    drawHUDCircle(ctx, x, y, r, 'RPM');
    for (let i = 0; i <= 100; i += 10) {
        const ang = map(i, 0, 100, -140, 140);
        drawHUDTick(ctx, x, y, r, ang, 10);
        if (i % 20 === 0) {
            ctx.font = fontSmall; const rad = degToRad(ang-90);
            ctx.fillText(i, x+Math.cos(rad)*r*0.7, y+Math.sin(rad)*r*0.7);
        }
    }
    drawHUDNeedle(ctx, x, y, r * 0.9, map(rpm, 0, 100, -140, 140), isOverload ? 'orange' : 'white', 3);
    ctx.font = fontLarge; ctx.fillText(Math.abs(rpm).toFixed(0), x, y + r * 0.2);
    if (isOverload && overloadTimer % 1.0 < 0.5) {
        ctx.font = fontSmall; ctx.fillStyle = 'red'; ctx.fillText('OVERLOAD', x, y - r * 0.6);
    }
}

function drawHUDClock(ctx, x, y, r, simTime, fontBold, fontSmall) {
    drawHUDCircle(ctx, x, y, r, 'CLOCK');
    ctx.font = fontSmall;
    for (let i = 1; i <= 12; i++) {
        const rad = degToRad(i * 30 - 90);
        ctx.fillText(i, x + Math.cos(rad) * r * 0.75, y + Math.sin(rad) * r * 0.75);
    }
    const sec = simTime % (12 * 3600), h = sec / 3600, m = (sec % 3600) / 60, s = sec % 60;
    drawHUDNeedle(ctx, x, y, r * 0.5, (h * 30) + (m * 0.5), 'white', 4);
    drawHUDNeedle(ctx, x, y, r * 0.8, (m * 6) + (s * 0.1), 'white', 3);
    drawHUDNeedle(ctx, x, y, r * 0.9, s * 6, 'red', 1);
}