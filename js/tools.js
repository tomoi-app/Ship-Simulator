'use strict';
// ============================================================
//  tools.js — 電子海図モニター (ECDIS)
// ============================================================

let toolOpen = false;
let mapCv = null;
let mapCtx = null;
let geoData = null;

// 1. 3Dと同じ海岸線データ(GeoJSON)を裏側で読み込んでおく
fetch('./tokyobay.geojson')
  .then(res => res.json())
  .then(data => { geoData = data; console.log("ECDIS: 海図データのロード完了"); })
  .catch(err => console.error("ECDISエラー:", err));

// 2. 3D世界と同じ座標計算ロジック
const ORIGIN_LAT = 35.45;
const ORIGIN_LON = 139.75;
function latLonToXZ(lat, lon) {
  const x = (lon - ORIGIN_LON) * 111320 * Math.cos(ORIGIN_LAT * Math.PI / 180);
  const z = (lat - ORIGIN_LAT) * 111320;
  return { x, z };
}

// 3. マップ画面（Canvas）の初期化
function initMap() {
  if (mapCv) return;
  mapCv = document.createElement('canvas');
  mapCv.id = 'ecdis-monitor';
  
  // プロ仕様のモニター風スタイリング
  Object.assign(mapCv.style, {
    position: 'absolute',
    top: '10%', left: '10%', width: '80%', height: '80%',
    backgroundColor: '#020b14',       // 深海のダークブルー
    border: '2px solid #00d4ff',      // サイバーなシアンの枠
    borderRadius: '8px',
    boxShadow: '0 0 30px rgba(0, 212, 255, 0.2), inset 0 0 50px rgba(0,0,0,0.8)',
    zIndex: '500', display: 'none',
    pointerEvents: 'none' // クリックはゲーム画面に貫通させる
  });
  
  document.body.appendChild(mapCv);
  mapCtx = mapCv.getContext('2d');
}

// 4. マップの開閉状態を管理
export function isToolOpen() { return toolOpen; }
export function toggleTool() {
  initMap();
  toolOpen = !toolOpen;
  mapCv.style.display = toolOpen ? 'block' : 'none';
  if (toolOpen) {
    // 開くたびに解像度を画面に合わせる
    mapCv.width = mapCv.clientWidth;
    mapCv.height = mapCv.clientHeight;
  }
}

