'use strict';
// ============================================================
//  tools.js — 電子海図モニター (ECDIS) 【完全版】
// ============================================================

let toolOpen = false;
let mapCv = null;
let mapCtx = null;
let geoData = null;
let depthData = []; 

let parsedPolygonsXZ = []; 

let ecdisScale = 25; 
let panX = 0;        
let panY = 0;        
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

export let isDepthLoading = true; 

const ORIGIN_LAT = 35.45;
const ORIGIN_LON = 139.75;

export function latLonToXZ(lat, lon) {
  const x = (lon - ORIGIN_LON) * 111320 * Math.cos(ORIGIN_LAT * Math.PI / 180);
  const z = (lat - ORIGIN_LAT) * 111320; 
  return { x, z };
}

function xzToLatLon(x, z) {
  const lat = (z / 111320) + ORIGIN_LAT;
  const lon = (x / (111320 * Math.cos(ORIGIN_LAT * Math.PI / 180))) + ORIGIN_LON;
  return { lat, lon };
}

function formatLatLon(deg, isLat) {
  const absDeg = Math.abs(deg);
  const d = Math.floor(absDeg);
  const m = ((absDeg - d) * 60).toFixed(2);
  const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  return `${String(d).padStart(isLat ? 2 : 3, '0')}° ${String(m).padStart(5, '0')}' ${dir}`;
}

// ============================================================
// グリッドインデックス
// ============================================================
const GRID_START_X = -30000, GRID_END_X = 60000;
const GRID_START_Z = -75000, GRID_END_Z = 30000;
const RENDER_STEP = 300; 
const gridCols = Math.ceil((GRID_END_X - GRID_START_X) / RENDER_STEP) + 1;
const gridRows = Math.ceil((GRID_END_Z - GRID_START_Z) / RENDER_STEP) + 1;

let renderGrid = null; 

export function getRealDepthAt(posX, posZ) {
  if (!renderGrid) return 99.9;
  const c = Math.round((posX - GRID_START_X) / RENDER_STEP);
  const r = Math.round((posZ - GRID_START_Z) / RENDER_STEP);
  if (c >= 0 && c < gridCols && r >= 0 && r < gridRows) {
    const d = renderGrid[r * gridCols + c];
    return (d === undefined || isNaN(d)) ? 99.9 : d;
  }
  return 99.9;
}

// ============================================================
// フリーモードのルートプランナー用データ
// ============================================================
export let freeModeStep = 0; 
export let selectedStartKey = null;
export let currentStartLoc = null; 
export let currentGoalLoc = null;  
export let trackHistory = [];      

let shipRef = null;
let ecdisAnimFrame = null;
let onStartVoyageCallback = null; 

const VOYAGE_LOCATIONS = {
  uraga: { name: "浦賀水道", lat: 35.150, lon: 139.773, heading: 0 },
  yokohama: { name: "横浜港", lat: 35.452, lon: 139.648, heading: 110 },
  tokyo: { name: "東京港", lat: 35.590, lon: 139.780, heading: 180 }
};

function startEcdisAnim() {
  cancelAnimationFrame(ecdisAnimFrame);
  function loop() {
    if (!toolOpen) return;
    if (freeModeStep > 0 || isDepthLoading) {
      drawAll(shipRef);
      ecdisAnimFrame = requestAnimationFrame(loop);
    }
  }
  loop();
}

export function startFreeModeSelection(p, callback) {
  shipRef = p || {}; 
  onStartVoyageCallback = callback; 
  toolOpen = true;
  freeModeStep = 1;
  selectedStartKey = null;
  
  if (!mapCv) initMap();
  mapCv.style.display = 'block';
  
  setTimeout(() => {
    mapCv.width = mapCv.clientWidth || 800;
    mapCv.height = mapCv.clientHeight || 600;
  }, 10);
  
  panX = 0; 
  panY = 0; 
  ecdisScale = 60; 

  startEcdisAnim();
}

// ============================================================
// 航路データ (Fairways & Buoys)
// ============================================================
const FAIRWAYS = [
  {
    name: "SOUTH APPROACH",
    leftBound:  [ { lat: 35.150, lon: 139.765 }, { lat: 35.250, lon: 139.765 } ],
    rightBound: [ { lat: 35.150, lon: 139.781 }, { lat: 35.250, lon: 139.781 } ]
  },
  {
    name: "URAGA SUIDO",
    leftBound:  [ { lat: 35.250, lon: 139.765 }, { lat: 35.320, lon: 139.718 } ],
    rightBound: [ { lat: 35.250, lon: 139.781 }, { lat: 35.320, lon: 139.734 } ]
  },
  {
    name: "NAKANOSE",
    leftBound:  [ { lat: 35.320, lon: 139.718 }, { lat: 35.400, lon: 139.748 } ],
    rightBound: [ { lat: 35.320, lon: 139.734 }, { lat: 35.400, lon: 139.764 } ]
  }
];

