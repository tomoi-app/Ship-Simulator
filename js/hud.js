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

// ---- 新しいテレグラフ（画面左上） ----
const NEW_ENG_LABELS = ['FULL ASTERN','HALF ASTERN','SLOW ASTERN','DEAD SLOW ASTERN','STOP','DEAD SLOW AHEAD','SLOW AHEAD','HALF AHEAD','FULL AHEAD'];
// HTMLに追加したID（Full Asternが最後尾、Full Aheadが最上部）
const NEW_ENG_IDS = ['tg-rev-full','tg-rev-half','tg-rev-slow','tg-rev-dead','tg-stop','tg-fwd-dead','tg-fwd-slow','tg-fwd-half','tg-fwd-full'];

export function updateTelegraph(engineOrder) {
    // P.engineOrder は -4(Full Astern) から +4(Full Ahead)
    // 配列のインデックスに変換: -4 -> 0, -3 -> 1, ..., 0 -> 4, ..., +4 -> 8
    const idx = engineOrder + 4; 

    // 【追加】新しい左上テレグラフの表示更新
    NEW_ENG_IDS.forEach((id, i) => {
        document.getElementById(id)?.classList.toggle('on', i === idx);
    });

    // (既存の非表示UIも一応更新しておく)
    const ENG_LABELS = ['FULL ASTERN','HALF ASTERN','SLOW ASTERN','DEAD SLOW ASTERN','STOP','DEAD SLOW AHEAD','SLOW AHEAD','HALF AHEAD','FULL AHEAD'];
    const ENG_IDS    = ['tf0','tf1','tf2','tf3','tf4','tf5','tf6','tf7','tf8'];
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

// ==== アナログ計器ダッシュボード (メーターカラー帯・UI洗練版) ====
function drawBase(ctx, title, unit, min, max, majorTicks, minorTicks) {
    const cx = 80; const cy = 80; const radius = 70;
    ctx.clearRect(0, 0, 160, 160);

    // 文字盤の背景（リアルな立体感を出すグラデーション）
    let grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#d5d5d5');
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // メモリの描画
    for (let i = min; i <= max; i += minorTicks) {
        let percent = (i - min) / (max - min);
        let angle = (percent * 270 - 135) * Math.PI / 180 - (Math.PI / 2);
        let startR = radius - 6;
        let endR = radius;
        if (i % majorTicks === 0) startR -= 6;

        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * startR, cy + Math.sin(angle) * startR);
        ctx.lineTo(cx + Math.cos(angle) * endR, cy + Math.sin(angle) * endR);
        ctx.lineWidth = i % majorTicks === 0 ? 2 : 1;
        ctx.strokeStyle = '#333';
        ctx.stroke();

        // 数字
        if (i % majorTicks === 0) {
            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = '#222';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let textR = radius - 18;
            ctx.fillText(i, cx + Math.cos(angle) * textR, cy + Math.sin(angle) * textR);
        }
    }

    // ==========================================
    // 【変更点】四角い背景を廃止し、文字のフチ取りのみにする
    // ==========================================
    ctx.textAlign = 'center';
    let textY = cy - 36;
    
    ctx.lineWidth = 4; // フチの太さ
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'; // 半透明の白いフチ

    // タイトル
    ctx.font = 'bold 11px sans-serif';
    ctx.strokeText(title, cx, textY);
    ctx.fillStyle = '#111';
    ctx.fillText(title, cx, textY);
    
    // 単位
    ctx.font = '10px sans-serif';
    ctx.strokeText(unit, cx, textY + 11);
    ctx.fillStyle = '#444';
    ctx.fillText(unit, cx, textY + 11);
}

