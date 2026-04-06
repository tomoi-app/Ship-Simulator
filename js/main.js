'use strict';
// ============================================================
//  main.js — エントリーポイント
// ============================================================

import * as THREE     from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { MISSIONS, SAVE, saveResult, getStats } from './missions.js';
import { P, ENG_LABELS, ENG_RATIOS, initInput, keys, camOffset, updatePhysics, calcScore } from './physics.js';
import { initAudio, updateEngineSound, playHorn, playCrash, playVHF, playClear, isReady as audioReady } from './audio.js';
import { buildScene, buildOcean, buildShip, buildWorld, buildAI, toggleNight, buildLandmass, buildCity } from './scene.js';
import {
  drawRudder, updateCompass, updateTelegraph,
  showPenaltyToast, flashScreen,
  drawResultRadar, animScore, showDockResult, applyWeatherOverlay, updateDashboard,
  updateNavData
} from './hud.js';
import { initTools, isToolOpen, toggleTool, drawAll as drawTools, getRealDepthAt, startFreeModeSelection, latLonToXZ } from './tools.js';

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
const { shipGroup, prop, navLights } = buildShip(THREE, scene);
const { buoys }                       = buildWorld(THREE, scene);
const { AIships, fishBoats, tugs, wakeUniforms } = buildAI(THREE, scene);
buildLandmass(THREE, scene);
buildCity(THREE, scene);

// --- ブリッジ視点（ファーストパーソン）設定 ---
shipGroup.add(camera);
const bridgeXPos   = -13;     // 左右
const bridgeHeight = 10;      // 高さ
const bridgeZPos   = 9.7;     // 前後位置
camera.position.set(bridgeXPos, bridgeHeight, bridgeZPos);

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

const gameGroup = new THREE.Group();
gameGroup.name = 'gameGroup';
scene.add(gameGroup);

function reparentToGameGroup() {
  const keep = new Set([sky, ocean, gameGroup]);
  scene.children.slice().forEach(c => {
    if (keep.has(c)) return;
    if (c.isLight) return;
    scene.remove(c);
    gameGroup.add(c);
  });
}
requestAnimationFrame(reparentToGameGroup);

function setMenuState(isMenuMode) {
  gameGroup.visible = !isMenuMode;
}

// ============================================================
//  カメラ切り替えUI（ドローン視点 / ブリッジ視点）
// ============================================================
export let cameraMode = 'bridge'; 

const camBtn = document.createElement('div');
camBtn.id = 'camera-btn';
// ★修正：一眼レフカメラ風のSVGアイコン
const camIcon = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px;">
  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
  <path d="M16 7L14 3h-4L8 7"></path>
  <circle cx="12" cy="14" r="5"></circle>
  <circle cx="12" cy="14" r="2"></circle>
