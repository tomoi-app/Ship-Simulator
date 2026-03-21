'use strict';
// ============================================================
//  missions.js — ミッション定義 & セーブデータ管理
// ============================================================

export const MISSIONS = [
  {id:1,  type:'dock', rank:'3等航海士',g:'g3',title:'初めての東京湾',     area:'浦賀水道沖→横浜港', diff:1,wx:'day', fog:0,   wind:8, waves:1.0,curr:0.5, sp:{x:0,z:0,h:0},          tx:-2100,tz:3200,tn:'横浜港', ch:'CH.16 横浜港信',story:['浦賀水道沖から横浜港を目指せ。速力8ノット以下で入港区域に進入。']},
  {id:2,  type:'dep',  rank:'3等航海士',g:'g3',title:'横浜港離岸・川崎へ', area:'横浜港→川崎港',     diff:1,wx:'day', fog:0,   wind:10,waves:1.2,curr:0.8, sp:{x:-2100,z:3200,h:.8},  tx:-800, tz:2000,tn:'川崎港', ch:'CH.16 川崎港信',story:['横浜港を離岸し川崎港へ向かえ。タグボートと連携せよ。']},
  {id:3,  type:'wpt',  rank:'3等航海士',g:'g3',title:'交通分離通航帯',     area:'浦賀水道',          diff:2,wx:'day', fog:0,   wind:12,waves:1.5,curr:1.2, sp:{x:200,z:-500,h:0},      tx:100,  tz:4000,tn:'通航帯', ch:'CH.16 東京湾信',story:['浦賀水道の交通分離通航帯を通過せよ。他船との安全距離を保て。']},
  {id:4,  type:'dock', rank:'3等航海士',g:'g3',title:'霧の中の航行',        area:'東京湾中央',        diff:2,wx:'fog', fog:.75, wind:6, waves:0.8,curr:0.6, sp:{x:100,z:0,h:.2},         tx:-2100,tz:3200,tn:'横浜港', ch:'CH.16 横浜港信',story:['視程500m以下の濃霧。レーダーのみを頼りに横浜港へ向かえ。']},
  {id:5,  type:'dock', rank:'2等航海士',g:'g2',title:'川崎港夜間入港',      area:'川崎港',            diff:2,wx:'ngt', fog:0,   wind:8, waves:1.0,curr:0.7, sp:{x:200,z:1000,h:-.3},    tx:-800, tz:2000,tn:'川崎港', ch:'CH.16 川崎港信',story:['夜間航行。灯台の灯火のみを頼りに入港せよ。']},
  {id:6,  type:'wpt',  rank:'2等航海士',g:'g2',title:'台風接近・緊急避難',  area:'東京湾全域',        diff:3,wx:'str', fog:.3,  wind:35,waves:3.0,curr:2.0, sp:{x:0,z:0,h:0},            tx:800,  tz:1500,tn:'緊急錨地',ch:'CH.16 東京湾信',story:['台風が接近中！風速35kt。至急安全な錨地へ退避せよ。']},
  {id:7,  type:'wpt',  rank:'2等航海士',g:'g2',title:'タンカーすれ違い',    area:'中ノ瀬航路',        diff:2,wx:'day', fog:.1,  wind:14,waves:1.5,curr:1.0, sp:{x:100,z:-200,h:0},       tx:-300, tz:4000,tn:'航路通過',ch:'CH.16 東京湾信',story:['前方にVLCCが接近中。安全に行き会い操船せよ。']},
  {id:8,  type:'dock', rank:'2等航海士',g:'g2',title:'機関停止・タグ接岸',  area:'羽田沖',            diff:3,wx:'day', fog:0,   wind:10,waves:1.0,curr:0.8, sp:{x:600,z:2500,h:-1.2},   tx:-2100,tz:3200,tn:'横浜港', ch:'CH.16 横浜港信',story:['機関トラブル発生！タグボートのみで横浜港に接岸せよ。']},
  {id:9,  type:'dock', rank:'2等航海士',g:'g2',title:'東京港コンテナ埠頭',  area:'東京港',            diff:3,wx:'rain',fog:.15, wind:16,waves:1.2,curr:1.1, sp:{x:1200,z:3000,h:-2.0},  tx:1800, tz:4500,tn:'東京港', ch:'CH.16 東京港信',story:['降雨・視界不良。狭水路を慎重に通過して接岸せよ。']},
  {id:10, type:'dock', rank:'1等航海士',g:'g1',title:'嵐の横浜沖',           area:'横浜沖',            diff:3,wx:'str', fog:.2,  wind:28,waves:2.5,curr:1.8, sp:{x:0,z:1000,h:0},         tx:-2100,tz:3200,tn:'横浜港', ch:'CH.16 横浜港信',story:['暴風雨の中、横浜港への入港命令。波高2.5m。慎重に操船せよ。']},
  {id:11, type:'dock', rank:'1等航海士',g:'g1',title:'座礁寸前・浅瀬回避',  area:'富津沖',            diff:3,wx:'ngt', fog:.6,  wind:18,waves:1.8,curr:1.3, sp:{x:800,z:-300,h:.5},     tx:-2100,tz:3200,tn:'横浜港', ch:'CH.16 横浜港信',story:['夜間・濃霧・浅瀬が点在する危険海域。座礁に注意せよ。']},
  {id:12, type:'dock', rank:'1等航海士',g:'g1',title:'漁船群の中を抜ける',  area:'東京湾南部',        diff:3,wx:'day', fog:.3,  wind:12,waves:1.2,curr:0.9, sp:{x:300,z:-400,h:.1},     tx:-2100,tz:3200,tn:'横浜港', ch:'CH.16 横浜港信',story:['早朝の濃霧。多数の漁船が操業中。衝突に注意して進め。']},
  {id:15, type:'dock', rank:'船長',     g:'gc',title:'深夜の東京港全力接岸', area:'東京港',            diff:3,wx:'ngt', fog:.1,  wind:20,waves:1.5,curr:1.4, sp:{x:600,z:2800,h:-1.8},   tx:1800, tz:4500,tn:'東京港', ch:'CH.16 東京港信',story:['深夜・強風・タグ2隻。完璧な接岸を見せろ。']},
  {id:16, type:'dep',  rank:'船長',     g:'gc',title:'津波警報・緊急出港',   area:'横浜港',            diff:3,wx:'day', fog:0,   wind:15,waves:1.0,curr:1.0, sp:{x:-2100,z:3200,h:3.14}, tx:100,  tz:-500, tn:'沖合退避',ch:'CH.16 横浜港信',story:['津波警報発令！今すぐ出港せよ。港内に他船が密集。']},
  {id:18, type:'dock', rank:'船長',     g:'gc',title:'最終試験：完全自律',    area:'浦賀→東京港',      diff:3,wx:'str', fog:.25, wind:22,waves:2.2,curr:1.8, sp:{x:300,z:-600,h:0},       tx:1800, tz:4500,tn:'東京港', ch:'CH.16 東京湾信',story:['全要素が揃った最終試験。嵐の中、東京港への完璧な航行を示せ。']},
];

const SAVE_KEY = 'tbs_v5';
export const SAVE = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');

export function saveResult(id, data) {
  const prev = SAVE[id] || {};
  SAVE[id] = {
    stars: Math.max(prev.stars || 0, data.stars),
    score: Math.max(prev.score || 0, data.score),
    bd:    prev.bd == null ? data.dist : Math.min(prev.bd, data.dist),
    bs:    prev.bs == null ? data.spd  : Math.min(prev.bs, data.spd),
    plays: (prev.plays || 0) + 1,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE));
}

export function getStats() {
  const vals = Object.values(SAVE);
  const scores = vals.filter(s => s.score > 0).map(s => s.score);
  return {
    cleared:   vals.filter(s => s.stars > 0).length,
    totalStar: vals.reduce((a, s) => a + (s.stars || 0), 0),
    bestScore: scores.length ? Math.max(...scores) : null,
    avgScore:  scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : null,
  };
}
