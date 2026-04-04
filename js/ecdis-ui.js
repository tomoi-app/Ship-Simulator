'use strict';
// ============================================================
//  ecdis-ui.js — UI層
//  担当: Canvas生成/ライフサイクル / マウス・ホイールイベント /
//        フリーモード選択フロー / ローディング画面
// ============================================================

import { latLonToXZ, VOYAGE_LOCATIONS } from './ecdis-data.js';
import { drawAll } from './ecdis-draw.js';

// ─── Canvas状態（このモジュールが正とする） ──────────────────
let mapCv   = null;
let mapCtx  = null;
let toolOpen = false;

let ecdisScale = 25;
let panX = 0, panY = 0;
let isDragging  = false;
let lastMouseX  = 0, lastMouseY = 0;
export let hoverX = 0, hoverY = 0;

// ─── グローバルローディング ───────────────────────────────────
export let isGlobalLoading  = false;
export let globalLoadingText = '';

// ─── フリーモード選択状態 ─────────────────────────────────────
export let freeModeStep      = 0;
export let selectedStartKey  = null;
export let currentStartLoc   = null;
export let currentGoalLoc    = null;
export let trackHistory      = [];
export let routeWaypoints    = [];

let shipRef = null;
let ecdisAnimFrame = null;
let onStartVoyageCallback = null;

// ─── 外部（ecdis-draw.js）への状態公開 ───────────────────────
export function getCanvasState() {
  return { mapCv, mapCtx, toolOpen, ecdisScale, panX, panY, selectedStartKey, VOYAGE_LOCATIONS };
}

// ─── Canvas 初期化 ────────────────────────────────────────────
export function initMap() {
  if (mapCv) return;
  mapCv = document.createElement('canvas');
  mapCv.id = 'ecdis-monitor';
  Object.assign(mapCv.style, {
    position: 'absolute', bottom: '0%', left: '10%',
    width: '80%', height: '78%',
    backgroundColor: 'transparent',
    border: '4px solid #4a5b6c', borderRadius: '2px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    zIndex: '500', display: 'none', pointerEvents: 'auto',
  });
  document.body.appendChild(mapCv);
  mapCtx = mapCv.getContext('2d');
  _attachEvents();
}

// ─── アニメーションループ ─────────────────────────────────────
function startEcdisAnim() {
  cancelAnimationFrame(ecdisAnimFrame);
  function loop() {
    const { isDepthLoading } = _getDepthState();
    if (!toolOpen && !isGlobalLoading && !isDepthLoading) return;
    if (freeModeStep > 0 || isDepthLoading || isGlobalLoading) {
      drawAll(shipRef);
      ecdisAnimFrame = requestAnimationFrame(loop);
    }
  }
  loop();
}

// ─── ローディング画面 ─────────────────────────────────────────
export function showLoadingScreen(text = '読み込み中') {
  isGlobalLoading  = true;
  globalLoadingText = text;
  if (!mapCv) initMap();
  _fullscreen();
  mapCv.style.display = 'block';
  _resizeCanvas();
  startEcdisAnim();
}

export function hideLoadingScreen() {
  isGlobalLoading = false;
  const { isDepthLoading } = _getDepthState();
  if (!toolOpen && !isDepthLoading) {
    mapCv.style.display = 'none';
    cancelAnimationFrame(ecdisAnimFrame);
  }
}

// ─── ECDIS 表示トグル ─────────────────────────────────────────
export function toggleTool() {
  initMap();
  toolOpen = !toolOpen;
  if (toolOpen) {
    Object.assign(mapCv.style, {
      bottom: '0%', left: '10%', width: '80%', height: '78%', borderRadius: '2px',
      backgroundColor: 'transparent',
      border: '4px solid #4a5b6c', boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    });
    mapCv.style.display = 'block';
    mapCv.width  = mapCv.clientWidth;
    mapCv.height = mapCv.clientHeight;
    startEcdisAnim();
  } else {
    mapCv.style.display = 'none';
    freeModeStep = 0;
    cancelAnimationFrame(ecdisAnimFrame);
  }
}

