'use strict';
// ============================================================
//  ecdis-draw.js — 描画層
//  担当: drawAll() / 水深コンター / 陸地・浮標・AI船・自船 / ルート描画
// ============================================================

import {
  latLonToXZ, xzToLatLon, formatLatLon,
  getRealDepthAt,
  renderGrid, isDepthLoading,
  parsedPolygonsXZ,
  GRID_START_X, GRID_START_Z, RENDER_STEP, gridCols, gridRows,
  FAIRWAYS, BUOYS, LANDMARKS,
} from './ecdis-data.js';

// ─── 外部から注入されるUI状態（ecdis-ui.js が書き込む） ──────
import {
  getCanvasState,
  isGlobalLoading, globalLoadingText,
  freeModeStep,
  currentStartLoc, currentGoalLoc,
  routeWaypoints, trackHistory,
  hoverX, hoverY,
  ecdisClickPos, clearEcdisClick,
  selectedAIShip, setSelectedAIShip
} from './ecdis-ui.js';

// ─── メイン描画エントリーポイント ─────────────────────────────
export function drawAll(P, AIships, fishBoats) {
  const { mapCv, mapCtx, toolOpen, ecdisScale, panX, panY } = getCanvasState();
  if (!toolOpen && !isGlobalLoading && !isDepthLoading) return;
  if (!mapCv) return;

  if (mapCv.width  === 0 || mapCv.height === 0 ||
      mapCv.width  !== mapCv.clientWidth   ||
      mapCv.height !== mapCv.clientHeight) {
    mapCv.width  = mapCv.clientWidth  || window.innerWidth;
    mapCv.height = mapCv.clientHeight || window.innerHeight;
  }

  const w = mapCv.width, h = mapCv.height;

  // ─ ローディング画面 ─
  if (isDepthLoading || isGlobalLoading) {
    mapCtx.save();
    mapCtx.clearRect(0, 0, w, h);
    mapCtx.textAlign     = 'center';
    mapCtx.textBaseline  = 'middle';
    mapCtx.shadowColor   = 'rgba(0,0,0,0.8)';
    mapCtx.shadowBlur    = 5;
    mapCtx.shadowOffsetX = 2;
    mapCtx.shadowOffsetY = 2;
    mapCtx.fillStyle = '#ffffff';
    mapCtx.font = 'bold 24px sans-serif';
    const dots = '.'.repeat(Math.floor(Date.now() / 400) % 4);
    const text = isGlobalLoading ? globalLoadingText : '地形データを読み込み中';
    mapCtx.fillText(text + dots, w / 2, h / 2);
    mapCtx.restore();
    return;
  }

  const safeP = (P && typeof P.posX === 'number' && !isNaN(P.posX))
    ? P
    : { posX: latLonToXZ(35.30, 139.75).x, posZ: latLonToXZ(35.30, 139.75).z, heading: 0, speed: 0, draft: 14.5 };

  const cx = (w / 2) + panX;
  const cy = (h / 2) + panY;

  mapCtx.clearRect(0, 0, w, h);
  mapCtx.fillStyle = '#e4f1fc';
  mapCtx.fillRect(0, 0, w, h);

  _drawDepthContours(mapCtx, safeP, cx, cy, w, h, ecdisScale);
  _drawGrid(mapCtx, w, h);
  _drawLand(mapCtx, safeP, cx, cy, ecdisScale);
  _drawFairways(mapCtx, safeP, cx, cy, ecdisScale);
  _drawBuoys(mapCtx, safeP, cx, cy, w, h, ecdisScale);
  _drawTrack(mapCtx, P, safeP, cx, cy, ecdisScale);
  _drawRoute(mapCtx, safeP, cx, cy, w, h, ecdisScale);
  _drawAIShips(mapCtx, safeP, cx, cy, ecdisScale, AIships, fishBoats);
  _drawVoyageMarkers(mapCtx, safeP, cx, cy, ecdisScale);
  _drawOwnShip(mapCtx, cx, cy, P);
  _drawLabels(mapCtx, safeP, cx, cy, w, h, ecdisScale);
  _drawHUD(mapCtx, safeP, w, ecdisScale);
  _drawFreeModeOverlay(mapCtx, safeP, cx, cy, w, h, ecdisScale);
}

