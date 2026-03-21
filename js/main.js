'use strict';
// ============================================================
//  main.js — エントリーポイント
//  v5.0: モジュール分割・Proceduralテクスチャ版
// ============================================================

import * as THREE     from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { MISSIONS, SAVE, saveResult, getStats } from './missions.js';
import { P, ENG_LABELS, ENG_RATIOS, initInput, keys, camOffset, updatePhysics, calcScore } from './physics.js';
import { initAudio, updateEngineSound, playHorn, playCrash, playVHF, playClear, isReady as audioReady } from './audio.js';
import { buildScene, buildOcean, buildShip, buildWorld, buildAI } from './scene.js';
import { drawRudder, drawRadar, updateCompass, updateMainHUD, updateTelegraph,
         setDockBar, showPenaltyToast, showVHF, flashScreen, showMissionBanner,
         drawResultRadar, animScore, showDockResult, applyWeatherOverlay } from './hud.js';
import { isToolOpen, toggleTool, drawAll as drawTools } from './tools.js';

// ============================================================
//  Three.js セットアップ
// ============================================================
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('cv'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping      = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 22000);

const { scene, sky, sun, amb, moon } = buildScene(THREE);
const { ocean, wu }                   = buildOcean(THREE, scene);
const { shipGroup, prop, navL }       = buildShip(THREE, scene);
const { buoys }                       = buildWorld(THREE, scene);
const { AIships, fishBoats, tugs }    = buildAI(THREE, scene);

// --- ブリッジ視点（ファーストパーソン）設定 ---
// ★ここの数値を変更するだけで、ゲーム中ずっと反映されるように整理しました！
shipGroup.add(camera);
const bridgeXPos   = -200;     // ★左右の位置（マイナスで右、プラスで左にずれます）
const bridgeHeight = 225;   // ★高さ（上への移動）
const bridgeZPos   = 210;   // ★前後位置（マイナス方向が後ろ、プラス方向が前）
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

// ============================================================
//  キー入力 & タッチ
// ============================================================
initInput();

window.addEventListener('keydown', e => {
  if (e.key === 'w' || e.key === 'W') { P.engineOrder = Math.min(P.engineOrder + 1, 3);  updateTelegraph(P.engineOrder); }
  if (e.key === 's' || e.key === 'S') { P.engineOrder = Math.max(P.engineOrder - 1, -3); updateTelegraph(P.engineOrder); }
  if (e.key === 'e' || e.key === 'E') { P.engineOrder = 0; updateTelegraph(P.engineOrder); }
  if (e.key === 'h' || e.key === 'H') { initAudio(); playHorn(); }
  if (e.key === 'm' || e.key === 'M') goSel();
  if (e.key === 't' || e.key === 'T') toggleTool();
});

