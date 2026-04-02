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
// 航路データ (Fairways & Buoys) — 観音崎・第二海堡での変針完全再現版
// ============================================================
const FAIRWAYS = [
  {
    name: "SOUTH APPROACH <000>",
    leftBound:  [ { lat: 35.150, lon: 139.767 }, { lat: 35.250, lon: 139.767 } ],
    rightBound: [ { lat: 35.150, lon: 139.783 }, { lat: 35.250, lon: 139.783 } ],
    center:     { lat: 35.200, lon: 139.775 }
  },
  {
    name: "URAGA SUIDO <352>",
    leftBound:  [ { lat: 35.250, lon: 139.767 }, { lat: 35.310, lon: 139.757 } ],
    rightBound: [ { lat: 35.250, lon: 139.783 }, { lat: 35.310, lon: 139.773 } ],
    center:     { lat: 35.280, lon: 139.766 }
  },
  {
    name: "NAKANOSE <021>",
    leftBound:  [ { lat: 35.310, lon: 139.759 }, { lat: 35.400, lon: 139.801 } ],
    rightBound: [ { lat: 35.310, lon: 139.771 }, { lat: 35.400, lon: 139.813 } ],
    center:     { lat: 35.355, lon: 139.786 }
  }
];

const BUOYS = [
  { name: "U1", lat: 35.180, lon: 139.767, color: "#11cc11" },
  { name: "U2", lat: 35.180, lon: 139.783, color: "#ee1111" },
  { name: "U3", lat: 35.250, lon: 139.767, color: "#11cc11" },
  { name: "U4", lat: 35.250, lon: 139.783, color: "#ee1111" },
  { name: "U7", lat: 35.310, lon: 139.757, color: "#11cc11" },
  { name: "U8", lat: 35.310, lon: 139.773, color: "#ee1111" },
  { name: "N1", lat: 35.320, lon: 139.764, color: "#11cc11" },
  { name: "N2", lat: 35.320, lon: 139.776, color: "#ee1111" },
  { name: "N3", lat: 35.360, lon: 139.782, color: "#11cc11" },
  { name: "N4", lat: 35.360, lon: 139.794, color: "#ee1111" },
  { name: "N7", lat: 35.400, lon: 139.801, color: "#11cc11" },
  { name: "N8", lat: 35.400, lon: 139.813, color: "#ee1111" },
  { name: "風の塔", lat: 35.4914, lon: 139.8347, color: "#ffffff" },
  { name: "海ほたる", lat: 35.4636, lon: 139.8753, color: "#ffffff" }
];

const LANDMARKS = [
  { name: "観音崎灯台", lat: 35.253, lon: 139.746, align: "right", offset: -12 },
  { name: "浦賀灯台",   lat: 35.210, lon: 139.730, align: "right", offset: -12 },
  { name: "富津灯台",   lat: 35.310, lon: 139.775, align: "left",  offset: 12 },
  { name: "中ノ瀬灯標", lat: 35.360, lon: 139.760, align: "center", offset: 20 }, 
  { name: "東 京 湾",   lat: 35.450, lon: 139.850, size: 24, weight: "bold", color: "rgba(0,0,0,0.4)" }, 
  { name: "浦賀水道",   lat: 35.240, lon: 139.770, size: 16, weight: "bold", color: "rgba(0,0,0,0.6)" },
  { name: "中 ノ 瀬",   lat: 35.360, lon: 139.765, size: 16, weight: "bold", color: "rgba(0,0,0,0.6)" }, 
  { name: "木更津港",   lat: 35.370, lon: 139.900, align: "left", offset: 12 },
  { name: "横須賀港",   lat: 35.290, lon: 139.670, align: "right", offset: -12 },
  { name: "横浜港",     lat: 35.450, lon: 139.670, align: "right", offset: -12 },
  { name: "東京港",     lat: 35.600, lon: 139.770, align: "center", offset: 20 },
  { name: "羽田空港",   lat: 35.550, lon: 139.780, align: "center", offset: 20 },
  { name: "富津岬",     lat: 35.310, lon: 139.810, align: "left", offset: 12 },
  { name: "第二海堡",   lat: 35.308, lon: 139.740, align: "right", offset: -12 },
];

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

