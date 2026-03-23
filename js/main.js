'use strict';
// ============================================================
//  main.js — エントリーポイント
//  v5.0: モジュール分割・Proceduralテクスチャ版
// ============================================================

import * as THREE     from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { MISSIONS, SAVE, saveResult, getStats } from './missions.js';
import { P, ENG_LABELS, ENG_RATIOS, initInput, keys, camOffset, updatePhysics, calcScore } from './physics.js';
import { initAudio, updateEngineSound, playHorn, playCrash, playVHF, playClear, isReady as audioReady } from './audio.js';
import { buildScene, buildOcean, buildShip, buildWorld, buildAI, toggleNight } from './scene.js';
import {
  drawRudder, updateCompass, updateTelegraph,
  showPenaltyToast, flashScreen,
  drawResultRadar, animScore, showDockResult, applyWeatherOverlay, updateDashboard
} from './hud.js';
import { isToolOpen, toggleTool, drawAll as drawTools } from './tools.js';

// ============================================================
//  Three.js セットアップ
// ============================================================
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('cv'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping      = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.01, 50000);

const { scene, sky, sun, amb, moon } = buildScene(THREE);
const { ocean, wu }                   = buildOcean(THREE, scene);
const { shipGroup, prop }             = buildShip(THREE, scene);
const { buoys }                       = buildWorld(THREE, scene);
const { AIships, fishBoats, tugs }    = buildAI(THREE, scene);

// --- ブリッジ視点（ファーストパーソン）設定 ---
// ★ここの数値を変更するだけで、ゲーム中ずっと反映されるように整理しました！
shipGroup.add(camera);
const bridgeXPos   = -13;     // 左右★（プラスで左に移動）
const bridgeHeight = 10;   // ★高さ（プラスで上に移動）
const bridgeZPos   = 9.7;  // ★前後位置（プラスで前に移動）
camera.position.set(bridgeXPos, bridgeHeight, bridgeZPos);

// --- 物理演算対象の変更（shipGroup 全体を指定） ---
P.shipMesh = shipGroup;

// 雨
const rainCv  = document.getElementById('rain-cv');
const rainCtx = rainCv.getContext('2d');
rainCv.width  = innerWidth; rainCv.height = innerHeight;
const drops   = Array.from({ length: 350 }, () => ({
  x: Math.random() * innerWidth, y: Math.random() * innerHeight,
  s: 9 + Math.random() * 14, l: 12 + Math.random() * 22,
}));

function drawRain() {
  rainCtx.clearRect(0, 0, rainCv.width, rainCv.height);
  rainCtx.strokeStyle = 'rgba(180,210,240,.48)'; rainCtx.lineWidth = 0.9;
  drops.forEach(d => {
    rainCtx.beginPath(); rainCtx.moveTo(d.x, d.y); rainCtx.lineTo(d.x - 2, d.y + d.l); rainCtx.stroke();
    d.y += d.s; if (d.y > rainCv.height) { d.y = -22; d.x = Math.random() * rainCv.width; }
  });
}

// ============================================================
//  ミッション状態
// ============================================================
let curM      = null;
let goActive  = false;
let mst       = { done: false, t0: 0, tugOn: false, pens: [], spdP: 0, colP: 0, penTmr: 0 };
let vhfQ      = [];
let vhfFired  = new Set();

// 倍速管理
let timeScale = 1;                   // 現在の倍速係数
const TIME_SCALES = [1, 2, 4, 8];    // 選べる倍速の段階
let simTime = 0;                     // ゲーム内の経過時間(ms)

// ============================================================
//  キー入力 & タッチ
// ============================================================
initInput();

window.addEventListener('keydown', e => {
  if (e.key === 'w' || e.key === 'W') { P.engineOrder = Math.min(P.engineOrder + 1, 4);  updateTelegraph(P.engineOrder); }
  if (e.key === 's' || e.key === 'S') { P.engineOrder = Math.max(P.engineOrder - 1, -4); updateTelegraph(P.engineOrder); }
  if (e.key === 'e' || e.key === 'E') { P.engineOrder = 0; updateTelegraph(P.engineOrder); }
  if (e.key === 'h' || e.key === 'H') { initAudio(); playHorn(); }
  if (e.key === 'm' || e.key === 'M') goSel();
  if (e.key === 't' || e.key === 'T') toggleTool();
});