/**
 * isToolOpen()
 *   ECDISパネルが開いているかどうかを返す
 */
export function isToolOpen() {
  return toolOpen;
}

// ─── フリーモード選択開始 ─────────────────────────────────────
export function startFreeModeSelection(p, callback) {
  shipRef = p || {};
  onStartVoyageCallback = callback;
  toolOpen = true;
  freeModeStep     = 1;
  selectedStartKey = null;
  routeWaypoints   = [];
  if (!mapCv) initMap();
  _fullscreen();
  mapCv.style.display = 'block';
  _resizeCanvas();
  panX = 0; panY = 0; ecdisScale = 60;
  startEcdisAnim();
}

// ─── マウスイベント ───────────────────────────────────────────
function _attachEvents() {
  let downX = 0, downY = 0;

  mapCv.addEventListener('mousedown', e => {
    if (_isLoading()) return;
    e.stopPropagation();
    isDragging = true;
    downX = e.clientX; downY = e.clientY;
    lastMouseX = e.clientX; lastMouseY = e.clientY;
  });

  mapCv.addEventListener('mousemove', e => {
    if (_isLoading()) return;
    e.stopPropagation();
    const rect = mapCv.getBoundingClientRect();
    hoverX = e.clientX - rect.left;
    hoverY = e.clientY - rect.top;
    if (!isDragging) return;
    panX += e.clientX - lastMouseX;
    panY += e.clientY - lastMouseY;
    const limit = 6000;
    panX = Math.max(-limit, Math.min(limit, panX));
    panY = Math.max(-limit, Math.min(limit, panY));
    lastMouseX = e.clientX; lastMouseY = e.clientY;
  });

  mapCv.addEventListener('mouseup', e => {
    if (_isLoading()) return;
    e.stopPropagation();
    isDragging = false;
    if (Math.abs(e.clientX-downX) < 5 && Math.abs(e.clientY-downY) < 5)
      _handleMapClick(e);
  });

  mapCv.addEventListener('mouseleave', e => { e.stopPropagation(); isDragging = false; });

  mapCv.addEventListener('wheel', e => {
    if (_isLoading()) return;
    e.stopPropagation(); e.preventDefault();
    const rect = mapCv.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const w = mapCv.width, h = mapCv.height;
    const wx = (mx - (w/2 + panX)) * ecdisScale;
    const wy = (my - (h/2 + panY)) * ecdisScale;
    ecdisScale = e.deltaY < 0
      ? Math.max(3,   ecdisScale * 0.80)
      : Math.min(150, ecdisScale * 1.25);
    panX = mx - w/2 - wx/ecdisScale;
    panY = my - h/2 - wy/ecdisScale;
  });

  mapCv.addEventListener('dblclick', e => {
    if (_isLoading()) return;
    e.stopPropagation();
    panX = 0; panY = 0; ecdisScale = 25;
  });
}