// ─── 水深コンター ─────────────────────────────────────────────
function _drawDepthContours(ctx, safeP, cx, cy, w, h, ecdisScale) {
  if (!renderGrid) return;

  const worldMinX = safeP.posX - cx * ecdisScale;
  const worldMaxX = safeP.posX + (w - cx) * ecdisScale;
  const worldMaxZ = safeP.posZ + cy * ecdisScale;
  const worldMinZ = safeP.posZ - (h - cy) * ecdisScale;

  const startC = Math.max(0, Math.floor((worldMinX - GRID_START_X) / RENDER_STEP) - 4);
  const endC   = Math.min(gridCols - 1, Math.ceil((worldMaxX - GRID_START_X) / RENDER_STEP) + 4);
  const startR  = Math.max(0, Math.floor((worldMinZ - GRID_START_Z) / RENDER_STEP) - 4);
  const endR    = Math.min(gridRows - 1, Math.ceil((worldMaxZ - GRID_START_Z) / RENDER_STEP) + 4);

  const getV = (r, c) => {
    if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) return 50.0;
    const v = renderGrid[r * gridCols + c];
    return (v === undefined || isNaN(v)) ? 50.0 : v;
  };

  const fillContourBand = (threshold, color) => {
    ctx.fillStyle = color;
    for (let r = startR; r < endR - 1; r++) {
      for (let c = startC; c < endC - 1; c++) {
        const v0 = getV(r,c), v1 = getV(r,c+1), v2 = getV(r+1,c+1), v3 = getV(r+1,c);
        const b0 = v0<=threshold, b1 = v1<=threshold, b2 = v2<=threshold, b3 = v3<=threshold;
        const idx = (b0?1:0)|(b1?2:0)|(b2?4:0)|(b3?8:0);
        if (idx === 0) continue;

        const toSx = (wx, wz) => ({
          x: cx + (GRID_START_X + wx * RENDER_STEP - safeP.posX) / ecdisScale,
          y: cy - (GRID_START_Z + wz * RENDER_STEP - safeP.posZ) / ecdisScale,
        });
        const p0 = toSx(c,r), p1 = toSx(c+1,r), p2 = toSx(c+1,r+1), p3 = toSx(c,r+1);

        if (idx === 15) {
          ctx.beginPath();
          ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y);
          ctx.lineTo(p2.x,p2.y); ctx.lineTo(p3.x,p3.y);
          ctx.closePath(); ctx.fill(); continue;
        }

        const interp = (ptA, ptB, va, vb) => {
          let t = Math.abs(vb-va) > 1e-5 ? (threshold-va)/(vb-va) : 0.5;
          return { x: ptA.x + t*(ptB.x-ptA.x), y: ptA.y + t*(ptB.y-ptA.y) };
        };
        const eT=interp(p0,p1,v0,v1), eR=interp(p1,p2,v1,v2);
        const eB=interp(p3,p2,v3,v2), eL=interp(p0,p3,v0,v3);

        const cases = {
          1:[p0,eT,eL], 2:[p1,eR,eT], 3:[p0,p1,eR,eL], 4:[p2,eB,eR],
          5:[[p0,eT,eL],[p2,eB,eR]], 6:[p1,p2,eB,eT], 7:[p0,p1,p2,eB,eL],
          8:[p3,eL,eB], 9:[p0,eT,eB,p3], 10:[[p1,eR,eT],[p3,eL,eB]],
          11:[p0,p1,eR,eB,p3], 12:[p3,eL,eR,p2], 13:[p0,eT,eR,p2,p3],
          14:[p1,p2,p3,eL,eT],
        };
        const polys = cases[idx];
        if (!polys) continue;
        const draw = poly => {
          ctx.beginPath(); ctx.moveTo(poly[0].x, poly[0].y);
          for (let i=1;i<poly.length;i++) ctx.lineTo(poly[i].x, poly[i].y);
          ctx.closePath(); ctx.fill();
        };
        if (Array.isArray(polys[0])) polys.forEach(draw); else draw(polys);
      }
    }
  };

  fillContourBand(20.0, '#9ecae1');
  fillContourBand(10.0, '#6baed6');
  fillContourBand(5.0,  '#4292c6');
  fillContourBand(0.5,  '#dcb982');

  const drawContour = (threshold, color, lw) => {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
    for (let r = startR; r < endR-1; r++) {
      for (let c = startC; c < endC-1; c++) {
        const v0=getV(r,c), v1=getV(r,c+1), v2=getV(r+1,c+1), v3=getV(r+1,c);
        const b0=v0<=threshold, b1=v1<=threshold, b2=v2<=threshold, b3=v3<=threshold;
        if (b0===b1 && b1===b2 && b2===b3) continue;

        const pt0={x:GRID_START_X+c*RENDER_STEP,     z:GRID_START_Z+r*RENDER_STEP};
        const pt1={x:GRID_START_X+(c+1)*RENDER_STEP, z:GRID_START_Z+r*RENDER_STEP};
        const pt2={x:GRID_START_X+(c+1)*RENDER_STEP, z:GRID_START_Z+(r+1)*RENDER_STEP};
        const pt3={x:GRID_START_X+c*RENDER_STEP,     z:GRID_START_Z+(r+1)*RENDER_STEP};

        const interp = (pA, pB, va, vb) => {
          let t = Math.abs(vb-va) > 1e-5 ? (threshold-va)/(vb-va) : 0.5;
          return { x:pA.x+t*(pB.x-pA.x), z:pA.z+t*(pB.z-pA.z) };
        };
        const points = [];
        if (b0!==b1) points.push(interp(pt0,pt1,v0,v1));
        if (b1!==b2) points.push(interp(pt1,pt2,v1,v2));
        if (b2!==b3) points.push(interp(pt2,pt3,v2,v3));
        if (b3!==b0) points.push(interp(pt3,pt0,v3,v0));
        if (points.length < 2) continue;

        const toS = pt => ({
          x: cx + (pt.x - safeP.posX) / ecdisScale,
          y: cy - (pt.z - safeP.posZ) / ecdisScale,
        });
        ctx.beginPath();
        const s0=toS(points[0]), s1=toS(points[1]);
        ctx.moveTo(s0.x,s0.y); ctx.lineTo(s1.x,s1.y);
        if (points.length === 4) {
          const s2=toS(points[2]), s3=toS(points[3]);
          ctx.moveTo(s2.x,s2.y); ctx.lineTo(s3.x,s3.y);
        }
        ctx.stroke();
      }
    }
  };

  drawContour(5.0,  '#1c5a8a', 1.8);
  drawContour(10.0, '#327ba8', 1.2);
  drawContour(20.0, '#5a9dc4', 1.0);
  drawContour(0.5,  '#222222', 1.0);

  const drawnPositions = [];
  ctx.textAlign = 'center';
  for (let r = startR; r < endR; r++) {
    for (let c = startC; c < endC; c++) {
      const depth = getV(r, c);
      if (depth === 0.0 || depth >= 50.0) continue;
      if ((r * 17 + c * 23) % 7 !== 0) continue;
      const sx = cx + (GRID_START_X + c*RENDER_STEP - safeP.posX) / ecdisScale;
      const sy = cy - (GRID_START_Z + r*RENDER_STEP - safeP.posZ) / ecdisScale;
      if (sx < 0 || sx > w || sy < 0 || sy > h) continue;
      const overlapR = depth >= 20.0 ? 60 : 35;
      if (drawnPositions.some(p => Math.abs(p.x-sx) < overlapR && Math.abs(p.y-sy) < overlapR*0.6)) continue;
      drawnPositions.push({x:sx, y:sy});
      ctx.fillStyle = depth <= 15.0 ? '#000000' : '#5a6b7c';
      ctx.font      = depth <= 15.0 ? 'bold 11px Arial,sans-serif' : '10px Arial,sans-serif';
      ctx.fillText(depth.toFixed(1), sx, sy);
    }
  }
}

