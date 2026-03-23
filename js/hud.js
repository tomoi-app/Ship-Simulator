import * as tools from './tools.js';

// --- HUD用のグローバル変数 ---
let canvas, ctx;
const gaugeBarHeight = 120; // 計器バーの高さ
let overloadTimer = 0; // OVERLOAD点滅用タイマー

// --- 補助関数 (追加) ---
const degToRad = (deg) => deg * Math.PI / 180;
const map = (value, in_min, in_max, out_min, out_max) => {
    return (value - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
};
const mpsToKnots = 1.94384; // m/s から Knots への変換係数

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

// --- スムージング設定 ---
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

// --- Canvasの自動生成に対応した初期化 ---
export function initHUD() {
    canvas = document.getElementById('hudCanvas');
    if (!canvas) {
        // HTMLにcanvasがない場合は自動生成して追加
        canvas = document.createElement('canvas');
        canvas.id = 'hudCanvas';
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none'; // クリック操作を貫通させる
        canvas.style.zIndex = '9999';
        document.body.appendChild(canvas);
    }
    ctx = canvas.getContext('2d');
    resizeHUD();
    window.addEventListener('resize', resizeHUD);
}

function resizeHUD() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

export function drawDashboard(P, simTime, timeDelta) {
    if (!ctx) return;
    const dt = timeDelta || 0.016; // フォールバック

    // スムージング処理
    V.telegraph = smoothValue(V.telegraph, P.engineOrder, smoothRate * 2.0, dt); // P.engineOrderに変更
    V.windDir = smoothAngle(V.windDir, P.windDir, angleSmoothRate, dt);
    V.windSpeed = smoothValue(V.windSpeed, P.windSpeed, smoothRate, dt);
    V.shipSpeed = smoothValue(V.shipSpeed, P.speed, smoothRate, dt); // P.speedはすでにKnots
    V.rudderAngle = smoothValue(V.rudderAngle, -P.rudder, smoothRate, dt);
    V.yawRate = smoothValue(V.yawRate, -P.yawRate, angleSmoothRate, dt);
    V.rpm = smoothValue(V.rpm, P.rpm, smoothRate, dt);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, gaugeBarHeight);

    const gaugeWidth = canvas.width / 8;
    const yCenter = gaugeBarHeight / 2;
    const fontBold = "bold 16px 'BIZ UDMincho', serif";
    const fontSmall = "normal 14px 'BIZ UDMincho', serif";
    const fontLarge = "bold 20px 'BIZ UDMincho', serif";

    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 各計器の描画呼び出し
    drawTelegraph(ctx, gaugeWidth * 0.5, yCenter, 50, V.telegraph, fontSmall);
    drawWindGauge(ctx, gaugeWidth * 1.5, yCenter, 50, V.windDir, V.windSpeed, fontBold, fontSmall);
    drawSpeedGauge(ctx, gaugeWidth * 2.5, yCenter, 50, V.windSpeed, 'WIND SPD', 'Knots', 60, fontBold, fontSmall, fontLarge);
    drawSpeedGauge(ctx, gaugeWidth * 3.5, yCenter, 50, V.shipSpeed, 'SHIP SPD', 'Knots', 30, fontBold, fontSmall, fontLarge);
    drawRudderGauge(ctx, gaugeWidth * 4.5, yCenter, 50, V.rudderAngle, fontBold, fontSmall);
    drawRotGauge(ctx, gaugeWidth * 5.5, yCenter, 50, V.yawRate, fontBold, fontSmall);
    
    // 過負荷判定を正しく P.engineOverload に修正
    drawRpmGauge(ctx, gaugeWidth * 6.5, yCenter, 50, V.rpm, P.engineOverload, overloadTimer, fontBold, fontSmall, fontLarge);
    
    drawClock(ctx, gaugeWidth * 7.5, yCenter, 50, simTime, fontBold, fontSmall);

    overloadTimer += dt;
}

// --- 各計器の具体的な描画関数群 (文字盤のディテールを調整) ---

// 1. TELEGRAPH (MOLスタイル)
function drawTelegraph(ctx, x, y, r, value, fontSmall) {
    drawBaseCircle(ctx, x, y, r, 'TELEGRAPH');
    const steps = ['FULL', 'HALF', 'SLOW', 'DEAD', 'STOP', 'DEAD', 'SLOW', 'HALF', 'FULL'];
    const angles = [-150, -120, -90, -60, 0, 60, 90, 120, 150];

    // 文字盤
    ctx.font = fontSmall;
    ctx.fillStyle = 'white';
    steps.forEach((step, i) => {
        const rad = degToRad(angles[i] - 90);
        const tx = x + Math.cos(rad) * (r * 0.75);
        const ty = y + Math.sin(rad) * (r * 0.75);
        ctx.fillText(step, tx, ty);
    });

    // 針 (valueにスムーズに追従)
    const angle = map(value, -4, 4, -150, 150); // FULL AHEAD(+4) 〜 FULL ASTERN(-4)
    drawNeedle(ctx, x, y, r * 0.9, angle, 'red', 4);
}

