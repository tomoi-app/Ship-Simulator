'use strict';
// ============================================================
//  physics.js — MMGスタンダード法 (定常旋回・物理バグ完全修正版)
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
  targetRudder: 0, // 命令舵角（5度刻みで指定するもの）
  engineOrder: 0,  // -4〜+4

  // 環境
  windDir: 315, windSpeed: 8,   
  currDir: 0,   currSpeed: 0.5, 
  waterDepth: 200,              

  // 船舶定数（KCS: 230m級コンテナ船、スケール1.5倍で350m相当に設定）
  maxFwd: 16.0,
  maxRev: 4.5,
  Lpp: 350,
  B:    49,
  d:    16.4,
  mass: 1.84e8,   // 排水量×1.025×λ³ ≈ 184000t
  u: 0,           // Surge速度 [m/s]
  v: 0,           // Sway速度 [m/s]
  r: 0,           // Yaw rate [rad/s]
  rpm: 0,         // プロペラ回転数 [rpm]
  targetRpm: 0,
  engineOverload: false,
};

// ============================================================
//  KCS公開流体微係数 (定常旋回ができるよう安定化チューニング済)
// ============================================================
const RHO  = 1025;             
const DP   = 14.45;            
const AR   = 115;              // 実物スケールの正しい舵面積
const t_P  = 0.197;            
const w_P  = 0.192;            
const x_P  = -0.48;            
const a_H  = 0.312;            
const x_H  = -0.464;           
const gamma_R = 0.395;         
const l_R  = -0.710;           
const epsilon = 1.09;          
const kappa   = 0.50;          

// Hull 流体微係数 (無次元)
const X_vv   = -0.040;
const X_vr   =  0.002;
const X_rr   =  0.011;
const X_vvvv =  0.771;
const Y_v    = -0.450;         // 横滑りに対する抵抗
const Y_r    =  0.083;         
const Y_vvv  = -1.607;
const Y_vvr  =  0.379;
const Y_vrr  = -0.391;
const Y_rrr  =  0.008;
const N_v    = -0.100;         
const N_r    = -0.150;         // ★旋回ダンピング（ブレーキ）をしっかり効かせる
const N_vvv  =  0.061;
const N_vvr  = -0.030;
const N_vrr  = -0.320;
const N_rrr  = -0.080;         // 高速旋回時の上限ストッパー

// 付加質量
const mx  = P.mass * 0.022;
const my  = P.mass * 0.223;
const Jzz = P.mass * (P.Lpp ** 2) * 0.011;
const Izz = P.mass * (P.Lpp ** 2) / 12;

export const ENG_LABELS = ['FULL ASTERN','HALF ASTERN','SLOW ASTERN','STOP','SLOW AHEAD','HALF AHEAD','FULL AHEAD'];
export const ENG_RATIOS = [-1.0, -0.55, -0.30, 0, 0.22, 0.55, 1.0];

export const keys = {};

export function initInput() {
  window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.key === ' ') e.preventDefault();
    if (e.key === 'd' || e.key === 'D') P.targetRudder = Math.min(P.targetRudder + 5, 35);
    else if (e.key === 'a' || e.key === 'A') P.targetRudder = Math.max(P.targetRudder - 5, -35);
    else if (e.key === ' ') P.targetRudder = 0;
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });
}

export const camOffset = { pitch: 0, yaw: 0 };

function shallowWaterFactor(waterDepth, draft) {
  const hT = waterDepth / draft;
  if (hT >= 4.0) return { Yf: 1.0, Nf: 1.0 };
  if (hT >= 2.0) {
    const t = (4.0 - hT) / 2.0;
    return { Yf: 1.0 + 0.30 * t, Nf: 1.0 + 0.50 * t };
  }
  if (hT >= 1.5) {
    const t = (2.0 - hT) / 0.5;
    return { Yf: 1.30 + 0.30 * t, Nf: 1.50 + 0.50 * t };
  }
  const t = Math.max(0, (1.5 - hT) / 0.3);
  return { Yf: 1.60 + 0.60 * t, Nf: 2.00 + 1.00 * t };
}