function initTouch() {
  document.getElementById('tbu')?.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); P.engineOrder = Math.min(P.engineOrder + 1, 4);  updateTelegraph(P.engineOrder); }, { passive: false });
  document.getElementById('tbd')?.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); P.engineOrder = Math.max(P.engineOrder - 1, -4); updateTelegraph(P.engineOrder); }, { passive: false });
  document.getElementById('tbs')?.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); P.engineOrder = 0; updateTelegraph(P.engineOrder); }, { passive: false });
  document.getElementById('tbh')?.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); playHorn(); }, { passive: false });

  const area  = document.getElementById('tcl');
  const stick = document.getElementById('joy');
  const knob  = document.getElementById('jknob');
  if (!area || !stick || !knob) return;
  let jActive = false, jCX = 0; const JR = 48;

  area.addEventListener('touchstart', e => {
    e.preventDefault(); initAudio(); jActive = true;
    const r = stick.getBoundingClientRect(); jCX = r.left + r.width / 2;
  }, { passive: false });
  area.addEventListener('touchmove', e => {
    e.preventDefault(); if (!jActive) return;
    const dx = Math.max(-JR, Math.min(JR, e.touches[0].clientX - jCX));
    knob.style.left = (stick.clientWidth  / 2 - 20 + dx) + 'px';
    knob.style.top  = (stick.clientHeight / 2 - 20) + 'px';
    P.rudder = (dx / JR) * 35;
  }, { passive: false });
  area.addEventListener('touchend', () => { jActive = false; knob.style.transform = `translate(-50%,-50%)`; P.targetRudder = 0; });
  area.addEventListener('touchcancel', () => { jActive = false; knob.style.transform = `translate(-50%,-50%)`; P.targetRudder = 0; });
}

// 倍速ボタンのイベントリスナー
document.getElementById('time-scale-btn')?.addEventListener('click', (e) => {
    let idx = TIME_SCALES.indexOf(timeScale);
    idx = (idx + 1) % TIME_SCALES.length;
    timeScale = TIME_SCALES[idx];
    e.target.textContent = 'x' + timeScale;
});

// ============================================================
//  マウス・タッチによる視点（カメラ）操作
// ============================================================
let isDragging = false;
let previousMouseX = 0;
let previousMouseY = 0;
const lookSensitivity = 0.25; // 視点移動の感度

window.addEventListener('mousedown', (e) => {
    isDragging = true;
    previousMouseX = e.clientX;
    previousMouseY = e.clientY;
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - previousMouseX;
    const deltaY = e.clientY - previousMouseY;

    // 視点操作の反転（+=に戻す）
    camOffset.yaw   += deltaX * lookSensitivity; 
    camOffset.pitch += deltaY * lookSensitivity; 
    
    // 見回せる限界角度（真後ろや真上を見すぎないように）
    camOffset.yaw = Math.max(-130, Math.min(130, camOffset.yaw));
    camOffset.pitch = Math.max(-45, Math.min(45, camOffset.pitch));

    previousMouseX = e.clientX;
    previousMouseY = e.clientY;
});

window.addEventListener('mouseup', () => { isDragging = false; });

// --- ここから追加：PC用ダブルクリックで視点リセット ---
window.addEventListener('dblclick', () => {
    camOffset.yaw = 0;
    camOffset.pitch = 0;
});
// --- ここまで追加 ---

// スマホのタッチ操作も同じ向きに修正
let lastTouchTime = 0; // ダブルタップ判定用の変数を追加

