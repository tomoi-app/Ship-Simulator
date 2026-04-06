'use strict';
// ============================================================
//  ecdis-data.js — データ層
//  担当: 座標変換 / 水深生成(Web Worker) / GeoJSON読込 / 定数
// ============================================================

// ─── 座標系定数 ──────────────────────────────────────────────
const ORIGIN_LAT = 35.45;
const ORIGIN_LON = 139.75;

export function latLonToXZ(lat, lon) {
  const x = (lon - ORIGIN_LON) * 111320 * Math.cos(ORIGIN_LAT * Math.PI / 180);
  const z = (lat - ORIGIN_LAT) * 111320;
  return { x, z };
}

export function xzToLatLon(x, z) {
  const lat = (z / 111320) + ORIGIN_LAT;
  const lon = (x / (111320 * Math.cos(ORIGIN_LAT * Math.PI / 180))) + ORIGIN_LON;
  return { lat, lon };
}

export function formatLatLon(deg, isLat) {
  const absDeg = Math.abs(deg);
  const d = Math.floor(absDeg);
  const m = ((absDeg - d) * 60).toFixed(2);
  const dir = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'W');
  return `${String(d).padStart(isLat ? 2 : 3, '0')}° ${String(m).padStart(5, '0')}' ${dir}`;
}

// ─── グリッドインデックス ─────────────────────────────────────
export const GRID_START_X = -30000, GRID_END_X = 60000;
export const GRID_START_Z = -75000, GRID_END_Z = 30000;
export const RENDER_STEP  = 300;
export const gridCols = Math.ceil((GRID_END_X - GRID_START_X) / RENDER_STEP) + 1;
export const gridRows = Math.ceil((GRID_END_Z - GRID_START_Z) / RENDER_STEP) + 1;

// renderGrid は水深生成完了後に書き込まれる共有バッファ
export let renderGrid = null;
export let isDepthLoading = true;

// 外部から書き換え可能なセッター
export function setRenderGrid(grid) { renderGrid = grid; }
export function setDepthLoading(v)  { isDepthLoading = v; }

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

// ─── 陸地ポリゴン（GeoJSON から生成） ────────────────────────
export let parsedPolygonsXZ = [];

// ─── 航路定義 ─────────────────────────────────────────────────
export const FAIRWAYS = [
  {
    name: 'SOUTH APPROACH',
    leftBound:  [{ lat: 35.150, lon: 139.765 }, { lat: 35.250, lon: 139.765 }],
    rightBound: [{ lat: 35.150, lon: 139.781 }, { lat: 35.250, lon: 139.781 }],
  },
  {
    name: 'URAGA SUIDO',
    leftBound:  [{ lat: 35.250, lon: 139.765 }, { lat: 35.320, lon: 139.718 }],
    rightBound: [{ lat: 35.250, lon: 139.781 }, { lat: 35.320, lon: 139.734 }],
  },
  {
    name: 'NAKANOSE',
    leftBound:  [{ lat: 35.320, lon: 139.718 }, { lat: 35.400, lon: 139.748 }],
    rightBound: [{ lat: 35.320, lon: 139.734 }, { lat: 35.400, lon: 139.764 }],
  },
];

// ─── 浮標定義 ─────────────────────────────────────────────────
export const BUOYS = [
  { name: 'U1', lat: 35.180, lon: 139.765, color: '#11cc11' },
  { name: 'U2', lat: 35.180, lon: 139.781, color: '#ee1111' },
  { name: 'U3', lat: 35.250, lon: 139.765, color: '#11cc11' },
  { name: 'U4', lat: 35.250, lon: 139.781, color: '#ee1111' },
  { name: 'U5', lat: 35.285, lon: 139.741, color: '#11cc11' },
  { name: 'U6', lat: 35.285, lon: 139.757, color: '#ee1111' },
  { name: 'U7', lat: 35.320, lon: 139.718, color: '#11cc11' },
  { name: 'U8', lat: 35.320, lon: 139.734, color: '#ee1111' },
  { name: 'N1', lat: 35.340, lon: 139.726, color: '#11cc11' },
  { name: 'N2', lat: 35.340, lon: 139.742, color: '#ee1111' },
  { name: 'N3', lat: 35.370, lon: 139.737, color: '#11cc11' },
  { name: 'N4', lat: 35.370, lon: 139.753, color: '#ee1111' },
  { name: 'N7', lat: 35.400, lon: 139.748, color: '#11cc11' },
  { name: 'N8', lat: 35.400, lon: 139.764, color: '#ee1111' },
  { name: '風の塔',   lat: 35.4914, lon: 139.8347, color: '#ffffff' },
  { name: '海ほたる', lat: 35.4636, lon: 139.8753, color: '#ffffff' },
];