// ------------------------------------------------------------------
// 【追加】縦書きテキスト描画ヘルパー
// ------------------------------------------------------------------
function drawVerticalText(ctx, text, x, startY, color, fontSize = 10) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const step = fontSize * 1.1; // 行間
    // 文字列全体の高さを計算して、中央がstartYにくるように調整
    const totalHeight = (text.length - 1) * step;
    let y = startY - totalHeight / 2;
    for (let char of text) {
        ctx.fillText(char, x, y);
        y += step;
    }
}

// ------------------------------------------------------------------
// 【修正】drawColorArc: 指定範囲に色帯を描画 (文字エリアのくり抜き対応)
// ------------------------------------------------------------------
function drawColorArc(ctx, minVal, maxVal, startVal, endVal, color, radius, width, cutouts = []) {
    const range = maxVal - minVal;
    const startAngleBase = -Math.PI * 1.25; 
    const endAngleBase   =  Math.PI * 0.25; 
    function valToAngle(val) {
        const ratio = (val - minVal) / range;
        return startAngleBase + ratio * (endAngleBase - startAngleBase);
    }

    const startAngle = valToAngle(startVal);
    const endAngle   = valToAngle(endVal);

    ctx.save();
    
    // ▼ 文字の領域だけ色帯を「消す（クリッピング）」処理
    ctx.beginPath();
    // 1. まず全体を描画許可エリアとする
    ctx.rect(0, 0, 160, 160);
    
    // 2. くり抜きたい四角形を追加（evenoddルールにより、この中は描画されなくなる）
    if (cutouts && cutouts.length > 0) {
        for (let c of cutouts) {
            ctx.rect(c.x, c.y, c.w, c.h);
        }
    }
    ctx.clip('evenodd');

    // 色帯（アーク）の描画
    ctx.beginPath();
    ctx.arc(80, 80, radius, startAngle, endAngle);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.restore();
}

function drawNeedle(ctx, value, min, max, isRudder = false) {
    const cx = 80; const cy = 80; const radius = 55;
    const clampedValue = Math.max(min, Math.min(max, value));
    const percent = (clampedValue - min) / (max - min);
    const angle = (percent * 270 - 135) * Math.PI / 180 - (Math.PI / 2);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.lineWidth = 4;
    ctx.strokeStyle = isRudder ? '#d32f2f' : '#222';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#222';
    ctx.fill();
}

// 風向計用の針描画ヘルパー (方位計タイプに対応、赤くて太い)
function drawNeedleCompass(ctx, value, isRudder = false) {
    const cx = 80; const cy = 80; const radius = 55;
    // 真上が0の方位計タイプに角度計算を調整
    const angleCompass = (value * Math.PI / 180) - (Math.PI / 2);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angleCompass) * radius, cy + Math.sin(angleCompass) * radius);
    ctx.lineWidth = 4;
    ctx.strokeStyle = isRudder ? '#d32f2f' : '#222';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#222';
    ctx.fill();
}

// --- 風向計用の文字描画（こちらも四角い背景を削除） ---
function drawTextOverlay(ctx, title, unit) {
    const cx = 80; const cy = 80; let textY = cy - 36;
    ctx.textAlign = 'center';
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

function updateClock(ctx) {
    if(!ctx) return;
    const cx = 80; const cy = 80;
    ctx.clearRect(0, 0, 160, 160);

    let grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 70);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#d5d5d5');
    ctx.beginPath();
    ctx.arc(cx, cy, 70, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    for (let i = 0; i < 60; i++) {
        let angle = (i * 6 - 90) * Math.PI / 180;
        let startR = 64; let endR = 70;
        if (i % 5 === 0) startR -= 6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * startR, cy + Math.sin(angle) * startR);
        ctx.lineTo(cx + Math.cos(angle) * endR, cy + Math.sin(angle) * endR);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#333';
        ctx.stroke();
    }

    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#222';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
        let angle = (i * 30 - 90) * Math.PI / 180;
        ctx.fillText(i, cx + Math.cos(angle) * 50, cy + Math.sin(angle) * 50);
    }

    const now = new Date();
    const sec = now.getSeconds() + now.getMilliseconds() / 1000;
    const min = now.getMinutes() + sec / 60;
    const hr = (now.getHours() % 12) + min / 60;

    const drawHand = (pos, length, width, color) => {
        const handAngle = (pos * (360 / (color === 'red' ? 60 : 12)) - 90) * Math.PI / 180;
        ctx.beginPath();
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(handAngle) * length, cy + Math.sin(handAngle) * length);
        ctx.stroke();
    };

    drawHand(hr, 35, 4, '#333'); 
    drawHand(min, 50, 3, '#333'); 
    drawHand(sec, 55, 1, 'red'); 

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#222';
    ctx.fill();
}