// ============================================================
//  メイン物理更新 — MMGスタンダード法
// ============================================================
export function updatePhysics(dt, waveAmp = 1, gameOverActive = false, currentTime = Date.now(), timeScale = 1) {
  if (gameOverActive) return;

  const sDt = dt * timeScale;
  const L   = P.Lpp;
  const d   = P.d;

  // STEP 1. 操舵 (2.32°/s)
  const maxRudderSpeed = 2.32 * sDt;
  P.rudder += Math.min(Math.max(P.targetRudder - P.rudder, -maxRudderSpeed), maxRudderSpeed);

  // STEP 2. エンジン RPM 追従
  const rpmMap = {
    '4': 110, '3': 70, '2': 35, '1': 20, '0': 0,
    '-1': -15, '-2': -25, '-3': -50, '-4': -80,
  };
  P.targetRpm = rpmMap[P.engineOrder.toString()] ?? 0;

  const speedKts = P.speed * Math.sign(P.u);
  if (speedKts > 5.0 && P.targetRpm < 0) {
    P.engineOverload = true;
    const maxRpmDt = 1.0 * sDt;
    P.rpm += Math.sign(P.targetRpm - P.rpm) * Math.min(Math.abs(P.targetRpm - P.rpm), maxRpmDt);
  } else {
    P.engineOverload = false;
    const maxRpmDt = 5.5 * sDt;
    P.rpm += Math.sign(P.targetRpm - P.rpm) * Math.min(Math.abs(P.targetRpm - P.rpm), maxRpmDt);
  }

  const u = P.u || 0;
  const v = P.v || 0;
  const r = P.r || 0;
  const U = Math.sqrt(u * u + v * v) || 1e-6;

  // STEP 3. 船体流体力 (Hull)
  const sw = shallowWaterFactor(P.waterDepth, d);
  const vn = (U > 0.01) ? v / U : 0;
  const rn = (U > 0.01) ? r * L / U : 0;

  const X_H_nd = X_vv * vn * vn + X_vr * vn * rn + X_rr * rn * rn + X_vvvv * vn ** 4;
  const Y_H_nd = sw.Yf * (Y_v * vn + Y_r * rn + Y_vvv * vn ** 3 + Y_vvr * vn ** 2 * rn + Y_vrr * vn * rn ** 2 + Y_rrr * rn ** 3);
  const N_H_nd = sw.Nf * (N_v * vn + N_r * rn + N_vvv * vn ** 3 + N_vvr * vn ** 2 * rn + N_vrr * vn * rn ** 2 + N_rrr * rn ** 3);

  const R0 = 0.5 * RHO * L * d * 0.096 * u * Math.abs(u);
  const Xh = 0.5 * RHO * L * d * U * U * X_H_nd - R0;
  const Yh = 0.5 * RHO * L * d * U * U * Y_H_nd;
  const Nh = 0.5 * RHO * L * L * d * U * U * N_H_nd;

  // STEP 4. プロペラ推力
  const n_rps = P.rpm / 60;
  const Va    = u * (1 - w_P);
  const J_val = (Math.abs(n_rps) > 0.01) ? Va / (n_rps * DP) : 0;

  let KT, thrust;
  if (n_rps >= 0) {
    KT = Math.max(0, 0.527 - 0.455 * J_val);
    thrust = RHO * n_rps * Math.abs(n_rps) * DP ** 4 * KT;
  } else {
    KT = Math.max(0, 0.527 + 0.455 * J_val);
    thrust = RHO * n_rps * Math.abs(n_rps) * DP ** 4 * KT * 0.7;
  }
  const Xp = (1 - t_P) * thrust;

  // STEP 5. 舵力
  const rudRad = P.rudder * Math.PI / 180;
  const u_R = epsilon * Va * Math.sqrt(1 + kappa * (Math.sqrt(1 + 8 * KT / (Math.PI * J_val * J_val + 1e-6)) - 1) ** 2) || (Math.abs(Va) + 0.5);
  const v_R   = gamma_R * (v + l_R * L * r);
  
  // ★無限スピンの原因だったバグの修正箇所（符号を正しく加算にする）
  // 船尾が外に滑ることで舵への水流角度が変わり、舵の効きが自然と弱まる（ブレーキになる）正しい計算式
  const alpha_R = rudRad + Math.atan2(v_R, u_R);

  const Fn = 0.5 * RHO * AR * 6.13 * u_R * u_R * Math.sin(alpha_R) / (2.25 + 1.0);
  const Xr = -Fn * Math.sin(rudRad);
  const Yr =  -(1 + a_H) * Fn * Math.cos(rudRad);
  const Nr =  -(x_P + a_H * x_H) * L * Fn * Math.cos(rudRad);

  // ----------------------------------------------------------
  // STEP 6. 運動方程式の積分 — MMG標準 3-DOF 完全結合モデル
  // ----------------------------------------------------------
  const X_total = Xh + Xp + Xr;
  const Y_total = Yh + Yr;
  const N_total = Nh + Nr;

  const du = (X_total + (P.mass + my) * v * r) / (P.mass + mx);
  const dv = (Y_total - (P.mass + mx) * u * r) / (P.mass + my);
  const dr = N_total / (Izz + Jzz);

  P.u += du * sDt;
  P.v += dv * sDt;
  P.r += dr * sDt;

  if (U < 1.0) {
      const damp = (1.0 - U) * 0.05 * sDt;
      P.u -= P.u * damp;
      P.v -= P.v * damp;
      P.r -= P.r * damp;
  }

  const MAX_PHYSICAL_R = (90 / 60) * (Math.PI / 180);
  P.r = Math.max(-MAX_PHYSICAL_R, Math.min(MAX_PHYSICAL_R, P.r));

  // ----------------------------------------------------------
  // STEP 7. 風・潮流の外力
  // ----------------------------------------------------------
  const wr = P.windDir * Math.PI / 180;
  const cr = P.currDir * Math.PI / 180;

  const windX = -Math.sin(wr) * P.windSpeed * 0.000022;
  const windZ =  Math.cos(wr) * P.windSpeed * 0.000022;

  const currX = -Math.sin(cr) * P.currSpeed * 0.514 * sDt;
  const currZ =  Math.cos(cr) * P.currSpeed * 0.514 * sDt;

  P.driftX += (windX - P.driftX * 0.018) * sDt * 60;
  P.driftZ += (windZ - P.driftZ * 0.018) * sDt * 60;

  const driftDecay = Math.pow(0.98, timeScale);
  P.driftX *= driftDecay;
  P.driftZ *= driftDecay;

  if (waveAmp > 2) {
    const stormF = (waveAmp - 2) * 0.5;
    P.heading += (Math.random() - 0.5) * 0.003 * stormF * timeScale;
    P.driftX  += (Math.random() - 0.5) * 0.025 * stormF * timeScale;
    P.driftZ  += (Math.random() - 0.5) * 0.025 * stormF * timeScale;
  }

  // ----------------------------------------------------------
  // STEP 8. 波浪による動揺
  // ----------------------------------------------------------
  const wRoll  = Math.sin(currentTime * 0.001)   * 0.013 * waveAmp
               + Math.sin(currentTime * 0.00137) * 0.008 * waveAmp;
  const wPitch = Math.cos(currentTime * 0.00088) * 0.009 * waveAmp;

  const rollDecay  = Math.min(1.0, 0.05 * timeScale);
  const pitchDecay = Math.min(1.0, 0.03 * timeScale);
  P.rollAngle  += (wRoll  - P.rollAngle)  * rollDecay;
  P.pitchAngle += (wPitch - P.pitchAngle) * pitchDecay;

  // ----------------------------------------------------------
  // STEP 9. 絶対座標への変換
  // ----------------------------------------------------------
  const cosH = Math.cos(P.heading);
  const sinH = Math.sin(P.heading);

  P.posX += (-P.u * sinH + P.v * cosH) * sDt + P.driftX * sDt + currX;
  P.posZ += ( P.u * cosH + P.v * sinH) * sDt + P.driftZ * sDt + currZ;
  P.heading += P.r * sDt;

  // ----------------------------------------------------------
  // STEP 10. HUD互換パラメータの更新
  // ----------------------------------------------------------
  P.speed = Math.sqrt(P.u * P.u + P.v * P.v) / 0.514;
  if (P.u < 0) P.speed = -P.speed;
  P.yawRate = P.r;
}

// ============================================================
//  スコア計算
// ============================================================
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