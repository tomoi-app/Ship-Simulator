import * as tools from './tools.js';

// ============================================================
//  hud.js — HUD・UI 描画管理 (統合版 v5.2)
// ============================================================

// --- HUD用のグローバル変数 ---
let canvas, ctx;
const gaugeBarHeight = 120;
let overloadTimer = 0;
let V = { telegraph: 0, windDir: 0, windSpeed: 0, shipSpeed: 0, rudderAngle: 0, yawRate: 0, rpm: 0 };
const smoothRate = 4.0;
const angleSmoothRate = 2.0;

// --- 補助関数 ---
const degToRad = (deg) => deg * Math.PI / 180;
const map = (value, in_min, in_max, out_min, out_max) => (value - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;

// --- 外部へのエクスポート関数群 ---

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

export function updateDashboard(P, simTime = 0, curM = null, mst = null) {
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
        drawNeedleCompass(ctxG, 80, 80, 63, ((P.windDir - P.heading * 180 / Math.PI) % 360 + 360) % 360, true);
    }
    if (cvs.clock) updateClock(cvs.clock.getContext('2d'), simTime, curM, mst);
    drawNewCanvasHUD(P, simTime);
}

export function initHUD() {
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

// --- 非エクスポートの内部関数 ---

function smoothAngle(current, target, rate, delta) {
    let diff = target - current;
    while (diff < -180) diff += 360;
    while (diff > 180) diff -= 360;
    return current + diff * (1 - Math.exp(-rate * delta));
}
function smoothValue(current, target, rate, delta) {
    return current + (target - current) * (1 - Math.exp(-rate * delta));
}
function resizeHUD() { if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; } }