// ─── クリック処理（フリーモード） ────────────────────────────
function _handleMapClick(e) {
  if (freeModeStep === 0 || _isLoading()) return;
  const rect   = mapCv.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const w = mapCv.width, h = mapCv.height;
  const cx = w/2 + panX, cy = h/2 + panY;

  const safeP = (shipRef && typeof shipRef.posX === 'number' && !isNaN(shipRef.posX))
    ? shipRef
    : { posX: latLonToXZ(35.30, 139.75).x, posZ: latLonToXZ(35.30, 139.75).z };

  // Step 3: ウェイポイント追加・ボタン処理
  if (freeModeStep === 3) {
    const undoBox={x:20, y:h-70, w:100, h:40};
    const compBox={x:130, y:h-70, w:100, h:40};
    if (_inBox(mouseX, mouseY, undoBox)) {
      if (routeWaypoints.length > 1) routeWaypoints.pop();
      return;
    }
    if (_inBox(mouseX, mouseY, compBox)) {
      if (routeWaypoints.length > 1 && shipRef) {
        const p1=routeWaypoints[0], p2=routeWaypoints[1];
        shipRef.heading = Math.atan2(p2.x-p1.x, p2.z-p1.z);
      }
      freeModeStep = 0; selectedStartKey = null;
      toggleTool();
      if (onStartVoyageCallback)
        onStartVoyageCallback(currentStartLoc, currentGoalLoc, routeWaypoints);
      return;
    }
    const tx = safeP.posX + (mouseX-cx) * ecdisScale;
    const tz = safeP.posZ - (mouseY-cy) * ecdisScale;
    routeWaypoints.push({x:tx, z:tz});
    return;
  }

  // Step 1/2: 拠点選択
  const keys = freeModeStep === 1 ? ['uraga','yokohama','tokyo']
             : (selectedStartKey === 'uraga' ? ['yokohama','tokyo'] : ['uraga']);

  for (const key of keys) {
    const loc = VOYAGE_LOCATIONS[key];
    const xz  = latLonToXZ(loc.lat, loc.lon);
    const sx   = cx + (xz.x - safeP.posX) / ecdisScale;
    const sy   = cy - (xz.z - safeP.posZ) / ecdisScale;
    if (Math.sqrt((mouseX-sx)**2 + (mouseY-sy)**2) < 30) {
      if (freeModeStep === 1) {
        selectedStartKey = key;
        freeModeStep = 2;
      } else if (freeModeStep === 2) {
        const startLoc = VOYAGE_LOCATIONS[selectedStartKey];
        const startXZ  = latLonToXZ(startLoc.lat, startLoc.lon);
        if (shipRef) {
          shipRef.posX    = startXZ.x;
          shipRef.posZ    = startXZ.z;
          shipRef.heading = startLoc.heading * Math.PI / 180;
          shipRef.speed   = 0;
        }
        currentStartLoc  = startLoc;
        currentGoalLoc   = VOYAGE_LOCATIONS[key];
        trackHistory     = [];
        routeWaypoints   = [{ x: startXZ.x, z: startXZ.z }];
        freeModeStep = 3;
      }
      return;
    }
  }
}

// ─── ヘルパー ─────────────────────────────────────────────────
function _inBox(mx, my, b) {
  return mx >= b.x && mx <= b.x+b.w && my >= b.y && my <= b.y+b.h;
}
function _isLoading() {
  const { isDepthLoading } = _getDepthState();
  return isDepthLoading || isGlobalLoading;
}
function _fullscreen() {
  Object.assign(mapCv.style, {
    bottom:'0%', left:'0%', width:'100%', height:'100%', borderRadius:'0px',
    backgroundColor:'transparent', border:'none', boxShadow:'none',
  });
}
function _resizeCanvas() {
  setTimeout(() => {
    if (!mapCv) return;
    mapCv.width  = mapCv.clientWidth  || window.innerWidth;
    mapCv.height = mapCv.clientHeight || window.innerHeight;
  }, 10);
}
// isDepthLoading は ecdis-data.js が保持しているが循環参照を避けるため動的 import
let _cachedDepthImport = null;
function _getDepthState() {
  // ※ ecdis-data.js の isDepthLoading を直接参照（同一モジュールグラフ内で共有）
  //    実際のバンドルでは import { isDepthLoading } from './ecdis-data.js' で取得
  return { isDepthLoading: _cachedDepthImport ? _cachedDepthImport.isDepthLoading : true };
}
export function injectDepthRef(ref) { _cachedDepthImport = ref; }

// ─── 初期化（ページロード時自動実行） ────────────────────────
export function initEcdisUI(depthRef) {
  injectDepthRef(depthRef);
  initMap();
  _fullscreen();
  mapCv.style.display = 'block';
  setTimeout(() => {
    if (mapCv) { mapCv.width = window.innerWidth; mapCv.height = window.innerHeight; }
  }, 10);
  startEcdisAnim();
}