export const BUOYS = [
  { name: "U1", lat: 35.180, lon: 139.765, color: "#11cc11" },
  { name: "U2", lat: 35.180, lon: 139.781, color: "#ee1111" },
  { name: "U3", lat: 35.250, lon: 139.765, color: "#11cc11" },
  { name: "U4", lat: 35.250, lon: 139.781, color: "#ee1111" },
  { name: "U5", lat: 35.285, lon: 139.741, color: "#11cc11" },
  { name: "U6", lat: 35.285, lon: 139.757, color: "#ee1111" },
  { name: "U7", lat: 35.320, lon: 139.718, color: "#11cc11" },
  { name: "U8", lat: 35.320, lon: 139.734, color: "#ee1111" },
  { name: "N1", lat: 35.340, lon: 139.726, color: "#11cc11" },
  { name: "N2", lat: 35.340, lon: 139.742, color: "#ee1111" },
  { name: "N3", lat: 35.370, lon: 139.737, color: "#11cc11" },
  { name: "N4", lat: 35.370, lon: 139.753, color: "#ee1111" },
  { name: "N7", lat: 35.400, lon: 139.748, color: "#11cc11" },
  { name: "N8", lat: 35.400, lon: 139.764, color: "#ee1111" },
  { name: "風の塔", lat: 35.4914, lon: 139.8347, color: "#ffffff" },
  { name: "海ほたる", lat: 35.4636, lon: 139.8753, color: "#ffffff" }
];

const LANDMARKS = [
  { name: "観音崎灯台", lat: 35.253, lon: 139.730, align: "right" },
  { name: "第二海堡",   lat: 35.308, lon: 139.710, align: "right" },
  { name: "浦賀灯台",   lat: 35.210, lon: 139.715, align: "right" },
  { name: "富津灯台",   lat: 35.310, lon: 139.780, align: "left" },
  { name: "東 京 湾",   lat: 35.450, lon: 139.850, size: 24, weight: "bold", color: "rgba(0,0,0,0.4)" }, 
  { name: "浦賀水道",   lat: 35.270, lon: 139.700, size: 16, weight: "bold", color: "rgba(0,0,0,0.6)", align: "right" },
  { name: "中 ノ 瀬",   lat: 35.380, lon: 139.710, size: 16, weight: "bold", color: "rgba(0,0,0,0.6)", align: "right" }, 
  { name: "木更津港",   lat: 35.370, lon: 139.900, align: "left" },
  { name: "横須賀港",   lat: 35.290, lon: 139.670, align: "right" },
  { name: "横浜港",     lat: 35.450, lon: 139.670, align: "right" },
  { name: "東京港",     lat: 35.600, lon: 139.770, align: "center" },
  { name: "羽田空港",   lat: 35.550, lon: 139.780, align: "center" },
  { name: "富津岬",     lat: 35.310, lon: 139.810, align: "left" }
];

// ============================================================
// 1. 地図データのロード
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

    generateRealisticDepthsFast(); 
  })
  .catch(err => console.error("ECDISエラー:", err));