function drawBase(ctxG, title, unit, minVal, maxVal, numStep, majStep, minStep) {
    const cx=80, cy=80, R=70; ctxG.clearRect(0,0,160,160);
    const bevelGrad = ctxG.createRadialGradient(cx,cy,R-8,cx,cy,R+2);
    bevelGrad.addColorStop(0,'#888'); bevelGrad.addColorStop(0.4,'#ccc'); bevelGrad.addColorStop(1,'#555');
    ctxG.beginPath(); ctxG.arc(cx, cy, R+2, 0, Math.PI*2); ctxG.fillStyle=bevelGrad; ctxG.fill();
    ctxG.beginPath(); ctxG.arc(cx, cy, R-3, 0, Math.PI*2); ctxG.fillStyle='#f5f5f5'; ctxG.fill();
    const startA=-Math.PI*1.25, endA=Math.PI*0.25, range=maxVal-minVal;
    for (let i=minVal; i<=maxVal; i+=minStep) {
        const ratio=(i-minVal)/range, angle=startA + ratio*(endA-startA), c=Math.cos(angle), s=Math.sin(angle);
        const isMaj=(i%majStep===0), len=isMaj?12:5;
        ctxG.beginPath(); ctxG.moveTo(cx+c*(R-3-len), cy+s*(R-3-len)); ctxG.lineTo(cx+c*(R-3), cy+s*(R-3));
        ctxG.strokeStyle='#111'; ctxG.lineWidth=isMaj?1.8:0.8; ctxG.stroke();
        if (i%numStep===0) { ctxG.font='bold 10px sans-serif'; ctxG.fillStyle='#000'; ctxG.textAlign='center'; ctxG.textBaseline='middle'; ctxG.fillText(Math.abs(i), cx+c*(R-20), cy+s*(R-20)); }
    }
    ctxG.font='bold 9px sans-serif'; ctxG.fillStyle='#222'; ctxG.textAlign='center'; ctxG.fillText(title, cx, cy+28);
    ctxG.font='8px sans-serif'; ctxG.fillStyle='#555'; ctxG.fillText(unit, cx, cy+38);
}
function drawColorArc(ctxG, minVal, maxVal, startVal, endVal, color, radius, width) {
    const startA=-Math.PI*1.25, endA=Math.PI*0.25, range=maxVal-minVal;
    const sa=startA + ((startVal-minVal)/range)*(endA-startA), ea=startA + ((endVal-minVal)/range)*(endA-startA);
    ctxG.beginPath(); ctxG.arc(80,80,radius,sa,ea); ctxG.lineWidth=width; ctxG.strokeStyle=color; ctxG.stroke();
}
function drawNeedleGauge(ctxG, val, minVal, maxVal, isRudder=false) {
    const cx=80, cy=80, R=70, startA=-Math.PI*1.25, endA=Math.PI*0.25;
    const v=Math.min(Math.max(val, minVal), maxVal), angle=startA + ((v-minVal)/(maxVal-minVal))*(endA-startA);
    ctxG.save(); ctxG.translate(cx,cy); ctxG.rotate(angle+Math.PI/2);
    ctxG.beginPath(); ctxG.moveTo(0,-(R-8)); ctxG.lineTo(-2.5,10); ctxG.lineTo(2.5,10); ctxG.closePath(); ctxG.fillStyle='#111'; ctxG.fill();
    ctxG.beginPath(); ctxG.moveTo(0,10); ctxG.lineTo(-3,22); ctxG.lineTo(3,22); ctxG.closePath(); ctxG.fillStyle=isRudder?'#d32f2f':'#555'; ctxG.fill();
    ctxG.restore(); ctxG.beginPath(); ctxG.arc(cx,cy,6,0,Math.PI*2); ctxG.fillStyle='#333'; ctxG.fill();
    ctxG.beginPath(); ctxG.arc(cx,cy,3,0,Math.PI*2); ctxG.fillStyle='#ddd'; ctxG.fill();
}
// --- 風向計専用の針（ひし形） ---
function drawNeedleCompass(ctx, x, y, length, valDeg, isWind) {
    const angle = degToRad(valDeg - 90);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);

    // 先端側（濃い青）
    ctx.beginPath();
    ctx.moveTo(0, -length + 8);
    ctx.lineTo(-4, 5);
    ctx.lineTo( 4, 5);
    ctx.closePath();
    ctx.fillStyle = isWind ? '#1a237e' : '#111';
    ctx.fill();

    // 反対側（薄い青）
    ctx.beginPath();
    ctx.moveTo(0, length * 0.3);
    ctx.lineTo(-4, 5);
    ctx.lineTo( 4, 5);
    ctx.closePath();
    ctx.fillStyle = isWind ? '#7986cb' : '#888';
    ctx.fill();

    ctx.restore();

    // 中心軸
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#333'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ddd'; ctx.fill();
}
function updateClock(ctxG, simTime, curM, mst) {
    if (!ctxG) return; const cx=80, cy=80, r=70; ctxG.clearRect(0,0,160,160);
    let elapsed = (mst && mst.t0) ? simTime - mst.t0 : simTime;
    let baseTime = 10*3600*1000, dateTxt = '4/01';
    if (curM) { if (curM.wx==='ngt') { baseTime=2*3600*1000; dateTxt='12/15'; } else if (curM.wx==='str') { baseTime=17*3600*1000; dateTxt='9/10'; } else if (curM.wx==='rain') { baseTime=14*3600*1000; dateTxt='6/20'; } }
    let ts=(baseTime+elapsed)/1000, h=(ts/3600)%12, m=(ts/60)%60, s=ts%60;
    let grad=ctxG.createRadialGradient(cx,cy,10,cx,cy,r); grad.addColorStop(0,'#fff'); grad.addColorStop(1,'#d5d5d5');
    ctxG.beginPath(); ctxG.arc(cx,cy,r,0,Math.PI*2); ctxG.fillStyle=grad; ctxG.fill();
    for (let i=0; i<60; i++) { const a=(i/60)*Math.PI*2-Math.PI/2, isMaj=i%5===0; ctxG.beginPath(); ctxG.moveTo(cx+Math.cos(a)*(r-(isMaj?12:6)), cy+Math.sin(a)*(r-(isMaj?12:6))); ctxG.lineTo(cx+Math.cos(a)*r, cy+Math.sin(a)*r); ctxG.lineWidth=isMaj?1.5:0.7; ctxG.strokeStyle=isMaj?'#000':'#555'; ctxG.stroke(); }
    const ha=(h/12)*Math.PI*2-Math.PI/2, ma=(m/60)*Math.PI*2-Math.PI/2, sa=(s/60)*Math.PI*2-Math.PI/2;
    ctxG.lineWidth=4; ctxG.strokeStyle='#111'; ctxG.beginPath(); ctxG.moveTo(cx-Math.cos(ha)*10, cy-Math.sin(ha)*10); ctxG.lineTo(cx+Math.cos(ha)*r*0.5, cy+Math.sin(ha)*r*0.5); ctxG.stroke();
    ctxG.lineWidth=2.5; ctxG.strokeStyle='#222'; ctxG.beginPath(); ctxG.moveTo(cx-Math.cos(ma)*12, cy-Math.sin(ma)*12); ctxG.lineTo(cx+Math.cos(ma)*r*0.72, cy+Math.sin(ma)*r*0.72); ctxG.stroke();
    ctxG.lineWidth=1.2; ctxG.strokeStyle='#d32f2f'; ctxG.beginPath(); ctxG.moveTo(cx-Math.cos(sa)*14, cy-Math.sin(sa)*14); ctxG.lineTo(cx+Math.cos(sa)*r*0.85, cy+Math.sin(sa)*r*0.85); ctxG.stroke();
}

