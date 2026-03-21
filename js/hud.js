'use strict';
// ============================================================
//  hud.js — HUD・UI 描画管理
// ============================================================

// ---- 舵角アーク ----
export function drawRudder(rudder) {
  const cv  = document.getElementById('rucv');
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
  cv.width  = el ? el.clientWidth  || 128 : 128;
  cv.height = cv.width;
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height, cx = w / 2, cy = h / 2, r = w / 2 - 2;
  ctx.clearRect(0, 0, w, h);

  const RM = 3 * 1852;
  const zoom = r / RM; // レーダーのズーム倍率

  // 他船
  [...AIships.map(s => ({ x: s.mesh.position.x, z: s.mesh.position.z, c: '#00aaff88', sz: s.sz || 1 })),
   ...fishBoats.map(f => ({ x: f.mesh.position.x, z: f.mesh.position.z, c: '#00ff8850', sz: 0.5 }))
  ].forEach(t => {
    const dx = t.x - posX, dz = t.z - posZ, dist = Math.sqrt(dx*dx + dz*dz);
    if (dist > RM) return;
    
    // Xも反転させて3D空間の見た目と一致させる
    const rx = cx - (dx * zoom);
    const ry = cy - (dz * zoom);
    
    ctx.beginPath(); ctx.arc(rx, ry, 2.5 * Math.min(t.sz, 2), 0, Math.PI * 2);
    ctx.fillStyle = t.c; ctx.shadowColor = t.c; ctx.shadowBlur = 2.5;
    ctx.fill(); ctx.shadowBlur = 0;
  });

  // 目標港
  if (curM) {
    const dx = curM.tx - posX, dz = curM.tz - posZ, td = Math.sqrt(dx*dx + dz*dz);
    if (td <= RM) {
      const rx = cx - (dx * zoom);
      const ry = cy - (dz * zoom); // 北を上にする
      ctx.beginPath(); ctx.arc(rx, ry, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffcc00'; ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 8;
      ctx.fill(); ctx.shadowBlur = 0;
    }
  }

  // 中心点（自船）を描画
  ctx.save();
  ctx.translate(cx, cy); // レーダー中心へ
  ctx.rotate(heading);   // ★ アイコンの回転方向も反転して見た目と一致させる

  // 船の形（三角形）に描画
  ctx.beginPath();
  ctx.moveTo(0, -6);    // トップ（船首）
  ctx.lineTo(3.5, 4);   // 右舷後方
  ctx.lineTo(-3.5, 4);  // 左舷後方
  ctx.closePath();
  ctx.fillStyle = '#00ff88'; ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 6;
  ctx.fill(); ctx.shadowBlur = 0;
  ctx.restore();
}

// ---- コンパス針 ----
export function updateCompass(heading) {
  const deg = ((heading * 180 / Math.PI) % 360 + 360) % 360;
  const el  = document.getElementById('hd');
  if (el) el.textContent = String(Math.round(deg)).padStart(3, '0') + '°';
  const needle = document.getElementById('cn');
  if (needle) needle.style.transform = `translate(-50%,-100%) rotate(${heading * 180 / Math.PI}deg)`;
}

// ---- 速力・HUD ----
export function updateMainHUD(P, curM) {
  const as = Math.abs(P.speed);
  const sdEl = document.getElementById('spd');
  if (sdEl) sdEl.textContent = as.toFixed(1);
  const sb = document.getElementById('sbar');
  if (sb) sb.style.width = (as / P.maxFwd * 100) + '%';
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
const ENG_LABELS = ['FULL ASTERN','HALF ASTERN','SLOW ASTERN','STOP','SLOW AHEAD','HALF AHEAD','FULL AHEAD'];
const ENG_IDS    = ['tf0','tf1','tf2','tf3','tf4','tf5','tf6'];

export function updateTelegraph(engineOrder) {
  const idx = engineOrder + 3;
  ENG_IDS.forEach((id, i) => document.getElementById(id)?.classList.toggle('on', i === idx));
  const td = document.getElementById('td');
  if (td) td.textContent = ENG_LABELS[idx];
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
  if (!dm) return; // 修正
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

  // 内訳バー
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

  // ペナルティ
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

  // リセット
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

// ==== アナログ計器ダッシュボード (文字盤・メモリ描画版) ====
function drawBase(ctx, title, unit, min, max, majorTicks, minorTicks, isRudder = false) {
    const cx = 80, cy = 80, radius = 65;
    ctx.clearRect(0, 0, 160, 160);

    // 文字盤
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();

    // メモリ
    for (let i = min; i <= max; i += minorTicks) {
        let percent = (i - min) / (max - min);
        let angle = (percent * 270 - 135) * Math.PI / 180 - (Math.PI / 2);
        let startR = radius - 5;
        let endR = radius;
        if (i % majorTicks === 0) startR -= 5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * startR, cy + Math.sin(angle) * startR);
        ctx.lineTo(cx + Math.cos(angle) * endR, cy + Math.sin(angle) * endR);
        ctx.lineWidth = 1; ctx.strokeStyle = '#333'; ctx.stroke();

        // 数字
        if (i % majorTicks === 0) {
            ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#333';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            let textR = radius - 15;
            ctx.fillText(i, cx + Math.cos(angle) * textR, cy + Math.sin(angle) * textR);
        }
    }

    // タイトルと単位
    ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#333';
    ctx.fillText(title, cx, cy - 30);
    ctx.font = '12px sans-serif';
    ctx.fillText(unit, cx, cy + 30);
}

function drawNeedle(ctx, value, min, max, isRudder = false) {
    const cx = 80, cy = 80, radius = 60;
    const clampedValue = Math.max(min, Math.min(max, value));
    const percent = (clampedValue - min) / (max - min);
    const angle = (percent * 270 - 135) * Math.PI / 180 - (Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.lineWidth = 4; ctx.strokeStyle = isRudder ? '#d32f2f' : '#333'; ctx.stroke();
    // 針の中心
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#333'; ctx.fill();
}

function drawDigitalValue(ctx, value, unitLabel) {
    ctx.font = 'bold 20px monospace'; ctx.fillStyle = '#333';
    ctx.fillText(value.toFixed(1), 80, 80 + 17);
    ctx.font = '10px sans-serif'; ctx.fillStyle = '#666';
    ctx.fillText(unitLabel, 80, 80 + 32);
}

function updateClock(ctx) {
    const cx = 80, cy = 80;
    ctx.clearRect(0, 0, 160, 160);
    ctx.beginPath(); ctx.arc(cx, cy, 65, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();

    for (let i = 0; i < 60; i++) {
        let angle = (i * 6 - 90) * Math.PI / 180;
        let startR = 60, endR = 65;
        if (i % 5 === 0) startR -= 5;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * startR, cy + Math.sin(angle) * startR);
        ctx.lineTo(cx + Math.cos(angle) * endR, cy + Math.sin(angle) * endR);
        ctx.lineWidth = 1; ctx.strokeStyle = '#333'; ctx.stroke();
    }
    ctx.font = 'bold 16px sans-serif'; ctx.fillStyle = '#333';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
        let angle = (i * 30 - 90) * Math.PI / 180;
        ctx.fillText(i, cx + Math.cos(angle) * 50, cy + Math.sin(angle) * 50);
    }
    const now = new Date();
    const sec = now.getSeconds() + now.getMilliseconds() / 1000;
    const min = now.getMinutes() + sec / 60;
    const hr = (now.getHours() % 12) + min / 60;

    const drawHand = (pos, length, width, color, denom) => {
        const handAngle = (pos * (360 / denom) - 90) * Math.PI / 180;
        ctx.beginPath(); ctx.lineWidth = width; ctx.strokeStyle = color;
        ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(handAngle) * length, cy + Math.sin(handAngle) * length); ctx.stroke();
    };
    drawHand(hr, 30, 4, '#333', 12);
    drawHand(min, 45, 3, '#333', 60);
    drawHand(sec, 50, 1, 'red', 60);
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fillStyle = '#333'; ctx.fill();
}

export function updateDashboard(P) {
    const cvs = {
        windDir: document.getElementById('wind-dir-canvas'),
        windSpeed: document.getElementById('wind-speed-canvas'),
        shipSpeed: document.getElementById('ship-speed-canvas'),
        rudder: document.getElementById('rudder-canvas'),
        rot: document.getElementById('rot-canvas'),
        rpm: document.getElementById('rpm-canvas'),
        clock: document.getElementById('clock-canvas')
    };
    if (!cvs.windDir) return;

    let ctx = cvs.windDir.getContext('2d');
    drawBase(ctx, 'WIND DIRECTION', 'DEG', 0, 360, 90, 10);
    ctx.font = '20px serif'; ctx.fillText('⛵', 80, 80);
    drawNeedle(ctx, P.windDir, 0, 360);

    ctx = cvs.windSpeed.getContext('2d');
    drawBase(ctx, 'WIND SPEED', 'KNOTS', 0, 100, 20, 5);
    drawNeedle(ctx, P.windSpeed, 0, 100);

    ctx = cvs.shipSpeed.getContext('2d');
    const shipSpeed = P.u / 0.5144;
    drawBase(ctx, 'SHIP SPEED', 'KNOTS', -10, 30, 10, 1);
    drawNeedle(ctx, shipSpeed, -10, 30);

    ctx = cvs.rudder.getContext('2d');
    drawBase(ctx, 'RUDDER', 'DEG', -35, 35, 10, 1, true);
    drawNeedle(ctx, P.rudder, -35, 35, true);

    ctx = cvs.rot.getContext('2d');
    const rotDegMin = P.yawRate * (180 / Math.PI) * 60;
    drawBase(ctx, 'RATE OF TURN', 'DEG/MIN', -30, 30, 10, 1);
    drawNeedle(ctx, rotDegMin, -30, 30);
    drawDigitalValue(ctx, rotDegMin, 'deg/m');

    ctx = cvs.rpm.getContext('2d');
    drawBase(ctx, 'ENGINE RPM', 'RPM', -40, 100, 20, 5);
    drawNeedle(ctx, P.rpm, -40, 100);

    updateClock(cvs.clock.getContext('2d'));
}