window.addEventListener('touchstart', (e) => {
    // ダブルタップ判定（300ミリ秒以内に2回タッチされたらリセット）
    const now = Date.now();
    if (now - lastTouchTime < 300) {
        camOffset.yaw = 0;
        camOffset.pitch = 0;
    }
    lastTouchTime = now;

    // 既存のドラッグ開始処理
    isDragging = true;
    previousMouseX = e.touches[0].clientX;
    previousMouseY = e.touches[0].clientY;
});
window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const deltaX = e.touches[0].clientX - previousMouseX;
    const deltaY = e.touches[0].clientY - previousMouseY;
    
    camOffset.yaw   += deltaX * lookSensitivity * 1.5; 
    camOffset.pitch += deltaY * lookSensitivity * 1.5;
    
    camOffset.yaw = Math.max(-130, Math.min(130, camOffset.yaw));
    camOffset.pitch = Math.max(-45, Math.min(45, camOffset.pitch));
    
    previousMouseX = e.touches[0].clientX;
    previousMouseY = e.touches[0].clientY;
});
window.addEventListener('touchend', () => { isDragging = false; });

// ============================================================
//  天候 → Three.js 反映
// ============================================================
function applyWeatherScene(m) {
  // 基本光源リセット
  sun.intensity  = 1.6; moon.intensity = 0; amb.intensity = 0.7;
  if(sky.material.uniforms){
    sky.material.uniforms.uSkyTop.value.set(0x4488cc);
    sky.material.uniforms.uSkyHorizon.value.set(0xc0d8ee);
    sky.material.uniforms.uSunSize.value = 1200.0;
  } else { sky.material.color.set(0x5a8fb0); }
  sun.color.set(0xfff8e8);

  if (m.wx === 'ngt') {
    sun.intensity = 0.04; moon.intensity = 0.7; amb.intensity = 0.16;
    if(sky.material.uniforms){
      sky.material.uniforms.uSkyTop.value.set(0x03050d);
      sky.material.uniforms.uSkyHorizon.value.set(0x010308);
      sky.material.uniforms.uSunSize.value = 0.0;
    } else { sky.material.color.set(0x03050d); }
    fogC = 0x03050d; fogD = 0.00022;
    wu.uBaseColor.value.setHex(0x010308); 
    wu.uSkyColor.value.setHex(0x020815);
    wu.uSunColor.value.setHex(0x6688aa);
    wu.uFogColor.value.setHex(0x03050d);
    wu.uLightDir.value.copy(moon.position).normalize();
    toggleNight(scene, true);
  } else {
    toggleNight(scene, false);
  }

  if (m.wx === 'str') {
    if(sky.material.uniforms){
      sky.material.uniforms.uSkyTop.value.set(0x1a2a3a);
      sky.material.uniforms.uSkyHorizon.value.set(0x3a4a5a);
      sky.material.uniforms.uSunSize.value = 0.0;
    } else { sky.material.color.set(0x223344); }
    sun.color.set(0x7788aa); sun.intensity = 0.38;
    fogC = 0x2a3344; fogD = 0.00028;
    // 嵐の海
    wu.uBaseColor.value.setHex(0x111b24);
    wu.uSkyColor.value.setHex(0x2a3a4a);
    wu.uSunColor.value.setHex(0x7788aa);
    wu.uFogColor.value.setHex(0x2a3344);
    wu.uLightDir.value.copy(sun.position).normalize();
  }
  else if (m.wx === 'rain') {
    if(sky.material.uniforms){
      sky.material.uniforms.uSkyTop.value.set(0x2a3a4a);
      sky.material.uniforms.uSkyHorizon.value.set(0x4a5a6a);
      sky.material.uniforms.uSunSize.value = 0.0;
    } else { sky.material.color.set(0x3a4a5a); }
    sun.intensity = 0.55;
    fogC = 0x3a4a5a; fogD = 0.0004;
    wu.uBaseColor.value.setHex(0x1a2530);
    wu.uSkyColor.value.setHex(0x3a4a5a);
    wu.uFogColor.value.setHex(0x3a4a5a);
    wu.uLightDir.value.copy(sun.position).normalize();
  }
  
  // 晴天時（str/rain/ngt以外）の海デフォルト
  if (!['str','rain','ngt'].includes(m.wx)) {
    wu.uBaseColor.value.setHex(0x1a5070);
    wu.uSkyColor.value.setHex(0x5599cc);
    wu.uSunColor.value.setHex(0xfff8e8);
    wu.uFogColor.value.setHex(0xb8d0e0);
    wu.uLightDir.value.copy(sun.position).normalize();
  }

  // 霧の上書き（濃霧ミッションなど）
  if (m.fog > 0.4) {
    fogD = 0.0009 + m.fog * 0.0022; fogC = 0xaabbc8;
    wu.uLightColor.value.setHex(0xaaaaaa);
  } else if (m.fog > 0) {
    fogD = 0.00016 + m.fog * 0.001; fogC = 0x8fb5cc;
  }

  // シーン全体と海シェーダーの両方にフォグを適用
  scene.fog = new THREE.FogExp2(fogC, fogD);
  wu.uFogColor.value.setHex(fogC);
  wu.uFogDensity.value = fogD;

  // 波の高さと白波の設定
  wu.uWH.value   = 0.35 * m.waves;
  wu.uWS.value   = 0.55 + m.waves * 0.28;
  wu.uWind.value = m.waves;
}

