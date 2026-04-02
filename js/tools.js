'use strict';
// ============================================================
//  tools.js — 電子海図モニター (ECDIS) 【等深線＆陸地判定 究極版】
// ============================================================

let toolOpen = false;
let mapCv = null;
let mapCtx = null;
let geoData = null;
let depthData = []; 

// ★ 陸地の面データを保存し、海図の計算を爆速にする変数
let parsedPolygonsXZ = []; 

let ecdisScale = 25; 
let panX = 0;        
let panY = 0;        
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

const ORIGIN_LAT = 35.45;
const ORIGIN_LON = 139.75;

function latLonToXZ(lat, lon) {
  const x = (lon - ORIGIN_LON) * 111320 * Math.cos(ORIGIN_LAT * Math.PI / 180);
  const z = (lat - ORIGIN_LAT) * 111320; 
  return { x, z };
}

// 平面直角座標(X, Z)から緯度経度へ逆変換する関数
function xzToLatLon(x, z) {
  const lat = (z / 111320) + ORIGIN_LAT;
  const lon = (x / (111320 * Math.cos(ORIGIN_LAT * Math.PI / 180))) + ORIGIN_LON;
  return { lat, lon };
}

// 緯度経度を海図で一般的な「度分表記 (XX° YY.YY')」に変換する関数
function formatLatLon(deg, isLat) {
  const absDeg = Math.abs(deg);
  const d = Math.floor(absDeg);
  const m = ((absDeg - d) * 60).toFixed(2);
  const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  return `${String(d).padStart(isLat ? 2 : 3, '0')}° ${String(m).padStart(5, '0')}' ${dir}`;
}

