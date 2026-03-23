import * as tools from './tools.js';

// ============================================================
//  hud.js — HUD・UI 描画管理 (元の美しいデザインを完全再現 ＋ 滑らかな針の動き)
// ============================================================

// --- HUD用のグローバル変数 ---
let canvas, ctx;
const gaugeBarHeight = 120; // 計器バーの高さ
let overloadTimer = 0;

// --- ★滑らかな描画のための「表示用変数（Visual values）」 ---
let V = { telegraph: 0, windDir: 0, windSpeed: 0, shipSpeed: 0, rudderAngle: 0, yawRate: 0, rpm: 0 };
const smoothRate = 4.0; // 値が大きいほど追従が速い (秒間の追従率)
const angleSmoothRate = 2.0; // 角度（風向、ROT）は少しゆっくり

// --- ★色の定義 (元のスクリーンショットから忠実に移植) ---
const colGaugeFace = '#f5f5f5'; // 文字盤の薄グレー
const colBezelOuter = '#222';   // 外枠（黒）
const colBezelInner = '#ddd';   // 内枠（薄グレー）
const colNeedle = '#f5511c';     // 針の色（赤オレンジ）
const colTextMain = '#111';     // メインの文字色
const colTextSub = '#666';      // 単位などの文字色
const colRedZone = '#d32f2f';   // 赤（RUDDER/RPM）
const colGreenZone = '#388e3c'; // 緑（RUDDER/RPM）

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
//  HUDの初期化
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

    // ★元のHTMLアナログ計器コンテナを非表示にする
    const oldContainer = document.getElementById('gauges-container');
    if (oldContainer) oldContainer.style.display = 'none';
}

// ============================================================
//  メインループから毎フレーム呼ばれる描画処理
// ============================================================
export function updateDashboard(P, simTime = 0, curM = null, mst = null) {
    if (!ctx) initHUD(); // 初回実行時に自動初期化

    const dt = 0.016; // 60fps想定
    const hdgDeg = P.heading * 180 / Math.PI;
    const relWind = ((P.windDir - hdgDeg) % 360 + 360) % 360;

    // --- 1. 値のスムージング処理 ---
    V.telegraph = smoothValue(V.telegraph, P.engineOrder, smoothRate * 2.0, dt);
    V.windDir = smoothAngle(V.windDir, relWind, angleSmoothRate, dt);
    V.windSpeed = smoothValue(V.windSpeed, P.windSpeed, smoothRate, dt);
    V.shipSpeed = smoothValue(V.shipSpeed, P.speed, smoothRate, dt);
    V.rudderAngle = smoothValue(V.rudderAngle, P.rudder, smoothRate, dt);
    V.yawRate = smoothValue(V.yawRate, P.yawRate * (180 / Math.PI) * 60, angleSmoothRate, dt); // deg/minに変換
    V.rpm = smoothValue(V.rpm, P.rpm, smoothRate, dt);

    // --- 2. エリアのクリアと背景（半透明の帯） ---
    ctx.clearRect(0, 0, canvas.width, gaugeBarHeight);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // 70%の半透明で海を透けさせる
    ctx.fillRect(0, 0, canvas.width, gaugeBarHeight);

    // --- 3. 各計器の描画 (元のデザイン・配置・色の付け方を完全再現) ---
    const gw = canvas.width / 8; // 8個の計器を均等配置
    const yc = gaugeBarHeight / 2;
    const r = 50; // 計器の半径

    // 1. TELEGRAPH (TELEGRAPH)
    drawTelegraphGauge(ctx, gw * 0.5, yc, r, V.telegraph);

    // 2. WIND DIR (WIND DIR)
    drawWindDirGauge(ctx, gw * 1.5, yc, r, V.windDir);

    // 3. WIND SPEED (KNOTS)
    drawOriginalGauge(ctx, gw * 2.5, yc, r, V.windSpeed, 'WIND SPEED', 'KNOTS', 0, 100, 20);

    // 4. SHIP SPEED (KNOTS)
    drawOriginalGauge(ctx, gw * 3.5, yc, r, V.shipSpeed, 'SPEED', 'KNOTS', 0, 40, 10);

    // 5. RUDDER (DEG) ★PORT/STBDテキスト追加
    drawOriginalGauge(ctx, gw * 4.5, yc, r, V.rudderAngle, 'RUDDER', 'DEG', -35, 35, 10, true);

    // 6. R.O.T. (DEG/MIN) ★PORT/STBDテキスト追加
    drawOriginalGauge(ctx, gw * 5.5, yc, r, V.yawRate, 'RATE OF TURN', 'DEG/MIN', -30, 30, 10);

    // 7. RPM (RPM) ★OVERLOAD警告追加
    drawOriginalGauge(ctx, gw * 6.5, yc, r, V.rpm, 'ENGINE', 'RPM', -50, 120, 20, false, P.engineOverload);

    // 8. CLOCK (日付表示付き)
    drawClockGauge(ctx, gw * 7.5, yc, r, simTime, curM, mst);

    overloadTimer += dt;
}

