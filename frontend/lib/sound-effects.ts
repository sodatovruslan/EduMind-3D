/**
 * Лёгкие процедурные звуки для Electricity Lab — синтезируются через Web
 * Audio API (никаких внешних файлов, соответствует офлайн-надежности
 * проекта). Громкость намеренно низкая ("не громкие игровые звуки").
 */
let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  if (sharedContext.state === "suspended") sharedContext.resume().catch(() => {});
  return sharedContext;
}

function tone(freq: number, duration: number, peakGain: number, type: OscillatorType = "sine", delay = 0) {
  const ctx = getContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const start = ctx.currentTime + delay;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noiseBurst(duration: number, peakGain: number, delay = 0) {
  const ctx = getContext();
  if (!ctx) return;
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  const start = ctx.currentTime + delay;
  gain.gain.setValueAtTime(peakGain, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1500;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(start);
}

export function playSwitchClick() {
  tone(1800, 0.03, 0.05, "square");
}

export function playConnect() {
  tone(660, 0.08, 0.04, "sine");
  tone(880, 0.09, 0.03, "sine", 0.04);
}

export function playDisconnect() {
  tone(520, 0.09, 0.035, "sine");
  tone(360, 0.1, 0.03, "sine", 0.03);
}

export function playPowerOn() {
  tone(220, 0.25, 0.03, "sine");
  tone(330, 0.2, 0.02, "sine", 0.05);
}

export function playSpark() {
  noiseBurst(0.12, 0.06);
  noiseBurst(0.06, 0.05, 0.05);
}

export function playFuseBlow() {
  noiseBurst(0.18, 0.07);
  tone(140, 0.3, 0.04, "sawtooth", 0.02);
}