// ============================================================
// 1. 地図データのロードと「陸地ポリゴン」の生成（1回だけ実行）
// ============================================================
fetch('./tokyobay.geojson?v=' + Date.now())
  .then(res => res.json())
  .then(data => { 
    geoData = data; 
    console.log("ECDIS: 海図データのロード完了"); 

    const rawLines = [];
    data.features.forEach(feat => {
      if (!feat.geometry) return;
      const type = feat.geometry.type;
      const coords = feat.geometry.coordinates;
      if (type === 'LineString') rawLines.push(coords);
      else if (type === 'Polygon') coords.forEach(r => parsedPolygonsXZ.push({ poly: r.map(p => latLonToXZ(p[1], p[0])) }));
      else if (type === 'MultiPolygon') coords.forEach(poly => poly.forEach(r => parsedPolygonsXZ.push({ poly: r.map(p => latLonToXZ(p[1], p[0])) })));
    });

    // 海岸線を縫い合わせる
    let stitched = true;
    while(stitched) {
      stitched = false;
      for (let i = 0; i < rawLines.length; i++) {
        for (let j = 0; j < rawLines.length; j++) {
          if (i === j) continue;
          const lineA = rawLines[i];
          const lineB = rawLines[j];
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

    // 縫い合わせた本州の線を、北側で強引に囲って「巨大な陸地の面」にする
    rawLines.forEach(line => {
      let polyXZ = line.map(p => latLonToXZ(p[1], p[0]));
      if (line.length > 5) {
        const start = line[0];
        const end = line[line.length - 1];
        if (start[0] !== end[0] || start[1] !== end[1]) {
          const FAR_NORTH = 99999;
          const FAR_WEST = -99999;
          const FAR_EAST = 99999;
          const sY = latLonToXZ(start[1], start[0]).z;
          const eY = latLonToXZ(end[1], end[0]).z;
          polyXZ.push({x: FAR_EAST, z: eY});
          polyXZ.push({x: FAR_EAST, z: FAR_NORTH});
          polyXZ.push({x: FAR_WEST, z: FAR_NORTH});
          polyXZ.push({x: FAR_WEST, z: sY});
        }
        parsedPolygonsXZ.push({ poly: polyXZ });
      }
    });

    // 計算を高速化するため、各陸地の「境界ボックス（Bounding Box）」を計算
    parsedPolygonsXZ.forEach(item => {
       let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
       item.poly.forEach(p => {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.z < minZ) minZ = p.z;
          if (p.z > maxZ) maxZ = p.z;
       });
       item.bounds = { minX, maxX, minZ, maxZ };
    });

    generateRealisticDepths(); 
  })
  .catch(err => console.error("ECDISエラー:", err));

// ============================================================
// 2. 水深データの生成 — Web Worker で非同期実行（メインスレッド非ブロック）
// ============================================================
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

function generateRealisticDepths() {
  console.log("🌊 水深データ生成をWeb Workerに委譲...");

  // Web Worker のコードをBlob URLで生成（別ファイル不要）
  const workerCode = `
    function isPointInPolygon(px, pz, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        let xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
        let intersect = ((zi > pz) != (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }
    self.onmessage = function(e) {
      const { polygons, shoals } = e.data;
      const result = [];
      // 乱数を決定論的シードで再現できるよう簡易LCG使用
      let seed = 12345;
      function rand() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; }

      for (let x = -30000; x <= 60000; x += 300) {
        for (let z = -75000; z <= 30000; z += 300) {
          let onLand = false;
          for (let i = 0; i < polygons.length; i++) {
            const { poly, bounds } = polygons[i];
            if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
            if (isPointInPolygon(x, z, poly)) { onLand = true; break; }
          }
          if (onLand) continue;

          let depth = 25.0 + rand() * 5;
          shoals.forEach(s => {
            const d = Math.sqrt((s.pos.x - x)**2 + (s.pos.z - z)**2);
            if (d < s.radius) {
              const ratio = 1.0 - Math.pow(d / s.radius, 2);
              depth = depth * (1 - ratio) + s.depth * ratio;
            }
          });
          depth = Math.max(2.5, Math.min(45.0, depth));
          const ox = (rand() - 0.5) * 150, oz = (rand() - 0.5) * 150;
          result.push({ x: x + ox, z: z + oz, depth });
        }
      }
      self.postMessage(result);
    };
  `;
  const blob   = new Blob([workerCode], { type: 'application/javascript' });
  const worker = new Worker(URL.createObjectURL(blob));

  const famousShoals = [
    { name: "中ノ瀬",   pos: latLonToXZ(35.4200, 139.7750), radius: 6000, depth: 9.0 },
    { name: "富津岬沖", pos: latLonToXZ(35.3150, 139.7900), radius: 4000, depth: 3.0 },
    { name: "観音崎",   pos: latLonToXZ(35.2600, 139.7500), radius: 2000, depth: 8.0 },
    { name: "盤洲干潟", pos: latLonToXZ(35.4000, 139.9000), radius: 6000, depth: 2.0 },
    { name: "羽田沖",   pos: latLonToXZ(35.5400, 139.8000), radius: 3000, depth: 7.0 },
  ];

  worker.postMessage({ polygons: parsedPolygonsXZ, shoals: famousShoals });

  worker.onmessage = function(e) {
    depthData.length = 0;
    e.data.sort((a, b) => b.depth - a.depth).forEach(pt => depthData.push(pt));
    _buildDepthGrid();  // グリッドインデックスを構築
    console.log(`ECDIS: 水深データ（${depthData.length}地点）生成完了！`);
    worker.terminate();
    URL.revokeObjectURL(blob);
  };

  worker.onerror = function(err) {
    console.error("水深Workerエラー:", err);
    worker.terminate();
  };
}

// ============================================================
// グリッドインデックス（O(1)深度検索）
// ============================================================
const GRID_CELL = 600;   // セルサイズ（水深データの間隔300mの2倍）
const depthGrid = new Map();

// --- ここから追加：空間補間（Interpolation）用のデータ ---
const GRID_START_X = -30000, GRID_END_X = 60000;
const GRID_START_Z = -75000, GRID_END_Z = 30000;
const RENDER_STEP = 600; // 描画用の空間補間解像度（メートル）
let renderGrid = null;
let gridCols = 0;
let gridRows = 0;
// --- ここまで追加 ---

function _gridKey(x, z) {
  return `${Math.round(x / GRID_CELL)},${Math.round(z / GRID_CELL)}`;
}

function _buildDepthGrid() {
  depthGrid.clear();
  depthData.forEach(pt => {
    const key = _gridKey(pt.x, pt.z);
    if (!depthGrid.has(key)) depthGrid.set(key, pt.depth);
  });

  // --- ここから追加：等深線描画のための空間補間グリッド生成 ---
  gridCols = Math.ceil((GRID_END_X - GRID_START_X) / RENDER_STEP) + 1;
  gridRows = Math.ceil((GRID_END_Z - GRID_START_Z) / RENDER_STEP) + 1;
  renderGrid = new Float32Array(gridCols * gridRows);
  
  for(let r = 0; r < gridRows; r++) {
    for(let c = 0; c < gridCols; c++) {
      const gx = GRID_START_X + c * RENDER_STEP;
      const gz = GRID_START_Z + r * RENDER_STEP;
      // 既存の高速検索を使ってグリッドの各交点の深度を確定する
      renderGrid[r * gridCols + c] = getRealDepthAt(gx, gz);
    }
  }
  // --- ここまで追加 ---

  console.log(`ECDIS: 深度グリッド構築完了（${depthGrid.size}セル）`);
}

export function getRealDepthAt(posX, posZ) {
  if (depthGrid.size === 0) return 99.9;

  const key = _gridKey(posX, posZ);
  if (depthGrid.has(key)) return depthGrid.get(key);

  // 隣接8セルも探す
  const cx = Math.round(posX / GRID_CELL);
  const cz = Math.round(posZ / GRID_CELL);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const k = `${cx + dx},${cz + dz}`;
      if (depthGrid.has(k)) return depthGrid.get(k);
    }
  }
  return 99.9;
}