// ─── ランドマーク定義 ─────────────────────────────────────────
export const LANDMARKS = [
  { name: '観音崎灯台', lat: 35.253, lon: 139.730, align: 'right' },
  { name: '第二海堡',   lat: 35.308, lon: 139.710, align: 'right' },
  { name: '浦賀灯台',   lat: 35.210, lon: 139.715, align: 'right' },
  { name: '富津灯台',   lat: 35.310, lon: 139.780, align: 'left'  },
  { name: '東 京 湾',   lat: 35.450, lon: 139.850, size: 24, weight: 'bold', color: 'rgba(0,0,0,0.4)' },
  { name: '浦賀水道',   lat: 35.270, lon: 139.700, size: 16, weight: 'bold', color: 'rgba(0,0,0,0.6)', align: 'right' },
  { name: '中 ノ 瀬',   lat: 35.380, lon: 139.710, size: 16, weight: 'bold', color: 'rgba(0,0,0,0.6)', align: 'right' },
  { name: '木更津港',   lat: 35.370, lon: 139.900, align: 'left'  },
  { name: '横須賀港',   lat: 35.290, lon: 139.670, align: 'right' },
  { name: '横浜港',     lat: 35.450, lon: 139.670, align: 'right' },
  { name: '東京港',     lat: 35.600, lon: 139.770, align: 'center'},
  { name: '羽田空港',   lat: 35.550, lon: 139.780, align: 'center'},
  { name: '富津岬',     lat: 35.310, lon: 139.810, align: 'left'  },
];

// ─── 航行拠点（フリーモード用） ───────────────────────────────
export const VOYAGE_LOCATIONS = {
  uraga:    { name: '浦賀水道', lat: 35.150, lon: 139.773, heading: 0   },
  yokohama: { name: '横浜港',   lat: 35.452, lon: 139.648, heading: 110 },
  tokyo:    { name: '東京港',   lat: 35.590, lon: 139.780, heading: 180 },
};

// ─── 有名浅瀬（水深生成Worker用） ────────────────────────────
const FAMOUS_SHOALS = [
  { name: '中ノ瀬',   pos: latLonToXZ(35.3750, 139.7150), radius: 5000, depth: 7.0 },
  { name: '富津岬沖', pos: latLonToXZ(35.3150, 139.7900), radius: 4000, depth: 3.0 },
  { name: '観音崎',   pos: latLonToXZ(35.2600, 139.7500), radius: 2000, depth: 8.0 },
  { name: '盤洲干潟', pos: latLonToXZ(35.4000, 139.9000), radius: 6000, depth: 2.0 },
  { name: '羽田沖',   pos: latLonToXZ(35.5400, 139.8000), radius: 3000, depth: 7.0 },
];

// ★修正: 港湾部の水深設定をさらに広げ、最大水深も増加
const DEEP_AREAS = [
  { pos: latLonToXZ(35.452, 139.648), radius: 3000, depth: 25.0 }, // 横浜港
  { pos: latLonToXZ(35.445, 139.680), radius: 4000, depth: 25.0 }, 
  { pos: latLonToXZ(35.430, 139.720), radius: 5000, depth: 25.0 }, 
  { pos: latLonToXZ(35.590, 139.780), radius: 4000, depth: 25.0 }, // 東京港
  { pos: latLonToXZ(35.550, 139.780), radius: 5000, depth: 25.0 }, 
  { pos: latLonToXZ(35.480, 139.770), radius: 6000, depth: 25.0 }, 
];

