'use strict';
// ============================================================
//  scene.js — Three.js シーン構築
//  Proceduralテクスチャで金属・コンクリート・海面を表現
// ============================================================

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
// ↓ GLTFLoader のインポートを追加します
import { GLTFLoader } from 'https://unpkg.com/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';
import { P } from './physics.js'; // ★ 倍率を P.shipScale として main.js に共有するために追加

// ============================================================
//  Procedural テクスチャ生成
// ============================================================

function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function canvasTex(canvas, wrap = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (wrap) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 4);
  }
  return t;
}

// 金属テクスチャ（船体）
export function makeMetalTexture(baseColor = '#1e1e1e') {
  const c = makeCanvas(256); const ctx = c.getContext('2d');
  ctx.fillStyle = baseColor; ctx.fillRect(0, 0, 256, 256);
  // スクラッチ・溶接跡
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const l = 10 + Math.random() * 40, a = Math.random() * Math.PI;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.strokeStyle = `rgba(${Math.random() > 0.5 ? '80,80,80' : '10,10,10'},${ 0.2 + Math.random() * 0.3})`;
    ctx.lineWidth = 0.5 + Math.random(); ctx.stroke();
  }
  // リベット
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(60,60,60,0.6)'; ctx.fill();
  }
  // ノイズ
  const id = ctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 20;
    id.data[i]     = Math.max(0, Math.min(255, id.data[i]     + n));
    id.data[i + 1] = Math.max(0, Math.min(255, id.data[i + 1] + n));
    id.data[i + 2] = Math.max(0, Math.min(255, id.data[i + 2] + n));
  }
  ctx.putImageData(id, 0, 0);
  return canvasTex(c);
}

// 赤錆テクスチャ（喫水線）
export function makeRustTexture() {
  const c = makeCanvas(256); const ctx = c.getContext('2d');
  ctx.fillStyle = '#7a1515'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 2 + Math.random() * 8;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${100 + Math.floor(Math.random()*50)},20,10,0.5)`);
    g.addColorStop(1, 'rgba(100,15,5,0)');
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
  }
  return canvasTex(c);
}

// コンクリートテクスチャ（岸壁）
export function makeConcreteTexture() {
  const c = makeCanvas(512); const ctx = c.getContext('2d');
  ctx.fillStyle = '#555550'; ctx.fillRect(0, 0, 512, 512);
  // 粒感
  const id = ctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 40;
    id.data[i]     = Math.max(0, Math.min(255, id.data[i]     + n));
    id.data[i + 1] = Math.max(0, Math.min(255, id.data[i + 1] + n));
    id.data[i + 2] = Math.max(0, Math.min(255, id.data[i + 2] + n));
  }
  ctx.putImageData(id, 0, 0);
  // クラック
  for (let i = 0; i < 15; i++) {
    ctx.beginPath();
    let x = Math.random() * 512, y = Math.random() * 512;
    ctx.moveTo(x, y);
    for (let j = 0; j < 8; j++) {
      x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(30,30,25,${0.3 + Math.random() * 0.4})`;
    ctx.lineWidth = 0.5 + Math.random() * 1.5; ctx.stroke();
  }
  return canvasTex(c);
}

// 甲板テクスチャ（木製デッキ風）
export function makeDeckTexture() {
  const c = makeCanvas(512); const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2a1a'; ctx.fillRect(0, 0, 512, 512);
  // デッキ板
  for (let y = 0; y < 512; y += 14) {
    ctx.fillStyle = `rgba(50,46,28,${0.3 + Math.random() * 0.2})`;
    ctx.fillRect(0, y, 512, 12);
    ctx.fillStyle = 'rgba(15,15,10,0.5)';
    ctx.fillRect(0, y + 12, 512, 2);
  }
  return canvasTex(c);
}

// 草地テクスチャ（陸地）
export function makeGrassTexture() {
  const c = makeCanvas(256); const ctx = c.getContext('2d');
  ctx.fillStyle = '#2e4a2e'; ctx.fillRect(0, 0, 256, 256);
  const id = ctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < id.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 25;
    id.data[i]     = Math.max(0, Math.min(255, id.data[i]     + n));
    id.data[i + 1] = Math.max(0, Math.min(255, id.data[i + 1] + n * 1.5));
    id.data[i + 2] = Math.max(0, Math.min(255, id.data[i + 2] + n * 0.5));
  }
  ctx.putImageData(id, 0, 0);
  return canvasTex(c);
}

