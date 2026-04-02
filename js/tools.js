'use strict';
// ============================================================
//  tools.js — 電子海図モニター (ECDIS) 【疑似水深ジェネレーター搭載版】
// ============================================================

let toolOpen = false;
let mapCv = null;
let mapCtx = null;
let geoData = null;
let depthData = []; // 水深データを格納する配列

// ★追加：ECDIS操作用の変数
let ecdisScale = 25; // 初期スケール
let panX = 0;        // 画面の横ズレ
let panY = 0;        // 画面の縦ズレ
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// ★地図データを読み込んだ直後に、疑似水深を自動生成する！
fetch('./tokyobay.geojson?v=' + Date.now())
  .then(res => res.json())
  .then(data => { 
    geoData = data; 
    console.log("ECDIS: 海図データのロード完了"); 
    generateRealisticDepths(); // 水深自動生成スタート！
  })
  .catch(err => console.error("ECDISエラー:", err));

const ORIGIN_LAT = 35.45;
const ORIGIN_LON = 139.75;

function latLonToXZ(lat, lon) {
  const x = (lon - ORIGIN_LON) * 111320 * Math.cos(ORIGIN_LAT * Math.PI / 180);
  const z = (lat - ORIGIN_LAT) * 111320; 
  return { x, z };
}

// ============================================================
// 🌊 リアル疑似水深ジェネレーター（海岸線からの距離で深さを計算）
// ============================================================
function generateRealisticDepths() {
  if (!geoData) return;
  console.log("🌊 リアル疑似水深データの生成を開始します...");
  
  // 1. 計算を高速化するために、海岸線の座標（点）をすべて抽出
  const landPoints = [];
  geoData.features.forEach(feat => {
    if (!feat.geometry) return;
    const type = feat.geometry.type;
    const coords = feat.geometry.coordinates;

    const addPoints = (points) => {
      points.forEach(p => {
         const {x, z} = latLonToXZ(p[1], p[0]);
         landPoints.push({x, z});
      });
    };

    if (type === 'LineString') addPoints(coords);
    else if (type === 'Polygon') coords.forEach(r => addPoints(r));
    else if (type === 'MultiPolygon') coords.forEach(poly => poly.forEach(r => addPoints(r)));
  });

  // ★ 実務的危険度に基づく、東京湾5大危険水域の錬成
  const famousShoals = [
    // ① 中ノ瀬（木更津沖：広大な浅瀬。この中心を貫く航路から外れると即座に10m前後の水深に捕まる）
    { name: "Nakanose", pos: latLonToXZ(35.4200, 139.7750), radius: 4500, depth: 10.0 },
    
    // ② 富津岬〜第一海堡ライン（張り出す浅瀬。変針時の潮流圧流で逸脱しやすい罠）
    { name: "Futtsu - Fort No.1", pos: latLonToXZ(35.3150, 139.7900), radius: 3500, depth: 5.0 },
    
    // ③ 観音崎周辺（湾口の最難関。狭水道・交通密集・急流のトリプルコンボ＋岩礁）
    { name: "Kannonzaki", pos: latLonToXZ(35.2600, 139.7500), radius: 1200, depth: 8.0 },
    
    // ④ 盤洲干潟（航路外の広大な罠。他船避航などで東側に逃げすぎると終わる）
    { name: "Banzu Flat", pos: latLonToXZ(35.4000, 139.9000), radius: 6000, depth: 2.0 },
    
    // ⑤ 羽田沖（多摩川河口の土砂堆積。東京港・川崎港アプローチ時の脅威）
    { name: "Haneda Offshore", pos: latLonToXZ(35.5400, 139.8000), radius: 2500, depth: 7.0 }
  ];

  // 2. 東京湾全体（50km四方）に、600m間隔で水深の「点」をばらまく
  for (let x = -25000; x <= 25000; x += 600) { 
    for (let z = -25000; z <= 25000; z += 600) {
      
      let minDist = Infinity;
      // 近くの陸地（海岸線）との距離を測る（高速化のため5つ飛ばしで計算）
      for (let i = 0; i < landPoints.length; i += 5) {
        const lp = landPoints[i];
        const dist = Math.sqrt((lp.x - x)**2 + (lp.z - z)**2);
        if (dist < minDist) minDist = dist;
      }

      // 3. 陸地から離れている場所（海）だけに水深を設定する
      if (minDist > 100) { 
        // 基本計算：距離50mにつき1m深くなる ＋ ランダムなデコボコ
        let calculatedDepth = (minDist / 50) + (Math.random() * 3 - 1.5); 
        
        // ★ 危険水域（浅瀬）の判定を上書き
        famousShoals.forEach(s => {
          const dToShoal = Math.sqrt((s.pos.x - x)**2 + (s.pos.z - z)**2);
          if (dToShoal < s.radius) {
            // 中心に近いほど指定の水深に近づける
            const ratio = 1.0 - (dToShoal / s.radius);
            calculatedDepth = calculatedDepth * (1 - ratio) + s.depth * ratio;
          }
        });

        // 水深の限界値を 2.5m 〜 45.0m に設定
        calculatedDepth = Math.max(2.5, Math.min(45.0, calculatedDepth)); 
        
        // 点が規則的なグリッドに並ばないように、座標も少しズラす
        const offsetX = (Math.random() - 0.5) * 200;
        const offsetZ = (Math.random() - 0.5) * 200;
        
        depthData.push({ x: x + offsetX, z: z + offsetZ, depth: calculatedDepth });
      }
    }
  }
  console.log(`ECDIS: リアル疑似水深データ（${depthData.length}地点）の生成完了！`);
}