// ─── グリッド ─────────────────────────────────────────────────
function _drawGrid(ctx, w, h) {
  ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < w; i += 60) { ctx.moveTo(i,0); ctx.lineTo(i,h); }
  for (let i = 0; i < h; i += 60) { ctx.moveTo(0,i); ctx.lineTo(w,i); }
  ctx.stroke();
}

// ─── 陸地ポリゴン ─────────────────────────────────────────────
function _drawLand(ctx, safeP, cx, cy, ecdisScale) {
  ctx.fillStyle   = '#dcb982';
  ctx.strokeStyle = '#222222';
  ctx.lineWidth   = 1.0;
  parsedPolygonsXZ.forEach(item => {
    ctx.beginPath();
    item.poly.forEach((pt, i) => {
      const sx = cx + (pt.x - safeP.posX) / ecdisScale;
      const sy = cy - (pt.z - safeP.posZ) / ecdisScale;
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    });
    ctx.closePath(); ctx.fill(); ctx.stroke();
  });
}

// ─── 航路 ────────────────────────────────────────────────────
function _drawFairways(ctx, safeP, cx, cy, ecdisScale) {
  ctx.save();
  ctx.strokeStyle = 'rgba(200,0,200,0.7)';
  ctx.lineWidth   = 1.8;
  ctx.setLineDash([8, 8]);
  FAIRWAYS.forEach(fw => {
    ['leftBound', 'rightBound'].forEach(side => {
      ctx.beginPath();
      fw[side].forEach((pt, i) => {
        const xz = latLonToXZ(pt.lat, pt.lon);
        const sx  = cx + (xz.x - safeP.posX) / ecdisScale;
        const sy  = cy - (xz.z - safeP.posZ) / ecdisScale;
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    });
  });
  ctx.restore();
}

// ─── 浮標 ────────────────────────────────────────────────────
function _drawBuoys(ctx, safeP, cx, cy, w, h, ecdisScale) {
  BUOYS.forEach(b => {
    const xz = latLonToXZ(b.lat, b.lon);
    const sx  = cx + (xz.x - safeP.posX) / ecdisScale;
    const sy  = cy - (xz.z - safeP.posZ) / ecdisScale;
    if (sx < -20 || sx > w+20 || sy < -20 || sy > h+20) return;
    ctx.beginPath();
    if (b.color === '#11cc11') {
      ctx.moveTo(sx, sy-6); ctx.lineTo(sx+5, sy+4); ctx.lineTo(sx-5, sy+4);
    } else if (b.color === '#ee1111') {
      ctx.rect(sx-4, sy-4, 8, 8);
    } else {
      ctx.moveTo(sx, sy-6); ctx.lineTo(sx+5, sy); ctx.lineTo(sx, sy+6); ctx.lineTo(sx-5, sy);
    }
    ctx.closePath();
    ctx.fillStyle   = b.color;
    ctx.fill();
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1; ctx.stroke();
  });
}

// ─── 航跡 ────────────────────────────────────────────────────
function _drawTrack(ctx, P, safeP, cx, cy, ecdisScale) {
  if (!P || typeof P.posX !== 'number' || isNaN(P.posX)) return;
  if (freeModeStep === 0) {
    if (trackHistory.length === 0) {
      trackHistory.push({x:P.posX, z:P.posZ});
    } else {
      const last = trackHistory[trackHistory.length-1];
      if ((last.x-P.posX)**2 + (last.z-P.posZ)**2 > 900)
        trackHistory.push({x:P.posX, z:P.posZ});
    }
  }
  if (trackHistory.length === 0 || freeModeStep !== 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(30,30,30,0.8)'; ctx.lineWidth = 2;
  trackHistory.forEach((pt, i) => {
    const sx = cx + (pt.x - safeP.posX) / ecdisScale;
    const sy = cy - (pt.z - safeP.posZ) / ecdisScale;
    if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  });
  ctx.lineTo(cx, cy);
  ctx.stroke();
  ctx.restore();
}

// ─── ルート描画 & UKCリアルタイムチェック機能 ────────────────
function _drawRoute(ctx, safeP, cx, cy, w, h, ecdisScale) {
  if (routeWaypoints.length === 0) return;
  ctx.save();
  ctx.lineWidth   = 2.5;
  ctx.font        = 'bold 13px Arial,sans-serif';

  const DRAFT = safeP.draft || 14.5;
  const MIN_UKC = 5.0;

  // 確定済みのルートライン
  for (let i = 0; i < routeWaypoints.length-1; i++) {
    const p1 = routeWaypoints[i], p2 = routeWaypoints[i+1];
    
    let lowestUKC = 999;
    for (let j = 0; j <= 1; j += 0.05) {
        const px = p1.x + (p2.x - p1.x) * j;
        const pz = p1.z + (p2.z - p1.z) * j;
        const ukc = getRealDepthAt(px, pz) - DRAFT;
        if (ukc < lowestUKC) lowestUKC = ukc;
    }
    
    const isShallow = lowestUKC < MIN_UKC;
    const color = isShallow ? '#d32f2f' : '#ff00ff'; // 危険なら落ち着いた赤、安全ならマゼンタ

    const sx1 = cx + (p1.x - safeP.posX) / ecdisScale;
    const sy1 = cy - (p1.z - safeP.posZ) / ecdisScale;
    const sx2 = cx + (p2.x - safeP.posX) / ecdisScale;
    const sy2 = cy - (p2.z - safeP.posZ) / ecdisScale;

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx2, sy2, 4, 0, Math.PI*2); ctx.fill();

    let hdg = Math.atan2(p2.x - p1.x, p2.z - p1.z) * 180 / Math.PI;
    if (hdg < 0) hdg += 360;
    const hdgStr = '<' + String(Math.round(hdg)%360).padStart(3,'0') + '>';
    const midX = (sx1 + sx2) / 2, midY = (sy1 + sy2) / 2;
    
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(midX + 6, midY - 7, 40, 14);
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(hdgStr, midX + 8, midY);
  }

  // 描画中の仮線（マウス追従）
  if (freeModeStep === 3 && routeWaypoints.length > 0) {
    const lastP = routeWaypoints[routeWaypoints.length-1];
    const sx1 = cx + (lastP.x - safeP.posX) / ecdisScale;
    const sy1 = cy - (lastP.z - safeP.posZ) / ecdisScale;
    const tX = safeP.posX + (hoverX - cx) * ecdisScale;
    const tZ = safeP.posZ - (hoverY - cy) * ecdisScale;

    let lowestUKC = 999;
    for (let j = 0; j <= 1; j += 0.05) {
        const px = lastP.x + (tX - lastP.x) * j;
        const pz = lastP.z + (tZ - lastP.z) * j;
        const ukc = getRealDepthAt(px, pz) - DRAFT;
        if (ukc < lowestUKC) lowestUKC = ukc;
    }
    
    const isShallow = lowestUKC < MIN_UKC;
    const color = isShallow ? '#d32f2f' : '#ff00ff';

    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(sx1, sy1); ctx.lineTo(hoverX, hoverY); ctx.stroke();
    ctx.setLineDash([]);

    let hdg = Math.atan2(tX - lastP.x, tZ - lastP.z) * 180 / Math.PI;
    if (hdg < 0) hdg += 360;
    const hdgStr = '<' + String(Math.round(hdg)%360).padStart(3,'0') + '>';
    const midX = (sx1 + hoverX) / 2, midY = (sy1 + hoverY) / 2;
    
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(midX + 6, midY - 7, 40, 14);
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(hdgStr, midX + 8, midY);

    // ★ 危険な場合はカーソル上に警告テキストを表示
    if (isShallow) {
        ctx.fillStyle = '#d32f2f'; // シックな赤
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        
        // 修正: 指定された文言に変更
        const warnText = `⚠ 座礁アラート`;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(hoverX - 55, hoverY - 30, 110, 20);
        ctx.fillStyle = '#d32f2f';
        ctx.fillText(warnText, hoverX, hoverY - 20);
    }
  }
  ctx.restore();
}

// ─── AI船 ────────────────────────────────────────────────────
function _drawAIShips(ctx, safeP, cx, cy, ecdisScale, AIships, fishBoats) {
  if (!AIships) return;
  const allTargets = AIships.concat(fishBoats || []);
  
  let clickedShip = null;

  allTargets.forEach(s => {
    const pos = s.mesh ? s.mesh.position : s.position;
    if (!pos) return;
    const sx = cx + (pos.x - safeP.posX) / ecdisScale;
    const sy = cy - (pos.z - safeP.posZ) / ecdisScale;

    // クリック判定（半径20ピクセル以内なら選択）
    if (ecdisClickPos) {
      if (Math.hypot(ecdisClickPos.x - sx, ecdisClickPos.y - sy) < 20) {
        clickedShip = s;
      }
    }

    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(s.heading || 0);
    
    // 船体の描画
    ctx.beginPath();
    ctx.moveTo(0,-8); ctx.lineTo(5,5); ctx.lineTo(-5,5); ctx.closePath();
    
    // ★選択中の船は色を変えて目立たせる
    if (s === selectedAIShip) {
        ctx.fillStyle = 'rgba(220, 185, 130, 0.4)';
        ctx.fill();
        ctx.strokeStyle = '#dcb982';
        ctx.lineWidth = 2;
    } else {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
    }
    ctx.stroke();

    // 進行方向ベクトル（線）
    ctx.beginPath(); ctx.moveTo(0,-8); ctx.lineTo(0,-25); ctx.stroke();
    
    // ★選択中の船の周囲に点線のサークルを描画
    if (s === selectedAIShip) {
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#dcb982';
        ctx.stroke();
    }
    ctx.restore();
  });

  // クリック処理を確定（何もない海をクリックしたら選択解除）
  if (ecdisClickPos) {
      setSelectedAIShip(clickedShip);
      clearEcdisClick();
  }

  // 選択中の船があれば情報パネルを描画
  if (selectedAIShip) {
      _drawARPATarget(ctx, safeP, selectedAIShip, ctx.canvas.width, ctx.canvas.height);
  }
}

// ─── ターゲット情報の計算と描画 (ARPA ＋ AIS詳細情報) ─────────
function _drawARPATarget(ctx, safeP, target, w, h) {
  const tPos = target.mesh ? target.mesh.position : target.position;
  if (!tPos) return;

  const v0x = Math.sin(safeP.heading || 0) * ((safeP.speed || 0) * 0.514);
  const v0z = Math.cos(safeP.heading || 0) * ((safeP.speed || 0) * 0.514);

  const tHeading = target.heading || 0;
  const tSpeed = target.speed || 0;
  const v1x = Math.sin(tHeading) * (tSpeed * 0.514);
  const v1z = Math.cos(tHeading) * (tSpeed * 0.514);

  const dvx = v1x - v0x;
  const dvz = v1z - v0z;
  const dv2 = dvx * dvx + dvz * dvz;

  const dx = tPos.x - safeP.posX;
  const dz = tPos.z - safeP.posZ;
  const distMeters = Math.hypot(dx, dz);
  const rngNM = distMeters / 1852; 

  let brgRad = Math.atan2(dx, dz);
  let brgDeg = (brgRad * 180 / Math.PI + 360) % 360;

  let tcpaMin = 0;
  let cpaNM = rngNM;
  let tcpaStr = '---';
  
  if (dv2 > 0.001) {
      const tcpaSec = -(dx * dvx + dz * dvz) / dv2;
      tcpaMin = tcpaSec / 60;
      
      const cpaX = dx + dvx * Math.max(0, tcpaSec);
      const cpaZ = dz + dvz * Math.max(0, tcpaSec);
      cpaNM = Math.hypot(cpaX, cpaZ) / 1852;
      
      if (tcpaSec < 0) {
          tcpaStr = 'PASSED';
      } else {
          tcpaStr = tcpaMin.toFixed(1) + ' min';
      }
  }

  const isDanger = (cpaNM < 0.5 && tcpaMin > 0 && tcpaMin < 15);
  const panelColor = isDanger ? 'rgba(80, 20, 20, 0.85)' : 'rgba(15, 25, 35, 0.85)';
  const accentColor = isDanger ? '#d32f2f' : '#dcb982';

  // ★修正: 追加情報を表示するためパネルを縦に伸ばし、横幅も広げる
  const boxW = 180;
  const boxH = 190;
  const boxX = w - boxW - 20;
  const boxY = h - boxH - 20;

  ctx.save();
  ctx.fillStyle = panelColor;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeRect(boxX, boxY, boxW, boxH);
  ctx.fillStyle = accentColor;
  ctx.fillRect(boxX, boxY, 4, boxH);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  
  ctx.fillText('TARGET INFO', boxX + 12, boxY + 12);
  
  ctx.font = '12px monospace';
  
  // ★追加: AI船に割り当てたプロパティを取得
  const tType = target.shipType || 'UNKNOWN';
  const tStat = target.navStatus || 'UNKNOWN';
  const tDest = target.dest || 'UNKNOWN';

  const lines = [
      `TYPE: ${tType}`,
      `STAT: ${tStat}`,
      `DEST: ${tDest}`,
      `-------------------`,
      `BRG:  ${brgDeg.toFixed(1).padStart(5, ' ')}°`,
      `RNG:  ${rngNM.toFixed(2).padStart(5, ' ')} NM`,
      `HDG:  ${((tHeading * 180 / Math.PI + 360) % 360).toFixed(0).padStart(3, '0')}°`,
      `SPD:  ${tSpeed.toFixed(1).padStart(4, ' ')} kt`,
      `CPA:  ${cpaNM.toFixed(2).padStart(5, ' ')} NM`,
      `TCPA: ${tcpaStr.padStart(8, ' ')}`
  ];

  lines.forEach((text, i) => {
      // 危険判定の色分け
      if (isDanger && i >= 8) ctx.fillStyle = '#ff6b6b';
      else if (i === 3) ctx.fillStyle = 'rgba(255,255,255,0.2)'; // 区切り線
      else if (i >= 8) ctx.fillStyle = '#dcb982';
      else if (i < 3) ctx.fillStyle = '#a6c3d9'; // AIS情報は少し青っぽく
      else ctx.fillStyle = '#cccccc';
      
      ctx.fillText(text, boxX + 12, boxY + 32 + i * 14);
  });
  ctx.restore();
}

// ─── フリーモード拠点マーカー ─────────────────────────────────
function _drawVoyageMarkers(ctx, safeP, cx, cy, ecdisScale) {
  if (freeModeStep !== 0 && freeModeStep !== 3) return;
  if (!currentStartLoc && !currentGoalLoc) return;
  [currentStartLoc, currentGoalLoc].forEach(loc => {
    if (!loc) return;
    const xz = latLonToXZ(loc.lat, loc.lon);
    const sx  = cx + (xz.x - safeP.posX) / ecdisScale;
    const sy  = cy - (xz.z - safeP.posZ) / ecdisScale;
    ctx.save();
    ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI*2);
    ctx.fillStyle   = 'rgba(255,30,30,0.9)'; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle   = '#000000'; ctx.font = 'bold 12px sans-serif';
    ctx.textAlign   = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth   = 3; ctx.strokeText(loc.name, sx, sy-12);
    ctx.fillText(loc.name, sx, sy-12);
    ctx.restore();
  });
}

// ─── 自船 ────────────────────────────────────────────────────
function _drawOwnShip(ctx, cx, cy, P) {
  if (!P || typeof P.posX !== 'number' || isNaN(P.posX)) return;
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(P.heading);
  ctx.beginPath();
  ctx.moveTo(0,-12); ctx.lineTo(6,8); ctx.lineTo(0,4); ctx.lineTo(-6,8); ctx.closePath();
  ctx.lineWidth = 2; ctx.strokeStyle = '#000000'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,-12); ctx.lineTo(0,-60); ctx.stroke();
  ctx.restore();
}

