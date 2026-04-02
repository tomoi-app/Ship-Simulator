'use strict';
// ============================================================
//  missions.js — ミッションデータ定義
// ============================================================

export const MISSIONS = [
  // --- FREE モード ---
  {
    id: 'FREE-1',
    mode: 'free',     // ★新設: 'story' か 'free' かを判別
    type: 'wpt',
    title: '東京湾 自由航行',
    area: '東京湾全域',
    story: ['自由に東京湾を航行できるモードです。時間制限やペナルティはありません。海と船の挙動をお楽しみください。'],
    diff: 1,
    // x: 13000 (東へ約13km), z: 18000 (北へ約18km)
    sp: { x: 13000, z: 18000, h: 0 },
    tx: 1000, tz: -8000,
    waves: 0.4, wind: 5, curr: 0.2, wx: 'clr', fog: 0
  }
  // ※ STORYモードのミッションは後日ここに追加していきます
];

// データの保存・読み込みロジック
let _rawSave = '{}';
try { _rawSave = localStorage.getItem('wacchi_ship_save') || '{}'; } catch(e) {}
export const SAVE = JSON.parse(_rawSave);
export function saveResult(id, data) {
  try {
    if (!SAVE[id]) SAVE[id] = { plays: 0, best: 0, stars: 0 };
    SAVE[id].plays++;
    // stars と score を両方確実に保存
    SAVE[id].stars = Math.max(SAVE[id].stars || 0, data.stars  || 0);
    SAVE[id].best  = Math.max(SAVE[id].best  || 0, data.score  || 0);
    localStorage.setItem('wacchi_ship_save', JSON.stringify(SAVE));
  } catch (e) {
    // プライベートブラウジング等で localStorage が使えない場合も続行
    console.warn('セーブデータの書き込みに失敗しました:', e);
  }
}
export function getStats() {
  let cleared = 0, totalStar = 0, sumScore = 0, plays = 0;
  for (const k in SAVE) {
    if (SAVE[k].stars > 0) cleared++;
    totalStar += (SAVE[k].stars || 0);
    if (SAVE[k].best > 0) { sumScore += SAVE[k].best; plays++; }
  }
  return {
    cleared, totalStar,
    bestScore: plays > 0 ? Math.max(...Object.values(SAVE).map(s => s.best||0)) : '--',
    avgScore:  plays > 0 ? Math.round(sumScore / plays) : '--'
  };
}