function initTouch() {
  document.getElementById('tbu')?.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); P.engineOrder = Math.min(P.engineOrder + 1, 3);  updateTelegraph(P.engineOrder); }, { passive: false });
  document.getElementById('tbd')?.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); P.engineOrder = Math.max(P.engineOrder - 1, -3); updateTelegraph(P.engineOrder); }, { passive: false });
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
  const te = e => {
    e.preventDefault(); jActive = false; P.rudder = 0;
    knob.style.left = (stick.clientWidth  / 2 - 20) + 'px';
    knob.style.top  = (stick.clientHeight / 2 - 20) + 'px';
  };
  area.addEventListener('touchend',   te, { passive: false });
  area.addEventListener('touchcancel',te, { passive: false });
}

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

    // ★修正：引き算（-=）だと逆になってしまうため、足し算（+=）に戻すことで
    // 「右にドラッグすると左を向く（空間を引っ張る操作感）」になります
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
  sun.intensity  = 1.2; moon.intensity = 0; amb.intensity = 0.6;
  sky.material.color.set(0x5a8fb0); sun.color.set(0xfff4e0);
  scene.fog = new THREE.FogExp2(0x8fb5cc, 0.00012);
  navL.mast.intensity = 0.5; navL.green.intensity = 0.8; navL.red.intensity = 0.8;

  if (m.wx === 'ngt') {
    sun.intensity = 0.04; moon.intensity = 0.7; amb.intensity = 0.16;
    sky.material.color.set(0x03050d);
    scene.fog = new THREE.FogExp2(0x03050d, 0.00022);
    navL.mast.intensity = 3.8; navL.green.intensity = 2.8; navL.red.intensity = 2.8;
  }
  if (m.wx === 'str') {
    sky.material.color.set(0x223344); sun.color.set(0x7788aa); sun.intensity = 0.38;
    scene.fog = new THREE.FogExp2(0x2a3344, 0.00028);
  }
  if (m.wx === 'rain') { sky.material.color.set(0x3a4a5a); sun.intensity = 0.55; }
  if (m.fog > 0.4) scene.fog = new THREE.FogExp2(0xaabbc8, 0.0009 + m.fog * 0.0022);
  else if (m.fog > 0) scene.fog = new THREE.FogExp2(0x8fb5cc, 0.00016 + m.fog * 0.001);

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

  // 物理リセット
  P.posX = m.sp.x; P.posZ = m.sp.z; P.heading = m.sp.h || 0;
  P.speed = 0; P.rudder = 0; P.yawRate = 0; P.engineOrder = 0;
  P.driftX = 0; P.driftZ = 0; P.rollAngle = 0; P.pitchAngle = 0;
  P.windSpeed = m.wind; P.windDir = 180 + Math.random() * 180;
  P.currSpeed = m.curr; P.currDir  = Math.random() * 360;
  updateTelegraph(P.engineOrder);

  mst      = { done: false, t0: Date.now(), tugOn: false, pens: [], spdP: 0, colP: 0, penTmr: 0 };
  goActive = false;
  vhfFired = new Set();

  document.getElementById('dr')?.classList.remove('v');
  document.getElementById('go')?.classList.remove('v', 'dk');
  document.getElementById('dg')?.classList.add('h');
  document.getElementById('vhf')?.classList.add('h');
  document.getElementById('msb')?.classList.remove('v');
  document.getElementById('wi')?.classList.add('h');
  tugs.forEach(t => { t.active = false; t.mesh.position.set(m.tx + 100, 0, m.tz - 200); });

  applyWeatherScene(m);
  applyWeatherOverlay(m);

  // ミッションHUD
  const mr = document.getElementById('mr'); if (mr) mr.textContent = `${m.rank} / M${m.id}`;
  const mt = document.getElementById('mt'); if (mt) mt.textContent = m.title;
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const wnd = document.getElementById('wnd'); if (wnd) wnd.textContent = `${dirs[Math.round(P.windDir/22.5)%16]} ${m.wind}kt`;
  const cur = document.getElementById('cur'); if (cur) cur.textContent = `${dirs[Math.round(P.currDir/22.5)%16]} ${m.curr}kt`;

  // VHFキュー
  vhfQ = [
    { d: 4500, msg: m.story[0] },
    { d: 2000, msg: `速力8ノット以下に減速。水先案内人が接近中。` },
    { d: 800,  msg: `残り800m。タグボート支援開始。速力4ノット以下。` },
    { d: 300,  msg: `残り300m。機関後進用意。慎重に接岸。` },
  ];

  setTimeout(() => showVHF(`M${m.id} — ${m.title}。${m.story[0]}`, m.ch), 1600);
};