// ─── テキストラベル（浮標名・ランドマーク） ──────────────────
function _drawLabels(ctx, safeP, cx, cy, w, h, ecdisScale) {
  ctx.save();
  const baseFont = 'sans-serif';

  BUOYS.forEach(b => {
    const xz = latLonToXZ(b.lat, b.lon);
    const sx  = cx + (xz.x - safeP.posX) / ecdisScale;
    const sy  = cy - (xz.z - safeP.posZ) / ecdisScale;
    if (sx < -20 || sx > w+20 || sy < -20 || sy > h+20) return;
    ctx.font          = `bold 10px ${baseFont}`;
    ctx.textAlign     = 'left';
    ctx.textBaseline  = 'alphabetic';
    ctx.lineWidth     = 2.5;
    ctx.strokeStyle   = '#ffffff'; ctx.strokeText(b.name, sx+7, sy+4);
    ctx.fillStyle     = '#111111'; ctx.fillText(b.name, sx+7, sy+4);
  });

  LANDMARKS.forEach(lm => {
    const xz = latLonToXZ(lm.lat, lm.lon);
    const sx  = cx + (xz.x - safeP.posX) / ecdisScale;
    const sy  = cy - (xz.z - safeP.posZ) / ecdisScale;
    if (sx < -100 || sx > w+100 || sy < -100 || sy > h+100) return;
    const size   = lm.size   || 11;
    const weight = lm.weight || 'normal';
    ctx.font         = `${weight} ${size}px ${baseFont}`;
    ctx.textAlign    = lm.align || 'center';
    ctx.textBaseline = 'alphabetic';
    if (!lm.color || !lm.color.includes('rgba(0,0,0,')) {
      ctx.lineWidth   = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.strokeText(lm.name, sx + (lm.offset||0), sy+3);
    }
    ctx.fillStyle = lm.color || '#000000';
    ctx.fillText(lm.name, sx + (lm.offset||0), sy+3);
  });
  ctx.restore();
}

