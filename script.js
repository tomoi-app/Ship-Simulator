let currentEngineRpm = 0;
let targetEngineRpm = 0;
let currentShipSpeedKnots = 0;
let currentRudderAngleDeg = 0;
let currentRotDegPerMin = 0;
let currentWindDirDeg = 45;
let currentWindSpeedKnots = 15;
const MAX_RUDDER = 35;

const canvases = {
    windSpeed: document.getElementById('wind-speed-canvas'),
    shipSpeed: document.getElementById('ship-speed-canvas'),
    rudder: document.getElementById('rudder-canvas'),
    rot: document.getElementById('rot-canvas'),
    rpm: document.getElementById('rpm-canvas'),
    windDir: document.getElementById('wind-dir-canvas'),
    clock: document.getElementById('clock-canvas')
};
const ctxs = {};
for (let key in canvases) {
    if(canvases[key]) ctxs[key] = canvases[key].getContext('2d');
}

// --- 共通描画（文字背景の四角を消し、白フチだけにした） ---
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

// 風向計の文字描画（背景なし、白フチのみ）
function drawTextOverlay(ctx, title, unit) {
    const cx = 80; const cy = 80; let textY = cy - 36;
    ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = 'bold 11px sans-serif'; ctx.strokeText(title, cx, textY); ctx.fillStyle = '#111'; ctx.fillText(title, cx, textY);
    ctx.font = '10px sans-serif'; ctx.strokeText(unit, cx, textY + 11); ctx.fillStyle = '#444'; ctx.fillText(unit, cx, textY + 11);
}

function drawWindDirGauge() {
    const ctx = ctxs.windDir; if(!ctx) return;
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
    drawNeedleCompass(ctx, currentWindDirDeg, true);
    drawTextOverlay(ctx, 'WIND DIRECTION', 'DEG');
}

function drawNeedleCompass(ctx, value, isRudder = false) {
    const cx = 80; const cy = 80; const radius = 55;
    const angleCompass = (value * Math.PI / 180) - (Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angleCompass) * radius, cy + Math.sin(angleCompass) * radius);
    ctx.lineWidth = 4; ctx.strokeStyle = isRudder ? '#d32f2f' : '#222'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fillStyle = '#222'; ctx.fill();
}

function drawWindSpeedGauge() { drawBase(ctxs.windSpeed, 'WIND SPEED', 'KNOTS', 0, 100, 20, 5); drawNeedle(ctxs.windSpeed, currentWindSpeedKnots, 0, 100); }
function drawShipSpeedGauge() { drawBase(ctxs.shipSpeed, 'SPEED', 'KNOTS', 0, 40, 10, 1); drawColorArc(ctxs.shipSpeed, 0, 40, 0, 10, '#d32f2f', 40, 4); drawNeedle(ctxs.shipSpeed, currentShipSpeedKnots, 0, 40); }
function drawRudderGauge() { drawBase(ctxs.rudder, 'RUDDER', 'DEG', -MAX_RUDDER, MAX_RUDDER, 10, 5); const ctx = ctxs.rudder; drawColorArc(ctx, -MAX_RUDDER, MAX_RUDDER, -MAX_RUDDER, 0, '#d32f2f', 40, 5); drawColorArc(ctx, -MAX_RUDDER, MAX_RUDDER, 0, MAX_RUDDER, '#388e3c', 40, 5); ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#d32f2f'; ctx.fillText('PORT', 45, 90); ctx.fillStyle = '#388e3c'; ctx.fillText('STBD', 115, 90); drawNeedle(ctx, currentRudderAngleDeg, -MAX_RUDDER, MAX_RUDDER, true); }
function drawRotGauge() { drawBase(ctxs.rot, 'RATE OF TURN', '', -30, 30, 10, 5); const ctx = ctxs.rot; drawColorArc(ctx, -30, 30, -30, 0, '#d32f2f', 40, 5); drawColorArc(ctx, -30, 30, 0, 30, '#388e3c', 40, 5); ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#d32f2f'; ctx.fillText('PORT', 45, 80); ctx.fillStyle = '#388e3c'; ctx.fillText('STBD', 115, 80); drawNeedle(ctx, currentRotDegPerMin, -30, 30); }
function drawRpmGauge() { drawBase(ctxs.rpm, 'RPM', 'SPEED', -50, 120, 20, 5); const ctx = ctxs.rpm; drawColorArc(ctx, -50, 120, -50, 0, '#d32f2f', 40, 4); drawColorArc(ctx, -50, 120, 60, 90, '#388e3c', 40, 4); drawColorArc(ctx, -50, 120, 90, 120, '#d32f2f', 40, 4); drawNeedle(ctx, currentEngineRpm, -50, 120); }
function updateClock() {
    const ctx = ctxs.clock; if(!ctx) return; const cx = 80; const cy = 80; ctx.clearRect(0, 0, 160, 160);
    let grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 70); grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#d5d5d5');
    ctx.beginPath(); ctx.arc(cx, cy, 70, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
    for (let i = 0; i < 60; i++) { let angle = (i * 6 - 90) * Math.PI / 180; let startR = 64; let endR = 70; if (i % 5 === 0) startR -= 6; ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * startR, cy + Math.sin(angle) * startR); ctx.lineTo(cx + Math.cos(angle) * endR, cy + Math.sin(angle) * endR); ctx.lineWidth = 2; ctx.strokeStyle = '#333'; ctx.stroke(); }
    ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; for (let i = 1; i <= 12; i++) { let angle = (i * 30 - 90) * Math.PI / 180; ctx.fillText(i, cx + Math.cos(angle) * 50, cy + Math.sin(angle) * 50); }
    const now = new Date(); const sec = now.getSeconds() + now.getMilliseconds() / 1000; const min = now.getMinutes() + sec / 60; const hr = (now.getHours() % 12) + min / 60;
    const drawHand = (pos, length, width, color) => { const handAngle = (pos * (360 / (color === 'red' ? 60 : (color === '#333' ? 60 : 12))) - 90) * Math.PI / 180; ctx.beginPath(); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(handAngle) * length, cy + Math.sin(handAngle) * length); ctx.stroke(); };
    drawHand(hr, 35, 4, '#333'); drawHand(min, 50, 3, '#333'); drawHand(sec, 55, 1, 'red'); ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fillStyle = '#222'; ctx.fill();
}