// ミッション判定
function chkMission() {
  if (!curM || mst.done) return;
  const dx   = curM.tx - P.posX, dz = curM.tz - P.posZ;
  const dist = Math.sqrt(dx*dx + dz*dz);

  // VHF
  vhfQ.forEach((q, i) => {
    if (!vhfFired.has(i) && dist <= q.d) { vhfFired.add(i); showVHF(q.msg, curM.ch); playVHF(); }
  });

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
    document.getElementById('dg')?.classList.remove('h');
    const as  = Math.abs(P.speed);
    const aa  = Math.atan2(dx, dz);
    const ad  = Math.abs(((P.heading - aa + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 180 / Math.PI;
    setDockBar(0, Math.max(0, Math.min(100, (1 - dist / 900) * 100)), dist < 60 ? 'g' : dist < 200 ? 'w' : 'b', Math.round(dist) + 'm');
    setDockBar(1, Math.max(0, (1 - as / 8) * 100), as < 1 ? 'g' : as < 3 ? 'w' : 'b', as.toFixed(1) + 'kt');
    setDockBar(2, Math.max(0, (1 - ad / 90) * 100), ad < 15 ? 'g' : ad < 35 ? 'w' : 'b', ad.toFixed(0) + '°');
    if (dist < 28 && as < 1.8) { mst.done = true; _dockRes(dist, as, ad, false); }
    if (dist < 16 && as > 4.5) { triggerGO('pier'); }
  }
}

function _dockRes(dist, spd, angle, col) {
  const elapsed = Math.round((Date.now() - mst.t0) / 1000);
  const sd      = calcScore(dist, spd, angle, elapsed, col, curM);
  // ペナルティ適用
  sd.pens.push(...mst.pens);
  const pen  = (mst.spdP || 0) + (mst.colP || 0);
  if (pen > 0) { sd.total = Math.max(0, sd.total - pen); sd.pens.push(`航行ペナルティ −${pen}pt`); }
  const stars = col ? 0 : sd.total >= 88 ? 3 : sd.total >= 65 ? 2 : sd.total >= 35 ? 1 : 0;

  if (!col && curM) saveResult(curM.id, { stars, score: sd.total, dist, spd, ang: angle });

  if (!col && stars >= 1) {
    playClear();
    showMissionBanner();
    setTimeout(() => showDockResult(sd, stars, col, elapsed, curM), 2900);
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
      document.getElementById('cw')?.classList.add('v');
      setTimeout(() => document.getElementById('cw')?.classList.remove('v'), 2000);
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
    s.mesh.position.x += Math.sin(s.heading) * spd * dt;
    s.mesh.position.z += Math.cos(s.heading) * spd * dt;
    s.mesh.rotation.y = -s.heading;
    if (s.mesh.position.z >  8000) s.mesh.position.z = -2500;
    if (s.mesh.position.z < -2500) s.mesh.position.z =  8000;
    if (s.mesh.position.x >  5000) s.mesh.position.x = -3500;
    if (s.mesh.position.x < -3500) s.mesh.position.x =  5000;
  });
  fishBoats.forEach(f => {
    f.heading += f.drift;
    f.mesh.position.x += Math.sin(f.heading) * f.speed * 0.514 * dt;
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
  const wa = curM ? curM.waves : 1;

  shipGroup.position.set(P.posX, 0, P.posZ);
  shipGroup.rotation.z = P.rollAngle;
  shipGroup.rotation.x = P.pitchAngle;
  shipGroup.rotation.y = -P.heading;

  // --- 上部で設定したブリッジ視点を反映 ---
  camera.position.set(bridgeXPos, bridgeHeight, bridgeZPos);

  const yr = camOffset.yaw   * Math.PI / 180;
  const pr = camOffset.pitch * Math.PI / 180;

  camera.rotation.order = 'YXZ';
  camera.rotation.y = Math.PI + yr;
  
  // 修正後（正面を向くようにする）
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
  if (lastT < 0) { lastT = t; return; }
  const dt = Math.min((t - lastT) / 1000, 0.05); lastT = t;

  wu.uT.value = t * 0.001;
  updatePhysics(dt, curM ? curM.waves : 1, goActive);
  updAI(dt); updTugs(dt);
  upd3D(t);

  // HUD
  updateCompass(P.heading);
  updateMainHUD(P, curM);
  drawRudder(P.rudder);
  drawRadar(P.posX, P.posZ, AIships, fishBoats, curM);

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