// ─── HUD（左上情報パネル） ────────────────────────────────────
function _drawHUD(ctx, safeP, w, ecdisScale) {
  ctx.fillStyle    = '#000000';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.font         = '12px Arial,sans-serif';
  ctx.fillText(`SCALE : 1:${Math.round(ecdisScale * 100)}`, 20, 20);

  const ll = xzToLatLon(safeP.posX, safeP.posZ);
  if (ll) {
    ctx.fillText(`LAT   : ${formatLatLon(ll.lat, true)}`,  20, 40);
    ctx.fillText(`LON   : ${formatLatLon(ll.lon, false)}`, 20, 55);
  }
  let deg = ((safeP.heading||0) * 180 / Math.PI + 360) % 360;
  ctx.fillText(`HDG   : ${deg.toFixed(1)}°`,               20, 75);
  ctx.fillText(`SPD   : ${(safeP.speed||0).toFixed(1)} kt`,20, 90);
  
  const d = getRealDepthAt(safeP.posX, safeP.posZ);
  ctx.fillText(`DEPTH : ${d === 99.9 ? '---' : d.toFixed(1)} m`, 20, 105);
  
  const draft = safeP.draft || 14.5;
  ctx.fillText(`DRAFT : ${draft.toFixed(1)} m`, 20, 120);
}

