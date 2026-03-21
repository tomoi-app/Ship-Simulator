'use strict';
// ============================================================
//  physics.js — 大型船舶 本格慣性モデル
//  IMO基準に近似した操縦特性を実装
// ============================================================

export const P = {
  // 位置・姿勢
  posX: 0, posZ: 0,
  heading: 0,      // rad（北=0, 東=π/2）
  speed: 0,        // 対水速力（knot）
  driftX: 0,       // 横流れ X成分（m/s）
  driftZ: 0,       // 横流れ Z成分（m/s）
  yawRate: 0,      // 旋回角速度（rad/s）
  rollAngle: 0,    // ローリング角（rad）
  pitchAngle: 0,   // ピッチング角（rad）

  // 操作量
  rudder: 0,       // 実際の舵角（追従舵角）
  targetRudder: 0, // ★命令舵角（5度刻みで指定するもの）
  engineOrder: 0,  // -3〜+3

  // 環境
  windDir: 315, windSpeed: 8,   // 風向（deg）、風速（kt）
  currDir: 0,   currSpeed: 0.5, // 潮流方向（deg）、流速（kt）

  // 船舶定数（350m級コンテナ船相当に更新）
  maxFwd: 16.0,   // 最大前進速力（kt）
  maxRev: 4.5,    // 最大後進速力（kt）
  Lpp: 350,       // ★ 300から350に更新（旋回半径計算用）
};

// エンジンテレグラフ定義
export const ENG_LABELS = ['FULL ASTERN','HALF ASTERN','SLOW ASTERN','STOP','SLOW AHEAD','HALF AHEAD','FULL AHEAD'];
export const ENG_RATIOS = [-1.0, -0.55, -0.30, 0, 0.22, 0.55, 1.0];

// ---- 物理定数 ----
const DRAG      = 0.9992;   // ★抵抗を減らし、慣性で進み続けるように（0.9985 -> 0.9992）
const DRIFT_D   = 0.96;     // 横流れ減衰率
const YAW_D     = 0.985;    // ★旋回の減衰を重く（0.96 -> 0.985）
const RUD_EFF   = 0.00035;  // ★舵効きを大幅に弱める（0.00075 -> 0.00035）
const STEER_SPD = 2.5;      // ★実際の舵が動く速さ（度/秒）
const ACCEL_F   = 0.0028;   // 前進加速度係数
const ACCEL_R   = 0.0050;   // 後進応答係数（後進は早い）
const ROLL_F    = 0.015;    // ロール復原力
const PITCH_F   = 0.010;    // ピッチ復原力

// ---- キー状態 ----
export const keys = {};

export function initInput() {
  window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.key === ' ') e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });
}

// ---- カメラオフセット ----
export const camOffset = { pitch: 0, yaw: 0 };

// キーの押しっぱなし判定用
let keyLockA = false;
let keyLockD = false;