// ============================================================
// 現在地の水深を取得する関数
// ============================================================
export function getRealDepthAt(posX, posZ) {
  if (depthData.length === 0) return 99.9; 
  let closestDepth = 99.9;
  let minDistance = Infinity;
  for (let i = 0; i < depthData.length; i++) {
    const pt = depthData[i];
    const distSq = (pt.x - posX) ** 2 + (pt.z - posZ) ** 2;
    // 500m以内で一番近い水深点のデータを採用
    if (distSq < minDistance && distSq < 250000) { 
      minDistance = distSq;
      closestDepth = pt.depth;
    }
  }
  return closestDepth;
}

function initMap() {
  if (mapCv) return;
  mapCv = document.createElement('canvas');
  mapCv.id = 'ecdis-monitor';
  
  Object.assign(mapCv.style, {
    position: 'absolute', top: '10%', left: '10%', width: '80%', height: '80%',
    // ★ 変更：ネオンを消し、本物のECDIS（Duskモード）の海の色に変更
    backgroundColor: '#0a1a2a', 
    border: '2px solid #23374d', 
    borderRadius: '4px',
    boxShadow: '0 4px 15px rgba(0,0,0,0.5)', // グロウ効果を消して普通の影に
    zIndex: '500', display: 'none', 
    pointerEvents: 'auto'
  });
  
  document.body.appendChild(mapCv);
  mapCtx = mapCv.getContext('2d');

  // --- マウスイベントの設定（前回と同じ） ---
  mapCv.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  mapCv.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    panX += dx;
    panY += dy;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  mapCv.addEventListener('mouseup', () => isDragging = false);
  mapCv.addEventListener('mouseleave', () => isDragging = false);

  mapCv.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      ecdisScale = Math.max(5, ecdisScale * 0.8); 
    } else {
      ecdisScale = Math.min(250, ecdisScale * 1.25); 
    }
  });

  mapCv.addEventListener('dblclick', () => {
    panX = 0;
    panY = 0;
    ecdisScale = 25;
  });
}

export function isToolOpen() { return toolOpen; }
export function toggleTool() {
  initMap();
  toolOpen = !toolOpen;
  mapCv.style.display = toolOpen ? 'block' : 'none';
  if (toolOpen) {
    mapCv.width = mapCv.clientWidth;
    mapCv.height = mapCv.clientHeight;
  }
}

