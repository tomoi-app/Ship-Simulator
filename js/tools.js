'use strict';
// ============================================================
//  tools.js — エントリーポイント（薄いラッパー）
//  main.js はこのファイルだけを import すれば OK。
//  内部実装は ecdis-data / ecdis-draw / ecdis-ui に分離済み。
// ============================================================

// ── データ層 ─────────────────────────────────────────────────
export {
  latLonToXZ,
  xzToLatLon,
  formatLatLon,
  getRealDepthAt,
  isDepthLoading,
  parsedPolygonsXZ,
  FAIRWAYS,
  BUOYS,
  LANDMARKS,
  VOYAGE_LOCATIONS,
  loadGeoData,
} from './ecdis-data.js';

// ── 描画層 ─────────────────────────────────────────────────
export { drawAll } from './ecdis-draw.js';

// ── UI層 ──────────────────────────────────────────────────
export {
  isGlobalLoading,
  globalLoadingText,
  freeModeStep,
  selectedStartKey,
  currentStartLoc,
  currentGoalLoc,
  trackHistory,
  routeWaypoints,
  showLoadingScreen,
  hideLoadingScreen,
  toggleTool,
  isToolOpen,
  startFreeModeSelection,
  initEcdisUI,
} from './ecdis-ui.js';

// ── 起動シーケンス ────────────────────────────────────────
//  旧 tools.js はモジュールロード時に副作用で自動起動していた。
//  新構成では main.js から明示的に initTools() を呼ぶ。
import * as dataModule from './ecdis-data.js';
import { initEcdisUI }  from './ecdis-ui.js';

/**
 * initTools()
 *   main.js の DOMContentLoaded / window.onload 等から呼ぶ。
 *   旧 tools.js が行っていた自動初期化をここで再現する。
 *
 * @param {function} onDepthReady - 水深データ生成完了後に呼ばれるコールバック
 */
export function initTools(onDepthReady) {
  // 1. ECDISキャンバスを生成してローディング画面を表示
  initEcdisUI(dataModule);

  // 2. GeoJSON 読み込み → 水深生成（完了時に onDepthReady を呼ぶ）
  dataModule.loadGeoData(() => {
    if (onDepthReady) onDepthReady();
  });
}