fetch('./tokyobay.geojson?v=' + Date.now())
  .then(res => res.json())
  .then(data => { 
    geoData = data; 
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
            stitched = true; break;
          }
        }
        if (stitched) break;
      }
    }
    rawLines.forEach(line => {
      let polyXZ = line.map(p => latLonToXZ(p[1], p[0]));
      if (line.length > 5) {
        const start = line[0], end = line[line.length - 1];
        if (start[0] !== end[0] || start[1] !== end[1]) {
          const sY = latLonToXZ(start[1], start[0]).z, eY = latLonToXZ(end[1], end[0]).z;
          polyXZ.push({x: 99999, z: eY}); polyXZ.push({x: 99999, z: 99999}); polyXZ.push({x: -99999, z: 99999}); polyXZ.push({x: -99999, z: sY});
        }
        parsedPolygonsXZ.push({ poly: polyXZ });
      }
    });
    parsedPolygonsXZ.forEach(item => {
       let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
       item.poly.forEach(p => {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
       });
       item.bounds = { minX, maxX, minZ, maxZ };
    });
    generateRealisticDepths(); 
  });

function generateRealisticDepths() {
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
  const blob = new Blob([workerCode], { type: 'application/javascript' });
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
    _buildDepthGrid(); worker.terminate(); URL.revokeObjectURL(blob);
  };
}

const GRID_CELL = 600;
const depthGrid = new Map();
const GRID_START_X = -30000, GRID_END_X = 60000;
const GRID_START_Z = -75000, GRID_END_Z = 30000;
const RENDER_STEP = 600;
let renderGrid = null;
let gridCols = 0; let gridRows = 0;
let hasAddedCoastlineDepth = false;

function _buildDepthGrid() {
  if (!hasAddedCoastlineDepth && parsedPolygonsXZ.length > 0) {
    parsedPolygonsXZ.forEach(item => item.poly.forEach(pt => depthData.push({ x: pt.x, z: pt.z, depth: 0.0 })));
    hasAddedCoastlineDepth = true;
  }
  depthGrid.clear();
  depthData.forEach(pt => { const key = `${Math.round(pt.x/GRID_CELL)},${Math.round(pt.z/GRID_CELL)}`; if (!depthGrid.has(key)) depthGrid.set(key, pt.depth); });
  gridCols = Math.ceil((GRID_END_X - GRID_START_X) / RENDER_STEP) + 1;
  gridRows = Math.ceil((GRID_END_Z - GRID_START_Z) / RENDER_STEP) + 1;
  renderGrid = new Float32Array(gridCols * gridRows);
  for(let r = 0; r < gridRows; r++) {
    for(let c = 0; c < gridCols; c++) {
      const gx = GRID_START_X + c * RENDER_STEP, gz = GRID_START_Z + r * RENDER_STEP;
      renderGrid[r * gridCols + c] = getRealDepthAt(gx, gz);
    }
  }
}

export function getRealDepthAt(posX, posZ) {
  if (depthGrid.size === 0) return 99.9;
  const cx = Math.round(posX / GRID_CELL), cz = Math.round(posZ / GRID_CELL);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const k = `${cx + dx},${cz + dz}`;
      if (depthGrid.has(k)) return depthGrid.get(k);
    }
  }
  return 99.9;
}