// ============================================================
// 2. 水深データの生成 (超高速 Web Worker)
// ============================================================
function generateRealisticDepthsFast() {
  console.log("水深データ生成処理を開始...");

  const fairwayLines = FAIRWAYS.map(fw => {
    return fw.leftBound.map((lb, i) => {
      const rb = fw.rightBound[i];
      return latLonToXZ((lb.lat + rb.lat) / 2, (lb.lon + rb.lon) / 2);
    });
  });

  const deepAreas = [
    { pos: latLonToXZ(35.452, 139.648), radius: 2500, depth: 20.0 }, 
    { pos: latLonToXZ(35.445, 139.680), radius: 3500, depth: 20.0 }, 
    { pos: latLonToXZ(35.430, 139.720), radius: 4500, depth: 20.0 }, 
    { pos: latLonToXZ(35.590, 139.780), radius: 3000, depth: 20.0 }, 
    { pos: latLonToXZ(35.550, 139.780), radius: 4000, depth: 20.0 }, 
    { pos: latLonToXZ(35.480, 139.770), radius: 5500, depth: 20.0 }
  ];

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

    function distToSegmentSq(px, pz, x1, z1, x2, z2) {
      const l2 = (x1-x2)**2 + (z1-z2)**2;
      if (l2 === 0) return (px-x1)**2 + (pz-z1)**2;
      let t = ((px - x1) * (x2 - x1) + (pz - z1) * (z2 - z1)) / l2;
      t = Math.max(0, Math.min(1, t));
      return (px - (x1 + t * (x2 - x1)))**2 + (pz - (z1 + t * (z2 - z1)))**2;
    }

    self.onmessage = function(e) {
      const { polygons, shoals, fairways, deepAreas, startX, endX, startZ, endZ, step, cols, rows } = e.data;
      const depths = new Float32Array(cols * rows);
      let seed = 12345;
      function rand() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; }

      for (let r = 0; r < rows; r++) {
        const z = startZ + r * step;
        for (let c = 0; c < cols; c++) {
          const x = startX + c * step;
          let onLand = false;
          let minDistSq = 4000000;

          for (let i = 0; i < polygons.length; i++) {
            const { poly, bounds } = polygons[i];
            
            const dx = Math.max(bounds.minX - x, 0, x - bounds.maxX);
            const dz = Math.max(bounds.minZ - z, 0, z - bounds.maxZ);
            if (dx*dx + dz*dz > minDistSq) continue; 

            if (isPointInPolygon(x, z, poly)) { onLand = true; break; }

            for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) {
              const dSq = distToSegmentSq(x, z, poly[k].x, poly[k].z, poly[j].x, poly[j].z);
              if (dSq < minDistSq) minDistSq = dSq;
            }
          }

          let finalDepth = 0.0;
          
          if (!onLand) {
            const distToCoast = Math.sqrt(minDistSq);
            let depth = 2.0 + (distToCoast / 1000) * 11.0 + rand() * 3;
            
            shoals.forEach(s => {
              const dSq = (s.pos.x - x)**2 + (s.pos.z - z)**2;
              if (dSq < s.radius**2) {
                const d = Math.sqrt(dSq);
                const ratio = 1.0 - Math.pow(d / s.radius, 2);
                depth = depth * (1 - ratio) + s.depth * ratio;
              }
            });

            let inFairway = false;
            fairways.forEach(fwPath => {
              for (let i = 0; i < fwPath.length - 1; i++) {
                const p1 = fwPath[i];
                const p2 = fwPath[i+1];
                const dSq = distToSegmentSq(x, z, p1.x, p1.z, p2.x, p2.z);
                if (dSq < 810000) inFairway = true;
              }
            });

            if (inFairway) depth = Math.max(depth, 22.0 + rand() * 2);

            finalDepth = Math.max(2.0, Math.min(45.0, depth));

            deepAreas.forEach(area => {
              const dSq = (area.pos.x - x)**2 + (area.pos.z - z)**2;
              if (dSq < area.radius**2) {
                const d = Math.sqrt(dSq);
                const ratio = 1.0 - (d / area.radius);
                const areaDepth = area.depth * Math.pow(ratio, 0.5);
                if (areaDepth > finalDepth) {
                    finalDepth = areaDepth; 
                }
              }
            });
          }

          depths[r * cols + c] = finalDepth;
        }
      }
      self.postMessage(depths, [depths.buffer]); 
    };
  `;
  const blob   = new Blob([workerCode], { type: 'application/javascript' });
  const worker = new Worker(URL.createObjectURL(blob));

  const famousShoals = [
    { name: "中ノ瀬", pos: latLonToXZ(35.3750, 139.7150), radius: 5000, depth: 7.0 },
    { name: "富津岬沖", pos: latLonToXZ(35.3150, 139.7900), radius: 4000, depth: 3.0 },
    { name: "観音崎",   pos: latLonToXZ(35.2600, 139.7500), radius: 2000, depth: 8.0 },
    { name: "盤洲干潟", pos: latLonToXZ(35.4000, 139.9000), radius: 6000, depth: 2.0 },
    { name: "羽田沖",   pos: latLonToXZ(35.5400, 139.8000), radius: 3000, depth: 7.0 },
  ];

  worker.postMessage({ 
    polygons: parsedPolygonsXZ, 
    shoals: famousShoals, 
    fairways: fairwayLines,
    deepAreas: deepAreas,
    startX: GRID_START_X, endX: GRID_END_X,
    startZ: GRID_START_Z, endZ: GRID_END_Z,
    step: RENDER_STEP,
    cols: gridCols, rows: gridRows
  });

  worker.onmessage = function(e) {
    renderGrid = e.data; 
    isDepthLoading = false; 
    console.log("ECDIS: 水深データ生成完了");
    if (toolOpen) drawAll(shipRef); 
    worker.terminate();
    URL.revokeObjectURL(blob);
  };
}

// ============================================================
// 3. UIと操作イベント
// ============================================================
function initMap() {
  if (mapCv) return;
  mapCv = document.createElement('canvas');
  mapCv.id = 'ecdis-monitor';
  
  Object.assign(mapCv.style, {
    position: 'absolute', 
    bottom: '0%',          // ★ 画面の一番下（底）に配置
    left: '10%',           // 横位置は中央（幅80%なので左10%）
    width: '80%',          // 横幅はそのまま大きく
    height: '80%',         // ★ 高さを少し抑えて、上部の計器スペースを確保
    backgroundColor: '#c6dbef', 
    border: '4px solid #4a5b6c',
    borderRadius: '2px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    zIndex: '500', display: 'none', 
    pointerEvents: 'auto'
  });
  
  document.body.appendChild(mapCv);
  mapCtx = mapCv.getContext('2d');

  let downX = 0, downY = 0;

  mapCv.addEventListener('mousedown', (e) => {
    if (isDepthLoading) return;
    e.stopPropagation(); 
    isDragging = true;
    downX = e.clientX;
    downY = e.clientY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  mapCv.addEventListener('mousemove', (e) => {
    if (isDepthLoading) return;
    e.stopPropagation();
    if (!isDragging) return;
    panX += e.clientX - lastMouseX;
    panY += e.clientY - lastMouseY;
    
    const limit = 6000;
    panX = Math.max(-limit, Math.min(limit, panX));
    panY = Math.max(-limit, Math.min(limit, panY));

    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  mapCv.addEventListener('mouseup', (e) => { 
    if (isDepthLoading) return;
    e.stopPropagation(); 
    isDragging = false; 

    if (Math.abs(e.clientX - downX) < 5 && Math.abs(e.clientY - downY) < 5) {
      handleMapClick(e);
    }
  });
  
  mapCv.addEventListener('mouseleave', (e) => { e.stopPropagation(); isDragging = false; });

  mapCv.addEventListener('wheel', (e) => {
    if (isDepthLoading) return;
    e.stopPropagation(); 
    e.preventDefault(); 
    if (e.deltaY < 0) ecdisScale = Math.max(5, ecdisScale * 0.8); 
    else ecdisScale = Math.min(80, ecdisScale * 1.25); 
  });

  mapCv.addEventListener('dblclick', (e) => {
    if (isDepthLoading) return;
    e.stopPropagation();
    panX = 0; panY = 0; ecdisScale = 25;
  });
}

function handleMapClick(e) {
  if (freeModeStep === 0 || isDepthLoading) return;
  const rect = mapCv.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const w = mapCv.width, h = mapCv.height;
  const cx = (w / 2) + panX;
  const cy = (h / 2) + panY;

  const safeP = (shipRef && typeof shipRef.posX === 'number' && !isNaN(shipRef.posX))
    ? shipRef
    : { posX: latLonToXZ(35.30, 139.75).x, posZ: latLonToXZ(35.30, 139.75).z };

  let keys = (freeModeStep === 1) ? ['uraga', 'yokohama', 'tokyo'] : 
             (selectedStartKey === 'uraga' ? ['yokohama', 'tokyo'] : ['uraga']);

  for (let key of keys) {
    const loc = VOYAGE_LOCATIONS[key];
    const xz = latLonToXZ(loc.lat, loc.lon);
    const sx = cx + (xz.x - safeP.posX) / ecdisScale;
    const sy = cy - (xz.z - safeP.posZ) / ecdisScale;
    
    const dist = Math.sqrt((mouseX - sx)**2 + (mouseY - sy)**2);
    if (dist < 30) { 
      if (freeModeStep === 1) {
        selectedStartKey = key;
        freeModeStep = 2;
      } else if (freeModeStep === 2) {
        const startLoc = VOYAGE_LOCATIONS[selectedStartKey];
        const goalLoc = VOYAGE_LOCATIONS[key]; 
        const startXZ = latLonToXZ(startLoc.lat, startLoc.lon);
        
        if (shipRef) {
          shipRef.posX = startXZ.x;
          shipRef.posZ = startXZ.z;
          shipRef.heading = startLoc.heading * Math.PI / 180;
          shipRef.speed = 0; 
        }
        
        currentStartLoc = startLoc;
        currentGoalLoc = goalLoc;
        trackHistory = [];
        
        console.log("[START] " + startLoc.name + " -> " + goalLoc.name);
        
        freeModeStep = 0;
        selectedStartKey = null;
        toggleTool(); 
        
        if (onStartVoyageCallback) {
          onStartVoyageCallback(startLoc, goalLoc);
        }
      }
      return;
    }
  }
}

export function isToolOpen() { return toolOpen; }
export function toggleTool() {
  initMap();
  toolOpen = !toolOpen;
  mapCv.style.display = toolOpen ? 'block' : 'none';
  if (toolOpen) {
    mapCv.width = mapCv.clientWidth;
    mapCv.height = mapCv.clientHeight;
    startEcdisAnim(); 
  } else {
    freeModeStep = 0; 
    cancelAnimationFrame(ecdisAnimFrame);
  }
}

// ============================================================
// 4. 海図の描画
// ============================================================
export function drawAll(P, AIships, fishBoats, buoys, curM) {
  shipRef = P || shipRef || {};
  if (!toolOpen || !mapCtx || !geoData) return;

  if (mapCv.width === 0 || mapCv.height === 0 || mapCv.width !== mapCv.clientWidth || mapCv.height !== mapCv.clientHeight) {
      mapCv.width = mapCv.clientWidth || 800;
      mapCv.height = mapCv.clientHeight || 600;
  }

  const w = mapCv.width, h = mapCv.height;

  // ★ シンプル化されたローディング画面
  if (isDepthLoading) {
    mapCtx.save();
    
    // 背景を海の色（水色）にする
    mapCtx.fillStyle = '#e4f1fc';
    mapCtx.fillRect(0, 0, w, h);

    // テキストのみを中央に表示
    const cxLoad = w / 2;
    const cyLoad = h / 2;

    mapCtx.textAlign = 'center';
    mapCtx.textBaseline = 'middle';

    mapCtx.fillStyle = '#4a5b6c'; 
    mapCtx.font = 'bold 18px sans-serif';
    
    // 動くドット
    const dots = ".".repeat(Math.floor(Date.now() / 400) % 4);
    mapCtx.fillText("地形データを読み込み中" + dots, cxLoad, cyLoad);

    mapCtx.restore();
    return; 
  }

  // 以降は通常時の海図描画処理
  const safeP = (shipRef && typeof shipRef.posX === 'number' && !isNaN(shipRef.posX))
    ? shipRef
    : { posX: latLonToXZ(35.30, 139.75).x, posZ: latLonToXZ(35.30, 139.75).z, heading: 0, speed: 0 };

  const cx = (w / 2) + panX;
  const cy = (h / 2) + panY;

  mapCtx.clearRect(0, 0, w, h);
  mapCtx.fillStyle = '#e4f1fc';
  mapCtx.fillRect(0, 0, w, h);

  if (renderGrid) {
    const worldMinX = safeP.posX - cx * ecdisScale;
    const worldMaxX = safeP.posX + (w - cx) * ecdisScale;
    const worldMaxZ = safeP.posZ + cy * ecdisScale; 
    const worldMinZ = safeP.posZ - (h - cy) * ecdisScale;

    const startC = Math.max(0, Math.floor((worldMinX - GRID_START_X) / RENDER_STEP) - 4);
    const endC   = Math.min(gridCols - 1, Math.ceil((worldMaxX - GRID_START_X) / RENDER_STEP) + 4);
    const startR = Math.max(0, Math.floor((worldMinZ - GRID_START_Z) / RENDER_STEP) - 4);
    const endR   = Math.min(gridRows - 1, Math.ceil((worldMaxZ - GRID_START_Z) / RENDER_STEP) + 4);

    const getV = (r, c) => {
      if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) return 50.0;
      const v = renderGrid[r * gridCols + c];
      return (v === undefined || isNaN(v)) ? 50.0 : v;
    };

    const fillContourBand = (threshold, color) => {
      mapCtx.fillStyle = color;

      for(let r = startR; r < endR - 1; r++) {
        for(let c = startC; c < endC - 1; c++) {
          const v0 = getV(r, c), v1 = getV(r, c + 1), v2 = getV(r + 1, c + 1), v3 = getV(r + 1, c);
          const b0 = v0 <= threshold, b1 = v1 <= threshold, b2 = v2 <= threshold, b3 = v3 <= threshold;

          const idx = (b0 ? 1 : 0) | (b1 ? 2 : 0) | (b2 ? 4 : 0) | (b3 ? 8 : 0);
          if (idx === 0) continue;

          const p0 = { x: cx + (GRID_START_X + c * RENDER_STEP - safeP.posX)/ecdisScale,       y: cy - (GRID_START_Z + r * RENDER_STEP - safeP.posZ)/ecdisScale };
          const p1 = { x: cx + (GRID_START_X + (c+1) * RENDER_STEP - safeP.posX)/ecdisScale,   y: cy - (GRID_START_Z + r * RENDER_STEP - safeP.posZ)/ecdisScale };
          const p2 = { x: cx + (GRID_START_X + (c+1) * RENDER_STEP - safeP.posX)/ecdisScale,   y: cy - (GRID_START_Z + (r+1) * RENDER_STEP - safeP.posZ)/ecdisScale };
          const p3 = { x: cx + (GRID_START_X + c * RENDER_STEP - safeP.posX)/ecdisScale,       y: cy - (GRID_START_Z + (r+1) * RENDER_STEP - safeP.posZ)/ecdisScale };

          if (idx === 15) {
             mapCtx.beginPath();
             mapCtx.moveTo(p0.x, p0.y); mapCtx.lineTo(p1.x, p1.y); mapCtx.lineTo(p2.x, p2.y); mapCtx.lineTo(p3.x, p3.y);
             mapCtx.closePath();
             mapCtx.fill();
             continue;
          }

          const interp = (ptA, ptB, valA, valB) => {
            let t = 0.5;
            if (Math.abs(valB - valA) > 1e-5) t = (threshold - valA) / (valB - valA);
            return { x: ptA.x + t * (ptB.x - ptA.x), y: ptA.y + t * (ptB.y - ptA.y) };
          };

          const eT = interp(p0, p1, v0, v1);
          const eR = interp(p1, p2, v1, v2);
          const eB = interp(p3, p2, v3, v2);
          const eL = interp(p0, p3, v0, v3);

          let polys = [];
          switch(idx) {
            case 1:  polys.push([p0, eT, eL]); break;
            case 2:  polys.push([p1, eR, eT]); break;
            case 3:  polys.push([p0, p1, eR, eL]); break;
            case 4:  polys.push([p2, eB, eR]); break;
            case 5:  polys.push([p0, eT, eL], [p2, eB, eR]); break;
            case 6:  polys.push([p1, p2, eB, eT]); break;
            case 7:  polys.push([p0, p1, p2, eB, eL]); break;
            case 8:  polys.push([p3, eL, eB]); break;
            case 9:  polys.push([p0, eT, eB, p3]); break;
            case 10: polys.push([p1, eR, eT], [p3, eL, eB]); break;
            case 11: polys.push([p0, p1, eR, eB, p3]); break;
            case 12: polys.push([p3, eL, eR, p2]); break;
            case 13: polys.push([p0, eT, eR, p2, p3]); break;
            case 14: polys.push([p1, p2, p3, eL, eT]); break;
          }

          polys.forEach(poly => {
            mapCtx.beginPath();
            mapCtx.moveTo(poly[0].x, poly[0].y);
            for(let i=1; i<poly.length; i++) mapCtx.lineTo(poly[i].x, poly[i].y);
            mapCtx.closePath();
            mapCtx.fill();
          });
        }
      }
    };

    fillContourBand(20.0, '#9ecae1');
    fillContourBand(10.0, '#6baed6');
    fillContourBand(5.0,  '#4292c6');
    fillContourBand(0.5, '#dcb982'); 

    const drawContour = (threshold, color, width) => {
      mapCtx.strokeStyle = color;
      mapCtx.lineWidth = width;
      mapCtx.lineCap = 'round';
      
      for(let r = startR; r < endR - 1; r++) {
        for(let c = startC; c < endC - 1; c++) {
          const v0 = getV(r, c), v1 = getV(r, c + 1), v2 = getV(r + 1, c + 1), v3 = getV(r + 1, c);
          const b0 = v0 <= threshold, b1 = v1 <= threshold, b2 = v2 <= threshold, b3 = v3 <= threshold;
          if (b0 === b1 && b1 === b2 && b2 === b3) continue;

          const pt0 = { x: GRID_START_X + c * RENDER_STEP,       z: GRID_START_Z + r * RENDER_STEP };
          const pt1 = { x: GRID_START_X + (c + 1) * RENDER_STEP, z: GRID_START_Z + r * RENDER_STEP };
          const pt2 = { x: GRID_START_X + (c + 1) * RENDER_STEP, z: GRID_START_Z + (r + 1) * RENDER_STEP };
          const pt3 = { x: GRID_START_X + c * RENDER_STEP,       z: GRID_START_Z + (r + 1) * RENDER_STEP };

          const interp = (pA, pB, valA, valB) => {
            let t = 0.5;
            if (Math.abs(valB - valA) > 1e-5) t = (threshold - valA) / (valB - valA);
            return { x: pA.x + t * (pB.x - pA.x), z: pA.z + t * (pB.z - pA.z) };
          };

          let points = [];
          if (b0 !== b1) points.push(interp(pt0, pt1, v0, v1));
          if (b1 !== b2) points.push(interp(pt1, pt2, v1, v2));
          if (b2 !== b3) points.push(interp(pt2, pt3, v2, v3));
          if (b3 !== b0) points.push(interp(pt3, pt0, v3, v0));

          if (points.length >= 2) {
            mapCtx.beginPath();
            const sp1 = { x: cx + (points[0].x - safeP.posX) / ecdisScale, y: cy - (points[0].z - safeP.posZ) / ecdisScale };
            const sp2 = { x: cx + (points[1].x - safeP.posX) / ecdisScale, y: cy - (points[1].z - safeP.posZ) / ecdisScale };
            mapCtx.moveTo(sp1.x, sp1.y); mapCtx.lineTo(sp2.x, sp2.y);
            if (points.length === 4) {
              const sp3 = { x: cx + (points[2].x - safeP.posX) / ecdisScale, y: cy - (points[2].z - safeP.posZ) / ecdisScale };
              const sp4 = { x: cx + (points[3].x - safeP.posX) / ecdisScale, y: cy - (points[3].z - safeP.posZ) / ecdisScale };
              mapCtx.moveTo(sp3.x, sp3.y); mapCtx.lineTo(sp4.x, sp4.y);
            }
            mapCtx.stroke();
          }
        }
      }
    };

    drawContour(5.0, '#1c5a8a', 1.8);
    drawContour(10.0, '#327ba8', 1.2);
    drawContour(20.0, '#5a9dc4', 1.0);
    drawContour(0.5, '#222222', 1.0); 

    const drawnPositions = []; 
    mapCtx.textAlign = 'center';
    
    for(let r = startR; r < endR; r++) {
      for(let c = startC; c < endC; c++) {
        const depth = getV(r, c);
        if (depth === 0.0 || depth >= 50.0) continue;
        
        if ((r * 17 + c * 23) % 7 !== 0) continue; 
        
        const sx = cx + (GRID_START_X + c * RENDER_STEP - safeP.posX) / ecdisScale; 
        const sy = cy - (GRID_START_Z + r * RENDER_STEP - safeP.posZ) / ecdisScale; 
        
        if (sx > 0 && sx < w && sy > 0 && sy < h) {
          const overlapRadius = depth >= 20.0 ? 60 : 35;
          const isOverlapping = drawnPositions.some(p => Math.abs(p.x - sx) < overlapRadius && Math.abs(p.y - sy) < overlapRadius * 0.6);
          if (isOverlapping) continue;

          drawnPositions.push({ x: sx, y: sy });

          if (depth <= 15.0) {
            mapCtx.fillStyle = '#000000'; 
            mapCtx.font = 'bold 11px Arial, sans-serif'; 
          } else {
            mapCtx.fillStyle = '#5a6b7c'; 
            mapCtx.font = '10px Arial, sans-serif';
          }
          mapCtx.fillText(depth.toFixed(1), sx, sy);
        }
      }
    }
  }

  mapCtx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
  mapCtx.lineWidth = 1;
  mapCtx.beginPath();
  for (let i = 0; i < w; i += 60) { mapCtx.moveTo(i, 0); mapCtx.lineTo(i, h); }
  for (let i = 0; i < h; i += 60) { mapCtx.moveTo(0, i); mapCtx.lineTo(w, i); }
  mapCtx.stroke();

  mapCtx.fillStyle = '#dcb982'; 
  mapCtx.strokeStyle = '#222222'; 
  mapCtx.lineWidth = 1.0;
  parsedPolygonsXZ.forEach(item => {
      mapCtx.beginPath();
      item.poly.forEach((pt, i) => {
         const sx = cx + (pt.x - safeP.posX) / ecdisScale;
         const sy = cy - (pt.z - safeP.posZ) / ecdisScale;
         if (i === 0) mapCtx.moveTo(sx, sy);
         else mapCtx.lineTo(sx, sy);
      });
      mapCtx.closePath();
      mapCtx.fill(); 
      mapCtx.stroke();
  });

  mapCtx.save();
  FAIRWAYS.forEach(fw => {
    mapCtx.strokeStyle = 'rgba(200, 0, 200, 0.7)';
    mapCtx.lineWidth = 1.8;
    mapCtx.setLineDash([8, 8]);

    mapCtx.beginPath();
    fw.leftBound.forEach((pt, i) => {
      const xz = latLonToXZ(pt.lat, pt.lon);
      const sx = cx + (xz.x - safeP.posX) / ecdisScale;
      const sy = cy - (xz.z - safeP.posZ) / ecdisScale;
      if (i === 0) mapCtx.moveTo(sx, sy); else mapCtx.lineTo(sx, sy);
    });
    mapCtx.stroke();

    mapCtx.beginPath();
    fw.rightBound.forEach((pt, i) => {
      const xz = latLonToXZ(pt.lat, pt.lon);
      const sx = cx + (xz.x - safeP.posX) / ecdisScale;
      const sy = cy - (xz.z - safeP.posZ) / ecdisScale;
      if (i === 0) mapCtx.moveTo(sx, sy); else mapCtx.lineTo(sx, sy);
    });
    mapCtx.stroke();
  });
  mapCtx.restore();

  BUOYS.forEach(b => {
    const xz = latLonToXZ(b.lat, b.lon);
    const sx = cx + (xz.x - safeP.posX) / ecdisScale;
    const sy = cy - (xz.z - safeP.posZ) / ecdisScale;

    if (sx > -20 && sx < w + 20 && sy > -20 && sy < h + 20) {
      mapCtx.beginPath();
      if (b.color === "#11cc11") {
        mapCtx.moveTo(sx, sy - 6); mapCtx.lineTo(sx + 5, sy + 4); mapCtx.lineTo(sx - 5, sy + 4);
      } else if (b.color === "#ee1111") {
        mapCtx.rect(sx - 4, sy - 4, 8, 8);
      } else {
        mapCtx.moveTo(sx, sy - 6); mapCtx.lineTo(sx + 5, sy); mapCtx.lineTo(sx, sy + 6); mapCtx.lineTo(sx - 5, sy);
      }
      mapCtx.closePath();
      mapCtx.fillStyle = b.color;
      mapCtx.fill();
      mapCtx.strokeStyle = '#000000';
      mapCtx.lineWidth = 1;
      mapCtx.stroke();
    }
  });

  if (P && typeof P.posX === 'number' && !isNaN(P.posX) && freeModeStep === 0) {
    if (trackHistory.length === 0) {
      trackHistory.push({ x: P.posX, z: P.posZ });
    } else {
      const lastP = trackHistory[trackHistory.length - 1];
      const distSq = (lastP.x - P.posX)**2 + (lastP.z - P.posZ)**2;
      if (distSq > 900) { 
        trackHistory.push({ x: P.posX, z: P.posZ });
      }
    }
  }

  if (trackHistory.length > 0 && freeModeStep === 0) {
    mapCtx.save();
    mapCtx.beginPath();
    mapCtx.strokeStyle = 'rgba(30, 30, 30, 0.8)'; 
    mapCtx.lineWidth = 2;
    
    for (let i = 0; i < trackHistory.length; i++) {
      const pt = trackHistory[i];
      const sx = cx + (pt.x - safeP.posX) / ecdisScale;
      const sy = cy - (pt.z - safeP.posZ) / ecdisScale;
      if (i === 0) mapCtx.moveTo(sx, sy);
      else mapCtx.lineTo(sx, sy);
    }
    const currSx = cx + (safeP.posX - safeP.posX) / ecdisScale;
    const currSy = cy - (safeP.posZ - safeP.posZ) / ecdisScale;
    mapCtx.lineTo(currSx, currSy);
    
    mapCtx.stroke();
    mapCtx.restore();
  }

  if (AIships) {
    AIships.concat(fishBoats || []).forEach(s => {
      const pos = s.mesh ? s.mesh.position : s.position; 
      if (!pos) return;
      const sx = cx + (pos.x - safeP.posX) / ecdisScale; 
      const sy = cy - (pos.z - safeP.posZ) / ecdisScale; 
      
      mapCtx.save();
      mapCtx.translate(sx, sy);
      mapCtx.rotate(s.heading || 0);

      mapCtx.beginPath();
      mapCtx.moveTo(0, -8); mapCtx.lineTo(5, 5); mapCtx.lineTo(-5, 5);  
      mapCtx.closePath();
      mapCtx.strokeStyle = '#000000'; 
      mapCtx.lineWidth = 1.5;
      mapCtx.stroke(); 

      mapCtx.beginPath();
      mapCtx.moveTo(0, -8); mapCtx.lineTo(0, -25); 
      mapCtx.stroke();
      mapCtx.restore();
    });
  }

  if (freeModeStep === 0 && (currentStartLoc || currentGoalLoc)) {
    [currentStartLoc, currentGoalLoc].forEach(loc => {
      if (!loc) return;
      const xz = latLonToXZ(loc.lat, loc.lon);
      const sx = cx + (xz.x - safeP.posX) / ecdisScale;
      const sy = cy - (xz.z - safeP.posZ) / ecdisScale;
      
      mapCtx.save();
      mapCtx.beginPath();
      mapCtx.arc(sx, sy, 8, 0, Math.PI * 2);
      mapCtx.fillStyle = 'rgba(255, 30, 30, 0.9)'; 
      mapCtx.fill();
      mapCtx.lineWidth = 2;
      mapCtx.strokeStyle = '#ffffff';
      mapCtx.stroke();
      
      mapCtx.fillStyle = '#000000';
      mapCtx.font = 'bold 12px sans-serif';
      mapCtx.textAlign = 'center';
      
      mapCtx.lineWidth = 3;
      mapCtx.strokeText(loc.name, sx, sy - 15);
      mapCtx.fillText(loc.name, sx, sy - 15);
      mapCtx.restore();
    });
  }

  if (P && typeof P.posX === 'number' && !isNaN(P.posX)) {
    mapCtx.save();
    mapCtx.translate(cx, cy);
    mapCtx.rotate(P.heading); 
    mapCtx.beginPath();
    mapCtx.moveTo(0, -12); mapCtx.lineTo(6, 8); mapCtx.lineTo(0, 4); mapCtx.lineTo(-6, 8); 
    mapCtx.closePath();
    mapCtx.lineWidth = 2;
    mapCtx.strokeStyle = '#000000'; 
    mapCtx.fillStyle = 'rgba(0,0,0,0)'; 
    mapCtx.stroke();
    mapCtx.beginPath();
    mapCtx.moveTo(0, -12); mapCtx.lineTo(0, -60); 
    mapCtx.strokeStyle = '#000000';
    mapCtx.stroke();
    mapCtx.restore();
  }

  mapCtx.save();
  const baseFont = "sans-serif";

  BUOYS.forEach(b => {
    const xz = latLonToXZ(b.lat, b.lon);
    const sx = cx + (xz.x - safeP.posX) / ecdisScale;
    const sy = cy - (xz.z - safeP.posZ) / ecdisScale;
    if (sx > -20 && sx < w + 20 && sy > -20 && sy < h + 20) {
      mapCtx.font = `bold 10px ${baseFont}`;
      mapCtx.textAlign = 'left';
      mapCtx.lineWidth = 2.5;
      mapCtx.strokeStyle = '#ffffff';
      mapCtx.strokeText(b.name, sx + 7, sy + 4);
      mapCtx.fillStyle = '#111111';
      mapCtx.fillText(b.name, sx + 7, sy + 4);
    }
  });

  if (typeof LANDMARKS !== 'undefined') {
    LANDMARKS.forEach(lm => {
      const xz = latLonToXZ(lm.lat, lm.lon);
      const sx = cx + (xz.x - safeP.posX) / ecdisScale;
      const sy = cy - (xz.z - safeP.posZ) / ecdisScale;
      if (sx < -100 || sx > w + 100 || sy < -100 || sy > h + 100) return;

      const size = lm.size || 11;
      const weight = lm.weight || "normal";
      mapCtx.font = `${weight} ${size}px ${baseFont}`;
      mapCtx.textAlign = lm.align || "center";
      const offset = lm.offset || 0;

      if (!lm.color || lm.color.indexOf('rgba(0,0,0,') === -1) {
        mapCtx.lineWidth = 3;
        mapCtx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        mapCtx.strokeText(lm.name, sx + offset, sy + 3);
      }
      mapCtx.fillStyle = lm.color || "#000000";
      mapCtx.fillText(lm.name, sx + offset, sy + 3);
    });
  }
  mapCtx.restore();

  mapCtx.fillStyle = '#000000'; 
  mapCtx.textAlign = 'left';
  mapCtx.textBaseline = 'top';
  mapCtx.font = '12px Arial, sans-serif';
  
  mapCtx.fillText(`SCALE : 1:${Math.round(ecdisScale * 100)}`, 20, 20);
  
  const ll = xzToLatLon(safeP.posX, safeP.posZ);
  if (ll) {
    mapCtx.fillText(`LAT   : ${formatLatLon(ll.lat, true)}`, 20, 40);
    mapCtx.fillText(`LON   : ${formatLatLon(ll.lon, false)}`, 20, 55);
  }

  let deg = ((safeP.heading || 0) * 180 / Math.PI + 360) % 360;
  if (deg < 0) deg += 360;
  mapCtx.fillText(`HDG   : ${deg.toFixed(1)}°`, 20, 75);
  mapCtx.fillText(`SPD   : ${(safeP.speed || 0).toFixed(1)} kt`, 20, 90);

  const currentDepth = getRealDepthAt(safeP.posX, safeP.posZ);
  mapCtx.fillText(`DEPTH : ${currentDepth === 99.9 ? '---' : currentDepth.toFixed(1)} m`, 20, 105);

  if (freeModeStep > 0) {
    mapCtx.save();
    
    const uiText = freeModeStep === 1 ? "スタート位置を選択してください" : "目的地を選択してください";
    const uiSub = freeModeStep === 1 ? "SELECT DEPARTURE POINT" : "SELECT DESTINATION POINT";

    const boxW = 280;
    const boxH = 55;
    const boxX = w - boxW - 20;
    const boxY = 20;

    mapCtx.fillStyle = 'rgba(10, 20, 30, 0.85)';
    mapCtx.strokeStyle = '#4292c6';
    mapCtx.lineWidth = 1;
    mapCtx.fillRect(boxX, boxY, boxW, boxH);
    mapCtx.strokeRect(boxX, boxY, boxW, boxH);

    mapCtx.fillStyle = '#6baed6';
    mapCtx.fillRect(boxX, boxY, 6, boxH);

    mapCtx.textAlign = 'right';
    mapCtx.textBaseline = 'top';
    
    mapCtx.fillStyle = '#6baed6';
    mapCtx.font = '10px Arial, sans-serif';
    mapCtx.fillText(uiSub, boxX + boxW - 15, boxY + 12);
    
    mapCtx.fillStyle = '#ffffff';
    mapCtx.font = 'bold 15px Arial, sans-serif';
    mapCtx.fillText(uiText, boxX + boxW - 15, boxY + 30);

    let keys = (freeModeStep === 1) ? ['uraga', 'yokohama', 'tokyo'] : 
               (selectedStartKey === 'uraga' ? ['yokohama', 'tokyo'] : ['uraga']);

    keys.forEach(key => {
      const loc = VOYAGE_LOCATIONS[key];
      const xz = latLonToXZ(loc.lat, loc.lon);
      const sx = cx + (xz.x - safeP.posX) / ecdisScale;
      const sy = cy - (xz.z - safeP.posZ) / ecdisScale;
      
      const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
      const radius = 12 + pulse * 8;

      mapCtx.beginPath();
      mapCtx.arc(sx, sy, radius, 0, Math.PI * 2);
      mapCtx.fillStyle = 'rgba(255, 100, 0, 0.4)';
      mapCtx.fill();

      mapCtx.beginPath();
      mapCtx.arc(sx, sy, 6, 0, Math.PI * 2);
      mapCtx.fillStyle = '#ff4400';
      mapCtx.fill();
      mapCtx.strokeStyle = '#ffffff';
      mapCtx.lineWidth = 2;
      mapCtx.stroke();

      mapCtx.fillStyle = '#111111';
      mapCtx.font = 'bold 14px sans-serif';
      mapCtx.textAlign = 'center';
      mapCtx.lineWidth = 3;
      mapCtx.strokeStyle = '#ffffff';
      mapCtx.strokeText("[ " + loc.name + " ]", sx, sy - 25);
      mapCtx.fillText("[ " + loc.name + " ]", sx, sy - 25);
    });

    mapCtx.restore();
  }
}