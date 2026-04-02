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
// 🌊 リアル疑似水深ジェネレーター（厳密な陸地判定アルゴリズム搭載）
// ============================================================
function generateRealisticDepths() {
  if (!geoData) return;
  console.log("🌊 リアル疑似水深データ（高密度版）の生成を開始します...");
  
  const landPoints = [];
  const landPolygons = []; // ★ 陸地の「面」を保存する配列

  // 1. 陸地データの抽出と「面」の構築
  geoData.features.forEach(feat => {
    if (!feat.geometry) return;
    const type = feat.geometry.type;
    const coords = feat.geometry.coordinates;

    const extractPoints = (points) => {
      const poly = [];
      points.forEach(p => {
         const {x, z} = latLonToXZ(p[1], p[0]);
         landPoints.push({x, z});
         poly.push({x, z});
      });
      return poly;
    };

    if (type === 'Polygon') {
      coords.forEach(r => landPolygons.push(extractPoints(r)));
    } else if (type === 'MultiPolygon') {
      coords.forEach(poly => poly.forEach(r => landPolygons.push(extractPoints(r))));
    } else if (type === 'LineString') {
      const poly = extractPoints(coords);
      // ★ 枠線の始点と終点が近い（5km以内）なら、強制的に「陸地の面（ポリゴン）」として扱う
      const dist = Math.sqrt((coords[0][0] - coords[coords.length-1][0])**2 + (coords[0][1] - coords[coords.length-1][1])**2);
      if (dist < 0.05) { 
          landPolygons.push(poly);
      }
    }
  });

  // ★ PIP（Point in Polygon）アルゴリズム：指定した座標が「陸地の内側」かを厳密に判定
  function isPointInPolygon(px, pz, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          let xi = poly[i].x, zi = poly[i].z;
          let xj = poly[j].x, zj = poly[j].z;
          let intersect = ((zi > pz) != (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi);
          if (intersect) inside = !inside;
      }
      return inside;
  }

  const famousShoals = [
    { name: "Nakanose", pos: latLonToXZ(35.4200, 139.7750), radius: 4500, depth: 10.0 },
    { name: "Futtsu", pos: latLonToXZ(35.3150, 139.7900), radius: 3500, depth: 5.0 },
    { name: "Kannonzaki", pos: latLonToXZ(35.2600, 139.7500), radius: 1200, depth: 8.0 },
    { name: "Banzu", pos: latLonToXZ(35.4000, 139.9000), radius: 6000, depth: 2.0 },
    { name: "Haneda", pos: latLonToXZ(35.5400, 139.8000), radius: 2500, depth: 7.0 }
  ];

  // 2. 水深データの生成（隙間をなくすため、600m→300m間隔の高密度に強化！）
  for (let x = -25000; x <= 25000; x += 300) { 
    for (let z = -25000; z <= 25000; z += 300) {
      
      // ★ 最重要：この座標が「陸地」なら、水深データは絶対に作らない（スキップ）
      let onLand = false;
      for (let i = 0; i < landPolygons.length; i++) {
          if (isPointInPolygon(x, z, landPolygons[i])) {
              onLand = true; break;
          }
      }
      if (onLand) continue; 

      // 陸地からの距離を計算（高速化のため間引いて計算）
      let minDist = Infinity;
      for (let i = 0; i < landPoints.length; i += 5) {
        const dist = Math.abs(landPoints[i].x - x) + Math.abs(landPoints[i].z - z);
        if (dist < minDist) minDist = dist;
      }
      minDist = minDist * 0.7; // 近似値

      if (minDist > 50) { 
        let calculatedDepth = (minDist / 50) + (Math.random() * 2 - 1); 

        famousShoals.forEach(s => {
          const dToShoal = Math.sqrt((s.pos.x - x)**2 + (s.pos.z - z)**2);
          if (dToShoal < s.radius) {
            const ratio = 1.0 - (dToShoal / s.radius);
            calculatedDepth = calculatedDepth * (1 - ratio) + s.depth * ratio;
          }
        });

        calculatedDepth = Math.max(2.5, Math.min(45.0, calculatedDepth)); 
        
        const offsetX = (Math.random() - 0.5) * 100;
        const offsetZ = (Math.random() - 0.5) * 100;
        
        depthData.push({ x: x + offsetX, z: z + offsetZ, depth: calculatedDepth });
      }
    }
  }
  console.log(`ECDIS: リアル疑似水深データ（${depthData.length}地点）の生成完了！`);
}