// ============================================================
//  ミッション管理
// ============================================================
window.startM = function(id) {
  const m = MISSIONS.find(x => x.id === id); if (!m) return;
  curM = m;
  document.getElementById('ms-sel')?.classList.add('h');
  document.getElementById('gauges-container')?.classList.remove('h');
  document.getElementById('comp-c')?.classList.remove('h');
  document.getElementById('telegraph-panel')?.classList.remove('h');
  document.getElementById('time-scale-btn')?.classList.remove('h');

  // 物理リセット
  P.posX = m.sp.x; P.posZ = m.sp.z; P.heading = m.sp.h || 0;
  P.speed = 0; P.rudder = 0; P.yawRate = 0; P.engineOrder = 0;
  P.driftX = 0; P.driftZ = 0; P.rollAngle = 0; P.pitchAngle = 0;
  P.windSpeed = m.wind; P.windDir = 180 + Math.random() * 180;
  P.currSpeed = m.curr; P.currDir  = Math.random() * 360;
  updateTelegraph(P.engineOrder);

  // 【変更】mst.t0 を Date.now() から simTime に変更
  mst      = { done: false, t0: simTime, tugOn: false, pens: [], spdP: 0, colP: 0, penTmr: 0 };
  goActive = false;
  vhfFired = new Set();

  document.getElementById('dr')?.classList.remove('v');
  document.getElementById('go')?.classList.remove('v', 'dk');
  tugs.forEach(t => { t.active = false; t.mesh.position.set(m.tx + 100, 0, m.tz - 200); });

  applyWeatherScene(m);
  applyWeatherOverlay(m);
};

