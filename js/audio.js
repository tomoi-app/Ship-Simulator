'use strict';
// ============================================================
//  audio.js — Web Audio API サウンドシステム
// ============================================================

let ctx = null;
const nodes = {};

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  _startWave();
  _startEngine();
}

// ノイズバッファ
function _noise(dur = 2) {
  const sr  = ctx.sampleRate;
  const buf = ctx.createBuffer(1, sr * dur, sr);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// 波音（常時ループ）
function _startWave() {
  if (nodes.wave) return;
  const src = ctx.createBufferSource();
  src.buffer = _noise(2); src.loop = true;
  const lp  = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 280; lp.Q.value = 0.8;
  const g   = ctx.createGain(); g.gain.value = 0.045;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.28;
  const lg  = ctx.createGain(); lg.gain.value = 0.018;
  lfo.connect(lg); lg.connect(g.gain); lfo.start();
  src.connect(lp); lp.connect(g); g.connect(ctx.destination); src.start();
  nodes.wave = { src, gain: g };
}

// エンジン音（常時ループ）
function _startEngine() {
  if (nodes.eng) return;
  const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 38;
  const lp  = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110;
  const g   = ctx.createGain(); g.gain.value = 0;
  osc.connect(lp); lp.connect(g); g.connect(ctx.destination); osc.start();
  nodes.eng = { osc, gain: g };
}

// エンジン音を物理状態に合わせて更新（毎フレーム呼ぶ）
export function updateEngineSound(engineOrder) {
  if (!nodes.eng) return;
  const ap = Math.abs(engineOrder) / 4;
  nodes.eng.gain.gain.setTargetAtTime(ap * 0.09, ctx.currentTime, 0.35);
  nodes.eng.osc.frequency.setTargetAtTime(32 + ap * 48, ctx.currentTime, 0.55);
}

// 汽笛
export function playHorn() {
  if (!ctx) return;
  [[0, 108, 0.28], [0, 162, 0.10], [0, 216, 0.05]].forEach(([off, freq, vol]) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime + off);
    g.gain.linearRampToValueAtTime(vol,  ctx.currentTime + off + 0.10);
    g.gain.setValueAtTime(vol,           ctx.currentTime + 1.30);
    g.gain.linearRampToValueAtTime(0,    ctx.currentTime + 1.60);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + off); o.stop(ctx.currentTime + 1.7);
  });
}

// 衝突音
export function playCrash() {
  if (!ctx) return;
  const src = ctx.createBufferSource(); src.buffer = _noise(0.6);
  const lp  = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
  const g   = ctx.createGain();
  g.gain.setValueAtTime(0.65, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  src.connect(lp); lp.connect(g); g.connect(ctx.destination);
  src.start(); src.stop(ctx.currentTime + 0.65);
}

// VHFビープ
export function playVHF() {
  if (!ctx) return;
  [0, 0.13].forEach(off => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.07, ctx.currentTime + off);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + off + 0.10);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + off); o.stop(ctx.currentTime + off + 0.12);
  });
}

// ミッションクリア音
export function playClear() {
  if (!ctx) return;
  [[0, 523], [0.16, 659], [0.32, 784], [0.52, 1047], [0.72, 1319]].forEach(([t, freq]) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.13, ctx.currentTime + t);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + t + 0.38);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.42);
  });
}

export function isReady() { return !!ctx; }
