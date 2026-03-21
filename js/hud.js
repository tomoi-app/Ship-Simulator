// hud.js
'use strict';
// ============================================================
//  hud.js — HUD・UI 描画管理
// ============================================================


// ---- コンパス（画面上のHDG表示） ----
export function updateCompass(heading) {
  const hdg = ((heading * 180 / Math.PI) % 360 + 360) % 360;
  const hd = document.getElementById('hd');
  if (hd) hd.textContent = hdg.toFixed(0).padStart(3, '0') + '°';
  const cn = document.getElementById('cn');
  if (cn) cn.style.transform = `rotate(${-heading * 180 / Math.PI}deg)`;
}

// ---- メインHUD（速力・エンジン状態等の小テキスト表示） ----
export function updateMainHUD(P, curM) {
  const as = Math.abs(P.speed);
  const ss = document.getElementById('ss2');
  if (ss) {
    ss.textContent = as > 12 ? '高速' : as > 6 ? '中速' : as > 2 ? '低速' : '停止';
    ss.style.color = as > 12 ? '#ff4444' : as > 6 ? '#ffcc00' : '#00ff88';
  }
  if (curM) {
    const dx = curM.tx - P.posX, dz = curM.tz - P.posZ;
    const ddEl = document.getElementById('dd');
    if (ddEl) ddEl.textContent = (Math.sqrt(dx*dx + dz*dz) / 1852).toFixed(1) + ' nm';
  }
}

// ---- 舵角アーク ----

export function drawRudder(rudder) {
  const cv  = document.getElementById('rucv');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const cx = cv.width / 2, cy = cv.height - 4, r = cv.height - 9;

  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.strokeStyle = 'rgba(0,255,136,.09)'; ctx.lineWidth = 7; ctx.stroke();

  for (let d = -35; d <= 35; d += 5) {
    const a   = Math.PI - (d + 35) / 70 * Math.PI;
    const inn = d % 10 === 0 ? r - 11 : r - 6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(a) * inn, cy + Math.sin(a) * inn);
    ctx.strokeStyle = d === 0 ? '#00ff8848' : '#00ff8820';
    ctx.lineWidth   = d % 10 === 0 ? 1.4 : 0.7;
    ctx.stroke();
  }

  const ra = Math.PI - (rudder + 35) / 70 * Math.PI;
  ctx.beginPath(); ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(ra) * (r + 2), cy + Math.sin(ra) * (r + 2));
  ctx.strokeStyle = '#00ccff'; ctx.lineWidth = 2.2;
  ctx.shadowColor = '#00ccff'; ctx.shadowBlur = 7;
  ctx.stroke(); ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - r);
  ctx.strokeStyle = '#00ff8828'; ctx.lineWidth = 0.9; ctx.stroke();
}

// ---- レーダー ----
export function drawRadar(posX, posZ, heading, AIships, fishBoats, curM) {
  const cv  = document.getElementById('rcv');
  const el  = document.getElementById('radar');
  if (!cv) return;
  cv.width  = el ? el.clientWidth  || 128 : 128;
  cv.height = cv.width;
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height, cx = w / 2, cy = h / 2, r = w / 2 - 2;
  ctx.clearRect(0, 0, w, h);

  const RM = 3 * 1852;
  const zoom = r / RM;

  // 他船
  for (const s of [...AIships, ...fishBoats]) {
    const dx = s.x - posX, dz = s.z - posZ;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist > RM) continue;
    const rot = -heading;
    const rx = dx * Math.cos(rot) - dz * Math.sin(rot);
    const rz = dx * Math.sin(rot) + dz * Math.cos(rot);
    ctx.beginPath();
    ctx.arc(cx + rx * zoom, cy - rz * zoom, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffcc00'; ctx.fill();
  }

  // ターゲット
  if (curM) {
    const dx = curM.tx - posX, dz = curM.tz - posZ;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist <= RM) {
      const rot = -heading;
      const rx = dx * Math.cos(rot) - dz * Math.sin(rot);
      const rz = dx * Math.sin(rot) + dz * Math.cos(rot);
      ctx.beginPath();
      ctx.arc(cx + rx * zoom, cy - rz * zoom, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#00ff88'; ctx.fill();
    }
  }

  // 自船
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
}

