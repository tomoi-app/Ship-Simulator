'use strict';
// ============================================================
//  tools.js — 電子海図モニター (ECDIS)
// ============================================================

let toolOpen = false;
let mapCv = null;
let mapCtx = null;
let geoData = null;

fetch('./tokyobay.geojson?v=' + Date.now())
  .then(res => res.json())
  .then(data => { geoData = data; console.log("ECDIS: 海図データのロード完了"); })
  .catch(err => console.error("ECDISエラー:", err));

const ORIGIN_LAT = 35.45;
const ORIGIN_LON = 139.75;

function latLonToXZ(lat, lon) {
  const x = (lon - ORIGIN_LON) * 111320 * Math.cos(ORIGIN_LAT * Math.PI / 180);
  const z = (lat - ORIGIN_LAT) * 111320; 
  return { x, z };
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

  // --- グリッド線 ---
  mapCtx.strokeStyle = 'rgba(0, 212, 255, 0.15)';
  mapCtx.lineWidth = 1;
  mapCtx.beginPath();
  for (let i = 0; i < w; i += 60) { mapCtx.moveTo(i, 0); mapCtx.lineTo(i, h); }
  for (let i = 0; i < h; i += 60) { mapCtx.moveTo(0, i); mapCtx.lineTo(w, i); }
  mapCtx.stroke();

  const scale = 25; 
  const cx = w / 2;
  const cy = h / 2;

  // --- 陸地の描画 ---
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

  // --- ブイの描画 ---
  buoys.forEach(b => {
    if(!b.position) return;
    const dx = b.position.x - P.posX;
    const dz = b.position.z - P.posZ;
    const sx = cx + dx / scale;
    const sy = cy - dz / scale; 
    mapCtx.fillStyle = b.material.color.getHexString() === 'ff2222' ? '#ff3333' : '#33ff33';
    mapCtx.beginPath(); mapCtx.arc(sx, sy, 3, 0, Math.PI * 2); mapCtx.fill();
  });

  // --- 他船（AI・漁船）の描画（三角形アイコンに変更） ---
  AIships.concat(fishBoats).forEach(s => {
    const pos = s.mesh ? s.mesh.position : s.position; 
    if (!pos) return;
    const dx = pos.x - P.posX;
    const dz = pos.z - P.posZ;
    const sx = cx + dx / scale;
    const sy = cy - dz / scale; 
    
    mapCtx.save();
    mapCtx.translate(sx, sy);
    // ★ 修正：他船も3Dと海図で回転方向を統一する
    mapCtx.rotate(-s.heading);

    // 他船のアイコン（オレンジの三角形）
    mapCtx.beginPath();
    mapCtx.moveTo(0, -8);  // 船首（尖らせる）
    mapCtx.lineTo(4, 6);   // 右舷後方
    mapCtx.lineTo(-4, 6);  // 左舷後方
    mapCtx.closePath();
    mapCtx.fillStyle = '#ffaa00'; 
    mapCtx.fill();

    // 他船のヘディングライン（短め）
    mapCtx.beginPath();
    mapCtx.moveTo(0, -8);
    mapCtx.lineTo(0, -20);
    mapCtx.strokeStyle = 'rgba(255, 170, 0, 0.6)';
    mapCtx.lineWidth = 1.5;
    mapCtx.stroke();

    mapCtx.restore();
  });

  // --- 自船（プレイヤー）の描画（船型のアイコンに変更＆回転修正） ---
  mapCtx.save();
  mapCtx.translate(cx, cy);
  // ★ 大修正：3Dと回転方向を一致させるため、マイナスをかけて反転させる
  mapCtx.rotate(-P.heading); 

  // 自船のアイコン（シアンの船型・後ろを少し凹ませてより船らしく）
  mapCtx.beginPath();
  mapCtx.moveTo(0, -12); // 船首
  mapCtx.lineTo(7, 10);  // 右舷後方
  mapCtx.lineTo(0, 6);   // 船尾中央（凹み）
  mapCtx.lineTo(-7, 10); // 左舷後方
  mapCtx.closePath();
  
  mapCtx.fillStyle = '#00d4ff'; 
  mapCtx.fill();
  mapCtx.lineWidth = 1.5;
  mapCtx.strokeStyle = '#ffffff'; // フチを白にして視認性アップ
  mapCtx.stroke();
  
  // 自船のヘディングライン
  mapCtx.beginPath();
  mapCtx.moveTo(0, -12);
  mapCtx.lineTo(0, -50); // 前方に予測線を伸ばす
  mapCtx.strokeStyle = 'rgba(0, 212, 255, 0.8)';
  mapCtx.lineWidth = 2;
  mapCtx.stroke();

  mapCtx.restore();

  // --- テキスト情報の描画 ---
  mapCtx.fillStyle = '#00d4ff';
  mapCtx.font = '16px "Montserrat", sans-serif';
  mapCtx.textBaseline = 'top';
  mapCtx.fillText('ECDIS - TOKYO BAY SYSTEM', 20, 20);
  
  mapCtx.font = '12px "Montserrat", sans-serif';
  mapCtx.fillText(`SCALE : 1:${scale * 100}`, 20, 45);
  mapCtx.fillText(`POS X : ${Math.round(P.posX)} m`, 20, 65);
  mapCtx.fillText(`POS Z : ${Math.round(P.posZ)} m`, 20, 80);
  
  // ★ 修正：テキスト表示される角度（HDG）も計算方向を反転し、右旋回で数字が増えるように直す
  let deg = (-P.heading * 180 / Math.PI + 360) % 360;
  if (deg < 0) deg += 360;
  mapCtx.fillText(`HDG   : ${deg.toFixed(1)}°`, 20, 100);
  mapCtx.fillText(`SPD   : ${(P.speed).toFixed(1)} kt`, 20, 115);

  if (!geoData) {
    mapCtx.fillStyle = '#ff3333';
    mapCtx.fillText('LOADING CHART DATA...', 20, 140);
  }
}