// ---- メイン物理更新 ----
export function updatePhysics(dt, waveAmp = 1, gameOverActive = false) {
  if (gameOverActive) return;

  // --- 1. 舵の5度ステップ入力ロジック ---
  // Aキー（左舵）
  if (keys['a'] || keys['A']) {
    if (!keyLockA) {
      P.targetRudder = Math.max(P.targetRudder - 5, -35); // 5度ずつ引く
      keyLockA = true;
    }
  } else { keyLockA = false; }

  // Dキー（右舵）
  if (keys['d'] || keys['D']) {
    if (!keyLockD) {
      P.targetRudder = Math.min(P.targetRudder + 5, 35); // 5度ずつ足す
      keyLockD = true;
    }
  } else { keyLockD = false; }

  // Qキー（舵中央：ミッドシップ）
  if (keys['q'] || keys['Q']) { P.targetRudder = 0; }

  // --- 2. 追従舵（実際の舵がゆっくり動く） ---
  const diff = P.targetRudder - P.rudder;
  if (Math.abs(diff) > 0.1) {
    // ステアリングエンジンの速度（STEER_SPD）で目標に近づく
    P.rudder += Math.sign(diff) * STEER_SPD * dt;
  } else {
    P.rudder = P.targetRudder;
  }

  // 視点操作は main.js のマウス・タッチイベントで行います

  // エンジン応答（大型船は加速が非常に遅い）
  const ratio  = ENG_RATIOS[P.engineOrder + 3];
  const target = ratio > 0 ? ratio * P.maxFwd : ratio * P.maxRev;
  const accel  = ratio > 0 ? ACCEL_F : (ratio < 0 ? ACCEL_R : ACCEL_F * 1.2);
  P.speed += (target - P.speed) * accel * dt * 60;
  P.speed *= DRAG;
  P.speed = Math.max(-P.maxRev, Math.min(P.maxFwd, P.speed));

  // --- 3. 旋回性能の計算（本格調整） ---
  // 1.5ノット以下での舵効き低下をさらに厳密に
  const sf = Math.max(0, Math.abs(P.speed) - 1.0) / (P.maxFwd - 1.0);
  
  // 旋回力の計算（速力の二乗に近い特性を持たせる）
  const turnForce = P.rudder * RUD_EFF * (sf * sf + 0.1) * Math.sign(P.speed);
  
  P.yawRate += (turnForce - P.yawRate * 0.05) * dt * 60;
  P.yawRate *= YAW_D;
  P.heading += P.yawRate * dt * 60;

  // 横流れ（風・潮流の影響）
  const wr = P.windDir * Math.PI / 180;
  const cr = P.currDir * Math.PI / 180;
  // 風圧流（船体が風上から流される）
  const windX = Math.sin(wr) * P.windSpeed * 0.000022;
  const windZ = Math.cos(wr) * P.windSpeed * 0.000022;
  // 潮流（一定速度で流される）
  const currX = Math.sin(cr) * P.currSpeed * 0.514 * dt;
  const currZ = Math.cos(cr) * P.currSpeed * 0.514 * dt;

  P.driftX += (windX - P.driftX * 0.018) * dt * 60;
  P.driftZ += (windZ - P.driftZ * 0.018) * dt * 60;
  P.driftX *= DRIFT_D;
  P.driftZ *= DRIFT_D;

  // 嵐時の追加乱れ
  if (waveAmp > 2) {
    const stormF = (waveAmp - 2) * 0.5;
    P.heading += (Math.random() - 0.5) * 0.003 * stormF;
    P.driftX  += (Math.random() - 0.5) * 0.025 * stormF;
    P.driftZ  += (Math.random() - 0.5) * 0.025 * stormF;
  }

  // 船体動揺（ロール・ピッチ）
  const wRoll  = Math.sin(Date.now() * 0.001)  * 0.013 * waveAmp
               + Math.sin(Date.now() * 0.00137) * 0.008 * waveAmp;
  const wPitch = Math.cos(Date.now() * 0.00088) * 0.009 * waveAmp;
  P.rollAngle  += (wRoll  - P.rollAngle)  * ROLL_F;
  P.pitchAngle += (wPitch - P.pitchAngle) * PITCH_F;

  // 位置更新（対水速力 + 横流れ + 潮流）
  const spd = P.speed * 0.514; // kt → m/s
  P.posX += Math.sin(P.heading) * spd * dt + P.driftX * dt + currX;
  P.posZ += Math.cos(P.heading) * spd * dt + P.driftZ * dt + currZ;
}

// ---- スコア計算（100点満点）----
export function calcScore(dist, spd, angle, elapsedSec, collision, mission) {
  if (collision) {
    return {
      total: 0,
      items: [
        { n: '接岸精度', p: 0, m: 35, pct: 0 },
        { n: '接岸速力', p: 0, m: 30, pct: 0 },
        { n: '進入角度', p: 0, m: 20, pct: 0 },
        { n: '時間評価', p: 0, m: 15, pct: 0 },
      ],
      pens: ['⚠ 衝突事故 −100pt'],
    };
  }

  // 各項目点数
  const dP = dist < 1  ? 35 : dist < 3  ? 32 : dist < 7  ? 27
           : dist < 12 ? 20 : dist < 20 ? 12 : dist < 28 ? 5 : 0;
  const sP = spd < 0.15 ? 30 : spd < 0.4  ? 26 : spd < 0.7  ? 21
           : spd < 1.0  ? 15 : spd < 1.5  ? 8  : spd < 2.0  ? 3 : 0;
  const aP = angle < 2  ? 20 : angle < 6  ? 17 : angle < 12 ? 13
           : angle < 22 ? 8  : angle < 38 ? 3  : 0;
  const baseT = mission ? (mission.diff === 1 ? 120 : mission.diff === 2 ? 200 : 280) : 180;
  const tP = elapsedSec < baseT * 0.5 ? 15 : elapsedSec < baseT * 0.7 ? 12
           : elapsedSec < baseT       ? 8  : elapsedSec < baseT * 1.4  ? 4 : 0;

  return {
    total: Math.max(0, Math.min(100, dP + sP + aP + tP)),
    items: [
      { n: '接岸精度', p: dP, m: 35, pct: dP / 35 * 100 },
      { n: '接岸速力', p: sP, m: 30, pct: sP / 30 * 100 },
      { n: '進入角度', p: aP, m: 20, pct: aP / 20 * 100 },
      { n: '時間評価', p: tP, m: 15, pct: tP / 15 * 100 },
    ],
    pens: [],
  };
}