// ---- ナビゲーションデータ ----
export function updateNavData(P, curM) {
  const ids = ['td1','td2','td3','td4','td5','td6'];
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

  if (curM) {
    const dx = curM.tx - P.posX, dz = curM.tz - P.posZ;
    const ddEl = document.getElementById('dd');
    if (ddEl) ddEl.textContent = (Math.sqrt(dx*dx + dz*dz) / 1852).toFixed(1) + ' nm';
  }

  const ss = document.getElementById('ss2');
  if (ss) {
    ss.textContent = as > 12 ? '高速' : as > 6 ? '中速' : as > 2 ? '低速' : '停止';
    ss.style.color  = as > 12 ? '#ff4444' : as > 6 ? '#ffcc00' : '#00ff88';
  }
}

// ---- エンジンテレグラフ ----
const ENG_LABELS = ['FULL ASTERN','HALF ASTERN','SLOW ASTERN','DEAD SLOW ASTERN','STOP','DEAD SLOW AHEAD','SLOW AHEAD','HALF AHEAD','FULL AHEAD'];
const ENG_IDS    = ['tf0','tf1','tf2','tf3','tf4','tf5','tf6','tf7','tf8'];

// ---- 新しいテレグラフ（画面左上） ----
const NEW_ENG_LABELS = ['FULL ASTERN','HALF ASTERN','SLOW ASTERN','DEAD SLOW ASTERN','STOP','DEAD SLOW AHEAD','SLOW AHEAD','HALF AHEAD','FULL AHEAD'];
const NEW_ENG_IDS = ['tg-rev-full','tg-rev-half','tg-rev-slow','tg-rev-dead','tg-stop','tg-fwd-dead','tg-fwd-slow','tg-fwd-half','tg-fwd-full'];

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

