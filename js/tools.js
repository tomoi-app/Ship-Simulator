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
    backgroundColor: '#ffffff', // ベースは白（深海）
    border: '4px solid #4a5b6c', // ECDISのベゼル枠
    borderRadius: '2px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    zIndex: '500', display: 'none', 
    pointerEvents: 'auto'
  });
  
  document.body.appendChild(mapCv);
  mapCtx = mapCv.getContext('2d');

  // ★大修正：e.stopPropagation() を追加して、裏側の3D視点操作を完全にブロック！
  mapCv.addEventListener('mousedown', (e) => {
    e.stopPropagation(); 
    isDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  mapCv.addEventListener('mousemove', (e) => {
    e.stopPropagation();
    if (!isDragging) return;
    panX += e.clientX - lastMouseX;
    panY += e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  mapCv.addEventListener('mouseup', (e) => { e.stopPropagation(); isDragging = false; });
  mapCv.addEventListener('mouseleave', (e) => { e.stopPropagation(); isDragging = false; });

  mapCv.addEventListener('wheel', (e) => {
    e.stopPropagation(); 
    e.preventDefault(); // 画面スクロールも防止
    if (e.deltaY < 0) ecdisScale = Math.max(5, ecdisScale * 0.8); 
    else ecdisScale = Math.min(250, ecdisScale * 1.25); 
  });

  mapCv.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    panX = 0; panY = 0; ecdisScale = 25;
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
  const cx = (w / 2) + panX;
  const cy = (h / 2) + panY;

  // ★ 魔法のトリック1：画面全体をまず「陸地（黄土色）」で塗りつぶす！
  // これにより、どんなにデータが欠けていても枠線の内側は必ず陸地になります。
  mapCtx.fillStyle = '#dcb982'; 
  mapCtx.fillRect(0, 0, w, h);

  // --- 海の描画（青色の滑らかなグラデーション） ---
  if (depthData.length > 0) {
    depthData.forEach((pt) => {
      const dx = pt.x - P.posX;
      const dz = pt.z - P.posZ; 
      const sx = cx + dx / ecdisScale; 
      const sy = cy - dz / ecdisScale; 
      
      // 海の描画半径（グリッドの隙間を埋める大きさ）
      const radius = 600 / ecdisScale; 
      
      if (sx > -radius && sx < w + radius && sy > -radius && sy < h + radius) {
        // ★ 魔法のトリック2：水深(0m〜25m)に応じた滑らかな青色グラデーション（白は不使用）
        // 浅い(0m) = 濃い青 rgb(60, 120, 170)
        // 深い(25m以上) = 薄い青 rgb(170, 200, 220)
        let ratio = Math.max(0, Math.min(1, pt.depth / 25.0));
        const r = Math.floor(60 + (170 - 60) * ratio);
        const g = Math.floor(120 + (200 - 120) * ratio);
        const b = Math.floor(170 + (220 - 170) * ratio);

        mapCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        mapCtx.beginPath();
        mapCtx.arc(sx, sy, radius, 0, Math.PI * 2);
        mapCtx.fill();
      }
    });
  }

  // --- グリッド線（目立たないグレー） ---
  mapCtx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
  mapCtx.lineWidth = 1;
  mapCtx.beginPath();
  for (let i = 0; i < w; i += 60) { mapCtx.moveTo(i, 0); mapCtx.lineTo(i, h); }
  for (let i = 0; i < h; i += 60) { mapCtx.moveTo(0, i); mapCtx.lineTo(w, i); }
  mapCtx.stroke();

  // --- 海岸線と陸地の描画 ---
  if (geoData) {
    geoData.features.forEach(feat => {
      if (!feat.geometry) return;
      const type = feat.geometry.type;
      const coords = feat.geometry.coordinates;

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
        
        // 本当のポリゴンの場合のみ閉じる（直線バグ防止）
        if (isPolygon) {
          mapCtx.closePath();
        }

        // ★ 魔法のトリック3：海岸線に「現実の1000m幅」の黄土色の線を引く
        // これが消しゴムの役割を果たし、陸地に食い込んだ海を綺麗に消し去ります！
        mapCtx.lineWidth = 1000 / ecdisScale; 
        mapCtx.strokeStyle = '#dcb982'; // 陸地色
        mapCtx.stroke();

        // 最後に、実際の海岸線を細い黒で描画する
        mapCtx.lineWidth = 1.0;
        mapCtx.strokeStyle = '#222222';
        mapCtx.stroke();
      };

      // LineString（線）は閉じない（false）設定に戻しました！
      if (type === 'LineString') drawShape(coords, false); 
      else if (type === 'Polygon') coords.forEach(r => drawShape(r, true));
      else if (type === 'MultiPolygon') coords.forEach(poly => poly.forEach(r => drawShape(r, true)));
    });
  }

  // --- 水深の数字プロット ---
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
          mapCtx.fillStyle = '#000000'; // 浅瀬：黒の太字
          mapCtx.font = 'bold 11px Arial, sans-serif'; 
        } else {
          mapCtx.fillStyle = '#666666'; // 安全水深以上：グレーの細字
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

    mapCtx.beginPath();
    mapCtx.moveTo(0, -8);  
    mapCtx.lineTo(5, 5);   
    mapCtx.lineTo(-5, 5);  
    mapCtx.closePath();
    mapCtx.strokeStyle = '#000000'; 
    mapCtx.lineWidth = 1.5;
    mapCtx.stroke(); 

    mapCtx.beginPath();
    mapCtx.moveTo(0, -8);
    mapCtx.lineTo(0, -25); 
    mapCtx.stroke();
    mapCtx.restore();
  });

  // --- 自船の描画 ---
  mapCtx.save();
  mapCtx.translate(cx, cy);
  mapCtx.rotate(P.heading); 

  mapCtx.beginPath();
  mapCtx.moveTo(0, -12); 
  mapCtx.lineTo(6, 8);  
  mapCtx.lineTo(0, 4);   
  mapCtx.lineTo(-6, 8); 
  mapCtx.closePath();
  
  mapCtx.lineWidth = 2;
  mapCtx.strokeStyle = '#000000'; 
  mapCtx.fillStyle = 'rgba(0,0,0,0)'; 
  mapCtx.stroke();
  
  mapCtx.beginPath();
  mapCtx.moveTo(0, -12);
  mapCtx.lineTo(0, -60); 
  mapCtx.strokeStyle = '#000000';
  mapCtx.stroke();
  mapCtx.restore();

  // --- 左上の情報テキスト ---
  mapCtx.fillStyle = '#000000'; 
  mapCtx.font = 'bold 14px Arial, sans-serif';
  mapCtx.textAlign = 'left';
  mapCtx.textBaseline = 'top';
  mapCtx.fillText('ECDIS - TOKYO BAY SYSTEM', 20, 20);
  
  mapCtx.font = '12px Arial, sans-serif';
  mapCtx.fillText(`SCALE : 1:${Math.round(ecdisScale * 100)}`, 20, 45);
  mapCtx.fillText(`POS X : ${Math.round(P.posX)} m`, 20, 65);
  mapCtx.fillText(`POS Z : ${Math.round(P.posZ)} m`, 20, 80);
  
  let deg = (P.heading * 180 / Math.PI + 360) % 360;
  if (deg < 0) deg += 360;
  mapCtx.fillText(`HDG   : ${deg.toFixed(1)}°`, 20, 100);
  mapCtx.fillText(`SPD   : ${(P.speed).toFixed(1)} kt`, 20, 115);

  const currentDepth = getRealDepthAt(P.posX, P.posZ);
  mapCtx.fillText(`DEPTH : ${currentDepth === 99.9 ? '---' : currentDepth.toFixed(1)} m`, 20, 130);

  mapCtx.textAlign = 'right';
  mapCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  mapCtx.fillText('[Drag] Pan / [Wheel] Zoom / [DblClick] Reset', w - 20, h - 30);
}