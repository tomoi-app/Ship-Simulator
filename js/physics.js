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
  maxFwd: 16.0,
  maxRev: 4.5,
  Lpp: 350,       
  B: 50,          // 船幅
  d: 15,          // 喫水
  mass: 3.6e8,    // リアル挙動回帰 (重厚な操作感・慣性を出すため、標準18万tからさらに倍の36万t相当へ重量化。船速レスポンス0.01相当)
  u: 0,           // Surge
  v: 0,           // Sway
  r: 0,           // Yaw rate
  rpm: 0,         // プロペラ回転数
  targetRpm: 0,
};

// --- MMGモデル用流体定数 (350mコンテナ船近似) ---
const RHO = 1025;             // 海水密度
const mx = P.mass * 0.05;     // 付加質量 (x方向)
const my = P.mass * 0.50;     // 付加質量 (y方向)
const Jzz = (P.mass * (P.Lpp**2) / 12) * 0.30; // 付加慣性モーメント

// 無次元化流体微係数 (Hull)
const XH0 = -0.015;           // 直進抵抗係数
const Yv  = -0.20;            // 横滑り力係数
const Yr_coeff =  0.05;       // 旋回に伴う横力係数（名前重複回避）
const Nv  = -0.10;            // 横滑りによる回頭モーメント
const Nr_coeff = -0.04;       // 旋回抵抗モーメント

// プロペラ・舵定数
const DP = 9.5;               // プロペラ直径 (m)
const AR = 160;               // 舵面積 (m^2)
const KT = 0.35;              // 推力係数
const t_tp = 0.20;            // 推力減少率

// エンジンテレグラフ定義
export const ENG_LABELS = ['FULL ASTERN','HALF ASTERN','SLOW ASTERN','STOP','SLOW AHEAD','HALF AHEAD','FULL AHEAD'];
export const ENG_RATIOS = [-1.0, -0.55, -0.30, 0, 0.22, 0.55, 1.0];

// ---- 物理定数 ----
const DRAG      = 0.9992;   // ★抵抗を減らし、慣性で進み続けるように
const DRIFT_D   = 0.96;     // 横流れ減衰率
const YAW_D     = 0.985;    // ★旋回の減衰を重く
const RUD_EFF   = 0.00035;  // ★舵効きを大幅に弱める
const STEER_SPD = 2.5;      // ★実際の舵が動く速さ（度/秒）
const ACCEL_F   = 0.0028;   // 前進加速度係数
const ACCEL_R   = 0.0050;   // 後進応答係数
const ROLL_F    = 0.015;    // ロール復原力
const PITCH_F   = 0.010;    // ピッチ復原力



// ---- キー状態 ----
export const keys = {};

export function initInput() {
  window.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.key === ' ') e.preventDefault();
    
    // --- W/Sキーの処理は main.js のエンジンオーダーに統合されたためここからは削除 ---
    if (e.key === 'd' || e.key === 'D') P.targetRudder = Math.min(P.targetRudder + 5, 35);
    else if (e.key === 'a' || e.key === 'A') P.targetRudder = Math.max(P.targetRudder - 5, -35);
    else if (e.key === ' ') P.targetRudder = 0;
  });
  window.addEventListener('keyup', e => {
    keys[e.key] = false;
  });
}

// ---- カメラオフセット ----
export const camOffset = { pitch: 0, yaw: 0 };

// キーの押しっぱなし判定用
let keyLockA = false;
let keyLockD = false;