// 2. WIND GAUGE (WIND DIR)
function drawWindGauge(ctx, x, y, r, dir, speed, fontBold, fontSmall) {
    drawBaseCircle(ctx, x, y, r, 'WIND DIR');
    ctx.font = fontSmall;
    // N, E, S, W
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([label, ang]) => {
        const rad = degToRad(ang - 90);
        ctx.fillText(label, x + Math.cos(rad) * (r * 0.75), y + Math.sin(rad) * (r * 0.75));
    });

    // 風向の針
    drawNeedle(ctx, x, y, r * 0.9, dir, 'skyblue', 3);
    // 中央に風速数値
    ctx.font = fontBold;
    ctx.fillText(speed.toFixed(1), x, y + r * 0.2);
}

// 3, 4. SPEED GAUGE (WIND SPD, SHIP SPD)
function drawSpeedGauge(ctx, x, y, r, speed, title, unit, maxSpeed, fontBold, fontSmall, fontLarge) {
    drawBaseCircle(ctx, x, y, r, title);
    // 目盛り (0 〜 maxSpeed)
    for (let i = 0; i <= maxSpeed; i += (maxSpeed / 6)) {
        const ang = map(i, 0, maxSpeed, -140, 140);
        drawTick(ctx, x, y, r, ang, i % (maxSpeed/3) === 0 ? 10 : 5);
        if (i % (maxSpeed/3) === 0) {
            ctx.font = fontSmall;
            const rad = degToRad(ang - 90);
            ctx.fillText(i.toFixed(0), x + Math.cos(rad) * (r * 0.7), y + Math.sin(rad) * (r * 0.7));
        }
    }
    // 針
    const angle = map(speed, 0, maxSpeed, -140, 140);
    drawNeedle(ctx, x, y, r * 0.9, angle, title.includes('WIND') ? 'skyblue' : 'white', 3);
    // 中央下部に数値と単位
    ctx.font = fontLarge;
    ctx.fillText(speed.toFixed(1), x, y + r * 0.2);
    ctx.font = fontSmall;
    ctx.fillText(unit, x, y + r * 0.5);
}

// 5. RUDDER GAUGE (RUDDER)
function drawRudderGauge(ctx, x, y, r, angle, fontBold, fontSmall) {
    drawBaseCircle(ctx, x, y, r, 'RUDDER');
    // 目盛り (Port 35 〜 Starboard 35)
    for (let i = -35; i <= 35; i += 5) {
        const ang = map(i, -35, 35, -140, 140);
        drawTick(ctx, x, y, r, ang, i % 10 === 0 ? 10 : 5);
        if (i % 10 === 0 && i !== 0) {
            ctx.font = fontSmall;
            const rad = degToRad(ang - 90);
            ctx.fillText(Math.abs(i), x + Math.cos(rad) * (r * 0.7), y + Math.sin(rad) * (r * 0.7));
        }
    }
    // P, S
    ctx.font = fontBold;
    ctx.fillStyle = 'red'; ctx.fillText('P', x - r * 0.8, y); // Port
    ctx.fillStyle = 'green'; ctx.fillText('S', x + r * 0.8, y); // Starboard
    ctx.fillStyle = 'white';

    // 針
    drawNeedle(ctx, x, y, r * 0.9, map(angle, -35, 35, -140, 140), 'white', 3);
    // 中央に数値
    ctx.font = fontBold;
    ctx.fillText(Math.abs(angle).toFixed(1) + '°', x, y + r * 0.2);
}

// 6. RATE OF TURN (R.O.T.)
function drawRotGauge(ctx, x, y, r, yawRate, fontBold, fontSmall) {
    drawBaseCircle(ctx, x, y, r, 'R.O.T.');
    // 目盛り (Port 60 〜 Starboard 60 deg/min)
    for (let i = -60; i <= 60; i += 10) {
        const ang = map(i, -60, 60, -140, 140);
        drawTick(ctx, x, y, r, ang, i % 20 === 0 ? 10 : 5);
        if (i % 20 === 0 && i !== 0) {
            ctx.font = fontSmall;
            const rad = degToRad(ang - 90);
            ctx.fillText(Math.abs(i), x + Math.cos(rad) * (r * 0.7), y + Math.sin(rad) * (r * 0.7));
        }
    }
    // 針
    drawNeedle(ctx, x, y, r * 0.9, map(yawRate, -60, 60, -140, 140), 'white', 3);
    // 中央に数値 (deg/min)
    ctx.font = fontBold;
    ctx.fillText(Math.abs(yawRate).toFixed(1), x, y + r * 0.2);
    ctx.font = fontSmall;
    ctx.fillText('deg/min', x, y + r * 0.5);
}

