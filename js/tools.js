'use strict';
// ============================================================
//  tools.js — 海図・精密コンパス・航行データ
// ============================================================

let _open = false;

export function isToolOpen() { return _open; }

export function toggleTool() {
  _open = !_open;
  const el = document.getElementById('ts');
  if (_open) { el?.classList.add('o'); _resizeChart(); }
  else         el?.classList.remove('o');
}

function _resizeChart() {
  const panel = document.getElementById('tcp');
  const cv    = document.getElementById('tcc');
  if (!panel || !cv) return;
  const lbl = panel.querySelector('.tpl');
  cv.width  = panel.clientWidth  - 28;
  cv.height = panel.clientHeight - (lbl ? lbl.offsetHeight : 20) - 24;
}

// ============================================================
//  海図
// ============================================================
export function drawChart(P, AIships, fishBoats, buoys, curM) {
  const cv  = document.getElementById('tcc');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  if (!W || !H) return;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#020d18'; ctx.fillRect(0, 0, W, H);

  const VIEW  = 6500;
  const scale = Math.min(W, H) / (VIEW * 2);
  const cx = W / 2, cy = H / 2;
  const toC = (wx, wz) => ({ x: cx - (wx - P.posX) * scale, y: cy - (wz - P.posZ) * scale });

  // グリッド
  const gM = 2 * 1852;
  ctx.strokeStyle = 'rgba(0,255,136,.055)'; ctx.lineWidth = 0.5;
  const sx = Math.floor((P.posX - VIEW) / gM) * gM;
  const sz = Math.floor((P.posZ - VIEW) / gM) * gM;
  for (let wx = sx; wx <= P.posX + VIEW; wx += gM) {
    const p1 = toC(wx, P.posZ - VIEW), p2 = toC(wx, P.posZ + VIEW);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }
  for (let wz = sz; wz <= P.posZ + VIEW; wz += gM) {
    const p1 = toC(P.posX - VIEW, wz), p2 = toC(P.posX + VIEW, wz);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }

  // 陸地
  ctx.fillStyle = 'rgba(30,60,30,.72)';
  [[[-3000,-3000],[-1900,-3000],[-1900,8000],[-3000,8000]],
   [[ 2100,-2000],[ 3500,-2000],[ 3500,8000],[ 2100,8000]]
  ].forEach(poly => {
    ctx.beginPath();
    poly.forEach(([wx, wz], i) => { const p = toC(wx, wz); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.closePath(); ctx.fill();
  });

  // 航路線
  if (curM) {
    ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(255,204,0,.28)'; ctx.lineWidth = 1;
    ctx.beginPath();
    const ps = toC(P.posX, P.posZ), pe = toC(curM.tx, curM.tz);
    ctx.moveTo(ps.x, ps.y); ctx.lineTo(pe.x, pe.y); ctx.stroke();
    ctx.setLineDash([]);
  }

  // 浮標
  if (buoys) buoys.forEach((b, i) => {
    const p = toC(b.position.x, b.position.z);
    if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) return;
    const c = i % 2 ? '#00aa44' : '#ff3300';
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 4; ctx.fill(); ctx.shadowBlur = 0;
  });

  // AI他船
  if (AIships) AIships.forEach(s => {
    const p = toC(s.mesh.position.x, s.mesh.position.z);
    if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(s.heading);
    const sz = s.isTanker ? 2.5 : 1;
    ctx.beginPath(); ctx.moveTo(0, -8 * sz); ctx.lineTo(5 * sz, 7 * sz); ctx.lineTo(-5 * sz, 7 * sz); ctx.closePath();
    ctx.fillStyle = s.isTanker ? '#ff880080' : '#0088cc';
    ctx.shadowColor = s.isTanker ? '#ff8800' : '#00aaff'; ctx.shadowBlur = 3; ctx.fill(); ctx.shadowBlur = 0; ctx.restore();
    ctx.strokeStyle = 'rgba(0,170,255,.38)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - Math.sin(s.heading) * s.speed * scale * 18, p.y - Math.cos(s.heading) * s.speed * scale * 18);
    ctx.stroke();
  });

  // 漁船
  if (fishBoats) fishBoats.forEach(f => {
    const p = toC(f.mesh.position.x, f.mesh.position.z);
    if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) return;
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,136,204,.45)'; ctx.fill();
  });

  // 目標港
  if (curM) {
    const p = toC(curM.tx, curM.tz);
    [20, 11, 5].forEach((r, i) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,204,0,${0.28 + i * 0.18})`; ctx.lineWidth = i === 2 ? 2 : 1; ctx.stroke();
    });
    ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffcc00'; ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,204,0,.8)'; ctx.font = '10px Courier New'; ctx.textAlign = 'center';
    ctx.fillText(curM.tn, p.x, p.y - 18);
  }

  // 自船
  const sp = toC(P.posX, P.posZ);
  ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(P.heading);
  ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(9, 9); ctx.lineTo(0, 4); ctx.lineTo(-9, 9); ctx.closePath();
  ctx.fillStyle = '#00ff88'; ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0; ctx.restore();

  if (Math.abs(P.speed) > 0.5) {
    ctx.strokeStyle = 'rgba(0,255,136,.48)'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y);
    ctx.lineTo(sp.x - Math.sin(P.heading) * P.speed * scale * 22, sp.y - Math.cos(P.heading) * P.speed * scale * 22);
    ctx.stroke();
  }

  // スケールバー・北矢印
  const bPx = 2000 * scale, bx = 18, by = H - 18;
  ctx.strokeStyle = '#00ff8878'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bPx, by); ctx.stroke();
  [bx, bx + bPx].forEach(x => { ctx.beginPath(); ctx.moveTo(x, by-4); ctx.lineTo(x, by+4); ctx.stroke(); });
  ctx.fillStyle = '#00ff8878'; ctx.font = '8px Courier New'; ctx.textAlign = 'left';
  ctx.fillText('1nm', bx + bPx / 2 - 8, by - 7);
  const nx = W - 26, ny = 26;
  ctx.save(); ctx.translate(nx, ny);
  ctx.beginPath(); ctx.moveTo(0,-13); ctx.lineTo(4,5); ctx.lineTo(0,1); ctx.lineTo(-4,5); ctx.closePath();
  ctx.fillStyle = '#ff330090'; ctx.fill(); ctx.restore();
  ctx.fillStyle = '#ff330090'; ctx.font = '8px Courier New'; ctx.textAlign = 'center';
  ctx.fillText('N', nx, ny - 16);
}

// ============================================================
//  精密コンパス
// ============================================================
export function drawPrecCompass(P, curM) {
  const cv  = document.getElementById('tpc');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, r = W / 2 - 14;
  ctx.clearRect(0, 0, W, H);
  const hdg = P.heading;
  const deg = ((hdg * 180 / Math.PI) % 360 + 360) % 360;

  ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,255,136,.12)'; ctx.lineWidth = 7; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  gr.addColorStop(0, '#041208'); gr.addColorStop(1, '#020a04'); ctx.fillStyle = gr; ctx.fill();

  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-hdg);
  const cards = ['N','NE','E','SE','S','SW','W','NW'];
  const ccs   = { N:'#ff4444', S:'#aaa', E:'#aaa', W:'#aaa', NE:'#777', SE:'#777', SW:'#777', NW:'#777' };
  for (let i = 0; i < 360; i += 5) {
    const a = i * Math.PI / 180, isMaj = i % 45 === 0, isMed = i % 10 === 0;
    const inn = isMaj ? r - 20 : isMed ? r - 12 : r - 7;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a-Math.PI/2)*r,   Math.sin(a-Math.PI/2)*r);
    ctx.lineTo(Math.cos(a-Math.PI/2)*inn, Math.sin(a-Math.PI/2)*inn);
    ctx.strokeStyle = isMaj ? 'rgba(0,255,136,.68)' : isMed ? 'rgba(0,255,136,.32)' : 'rgba(0,255,136,.12)';
    ctx.lineWidth   = isMaj ? 1.4 : 0.7; ctx.stroke();
    if (isMaj) {
      const lb = cards[i / 45], la = a - Math.PI/2;
      const lx = Math.cos(la)*(r-27), ly = Math.sin(la)*(r-27);
      ctx.fillStyle = ccs[lb]; ctx.font = `bold ${lb.length > 1 ? 9 : 12}px Courier New`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(lx, ly); ctx.rotate(a);
      ctx.shadowColor = ccs[lb]; ctx.shadowBlur = lb === 'N' ? 8 : 0;
      ctx.fillText(lb, 0, 0); ctx.shadowBlur = 0; ctx.restore();
    }
    if (!isMaj && i % 30 === 0) {
      const la = a - Math.PI/2, lx = Math.cos(la)*(r-28), ly = Math.sin(la)*(r-28);
      ctx.fillStyle = 'rgba(0,255,136,.45)'; ctx.font = '9px Courier New';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(lx, ly); ctx.rotate(a); ctx.fillText(i, 0, 0); ctx.restore();
    }
  }
  ctx.restore();

  // 目標ベアリング
  if (curM) {
    const brg = Math.atan2(-(curM.tx - P.posX), curM.tz - P.posZ);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(brg - Math.PI/2);
    ctx.beginPath(); ctx.moveTo(r-4, 0); ctx.lineTo(r*0.4, 0);
    ctx.strokeStyle = 'rgba(255,204,0,.55)'; ctx.lineWidth = 1.4;
    ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(r-2, 0, 4, 0, Math.PI*2);
    ctx.fillStyle = '#ffcc0070'; ctx.fill(); ctx.restore();
  }

  // 北針
  ctx.save(); ctx.translate(cx, cy);
  ctx.beginPath(); ctx.moveTo(0,-(r-7)); ctx.lineTo(4.5,-(r-26)); ctx.lineTo(0,-(r-20)); ctx.lineTo(-4.5,-(r-26)); ctx.closePath();
  ctx.fillStyle = '#ff4444'; ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 5; ctx.fill(); ctx.shadowBlur = 0; ctx.restore();

  ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI*2);
  ctx.fillStyle = '#00ff88'; ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 7; ctx.fill(); ctx.shadowBlur = 0;

  ctx.fillStyle = '#00ff88'; ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 8;
  ctx.font = 'bold 26px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.round(deg)).padStart(3,'0') + '°', cx, cy); ctx.shadowBlur = 0;
}

// ============================================================
//  航行データパネル
// ============================================================
export function updateNavData(P, curM) {
  const deg  = ((P.heading * 180 / Math.PI) % 360 + 360) % 360;
  const EL   = ['FULL ASTERN','HALF ASTERN','SLOW ASTERN','STOP','SLOW AHEAD','HALF AHEAD','FULL AHEAD'];
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const as   = Math.abs(P.speed);

  const set = (id, val, cls = '') => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val; el.className = 'dv2' + (cls ? ' ' + cls : '');
  };

  set('td0', String(Math.round(deg)).padStart(3,'0') + '°');
  set('td1', as.toFixed(1) + ' kt', as > 14 ? 'd' : as > 8 ? 'w' : '');
  set('td2', (P.rudder >= 0 ? '+' : '') + P.rudder.toFixed(1) + '°');
  set('td6', EL[P.engineOrder + 3]);
  set('td5', `${dirs[Math.round(P.currDir / 22.5) % 16]} ${P.currSpeed.toFixed(1)}kt`);

  if (curM) {
    const dx = curM.tx - P.posX, dz = curM.tz - P.posZ;
    const dm = Math.sqrt(dx*dx + dz*dz);
    const brg = ((Math.atan2(dx, dz) * 180 / Math.PI) % 360 + 360) % 360;
    set('td3', String(Math.round(brg)).padStart(3,'0') + '°');
    set('td4', (dm / 1852).toFixed(2) + ' nm');
    if (as > 0.3) {
      const es = Math.round(dm / 0.514 / as);
      set('td7', String(Math.floor(es/60)).padStart(2,'0') + ':' + String(es%60).padStart(2,'0'));
    } else {
      set('td7', '∞');
    }
  }
}

export function drawAll(P, AIships, fishBoats, buoys, curM) {
  drawChart(P, AIships, fishBoats, buoys, curM);
  drawPrecCompass(P, curM);
  updateNavData(P, curM);
}