function drawNewCanvasHUD(P, simTime) {
    if (!ctx) return; const dt=0.016;
    const hdgDeg = (P.heading * 180 / Math.PI);
    let relWind = ((P.windDir - hdgDeg) % 360 + 360) % 360;
    V.telegraph=smoothValue(V.telegraph,P.engineOrder,smoothRate*2,dt); V.windDir=smoothAngle(V.windDir,relWind,angleSmoothRate,dt); V.windSpeed=smoothValue(V.windSpeed,P.windSpeed,smoothRate,dt); V.shipSpeed=smoothValue(V.shipSpeed,P.speed,smoothRate,dt); V.rudderAngle=smoothValue(V.rudderAngle,P.rudder,smoothRate,dt); V.yawRate=smoothValue(V.yawRate,P.yawRate*(180/Math.PI)*60,angleSmoothRate,dt); V.rpm=smoothValue(V.rpm,P.rpm,smoothRate,dt);
    ctx.clearRect(0,0,canvas.width,gaugeBarHeight); ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0,0,canvas.width,gaugeBarHeight);
    const gw=canvas.width/8, yc=gaugeBarHeight/2, fS="14px 'BIZ UDMincho', serif", fB="bold 16px 'BIZ UDMincho', serif", fL="bold 20px 'BIZ UDMincho', serif";
    ctx.fillStyle='white'; ctx.strokeStyle='white'; ctx.textAlign='center'; ctx.textBaseline='middle';
    drawHDT(ctx, gw*0.5, yc, 50, V.telegraph, fS); 
    drawWindGauge(ctx, gw*1.5, yc, 50, V.windDir, V.windSpeed, fB, fS); 
    drawHDS(ctx, gw*2.5, yc, 50, V.windSpeed, 'WIND SPD', 'Knots', 60, fB, fS, fL); 
    drawHDS(ctx, gw*3.5, yc, 50, V.shipSpeed, 'SHIP SPD', 'Knots', 30, fB, fS, fL); 
    drawHDR(ctx, gw*4.5, yc, 50, V.rudderAngle, fB, fS); 
    drawHDO(ctx, gw*5.5, yc, 50, V.yawRate, fB, fS); 
    drawHDP(ctx, gw*6.5, yc, 50, V.rpm, P.engineOverload, fB, fS, fL); 
    drawHDC(ctx, gw*7.5, yc, 50, simTime, fB, fS);
    overloadTimer += dt;
}

function drawBaseCircle(ctx, x, y, r, t) { ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.strokeStyle='#444'; ctx.lineWidth=1; ctx.stroke(); ctx.font="14px 'BIZ UDMincho', serif"; ctx.fillStyle='#aaa'; ctx.fillText(t,x,y-r*1.2); ctx.fillStyle='white'; }
function drawHND(ctx, x, y, l, a, c, w) { const rad=degToRad(a-90); ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+Math.cos(rad)*l, y+Math.sin(rad)*l); ctx.strokeStyle=c; ctx.lineWidth=w; ctx.stroke(); }
function drawHTK(ctx, x, y, r, a, l) { const rad=degToRad(a-90); ctx.beginPath(); ctx.moveTo(x+Math.cos(rad)*(r-l), y+Math.sin(rad)*(r-l)); ctx.lineTo(x+Math.cos(rad)*r, y+Math.sin(rad)*r); ctx.strokeStyle='white'; ctx.lineWidth=1; ctx.stroke(); }
function drawHDT(ctx, x, y, r, v, f) { drawBaseCircle(ctx,x,y,r,'TELEGRAPH'); const s=['FULL','HALF','SLOW','DEAD','STOP','DEAD','SLOW','HALF','FULL'], a=[-150,-120,-90,-60,0,60,90,120,150]; ctx.font=f; s.forEach((k,i)=>{ const rad=degToRad(a[i]-90); ctx.fillText(k,x+Math.cos(rad)*r*0.75,y+Math.sin(rad)*r*0.75); }); drawHND(ctx,x,y,r*0.9,map(v,-4,4,-150,150),'red',4); }

// 2. WIND GAUGE (WIND DIR)
function drawWindGauge(ctx, x, y, r, dir, speed, fontBold, fontSmall) {
    drawBaseCircle(ctx, x, y, r, ''); // タイトルは下に手動で描画します

    // 船体シルエット（中央）
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

    // 目盛り＆数字 (0〜360度)
    for (let i = 0; i < 360; i += 10) {
        const ac = degToRad(i - 90);
        const isMaj = i % 30 === 0;
        const len = isMaj ? 12 : 6;
        
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ac) * (r - 3 - len), y + Math.sin(ac) * (r - 3 - len));
        ctx.lineTo(x + Math.cos(ac) * (r - 3),       y + Math.sin(ac) * (r - 3));
        ctx.lineWidth = isMaj ? 1.8 : 0.8;
        ctx.strokeStyle = '#111';
        ctx.stroke();

        if (isMaj && i !== 0) {
            ctx.font = 'bold 9px sans-serif';
            ctx.fillStyle = '#222';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(i, x + Math.cos(ac) * (r - 19), y + Math.sin(ac) * (r - 19));
        }
    }

    // タイトル
    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = '#222';
    ctx.fillText('WIND DIR', x, y + r * 0.4);
    ctx.font = '8px sans-serif';
    ctx.fillStyle = '#555';
    ctx.fillText('DEG (REL)', x, y + r * 0.55);

    // 風向の針（ひし形デザイン）
    drawNeedleCompass(ctx, x, y, r * 0.9, dir, true);
}

