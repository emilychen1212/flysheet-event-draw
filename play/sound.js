/**
 * 音效：全部用 Web Audio API 即時合成，不使用任何音檔。
 * 瀏覽器規定要在使用者點擊後才能發聲，所以第一次點擊時才建立 AudioContext。
 */
let ctx = null;
let master = null;
let muted = false;

function ac() {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(v) { muted = !!v; if (muted && ctx) ctx.suspend(); else if (ctx) ctx.resume(); }
export function isMuted() { return muted; }
/** 在第一次點擊時呼叫，解鎖 iOS 音效 */
export function unlock() { ac(); }

function tone(freq, { type = 'sine', dur = 0.15, vol = 0.3, at = 0, slide = 0, attack = 0.005 } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.1, vol = 0.2, at = 0, freq = 2000, q = 1, type = 'bandpass' } = {}) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  click() { tone(660, { type: 'triangle', dur: 0.06, vol: 0.15 }); },
  /** 轉盤指針敲到格線 */
  tick() { tone(1400, { type: 'square', dur: 0.025, vol: 0.06 }); noise({ dur: 0.02, vol: 0.08, freq: 3000 }); },
  spinStart() { noise({ dur: 0.35, vol: 0.15, freq: 800, q: 0.7, type: 'lowpass' }); tone(220, { type: 'sawtooth', dur: 0.3, vol: 0.06, slide: 2 }); },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, { type: 'triangle', dur: 0.25, vol: 0.22, at: i * 0.09 }));
    tone(1568, { type: 'sine', dur: 0.6, vol: 0.12, at: 0.36 });
  },
  bigWin() {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, { type: 'square', dur: 0.18, vol: 0.1, at: i * 0.1 }));
    [1047, 1319, 1568].forEach((f) => tone(f, { type: 'triangle', dur: 1.1, vol: 0.12, at: 0.7 }));
    for (let i = 0; i < 6; i++) noise({ dur: 0.08, vol: 0.12, at: 0.7 + i * 0.07, freq: 5000 + i * 400 });
  },
  lose() {
    tone(392, { type: 'triangle', dur: 0.22, vol: 0.18 });
    tone(330, { type: 'triangle', dur: 0.22, vol: 0.18, at: 0.18 });
    tone(262, { type: 'triangle', dur: 0.45, vol: 0.18, at: 0.36, slide: 0.9 });
  }
};
