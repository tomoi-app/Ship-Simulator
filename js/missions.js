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
    sp: { x: 1000, z: 18000, h: 0 },
    tx: 1000, tz: -8000,
    waves: 0.4, wind: 5, curr: 0.2, wx: 'clr', fog: 0
  }
  // ※ STORYモードのミッションは後日ここに追加していきます
];

// データの保存・読み込みロジック（変更なし）
export const SAVE = JSON.parse(localStorage.getItem('wacchi_ship_save') || '{}');
export function saveResult(id, data) {
  if (!SAVE[id]) SAVE[id] = { plays: 0, best: 0 };
  SAVE[id].plays++;
  SAVE[id].stars = Math.max(SAVE[id].stars || 0, data.stars);
  if (data.score > SAVE[id].best) SAVE[id].best = data.score;
  localStorage.setItem('wacchi_ship_save', JSON.stringify(SAVE));
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