// ============================================================
//  元の美しいデザインをCanvasで再現する共通描画関数群
// ============================================================

// ★元の立体的な枠と薄グレーの文字盤
function drawGaugeBaseOriginal(ctx, x, y, r, title, unit) {
    // 1. 立体的な枠 (ベゼル)
    ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = colBezelOuter; ctx.fill(); // 外枠（黒）
    
    ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2);
    ctx.fillStyle = colBezelInner; ctx.fill(); // 内枠（薄グレー）

    // 2. 文字盤 (薄グレー)
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = colGaugeFace; ctx.fill();

    // 3. タイトルと単位 (中央下に配置、元の位置通り)
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    
    ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = colTextMain;
    ctx.fillText(title, x, y + r * 0.5); // タイトルは下側
    
    ctx.font = '9px sans-serif'; ctx.fillStyle = colTextSub;
    ctx.fillText( unit, x, y + r * 0.75); // 単位はその下
}

// ★元のオレンジ色の針
function drawNeedleOriginal(ctx, x, y, r, angleDeg) {
    const angleRad = degToRad(angleDeg - 90);
    const needleLen = r * 0.8;
    
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angleRad) * needleLen, y + Math.sin(angleRad) * needleLen);
    ctx.strokeStyle = colNeedle; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.stroke();
    
    // 中心のポチ
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = colTextMain; ctx.fill();
}

// ★通常のアナログメーター（Speed, Rudder, ROT, RPM）
function drawOriginalGauge(ctx, x, y, r, value, title, unit, min, max, majorTicks, isRudder = false, isOverload = false) {
    drawGaugeBaseOriginal(ctx, x, y, r, title, unit);

    // 1. 赤・緑のカラーゾーン (RUDDER, ROT, RPM用)
    if (title === 'SPEED') {
        drawColorArc(ctx, x, y, r, min, max, 0, 10, colRedZone);
    } else if (isRudder) {
        drawColorArc(ctx, x, y, r, min, max, min, 0, colRedZone);
        drawColorArc(ctx, x, y, r, min, max, 0, max, colGreenZone);
        // PORT/STBD
        ctx.font = 'bold 10px sans-serif'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = colRedZone; ctx.fillText('PORT', x - r * 0.6, y + r * 0.5);
        ctx.fillStyle = colGreenZone; ctx.fillText('STBD', x + r * 0.6, y + r * 0.5);
    } else if (title === 'RATE OF TURN') {
        drawColorArc(ctx, x, y, r, min, max, min, 0, colRedZone);
        drawColorArc(ctx, x, y, r, min, max, 0, max, colGreenZone);
        // PORT/STBD
        ctx.font = 'bold 10px sans-serif'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = colRedZone; ctx.fillText('PORT', x - r * 0.6, y + r * 0.5);
        ctx.fillStyle = colGreenZone; ctx.fillText('STBD', x + r * 0.6, y + r * 0.5);
    } else if (title === 'ENGINE') {
        drawColorArc(ctx, x, y, r, min, max, min, 0, colRedZone);
        drawColorArc(ctx, x, y, r, min, max, 60, 90, colGreenZone);
        drawColorArc(ctx, x, y, r, min, max, 90, 120, colRedZone);
    }

    // 2. 目盛りと数字 (0 〜 maxSpeed)
    ctx.fillStyle = colTextMain;
    for (let i = min; i <= max; i += majorTicks) {
        const ang = map(i, min, max, -135, 135);
        drawTickOriginal(ctx, x, y, r, ang, 8, isRudder && i === 0 ? 3 : 1.5);
        
        ctx.font = 'bold 9px sans-serif'; ctx.textBaseline = 'middle';
        ctx.fillText(i, x + Math.cos(degToRad(ang - 90)) * r * 0.75, y + Math.sin(degToRad(ang - 90)) * r * 0.75);
    }
    
    // 小目盛り
    for (let i = min; i <= max; i += majorTicks / 2) {
        if (i % majorTicks !== 0) {
            drawTickOriginal(ctx, x, y, r, map(i, min, max, -135, 135), 4, 1);
        }
    }

    // 3. 針
    drawNeedleOriginal(ctx, x, y, r, map(value, min, max, -135, 135));

    // 4. RPM OVERLOAD警告
    if (isOverload && overloadTimer % 1.0 < 0.5) {
        ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = colRedZone; ctx.textBaseline = 'bottom';
        ctx.fillText('OVERLOAD', x, y - r * 0.3);
    }
}