export function updateDashboard(P) {
    const cvs = {
        windSpeed: document.getElementById('wind-speed-canvas'),
        shipSpeed: document.getElementById('ship-speed-canvas'),
        rudder: document.getElementById('rudder-canvas'),
        rot: document.getElementById('rot-canvas'),
        rpm: document.getElementById('rpm-canvas'),
        windDir: document.getElementById('wind-dir-canvas'),
        clock: document.getElementById('clock-canvas')
    };
    if (!cvs.windSpeed) return;

    let ctx;

    // Wind Speed
    ctx = cvs.windSpeed.getContext('2d');
    drawBase(ctx, 'WIND SPEED', 'KNOTS', 0, 100, 20, 5);
    drawNeedle(ctx, P.windSpeed, 0, 100);

    // Ship Speed (0-40ノット)
    ctx = cvs.shipSpeed.getContext('2d');
    drawBase(ctx, 'SPEED', 'KNOTS', 0, 40, 5, 1);
    // 上部のタイトル「SPEED」と被らないように半径を 56 に拡大
    drawColorArc(ctx, 0, 40, 10, 15, '#ffcc00', 56, 4);
    drawColorArc(ctx, 0, 40, 20, 40, '#d32f2f', 56, 4); 
    const shipSpeed = Math.abs(P.speed);
    drawNeedle(ctx, shipSpeed, 0, 40);

    // Rudder (舵角)
    ctx = cvs.rudder.getContext('2d');
    drawBase(ctx, 'RUDDER', 'DEG', -35, 35, 10, 5);
    // 縦文字を描画するエリアの色帯をくり抜く指定（x, y, 幅, 高さ）
    const rCutouts = [
        {x: 20, y: 55, w: 20, h: 50}, // 左舷(PORT)用の空白
        {x: 120, y: 55, w: 20, h: 50} // 右舷(STBD)用の空白
    ];
    drawColorArc(ctx, -35, 35, -35, 0, '#d32f2f', 56, 6, rCutouts); // PORT(赤)
    drawColorArc(ctx, -35, 35, 0, 35, '#388e3c', 56, 6, rCutouts);  // STBD(緑)
    // PORT / STBD を縦書きで隙間にピタッと配置
    drawVerticalText(ctx, 'PORT', 30, 80, '#d32f2f', 10);
    drawVerticalText(ctx, 'STBD', 130, 80, '#388e3c', 10);
    drawNeedle(ctx, P.rudder, -35, 35, true);

    // ROT (旋回角速度)
    ctx = cvs.rot.getContext('2d');
    drawBase(ctx, 'RATE OF TURN', 'DEG/MIN', -30, 30, 10, 5);
    drawColorArc(ctx, -30, 30, -30, 0, '#d32f2f', 56, 6, rCutouts);
    drawColorArc(ctx, -30, 30, 0, 30, '#388e3c', 56, 6, rCutouts);
    drawVerticalText(ctx, 'PORT', 30, 80, '#d32f2f', 10);
    drawVerticalText(ctx, 'STBD', 130, 80, '#388e3c', 10);
    const rotDegMin = P.yawRate * (180 / Math.PI) * 60;
    drawNeedle(ctx, rotDegMin, -30, 30);

    // RPM (エンジン回転数)
    ctx = cvs.rpm.getContext('2d');
    drawBase(ctx, 'ENGINE', 'RPM', -50, 120, 20, 5);
    // ASTERNは6文字あり長いため、高さを70にして大きめにくり抜く
    const rpmCutouts = [
        {x: 20, y: 45, w: 20, h: 70}, 
        {x: 120, y: 45, w: 20, h: 70} 
    ];
    drawColorArc(ctx, -50, 120, -50, 0, '#ff8800', 56, 6, rpmCutouts); 
    drawColorArc(ctx, -50, 120, 0, 80, '#388e3c', 56, 6, rpmCutouts);  
    drawColorArc(ctx, -50, 120, 80, 100, '#ffcc00', 56, 6, rpmCutouts); 
    drawColorArc(ctx, -50, 120, 100, 120, '#d32f2f', 56, 6, rpmCutouts); 
    drawVerticalText(ctx, 'ASTERN', 30, 80, '#ff8800', 9);
    drawVerticalText(ctx, 'AHEAD', 130, 80, '#388e3c', 9);
    drawNeedle(ctx, P.rpm, -50, 120);

    // Wind Direction (風向)
    ctx = cvs.windDir.getContext('2d');
    const cx = 80; const cy = 80; const radius = 70;
    ctx.clearRect(0, 0, 160, 160);

    let grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius); 
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#d5d5d5');
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();

    ctx.save();
    ctx.fillStyle = 'rgba(60, 80, 100, 0.25)'; 
    ctx.translate(cx, cy);
    ctx.beginPath(); 
    ctx.moveTo(0, -28); ctx.lineTo(12, 1); ctx.lineTo(10, 23); 
    ctx.lineTo(0, 28); ctx.lineTo(-10, 23); ctx.lineTo(-12, 1); 
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    for (let i = 0; i < 360; i += 10) {
        let angleCompass = (i * Math.PI / 180) - (Math.PI / 2);
        let startR = radius - 6; let endR = radius; if (i % 30 === 0) startR -= 6;
        ctx.beginPath(); 
        ctx.moveTo(cx + Math.cos(angleCompass) * startR, cy + Math.sin(angleCompass) * startR); 
        ctx.lineTo(cx + Math.cos(angleCompass) * endR, cy + Math.sin(angleCompass) * endR);
        ctx.lineWidth = i % 30 === 0 ? 2 : 1; 
        ctx.strokeStyle = '#333'; 
        ctx.stroke();

        if (i % 30 === 0 && i !== 0) {
            ctx.font = 'bold 11px sans-serif'; 
            ctx.fillStyle = '#222'; 
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            let textR = radius - 18; 
            ctx.fillText(i, cx + Math.cos(angleCompass) * textR, cy + Math.sin(angleCompass) * textR);
        }
    }

    drawNeedleCompass(ctx, P.windDir, true);
    drawTextOverlay(ctx, 'WIND DIR', 'DEG');

    updateClock(cvs.clock.getContext('2d'));
}

// ==== 操作説明UI ====
export function initKeyMapDisplay() {
    const listUl = document.getElementById('key-map-list');
    if (!listUl) return;

    const keys = [
        { key: 'W', desc: 'RPM ↑ (10)' },
        { key: 'S', desc: 'RPM ↓ (10)' },
        { key: 'A', desc: '舵左 (5)' },
        { key: 'D', desc: '舵右 (5)' },
        { key: 'Space', desc: '舵中央' }
    ];

    listUl.innerHTML = '';
    keys.forEach(item => {
        const li = document.createElement('li');
        const keySpan = document.createElement('span');
        keySpan.className = 'key-name';
        keySpan.textContent = item.key;
        const descSpan = document.createElement('span');
        descSpan.textContent = item.desc;
        li.appendChild(keySpan);
        li.appendChild(descSpan);
        listUl.appendChild(li);
    });
}