</svg>`;
camBtn.innerHTML = camIcon + 'BRIDGE';
Object.assign(camBtn.style, {
  position: 'absolute',
  top: '70px', 
  right: '20px',
  width: '110px',
  height: '35px',
  backgroundColor: 'rgba(15, 25, 35, 0.85)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderLeft: '4px solid #6baed6',
  color: '#ffffff',
  fontSize: '13px',
  fontWeight: 'bold',
  display: 'none', // メニュー中は非表示
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  zIndex: '400',
  borderRadius: '4px',
  userSelect: 'none',
  boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
  transition: 'all 0.2s ease'
});
document.body.appendChild(camBtn);

camBtn.addEventListener('click', () => {
  if (cameraMode === 'bridge') {
    cameraMode = 'drone';
    camBtn.innerHTML = camIcon + 'DRONE';
    camBtn.style.borderLeft = '4px solid #dcb982';
    camBtn.style.color = '#dcb982';
  } else {
    cameraMode = 'bridge';
    camBtn.innerHTML = camIcon + 'BRIDGE';
    camBtn.style.borderLeft = '4px solid #6baed6';
    camBtn.style.color = '#ffffff';
  }
  camOffset.yaw = 0;
  camOffset.pitch = 0;
});


// ============================================================
//  ミッション状態
// ============================================================
let curM      = null;
let goActive  = false;
let mst       = { done: false, t0: 0, tugOn: false, pens: [], spdP: 0, colP: 0, penTmr: 0 };
let vhfQ      = [];
let vhfFired  = new Set();

let timeScale = 1;                   
const TIME_SCALES = [1, 2, 4, 8];    
let simTime = 0;                     

// ============================================================
//  キー入力 & タッチ
// ============================================================
initInput();

window.addEventListener('keydown', e => {
  if (isMenu) return;

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
    P.targetRudder = (dx / JR) * 35;
  }, { passive: false });
  area.addEventListener('touchend', () => {
    jActive = false;
    knob.style.left = (stick.clientWidth  / 2 - 20) + 'px';
    knob.style.top  = (stick.clientHeight / 2 - 20) + 'px';
    P.targetRudder = 0;
  });
  area.addEventListener('touchcancel', () => {
    jActive = false;
    knob.style.left = (stick.clientWidth  / 2 - 20) + 'px';
    knob.style.top  = (stick.clientHeight / 2 - 20) + 'px';
    P.targetRudder = 0;
  });
}

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
const lookSensitivity = 0.25; 

window.addEventListener('mousedown', (e) => {
    isDragging = true;
    previousMouseX = e.clientX;
    previousMouseY = e.clientY;
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - previousMouseX;
    const deltaY = e.clientY - previousMouseY;

    camOffset.yaw   += deltaX * lookSensitivity; 
    camOffset.pitch += deltaY * lookSensitivity; 
    
    camOffset.yaw = Math.max(-130, Math.min(130, camOffset.yaw));
    camOffset.pitch = Math.max(-45, Math.min(45, camOffset.pitch));

    previousMouseX = e.clientX;
    previousMouseY = e.clientY;
});

window.addEventListener('mouseup', () => { isDragging = false; });
window.addEventListener('dblclick', () => { camOffset.yaw = 0; camOffset.pitch = 0; });

let lastTouchTime = 0; 
window.addEventListener('touchstart', (e) => {
    const now = Date.now();
    if (now - lastTouchTime < 300) { camOffset.yaw = 0; camOffset.pitch = 0; }
    lastTouchTime = now;
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
  sun.intensity  = 1.6; moon.intensity = 0; amb.intensity = 0.7;
  if(sky.material.uniforms){
    sky.material.uniforms.uZenith.value.set(0x1a5fa8);
    sky.material.uniforms.uMidsky.value.set(0x4899cc);
    sky.material.uniforms.uHorizon.value.set(0xc4dff0);
    sky.material.uniforms.uSunIntensity.value = 1.0;
  } else { sky.material.color.set(0x5a8fb0); }
  sun.color.set(0xfff8e8);

  let fogC = 0xaac8dc; 
  let fogD = 0.000075;

  if (m.wx === 'str') {
    if(sky.material.uniforms){
      sky.material.uniforms.uZenith.value.set(0x111e2a);
      sky.material.uniforms.uMidsky.value.set(0x1e3040);
      sky.material.uniforms.uHorizon.value.set(0x3a4a5a);
      sky.material.uniforms.uSunIntensity.value = 0.0;
    } else { sky.material.color.set(0x223344); }
    sun.color.set(0x7788aa); sun.intensity = 0.38;
    fogC = 0x2a3344; fogD = 0.00028;
    wu.uDeepColor.value.setHex(0x0a1520);
    wu.uShallowColor.value.setHex(0x122030);
    wu.uSkyZenith.value.setHex(0x1a2a3a);
    wu.uSkyHorizon.value.setHex(0x3a4a5a);
    wu.uSunColor.value.setHex(0x556677);
    wu.uFogColor.value.setHex(0x2a3344);
    wu.uFogDensity.value = 0.00025;
    wu.uSunDir.value.copy(sun.position).normalize();
  }
  else if (m.wx === 'rain') {
    if(sky.material.uniforms){
      sky.material.uniforms.uZenith.value.set(0x222e3a);
      sky.material.uniforms.uMidsky.value.set(0x344455);
      sky.material.uniforms.uHorizon.value.set(0x4a5a6a);
      sky.material.uniforms.uSunIntensity.value = 0.0;
    } else { sky.material.color.set(0x3a4a5a); }
    sun.intensity = 0.55;
    fogC = 0x3a4a5a; fogD = 0.0004;
    wu.uDeepColor.value.setHex(0x111e28);
    wu.uSkyZenith.value.setHex(0x222e3a);
    wu.uSkyHorizon.value.setHex(0x4a5a6a);
    wu.uSunColor.value.setHex(0x7788aa);
    wu.uFogColor.value.setHex(0x3a4a5a);
    wu.uFogDensity.value = 0.0004;
    wu.uSunDir.value.copy(sun.position).normalize();
  }
  
  if (!['str','rain','ngt'].includes(m.wx)) {
    wu.uDeepColor.value.setHex(0x020c15);     
    wu.uShallowColor.value.setHex(0x0a222b);  
    wu.uSkyZenith.value.setHex(0x3a6a8f);     
    wu.uSkyHorizon.value.setHex(0xa6c3d9);    
    wu.uSunColor.value.setHex(0xfff2da);      
    wu.uFogColor.value.setHex(0xa6c3d9);      
    wu.uFogDensity.value = 0.00035;           
    wu.uSunDir.value.copy(sun.position).normalize();
  }

  if (m.fog > 0.4) {
    fogD = 0.0009 + m.fog * 0.0022; fogC = 0xaabbc8;
  } else if (m.fog > 0) {
    fogD = 0.00016 + m.fog * 0.001; fogC = 0x8fb5cc;
  }

  scene.fog = new THREE.FogExp2(fogC, fogD);
  wu.uFogColor.value.setHex(fogC);
  wu.uFogDensity.value = fogD;

  wu.uWH.value   = 0.06 * m.waves;        
  wu.uWS.value   = 0.40 + m.waves * 0.15; 
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
  
  // ★ ドローンボタンを表示
  camBtn.style.display = 'flex';

  setMenuState(false);

  P.posX = m.sp.x; P.posZ = m.sp.z; P.heading = m.sp.h || 0;
  P.speed = 0; P.rudder = 0; P.yawRate = 0; P.engineOrder = 0;
  P.driftX = 0; P.driftZ = 0; P.rollAngle = 0; P.pitchAngle = 0;
  P.windSpeed = m.wind; 
  P.windDir   = 180 + Math.random() * 180;
  P.currSpeed = m.curr; 
  P.currDir   = Math.random() * 360;
  curM.windDir0 = P.windDir;
  curM.currDir0 = P.currDir;
  updateTelegraph(P.engineOrder);

  mst      = { done: false, t0: simTime, tugOn: false, pens: [], spdP: 0, colP: 0, penTmr: 0 };
  goActive = false;
  vhfFired = new Set();

  document.getElementById('dr')?.classList.remove('v');
  document.getElementById('go')?.classList.remove('v', 'dk');
  tugs.forEach(t => { t.active = false; t.mesh.position.set(m.tx + 100, 0, m.tz - 200); });

  applyWeatherScene(m);
  applyWeatherOverlay(m);
  
  toggleNight(scene, m.wx === 'ngt');
  isMenu = false;
};

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
  const elapsed = Math.round((simTime - mst.t0) / 1000);
  const sd      = calcScore(dist, spd, angle, elapsed, col, curM);
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

let colCd = 0;
let _ukcWarnCd = 0; 
function checkCol() {
  if (colCd > 0) { colCd--; return; }

  const selfRadius = 30;

  const all = [
    ...AIships.map(s => ({ p: s.mesh.position, sz: s.sz || 1, isTanker: !!s.isTanker })),
    ...fishBoats.map(f => ({ p: f.mesh ? f.mesh.position : f.position, sz: 0.4, isTanker: false })),
  ];

  for (const { p, sz, isTanker } of all) {
    const otherRadius = isTanker ? 140 : 25 * sz;
    const threshold   = selfRadius + otherRadius;

    const dx = p.x - P.posX;
    const dz = p.z - P.posZ;
    const d  = Math.sqrt(dx * dx + dz * dz);

    if (d < threshold) {
      colCd = 240; 
      const relSpd = Math.abs(P.speed);
      if (relSpd > 3.0) {
        triggerGO('collision');
        return;
      }
      mst.colP += 10;
      mst.pens.push('⚠ 他船接触 −10pt');
      showPenaltyToast('他船に接触！ −10pt');
      playCrash();
      flashScreen('r');
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
    if (s.mesh.position.x >  3500) s.mesh.position.x = -5000; 
    if (s.mesh.position.x < -5000) s.mesh.position.x =  3500;
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
    tg.mesh.position.x += (-tx - tg.mesh.position.x) * 0.035; 
    tg.mesh.position.z += (tz - tg.mesh.position.z) * 0.035;
    tg.mesh.rotation.y = -Math.atan2(-P.posX - tg.mesh.position.x, P.posZ - tg.mesh.position.z); 
  });
}

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
  ocean.position.x = -P.posX; 
  ocean.position.z = P.posZ;
  wu.uOffset.value.set(P.posX, P.posZ); 

  shipGroup.position.set(-P.posX, 0, P.posZ); 
  shipGroup.rotation.z = P.rollAngle;
  shipGroup.rotation.x = P.pitchAngle;
  shipGroup.rotation.y = -P.heading;

  // ★修正: カメラ位置の動的切り替え（ドローン視点位置の修正）
  const s = P.shipScale || 1.0; 
  if (cameraMode === 'bridge') {
    camera.position.set(bridgeXPos * s, bridgeHeight * s, bridgeZPos * s);
    const yr = camOffset.yaw   * Math.PI / 180;
    const pr = camOffset.pitch * Math.PI / 180;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = Math.PI + yr;
    camera.rotation.x = pr;
  } else {
    // 🚁 ドローン視点（★修正: ブリッジより後方上空に配置）
    camera.position.set(0, 180 * s, -100 * s); 
    const yr = camOffset.yaw   * Math.PI / 180;
    // デフォルトで少し見下ろす角度（-15度）にする
    const pr = (camOffset.pitch - 15) * Math.PI / 180; 
    camera.rotation.order = 'YXZ';
    camera.rotation.y = Math.PI + yr;
    camera.rotation.x = pr;
  }

  if (curM?.wx === 'ngt' && navLights && navLights.mast) {
    const fl = 0.82 + Math.sin(t * 0.003) * 0.18;
    navLights.mast.intensity = 3.8 * fl;
  }

  prop.rotation.x += P.speed * 0.06;
  buoys.forEach((b, i) => b.position.y = Math.sin(t * 0.0012 + i * 0.8) * 0.35);
  sky.position.set(-P.posX, 0, P.posZ); 
}

// ============================================================
//  ミッション選択UI
// ============================================================
window.currentMode = 'free'; 

window.showMissions = function(mode) {
  document.getElementById('mode-sel').classList.add('h');
  document.getElementById('mission-list-container').classList.remove('h');
  window.currentMode = mode;
  buildSel(); 
};

window.showModeSel = function() {
  document.getElementById('mission-list-container').classList.add('h');
  document.getElementById('mode-sel').classList.remove('h');
};

function buildSel() {

  const grid = document.getElementById('mission-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const filtered = MISSIONS.filter(m => m.mode === window.currentMode);

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="color:#a6c3d9; padding:20px; font-size:14px; letter-spacing:2px;">現在このモードでプレイ可能なミッションはありません。</div>';
    return;
  }

  filtered.forEach(m => {
    const sv  = SAVE[m.id] || {};
    const st  = sv.stars || 0, sc = sv.score || 0, pl = sv.plays || 0;
    const dcol = m.diff === 3 ? '#ff6644' : m.diff === 2 ? '#ffcc00' : '#00ff88';
    const wi   = { day:'☀', ngt:'🌙', fog:'🌫', str:'⛈', rain:'🌧' }[m.wx] || '☀';
    const ti   = { dock:'⚓', dep:'⛵', wpt:'📍' }[m.type] || '';
    const div  = document.createElement('div');
    div.className = 'mc';
    div.innerHTML = `
      <div class="mc-n">${m.id}${pl ? ` · ${pl}回` : ''}</div>
      ${st ? `<div class="mc-st">${'★'.repeat(st)+'☆'.repeat(3-st)}</div>` : ''}
      <div class="mc-ti">${ti} ${m.title}</div>
      <div class="mc-ar">${m.area}</div>
      <div class="mc-df" style="color:${dcol}">${'●'.repeat(m.diff)+'○'.repeat(3-m.diff)}</div>
      <div class="mc-ds">${wi} ${m.story[0]}</div>
      ${sc ? `<div class="mc-sc">BEST ${sc}pt</div>` : ''}`;
    div.onclick = () => startM(m.id);
    grid.appendChild(div);
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
  
  // ドローンボタンを隠す
  camBtn.style.display = 'none';

  camOffset.yaw   = 0;
  camOffset.pitch = 0;
  
  showModeSel(); 
  buildSel();

  applyWeatherScene({ wx: 'clr', waves: 0.3 }); 
  if (rainCtx) rainCtx.clearRect(0, 0, rainCv.width, rainCv.height);
  const nightOv = document.getElementById('night-ov');
  if (nightOv) nightOv.style.background = 'transparent';
  const wxOv = document.getElementById('wx-ov');
  if (wxOv) wxOv.style.background = 'transparent';

  setMenuState(true);
  isMenu = true; 
};
window.retry = function() { if (curM) startM(curM.id); };

// ============================================================
//  メインループ
// ============================================================
let lastT = -1;
let isMenu = true; 

function loop(t) {
  requestAnimationFrame(loop);
  
  if (lastT < 0) { lastT = t; simTime = t; return; }
  
  const dt = Math.min((t - lastT) / 1000, 0.05); 
  lastT = t;

  if (isMenu) {
    wu.uT.value = t * 0.001;
    renderer.render(scene, camera);
    return; 
  }

  const scaledDt = dt * timeScale;
  simTime += scaledDt * 1000;

  if (curM && !goActive) {
    const t_s = simTime * 0.0001; 
    P.windSpeed = curM.wind * (1.0 + Math.sin(t_s * 1.3) * 0.3);
    P.windDir   = (curM.windDir0 || 270) + Math.sin(t_s * 0.7) * 20;
    P.currSpeed = curM.curr * (1.0 + Math.sin(t_s * 0.9) * 0.4);
    P.currDir   = (curM.currDir0 || 0) + Math.sin(t_s * 0.5) * 15;
  }

  const subSteps = timeScale;
  const subDt    = dt / subSteps;
  for (let i = 0; i < subSteps; i++) {
    updatePhysics(subDt, curM ? curM.waves : 1, goActive, simTime, timeScale);
  }
  updAI(scaledDt); 
  updTugs(scaledDt);

  wu.uT.value = simTime * 0.001;
  wu.uShipSpeed.value = Math.max(0, P.speed) / 16.0; 
  wu.uShipPos.value.set(P.posX, P.posZ);
  wu.uShipHeading.value = P.heading; 
  if (wakeUniforms) wakeUniforms.uT.value = simTime * 0.001; 
  upd3D(simTime);

  updateCompass(P.heading);
  drawRudder(P.rudder);
  
  const shipDraft = 14.5;
  const currentDepth = getRealDepthAt(P.posX, P.posZ);
  const ukc = currentDepth - shipDraft;

  if (currentDepth < 99.0) {
    if (ukc <= 0) {
      if (Math.abs(P.speed) > 0.05 || Math.hypot(P.u, P.v) > 0.05) {
        console.error(`💥 GROUNDED! 水深 ${currentDepth.toFixed(1)}m / 喫水 ${shipDraft}m`);
        P.u = 0; P.v = 0; P.r = 0; P.speed = 0;
        triggerGO('grounding');
      }
    } else if (ukc < 3.0 && !goActive && !mst.done) {
      if (!_ukcWarnCd || _ukcWarnCd <= 0) {
        showPenaltyToast(`⚠ 浅水域！ UKC: ${ukc.toFixed(1)}m`);
        _ukcWarnCd = 180;
      }
    }
  }
  if (_ukcWarnCd > 0) _ukcWarnCd--;
  
  updateDashboard(P, simTime, curM, mst);
  updateNavData(P, curM);

  if (audioReady()) updateEngineSound(P.engineOrder);

  if (curM && (curM.wx === 'str' || curM.wx === 'rain')) drawRain();

  if (isToolOpen()) drawTools(P, AIships, fishBoats, buoys, curM);

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
// フリーモード開始 (地図上での地点選択)
// ============================================================
window.openFreeModeMenu = function() {
  document.getElementById('ms-sel')?.classList.add('h');
  
  startFreeModeSelection(P, (startLoc, goalLoc, waypoints) => {
    const m = MISSIONS.find(x => x.id === 'FREE-1');
    if (m) {
      curM = JSON.parse(JSON.stringify(m)); 
      const goalXZ = latLonToXZ(goalLoc.lat, goalLoc.lon);
      curM.tx = goalXZ.x;
      curM.tz = goalXZ.z;
      curM.waypoints = waypoints;
    }

    setMenuState(false);
    document.getElementById('gauges-container')?.classList.remove('h');
    document.getElementById('comp-c')?.classList.remove('h');
    document.getElementById('telegraph-panel')?.classList.remove('h');
    document.getElementById('time-scale-btn')?.classList.remove('h');
    
    // ドローンボタンを表示
    camBtn.style.display = 'flex';

    shipGroup.position.x = -P.posX;
    shipGroup.position.z = P.posZ;
    shipGroup.rotation.y = -P.heading;

    camera.position.x = -P.posX;
    camera.position.z = P.posZ;

    mst = { done: false, t0: simTime, tugOn: false, pens: [], spdP: 0, colP: 0, penTmr: 0 };
    isMenu = false;

    if (curM) {
      applyWeatherScene(curM);
      applyWeatherOverlay(curM);
      toggleNight(scene, curM.wx === 'ngt');
    }
    
    console.log(`FREE MODE START: FROM ${startLoc.name} TO ${goalLoc.name}`);
  });
};

// ============================================================
//  起動シーケンス
// ============================================================
(function boot() {
  const bar = document.getElementById('ldb'), msg = document.getElementById('ldm');
  const msSel = document.getElementById('ms-sel');
  
  if (msSel) msSel.classList.add('h');

  applyWeatherScene({ wx: 'clr', waves: 0.3 }); 
  setMenuState(true);

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
        if (msSel) msSel.classList.remove('h'); 
        buildSel();
        initTouch();
        document.addEventListener('click',      () => initAudio(), { once: true });
        document.addEventListener('touchstart', () => initAudio(), { once: true });
        
        isMenu = true; 
        requestAnimationFrame(loop);
        
        initTools(() => {
          console.log('ECDIS 水深データ準備完了');
        });
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

// ============================================================
//  双眼鏡機能 (Shiftキーでズーム ＆ マスク表示)
// ============================================================
const binoCv = document.createElement('canvas');
binoCv.id = 'binocular-overlay';
Object.assign(binoCv.style, {
  position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
  pointerEvents: 'none', zIndex: '450', display: 'none'
});
document.body.appendChild(binoCv);

function drawBinocularMask() {
  binoCv.width = window.innerWidth; binoCv.height = window.innerHeight;
  const ctx = binoCv.getContext('2d');
  
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, binoCv.width, binoCv.height);
  ctx.globalCompositeOperation = 'destination-out';
  
  const cy = binoCv.height / 2;
  const r = Math.min(binoCv.width * 0.25, binoCv.height * 0.45);
  const cx1 = binoCv.width / 2 - r * 0.55, cx2 = binoCv.width / 2 + r * 0.55; 
  
  ctx.filter = 'blur(15px)';
  ctx.beginPath(); ctx.arc(cx1, cy, r, 0, Math.PI * 2); ctx.arc(cx2, cy, r, 0, Math.PI * 2); ctx.fill();
  
  ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.strokeStyle = 'rgba(20, 255, 50, 0.4)'; ctx.lineWidth = 1.5;
  
  ctx.beginPath(); ctx.moveTo(binoCv.width / 2, cy - r * 0.8); ctx.lineTo(binoCv.width / 2, cy + r * 0.8);
  ctx.moveTo(binoCv.width / 2 - r * 0.8, cy); ctx.lineTo(binoCv.width / 2 + r * 0.8, cy); ctx.stroke();
  
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const y = cy + i * (r * 0.15);
    ctx.beginPath(); ctx.moveTo(binoCv.width / 2 - 8, y); ctx.lineTo(binoCv.width / 2 + 8, y); ctx.stroke();
    const x = binoCv.width / 2 + i * (r * 0.15);
    ctx.beginPath(); ctx.moveTo(x, cy - 8); ctx.lineTo(x, cy + 8); ctx.stroke();
  }
}

window.addEventListener('resize', () => { if (binoCv.style.display === 'block') drawBinocularMask(); });

let isBinocular = false, defaultFov = 60; 
window.addEventListener('keydown', (e) => {
  if (e.key === 'Shift' && !isBinocular) {
    isBinocular = true;
    if (typeof camera !== 'undefined') {
      defaultFov = camera.fov; camera.fov = 12; camera.updateProjectionMatrix();
    }
    drawBinocularMask(); binoCv.style.display = 'block';
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') {
    isBinocular = false;
    if (typeof camera !== 'undefined') { camera.fov = defaultFov; camera.updateProjectionMatrix(); }
    binoCv.style.display = 'none';
  }
});