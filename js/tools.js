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
// 2. 水深データの生成（陸地回避 ＆ 有名浅瀬の錬成）
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
  console.log("🌊 リアル水深データ（等深線対応・陸地完全回避版）の生成を開始...");
  
  // ★ 有名な浅瀬の完全実装
  const famousShoals = [
    { name: "中ノ瀬", pos: latLonToXZ(35.4200, 139.7750), radius: 4500, depth: 10.0 },
    { name: "富津岬沖", pos: latLonToXZ(35.3150, 139.7900), radius: 3500, depth: 5.0 },
    { name: "観音崎", pos: latLonToXZ(35.2600, 139.7500), radius: 1200, depth: 8.0 },
    { name: "盤洲干潟", pos: latLonToXZ(35.4000, 139.9000), radius: 6000, depth: 2.0 },
    { name: "羽田沖", pos: latLonToXZ(35.5400, 139.8000), radius: 2500, depth: 7.0 }
  ];

  for (let x = -45000; x <= 45000; x += 300) { 
    for (let z = -45000; z <= 45000; z += 300) {
      
      // ★ 陸地判定：座標が陸地の中なら、絶対に水深を生成しない（スキップ）
      let onLand = false;
      for (let i = 0; i < parsedPolygonsXZ.length; i++) {
          const { poly, bounds } = parsedPolygonsXZ[i];
          if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
          if (isPointInPolygon(x, z, poly)) { onLand = true; break; }
      }
      if (onLand) continue; 

      // 陸からの距離による基本水深（少しノイズを入れて海図らしく）
      let calculatedDepth = 15.0 + (Math.random() * 5); 

      // 浅瀬の適用
      famousShoals.forEach(s => {
        const dToShoal = Math.sqrt((s.pos.x - x)**2 + (s.pos.z - z)**2);
        if (dToShoal < s.radius) {
          const ratio = 1.0 - (dToShoal / s.radius);
          // 浅瀬の中心に近いほど、指定した水深に近づく
          calculatedDepth = calculatedDepth * (1 - ratio) + s.depth * ratio;
        }
      });

      calculatedDepth = Math.max(2.5, Math.min(45.0, calculatedDepth)); 
      
      const offsetX = (Math.random() - 0.5) * 150;
      const offsetZ = (Math.random() - 0.5) * 150;
      
      depthData.push({ x: x + offsetX, z: z + offsetZ, depth: calculatedDepth });
    }
  }

  // ★ 描画用に、深い順（深海→浅瀬）に並べ替える
  depthData.sort((a, b) => b.depth - a.depth);
  console.log(`ECDIS: 水深データ（${depthData.length}地点）生成完了！`);
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
    
    // パン移動の限界を 3000 に拡大！
    const limit = 3000;
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

  // ② 水深による「等深帯（Color Bands）」の描画
  if (depthData.length > 0) {
    depthData.forEach((pt) => {
      if (pt.depth >= 20.0) return; // 深海はベース色のまま

      const dx = pt.x - P.posX;
      const dz = pt.z - P.posZ; 
      const sx = cx + dx / ecdisScale; 
      const sy = cy - dz / ecdisScale; 
      
      const radius = 550 / ecdisScale; 
      
      if (sx > -radius && sx < w + radius && sy > -radius && sy < h + radius) {
        // ★ 水深帯による色分け（円が重なることで等深線が形成される）
        if (pt.depth <= 5.0) {
          mapCtx.fillStyle = '#4292c6'; // 危険浅瀬（0-5m）：濃い青
        } else if (pt.depth <= 10.0) {
          mapCtx.fillStyle = '#6baed6'; // 警戒水域（5-10m）：普通の青
        } else if (pt.depth <= 20.0) {
          mapCtx.fillStyle = '#9ecae1'; // 浅瀬（10-20m）：薄めの青
        }

        mapCtx.beginPath();
        mapCtx.arc(sx, sy, radius, 0, Math.PI * 2);
        mapCtx.fill();
      }
    });
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

  // ⑤ 水深の数字プロット
  if (depthData.length > 0) {
    const safetyDepth = 15.0; 
    const drawnPositions = []; 
    mapCtx.textAlign = 'center';
    
    depthData.forEach((pt) => {
      // 20m以上の深海は数字を出さずスッキリさせる
      if (pt.depth >= 20.0) return;

      const dx = pt.x - P.posX;
      const dz = pt.z - P.posZ; 
      const sx = cx + dx / ecdisScale; 
      const sy = cy - dz / ecdisScale; 
      
      if (sx > 0 && sx < w && sy > 0 && sy < h) {
        // 数字が重ならないよう間引き幅を広げる
        const isOverlapping = drawnPositions.some(p => Math.abs(p.x - sx) < 35 && Math.abs(p.y - sy) < 20);
        if (isOverlapping) return;

        drawnPositions.push({ x: sx, y: sy });

        if (pt.depth <= safetyDepth) {
          mapCtx.fillStyle = '#000000'; 
          mapCtx.font = 'bold 11px Arial, sans-serif'; 
        } else {
          mapCtx.fillStyle = '#444444'; 
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