export function drawAll(P, AIships, fishBoats, buoys, curM) {
  if (!toolOpen || !mapCtx) return;

  const w = mapCv.width;
  const h = mapCv.height;
  mapCtx.clearRect(0, 0, w, h);

  const cx = (w / 2) + panX;
  const cy = (h / 2) + panY;

  // --- グリッド線（目立たないグレーブルーに変更） ---
  mapCtx.strokeStyle = 'rgba(100, 120, 140, 0.2)';
  mapCtx.lineWidth = 1;
  mapCtx.beginPath();
  for (let i = 0; i < w; i += 60) { mapCtx.moveTo(i, 0); mapCtx.lineTo(i, h); }
  for (let i = 0; i < h; i += 60) { mapCtx.moveTo(0, i); mapCtx.lineTo(w, i); }
  mapCtx.stroke();

  // --- 陸地の描画（塗りつぶしを追加） ---
  if (geoData) {
    // 陸地の色（夜間・夕暮れ用のオリーブブラウン）
    mapCtx.fillStyle = '#3b3524'; 
    // 海岸線の色
    mapCtx.strokeStyle = '#59523e'; 
    mapCtx.lineWidth = 1.5;

    geoData.features.forEach(feat => {
      if (!feat.geometry) return;
      const type = feat.geometry.type;
      const coords = feat.geometry.coordinates;

      // isPolygonフラグを追加して、陸地の場合は塗りつぶす
      const drawShape = (points, isPolygon) => {
        mapCtx.beginPath();
        points.forEach((p, i) => {
          const { x, z } = latLonToXZ(p[1], p[0]);
          const dx = x - P.posX;
          const dz = z - P.posZ; 
          const sx = cx + dx / ecdisScale; 
          const sy = cy - dz / ecdisScale; 

          if (i === 0) mapCtx.moveTo(sx, sy);
          else mapCtx.lineTo(sx, sy);
        });
        
        if (isPolygon) {
          mapCtx.closePath();
          mapCtx.fill(); // ★ ここで陸地を塗りつぶす！
        }
        mapCtx.stroke();
      };

      if (type === 'LineString') drawShape(coords, false);
      else if (type === 'Polygon') coords.forEach(r => drawShape(r, true));
      else if (type === 'MultiPolygon') coords.forEach(poly => poly.forEach(r => drawShape(r, true)));
    });
  }

  // --- ECDIS上に水深の数値をプロット ---
  if (depthData.length > 0) {
    const safetyDepth = 15.0; 
    const drawnPositions = []; 
    mapCtx.textAlign = 'center';
    
    depthData.forEach((pt) => {
      if (pt.depth >= 50.0) return;

      const dx = pt.x - P.posX;
      const dz = pt.z - P.posZ; 
      const sx = cx + dx / ecdisScale; 
      const sy = cy - dz / ecdisScale; 
      
      if (sx > 0 && sx < w && sy > 0 && sy < h) {
        const isOverlapping = drawnPositions.some(p => Math.abs(p.x - sx) < 25 && Math.abs(p.y - sy) < 15);
        if (isOverlapping) return;

        drawnPositions.push({ x: sx, y: sy });

        if (pt.depth <= safetyDepth) {
          mapCtx.fillStyle = '#ffcc00'; // 浅瀬：イエロー
          mapCtx.font = 'bold 11px Arial, sans-serif'; // フォントもシステムライクに
        } else {
          mapCtx.fillStyle = '#7a8b9c'; // 安全：落ち着いたグレーブルー
          mapCtx.font = '10px Arial, sans-serif';
        }
        mapCtx.fillText(pt.depth.toFixed(1), sx, sy);
      }
    });
  }

  // --- ブイの描画 ---
  buoys.forEach(b => {
    if(!b.position) return;
    const dx = b.position.x - P.posX;
    const dz = b.position.z - P.posZ;
    const sx = cx + dx / ecdisScale; 
    const sy = cy - dz / ecdisScale; 
    mapCtx.fillStyle = b.material.color.getHexString() === 'ff2222' ? '#ff3333' : '#33ff33';
    mapCtx.beginPath(); mapCtx.arc(sx, sy, 3, 0, Math.PI * 2); mapCtx.fill();
  });

  // --- 他船（AISターゲット）の描画 ---
  AIships.concat(fishBoats).forEach(s => {
    const pos = s.mesh ? s.mesh.position : s.position; 
    if (!pos) return;
    const dx = pos.x - P.posX;
    const dz = pos.z - P.posZ;
    const sx = cx + dx / ecdisScale; 
    const sy = cy - dz / ecdisScale; 
    
    mapCtx.save();
    mapCtx.translate(sx, sy);
    mapCtx.rotate(s.heading);

    // ★ 変更：本物のAISターゲットのような「緑色の枠線」に変更
    mapCtx.beginPath();
    mapCtx.moveTo(0, -8);  
    mapCtx.lineTo(5, 5);   
    mapCtx.lineTo(-5, 5);  
    mapCtx.closePath();
    mapCtx.strokeStyle = '#00ff00'; // AISグリーン
    mapCtx.lineWidth = 1.5;
    mapCtx.stroke(); // 塗りつぶさず枠だけ

    mapCtx.beginPath();
    mapCtx.moveTo(0, -8);
    mapCtx.lineTo(0, -25); // スピードベクター（予測線）
    mapCtx.stroke();

    mapCtx.restore();
  });

  // --- 自船の描画 ---
  mapCtx.save();
  mapCtx.translate(cx, cy);
  mapCtx.rotate(P.heading); 

  // ★ 変更：自船を「白い枠線のみ」のシャープなデザインに変更
  mapCtx.beginPath();
  mapCtx.moveTo(0, -12); 
  mapCtx.lineTo(6, 8);  
  mapCtx.lineTo(0, 4);   
  mapCtx.lineTo(-6, 8); 
  mapCtx.closePath();
  
  mapCtx.lineWidth = 2;
  mapCtx.strokeStyle = '#ffffff'; // 自船は白
  mapCtx.fillStyle = 'rgba(0,0,0,0)'; // 中身は透明
  mapCtx.stroke();
  
  mapCtx.beginPath();
  mapCtx.moveTo(0, -12);
  mapCtx.lineTo(0, -60); // ヘディングライン（長め）
  mapCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  mapCtx.stroke();

  mapCtx.restore();

  // --- 左上の情報テキスト（システムライクなフォント・色に変更） ---
  mapCtx.fillStyle = '#a6b8c7'; // テキストを落ち着いたグレーブルーに
  mapCtx.font = 'bold 14px Arial, sans-serif';
  mapCtx.textAlign = 'left';
  mapCtx.textBaseline = 'top';
  mapCtx.fillText('ECDIS - TOKYO BAY SYSTEM', 20, 20);
  
  mapCtx.font = '12px Arial, sans-serif';
  mapCtx.fillStyle = '#d0d8e0'; // 数値部分は少し明るく
  mapCtx.fillText(`SCALE : 1:${Math.round(ecdisScale * 100)}`, 20, 45);
  mapCtx.fillText(`POS X : ${Math.round(P.posX)} m`, 20, 65);
  mapCtx.fillText(`POS Z : ${Math.round(P.posZ)} m`, 20, 80);
  
  let deg = (P.heading * 180 / Math.PI + 360) % 360;
  if (deg < 0) deg += 360;
  mapCtx.fillText(`HDG   : ${deg.toFixed(1)}°`, 20, 100);
  mapCtx.fillText(`SPD   : ${(P.speed).toFixed(1)} kt`, 20, 115);

  const currentDepth = getRealDepthAt(P.posX, P.posZ);
  mapCtx.fillText(`DEPTH : ${currentDepth === 99.9 ? '---' : currentDepth.toFixed(1)} m`, 20, 130);

  // 右下の操作ガイド
  mapCtx.textAlign = 'right';
  mapCtx.fillStyle = 'rgba(166, 184, 199, 0.6)';
  mapCtx.fillText('[Drag] Pan / [Wheel] Zoom / [DblClick] Reset', w - 20, h - 30);
}