// 7. ENGINE RPM (RPM)
function drawRpmGauge(ctx, x, y, r, rpm, isCrashAstern, timer, fontBold, fontSmall, fontLarge) {
    drawBaseCircle(ctx, x, y, r, 'RPM');
    const maxRpm = 100;
    // 目盛り (0 〜 100)
    for (let i = 0; i <= maxRpm; i += 10) {
        const ang = map(i, 0, maxRpm, -140, 140);
        drawTick(ctx, x, y, r, ang, 10);
        if (i % 20 === 0) {
            ctx.font = fontSmall;
            const rad = degToRad(ang - 90);
            ctx.fillText(i, x + Math.cos(rad) * (r * 0.7), y + Math.sin(rad) * (r * 0.7));
        }
    }
    // 針
    const angle = map(rpm, 0, maxRpm, -140, 140);
    drawNeedle(ctx, x, y, r * 0.9, angle, isCrashAstern ? 'orange' : 'white', 3);
    // 中央に数値
    ctx.font = fontLarge;
    ctx.fillText(Math.abs(rpm).toFixed(0), x, y + r * 0.2);

    // ★OVERLOAD アラーム (Crash Astern時)
    if (isCrashAstern) {
        ctx.font = fontSmall;
        ctx.fillStyle = 'orange';
        ctx.fillText('ASTERN', x, y - r * 0.4);
        // 点滅ロジック
        if (timer % 1.0 < 0.5) { // 1秒周期、0.5秒点灯
            ctx.fillStyle = 'red';
            ctx.fillText('OVERLOAD', x, y - r * 0.6);
        }
    }
}

// 8. CLOCK (CLOCK)
function drawClock(ctx, x, y, r, simTime, fontBold, fontSmall) {
    drawBaseCircle(ctx, x, y, r, 'CLOCK');
    ctx.font = fontSmall;
    ctx.fillStyle = 'white';
    // 1 〜 12 の数字
    for (let i = 1; i <= 12; i++) {
        const rad = degToRad(i * 30 - 90);
        ctx.fillText(i, x + Math.cos(rad) * (r * 0.75), y + Math.sin(rad) * (r * 0.75));
    }

    // ★仮想時間 (simTime) に基づく滑らかな針の移動
    const totalSeconds = simTime % (12 * 3600); // 12時間周期
    const hours = totalSeconds / 3600;
    const minutes = (totalSeconds % 3600) / 60;
    const seconds = totalSeconds % 60;

    // 時針 (1時間で30度、1分で0.5度)
    drawNeedle(ctx, x, y, r * 0.5, (hours * 30) + (minutes * 0.5), 'white', 4);
    // 分針 (1分で6度、1秒で0.1度)
    drawNeedle(ctx, x, y, r * 0.8, (minutes * 6) + (seconds * 0.1), 'white', 3);
    // 秒針 (1秒で6度)
    drawNeedle(ctx, x, y, r * 0.9, seconds * 6, 'red', 1);
}

// --- 共通描画補助関数 ---

// 計器のベースとなる円とタイトル
function drawBaseCircle(ctx, x, y, r, title) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#444'; // 目立たないグレー
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = "normal 14px 'BIZ UDMincho', serif";
    ctx.fillStyle = '#aaa'; // 薄いグレー
    ctx.fillText(title, x, y - r * 1.2); // タイトルを少し上に配置
    ctx.fillStyle = 'white';
}

// 針の描画 (中央から指定角度、長さ、色)
function drawNeedle(ctx, x, y, length, angleDeg, color, width) {
    const rad = degToRad(angleDeg - 90); // Canvasは右が0度、真上を0度にする
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(rad) * length, y + Math.sin(rad) * length);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
}

// 目盛りの描画
function drawTick(ctx, x, y, r, angleDeg, length) {
    const rad = degToRad(angleDeg - 90);
    const outerR = r;
    const innerR = r - length;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(rad) * innerR, y + Math.sin(rad) * innerR);
    ctx.lineTo(x + Math.cos(rad) * outerR, y + Math.sin(rad) * outerR);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;
    ctx.stroke();
}