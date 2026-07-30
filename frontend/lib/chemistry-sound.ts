/**
 * Chemistry World — звуковой дизайн через Web Audio API. Никаких внешних
 * аудиофайлов: каждый звук — синтезированный осциллятор/шумовой буфер,
 * созданный прямо в браузере. Модуль ничего не решает сам — он только
 * озвучивает уже случившиеся события (захват предмета, переливание,
 * включение горелки, новая реакция из state.reactionLog, предупреждение
 * из Safety System), реальные данные по-прежнему приходят от Chemistry/
 * Reaction Engine и Safety System, звук их не подменяет и не предсказывает.
 */

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

// браузеры блокируют звук до первого жеста пользователя — вызывается один
// раз на первый pointerdown в сцене (см. useDragHandlers)
export function resumeAudioOnGesture(): void {
  const audio = getContext();
  if (audio && audio.state === "suspended") {
    audio.resume().catch(() => {});
  }
}

// Stage 5.5 v2 — глобальное отключение звука (доступность/UX). Гейтится
// внутри общих примитивов tone()/noiseBurst(), поэтому распространяется
// сразу на ВСЕ звуки модуля, старые и новые, без правки каждой функции
let masterMuted = false;

export function setSoundMuted(muted: boolean): void {
  masterMuted = muted;
}

export function isSoundMuted(): boolean {
  return masterMuted;
}

function envelope(gain: GainNode, audio: AudioContext, peak: number, attack: number, release: number) {
  const now = audio.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peak, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
}

function tone(freq: number, duration: number, type: OscillatorType = "sine", peak = 0.15): void {
  const audio = getContext();
  if (!audio || masterMuted) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(audio.destination);
  envelope(gain, audio, peak, 0.01, duration);
  osc.start();
  osc.stop(audio.currentTime + duration + 0.05);
}

function noiseBurst(duration: number, filterFreq: number, peak = 0.2): void {
  const audio = getContext();
  if (!audio || masterMuted) return;
  const bufferSize = Math.max(1, Math.floor(audio.sampleRate * duration));
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  const gain = audio.createGain();

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  envelope(gain, audio, peak, 0.01, duration);
  noise.start();
  noise.stop(audio.currentTime + duration + 0.05);
}

// стекло — короткий высокий "звон" при захвате/отпускании сосуда или бутылки
export function playGlassClink(): void {
  tone(1800, 0.08, "sine", 0.1);
  tone(2600, 0.05, "sine", 0.05);
}

// переливание — отфильтрованный шум, длительность совпадает с визуальной
// анимацией наклона (POUR_ANIMATION_MS в ChemistryWorldScene)
export function playPour(): void {
  noiseBurst(0.6, 900, 0.09);
}

export function playBurnerIgnite(): void {
  noiseBurst(0.25, 2500, 0.13);
  tone(220, 0.3, "sawtooth", 0.05);
}

// успешная реакция — короткая восходящая трель (обычные три ноты)
export function playReactionSuccess(): void {
  tone(660, 0.12, "sine", 0.11);
  setTimeout(() => tone(880, 0.15, "sine", 0.11), 90);
  setTimeout(() => tone(1320, 0.2, "sine", 0.09), 180);
}

// предупреждение Safety System — низкое двухтоновое жужжание
export function playSafetyWarning(): void {
  tone(220, 0.15, "square", 0.07);
  setTimeout(() => tone(196, 0.15, "square", 0.07), 160);
}

// кипение — не одноразовый эффект, а управляемый цикл нерегулярных
// "бульков"; вызывающий код обязан остановить его сам, как только
// aggregateStateOf контейнера перестал быть "gas" (реальное условие,
// не таймер)
export function startBoilingLoop(): () => void {
  const audio = getContext();
  if (!audio) return () => {};
  let stopped = false;

  function tick() {
    if (stopped) return;
    noiseBurst(0.12, 500 + Math.random() * 400, 0.045);
    setTimeout(tick, 220 + Math.random() * 180);
  }
  tick();

  return () => {
    stopped = true;
  };
}

