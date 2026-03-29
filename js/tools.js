'use strict';
// ============================================================
//  tools.js — 電子海図モニター (ECDIS)
// ============================================================

let toolOpen = false;
let mapCv = null;
let mapCtx = null;
let geoData = null;
let depthData = []; 

fetch('./tokyobay.geojson?v=' + Date.now())
  .then(res => res.json())
  .then(data => { geoData = data; console.log("ECDIS: 海図データのロード完了"); })
  .catch(err => console.error("ECDISエラー:", err));

fetch('./depths.json?v=' + Date.now())
  .then(res => res.json())
  .then(data => { 
    if(data && data.elements) {
      data.elements.forEach(el => {
        if (el.tags) {
          // ★修正：どんなタグ名（depth, ele, seamark:depth等）で書かれていても強引に拾い上げる！
          let dStr = el.tags['seamark:elevation'] || el.tags['seamark:depth'] || el.tags['depth'] || el.tags['ele'];
          
          if (dStr !== undefined) {
            const { x, z } = latLonToXZ(el.lat, el.lon);
            let d = Math.abs(parseFloat(dStr)); // 絶対値にする
            if (!isNaN(d) && d > 0) {
              depthData.push({ x, z, depth: d });
            }
          }
        }
      });
      console.log(`ECDIS: 水深データ（${depthData.length}地点）のロード完了`); 
    }
  })
  .catch(err => console.log("水深データのロードをスキップします"));

const ORIGIN_LAT = 35.45;
const ORIGIN_LON = 139.75;

function latLonToXZ(lat, lon) {
  // ★ 修正1：マイナスを削除（東 = +X）
  const x = (lon - ORIGIN_LON) * 111320 * Math.cos(ORIGIN_LAT * Math.PI / 180);
  const z = (lat - ORIGIN_LAT) * 111320; 
  return { x, z };
}