// ─── フリーモード選択オーバーレイ ─────────────────────────────
function _drawFreeModeOverlay(ctx, safeP, cx, cy, w, h, ecdisScale) {
  if (freeModeStep === 0) return;

  const { VOYAGE_LOCATIONS, selectedStartKey } = getCanvasState();

  // ステップ1＆2（スタート・目的地選択）
  if (freeModeStep === 1 || freeModeStep === 2) {
    ctx.save();
    const uiText = freeModeStep === 1 ? 'スタート位置を選択してください' : '目的地を選択してください';
    
    // 右上のボックス（シックな透過ネイビー＋ゴールドのアクセント）
    const boxW = 240, boxH = 40, boxX = w - boxW - 20, boxY = 20;
    ctx.fillStyle = 'rgba(15, 25, 35, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.fillStyle = '#dcb982';
    ctx.fillRect(boxX, boxY, 4, boxH);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.fillText(uiText, boxX + boxW - 15, boxY + boxH / 2);

    const keys = freeModeStep === 1 ? ['uraga','yokohama','tokyo']
               : (selectedStartKey === 'uraga' ? ['yokohama','tokyo'] : ['uraga']);
    keys.forEach(key => {
      const loc = VOYAGE_LOCATIONS[key];
      const xz  = latLonToXZ(loc.lat, loc.lon);
      const sx   = cx + (xz.x - safeP.posX) / ecdisScale;
      const sy   = cy - (xz.z - safeP.posZ) / ecdisScale;
      const pulse  = (Math.sin(Date.now()/150)+1)/2;
      const radius = 12 + pulse*8;
      
      // 拠点マーカー（海図上で目立たせるため、ここだけは視認性を維持）
      ctx.beginPath(); ctx.arc(sx,sy,radius,0,Math.PI*2);
      ctx.fillStyle='rgba(255,100,0,0.4)'; ctx.fill();
      ctx.beginPath(); ctx.arc(sx,sy,6,0,Math.PI*2);
      ctx.fillStyle='#ff4400'; ctx.fill();
      ctx.strokeStyle='#ffffff'; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle='#111111'; ctx.font='bold 14px sans-serif';
      ctx.textAlign='center'; ctx.lineWidth=3;
      ctx.strokeStyle='#ffffff';
      ctx.strokeText('[ '+loc.name+' ]', sx, sy-25);
      ctx.fillText('[ '+loc.name+' ]', sx, sy-25);
    });
    ctx.restore();
  }

  // ステップ3（コース作成）
  if (freeModeStep === 3) {
    ctx.save();
    
    // 右上のボックス（統一デザイン）
    const boxW = 240, boxH = 40, boxX = w - boxW - 20, boxY = 20;
    ctx.fillStyle = 'rgba(15, 25, 35, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.fillStyle = '#dcb982';
    ctx.fillRect(boxX, boxY, 4, boxH);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.fillText('コースラインを作成してください', boxX + boxW - 15, boxY + boxH / 2);

    // ★修正：「戻る」ボタン（大きく、落ち着いたスレートグレー）
    const undoBox = { x: 30, y: h - 90, w: 130, h: 50 };
    ctx.fillStyle = 'rgba(30, 40, 50, 0.9)';
    ctx.fillRect(undoBox.x, undoBox.y, undoBox.w, undoBox.h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.strokeRect(undoBox.x, undoBox.y, undoBox.w, undoBox.h);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '15px sans-serif';
    ctx.fillText('戻る', undoBox.x + undoBox.w / 2, undoBox.y + undoBox.h / 2);

    // ★修正：「完了」ボタン（大きく、存在感のあるネイビーブルーとゴールド）
    const compBox = { x: 180, y: h - 90, w: 150, h: 50 };
    ctx.fillStyle = 'rgba(25, 65, 105, 0.95)'; 
    ctx.fillRect(compBox.x, compBox.y, compBox.w, compBox.h);
    ctx.strokeStyle = '#dcb982';
    ctx.lineWidth = 2;
    ctx.strokeRect(compBox.x, compBox.y, compBox.w, compBox.h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('完了', compBox.x + compBox.w / 2, compBox.y + compBox.h / 2);

    ctx.restore();
  }
}