export function getRealDepthAt(posX, posZ) {
  if (depthData.length === 0) return 99.9; 
  let closestDepth = 99.9;
  let minDistance = Infinity;
  for (let i = 0; i < depthData.length; i++) {
    const pt = depthData[i];
    const distSq = (pt.x - posX) ** 2 + (pt.z - posZ) ** 2;
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
    
    // ★追加：パン（移動）できる範囲を制限して、画面の外側へ行きすぎないようにする！
    const limit = 800; 
    panX = Math.max(-limit, Math.min(limit, panX));
    panY = Math.max(-limit, Math.min(limit, panY));

    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  mapCv.addEventListener('mouseup', (e) => { e.stopPropagation(); isDragging = false; });
  mapCv.addEventListener('mouseleave', (e) => { e.stopPropagation(); isDragging = false; });

  mapCv.addEventListener('wheel', (e) => {
    e.stopPropagation(); 
    e.preventDefault(); 
    if (e.deltaY < 0) {
      ecdisScale = Math.max(5, ecdisScale * 0.8); // ズームイン限界（詳細化）
    } else {
      // ★修正：ズームアウト限界を 250 から 80 に変更！
      ecdisScale = Math.min(80, ecdisScale * 1.25); 
    }
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

// ============================================================
//  2. 海図の描画（水深表示オフ・陸と海を正確に分ける完全版）
// ============================================================
// ============================================================
//  2. 海図の描画（陸地と海の「完璧な分離」アルゴリズム搭載版）
// ============================================================
export function drawAll(P, AIships, fishBoats, buoys, curM) {
  if (!toolOpen || !mapCtx) return;

  const w = mapCv.width;
  const h = mapCv.height;
  const cx = (w / 2) + panX;
  const cy = (h / 2) + panY;

  // 1. まず画面全体を「海（本物のECDISに近い落ち着いた青色）」で塗りつぶす
  mapCtx.fillStyle = '#a6c9db'; 
  mapCtx.fillRect(0, 0, w, h);

  // 2. グリッド線
  mapCtx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
  mapCtx.lineWidth = 1;
  mapCtx.beginPath();
  for (let i = 0; i < w; i += 60) { mapCtx.moveTo(i, 0); mapCtx.lineTo(i, h); }
  for (let i = 0; i < h; i += 60) { mapCtx.moveTo(0, i); mapCtx.lineTo(w, i); }
  mapCtx.stroke();

  // 3. 陸地と海の完全分離アルゴリズム
  if (geoData) {
    const rawLines = [];
    const polygons = [];

    // データを「線（海岸線）」と「面（島）」に分ける
    geoData.features.forEach(feat => {
      if (!feat.geometry) return;
      const type = feat.geometry.type;
      const coords = feat.geometry.coordinates;
      if (type === 'LineString') rawLines.push(coords);
      else if (type === 'Polygon') coords.forEach(r => polygons.push(r));
      else if (type === 'MultiPolygon') coords.forEach(poly => poly.forEach(r => polygons.push(r)));
    });

    // ★ ステッチング処理：途切れた海岸線を1本の長い線に縫い合わせる
    let stitched = true;
    while(stitched) {
      stitched = false;
      for (let i = 0; i < rawLines.length; i++) {
        for (let j = 0; j < rawLines.length; j++) {
          if (i === j) continue;
          const lineA = rawLines[i];
          const lineB = rawLines[j];
          // Aの終点とBの始点が同じなら繋げる
          if (lineA[lineA.length - 1][0] === lineB[0][0] && lineA[lineA.length - 1][1] === lineB[0][1]) {
            rawLines[i] = lineA.concat(lineB.slice(1));
            rawLines.splice(j, 1);
            stitched = true;
            break;
          }
        }
        if (stitched) break;
      }
    }

    // --- 面データ（島など）の描画 ---
    mapCtx.fillStyle = '#dcb982'; // 陸地の黄土色
    polygons.forEach(coords => {
        mapCtx.beginPath();
        coords.forEach((p, i) => {
           const { x, z } = latLonToXZ(p[1], p[0]);
           const sx = cx + (x - P.posX) / ecdisScale;
           const sy = cy - (z - P.posZ) / ecdisScale;
           if (i === 0) mapCtx.moveTo(sx, sy);
           else mapCtx.lineTo(sx, sy);
        });
        mapCtx.closePath();
        mapCtx.fill(); // 島を塗る
        mapCtx.strokeStyle = '#222222';
        mapCtx.lineWidth = 1.0;
        mapCtx.stroke();
    });

    // --- 線データ（本州・千葉などの海岸線）の描画 ---
    rawLines.forEach(coords => {
        mapCtx.beginPath();
        coords.forEach((p, i) => {
           const { x, z } = latLonToXZ(p[1], p[0]);
           const sx = cx + (x - P.posX) / ecdisScale;
           const sy = cy - (z - P.posZ) / ecdisScale;
           if (i === 0) mapCtx.moveTo(sx, sy);
           else mapCtx.lineTo(sx, sy);
        });

        // ★ 最重要：ただの線だった海岸線を、強引に「面」にして陸地を塗る処理
        if (coords.length > 5) {
           const start = coords[0];
           const end = coords[coords.length - 1];
           
           // 始点と終点が繋がっていない（開いた線である）場合、関東平野側（北）を大きく囲い込む
           if (start[0] !== end[0] || start[1] !== end[1]) {
               const sY = cy - (latLonToXZ(start[1], start[0]).z - P.posZ) / ecdisScale;
               const eY = cy - (latLonToXZ(end[1], end[0]).z - P.posZ) / ecdisScale;
               
               const FAR_NORTH = -99999;
               const FAR_WEST = -99999;
               const FAR_EAST = 99999;

               // 千葉の端から遥か東 → 遥か北 → 遥か西 → 横須賀の端へと四角く結んで閉じる！
               mapCtx.lineTo(FAR_EAST, eY); 
               mapCtx.lineTo(FAR_EAST, FAR_NORTH); 
               mapCtx.lineTo(FAR_WEST, FAR_NORTH); 
               mapCtx.lineTo(FAR_WEST, sY); 
           }
           mapCtx.closePath();
           
           mapCtx.fillStyle = '#dcb982';
           mapCtx.fill(); // これで本州・千葉・神奈川がすべて黄土色に塗られる！
        }

        // 最後に黒い枠線を引く
        mapCtx.strokeStyle = '#222222';
        mapCtx.lineWidth = 1.0;
        mapCtx.stroke();
    });
  }

  // 4. 水深の数字プロット（余計な色はつけず、数字だけをシンプルに表示）
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
          mapCtx.fillStyle = '#555555'; // 安全：グレーの細字
          mapCtx.font = '10px Arial, sans-serif';
        }
        mapCtx.fillText(pt.depth.toFixed(1), sx, sy);
      }
    });
  }

  // 5. ブイの描画
  buoys.forEach(b => {
    if(!b.position) return;
    const dx = b.position.x - P.posX;
    const dz = b.position.z - P.posZ;
    const sx = cx + dx / ecdisScale; 
    const sy = cy - dz / ecdisScale; 
    mapCtx.fillStyle = b.material.color.getHexString() === 'ff2222' ? '#ff3333' : '#33ff33';
    mapCtx.beginPath(); mapCtx.arc(sx, sy, 3, 0, Math.PI * 2); mapCtx.fill();
  });

  // 6. 他船（AISターゲット）の描画
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

  // 7. 自船の描画
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

  // 8. 左上の情報テキスト
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