export function getRealDepthAt(posX, posZ) {
  if (depthData.length === 0) return 999; 
  let closestDepth = 999;
  let minDistance = Infinity;
  for (let i = 0; i < depthData.length; i++) {
    const pt = depthData[i];
    const distSq = (pt.x - posX) ** 2 + (pt.z - posZ) ** 2;
    if (distSq < minDistance) {
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
    backgroundColor: '#020b14', border: '2px solid #00d4ff', borderRadius: '8px',
    boxShadow: '0 0 30px rgba(0, 212, 255, 0.2), inset 0 0 50px rgba(0,0,0,0.8)',
    zIndex: '500', display: 'none', pointerEvents: 'none'
  });
  
  document.body.appendChild(mapCv);
  mapCtx = mapCv.getContext('2d');
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

  mapCtx.strokeStyle = 'rgba(0, 212, 255, 0.15)';
  mapCtx.lineWidth = 1;
  mapCtx.beginPath();
  for (let i = 0; i < w; i += 60) { mapCtx.moveTo(i, 0); mapCtx.lineTo(i, h); }
  for (let i = 0; i < h; i += 60) { mapCtx.moveTo(0, i); mapCtx.lineTo(w, i); }
  mapCtx.stroke();

  const scale = 25; 
  const cx = w / 2;
  const cy = h / 2;

  if (geoData) {
    mapCtx.strokeStyle = '#00ffaa';
    mapCtx.lineWidth = 1.5;

    geoData.features.forEach(feat => {
      if (!feat.geometry) return;
      const type = feat.geometry.type;
      const coords = feat.geometry.coordinates;

      const drawShape = (points) => {
        mapCtx.beginPath();
        points.forEach((p, i) => {
          const { x, z } = latLonToXZ(p[1], p[0]);
          const dx = x - P.posX;
          const dz = z - P.posZ; 
          
          // ★ 修正2：東(+X)に進んだときに、海図上では右(＋)に描画されるように足し算に変更！
          const sx = cx + dx / scale; 
          const sy = cy - dz / scale; 

          if (i === 0) mapCtx.moveTo(sx, sy);
          else mapCtx.lineTo(sx, sy);
        });
        mapCtx.stroke();
      };

      if (type === 'LineString') drawShape(coords);
      else if (type === 'Polygon') coords.forEach(r => drawShape(r));
      else if (type === 'MultiPolygon') coords.forEach(poly => poly.forEach(r => drawShape(r)));
    });
  }

  // --- ECDIS上に水深の数値をプロット ---
  if (depthData.length > 0) {
    mapCtx.fillStyle = '#4488aa'; 
    mapCtx.font = '10px "Montserrat", sans-serif';
    mapCtx.textAlign = 'center';
    
    depthData.forEach((pt, i) => {
      if (i % 3 !== 0) return; 
      const dx = pt.x - P.posX;
      const dz = pt.z - P.posZ; 
      const sx = cx + dx / scale; // ★ 修正2
      const sy = cy - dz / scale; 
      
      if (sx > 0 && sx < w && sy > 0 && sy < h) {
        mapCtx.fillText(pt.depth.toFixed(1), sx, sy);
      }
    });
  }

  buoys.forEach(b => {
    if(!b.position) return;
    const dx = b.position.x - P.posX;
    const dz = b.position.z - P.posZ;
    const sx = cx + dx / scale; // ★ 修正2
    const sy = cy - dz / scale; 
    mapCtx.fillStyle = b.material.color.getHexString() === 'ff2222' ? '#ff3333' : '#33ff33';
    mapCtx.beginPath(); mapCtx.arc(sx, sy, 3, 0, Math.PI * 2); mapCtx.fill();
  });

  AIships.concat(fishBoats).forEach(s => {
    const pos = s.mesh ? s.mesh.position : s.position; 
    if (!pos) return;
    const dx = pos.x - P.posX;
    const dz = pos.z - P.posZ;
    const sx = cx + dx / scale; // ★ 修正2
    const sy = cy - dz / scale; 
    
    mapCtx.save();
    mapCtx.translate(sx, sy);
    // ★ 修正3：AI船の回転方向のマイナスを削除（時計回り＝プラス）
    mapCtx.rotate(s.heading);

    mapCtx.beginPath();
    mapCtx.moveTo(0, -8);  
    mapCtx.lineTo(4, 6);   
    mapCtx.lineTo(-4, 6);  
    mapCtx.closePath();
    mapCtx.fillStyle = '#ffaa00'; 
    mapCtx.fill();

    mapCtx.beginPath();
    mapCtx.moveTo(0, -8);
    mapCtx.lineTo(0, -20);
    mapCtx.strokeStyle = 'rgba(255, 170, 0, 0.6)';
    mapCtx.lineWidth = 1.5;
    mapCtx.stroke();

    mapCtx.restore();
  });

  // 自船の描画
  mapCtx.save();
  mapCtx.translate(cx, cy);
  // ★ 修正4：自船の回転方向のマイナスを削除（右旋回で時計回りに回るように）
  mapCtx.rotate(P.heading); 

  mapCtx.beginPath();
  mapCtx.moveTo(0, -12); 
  mapCtx.lineTo(7, 10);  
  mapCtx.lineTo(0, 6);   
  mapCtx.lineTo(-7, 10); 
  mapCtx.closePath();
  
  mapCtx.fillStyle = '#00d4ff'; 
  mapCtx.fill();
  mapCtx.lineWidth = 1.5;
  mapCtx.strokeStyle = '#ffffff'; 
  mapCtx.stroke();
  
  mapCtx.beginPath();
  mapCtx.moveTo(0, -12);
  mapCtx.lineTo(0, -50); 
  mapCtx.strokeStyle = 'rgba(0, 212, 255, 0.8)';
  mapCtx.lineWidth = 2;
  mapCtx.stroke();

  mapCtx.restore();

  mapCtx.fillStyle = '#00d4ff';
  mapCtx.font = '16px "Montserrat", sans-serif';
  mapCtx.textAlign = 'left';
  mapCtx.textBaseline = 'top';
  mapCtx.fillText('ECDIS - TOKYO BAY SYSTEM', 20, 20);
  
  mapCtx.font = '12px "Montserrat", sans-serif';
  mapCtx.fillText(`SCALE : 1:${scale * 100}`, 20, 45);
  mapCtx.fillText(`POS X : ${Math.round(P.posX)} m`, 20, 65);
  mapCtx.fillText(`POS Z : ${Math.round(P.posZ)} m`, 20, 80);
  
  // ★ 修正5：HDG計算のマイナスも削除（右に回ると数字が増える！）
  let deg = (P.heading * 180 / Math.PI + 360) % 360;
  if (deg < 0) deg += 360;
  mapCtx.fillText(`HDG   : ${deg.toFixed(1)}°`, 20, 100);
  mapCtx.fillText(`SPD   : ${(P.speed).toFixed(1)} kt`, 20, 115);

  const currentDepth = getRealDepthAt(P.posX, P.posZ);
  mapCtx.fillText(`DEPTH : ${currentDepth === 999 ? '---' : currentDepth.toFixed(1)} m`, 20, 130);
}