function initMap() {
  if (mapCv) return;
  mapCv = document.createElement('canvas'); mapCv.id = 'ecdis-monitor';
  Object.assign(mapCv.style, { position: 'absolute', top: '10%', left: '10%', width: '80%', height: '80%', backgroundColor: '#e4f1fc', border: '4px solid #4a5b6c', borderRadius: '2px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: '500', display: 'none', pointerEvents: 'auto' });
  document.body.appendChild(mapCv); mapCtx = mapCv.getContext('2d');
  mapCv.addEventListener('mousedown', (e) => { e.stopPropagation(); isDragging = true; lastMouseX = e.clientX; lastMouseY = e.clientY; });
  mapCv.addEventListener('mousemove', (e) => { e.stopPropagation(); if (!isDragging) return; panX += e.clientX - lastMouseX; panY += e.clientY - lastMouseY; lastMouseX = e.clientX; lastMouseY = e.clientY; });
  mapCv.addEventListener('mouseup', (e) => { e.stopPropagation(); isDragging = false; });
  mapCv.addEventListener('mouseleave', (e) => { e.stopPropagation(); isDragging = false; });
  mapCv.addEventListener('wheel', (e) => { e.stopPropagation(); e.preventDefault(); if (e.deltaY < 0) ecdisScale = Math.max(5, ecdisScale * 0.8); else ecdisScale = Math.min(80, ecdisScale * 1.25); });
  mapCv.addEventListener('dblclick', (e) => { e.stopPropagation(); panX = 0; panY = 0; ecdisScale = 25; });
}

export function isToolOpen() { return toolOpen; }
export function toggleTool() {
  initMap(); toolOpen = !toolOpen; mapCv.style.display = toolOpen ? 'block' : 'none';
  if (toolOpen) { mapCv.width = mapCv.clientWidth; mapCv.height = mapCv.clientHeight; }
}

export function drawAll(P, AIships, fishBoats, buoys, curM) {
  if (!toolOpen || !mapCtx || !geoData) return;
  const w = mapCv.width, h = mapCv.height;
  const cx = (w / 2) + panX; const cy = (h / 2) + panY;
  mapCtx.clearRect(0, 0, w, h);
  mapCtx.fillStyle = '#e4f1fc'; mapCtx.fillRect(0, 0, w, h);

  if (renderGrid) {
    const worldMinX = P.posX - (w / 2) * ecdisScale, worldMaxX = P.posX + (w / 2) * ecdisScale;
    const worldMaxZ = P.posZ + (h / 2) * ecdisScale, worldMinZ = P.posZ - (h / 2) * ecdisScale;
    const startC = Math.max(0, Math.floor((worldMinX - GRID_START_X) / RENDER_STEP) - 1);
    const endC = Math.min(gridCols - 1, Math.ceil((worldMaxX - GRID_START_X) / RENDER_STEP) + 1);
    const startR = Math.max(0, Math.floor((worldMinZ - GRID_START_Z) / RENDER_STEP) - 1);
    const endR = Math.min(gridRows - 1, Math.ceil((worldMaxZ - GRID_START_Z) / RENDER_STEP) + 1);

    const getV = (r, c) => { const v = renderGrid[r * gridCols + c]; return (v === undefined || isNaN(v)) ? 50.0 : v; };
    const fillContourBand = (threshold, color) => {
      mapCtx.fillStyle = color; mapCtx.beginPath();
      for(let r = startR; r < endR - 1; r++) {
        for(let c = startC; c < endC - 1; c++) {
          const v0 = getV(r, c), v1 = getV(r, c+1), v2 = getV(r+1, c+1), v3 = getV(r+1, c);
          const b0 = v0 <= threshold, b1 = v1 <= threshold, b2 = v2 <= threshold, b3 = v3 <= threshold;
          const idx = (b0 ? 1 : 0) | (b1 ? 2 : 0) | (b2 ? 4 : 0) | (b3 ? 8 : 0);
          if (idx === 0) continue;
          const p0 = { x: cx + (GRID_START_X + c * RENDER_STEP - P.posX)/ecdisScale, y: cy - (GRID_START_Z + r * RENDER_STEP - P.posZ)/ecdisScale };
          const p1 = { x: cx + (GRID_START_X + (c+1) * RENDER_STEP - P.posX)/ecdisScale, y: cy - (GRID_START_Z + r * RENDER_STEP - P.posZ)/ecdisScale };
          const p2 = { x: cx + (GRID_START_X + (c+1) * RENDER_STEP - P.posX)/ecdisScale, y: cy - (GRID_START_Z + (r+1) * RENDER_STEP - P.posZ)/ecdisScale };
          const p3 = { x: cx + (GRID_START_X + c * RENDER_STEP - P.posX)/ecdisScale, y: cy - (GRID_START_Z + (r+1) * RENDER_STEP - P.posZ)/ecdisScale };
          if (idx === 15) { mapCtx.moveTo(p0.x, p0.y); mapCtx.lineTo(p1.x, p1.y); mapCtx.lineTo(p2.x, p2.y); mapCtx.lineTo(p3.x, p3.y); mapCtx.closePath(); continue; }
          const interp = (ptA, ptB, valA, valB) => { const t = (threshold - valA) / (valB - valA + 1e-5); return { x: ptA.x + t * (ptB.x - ptA.x), y: ptA.y + t * (ptB.y - ptA.y) }; };
          const eT = interp(p0, p1, v0, v1), eR = interp(p1, p2, v1, v2), eB = interp(p3, p2, v3, v2), eL = interp(p0, p3, v0, v3);
          let polys = [];
          switch(idx) {
            case 1: polys.push([p0, eT, eL]); break; case 2: polys.push([p1, eR, eT]); break; case 3: polys.push([p0, p1, eR, eL]); break;
            case 4: polys.push([p2, eB, eR]); break; case 5: polys.push([p0, eT, eL], [p2, eB, eR]); break; case 6: polys.push([p1, p2, eB, eT]); break;
            case 7: polys.push([p0, p1, p2, eB, eL]); break; case 8: polys.push([p3, eL, eB]); break; case 9: polys.push([p0, eT, eB, p3]); break;
            case 10: polys.push([p1, eR, eT], [p3, eL, eB]); break; case 11: polys.push([p0, p1, eR, eB, p3]); break;
            case 12: polys.push([p3, eL, eR, p2]); break; case 13: polys.push([p0, eT, eR, p2, p3]); break; case 14: polys.push([p1, p2, p3, eL, eT]); break;
          }
          polys.forEach(poly => { mapCtx.moveTo(poly[0].x, poly[0].y); for(let i=1; i<poly.length; i++) mapCtx.lineTo(poly[i].x, poly[i].y); mapCtx.closePath(); });
        }
      }
      mapCtx.fill();
    };
    fillContourBand(20.0, '#9ecae1'); fillContourBand(10.0, '#6baed6'); fillContourBand(5.0, '#4292c6');
    const drawContour = (threshold, color, width) => {
      mapCtx.beginPath(); mapCtx.strokeStyle = color; mapCtx.lineWidth = width; mapCtx.lineCap = 'round';
      for(let r = startR; r < endR - 1; r++) {
        for(let c = startC; c < endC - 1; c++) {
          const v0 = getV(r, c), v1 = getV(r, c+1), v2 = getV(r+1, c+1), v3 = getV(r+1, c);
          const b0 = v0 <= threshold, b1 = v1 <= threshold, b2 = v2 <= threshold, b3 = v3 <= threshold;
          if (b0 === b1 && b1 === b2 && b2 === b3) continue;
          const pt0 = { x: GRID_START_X + c * RENDER_STEP, z: GRID_START_Z + r * RENDER_STEP };
          const pt1 = { x: GRID_START_X + (c+1) * RENDER_STEP, z: GRID_START_Z + r * RENDER_STEP };
          const pt2 = { x: GRID_START_X + (c+1) * RENDER_STEP, z: GRID_START_Z + (r+1) * RENDER_STEP };
          const pt3 = { x: GRID_START_X + c * RENDER_STEP, z: GRID_START_Z + (r+1) * RENDER_STEP };
          const interp = (pA, pB, valA, valB) => { const t = (threshold - valA) / (valB - valA + 1e-5); return { x: pA.x + t * (pB.x - pA.x), z: pA.z + t * (pB.z - pA.z) }; };
          let pts = []; if (b0 !== b1) pts.push(interp(pt0, pt1, v0, v1)); if (b1 !== b2) pts.push(interp(pt1, pt2, v1, v2)); if (b2 !== b3) pts.push(interp(pt2, pt3, v2, v3)); if (b3 !== b0) pts.push(interp(pt3, pt0, v3, v0));
          if (pts.length >= 2) {
            const s1 = { x: cx + (pts[0].x - P.posX)/ecdisScale, y: cy - (pts[0].z - P.posZ)/ecdisScale };
            const s2 = { x: cx + (pts[1].x - P.posX)/ecdisScale, y: cy - (pts[1].z - P.posZ)/ecdisScale };
            mapCtx.moveTo(s1.x, s1.y); mapCtx.lineTo(s2.x, s2.y);
            if (pts.length === 4) {
              const s3 = { x: cx + (pts[2].x - P.posX)/ecdisScale, y: cy - (pts[2].z - P.posZ)/ecdisScale };
              const s4 = { x: cx + (pts[3].x - P.posX)/ecdisScale, y: cy - (pts[3].z - P.posZ)/ecdisScale };
              mapCtx.moveTo(s3.x, s3.y); mapCtx.lineTo(s4.x, s4.y);
            }
          }
        }
      }
      mapCtx.stroke();
    };
    drawContour(5.0, '#1c5a8a', 1.8); drawContour(10.0, '#327ba8', 1.2); drawContour(20.0, '#5a9dc4', 1.0);
  }

  mapCtx.strokeStyle = 'rgba(0,0,0,0.1)'; mapCtx.lineWidth = 1; mapCtx.beginPath();
  for(let i=0; i<w; i+=60) { mapCtx.moveTo(i, 0); mapCtx.lineTo(i, h); }
  for(let i=0; i<h; i+=60) { mapCtx.moveTo(0, i); mapCtx.lineTo(w, i); }
  mapCtx.stroke();

  mapCtx.fillStyle = '#dcb982'; mapCtx.strokeStyle = '#222222'; mapCtx.lineWidth = 1.0;
  parsedPolygonsXZ.forEach(item => {
    mapCtx.beginPath();
    item.poly.forEach((pt, i) => { const sx = cx + (pt.x-P.posX)/ecdisScale, sy = cy - (pt.z-P.posZ)/ecdisScale; if(i===0) mapCtx.moveTo(sx, sy); else mapCtx.lineTo(sx, sy); });
    mapCtx.closePath(); mapCtx.fill(); mapCtx.stroke();
  });

  mapCtx.save();
  FAIRWAYS.forEach(fw => {
    mapCtx.strokeStyle = 'rgba(200, 0, 200, 0.7)'; mapCtx.lineWidth = 1.8; mapCtx.setLineDash([8, 8]);
    mapCtx.beginPath(); fw.leftBound.forEach((pt, i) => { const xz = latLonToXZ(pt.lat, pt.lon); const sx = cx + (xz.x-P.posX)/ecdisScale, sy = cy - (xz.z-P.posZ)/ecdisScale; if(i===0) mapCtx.moveTo(sx, sy); else mapCtx.lineTo(sx, sy); }); mapCtx.stroke();
    mapCtx.beginPath(); fw.rightBound.forEach((pt, i) => { const xz = latLonToXZ(pt.lat, pt.lon); const sx = cx + (xz.x-P.posX)/ecdisScale, sy = cy - (xz.z-P.posZ)/ecdisScale; if(i===0) mapCtx.moveTo(sx, sy); else mapCtx.lineTo(sx, sy); }); mapCtx.stroke();
  });
  mapCtx.restore();

  BUOYS.forEach(b => {
    const xz = latLonToXZ(b.lat, b.lon); const sx = cx + (xz.x-P.posX)/ecdisScale, sy = cy - (xz.z-P.posZ)/ecdisScale;
    if (sx > -20 && sx < w + 20 && sy > -20 && sy < h + 20) {
      mapCtx.beginPath();
      if (b.color === "#11cc11") { mapCtx.moveTo(sx, sy-6); mapCtx.lineTo(sx+5, sy+4); mapCtx.lineTo(sx-5, sy+4); }
      else if (b.color === "#ee1111") { mapCtx.rect(sx-4, sy-4, 8, 8); }
      else { mapCtx.moveTo(sx, sy-6); mapCtx.lineTo(sx+5, sy); mapCtx.lineTo(sx, sy+6); mapCtx.lineTo(sx-5, sy); }
      mapCtx.closePath(); mapCtx.fillStyle = b.color; mapCtx.fill(); mapCtx.strokeStyle = '#000000'; mapCtx.lineWidth = 1; mapCtx.stroke();
    }
  });

  if (depthData.length > 0) {
    const dPos = []; mapCtx.textAlign = 'center';
    depthData.forEach(pt => {
      if (pt.depth === 0.0) return;
      const sx = cx + (pt.x-P.posX)/ecdisScale, sy = cy - (pt.z-P.posZ)/ecdisScale;
      if (sx > 0 && sx < w && sy > 0 && sy < h) {
        const rad = pt.depth >= 20.0 ? 60 : 35;
        if (dPos.some(p => Math.abs(p.x-sx) < rad && Math.abs(p.y-sy) < rad*0.6)) return;
        dPos.push({x: sx, y: sy});
        if (pt.depth <= 15.0) { mapCtx.fillStyle = '#000000'; mapCtx.font = 'bold 11px Arial'; }
        else { mapCtx.fillStyle = '#5a6b7c'; mapCtx.font = '10px Arial'; }
        mapCtx.fillText(pt.depth.toFixed(1), sx, sy);
      }
    });
  }

  mapCtx.save(); mapCtx.translate(cx, cy); mapCtx.rotate(P.heading);
  mapCtx.beginPath(); mapCtx.moveTo(0, -12); mapCtx.lineTo(6, 8); mapCtx.lineTo(0, 4); mapCtx.lineTo(-6, 8); mapCtx.closePath();
  mapCtx.lineWidth = 2; mapCtx.strokeStyle = '#000000'; mapCtx.stroke();
  mapCtx.beginPath(); mapCtx.moveTo(0, -12); mapCtx.lineTo(0, -60); mapCtx.stroke();
  mapCtx.restore();

  mapCtx.save();
  const font = "sans-serif";
  FAIRWAYS.forEach(fw => {
    const mxz = latLonToXZ(fw.center.lat, fw.center.lon);
    mapCtx.fillStyle = 'rgba(200, 0, 200, 0.9)'; mapCtx.font = `italic bold 11px ${font}`; mapCtx.textAlign = 'center';
    mapCtx.fillText(fw.name, cx + (mxz.x-P.posX)/ecdisScale, cy - (mxz.z-P.posZ)/ecdisScale);
  });
  BUOYS.forEach(b => {
    const xz = latLonToXZ(b.lat, b.lon); const sx = cx + (xz.x-P.posX)/ecdisScale, sy = cy - (xz.z-P.posZ)/ecdisScale;
    if (sx > -20 && sx < w+20 && sy > -20 && sy < h+20) {
      mapCtx.font = `bold 10px ${font}`; mapCtx.textAlign = 'left'; mapCtx.lineWidth = 2.5; mapCtx.strokeStyle = '#ffffff';
      mapCtx.strokeText(b.name, sx+7, sy+4); mapCtx.fillStyle = '#111111'; mapCtx.fillText(b.name, sx+7, sy+4);
    }
  });
  if (typeof LANDMARKS !== 'undefined') {
    LANDMARKS.forEach(lm => {
      const xz = latLonToXZ(lm.lat, lm.lon); const sx = cx + (xz.x-P.posX)/ecdisScale, sy = cy - (xz.z-P.posZ)/ecdisScale;
      if (sx < -100 || sx > w+100 || sy < -100 || sy > h+100) return;
      mapCtx.font = `${lm.weight || 'normal'} ${lm.size || 11}px ${font}`; mapCtx.textAlign = lm.align || "center";
      const off = lm.offset || 0;
      if (!lm.color || lm.color.indexOf('rgba(0,0,0,') === -1) { mapCtx.lineWidth = 3; mapCtx.strokeStyle = "rgba(255, 255, 255, 0.8)"; mapCtx.strokeText(lm.name, sx+off, sy+3); }
      mapCtx.fillStyle = lm.color || "#000000"; mapCtx.fillText(lm.name, sx+off, sy+3);
    });
  }
  mapCtx.restore();

  mapCtx.fillStyle = '#000000'; mapCtx.font = 'bold 14px Arial'; mapCtx.textAlign = 'left'; mapCtx.textBaseline = 'top';
  mapCtx.fillText('ECDIS - TOKYO BAY SYSTEM', 20, 20);
  mapCtx.font = '12px Arial'; mapCtx.fillText(`SCALE : 1:${Math.round(ecdisScale*100)}`, 20, 45);
  const ll = xzToLatLon(P.posX, P.posZ);
  if (ll) { mapCtx.fillText(`LAT   : ${formatLatLon(ll.lat, true)}`, 20, 65); mapCtx.fillText(`LON   : ${formatLatLon(ll.lon, false)}`, 20, 80); }
}