// ─── GeoJSON 読み込み → ポリゴン解析 → 水深生成 ─────────────
export function loadGeoData(onComplete) {
  fetch('./tokyobay.geojson?v=' + Date.now())
    .then(res => res.json())
    .then(data => {
      console.log('ECDIS: 海図データのロード完了');

      const rawLines = [];
      data.features.forEach(feat => {
        if (!feat.geometry) return;
        const type   = feat.geometry.type;
        const coords = feat.geometry.coordinates;
        if (type === 'LineString') {
          rawLines.push(coords);
        } else if (type === 'Polygon') {
          coords.forEach(r => parsedPolygonsXZ.push({ poly: r.map(p => latLonToXZ(p[1], p[0])) }));
        } else if (type === 'MultiPolygon') {
          coords.forEach(poly => poly.forEach(r => parsedPolygonsXZ.push({ poly: r.map(p => latLonToXZ(p[1], p[0])) })));
        }
      });

      // LineString のステッチ
      let stitched = true;
      while (stitched) {
        stitched = false;
        for (let i = 0; i < rawLines.length; i++) {
          for (let j = 0; j < rawLines.length; j++) {
            if (i === j) continue;
            const lineA = rawLines[i], lineB = rawLines[j];
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
          const start = line[0], end = line[line.length - 1];
          if (start[0] !== end[0] || start[1] !== end[1]) {
            const FAR_NORTH = 99999, FAR_WEST = -99999, FAR_EAST = 99999;
            const sY = latLonToXZ(start[1], start[0]).z;
            const eY = latLonToXZ(end[1],   end[0]).z;
            polyXZ.push({ x: FAR_EAST, z: eY });
            polyXZ.push({ x: FAR_EAST, z: FAR_NORTH });
            polyXZ.push({ x: FAR_WEST, z: FAR_NORTH });
            polyXZ.push({ x: FAR_WEST, z: sY });
          }
          parsedPolygonsXZ.push({ poly: polyXZ });
        }
      });

      // 境界ボックスを事前計算
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

      generateDepths(onComplete);
    })
    .catch(err => console.error('ECDISエラー:', err));
}

// ─── 水深データ生成（Web Worker） ────────────────────────────
function generateDepths(onComplete) {
  const fairwayLines = FAIRWAYS.map(fw =>
    fw.leftBound.map((lb, i) => {
      const rb = fw.rightBound[i];
      return latLonToXZ((lb.lat + rb.lat) / 2, (lb.lon + rb.lon) / 2);
    })
  );

  const workerCode = `
    function isPointInPolygon(px, pz, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        let xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
        if (((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi))
          inside = !inside;
      }
      return inside;
    }

    function distToSegmentSq(px, pz, x1, z1, x2, z2) {
      const l2 = (x1-x2)**2 + (z1-z2)**2;
      if (l2 === 0) return (px-x1)**2 + (pz-z1)**2;
      let t = ((px-x1)*(x2-x1) + (pz-z1)*(z2-z1)) / l2;
      t = Math.max(0, Math.min(1, t));
      return (px-(x1+t*(x2-x1)))**2 + (pz-(z1+t*(z2-z1)))**2;
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
                const p1 = fwPath[i], p2 = fwPath[i+1];
                if (distToSegmentSq(x, z, p1.x, p1.z, p2.x, p2.z) < 810000) inFairway = true;
              }
            });
            if (inFairway) depth = Math.max(depth, 22.0 + rand() * 2);
            
            finalDepth = Math.max(2.0, Math.min(45.0, depth));
            
            // ★修正: 港湾部（deepAreas）の底をすり鉢状ではなく平らなお盆状に変更
            deepAreas.forEach(area => {
              const dSq = (area.pos.x - x)**2 + (area.pos.z - z)**2;
              if (dSq < area.radius**2) {
                const d = Math.sqrt(dSq);
                
                // 中心から半径の半分（50%）までは比率1.0（平らな底）
                // それより外側は外縁部に向かってなだらかに比率を落とす
                let ratio = 1.0;
                if (d > area.radius * 0.5) {
                  ratio = 1.0 - ((d - area.radius * 0.5) / (area.radius * 0.5));
                }
                
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

  worker.postMessage({
    polygons:  parsedPolygonsXZ,
    shoals:    FAMOUS_SHOALS,
    fairways:  fairwayLines,
    deepAreas: DEEP_AREAS,
    startX: GRID_START_X, endX: GRID_END_X,
    startZ: GRID_START_Z, endZ: GRID_END_Z,
    step: RENDER_STEP,
    cols: gridCols, rows: gridRows,
  });

  worker.onmessage = function(e) {
    setRenderGrid(e.data);
    setDepthLoading(false);
    console.log('ECDIS: 水深データ生成完了');
    worker.terminate();
    URL.revokeObjectURL(blob);
    if (onComplete) onComplete();
  };
}