// ---- 接岸ガイドバー ----
export function setDockBar(i, pct, cls, val) {
  const b = document.getElementById('db' + i);
  const v = document.getElementById('dv' + i);
  if (b) { b.style.width = pct + '%'; b.className = 'dbf ' + cls; }
  if (v) v.textContent = val;
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

// ---- VHF ----
let vhfTimer = null;
export function showVHF(txt, ch) {
  const p = document.getElementById('vhf');
  const t = document.getElementById('vt');
  const c = document.getElementById('vch');
  if (!p || !t) return;
  t.textContent = txt;
  if (ch && c) c.textContent = ch;
  p.classList.remove('h');
  clearTimeout(vhfTimer);
  vhfTimer = setTimeout(() => p.classList.add('h'), 9000);
}

// ---- フラッシュ ----
export function flashScreen(cls) {
  const f = document.getElementById('flash');
  if (!f) return;
  f.className = cls + ' on';
  setTimeout(() => f.className = '', 500);
}

// ---- ミッションバナー ----
export function showMissionBanner() {
  const b = document.getElementById('msb');
  if (!b) return;
  b.classList.add('v');
  flashScreen('w');
  setTimeout(() => b.classList.remove('v'), 2900);
}

// ---- スコアレーダーチャート ----
export function drawResultRadar(items, collision) {
  const cv  = document.getElementById('drrc2');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, r = 50;
  ctx.clearRect(0, 0, W, H);
  const n = items.length, angs = items.map((_, i) => i / n * Math.PI * 2 - Math.PI / 2);

  [0.25, 0.5, 0.75, 1].forEach(f => {
    ctx.beginPath();
    angs.forEach((a, i) => {
      const x = cx + Math.cos(a)*r*f, y = cy + Math.sin(a)*r*f;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath(); ctx.strokeStyle = `rgba(0,255,136,${0.05+f*0.05})`; ctx.lineWidth = 0.8; ctx.stroke();
  });
  angs.forEach(a => {
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
    ctx.strokeStyle = 'rgba(0,255,136,.1)'; ctx.lineWidth = 0.8; ctx.stroke();
  });

  ctx.beginPath();
  items.forEach((it, i) => {
    const f = it.pct / 100, x = cx + Math.cos(angs[i])*r*f, y = cy + Math.sin(angs[i])*r*f;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath();
  const sc = collision ? '#ff4444' : '#00ff88';
  ctx.fillStyle = collision ? 'rgba(255,68,68,.16)' : 'rgba(0,255,136,.14)'; ctx.fill();
  ctx.strokeStyle = sc; ctx.lineWidth = 1.4; ctx.shadowColor = sc; ctx.shadowBlur = 5; ctx.stroke(); ctx.shadowBlur = 0;

  items.forEach((it, i) => {
    const f = it.pct / 100, x = cx + Math.cos(angs[i])*r*f, y = cy + Math.sin(angs[i])*r*f;
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = sc; ctx.shadowColor = sc; ctx.shadowBlur = 3; ctx.fill(); ctx.shadowBlur = 0;
  });

  ctx.font = '8px Courier New'; ctx.fillStyle = 'rgba(0,255,136,.55)'; ctx.textAlign = 'center';
  items.forEach((it, i) => {
    const x = cx + Math.cos(angs[i]) * (r + 13), y = cy + Math.sin(angs[i]) * (r + 13) + 3;
    ctx.fillText(it.n, x, y);
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
  const wi  = document.getElementById('wi');
  const ws  = document.getElementById('ws');

  if (ni)  ni.style.background = 'rgba(0,4,16,0)';
  if (wo)  wo.style.background = 'rgba(0,0,0,0)';
  if (rc)  rc.style.opacity    = '0';
  if (wi)  wi.classList.add('h');

  const wxLabels = { day: '☀ 晴れ', ngt: '🌙 夜間', fog: '🌫 濃霧', str: '⛈ 台風', rain: '🌧 雨' };
  if (ws) ws.textContent = wxLabels[m.wx] || '晴れ';

  if (m.wx === 'ngt') {
    if (ni) ni.style.background = 'rgba(0,4,18,.75)';
    if (wi) { wi.classList.remove('h'); wi.textContent = '🌙 夜間航行 — 灯台・灯火に注意'; }
  }
  if (m.wx === 'str') {
    if (rc) rc.style.opacity = '1';
    if (wo) wo.style.background = 'rgba(40,55,65,.22)';
    if (wi) { wi.classList.remove('h'); wi.textContent = `⛈ 台風 — ${m.wind}kt / 波高${m.waves}m`; }
  }
  if (m.wx === 'rain') {
    if (rc) rc.style.opacity = '.7';
    if (wi) { wi.classList.remove('h'); wi.textContent = '🌧 雨天 — 視界不良'; }
  }
  if (m.fog > 0.4) {
    if (wi) { wi.classList.remove('h'); wi.textContent = `🌫 視程${Math.round((1 - m.fog) * 10 + 1)}km — レーダー活用`; }
  }
}

// ==== アナログ計器ダッシュボード ====

function drawBase(ctx, title, unit, minVal, maxVal, numStep, majStep, minStep) {
    const cx = 80; const cy = 80; const radius = 70;
    ctx.clearRect(0, 0, 160, 160);

    let grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#d5d5d5');
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = '#222'; ctx.stroke();

    const startAngleBase = -Math.PI * 1.25;
    const endAngleBase   =  Math.PI * 0.25;
    const range = maxVal - minVal;

    for (let i = minVal; i <= maxVal; i += minStep) {
        const ratio = (i - minVal) / range;
        const angle = startAngleBase + ratio * (endAngleBase - startAngleBase);
        const cosA = Math.cos(angle); const sinA = Math.sin(angle);

        if (i % majStep === 0) {
            ctx.beginPath();
            ctx.moveTo(cx + cosA * (radius - 12), cy + sinA * (radius - 12));
            ctx.lineTo(cx + cosA * radius, cy + sinA * radius);
            ctx.lineWidth = 1.5; ctx.strokeStyle = '#000'; ctx.stroke();
        } else if (i % minStep === 0) {
            ctx.beginPath();
            ctx.moveTo(cx + cosA * (radius - 6), cy + sinA * (radius - 6));
            ctx.lineTo(cx + cosA * radius, cy + sinA * radius);
            ctx.lineWidth = 0.5; ctx.strokeStyle = '#333'; ctx.stroke();
        }

        if (i % numStep === 0) {
            ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const textR = radius - 18;
            ctx.fillText(Math.abs(i), cx + cosA * textR, cy + sinA * textR);
        }
    }

    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.strokeText(title, cx, cy - 36); ctx.fillText(title, cx, cy - 36);
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444';
    ctx.strokeText(unit, cx, cy - 36 + 12); ctx.fillText(unit, cx, cy - 36 + 12);
}

function drawColorArc(ctx, minVal, maxVal, startVal, endVal, color, radius, width) {
    const range = maxVal - minVal;
    const startAngleBase = -Math.PI * 1.25;
    const endAngleBase   =  Math.PI * 0.25;
    const startAngle = startAngleBase + ((startVal - minVal) / range) * (endAngleBase - startAngleBase);
    const endAngle   = startAngleBase + ((endVal   - minVal) / range) * (endAngleBase - startAngleBase);
    ctx.beginPath();
    ctx.arc(80, 80, radius, startAngle, endAngle);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
}

function drawNeedle(ctx, val, minVal, maxVal, isRudder=false) {
    const cx = 80; const cy = 80; const radius = 70;
    const startAngleBase = -Math.PI * 1.25;
    const endAngleBase   =  Math.PI * 0.25;
    const v = Math.min(Math.max(val, minVal), maxVal);
    const angle = startAngleBase + ((v - minVal) / (maxVal - minVal)) * (endAngleBase - startAngleBase);
    const cosA = Math.cos(angle); const sinA = Math.sin(angle);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + cosA * (radius - 5), cy + sinA * (radius - 5));
    ctx.lineWidth = 2.5; ctx.strokeStyle = isRudder ? '#d32f2f' : '#000'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fillStyle = '#000'; ctx.fill();
    ctx.restore();
}

function drawNeedleCompass(ctx, valDeg, isWind=false) {
    const cx = 80; const cy = 80; const radius = 70;
    const angle = (valDeg * Math.PI / 180) - (Math.PI / 2);
    const cosA = Math.cos(angle); const sinA = Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(cx + cosA * (radius - 5), cy + sinA * (radius - 5));
    ctx.lineTo(cx + Math.cos(angle+Math.PI*0.9) * 15, cy + Math.sin(angle+Math.PI*0.9) * 15);
    ctx.lineTo(cx + Math.cos(angle-Math.PI*0.9) * 15, cy + Math.sin(angle-Math.PI*0.9) * 15);
    ctx.closePath();
    ctx.fillStyle = isWind ? '#3f51b5' : '#000'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fillStyle = isWind ? '#3f51b5' : '#000'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
}

export function setNight(night) {
    const NIGHT_C = 'rgba(230, 60, 40, 0.25)';
    const n = document.getElementById('night');
    if (n) n.style.backgroundColor = night ? NIGHT_C : 'transparent';
}

function updateClock(ctx) {
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 160);
    const now = new Date();
    const txt = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    ctx.font = 'bold 36px sans-serif'; ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, 80, 80);
    const dateTxt = (now.getMonth()+1) + '/' + now.getDate();
    ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#555'; ctx.fillText(dateTxt, 80, 115);
}

export function updateDashboard(P) {
    const cvs = {
        shipSpeed: document.getElementById('ship-speed-canvas'),
        rudder:    document.getElementById('rudder-canvas'),
        rot:       document.getElementById('rot-canvas'),
        rpm:       document.getElementById('rpm-canvas'),
        windSpeed: document.getElementById('wind-speed-canvas'),
        windDir:   document.getElementById('wind-dir-canvas'),
        clock:     document.getElementById('clock-canvas')
    };
    if (!cvs.shipSpeed) return;

    let ctx;

    // 1. SHIP SPEED
    ctx = cvs.shipSpeed.getContext('2d');
    drawBase(ctx, 'SPEED', 'KNOTS', 0, 30, 5, 5, 1);
    drawColorArc(ctx, 0, 30, 10, 15, '#ffcc00', 35, 6);
    drawColorArc(ctx, 0, 30, 20, 30, '#d32f2f', 35, 6);
    drawNeedle(ctx, Math.abs(P.speed), 0, 30);

    // 2. RUDDER
    ctx = cvs.rudder.getContext('2d');
    drawBase(ctx, 'RUDDER', 'DEG', -35, 35, 10, 5, 1);
    drawColorArc(ctx, -35, 35, -35, 0, '#d32f2f', 35, 6);
    drawColorArc(ctx, -35, 35, 0, 35, '#388e3c', 35, 6);
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#d32f2f'; ctx.fillText('PORT', 30, 85);
    ctx.fillStyle = '#388e3c'; ctx.fillText('STBD', 130, 85);
    drawNeedle(ctx, P.rudder, -35, 35, true);

    // 3. RATE OF TURN
    ctx = cvs.rot.getContext('2d');
    drawBase(ctx, 'RATE OF TURN', 'DEG/MIN', -30, 30, 10, 5, 1);
    drawColorArc(ctx, -30, 30, -30, 0, '#d32f2f', 35, 6);
    drawColorArc(ctx, -30, 30, 0, 30, '#388e3c', 35, 6);
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#d32f2f'; ctx.fillText('PORT', 30, 85);
    ctx.fillStyle = '#388e3c'; ctx.fillText('STBD', 130, 85);
    drawNeedle(ctx, P.yawRate * (180 / Math.PI) * 60, -30, 30, true);

    // 4. ENGINE RPM
    ctx = cvs.rpm.getContext('2d');
    drawBase(ctx, 'ENGINE', 'RPM', -50, 120, 20, 10, 5);
    drawColorArc(ctx, -50, 120, -50,   0, '#ff8800', 35, 6);
    drawColorArc(ctx, -50, 120,   0,  80, '#388e3c', 35, 6);
    drawColorArc(ctx, -50, 120,  80, 100, '#ffcc00', 35, 6);
    drawColorArc(ctx, -50, 120, 100, 120, '#d32f2f', 35, 6);
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = '#ff8800'; ctx.fillText('ASTERN', 33, 85);
    ctx.fillStyle = '#388e3c'; ctx.fillText('AHEAD', 127, 85);
    drawNeedle(ctx, P.rpm, -50, 120);

    // 5. WIND SPEED
    ctx = cvs.windSpeed.getContext('2d');
    drawBase(ctx, 'WIND SPEED', 'KNOTS', 0, 100, 20, 10, 5);
    drawNeedle(ctx, P.windSpeed, 0, 100);

    // 6. WIND DIRECTION (相対風向)
    ctx = cvs.windDir.getContext('2d');
    const cx = 80; const cy = 80; const radius = 70;
    ctx.clearRect(0, 0, 160, 160);
    const wGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius);
    wGrad.addColorStop(0, '#ffffff'); wGrad.addColorStop(1, '#d5d5d5');
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = wGrad; ctx.fill();
    ctx.save();
    ctx.fillStyle = 'rgba(60, 80, 100, 0.25)'; ctx.translate(cx, cy);
    ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(12, 1); ctx.lineTo(10, 23); ctx.lineTo(0, 28); ctx.lineTo(-10, 23); ctx.lineTo(-12, 1); ctx.closePath(); ctx.fill();
    ctx.restore();
    for (let i = 0; i < 360; i += 10) {
        const ac = (i * Math.PI / 180) - (Math.PI / 2);
        let sR = radius - 6; if (i % 30 === 0) sR -= 6;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(ac)*sR, cy + Math.sin(ac)*sR); ctx.lineTo(cx + Math.cos(ac)*radius, cy + Math.sin(ac)*radius);
        ctx.lineWidth = i % 30 === 0 ? 2 : 1; ctx.strokeStyle = '#333'; ctx.stroke();
        if (i % 30 === 0 && i !== 0) {
            ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(i, cx + Math.cos(ac)*(radius-18), cy + Math.sin(ac)*(radius-18));
        }
    }
    const relWind = (((P.windDir - P.heading * 180 / Math.PI) % 360) + 360) % 360;
    drawNeedleCompass(ctx, relWind, true);
    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.strokeText('WIND DIR', cx, cy - 36); ctx.fillText('WIND DIR', cx, cy - 36);
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444';
    ctx.strokeText('DEG (REL)', cx, cy - 36 + 12); ctx.fillText('DEG (REL)', cx, cy - 36 + 12);

    // 7. CLOCK
    if (cvs.clock) updateClock(cvs.clock.getContext('2d'));
}

    const cx = 80; const cy = 80; const radius = 70;
    ctx.clearRect(0, 0, 160, 160);

    let grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#d5d5d5');
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = '#222'; ctx.stroke();

    const startAngleBase = -Math.PI * 1.25;
    const endAngleBase   =  Math.PI * 0.25;
    const range = maxVal - minVal;

    // 目盛りと数字
    for (let i = minVal; i <= maxVal; i += minStep) {
        const ratio = (i - minVal) / range;
        const angle = startAngleBase + ratio * (endAngleBase - startAngleBase);
        const cosA = Math.cos(angle); const sinA = Math.sin(angle);

        if (i % majStep === 0) {
            ctx.beginPath();
            ctx.moveTo(cx + cosA * (radius - 12), cy + sinA * (radius - 12));
            ctx.lineTo(cx + cosA * radius, cy + sinA * radius);
            ctx.lineWidth = 1.5; ctx.strokeStyle = '#000'; ctx.stroke();
        } else if (i % minStep === 0) {
            ctx.beginPath();
            ctx.moveTo(cx + cosA * (radius - 6), cy + sinA * (radius - 6));
            ctx.lineTo(cx + cosA * radius, cy + sinA * radius);
            ctx.lineWidth = 0.5; ctx.strokeStyle = '#333'; ctx.stroke();
        }

        if (i % numStep === 0) {
            ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const textR = radius - 18;
            ctx.fillText(Math.abs(i), cx + cosA * textR, cy + sinA * textR);
        }
    }

    // タイトルを中央に（白フチ付きで視認性アップ）
    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.strokeText(title, cx, cy - 36); ctx.fillText(title, cx, cy - 36);
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444';
    ctx.strokeText(unit, cx, cy - 36 + 12); ctx.fillText(unit, cx, cy - 36 + 12);
}

function drawColorArc(ctx, minVal, maxVal, startVal, endVal, color, radius, width) {
    const range = maxVal - minVal;
    const startAngleBase = -Math.PI * 1.25; 
    const endAngleBase   =  Math.PI * 0.25; 
    function valToAngle(val) {
        const ratio = (val - minVal) / range;
        return startAngleBase + ratio * (endAngleBase - startAngleBase);
    }
    const startAngle = valToAngle(startVal);
    const endAngle   = valToAngle(endVal);

    ctx.beginPath();
    ctx.arc(80, 80, radius, startAngle, endAngle);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
}

// ==================================================================
// drawNeedle: シンプルで視認性の高い黒い針
// ==================================================================
function drawNeedle(ctx, val, minVal, maxVal, isRudder=false) {
    const cx = 80; const cy = 80; const radius = 70;
    const startAngleBase = -Math.PI * 1.25; 
    const endAngleBase   =  Math.PI * 0.25; 
    const range = maxVal - minVal;
    let v = Math.min(Math.max(val, minVal), maxVal);
    const ratio = (v - minVal) / range;
    const angle = startAngleBase + ratio * (endAngleBase - startAngleBase);
    const cosA = Math.cos(angle); const sinA = Math.sin(angle);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + cosA * (radius - 5), cy + sinA * (radius - 5));
    ctx.lineWidth = 2.5; ctx.strokeStyle = isRudder ? '#d32f2f' : '#000'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fillStyle = '#000'; ctx.fill();
    ctx.restore();
}