// 補助：カラーアーク
function drawColorArc(ctx, x, y, r, minVal, maxVal, arcMin, arcMax, color) {
    let p1 = (arcMin - minVal) / (maxVal - minVal);
    let p2 = (arcMax - minVal) / (maxVal - minVal);
    let a1 = degToRad(p1 * 270 - 135 - 90);
    let a2 = degToRad(p2 * 270 - 135 - 90);
    ctx.beginPath(); ctx.arc(x, y, r - 3, a1, a2); ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.stroke();
}
// 補助：目盛り
function drawTickOriginal(ctx, x, y, r, angDeg, len, width) {
    const rad = degToRad(angDeg - 90);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(rad) * (r - len), y + Math.sin(rad) * (r - len));
    ctx.lineTo(x + Math.cos(rad) * r,           y + Math.sin(rad) * r);
    ctx.strokeStyle = colTextMain; ctx.lineWidth = width; ctx.stroke();
}

// ============================================================
//  特別な計器（TELEGRAPH, WIND DIR, CLOCK）
// ============================================================

// 1. TELEGRAPH
function drawTelegraphGauge(ctx, x, y, r, value) {
    drawGaugeBaseOriginal(ctx, x, y, r, 'TELEGRAPH', ''); // 単位はなし
    const steps = ['FULL', 'HALF', 'SLOW', 'DEAD', 'STOP', 'DEAD', 'SLOW', 'HALF', 'FULL'];
    const angles = [-135, -110, -85, -60, 0, 60, 85, 110, 135];
    ctx.font = 'bold 9px sans-serif'; ctx.fillStyle = colTextMain; ctx.textBaseline = 'middle';
    steps.forEach((step, i) => {
        const rad = degToRad(angles[i] - 90);
        ctx.fillText(step, x + Math.cos(rad) * r * 0.75, y + Math.sin(rad) * r * 0.75);
    });
    drawNeedleOriginal(ctx, x, y, r, map(value, -4, 4, -135, 135));
}

// 2. WIND DIR (元の船体シルエットと360度目盛りを再現)
function drawWindDirGauge(ctx, x, y, r, dir) {
    // 単位なし、タイトルは下
    ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.fillStyle = colBezelOuter; ctx.fill(); 
    ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2); ctx.fillStyle = colBezelInner; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = colGaugeFace; ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = colTextMain; ctx.fillText('WIND DIR', x, y + r * 0.5);
    ctx.font = '9px sans-serif'; ctx.fillStyle = colTextSub; ctx.fillText('DEG (REL)', x, y + r * 0.75);

    // 船体シルエット (薄グレー)
    ctx.save(); ctx.fillStyle = 'rgba(60,80,100,0.18)'; ctx.translate(x, y);
    ctx.beginPath(); ctx.moveTo(0, -r * 0.4); ctx.lineTo(r * 0.18, 0); ctx.lineTo(r * 0.15, r * 0.3); ctx.lineTo(0, r * 0.4); ctx.lineTo(-r * 0.15, r * 0.3); ctx.lineTo(-r * 0.18, 0); ctx.closePath(); ctx.fill(); ctx.restore();

    // 360度の目盛り
    for (let i = 0; i < 360; i += 10) {
        const ac = degToRad(i - 90);
        const isMaj = i % 30 === 0;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(ac) * (r - (isMaj ? 12 : 6)), y + Math.sin(ac) * (r - (isMaj ? 12 : 6)));
        ctx.lineTo(x + Math.cos(ac) * r, y + Math.sin(ac) * r);
        ctx.lineWidth = isMaj ? 1.8 : 0.8; ctx.strokeStyle = colTextMain; ctx.stroke();
        if (isMaj && i !== 0) {
            ctx.font = 'bold 9px sans-serif'; ctx.fillStyle = colTextMain; ctx.fillText(i, x + Math.cos(ac) * (r - 18), y + Math.sin(ac) * (r - 18));
        }
    }
    drawNeedleOriginal(ctx, x, y, r, dir);
}