// ============================================================
// 3. UIと操作イベント
// ============================================================
function initMap() {
  if (mapCv) return;
  mapCv = document.createElement('canvas');
  mapCv.id = 'ecdis-monitor';
  
  Object.assign(mapCv.style, {
    position: 'absolute', top: '10%', left: '10%', width: '80%', height: '80%',
    backgroundColor: '#c6dbef', // ベースの海（深海）は落ち着いた青
    border: '4px solid #4a5b6c',
    borderRadius: '2px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    zIndex: '500', display: 'none', 
    pointerEvents: 'auto'
  });
  
  document.body.appendChild(mapCv);
  mapCtx = mapCv.getContext('2d');

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
    
    // 南の果てまで見に行けるように限界を拡大
    const limit = 6000;
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
    if (e.deltaY < 0) ecdisScale = Math.max(5, ecdisScale * 0.8); 
    else ecdisScale = Math.min(80, ecdisScale * 1.25); // ズームアウト制限
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
// 4. 海図の描画（等深帯・陸地・シンボル）
// ============================================================
export function drawAll(P, AIships, fishBoats, buoys, curM) {
  if (!toolOpen || !mapCtx) return;

  const w = mapCv.width;
  const h = mapCv.height;
  const cx = (w / 2) + panX;
  const cy = (h / 2) + panY;

  // ① ベースの海（白を使わない淡い青）
  mapCtx.fillStyle = '#c6dbef'; 
  mapCtx.fillRect(0, 0, w, h);

  // ② 水深による「等深帯（Color Bands）」と「等深線」の描画（空間補間グリッド使用）
  if (renderGrid) {
    // 処理を軽くするため、画面に見えている範囲のグリッドだけを計算する
    const worldMinX = P.posX - cx * ecdisScale;
    const worldMaxX = P.posX + (w - cx) * ecdisScale;
    const worldMaxZ = P.posZ + cy * ecdisScale; 
    const worldMinZ = P.posZ - (h - cy) * ecdisScale;

    const startC = Math.max(0, Math.floor((worldMinX - GRID_START_X) / RENDER_STEP) - 1);
    const endC   = Math.min(gridCols - 1, Math.ceil((worldMaxX - GRID_START_X) / RENDER_STEP) + 1);
    const startR = Math.max(0, Math.floor((worldMinZ - GRID_START_Z) / RENDER_STEP) - 1);
    const endR   = Math.min(gridRows - 1, Math.ceil((worldMaxZ - GRID_START_Z) / RENDER_STEP) + 1);

    // [A] 水深帯の塗りつぶし
    for(let r = startR; r < endR; r++) {
      for(let c = startC; c < endC; c++) {
        const d = renderGrid[r * gridCols + c];
        if (d >= 20.0) continue;

        if (d <= 5.0) mapCtx.fillStyle = '#4292c6';
        else if (d <= 10.0) mapCtx.fillStyle = '#6baed6';
        else mapCtx.fillStyle = '#9ecae1';

        const gx = GRID_START_X + c * RENDER_STEP;
        const gz = GRID_START_Z + r * RENDER_STEP;
        const sx = cx + (gx - P.posX) / ecdisScale;
        const sy = cy - (gz - P.posZ) / ecdisScale;
        const sSize = (RENDER_STEP / ecdisScale) + 1.5; // 隙間防止

        mapCtx.fillRect(sx - sSize/2, sy - sSize/2, sSize, sSize);
      }
    }

    // [B] マーチングスクエア法による滑らかな等深線の生成
    const drawContour = (threshold, color, width) => {
      mapCtx.beginPath();
      mapCtx.strokeStyle = color;
      mapCtx.lineWidth = width;
      mapCtx.lineCap = 'round';
      
      for(let r = startR; r < endR - 1; r++) {
        for(let c = startC; c < endC - 1; c++) {
          const v0 = renderGrid[r * gridCols + c];
          const v1 = renderGrid[r * gridCols + c + 1];
          const v2 = renderGrid[(r + 1) * gridCols + c + 1];
          const v3 = renderGrid[(r + 1) * gridCols + c];

          const b0 = v0 <= threshold, b1 = v1 <= threshold;
          const b2 = v2 <= threshold, b3 = v3 <= threshold;
          if (b0 === b1 && b1 === b2 && b2 === b3) continue; // 線が通らないセルはスキップ

          // 4つの角のワールド座標
          const pt0 = { x: GRID_START_X + c * RENDER_STEP,       z: GRID_START_Z + r * RENDER_STEP };
          const pt1 = { x: GRID_START_X + (c + 1) * RENDER_STEP, z: GRID_START_Z + r * RENDER_STEP };
          const pt2 = { x: GRID_START_X + (c + 1) * RENDER_STEP, z: GRID_START_Z + (r + 1) * RENDER_STEP };
          const pt3 = { x: GRID_START_X + c * RENDER_STEP,       z: GRID_START_Z + (r + 1) * RENDER_STEP };

          // 閾値に一致する正確な交点を線形補間で計算
          const interp = (pA, pB, valA, valB) => {
            const t = (threshold - valA) / (valB - valA + 1e-5);
            return { x: pA.x + t * (pB.x - pA.x), z: pA.z + t * (pB.z - pA.z) };
          };

          let points = [];
          if (b0 !== b1) points.push(interp(pt0, pt1, v0, v1)); // 上辺との交点
          if (b1 !== b2) points.push(interp(pt1, pt2, v1, v2)); // 右辺との交点
          if (b2 !== b3) points.push(interp(pt2, pt3, v2, v3)); // 下辺との交点
          if (b3 !== b0) points.push(interp(pt3, pt0, v3, v0)); // 左辺との交点

          if (points.length >= 2) {
            const sp1 = { x: cx + (points[0].x - P.posX) / ecdisScale, y: cy - (points[0].z - P.posZ) / ecdisScale };
            const sp2 = { x: cx + (points[1].x - P.posX) / ecdisScale, y: cy - (points[1].z - P.posZ) / ecdisScale };
            mapCtx.moveTo(sp1.x, sp1.y);
            mapCtx.lineTo(sp2.x, sp2.y);
            
            // 鞍点（線が交差する特殊なセル）の場合はもう1本引く
            if (points.length === 4) {
              const sp3 = { x: cx + (points[2].x - P.posX) / ecdisScale, y: cy - (points[2].z - P.posZ) / ecdisScale };
              const sp4 = { x: cx + (points[3].x - P.posX) / ecdisScale, y: cy - (points[3].z - P.posZ) / ecdisScale };
              mapCtx.moveTo(sp3.x, sp3.y);
              mapCtx.lineTo(sp4.x, sp4.y);
            }
          }
        }
      }
      mapCtx.stroke();
    };

    // 海図らしく 5m, 10m, 20m の等深線をくっきりと描画
    drawContour(5.0, '#1c5a8a', 1.8);
    drawContour(10.0, '#327ba8', 1.2);
    drawContour(20.0, '#5a9dc4', 1.0);
  }

  // ③ グリッド線
  mapCtx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
  mapCtx.lineWidth = 1;
  mapCtx.beginPath();
  for (let i = 0; i < w; i += 60) { mapCtx.moveTo(i, 0); mapCtx.lineTo(i, h); }
  for (let i = 0; i < h; i += 60) { mapCtx.moveTo(0, i); mapCtx.lineTo(w, i); }
  mapCtx.stroke();

  // ④ 陸地の描画（生成済みの完全なポリゴンを使うため超高速＆正確！）
  mapCtx.fillStyle = '#dcb982'; 
  mapCtx.strokeStyle = '#222222'; 
  mapCtx.lineWidth = 1.0;

  parsedPolygonsXZ.forEach(item => {
      mapCtx.beginPath();
      item.poly.forEach((pt, i) => {
         const sx = cx + (pt.x - P.posX) / ecdisScale;
         const sy = cy - (pt.z - P.posZ) / ecdisScale;
         if (i === 0) mapCtx.moveTo(sx, sy);
         else mapCtx.lineTo(sx, sy);
      });
      mapCtx.closePath();
      mapCtx.fill(); 
      mapCtx.stroke();
  });

  // ⑤ 水深の数字プロット（深海も含めてすべて描画するように変更）
  if (depthData.length > 0) {
    const safetyDepth = 15.0; 
    const drawnPositions = []; 
    mapCtx.textAlign = 'center';
    
    depthData.forEach((pt) => {
      // 20m以上の制限を削除し、全ての水深を描画対象にする
      
      const dx = pt.x - P.posX;
      const dz = pt.z - P.posZ; 
      const sx = cx + dx / ecdisScale; 
      const sy = cy - dz / ecdisScale; 
      
      if (sx > 0 && sx < w && sy > 0 && sy < h) {
        // 深い場所は数字が密集しないよう、間引き判定（overlapRadius）を広めにとる
        const overlapRadius = pt.depth >= 20.0 ? 60 : 35;
        const isOverlapping = drawnPositions.some(p => Math.abs(p.x - sx) < overlapRadius && Math.abs(p.y - sy) < overlapRadius * 0.6);
        if (isOverlapping) return;

        drawnPositions.push({ x: sx, y: sy });

        if (pt.depth <= safetyDepth) {
          mapCtx.fillStyle = '#000000'; // 浅瀬は黒で強調
          mapCtx.font = 'bold 11px Arial, sans-serif'; 
        } else {
          mapCtx.fillStyle = '#5a6b7c'; // 深海は少し落ち着いた色に
          mapCtx.font = '10px Arial, sans-serif';
        }
        mapCtx.fillText(pt.depth.toFixed(1), sx, sy);
      }
    });
  }

  // ⑥ ブイ
  buoys.forEach(b => {
    if(!b.position) return;
    const dx = b.position.x - P.posX;
    const dz = b.position.z - P.posZ;
    const sx = cx + dx / ecdisScale; 
    const sy = cy - dz / ecdisScale; 
    mapCtx.fillStyle = b.material.color.getHexString() === 'ff2222' ? '#ff3333' : '#33ff33';
    mapCtx.beginPath(); mapCtx.arc(sx, sy, 3, 0, Math.PI * 2); mapCtx.fill();
  });

  // ⑦ 他船（AISターゲット）
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

  // ⑧ 自船
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

  // ⑨ 情報テキスト
  mapCtx.fillStyle = '#000000'; 
  mapCtx.font = 'bold 14px Arial, sans-serif';
  mapCtx.textAlign = 'left';
  mapCtx.textBaseline = 'top';
  mapCtx.fillText('ECDIS - TOKYO BAY SYSTEM', 20, 20);
  
  mapCtx.font = '12px Arial, sans-serif';
  mapCtx.fillText(`SCALE : 1:${Math.round(ecdisScale * 100)}`, 20, 45);
  
  // 現在のX, Z座標を緯度経度に変換
  const ll = xzToLatLon(P.posX, P.posZ);
  mapCtx.fillText(`LAT   : ${formatLatLon(ll.lat, true)}`, 20, 65);
  mapCtx.fillText(`LON   : ${formatLatLon(ll.lon, false)}`, 20, 80);
  
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