/**
 * Stage 5.5 v2 — Hazard Simulation sound events. Все переиспользуют тот же
 * singleton AudioContext и общие примитивы tone()/noiseBurst() выше —
 * новый AudioContext не создается. Одноразовые события (hiss/stress/snap/
 * bang/whoosh/thud) вызываются вызывающим кодом РОВНО при реальном
 * переходе состояния (см. ChemistryWorldScene), не на каждый рендер.
 * Длящиеся эффекты (pressure hum, fire crackle, alarm) следуют тому же
 * паттерну "stopped-флаг + setTimeout", что и startBoilingLoop — вызывающий
 * код обязан вызвать возвращенную stop()-функцию, когда реальное условие
 * (например, isSealed && pressureRatio>threshold) перестает выполняться.
 */

// выход газа из открытого сосуда — шипение
export function playGasHiss(): void {
  noiseBurst(0.35, 4000, 0.06);
}

// нарастающее давление в закрытом сосуде — тихий низкий гул, громкость
// зависит от intensity (0..1), которую передает вызывающий код из
// HazardResult.pressureRatio — само значение не выдумывается здесь
export function startPressureHum(getIntensity: () => number): () => void {
  const audio = getContext();
  if (!audio) return () => {};
  let stopped = false;

  function tick() {
    if (stopped) return;
    const intensity = Math.max(0, Math.min(1, getIntensity()));
    if (intensity > 0.01) {
      tone(65 + intensity * 15, 0.5, "sine", 0.03 + intensity * 0.05);
    }
    setTimeout(tick, 450);
  }
  tick();

  return () => {
    stopped = true;
  };
}

// напряжение стекла — короткий скрип (свип частоты через прямой доступ к осциллятору)
export function playGlassStress(): void {
  const audio = getContext();
  if (!audio || masterMuted) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(1200, audio.currentTime);
  osc.frequency.linearRampToValueAtTime(900, audio.currentTime + 0.3);
  osc.connect(gain);
  gain.connect(audio.destination);
  envelope(gain, audio, 0.04, 0.02, 0.3);
  osc.start();
  osc.stop(audio.currentTime + 0.35);
}

// микротрещина — короткий резкий щелчок
export function playCrackSnap(): void {
  noiseBurst(0.06, 3200, 0.18);
}

// разрушение сосуда — громкий низкочастотный удар + шум осколков
export function playRuptureBang(): void {
  noiseBurst(0.4, 300, 0.28);
  tone(60, 0.35, "square", 0.15);
}

// вспышка — быстрый шумовой всплеск с высокочастотным фильтром
export function playFlashWhoosh(): void {
  noiseBurst(0.2, 5000, 0.2);
}

// пожар — неровное потрескивание, управляемый цикл (аналогично startBoilingLoop)
export function startFireCrackle(): () => void {
  const audio = getContext();
  if (!audio) return () => {};
  let stopped = false;

  function tick() {
    if (stopped) return;
    noiseBurst(0.08, 700 + Math.random() * 900, 0.05);
    setTimeout(tick, 90 + Math.random() * 120);
  }
  tick();

  return () => {
    stopped = true;
  };
}

// короткий ударный "толчок" (для тряски камеры/шоковой волны)
export function playShockThud(): void {
  noiseBurst(0.15, 150, 0.22);
}

// аварийная сирена — управляемый цикл двух чередующихся тонов,
// запускается при входе в Emergency Stop и останавливается при reset()
export function startEmergencyAlarm(): () => void {
  const audio = getContext();
  if (!audio) return () => {};
  let stopped = false;
  let high = true;

  function tick() {
    if (stopped) return;
    tone(high ? 880 : 660, 0.25, "square", 0.06);
    high = !high;
    setTimeout(tick, 300);
  }
  tick();

  return () => {
    stopped = true;
  };
}