// 3. CLOCK (元の12時間目盛りと日付表示)
function drawClockGauge(ctx, x, y, r, simTime, curM, mst) {
    drawGaugeBaseOriginal(ctx, x, y, r, '', ''); // タイトルと単位はなし
    ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = colTextMain; ctx.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
        const rad = degToRad(i * 30 - 90);
        ctx.fillText(i, x + Math.cos(rad) * r * 0.75, y + Math.sin(rad) * r * 0.75);
    }
    // 小目盛り
    for (let i = 0; i < 60; i++) { if (i % 5 !== 0) drawTickOriginal(ctx, x, y, r, i * 6, 4, 1); }

    // 日付表示 (中央下に配置)
    let elapsed = (mst && mst.t0) ? simTime - mst.t0 : simTime;
    let baseTime = 10*3600*1000, dateTxt = '4/01'; // DEFAULT: AROUND 10:00 AM
    if (curM) { if (curM.wx==='ngt') { baseTime=2*3600*1000; dateTxt='12/15'; } else if (curM.wx==='str') { baseTime=17*3600*1000; dateTxt='9/10'; } else if (curM.wx==='rain') { baseTime=14*3600*1000; dateTxt='6/20'; } }
    let ts=(baseTime+elapsed)/1000, hr=(ts/3600)%12, min=(ts/60)%60, sec=ts%60;

    ctx.font = '9px sans-serif'; ctx.fillStyle = colTextSub; ctx.fillText(dateTxt, x, y + r * 0.6);

    // 針の描画
    drawHandOriginal(ctx, x, y, hr, r * 0.5, 4, colTextMain, 12); // 時針
    drawHandOriginal(ctx, x, y, min, r * 0.8, 3, colTextMain, 60); // 分針
    drawHandOriginal(ctx, x, y, sec, r * 0.9, 1.5, colRedZone, 60); // 秒針
}
// 補助：時計の針
function drawHandOriginal(ctx, x, y, pos, length, width, color, max) {
    const handAngle = degToRad(pos * (360 / max) - 90);
    ctx.beginPath(); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(handAngle) * length, y + Math.sin(handAngle) * length); ctx.stroke();
    // ポチ
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = colTextMain; ctx.fill();
}

