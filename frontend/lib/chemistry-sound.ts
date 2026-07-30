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

function envelope(gain: GainNode, audio: AudioContext, peak: number, attack: number, release: number) {
  const now = audio.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peak, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
}

function tone(freq: number, duration: number, type: OscillatorType = "sine", peak = 0.15): void {
  const audio = getContext();
  if (!audio) return;
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
  if (!audio) return;
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