function drawNeedleCompass(ctx, valDeg, isWind=false) {
    const cx = 80; const cy = 80; const radius = 70;
    const angle = (valDeg * Math.PI / 180) - (Math.PI / 2);
    const cosA = Math.cos(angle); const sinA = Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(cx + cosA * (radius - 5), cy + sinA * (radius - 5)); 
    ctx.lineTo(cx + Math.cos(angle+Math.PI*0.9) * 15, cy + Math.sin(angle+Math.PI*0.9) * 15);
    ctx.lineTo(cx + Math.cos(angle-Math.PI*0.9) * 15, cy + Math.sin(angle-Math.PI*0.9) * 15);
    ctx.closePath();
    ctx.fillStyle = isWind ? '#3f51b5' : '#000'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fillStyle = isWind ? '#3f51b5' : '#000'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
}

export function setNight(night) {
    const NIGHT_C = 'rgba(230, 60, 40, 0.25)';
    const n = document.getElementById('night');
    if (n) n.style.backgroundColor = night ? NIGHT_C : 'transparent';
}

function updateClock(ctx) {
    if (!ctx) return;
    ctx.clearRect(0, 0, 160, 160);
    const now = new Date();
    const txt = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    ctx.font = 'bold 36px sans-serif'; ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, 80, 80);
    const dateTxt = (now.getMonth()+1) + '/' + now.getDate();
    ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#555'; ctx.fillText(dateTxt, 80, 115);
}