// ============================================================
//  これ以下は元々あった結果発表等の他機能群（変更なし）
// ============================================================
export function animScore(target) { const el = document.getElementById('drsn'); if (!el) return; let cur = 0; const step = Math.ceil(target / 40); const tm = setInterval(() => { cur = Math.min(cur + step, target); el.textContent = cur; if (cur >= target) clearInterval(tm); }, 28); }
export function showDockResult(scoreData, stars, collision, elapsed, curM) { const mm = Math.floor(elapsed / 60), ss = elapsed % 60; const dm = document.getElementById('drm'); if (!dm) return; dm.textContent = collision ? '衝突！' : stars === 3 ? '完璧な接岸' : stars === 2 ? '接岸成功' : stars === 1 ? '接岸完了' : '接岸失敗'; dm.className = 'drm' + (collision ? ' col' : ''); const sn = document.getElementById('drsn'); if (sn) sn.className = 'drsn' + (collision ? ' col' : ''); const s2 = document.getElementById('drs2'); if (s2) s2.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars); const mid = document.getElementById('drmid'); if (mid) mid.textContent = curM ? curM.id : ''; const ranks = ['', '3等航海士', '2等航海士', '1等航海士', '船長']; const rcols = ['', '#00ff88', '#00ccff', '#ffcc00', '#ff8844']; const ri = stars >= 3 ? 4 : stars >= 2 ? 3 : stars >= 1 ? 2 : 1; const rk = document.getElementById('drrank'); if (rk) { rk.textContent = ranks[ri]; rk.style.color = rcols[ri]; } const bd = document.getElementById('drbd'); if (bd) { bd.innerHTML = scoreData.items.map((it, i) => ` <div class="dri"> <div class="drih"> <span class="drin">${it.n}</span> <span class="driv${it.p < it.m * 0.35 ? ' bad' : ''}">${it.p}/${it.m}pt</span> </div> <div class="dribw"><div class="drib" id="drb${i}" style="width:0%"></div></div> </div>`).join('') + `<div style="margin-top:5px;padding-top:5px;border-top:1px solid #00ff8812;font-size:9px;display:flex;justify-content:space-between;"> <span style="color:#00ff8858">所要時間</span> <span style="color:#00ff88">${mm}分${String(ss).padStart(2,'0')}秒</span> </div>`; setTimeout(() => { scoreData.items.forEach((it, i) => { const b = document.getElementById('drb' + i); if (b) { b.style.width = it.pct + '%'; b.style.background = it.pct > 70 ? '#00ff88' : it.pct > 40 ? '#ffcc00' : '#ff6644'; if (it.pct > 70) b.style.boxShadow = '0 0 4px #00ff88'; } }); }, 320); } const pen = document.getElementById('drp'); if (pen) pen.innerHTML = scoreData.pens.length ? scoreData.pens.map(p => `<div>${p}</div>`).join('') : ''; document.getElementById('dr')?.classList.add('v'); }
export function drawResultRadar(items, collision) { const cv = document.getElementById('drrc2'); if (!cv) return; const ctxR = cv.getContext('2d'); const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, r = 50; ctxR.clearRect(0, 0, W, H); const n = items.length, angs = items.map((_, i) => i / n * Math.PI * 2 - Math.PI / 2); [0.25, 0.5, 0.75, 1].forEach(f => { ctxR.beginPath(); angs.forEach((a, i) => { const x = cx + Math.cos(a)*r*f, y = cy + Math.sin(a)*r*f; i ? ctxR.lineTo(x, y) : ctxR.moveTo(x, y); }); ctxR.closePath(); ctxR.strokeStyle = `rgba(0,255,136,${0.05+f*0.05})`; ctxR.lineWidth = 0.8; ctxR.stroke(); }); angs.forEach(a => { ctxR.beginPath(); ctxR.moveTo(cx, cy); ctxR.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r); ctxR.strokeStyle = 'rgba(0,255,136,.1)'; ctxR.lineWidth = 0.8; ctxR.stroke(); }); ctxR.beginPath(); items.forEach((it, i) => { const f = it.pct / 100, x = cx + Math.cos(angs[i])*r*f, y = cy + Math.sin(angs[i])*r*f; i ? ctxR.lineTo(x, y) : ctxR.moveTo(x, y); }); ctxR.closePath(); const sc = collision ? '#ff4444' : '#00ff88'; ctxR.fillStyle = collision ? 'rgba(255,68,68,.16)' : 'rgba(0,255,136,.14)'; ctxR.fill(); ctxR.strokeStyle = sc; ctxR.lineWidth = 1.4; ctxR.shadowColor = sc; ctxR.shadowBlur = 5; ctxR.stroke(); ctxR.shadowBlur = 0; items.forEach((it, i) => { const f = it.pct / 100, x = cx + Math.cos(angs[i])*r*f, y = cy + Math.sin(angs[i])*r*f; ctxR.beginPath(); ctxR.arc(x, y, 2.5, 0, Math.PI * 2); ctxR.fillStyle = sc; ctxR.shadowColor = sc; ctxR.shadowBlur = 3; ctxR.fill(); ctxR.shadowBlur = 0; }); ctxR.font = '8px Courier New'; ctxR.fillStyle = 'rgba(0,255,136,.55)'; ctxR.textAlign = 'center'; items.forEach((it, i) => { const x = cx + Math.cos(angs[i]) * (r + 13), y = cy + Math.sin(angs[i]) * (r + 13) + 3; ctxR.fillText(it.n, x, y); }); }
export function showPenaltyToast(msg) { const el = document.getElementById('ptst'); if (!el) return; el.textContent = msg; el.classList.add('on'); if (window._ptTimer) clearTimeout(window._ptTimer); window._ptTimer = setTimeout(() => el.classList.remove('on'), 2600); }
export function flashScreen(cls) { const f = document.getElementById('flash'); if (!f) return; f.className = cls + ' on'; setTimeout(() => f.className = '', 500); }
export function applyWeatherOverlay(m) { const ni = document.getElementById('night-ov'); const wo = document.getElementById('wx-ov'); const rc = document.getElementById('rain-cv'); if (ni) ni.style.background = 'rgba(0,4,16,0)'; if (wo) wo.style.background = 'rgba(0,0,0,0)'; if (rc) rc.style.opacity = '0'; if (m.wx === 'ngt' && ni) ni.style.background = 'rgba(0,4,18,.75)'; if (m.wx === 'str' && wo) { if (rc) rc.style.opacity = '1'; wo.style.background = 'rgba(40,55,65,.22)'; } if (m.wx === 'rain' && rc) rc.style.opacity = '.7'; }
export function updateCompass(heading) { const cn = document.getElementById('cn'); if (cn) cn.style.transform = `rotate(${-heading * 180 / Math.PI}deg)`; }
export function drawRudder(rudder) { const cv = document.getElementById('rucv'); if (!cv) return; const ctxR = cv.getContext('2d'); ctxR.clearRect(0, 0, cv.width, cv.height); const cx = cv.width / 2, cy = cv.height - 4, r = cv.height - 9; ctxR.beginPath(); ctxR.arc(cx, cy, r, Math.PI, 0); ctxR.strokeStyle = 'rgba(0,255,136,.09)'; ctxR.lineWidth = 7; ctxR.stroke(); for (let d = -35; d <= 35; d += 5) { const a = Math.PI - (d + 35) / 70 * Math.PI; const inn = d % 10 === 0 ? r - 11 : r - 6; ctxR.beginPath(); ctxR.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctxR.lineTo(cx + Math.cos(a) * inn, cy + Math.sin(a) * inn); ctxR.strokeStyle = d === 0 ? '#00ff8848' : '#00ff8820'; ctxR.lineWidth = d % 10 === 0 ? 1.4 : 0.7; ctxR.stroke(); } const ra = Math.PI - (rudder + 35) / 70 * Math.PI; ctxR.beginPath(); ctxR.moveTo(cx, cy); ctxR.lineTo(cx+Math.cos(ra)*(r+2), cy+Math.sin(ra)*(r+2)); ctxR.strokeStyle = '#00ccff'; ctxR.lineWidth = 2.2; ctxR.stroke(); }
export function updateNavData(P, curM) { const as = Math.abs(P.speed); const hdg = ((P.heading * 180 / Math.PI) % 360 + 360) % 360; if (document.getElementById('td1')) document.getElementById('td1').textContent = hdg.toFixed(1) + '°'; if (document.getElementById('td2')) document.getElementById('td2').textContent = as.toFixed(1) + ' kt'; if (document.getElementById('td3')) { const rotDeg = (P.yawRate * 180 / Math.PI * 60).toFixed(1); document.getElementById('td3').textContent = rotDeg + '°/min'; } if (document.getElementById('td4')) document.getElementById('td4').textContent = P.rudder.toFixed(1) + '°'; if (document.getElementById('td5')) document.getElementById('td5').textContent = Math.round(P.rpm) + ' RPM'; const EL = ['FULL ASTERN','HALF ASTERN','SLOW ASTERN','DEAD SLOW ASTERN','STOP','DEAD SLOW AHEAD','SLOW AHEAD','HALF AHEAD','FULL AHEAD']; if (document.getElementById('td6')) document.getElementById('td6').textContent = EL[P.engineOrder + 4] || 'STOP'; const rv = document.getElementById('ruv'); if (rv) rv.textContent = (P.rudder >= 0 ? '+' : '') + P.rudder.toFixed(1) + '°'; }
export function updateTelegraph(engineOrder) { const NEW_ENG_IDS = ['tg-rev-full','tg-rev-half','tg-rev-slow','tg-rev-dead','tg-stop','tg-fwd-dead','tg-fwd-slow','tg-fwd-half','tg-fwd-full']; const ENG_IDS = ['tf0','tf1','tf2','tf3','tf4','tf5','tf6','tf7','tf8']; const ENG_LABELS = ['FULL ASTERN','HALF ASTERN','SLOW ASTERN','DEAD SLOW ASTERN','STOP','DEAD SLOW AHEAD','SLOW AHEAD','HALF AHEAD','FULL AHEAD']; const idx = engineOrder + 4; NEW_ENG_IDS.forEach((id, i) => document.getElementById(id)?.classList.toggle('on', i === idx)); ENG_IDS.forEach((id, i) => document.getElementById(id)?.classList.toggle('on', i === idx)); const td = document.getElementById('td'); if (td) td.textContent = ENG_LABELS[idx]; }
export function togglePanels(show) { const panels = document.querySelector('#hud .panels'); if (!panels) return; panels.style.transform = show ? 'translateY(0)' : 'translateY(170px)'; localStorage.setItem('ss_hud_panels', show); panels.classList.toggle('h', !show); }
export function setNight(night) { const n = document.getElementById('night'); if (n) n.style.backgroundColor = night ? 'rgba(230, 60, 40, 0.25)' : 'transparent'; }