// ---- メイン物理更新 ----
// 【修正】引数に timeScale = 1 を追加
export function updatePhysics(dt, waveAmp = 1, gameOverActive = false, currentTime = Date.now(), timeScale = 1) {
  if (gameOverActive) return;

  // 【追加】倍速用にスケールされた時間（sDt）を計算
  const sDt = dt * timeScale;

  // --- 1. 舵と主機のレスポンス ---
  // dt ではなく sDt を使うように変更
  const rSpdDeg = 2.3 * sDt;
  P.rudder += Math.min(Math.max(P.targetRudder - P.rudder, -rSpdDeg), rSpdDeg);

  // エンジンのレスポンスも sDt に
  const maxRpmDt = 5.5 * sDt; 
  if (Math.abs(P.targetRpm - P.rpm) < maxRpmDt) P.rpm = P.targetRpm; 
  else P.rpm += Math.sign(P.targetRpm - P.rpm) * maxRpmDt;

  const L = P.Lpp;
  const d = P.d;
  const u = P.u || 0;
  const v = P.v || 0;
  const r = P.r || 0;

  // --- 2. 船体流体力 (Hull) ---
  const U = Math.sqrt(u**2 + v**2) || 1e-6;
  const Xh = 0.5 * RHO * L * d * (XH0 * u * Math.abs(u));
  const Yh = 0.5 * RHO * L * d * (Yv * v * U + Yr_coeff * r * L * U); // ★変数名衝突を修正
  const Nh = 0.5 * RHO * L**2 * d * (Nv * v * U + Nr_coeff * r * L * U);

  // --- 3. プロペラ推力 (Propeller) ---
  const Dp = 9.0;
  // 120RPMで船速約30ノットにバランス調整するため、推力係数を0.30 -> 0.36に調整
  const Kt = 0.36; 
  const n = Math.abs(P.rpm) / 60; // rpst
  // 進速比 J の簡易計算 (伴流率 0.25)
  const Va = u * (1 - 0.25);
  const J_val = (Math.abs(n) > 0) ? Va / (Math.abs(n) * DP) : 0;
  const thrust = (n > 0) ? RHO * n**2 * DP**4 * Kt * (1 - J_val) : 
                 (n < 0) ? -RHO * n**2 * DP**4 * Kt * (1 - J_val) * 0.7 : 0;
  const Xp = (1 - t_tp) * thrust;

  // --- 4. 舵力 (Rudder) : キックアヘッド効果 ---
  const rudRad = P.rudder * Math.PI / 180;
  // プロペラ後流による流入速度の増加
  const uR = Math.sqrt(Va**2 + 0.6 * ( (n * DP)**2 ));
  // 揚力計算 (回頭角速度を速度とバランスとるため係数を2.5 -> 1.25へマイルド化)
  const Fn = 0.5 * RHO * AR * 1.25 * uR * uR * Math.sin(rudRad); 
  const Xr = -Fn * Math.sin(rudRad);
  const Yr_force =  Fn * Math.cos(rudRad);
  const Nr_force =  Yr_force * ( -P.Lpp / 2 ); // 船尾に働くのでマイナス方向モーメントの距離を考慮

  // --- 5. 運動方程式の求解 ---
  // const du = (Xh + Xp + Xr) / (P.mass + mx); // ★サスペンド (リニア加速に強制置換)
  const dv = (Yh + Yr_force - (P.mass + mx) * u * r) / (P.mass + my);
  const dr = (Nh + Nr_force) / ( (P.mass * L**2 / 12) + Jzz );

  // 速度の更新
  // 【変更】船速をリニア加速に変更（22ノット到達にジャスト40秒）
  let targetSpeedKts = P.rpm * 0.20; 
  let targetSpeedMs = targetSpeedKts * 0.514444; // ノットから m/s 変換
  
  // 最大加速度：1秒あたり 0.55ノットのペースでしか加速・減速できない (22ノット ÷ 40秒 = 0.55)
  let maxAccelMs = (0.55 * 0.514444) * sDt; 
  
  if (Math.abs(targetSpeedMs - P.u) < maxAccelMs) P.u = targetSpeedMs;
  else P.u += Math.sign(targetSpeedMs - P.u) * maxAccelMs;

  // 加速度(dv, dr)の積分にも sDt をかける！ これで旋回が倍速になる
  P.v = v + dv * sDt; 
  P.r = r + dr * sDt; 

  // --- 6. 横流れと波の揺れ ---
  const wr = P.windDir * Math.PI / 180;
  const cr = P.currDir * Math.PI / 180;
  const windX = -Math.sin(wr) * P.windSpeed * 0.000022; 
  const windZ =  Math.cos(wr) * P.windSpeed * 0.000022; 
  const currX = -Math.sin(cr) * P.currSpeed * 0.514 * sDt; // sDtに変更
  const currZ =  Math.cos(cr) * P.currSpeed * 0.514 * sDt; // sDtに変更

  P.driftX += (windX - P.driftX * 0.018) * sDt * 60; // sDtに変更
  P.driftZ += (windZ - P.driftZ * 0.018) * sDt * 60; // sDtに変更
  
  // 【修正】フレーム依存の減衰係数を倍速に対応させる
  const driftDecay = Math.pow(0.98, timeScale);
  P.driftX *= driftDecay;
  P.driftZ *= driftDecay;

  if (waveAmp > 2) {
    const stormF = (waveAmp - 2) * 0.5;
    P.heading += (Math.random() - 0.5) * 0.003 * stormF * timeScale;
    P.driftX  += (Math.random() - 0.5) * 0.025 * stormF * timeScale;
    P.driftZ  += (Math.random() - 0.5) * 0.025 * stormF * timeScale;
  }

  const wRoll  = Math.sin(currentTime * 0.001)  * 0.013 * waveAmp + Math.sin(currentTime * 0.00137) * 0.008 * waveAmp;
  const wPitch = Math.cos(currentTime * 0.00088) * 0.009 * waveAmp;
  
  const rollDecay = Math.min(1.0, 0.05 * timeScale);
  const pitchDecay = Math.min(1.0, 0.03 * timeScale);
  P.rollAngle  += (wRoll  - P.rollAngle)  * rollDecay;
  P.pitchAngle += (wPitch - P.pitchAngle) * pitchDecay;

  // --- 7. 絶対座標への変換 ---
  const cosH = Math.cos(P.heading);
  const sinH = Math.sin(P.heading);
  
  P.posX += (-P.u * sinH + P.v * cosH) * sDt + P.driftX * sDt + currX; // sDtに変更
  P.posZ += (P.u * cosH + P.v * sinH) * sDt + P.driftZ * sDt + currZ; // sDtに変更
  
  // 【修正】旋回方向を反転させる（-= に変更）
  P.heading -= P.r * dt;

  // HUD・他システム互換のためのパラメータ追従
  P.speed = Math.sqrt(P.u*P.u + P.v*P.v) / 0.514;
  if (P.u < 0) P.speed = -P.speed;

  // 【修正】ROT（旋回計）のメーターも正しく振れるようにマイナスをつける
  P.yawRate = -P.r;
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
