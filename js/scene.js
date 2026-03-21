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
  scene.fog = new THREE.FogExp2(0x8fb5cc, 0.00012);

  // ---- 空 ----
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(9500, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x5a8fb0, side: THREE.BackSide })
  );
  scene.add(sky);

  // ---- ライト ----
  const sun  = new THREE.DirectionalLight(0xfff4e0, 1.2); sun.position.set(500, 300, 800); scene.add(sun);
  const amb  = new THREE.AmbientLight(0x6688aa, 0.6); scene.add(amb);
  const moon = new THREE.DirectionalLight(0x3355aa, 0); moon.position.set(-300, 200, -600); scene.add(moon);

  return { scene, sky, sun, amb, moon };
}

// ---- 海シェーダー ----
export function buildOcean(THREE, scene) {
  const wu = {
    uT:    { value: 0 },
    uWH:   { value: 0.6 },
    uWS:   { value: 0.8 },
    uWD:   { value: new THREE.Vector2(1, 0.3) },
    uCur:  { value: new THREE.Vector2(0.1, 0) },
    uWind: { value: 1.0 },
    uOffset: { value: new THREE.Vector2(0, 0) } // 追加: 船の座標オフセット
  };
  const vert = `
    uniform float uT,uWH,uWS,uWind; uniform vec2 uWD,uCur,uOffset;
    varying vec3 vN; varying float vWY,vFoam;
    float W(vec2 p,vec2 d,float f,float s,float a){
      return a*sin(dot(p/1000.+uCur*uT*.05,normalize(d))*f-uT*s);
    }
    void main(){
      // 波のスクロールを25倍速に強調し、「表示速度（メーター）に合った」圧倒的な視覚的スピード感を出します
      vec3 pos=position; vec2 wp=pos.xz + uOffset * 25.0;
      float h=W(wp,uWD,6.,uWS,uWH)+W(wp,vec2(uWD.y,-uWD.x),9.,uWS*1.3,uWH*.5)
             +W(wp,vec2(-.7,.9),15.,uWS*1.7,uWH*.25)+W(wp,vec2(.5,-.8),22.,uWS*2.1,uWH*.14)
             +W(wp,uWD*1.3,35.,uWS*3.,uWH*.06);
      pos.y=h; vWY=h;
      float e=4.;
      float hR=W(wp+vec2(e,0.),uWD,6.,uWS,uWH),hF=W(wp+vec2(0.,e),uWD,6.,uWS,uWH);
      vN=normalize(vec3(h-hR,e,h-hF));
      vFoam=smoothstep(.22,.85,h)*uWind;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.);
    }`;
  const frag = `
    uniform float uT; varying vec3 vN; varying float vWY,vFoam;
    void main(){
      vec3 deep=vec3(.02,.12,.22),sh=vec3(.06,.28,.42),foam=vec3(.78,.9,.96),spray=vec3(.92,.96,.99);
      vec3 ld=normalize(vec3(.5,.8,.3));
      float df=max(dot(vN,ld),0.),sp=pow(max(dot(reflect(-ld,vN),vec3(0,1,0)),0.),80.);
      float fres=pow(1.-max(dot(vN,vec3(0,1,0)),0.),.6);
      vec3 c=mix(deep,sh,df*.65+.18)+sp*.55*foam;
      c=mix(c,foam,vFoam*.42); c=mix(c,spray,fres*.12);
      gl_FragColor=vec4(c,1.);
    }`;
  const geo = new THREE.PlaneGeometry(18000, 18000, 200, 200);
  geo.rotateX(-Math.PI / 2);
  const ocean = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: wu, vertexShader: vert, fragmentShader: frag }));
  scene.add(ocean);
  return { ocean, wu };
}

// ---- 船体（GLTFモデル版） ----
export function buildShip(THREE, scene) {
  const SG = new THREE.Group();

  const loader = new GLTFLoader();
  
  // 先ほど配置したGLBファイルを読み込む
  loader.load('./models/ship.glb', (gltf) => {
    const model = gltf.scene;

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

  // 航海灯（既存のものを維持）
  const navL = {
    mast:  new THREE.PointLight(0xffffff, 0.5, 350),
    green: new THREE.PointLight(0x00ff00, 0.8, 220),
    red:   new THREE.PointLight(0xff0000, 0.8, 220),
  };
  navL.mast.position.set(0, 35, -60);
  navL.green.position.set(14, 10, 80);
  navL.red.position.set(-14, 10, 80);
  Object.values(navL).forEach(l => scene.add(l));

  // プロペラアニメーション用のダミー（main.jsのエラー回避用）
  const prop = new THREE.Group(); 
  SG.add(prop);

  scene.add(SG);
  return { shipGroup: SG, prop, navL };
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

  // 浮標
  const buoys = [];
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const color = i % 2 ? 0x00aa44 : 0xff3300;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 3.5, 8), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    body.position.y = 2.2; g.add(body);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 8), new THREE.MeshStandardMaterial({ color }));
    top.position.y = 5; g.add(top);
    const bl = new THREE.PointLight(color, 1.4, 70); bl.position.y = 5.5; g.add(bl);
    g.position.set(-80 + (i % 2 ? 32 : -32), 0, i * 620 - 600);
    scene.add(g); buoys.push(g);
  }

  return { buoys };
}

// ---- AI他船 ----
export function buildAI(THREE, scene) {
  const AIships = [], fishBoats = [];
  const metalTex = makeMetalTexture('#334455');

  const mkAI = (x, z, h, spd, c, sz = 1) => {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 });
    const bm = new THREE.Mesh(new THREE.BoxGeometry(8 * sz, 4 * sz, 50 * sz), mat);
    bm.position.y = 2 * sz; g.add(bm);
    const sm = new THREE.Mesh(new THREE.BoxGeometry(6 * sz, 8 * sz, 10 * sz), new THREE.MeshStandardMaterial({ color: 0xddddc8 }));
    sm.position.set(0, 8 * sz, -10 * sz); g.add(sm);
    const gl = new THREE.PointLight(0x00ff00, 0.5, 100 * sz); gl.position.set( 4 * sz, 5 * sz, 22 * sz); g.add(gl);
    const rl = new THREE.PointLight(0xff0000, 0.5, 100 * sz); rl.position.set(-4 * sz, 5 * sz, 22 * sz); g.add(rl);
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
    const a = Math.random() * Math.PI * 2;
    g.position.set(Math.cos(a) * 800 + Math.random() * 300 - 150, 0, Math.sin(a) * 800 + Math.random() * 300 - 150);
    scene.add(g);
    fishBoats.push({ mesh: g, heading: a, speed: 3 + Math.random() * 4, drift: Math.random() * 0.003 - 0.0015 });
  }

  // タグボート
  const tugs = [];
  const mkTug = (x, z, ox, oz) => {
    const g = new THREE.Group();
    // 幅12m, 高さ8m, 全長35m に拡大
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

  // --- 全ての物質を「透けない」ようにする ---
  scene.traverse((object) => {
    if (object.isMesh && object.material) {
      object.material.side = THREE.DoubleSide; // ★ 全ての物体を両面描画に
    }
  });

  return { AIships, fishBoats, tugs };
}