function drawHDS(ctx, x, y, r, s, t, u, m, fB, fS, fL) { drawBaseCircle(ctx,x,y,r,t); for(let i=0;i<=m;i+=(m/6)){ const ang=map(i,0,m,-140,140); drawHTK(ctx,x,y,r,ang,i%(m/3)===0?10:5); if(i%(m/3)===0){ ctx.font=fS; ctx.fillText(i.toFixed(0),x+Math.cos(degToRad(ang-90))*r*0.7,y+Math.sin(degToRad(ang-90))*r*0.7); } } drawHND(ctx,x,y,r*0.9,map(s,0,m,-140,140),t.includes('WIND')?'skyblue':'white',3); ctx.font=fL; ctx.fillText(s.toFixed(1),x,y+r*0.2); }
function drawHDR(ctx, x, y, r, a, fB, fS) { drawBaseCircle(ctx,x,y,r,'RUDDER'); for(let i=-35;i<=35;i+=5){ const ang=map(i,-35,35,-140,140); drawHTK(ctx,x,y,r,ang,i%10===0?10:5); if(i%10===0 && i!==0){ ctx.font=fS; ctx.fillText(Math.abs(i),x+Math.cos(degToRad(ang-90))*r*0.7,y+Math.sin(degToRad(ang-90))*r*0.7); } } ctx.font=fB; ctx.fillStyle='red'; ctx.fillText('P',x-r*0.8,y); ctx.fillStyle='green'; ctx.fillText('S',x+r*0.8,y); ctx.fillStyle='white'; drawHND(ctx,x,y,r*0.9,map(a,-35,35,-140,140),'white',3); ctx.font=fB; ctx.fillText(Math.abs(a).toFixed(1)+'°',x,y+r*0.2); }
function drawHDO(ctx, x, y, r, yR, fB, fS) { drawBaseCircle(ctx,x,y,r,'R.O.T.'); for(let i=-60;i<=60;i+=10){ const ang=map(i,-60,60,-140,140); drawHTK(ctx,x,y,r,ang,i%20===0?10:5); if(i%20===0 && i!==0){ ctx.font=fS; ctx.fillText(Math.abs(i),x+Math.cos(degToRad(ang-90))*r*0.7,y+Math.sin(degToRad(ang-90))*r*0.7); } } drawHND(ctx,x,y,r*0.9,map(yR,-60,60,-140,140),'white',3); ctx.font=fB; ctx.fillText(Math.abs(yR).toFixed(1),x,y+r*0.2); }
function drawHDP(ctx, x, y, r, rpm, isO, fB, fS, fL) { drawBaseCircle(ctx,x,y,r,'RPM'); for(let i=0;i<=100;i+=10){ const ang=map(i,0,100,-140,140); drawHTK(ctx,x,y,r,ang,10); if(i%20===0){ ctx.font=fS; ctx.fillText(i,x+Math.cos(degToRad(ang-90))*r*0.7,y+Math.sin(degToRad(ang-90))*r*0.7); } } drawHND(ctx,x,y,r*0.9,map(rpm,0,100,-140,140),isO?'orange':'white',3); ctx.font=fL; ctx.fillText(Math.abs(rpm).toFixed(0),x,y+r*0.2); if(isO && overloadTimer%1<0.5){ ctx.font=fS; ctx.fillStyle='red'; ctx.fillText('OVERLOAD',x,y-r*0.6); } }
function drawHDC(ctx, x, y, r, sT, fB, fS) { drawBaseCircle(ctx,x,y,r,'CLOCK'); ctx.font=fS; for(let i=1;i<=12;i++){ const rad=degToRad(i*30-90); ctx.fillText(i,x+Math.cos(rad)*r*0.75,y+Math.sin(rad)*r*0.75); } const ts=sT%(12*3600), h=ts/3600, m=(ts%3600)/60, s=ts%60; drawHND(ctx,x,y,r*0.5,(h*30)+(m*0.5),'white',4); drawHND(ctx,x,y,r*0.8,(m*6)+(s*0.1),'white',3); drawHND(ctx,x,y,r*0.9,s*6,'red',1); }