// ==================================================================
// updateDashboard: 全メーターをクリーンなレイアウトで描画
// ==================================================================
export function updateDashboard(P) {
    const cvs = {
        shipSpeed: document.getElementById('ship-speed-canvas'),
        rudder: document.getElementById('rudder-canvas'),
        rot: document.getElementById('rot-canvas'),
        rpm: document.getElementById('rpm-canvas'),
        windSpeed: document.getElementById('wind-speed-canvas'),
        windDir: document.getElementById('wind-dir-canvas'),
        clock: document.getElementById('clock-canvas')
    };
    if (!cvs.shipSpeed) return;

    let ctx;

    // 1. SHIP SPEED (0-30 KNOTS)
    ctx = cvs.shipSpeed.getContext('2d');
    drawBase(ctx, 'SPEED', 'KNOTS', 0, 30, 5, 5, 1);
    drawColorArc(ctx, 0, 30, 10, 15, '#ffcc00', 35, 6);
    drawColorArc(ctx, 0, 30, 20, 30, '#d32f2f', 35, 6);
    drawNeedle(ctx, Math.abs(P.speed), 0, 30);

    // 2. RUDDER (DEG)
    ctx = cvs.rudder.getContext('2d');
    drawBase(ctx, 'RUDDER', 'DEG', -35, 35, 10, 5, 1);
    drawColorArc(ctx, -35, 35, -35, 0, '#d32f2f', 35, 6);
    drawColorArc(ctx, -35, 35, 0, 35, '#388e3c', 35, 6);
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#d32f2f'; ctx.fillText('PORT', 30, 85);
    ctx.fillStyle = '#388e3c'; ctx.fillText('STBD', 130, 85);
    drawNeedle(ctx, P.rudder, -35, 35, true);

    // 3. RATE OF TURN (DEG/MIN)
    ctx = cvs.rot.getContext('2d');
    drawBase(ctx, 'RATE OF TURN', 'DEG/MIN', -30, 30, 10, 5, 1);
    drawColorArc(ctx, -30, 30, -30, 0, '#d32f2f', 35, 6);
    drawColorArc(ctx, -30, 30, 0, 30, '#388e3c', 35, 6);
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#d32f2f'; ctx.fillText('PORT', 30, 85);
    ctx.fillStyle = '#388e3c'; ctx.fillText('STBD', 130, 85);
    drawNeedle(ctx, P.yawRate * (180 / Math.PI) * 60, -30, 30, true);

    // 4. ENGINE (RPM)
    ctx = cvs.rpm.getContext('2d');
    drawBase(ctx, 'ENGINE', 'RPM', -50, 120, 20, 10, 5);
    drawColorArc(ctx, -50, 120, -50, 0, '#ff8800', 35, 6);
    drawColorArc(ctx, -50, 120, 0, 80, '#388e3c', 35, 6);
    drawColorArc(ctx, -50, 120, 80, 100, '#ffcc00', 35, 6);
    drawColorArc(ctx, -50, 120, 100, 120, '#d32f2f', 35, 6);
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = '#ff8800'; ctx.fillText('ASTERN', 33, 85);
    ctx.fillStyle = '#388e3c'; ctx.fillText('AHEAD', 127, 85);
    drawNeedle(ctx, P.rpm, -50, 120);

    // 5. WIND SPEED (KNOTS)
    ctx = cvs.windSpeed.getContext('2d');
    drawBase(ctx, 'WIND SPEED', 'KNOTS', 0, 100, 20, 10, 5);
    drawNeedle(ctx, P.windSpeed, 0, 100);

    // 6. WIND DIRECTION (REL)
    ctx = cvs.windDir.getContext('2d');
    const cx = 80; const cy = 80; const radius = 70;
    ctx.clearRect(0, 0, 160, 160);
    let grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius); 
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#d5d5d5');
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
    ctx.save();
    ctx.fillStyle = 'rgba(60, 80, 100, 0.25)'; ctx.translate(cx, cy); ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(12, 1); ctx.lineTo(10, 23); ctx.lineTo(0, 28); ctx.lineTo(-10, 23); ctx.lineTo(-12, 1); ctx.closePath(); ctx.fill();
    ctx.restore();
    for (let i = 0; i < 360; i += 10) {
        let angleCompass = (i * Math.PI / 180) - (Math.PI / 2);
        let startR = radius - 6; let endR = radius; if (i % 30 === 0) startR -= 6;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(angleCompass) * startR, cy + Math.sin(angleCompass) * startR); ctx.lineTo(cx + Math.cos(angleCompass) * endR, cy + Math.sin(angleCompass) * endR); ctx.lineWidth = i % 30 === 0 ? 2 : 1; ctx.strokeStyle = '#333'; ctx.stroke();
        if (i % 30 === 0 && i !== 0) {
            ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            let textR = radius - 18; ctx.fillText(i, cx + Math.cos(angleCompass) * textR, cy + Math.sin(angleCompass) * textR);
        }
    }

    // 相対風向の計算と表示
    let headingDeg = P.heading * (180 / Math.PI);
    let relativeWindDir = P.windDir - headingDeg;
    relativeWindDir = ((relativeWindDir % 360) + 360) % 360;
    drawNeedleCompass(ctx, relativeWindDir, true);

    // 風向計のタイトル
    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.strokeText('WIND DIR', cx, cy - 36); ctx.fillText('WIND DIR', cx, cy - 36);
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#444';
    ctx.strokeText('DEG (REL)', cx, cy - 36 + 12); ctx.fillText('DEG (REL)', cx, cy - 36 + 12);

    // 7. CLOCK
    if (cvs.clock) updateClock(cvs.clock.getContext('2d'));
}