// ============================================================
//  シーン構築
// ============================================================
export function buildScene(THREE) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xaac8dc, 0.000075);

  // ---- 空シェーダー（3層グラデーション + 太陽 + 散乱） ----
  const skyVert = `
    varying vec3 vWorldDir;
    void main(){
      vWorldDir = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const skyFrag = `
    uniform vec3 uZenith;
    uniform vec3 uMidsky;
    uniform vec3 uHorizon;
    uniform vec3 uSunDir;
    uniform float uSunIntensity;
    varying vec3 vWorldDir;
    void main(){
      vec3 d = normalize(vWorldDir);
      // 3層グラデーション: 天頂→中空→地平線
      float yt = clamp(d.y, 0.0, 1.0);
      float ym = clamp(1.0 - abs(d.y) * 2.5, 0.0, 1.0);
      vec3 col = mix(uHorizon, uMidsky, smoothstep(0.0, 0.3, d.y));
      col = mix(col, uZenith, smoothstep(0.25, 0.8, d.y));
      // 地平線ハロ（大気散乱）
      float halo = pow(clamp(1.0 - abs(d.y) * 3.5, 0.0, 1.0), 4.0);
      col += vec3(0.95, 0.98, 1.0) * halo * 0.35;
      // 太陽本体
      float sunCos = dot(d, normalize(uSunDir));
      float sunDisk = pow(max(sunCos, 0.0), 3000.0) * uSunIntensity;
      float sunGlow = pow(max(sunCos, 0.0), 80.0) * 0.5 * uSunIntensity;
      float sunScatter = pow(max(sunCos, 0.0), 12.0) * 0.2 * uSunIntensity;
      col += vec3(1.0, 0.97, 0.85) * sunDisk;
      col += vec3(1.0, 0.88, 0.6) * sunGlow;
      col += vec3(1.0, 0.92, 0.75) * sunScatter;
      gl_FragColor = vec4(col, 1.0);
    }`;

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(9500, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: {
        uZenith:       { value: new THREE.Color(0x1a5fa8) },
        uMidsky:       { value: new THREE.Color(0x4899cc) },
        uHorizon:      { value: new THREE.Color(0xc4dff0) },
        uSunDir:       { value: new THREE.Vector3(0.6, 0.42, 0.68).normalize() },
        uSunIntensity: { value: 1.0 },
      },
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  scene.add(sky);

  // ---- 雲（プロシージャル 2層） ----
  const mkCloud = (seed, y, opacity) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1024;
    const cx = cv.getContext('2d');
    cx.clearRect(0, 0, 1024, 1024);
    const rng = n => { const x = Math.sin(n * seed + 1.3) * 43758.5; return x - Math.floor(x); };
    for (let i = 0; i < 80; i++) {
      const px = rng(i*3)   * 1024;
      const py = rng(i*3+1) * 400 + 312;
      const r  = 35 + rng(i*3+2) * 130;
      const g  = cx.createRadialGradient(px, py, 0, px, py, r);
      const a  = 0.25 + rng(i) * 0.38;
      g.addColorStop(0,   `rgba(255,255,255,${a})`);
      g.addColorStop(0.5, `rgba(240,248,255,${a * 0.4})`);
      g.addColorStop(1,   'rgba(255,255,255,0)');
      cx.beginPath(); cx.arc(px, py, r, 0, Math.PI*2);
      cx.fillStyle = g; cx.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2.5, 1.2);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(24000, 12000),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    scene.add(m);
    return m;
  };
  mkCloud(1.7,  800, 0.6);
  mkCloud(3.1, 1400, 0.38);

  // ---- ライト ----
  const sun  = new THREE.DirectionalLight(0xfff6e0, 1.8);
  sun.position.set(600, 420, 680);
  scene.add(sun);
  const amb  = new THREE.AmbientLight(0x7799bb, 0.55); scene.add(amb);
  const moon = new THREE.DirectionalLight(0x2244aa, 0); moon.position.set(-300, 200, -600); scene.add(moon);
  const hemi = new THREE.HemisphereLight(0x99ccee, 0x224466, 0.45); scene.add(hemi);

  return { scene, sky, sun, amb, moon };
}

// ---- 海シェーダー (至高のリアルウォーター・視点バグ修正版) ----
export function buildOcean(THREE, scene) {
  const wu = {
    uT:          { value: 0 },
    uWH:         { value: 0.28 },
    uWS:         { value: 0.55 },
    uWind:       { value: 1.0 },
    uShipSpeed:  { value: 0.0 },
    uShipPos:    { value: new THREE.Vector2(0, 0) },
    uShipHeading:{ value: 0.0 },
    uOffset:     { value: new THREE.Vector2(0, 0) },
    uSunDir:     { value: new THREE.Vector3(0.6, 0.42, 0.68).normalize() },
    uSunColor:   { value: new THREE.Color(0xfff6e0) },
    uSkyZenith:  { value: new THREE.Color(0x1a5fa8) },
    uSkyHorizon: { value: new THREE.Color(0xc4dff0) },
    uDeepColor:  { value: new THREE.Color(0x0a2d48) },
    uShallowColor:{ value: new THREE.Color(0x1a6080) },
    uFogColor:   { value: new THREE.Color(0xaac8dc) },
    uFogDensity: { value: 0.000075 },
  };

  const vert = `
    uniform float uT, uWH, uWS, uWind;
    uniform vec2 uOffset;
    // vViewPosを削除し、ワールド座標系のみで計算するよう修正
    varying vec3 vNormal, vWorldPos;
    varying vec2 vUV;

    vec3 gerstner(vec2 p, vec2 d, float wl, float steep, float spd){
      float k = 6.2832 / wl;
      float c = sqrt(9.8 / k) * spd;
      float f = k * (dot(normalize(d), p) - c * uT);
      float a = steep / k;
      return vec3(normalize(d).x * a * cos(f), a * sin(f), normalize(d).y * a * cos(f));
    }

    void main(){
      vec3 pos = position;
      vec2 wp  = pos.xz + uOffset;

      vec3 g = vec3(0.0);
      g += gerstner(wp, vec2(1.0, 0.4),    350.0, uWH * 0.60, uWS * 0.8);
      g += gerstner(wp, vec2(0.8, 0.6),    200.0, uWH * 0.35, uWS * 0.95);
      g += gerstner(wp, vec2(1.2, 0.2),    110.0, uWH * 0.20, uWS * 1.1);
      pos += g;

      float e = 2.0;
      vec3 gR = gerstner(wp+vec2(e,0.), vec2(1.0,0.4), 350., uWH*0.6, uWS*0.8) + gerstner(wp+vec2(e,0.), vec2(0.8,0.6), 200., uWH*0.35, uWS*0.95);
      vec3 gL = gerstner(wp-vec2(e,0.), vec2(1.0,0.4), 350., uWH*0.6, uWS*0.8) + gerstner(wp-vec2(e,0.), vec2(0.8,0.6), 200., uWH*0.35, uWS*0.95);
      vec3 gF = gerstner(wp+vec2(0.,e), vec2(1.0,0.4), 350., uWH*0.6, uWS*0.8) + gerstner(wp+vec2(0.,e), vec2(0.8,0.6), 200., uWH*0.35, uWS*0.95);
      vec3 gB = gerstner(wp-vec2(0.,e), vec2(1.0,0.4), 350., uWH*0.6, uWS*0.8) + gerstner(wp-vec2(0.,e), vec2(0.8,0.6), 200., uWH*0.35, uWS*0.95);
      vNormal = normalize(cross(vec3(0., gF.y-gB.y, 2.*e), vec3(2.*e, gR.y-gL.y, 0.)));

      vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
      vWorldPos  = (modelMatrix * vec4(pos, 1.0)).xyz;
      vUV        = wp;
      gl_Position = projectionMatrix * mvPos;
    }`;

  const frag = `
    uniform float uT, uFogDensity, uShipSpeed, uShipHeading;
    uniform vec2 uShipPos;
    uniform vec3 uSunDir, uSunColor, uSkyZenith, uSkyHorizon;
    uniform vec3 uDeepColor, uShallowColor, uFogColor;
    varying vec3 vNormal, vWorldPos;
    varying vec2 vUV;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float vnoise(vec2 p){
      vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
    }
    float fbm(vec2 p){ return vnoise(p)*0.5 + vnoise(p*2.0)*0.25 + vnoise(p*4.0)*0.125; }

    vec3 skyCol(vec3 dir){ return mix(uSkyHorizon, uSkyZenith, clamp(dir.y * 1.5 + 0.1, 0.0, 1.0)); }

    void main(){
      // ★修正: 視線ベクトル(V)をカメラのワールド座標から直接計算する
      vec3 viewVec = cameraPosition - vWorldPos;
      float dist = length(viewVec);
      vec3 V = normalize(viewVec);

      float detailFade = smoothstep(3000.0, 100.0, dist);
      float globalFade = smoothstep(8000.0, 500.0, dist);

      float waveStrengthNoise = fbm(vWorldPos.xz * 0.005); 

      vec2 uv1 = vWorldPos.xz * 0.008 - uT * vec2(0.3, 0.15); 
      vec2 uv2 = vWorldPos.xz * 0.04  - uT * vec2(0.6, 0.4);  
      
      float n1x = fbm(uv1 + vec2(0.1, 0.0)) - fbm(uv1 - vec2(0.1, 0.0));
      float n1z = fbm(uv1 + vec2(0.0, 0.1)) - fbm(uv1 - vec2(0.0, 0.1));
      float n2x = fbm(uv2 + vec2(0.05, 0.0)) - fbm(uv2 - vec2(0.05, 0.0));
      float n2z = fbm(uv2 + vec2(0.0, 0.05)) - fbm(uv2 - vec2(0.0, 0.05));

      vec3 waveNormal = vec3(n1x, 0.0, n1z) * 0.8 + vec3(n2x, 0.0, n2z) * 0.6 * detailFade;
      waveNormal *= (0.6 + waveStrengthNoise * 0.8);

      vec3 N = normalize(vNormal + waveNormal * globalFade);
      vec3 L = normalize(uSunDir);

      // ワールド座標系同士で正しく計算されるため、下を向いても破綻しない
      float NdotV = max(dot(N, V), 0.0001);
      float fresnel = pow(1.0 - NdotV, 5.0); 
      float reflectionStrength = mix(0.005, 1.0, fresnel); 

      vec3 R = reflect(-V, N);
      vec3 reflection = skyCol(normalize(R));

      float depthFactor = clamp(dist / 4000.0, 0.0, 1.0);
      vec3 waterBase = mix(uShallowColor, uDeepColor, depthFactor);
      
      float macroNoise = fbm(vWorldPos.xz * 0.002);
      vec3 waterTint = vec3(0.06, 0.18, 0.15); 
      waterBase = mix(waterBase, waterTint, macroNoise * 0.4); 
      waterBase *= max(dot(N, L), 0.0) * 0.6 + 0.4; 

      vec3 H = normalize(L + V);
      float NdotH = max(dot(N, H), 0.0);
      
      float roughness = fbm(vWorldPos.xz * 0.08 - uT * 0.2);
      roughness = clamp(roughness + macroNoise * 0.5, 0.0, 1.0);
      
      float specPower = mix(1000.0, 8000.0, roughness);
      float specular = pow(NdotH, specPower) * (5.0 + roughness * 10.0) * detailFade;

      vec3 color = mix(waterBase, reflection, reflectionStrength);
      color += uSunColor * specular;

      vec2 toShip = vWorldPos.xz - uShipPos;
      float sh = sin(uShipHeading), ch = cos(uShipHeading);
      float localZ = dot(toShip, vec2(-sh, ch));
      float localX = dot(toShip, vec2(ch, sh));

      float bowZ = localZ - 150.0;
      float bowX = abs(localX) - 15.0 - max(0.0, -bowZ * 0.6); 
      float bowWave = smoothstep(20.0, 0.0, bowX) * smoothstep(60.0, 0.0, abs(bowZ)) * uShipSpeed * 1.5;

      float wakeZ = -localZ - 170.0; 
      float wakeX = abs(localX) - 20.0 - max(0.0, wakeZ * 0.25);
      float wakeMask = smoothstep(600.0, 0.0, wakeZ) * smoothstep(50.0, 0.0, abs(wakeX));
      float propWash = smoothstep(15.0, 0.0, abs(localX)) * smoothstep(250.0, 0.0, wakeZ);
      float wake = max(wakeMask, propWash * 1.5) * step(0.0, wakeZ) * uShipSpeed;

      float slope = length(waveNormal.xz);
      float naturalFoam = smoothstep(0.6, 1.0, slope) * fbm(vUV * 0.3 + uT * 0.5) * 0.2;

      wake *= (fbm(vUV * 0.05 - vec2(0.0, uT * 1.5)) * 0.6 + 0.4);
      bowWave *= (fbm(vUV * 0.08 - vec2(0.0, uT * 2.0)) * 0.5 + 0.5);

      float totalFoam = clamp(naturalFoam + wake * 0.8 + bowWave, 0.0, 1.0);
      color = mix(color, vec3(0.85, 0.92, 0.98), totalFoam);

      float fog = clamp(exp2(-uFogDensity * uFogDensity * dist * dist * 1.4427), 0.0, 1.0);
      gl_FragColor = vec4(mix(uFogColor, color, fog), 1.0);
    }`;

  const geo = new THREE.PlaneGeometry(24000, 24000, 512, 512);
  geo.rotateX(-Math.PI / 2);
  const ocean = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: wu, vertexShader: vert, fragmentShader: frag,
  }));
  scene.add(ocean);
  return { ocean, wu };
}

// ---- 船体（GLTFモデル版） ----
export function buildShip(THREE, scene) {
  const SG = new THREE.Group();
  SG.name = 'Ship'; // toggleNight で検索できるように名前を付与

  const loader = new GLTFLoader();
  
  // 先ほど配置したGLBファイルを読み込む
  loader.load('./models/ship.glb', (gltf) => {
    const model = gltf.scene;
    // ... (スケーリング処理などはそのまま)

    // --- ここから：自動スケール＆センタリング処理 ---
    
    // 1. モデルの本来のサイズと中心座標を計算する
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // 2. シミュレーターの船のサイズに自動でスケールを合わせる
    const targetLength = 350; // ★ 350 にスケール変更
    const maxLength = Math.max(size.x, size.y, size.z); // 一番長い辺を探す
    const scaleFactor = targetLength / maxLength;       // 拡大・縮小率を計算
    
    // ★ 計算された倍率を P.shipScale に保存して main.js と共有する
    P.shipScale = scaleFactor;

    model.scale.set(scaleFactor, scaleFactor, scaleFactor);

    // 3. モデルの中心のズレを修正する（原点に持ってくる）＆ 喫水を沈める
    model.position.x = -center.x * scaleFactor;
    model.position.y = (-center.y * scaleFactor) +20 ; // ★プラスで上に移動
    model.position.z = -center.z * scaleFactor;

  
    model.rotation.y = -Math.PI / 2; 

    // デバッグ用：F12コンソールにサイズを出力して確認する
    console.log("🚢 Original Size:", size);
    console.log("🚢 Scale Factor:", scaleFactor);
    
    // --- ここまで ---

    // --- ここから追加：全メッシュを両面レンダリングに設定＆透明度無効化 ---
    model.traverse((object) => {
      // オブジェクトがメッシュ（3D形状）の場合
      if (object.isMesh) {
        // マテリアル（質感）の設定を変更
        object.material.side = THREE.DoubleSide; // ★両面を描画するように設定
        
        // --- ここから追加：透明度設定による透けを防止 ---
        object.material.transparent = false; // 強制的に不透明にする
        object.material.depthWrite = true;   // 描画順序を正しくする
        object.material.alphaTest = 0.5;     // 境界線をはっきりさせる
        // --- ここまで追加 ---
      }
    });
    // --- ここまで追加 ---

    SG.add(model);
  });

  // ==========================================================
  // 3. 航海灯の正確な配置と視認距離 (安全設備規則 / COLREGs 準拠)
  // ==========================================================
  const navLights = new THREE.Group();
  navLights.name = 'NavLights';
  const nmToMeters = 1852; // 1海里 = 1852m

  // 光源と照射角を生成するヘルパー関数
  const createNavLight = (hex, angleDeg, distNm) => {
      const g = new THREE.Group();
      // 灯器本体の発光
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), new THREE.MeshBasicMaterial({ color: hex }));
      g.add(mesh);
      // 規定された視認距離と照射角（Cut-off）を持つ SpotLight
      const light = new THREE.SpotLight(hex, 5.0, distNm * nmToMeters, (angleDeg / 2) * (Math.PI / 180), 0.05, 1);
      const target = new THREE.Object3D();
      target.position.set(0, 0, 10); // 光の向かう方向
      g.add(target);
      light.target = target;
      g.add(light);
      return g;
  };

  // ① 前部マスト灯 (Fwd Masthead Light): 白, 225度, 視認距離 6海里
  const fwdMast = createNavLight(0xffffff, 225, 6);
  fwdMast.position.set(0, 35, 120); // 船首寄りマスト
  navLights.add(fwdMast);

  // ② 後部マスト灯 (Aft Masthead Light): 白, 225度, 視認距離 6海里
  const aftMast = createNavLight(0xffffff, 225, 6);
  aftMast.position.set(0, 50, -110); // 居住区トップマスト
  navLights.add(aftMast);

  // ③ 右舷灯 (Starboard Sidelight): 緑, 112.5度, 視認距離 3海里
  const stbdLight = createNavLight(0x00ff00, 112.5, 3);
  stbdLight.position.set(26, 30, -100); // 船橋ウイング右舷端
  stbdLight.rotation.y = -Math.PI / 8; // 正面から右真横やや後方までを照射
  navLights.add(stbdLight);

  // ④ 左舷灯 (Port Sidelight): 赤, 112.5度, 視認距離 3海里
  const portLight = createNavLight(0xff0000, 112.5, 3);
  portLight.position.set(-26, 30, -100); // 船橋ウイング左舷端
  portLight.rotation.y = Math.PI / 8; 
  navLights.add(portLight);

  // ⑤ 船尾灯 (Stern Light): 白, 135度, 視認距離 3海里
  const sternLight = createNavLight(0xffffff, 135, 3);
  sternLight.position.set(0, 15, -170); // 船尾端
  sternLight.rotation.y = Math.PI; // 真後ろを照射
  navLights.add(sternLight);

  navLights.visible = false; // 初期状態は消灯（夜間に点灯）
  SG.add(navLights);

  // プロペラアニメーション用のダミー
  const prop = new THREE.Group(); 
  SG.add(prop);

  scene.add(SG);
  return { shipGroup: SG, prop };
}

export function toggleNight(scene, night) {
  const ship = scene.getObjectByName('Ship');
  if (ship) {
      const navLights = ship.getObjectByName('NavLights');
      if (navLights) navLights.visible = night; // 夜間に航海灯を点灯
  }
}

// ---- 陸地・港湾 ----
export function buildWorld(THREE, scene) {
  const concTex  = makeConcreteTexture();
  const grassTex = makeGrassTexture();

  const land = (x, z, w, d, h, color, tex = null) => {
    const mat = new THREE.MeshStandardMaterial({ color: tex ? 0xffffff : color, roughness: 1 });
    if (tex) { mat.map = tex; mat.map.repeat.set(w / 50, d / 50); }
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, h / 2 - 1, z); scene.add(m);
  };

  // 陸地
  land(-2500, 2000, 1000, 7000, 18, 0x2e4a2e, grassTex);
  land(-2600, 4500,  700, 5000, 14, 0x264226, grassTex);
  land(-2800, -500,  600, 3000, 12, 0x2e4a2e, grassTex);
  land( 2600, 2000,  900, 7000,  9, 0x2e4a2e, grassTex);
  land( 2700, -300,  700, 4000,  7, 0x264226, grassTex);

  // ビル群（横浜：ランドマークタワー級 296m を混ぜる）
  for (let i = 0; i < 50; i++) {
    const isLandmark = (i === 0);
    const h = isLandmark ? 296 : (50 + Math.random() * 150);
    const w = isLandmark ? 50 : (20 + Math.random() * 40);
    land(-2050 + Math.random() * 700 - 350, 3100 + Math.random() * 1200,
         w, w, h,
         isLandmark ? 0x8899aa : (i % 3 ? 0x445566 : 0x334455));
  }
  // ビル群（東京）
  for (let i = 0; i < 50; i++) {
    const isLandmark = (i === 0);
    const h = isLandmark ? 350 : (80 + Math.random() * 150);
    const w = isLandmark ? 60 : (30 + Math.random() * 50);
    land(1650 + Math.random() * 500 - 250, 4300 + Math.random() * 800,
         w, w, h,
         i % 4 ? 0x334455 : 0x223344);
  }
  // 工場・タンク（川崎）
  for (let i = 0; i < 15; i++) {
    const r = 8 + Math.random() * 12, h = 20 + Math.random() * 40;
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 12),
      new THREE.MeshStandardMaterial({ color: 0x888880, roughness: 0.8 })
    );
    cyl.position.set(-900 + Math.random() * 400 - 200, h / 2, 2000 + Math.random() * 600 - 300);
    scene.add(cyl);
  }

  // 港湾
  const buildPort = (px, pz) => {
    const concMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, map: concTex });
    concTex.repeat.set(8, 8);
    const pier  = new THREE.Mesh(new THREE.BoxGeometry(700, 7, 500), concMat);
    pier.position.set(px - 200, -1, pz + 120); scene.add(pier);
    const berth = new THREE.Mesh(new THREE.BoxGeometry(9, 12, 300), concMat);
    berth.position.set(px, 2, pz); scene.add(berth);
    // ボラード
    for (let i = -3; i <= 3; i++) {
      const b = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.9, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0x888880, metalness: 0.5 })
      );
      b.position.set(px + i * 44, 4, pz); scene.add(b);
    }
    // クレーン（ガントリークレーン巨大化・実寸大）
    const yMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.6 });
    const buildGantryCrane = (cx, cz) => {
      const g = new THREE.Group();
      // 柱（高さ90m級）
      const legG = new THREE.BoxGeometry(4, 90, 4);
      const legL = new THREE.Mesh(legG, yMat); legL.position.set(-15, 45, 0);
      const legR = new THREE.Mesh(legG, yMat); legR.position.set(15, 45, 0);
      // アーム（海側に150m突き出す）
      const beamG = new THREE.BoxGeometry(6, 6, 150);
      const beam = new THREE.Mesh(beamG, yMat);
      beam.position.set(0, 85, 40); 
      g.add(legL, legR, beam);
      g.position.set(cx, 0, cz);
      
      const pl = new THREE.PointLight(0xffeeaa, 1.2, 350);
      pl.position.set(0, 92, 40); g.add(pl);
      scene.add(g);
    };

    [-100, 0, 100].forEach(cx => {
      buildGantryCrane(px + cx, pz + 90);
    });
    // コンテナヤード
    const CC = [0xcc3333,0x3366cc,0x33aa33,0xccaa00,0x886633,0xcc6600];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
      const cm = new THREE.Mesh(
        new THREE.BoxGeometry(12, 4.5, 23),
        new THREE.MeshStandardMaterial({ color: CC[(r * 6 + c) % CC.length], roughness: 0.7 })
      );
      cm.position.set(px - 110 + c * 14, 3 + r * 5, pz + 76 + Math.floor(r / 2) * 28);
      scene.add(cm);
    }
    // 倉庫
    const wh = new THREE.Mesh(new THREE.BoxGeometry(120, 18, 60), concMat);
    wh.position.set(px - 120, 9, pz + 160); scene.add(wh);
  };

  buildPort(-2100, 3200);
  buildPort( 1800, 4500);

  // 浮標 (日本のIALA B方式: 水源に向かって右が赤、左が緑)
  const buoys = [];
  // 巨大船が安全に通れるように航路幅を300m（左右150mずつ）に設定
  const channelWidth = 150; 
  
  for (let i = 0; i < 20; i++) { // ブイの数を20個に増やして長い航路を形成
    const g = new THREE.Group();
    
    // 偶数(左舷側)を緑、奇数(右舷側)を赤に設定
    const isStarboard = i % 2 !== 0; 
    const color = isStarboard ? 0xff2200 : 0x00ff44; // 赤(右) と 緑(左)
    
    // ブイ本体の質感
    const mat = new THREE.MeshStandardMaterial({ 
      color: color, 
      roughness: 0.3, 
      metalness: 0.6 
    });
    
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 4.5, 12), mat);
    body.position.y = 2.2; 
    g.add(body);
    
    // 頭頂部の形状（緑は円筒形、赤は円錐形が国際基準ですが、ここでは視認性重視で統一感を出します）
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.0, 12), mat);
    top.position.y = 5.5; 
    g.add(top);
    
    // 航路標識の灯火（夜間や悪天候で目立つように強化）
    const bl = new THREE.PointLight(color, 2.5, 150); 
    bl.position.y = 7.0; 
    g.add(bl);
    
    // Z軸マイナス方向（北/水源）に向かって配置。X座標を左右に振り分ける
    const posX = isStarboard ? channelWidth : -channelWidth;
    const posZ = Math.floor(i / 2) * -800 + 1000; // 800m間隔で配置
    
    g.position.set(posX, 0, posZ);
    scene.add(g); 
    buoys.push(g);
  }

  return { buoys };
}

// ---- AI他船 (航跡メッシュ追加版) ----
export function buildAI(THREE, scene) {
  const AIships = [], fishBoats = [];
  const metalTex = makeMetalTexture('#334455');

  // [追加] 航跡用の共有ユニフォーム（main.jsで時間を更新するため）
  const wakeUniforms = {
    uT: { value: 0 }
  };

  // [追加] 航跡シェーダーマテリアル
  const wakeMat = new THREE.ShaderMaterial({
    uniforms: {
      uT: wakeUniforms.uT,
      uSpeed: { value: 1.0 } // 船の基本速度に合わせて調整
    },
    vertexShader: `
      varying vec2 vUV;
      void main() {
        vUV = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uT;
      uniform float uSpeed;
      varying vec2 vUV;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vnoise(vec2 p){
        vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      float fbm(vec2 p){
        return vnoise(p)*0.5 + vnoise(p*2.0)*0.25 + vnoise(p*4.0)*0.125;
      }

      void main() {
        // vUV.y: 1.0(船尾側/前), 0.0(はるか後方)
        float front = vUV.y;
        float back = 1.0 - vUV.y;

        // 中央からの距離 (0.0=中央, 1.0=端)
        float distFromCenter = abs(vUV.x - 0.5) * 2.0;

        // 後方に行くほど広がるV字の幅
        float wakeWidth = back * 0.7 + 0.1;
        float mask = smoothstep(wakeWidth, wakeWidth - 0.3, distFromCenter);

        // スクリュー直後の泡 (プロペラウォッシュ)
        float wash = smoothstep(0.2, 0.0, distFromCenter) * smoothstep(1.0, 0.6, back);

        // 動的ノイズ (後方へ流れる)
        vec2 nuv = vUV * vec2(4.0, 12.0);
        nuv.y += uT * uSpeed * 0.8;
        float n = fbm(nuv);
        float n2 = fbm(nuv * 2.0 - vec2(0.0, uT * uSpeed * 1.5));

        // 合成してフェードアウト
        float wave = (mask * n + wash * n2) * front;
        wave *= smoothstep(0.0, 0.1, front); // 後端の滑らかな消失

        // 境界線を馴染ませる
        float edgeFade = smoothstep(1.0, 0.5, distFromCenter / wakeWidth);
        float alpha = wave * edgeFade * 0.8;

        gl_FragColor = vec4(0.92, 0.96, 0.99, alpha);
      }
    `,
    transparent: true,
    depthWrite: false, // 海面とのチラつき(Zファイティング)防止
    side: THREE.DoubleSide
  });

  const mkAI = (x, z, h, spd, c, sz = 1) => {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
    const bm = new THREE.Mesh(new THREE.BoxGeometry(8 * sz, 4 * sz, 50 * sz), mat);
    bm.position.y = 2 * sz; g.add(bm);
    const sm = new THREE.Mesh(new THREE.BoxGeometry(6 * sz, 8 * sz, 10 * sz), new THREE.MeshStandardMaterial({ color: 0xddddc8 }));
    sm.position.set(0, 8 * sz, -10 * sz); g.add(sm);
    const gl = new THREE.PointLight(0x00ff00, 0.5, 100 * sz); gl.position.set( 4 * sz, 5 * sz, 22 * sz); g.add(gl);
    const rl = new THREE.PointLight(0xff0000, 0.5, 100 * sz); rl.position.set(-4 * sz, 5 * sz, 22 * sz); g.add(rl);
    
    // [追加] 航跡メッシュの追加
    const wakeLen = 80 * sz;
    const wakeGeo = new THREE.PlaneGeometry(30 * sz, wakeLen);
    wakeGeo.rotateX(-Math.PI / 2);
    const wakeMesh = new THREE.Mesh(wakeGeo, wakeMat.clone());
    // マテリアルをクローンして個別の速度を適用
    wakeMesh.material.uniforms.uSpeed.value = spd * 0.5;
    // 船尾から後方に配置 (zはプラスが後方)
    wakeMesh.position.set(0, 0.2, 25 * sz + wakeLen / 2 - 5 * sz);
    g.add(wakeMesh);

    g.position.set(x, 0, z); g.rotation.y = -h; scene.add(g);
    return { mesh: g, heading: h, speed: spd, avoidTimer: 0, sz };
  };

  // タンカー（大型）
  const mkTanker = (x, z, h) => {
    const g = new THREE.Group();
    const bm = new THREE.Mesh(new THREE.BoxGeometry(40, 9, 280), new THREE.MeshStandardMaterial({ color: 0x332211, roughness: 0.8 }));
    bm.position.y = 4; g.add(bm);
    const br = new THREE.Mesh(new THREE.BoxGeometry(30, 24, 32), new THREE.MeshStandardMaterial({ color: 0xcc9933, roughness: 0.5, metalness: 0.3 }));
    br.position.set(0, 20, -110); g.add(br);
    const fn = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 5, 15, 12), new THREE.MeshStandardMaterial({ color: 0xcc2222 }));
    fn.position.set(0, 36, -120); g.add(fn);

    // [追加] 航跡メッシュの追加 (大型用)
    const wakeLen = 300;
    const wakeGeo = new THREE.PlaneGeometry(80, wakeLen);
    wakeGeo.rotateX(-Math.PI / 2);
    const wakeMesh = new THREE.Mesh(wakeGeo, wakeMat.clone());
    wakeMesh.material.uniforms.uSpeed.value = 4 * 0.5;
    wakeMesh.position.set(0, 0.3, 140 + wakeLen / 2 - 10);
    g.add(wakeMesh);

    g.position.set(x, 0, z); g.rotation.y = -h; scene.add(g);
    return { mesh: g, heading: h, speed: 4, avoidTimer: 0, sz: 5, isTanker: true };
  };

  [
    [400, 1500, Math.PI * 0.1, 8, 0x334455, 4],
    [-300, 3200, Math.PI * 0.9, 6, 0x553322, 5],
    [200, -500, Math.PI * 1.5, 7, 0x335533, 4],
    [600, 800, Math.PI * 0.3, 9, 0x223344, 6],
    [-200, 4200, Math.PI * 1.1, 5, 0x443333, 4],
    [900, 2800, Math.PI * 0.7, 7, 0x334422, 5],
    [-600, 1200, Math.PI * 0.2, 6, 0x223355, 6],
  ].forEach(([x, z, h, spd, c, sz]) => AIships.push(mkAI(x, z, h, spd, c, sz)));
  AIships.push(mkTanker(300, -800, 0));
  AIships.push(mkTanker(-400, 5000, Math.PI));

  // 漁船
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const bm = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 10), new THREE.MeshStandardMaterial({ color: 0x4488aa, roughness: 0.8 }));
    bm.position.y = 1; g.add(bm);

    // [追加] 航跡メッシュの追加 (漁船用)
    const spd = 3 + Math.random() * 4;
    const wakeLen = 25;
    const wakeGeo = new THREE.PlaneGeometry(8, wakeLen);
    wakeGeo.rotateX(-Math.PI / 2);
    const wakeMesh = new THREE.Mesh(wakeGeo, wakeMat.clone());
    wakeMesh.material.uniforms.uSpeed.value = spd * 0.5;
    wakeMesh.position.set(0, 0.1, 5 + wakeLen / 2 - 2);
    g.add(wakeMesh);

    const a = Math.random() * Math.PI * 2;
    g.position.set(Math.cos(a) * 800 + Math.random() * 300 - 150, 0, Math.sin(a) * 800 + Math.random() * 300 - 150);
    scene.add(g);
    fishBoats.push({ mesh: g, heading: a, speed: spd, drift: Math.random() * 0.003 - 0.0015 });
  }

  // タグボート
  const tugs = [];
  const mkTug = (x, z, ox, oz) => {
    const g = new THREE.Group();
    const bm = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 35), new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.6 }));
    bm.position.y = 4; g.add(bm);
    const cb = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 10), new THREE.MeshStandardMaterial({ color: 0xddddcc }));
    cb.position.set(0, 12, 4); g.add(cb);
    const fn = new THREE.Mesh(new THREE.CylinderGeometry(2, 3, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff5500 }));
    fn.position.set(0, 18, 0); g.add(fn);

    g.position.set(x, 0, z); scene.add(g);
    return { mesh: g, active: false, ox, oz };
  };
  tugs.push(mkTug(-2100 + 100, 3200 - 200,  65, -90));
  tugs.push(mkTug(-2100 - 100, 3200 - 180, -65, -70));

  scene.traverse((object) => {
    if (object.isMesh && object.material) {
      object.material.side = THREE.DoubleSide;
    }
  });

  // [修正] wakeUniforms を main.js に渡す
  return { AIships, fishBoats, tugs, wakeUniforms };
}

// ---- scene.js の一番下にこれを追加 ----

export async function buildLandmass(THREE, scene) {
  try {
    // 1. さきほどダウンロードしたデータを読み込む
    const res = await fetch('./tokyobay.geojson');
    const data = await res.json();

    // 2. 陸地のマテリアル（夜や霧にも馴染む暗めのオリーブグリーン）
    const mat = new THREE.MeshStandardMaterial({ 
      color: 0x1c2e22, 
      roughness: 0.9, 
      side: THREE.DoubleSide // 念のため両面描画
    });

    // 3. 基準座標（東京湾の中心付近：海ほたる周辺をX=0, Z=0とする）
    const ORIGIN_LAT = 35.45;
    const ORIGIN_LON = 139.75;

    // 緯度経度からゲーム内座標（メートル）への変換
    function latLonToXZ(lat, lon) {
      const x = (lon - ORIGIN_LON) * 111320 * Math.cos(ORIGIN_LAT * Math.PI / 180);
      const z = (lat - ORIGIN_LAT) * 111320; // 北がプラス
      return new THREE.Vector2(x, z);
    }

    const landGroup = new THREE.Group();

    // 4. 点を繋いでポリゴンを作る関数
    function createShape(points) {
      if (points.length < 3) return;
      const shape = new THREE.Shape();
      points.forEach((p, i) => {
        const pos = latLonToXZ(p[1], p[0]); // p[0] = 経度, p[1] = 緯度
        if (i === 0) shape.moveTo(pos.x, pos.y);
        else shape.lineTo(pos.x, pos.y);
      });

      // ポリゴンを厚みのある立体（陸地）にする
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 20,        // 20mの厚み
        bevelEnabled: false
      });
      
      geo.rotateX(-Math.PI / 2); // 3D空間で寝かせる
      geo.translate(0, -10, 0);  // -10mの海底から+10mの陸地になるように配置

      const mesh = new THREE.Mesh(geo, mat);
      landGroup.add(mesh);
    }

    // 5. データの中身をループしてすべての海岸線を処理
    data.features.forEach(feat => {
      if (!feat.geometry) return;
      const type = feat.geometry.type;
      const coords = feat.geometry.coordinates;

      if (type === 'LineString') {
        createShape(coords);
      } else if (type === 'Polygon') {
        coords.forEach(ring => createShape(ring));
      } else if (type === 'MultiPolygon') {
        coords.forEach(poly => poly.forEach(ring => createShape(ring)));
      }
    });

    scene.add(landGroup);
    console.log("陸地の読み込み完了！");
    return landGroup;
  } catch (err) {
    console.error("地図データの読み込みエラー:", err);
  }
}