// ミッション判定
function chkMission() {
  if (!curM || mst.done) return;
  const dx   = curM.tx - P.posX, dz = curM.tz - P.posZ;
  const dist = Math.sqrt(dx*dx + dz*dz);

  if (curM.type === 'dep') {
    const sx = curM.sp.x - P.posX, sz = curM.sp.z - P.posZ;
    if (Math.sqrt(sx*sx + sz*sz) > 300 && dist < 250) { mst.done = true; _dockRes(dist, Math.abs(P.speed), 0, false); }
    return;
  }
  if (curM.type === 'wpt') {
    if (dist < 280) { mst.done = true; _dockRes(dist, Math.abs(P.speed), 0, false); }
    return;
  }

  // docking
  if (dist < 700 && !mst.tugOn) { mst.tugOn = true; tugs.forEach(t => t.active = true); }
  if (dist < 900) {
    const as  = Math.abs(P.speed);
    const aa  = Math.atan2(dx, dz);
    const ad  = Math.abs(((P.heading - aa + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 180 / Math.PI;
    if (dist < 28 && as < 1.8) { mst.done = true; _dockRes(dist, as, ad, false); }
    if (dist < 16 && as > 4.5) { triggerGO('pier'); }
  }
}

function _dockRes(dist, spd, angle, col) {
  // 【変更】Date.now() から simTime を基準にスコアタイムを計算
  const elapsed = Math.round((simTime - mst.t0) / 1000);
  const sd      = calcScore(dist, spd, angle, elapsed, col, curM);
  // ペナルティ適用
  sd.pens.push(...mst.pens);
  const pen  = (mst.spdP || 0) + (mst.colP || 0);
  if (pen > 0) { sd.total = Math.max(0, sd.total - pen); sd.pens.push(`航行ペナルティ −${pen}pt`); }
  const stars = col ? 0 : sd.total >= 88 ? 3 : sd.total >= 65 ? 2 : sd.total >= 35 ? 1 : 0;

  if (!col && curM) saveResult(curM.id, { stars, score: sd.total, dist, spd, ang: angle });

  if (!col && stars >= 1) {
    playClear();
    showDockResult(sd, stars, col, elapsed, curM);
  } else {
    showDockResult(sd, stars, col, elapsed, curM);
  }
  setTimeout(() => { drawResultRadar(sd.items, col); animScore(sd.total); }, 300);
}

// ゲームオーバー
function triggerGO(cause) {
  if (goActive || mst.done) return;
  goActive = true; mst.done = true;
  P.speed = 0; P.engineOrder = 0; updateTelegraph(P.engineOrder);
  playCrash(); setTimeout(() => playHorn(), 600);
  flashScreen('r');
  const causes = { collision: '他船との衝突', pier: '岸壁への激突', grounding: '座礁' };
  const gosub  = document.getElementById('gosub');   if (gosub)  gosub.textContent  = causes[cause] || '重大事故';
  const gocause= document.getElementById('gocause'); if (gocause) gocause.textContent = `速力: ${Math.abs(P.speed).toFixed(1)}kt | ${curM?.title || ''}`;
  const go = document.getElementById('go'); if (go) { go.classList.add('v'); setTimeout(() => go.classList.add('dk'), 100); }
}

// 衝突検知
let colCd = 0;
function checkCol() {
  if (colCd > 0) { colCd--; return; }
  const all = [
    ...AIships.map(s => ({ p: s.mesh.position, sz: s.sz || 1 })),
    ...fishBoats.map(f => ({ p: f.mesh.position, sz: 0.4 })),
  ];
  for (const { p, sz } of all) {
    const d = Math.sqrt((p.x - P.posX)**2 + (p.z - P.posZ)**2);
    if (d < 22 * sz) {
      colCd = 240;
      if (Math.abs(P.speed) > 5) { triggerGO('collision'); return; }
      mst.colP += 10; mst.pens.push('⚠ 他船接触 −10pt');
      showPenaltyToast('他船に接触！ −10pt'); playCrash(); flashScreen('r');
      return;
    }
  }
}

// ============================================================
//  AI更新
// ============================================================
function updAI(dt) {
  AIships.forEach(s => {
    const dx = P.posX - s.mesh.position.x, dz = P.posZ - s.mesh.position.z;
    if (Math.sqrt(dx*dx + dz*dz) < 400 && s.avoidTimer <= 0 && !s.isTanker) {
      s.heading += 0.04; s.avoidTimer = 200;
    }
    if (s.avoidTimer > 0) s.avoidTimer--;
    const spd = s.speed * 0.514;
    // 【修正後】自船と同じ座標系に合わせるため X の符号にマイナスをつける
    s.mesh.position.x += -Math.sin(s.heading) * spd * dt;
    s.mesh.position.z += Math.cos(s.heading) * spd * dt;
    s.mesh.rotation.y = -s.heading;
    if (s.mesh.position.z >  8000) s.mesh.position.z = -2500;
    if (s.mesh.position.z < -2500) s.mesh.position.z =  8000;
    if (s.mesh.position.x >  5000) s.mesh.position.x = -3500;
    if (s.mesh.position.x < -3500) s.mesh.position.x =  5000;
  });
  fishBoats.forEach(f => {
    f.heading += f.drift;
    // 【修正後】自船と同じ座標系に合わせるため X の符号にマイナスをつける
    f.mesh.position.x += -Math.sin(f.heading) * f.speed * 0.514 * dt;
    f.mesh.position.z += Math.cos(f.heading) * f.speed * 0.514 * dt;
    f.mesh.rotation.y = -f.heading;
    if (Math.sqrt(f.mesh.position.x**2 + f.mesh.position.z**2) > 2500)
      f.heading += Math.PI + (Math.random() * 0.6 - 0.3);
  });
}

function updTugs(dt) {
  tugs.forEach(tg => {
    if (!tg.active) return;
    const tx = P.posX + Math.cos(P.heading)*tg.ox - Math.sin(P.heading)*tg.oz;
    const tz = P.posZ + Math.sin(P.heading)*tg.ox + Math.cos(P.heading)*tg.oz;
    tg.mesh.position.x += (tx - tg.mesh.position.x) * 0.035;
    tg.mesh.position.z += (tz - tg.mesh.position.z) * 0.035;
    tg.mesh.rotation.y = -Math.atan2(P.posX - tg.mesh.position.x, P.posZ - tg.mesh.position.z);
  });
}

// 速力ペナルティ
let penTmr2 = 0;
function checkSpdPen() {
  if (!curM || mst.done || penTmr2 > 0) { if (penTmr2 > 0) penTmr2--; return; }
  const dx = curM.tx - P.posX, dz = curM.tz - P.posZ;
  if (Math.sqrt(dx*dx + dz*dz) < 600 && P.speed > 9) {
    mst.spdP += 3; penTmr2 = 200; mst.pens.push('⚠ 港近傍速力超過 −3pt');
    showPenaltyToast('港近傍 速力超過 −3pt');
  }
}

// ============================================================
//  3D シーン更新
// ============================================================
function upd3D(t) {
  ocean.position.x = P.posX; ocean.position.z = P.posZ;
  wu.uOffset.value.set(P.posX, P.posZ); // 追加: 波のシェーダーに船の位置を渡す
  const wa = curM ? curM.waves : 1;

  shipGroup.position.set(P.posX, 0, P.posZ);
  shipGroup.rotation.z = P.rollAngle;
  shipGroup.rotation.x = P.pitchAngle;
  shipGroup.rotation.y = -P.heading;

  // --- 上部で設定したブリッジ視点を毎フレーム反映 ---
  // scene.js で計算されたスケール倍率（P.shipScale）を掛ける
  const s = P.shipScale || 1.0; 

  // ★ファイル先頭の bridgeXPos, bridgeHeight, bridgeZPos を使用するように修正！
  camera.position.set(bridgeXPos * s, bridgeHeight * s, bridgeZPos * s);

  // カメラの向き
  const yr = camOffset.yaw   * Math.PI / 180;
  const pr = camOffset.pitch * Math.PI / 180;
  camera.rotation.order = 'YXZ';
  camera.rotation.y = Math.PI + yr;
  camera.rotation.x = pr;
  // --- ここまで ---

  if (curM?.wx === 'ngt') {
    const fl = 0.82 + Math.sin(t * 0.003) * 0.18;
    navL.mast.intensity = 3.8 * fl;
  }

  prop.rotation.x += P.speed * 0.06;
  buoys.forEach((b, i) => b.position.y = Math.sin(t * 0.0012 + i * 0.8) * 0.35);
  sky.position.set(P.posX, 0, P.posZ);
}

// ============================================================
//  ミッション選択UI
// ============================================================
function buildSel() {
  const stats = getStats();
  document.getElementById('sc0').textContent = stats.cleared;
  document.getElementById('sc1').textContent = stats.totalStar;
  document.getElementById('sc2').textContent = stats.bestScore ?? '--';
  document.getElementById('sc3').textContent = stats.avgScore  ?? '--';

  ['g3','g2','g1','gc'].forEach(gid => {
    const el = document.getElementById(gid); if (!el) return;
    el.innerHTML = '';
    MISSIONS.filter(m => m.g === gid).forEach(m => {
      const sv  = SAVE[m.id] || {};
      const st  = sv.stars || 0, sc = sv.score || 0, pl = sv.plays || 0;
      const dcol = m.diff === 3 ? '#ff6644' : m.diff === 2 ? '#ffcc00' : '#00ff88';
      const wi   = { day:'☀', ngt:'🌙', fog:'🌫', str:'⛈', rain:'🌧' }[m.wx] || '☀';
      const ti   = { dock:'⚓', dep:'⛵', wpt:'📍' }[m.type] || '';
      const div  = document.createElement('div');
      div.className = 'mc';
      div.innerHTML = `
        <div class="mc-n">M${m.id}${pl ? ` · ${pl}回` : ''}</div>
        ${st ? `<div class="mc-st">${'★'.repeat(st)+'☆'.repeat(3-st)}</div>` : ''}
        <div class="mc-ti">${ti} ${m.title}</div>
        <div class="mc-ar">${m.area}</div>
        <div class="mc-df" style="color:${dcol}">${'●'.repeat(m.diff)+'○'.repeat(3-m.diff)}</div>
        <div class="mc-ds">${wi} ${m.story[0]}</div>
        ${sc ? `<div class="mc-sc">BEST ${sc}pt</div>` : ''}`;
      div.onclick = () => startM(m.id);
      el.appendChild(div);
    });
  });
}

window.goSel = function() {
  document.getElementById('dr')?.classList.remove('v');
  document.getElementById('go')?.classList.remove('v', 'dk');
  document.getElementById('ms-sel')?.classList.remove('h');
  document.getElementById('gauges-container')?.classList.add('h');
  document.getElementById('comp-c')?.classList.add('h');
  document.getElementById('telegraph-panel')?.classList.add('h');
  document.getElementById('time-scale-btn')?.classList.add('h');
  buildSel();
};
window.retry = function() { if (curM) startM(curM.id); };

// ============================================================
//  メインループ
// ============================================================
let lastT = -1, running = false;

function loop(t) {
  requestAnimationFrame(loop);
  if (!running) return;
  if (lastT < 0) { lastT = t; simTime = t; return; }
  
  const dt = Math.min((t - lastT) / 1000, 0.05); 
  lastT = t;

  // 【修正】forループをやめ、スケールされた時間(scaledDt)を一括で計算する
  const scaledDt = dt * timeScale;
  simTime += scaledDt * 1000; // ゲーム内仮想時間を進める

  // 【修正】物理演算に timeScale を渡し、他船の演算には scaledDt を渡す
  updatePhysics(dt, curM ? curM.waves : 1, goActive, simTime, timeScale);
  updAI(scaledDt); 
  updTugs(scaledDt);

  // 3Dとアニメーションの更新
  wu.uT.value = simTime * 0.001;
  upd3D(simTime);

  // HUD
  updateCompass(P.heading);
  drawRudder(P.rudder);
  
  // ダッシュボード
  updateDashboard(P, simTime, curM, mst);

  // サウンド
  if (audioReady()) updateEngineSound(P.engineOrder);

  // 雨
  if (curM && (curM.wx === 'str' || curM.wx === 'rain')) drawRain();

  // ツール画面
  if (isToolOpen()) drawTools(P, AIships, fishBoats, buoys, curM);

  // ミッション
  if (curM && !mst.done) { chkMission(); checkCol(); checkSpdPen(); }

  renderer.render(scene, camera);
}

// ============================================================
//  リサイズ
// ============================================================
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  rainCv.width = innerWidth; rainCv.height = innerHeight;
});

// ============================================================
//  起動シーケンス
// ============================================================
(function boot() {
  const bar = document.getElementById('ldb'), msg = document.getElementById('ldm');
  const steps = [
    [450, 'LOADING SHADERS...',    18],
    [700, 'BUILDING TOKYO BAY...', 45],
    [600, 'PLACING TRAFFIC...',    68],
    [500, 'CALIBRATING...',        88],
    [400, 'READY.',               100],
  ];
  let i = 0;
  function nx() {
    if (i >= steps.length) {
      try {
        document.getElementById('loading')?.classList.add('h');
        buildSel();
        initTouch();
        document.addEventListener('click',      () => initAudio(), { once: true });
        document.addEventListener('touchstart', () => initAudio(), { once: true });
        running = true;
        requestAnimationFrame(loop);
      } catch (e) {
        if (msg) msg.textContent = 'ERROR: ' + e.message;
        console.error(e);
      }
      return;
    }
    const [d, t2, p] = steps[i++];
    setTimeout(() => { if (msg) msg.textContent = t2; if (bar) bar.style.width = p + '%'; nx(); }, d);
  }
  nx();
})();