// --- 【変更点】エンジンと船速を10秒間で目標値に到達させる「リニア加速」に変更 ---
function updatePhysics() {
    // 1. エンジンの立ち上がり (10秒 = 600フレーム で 0 -> 120RPM に到達)
    // 1フレームあたりの最大変化量 = 120 / 600 = 0.2
    let rpmDiff = targetEngineRpm - currentEngineRpm;
    let maxRpmAccel = 0.2; 
    if (Math.abs(rpmDiff) < maxRpmAccel) currentEngineRpm = targetEngineRpm;
    else currentEngineRpm += Math.sign(rpmDiff) * maxRpmAccel;

    // 2. 船速の上がり方 (10秒 = 600フレーム で 0 -> 30ノット に到達)
    // 1フレームあたりの最大変化量 = 30 / 600 = 0.05
    let targetSpeedKnots = currentEngineRpm * 0.25; 
    let speedDiff = targetSpeedKnots - currentShipSpeedKnots;
    let maxSpeedAccel = 0.05;
    if (Math.abs(speedDiff) < maxSpeedAccel) currentShipSpeedKnots = targetSpeedKnots;
    else currentShipSpeedKnots += Math.sign(speedDiff) * maxSpeedAccel;

    let speedFactor = Math.abs(currentShipSpeedKnots) / 25;
    let targetRotDegPerMin = (currentRudderAngleDeg / MAX_RUDDER) * speedFactor * 30;
    currentRotDegPerMin += (targetRotDegPerMin - currentRotDegPerMin) * 0.05;

    currentWindDirDeg += (Math.random() - 0.5) * 1.0;
    currentWindSpeedKnots += (Math.random() - 0.5) * 0.5;
    if (currentWindDirDeg >= 360) currentWindDirDeg -= 360;
    if (currentWindDirDeg < 0) currentWindDirDeg += 360;
    currentWindSpeedKnots = Math.max(0, Math.min(100, currentWindSpeedKnots));
}

function animate() {
    updatePhysics();
    drawWindSpeedGauge();
    drawShipSpeedGauge();
    drawRudderGauge();
    drawRotGauge();
    drawRpmGauge();
    drawWindDirGauge();
    updateClock();
    requestAnimationFrame(animate);
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'w' || event.key === 'W') targetEngineRpm = Math.min(targetEngineRpm + 10, 120);
    else if (event.key === 's' || event.key === 'S') targetEngineRpm = Math.max(targetEngineRpm - 10, -50);
    else if (event.key === 'd' || event.key === 'D') currentRudderAngleDeg = Math.min(currentRudderAngleDeg + 5, MAX_RUDDER);
    else if (event.key === 'a' || event.key === 'A') currentRudderAngleDeg = Math.max(currentRudderAngleDeg - 5, -MAX_RUDDER);
    else if (event.key === ' ') currentRudderAngleDeg = 0;
});

animate();