// 5. 毎フレーム呼ばれる描画エンジン
export function drawAll(P, AIships, fishBoats, buoys, curM) {
  if (!toolOpen || !mapCtx) return;

  const w = mapCv.width;
  const h = mapCv.height;
  mapCtx.clearRect(0, 0, w, h);

  // --- 背景の緯度経度グリッド線 ---
  mapCtx.strokeStyle = 'rgba(0, 212, 255, 0.15)';
  mapCtx.lineWidth = 1;
  mapCtx.beginPath();
  for (let i = 0; i < w; i += 60) { mapCtx.moveTo(i, 0); mapCtx.lineTo(i, h); }
  for (let i = 0; i < h; i += 60) { mapCtx.moveTo(0, i); mapCtx.lineTo(w, i); }
  mapCtx.stroke();

  // --- 表示スケール（縮尺）と画面の中心 ---
  const scale = 25; // 1ピクセル = 25メートル（広域レーダー）
  const cx = w / 2;
  const cy = h / 2;

  // --- 本物の陸地（海岸線）の描画 ---
  if (geoData) {
    mapCtx.fillStyle = '#0a1a15';      // 陸地の塗りつぶし（暗いオリーブ）
    mapCtx.strokeStyle = '#00ffaa';    // 海岸線のフチ（蛍光グリーン）
    mapCtx.lineWidth = 1.5;

    geoData.features.forEach(feat => {
      if (!feat.geometry) return;
      const type = feat.geometry.type;
      const coords = feat.geometry.coordinates;

      const drawShape = (points) => {
        mapCtx.beginPath();
        points.forEach((p, i) => {
          const { x, z } = latLonToXZ(p[1], p[0]); // p[1]=緯度, p[0]=経度
          // 自船からの相対座標（ピクセル換算）
          const dx = x - P.posX;
          const dz = z - P.posZ; 
          // 画面上の座標（北が上なので -dz にする）
          const sx = cx + dx / scale;
          const sy = cy - dz / scale;

          if (i === 0) mapCtx.moveTo(sx, sy);
          else mapCtx.lineTo(sx, sy);
        });
        mapCtx.fill();
        mapCtx.stroke();
      };

      if (type === 'LineString') drawShape(coords);
      else if (type === 'Polygon') coords.forEach(r => drawShape(r));
      else if (type === 'MultiPolygon') coords.forEach(poly => poly.forEach(r => drawShape(r)));
    });
  }

  // --- ブイ（航路標識）のプロット ---
  buoys.forEach(b => {
    if(!b.position) return;
    const sx = cx + (b.position.x - P.posX) / scale;
    const sy = cy - (b.position.z - P.posZ) / scale;
    // 赤か緑かで色を変える
    mapCtx.fillStyle = b.material.color.getHexString() === 'ff2222' ? '#ff3333' : '#33ff33';
    mapCtx.beginPath(); mapCtx.arc(sx, sy, 3, 0, Math.PI * 2); mapCtx.fill();
  });

  // --- 他船（AIシップ・漁船）のプロット ---
  AIships.concat(fishBoats).forEach(s => {
    const pos = s.mesh ? s.mesh.position : s.position; 
    if (!pos) return;
    const sx = cx + (pos.x - P.posX) / scale;
    const sy = cy - (pos.z - P.posZ) / scale;
    mapCtx.fillStyle = '#ffaa00'; // 警戒色のアンバー（黄色）
    mapCtx.beginPath();
    // ひし形のアイコンで他船を表現
    mapCtx.moveTo(sx, sy - 5); mapCtx.lineTo(sx + 5, sy); 
    mapCtx.lineTo(sx, sy + 5); mapCtx.lineTo(sx - 5, sy);
    mapCtx.fill();
  });

  // --- 自船（プレイヤー）のプロットとヘディングライン ---
  mapCtx.fillStyle = '#00d4ff'; // 鮮やかなシアン
  mapCtx.beginPath();
  mapCtx.arc(cx, cy, 6, 0, Math.PI * 2);
  mapCtx.fill();
  
  // 船首が向いている方向への予測ライン（ヘディングライン）
  mapCtx.strokeStyle = '#00d4ff';
  mapCtx.lineWidth = 2;
  mapCtx.beginPath();
  mapCtx.moveTo(cx, cy);
  // P.heading を元に針路を計算（北0度、西90度という物理エンジンの仕様に合わせる）
  mapCtx.lineTo(cx - Math.sin(P.heading) * 40, cy - Math.cos(P.heading) * 40);
  mapCtx.stroke();

  // --- モニター情報のテキスト印字 ---
  mapCtx.fillStyle = '#00d4ff';
  mapCtx.font = '16px "Montserrat", sans-serif';
  mapCtx.textBaseline = 'top';
  mapCtx.fillText('ECDIS - TOKYO BAY SYSTEM', 20, 20);
  
  mapCtx.font = '12px "Montserrat", sans-serif';
  mapCtx.fillText(`SCALE : 1:${scale * 100}`, 20, 45);
  mapCtx.fillText(`POS X : ${Math.round(P.posX)} m`, 20, 65);
  mapCtx.fillText(`POS Z : ${Math.round(P.posZ)} m`, 20, 80);
  
  // 方位（0〜359度）を計算して表示
  let deg = (P.heading * 180 / Math.PI + 360) % 360;
  if (deg < 0) deg += 360;
  mapCtx.fillText(`HDG   : ${deg.toFixed(1)}°`, 20, 100);
  mapCtx.fillText(`SPD   : ${(P.speed).toFixed(1)} kt`, 20, 115);

  if (!geoData) {
    mapCtx.fillStyle = '#ff3333';
    mapCtx.fillText('LOADING CHART DATA...', 20, 140);
  }
}
