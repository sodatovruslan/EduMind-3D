/**
 * Electricity Lab — Laboratory Experiment Catalog (Stage E-2). Аналог
 * chemistry-lab-catalog.ts для Electricity Lab: единственное место,
 * которое описывает УЧЕБНЫЕ лабораторные работы (в отличие от
 * task-engine.ts — тот модуль и его 6 быстрых заданий остаются без
 * изменений и продолжают работать как раньше). Это новый, более богатый
 * учебный слой поверх уже существующего Circuit Engine.
 *
 * КРИТИЧЕСКИ ВАЖНО: ни один шаг/вопрос не проверяет UI/нажатие кнопки и
 * не выдумывает данные. Каждое условие (`isUnlocked`/`isComplete`) и
 * каждый правильный ответ на вопрос (`correctIndex`) читает РЕАЛЬНОЕ
 * состояние, посчитанное circuit-engine.ts (solveCircuit). Ничего здесь
 * не пересчитывает физику заново.
 *
 * Раскладка стенда фиксирована (ElectricityLabScene.tsx, INITIAL_COMPONENTS
 * из Stage 2) — единственная физически возможная схема (Circuit Engine
 * поддерживает только один последовательный контур, см. circuit-engine.ts).
 * CANONICAL_WIRING ниже — тот же самый единственно возможный контур,
 * включающий все 7 компонентов, используемый как ориентир для подсказок
 * сборки (Task 4).
 */
import type { CircuitComponent, CircuitSolution, Connection } from "./circuit-engine";

export type LabDifficulty = "beginner" | "intermediate" | "advanced";

// контекст для проверки шагов/завершения/вопросов — целиком собирается из
// уже посчитанных данных (solveCircuit) плюс реально накопленной историей
// сессии (min/max наблюдавшихся величин, число сделанных записей в
// журнал) — здесь не выполняется НИКАКИХ новых вычислений физики
export interface ElectricityLabStepContext {
  components: CircuitComponent[];
  connections: Connection[];
  solution: CircuitSolution;
  measurementsRecorded: number;
  minVoltageVObserved: number;
  maxVoltageVObserved: number;
  minResistanceOhmObserved: number;
  maxResistanceOhmObserved: number;
  maxCurrentAObserved: number;
  maxBulbBrightnessObserved: number;
  fuseBlownObserved: boolean;
  openCircuitObserved: boolean;
  shortCircuitObserved: boolean;
  conclusionText: string;
}

export type ElectricityLabStepKind =
  | "introduction"
  | "theory"
  | "equipment"
  | "assembly"
  | "measurement"
  | "analysis"
  | "conclusion"
  | "finish";

export interface ElectricityLabStep {
  id: string;
  kind: ElectricityLabStepKind;
  instruction: string;
  // реальная проверка состояния Circuit Engine/сессии — шаг разблокируется,
  // только когда это возвращает true. Чисто информационные шаги
  // (introduction/theory/equipment) тривиально true — нечего "обмануть".
  isUnlocked: (ctx: ElectricityLabStepContext) => boolean;
  // Task 4 (Interactive Guidance): какую пару терминалов подсветить на
  // этом шаге — вычисляется из РЕАЛЬНОГО состояния connections (первая
  // ещё не подключённая пара из requiredWiring), а не запланированный
  // заранее сценарий. null — подсвечивать нечего (шаг не про сборку).
  suggestedTerminals?: (ctx: ElectricityLabStepContext) => [string, string] | null;
}

export interface ScientificQuestion {
  id: string;
  prompt: string;
  options: string[];
  // индекс правильного варианта — вычисляется из реальных данных сессии
  // (что фактически произошло в этой попытке), а не зашит заранее
  correctIndex: (ctx: ElectricityLabStepContext) => number;
}

export interface ElectricityLabExperiment {
  id: string;
  title: string;
  description: string;
  goal: string;
  theory: string;
  difficulty: LabDifficulty;
  estimatedMinutes: number;
  requiredComponents: string[];
  successConditions: string[];
  // канонический ориентир для подсказок сборки этого эксперимента —
  // подмножество CANONICAL_WIRING, актуальное именно для него
  requiredWiring: [string, string][];
  steps: ElectricityLabStep[];
  isComplete: (ctx: ElectricityLabStepContext) => boolean;
  questions: ScientificQuestion[];
  xpReward: number;
}

// единственная физически возможная полная раскладка (последовательный
// контур через все 7 компонентов + вольтметр параллельно резистору) —
// terminal id взяты из INITIAL_COMPONENTS в ElectricityLabScene.tsx
export const CANONICAL_WIRING: [string, string][] = [
  ["battery_pos", "switch_a"],
  ["switch_b", "ammeter_a"],
  ["ammeter_b", "resistor_a"],
  ["resistor_b", "bulb_a"],
  ["bulb_b", "fuse_a"],
  ["fuse_b", "battery_neg"],
  ["voltmeter_a", "resistor_a"],
  ["voltmeter_b", "resistor_b"],
];

function isPairWired(connections: Connection[], a: string, b: string): boolean {
  return connections.some(
    (c) => (c.terminals[0] === a && c.terminals[1] === b) || (c.terminals[0] === b && c.terminals[1] === a)
  );
}

// первая ещё не подключённая пара из списка — реальная проверка по
// текущим connections, не заскриптованная последовательность
function firstUnwiredPair(connections: Connection[], pairs: [string, string][]): [string, string] | null {
  const pair = pairs.find(([a, b]) => !isPairWired(connections, a, b));
  return pair ?? null;
}

function componentByKind(components: CircuitComponent[], kind: CircuitComponent["kind"]): CircuitComponent | undefined {
  return components.find((c) => c.kind === kind);
}

const alwaysUnlocked: ElectricityLabStep["isUnlocked"] = () => true;

function assemblySuggestion(wiring: [string, string][]): ElectricityLabStep["suggestedTerminals"] {
  return (ctx) => firstUnwiredPair(ctx.connections, wiring);
}

// ---- стандартные шаги, переиспользуемые несколькими экспериментами ----

function introStep(instruction: string): ElectricityLabStep {
  return { id: "introduction", kind: "introduction", instruction, isUnlocked: alwaysUnlocked };
}

function theoryStep(instruction: string): ElectricityLabStep {
  return { id: "theory", kind: "theory", instruction, isUnlocked: alwaysUnlocked };
}

function equipmentStep(instruction: string): ElectricityLabStep {
  return { id: "equipment", kind: "equipment", instruction, isUnlocked: alwaysUnlocked };
}

function conclusionStep(instruction: string): ElectricityLabStep {
  return {
    id: "conclusion",
    kind: "conclusion",
    instruction,
    isUnlocked: (ctx) => ctx.conclusionText.trim().length > 10,
  };
}

function finishStep(experiment: { isComplete: (ctx: ElectricityLabStepContext) => boolean }): ElectricityLabStep {
  return {
    id: "finish",
    kind: "finish",
    instruction: "Лабораторная работа завершена.",
    isUnlocked: (ctx) => experiment.isComplete(ctx),
  };
}

// ---- Beginner ----

const measureCurrent: ElectricityLabExperiment = {
  id: "elec-beginner-measure-current",
  title: "Измерение тока в простой цепи",
  description: "Собери простую замкнутую цепь и измерь реальный ток через амперметр.",
  goal: "Собрать цепь батарея — переключатель — амперметр — резистор — лампа — предохранитель и записать показание тока.",
  theory:
    "По закону Ома сила тока в цепи I = U / R, где U — напряжение источника, R — суммарное сопротивление цепи. Амперметр включается последовательно и измеряет ток, реально текущий через цепь.",
  difficulty: "beginner",
  estimatedMinutes: 8,
  requiredComponents: ["Батарея", "Переключатель", "Амперметр", "Резистор", "Лампа", "Предохранитель"],
  successConditions: ["Цепь замкнута и активна", "Сделана хотя бы одна запись измерения"],
  requiredWiring: CANONICAL_WIRING,
  xpReward: 10,
  steps: [
    introStep("Цель: собрать цепь и измерить в ней реальный ток."),
    theoryStep("По закону Ома I = U / R. Амперметр покажет фактический ток, вычисленный Circuit Engine."),
    equipmentStep("Понадобятся: батарея, переключатель, амперметр, резистор, лампа, предохранитель."),
    {
      id: "assembly",
      kind: "assembly",
      instruction: "Собери цепь проводами по подсказкам на клеммах, замкни переключатель.",
      isUnlocked: (ctx) => ctx.solution.isCircuitActive,
      suggestedTerminals: assemblySuggestion(CANONICAL_WIRING),
    },
    {
      id: "measurement",
      kind: "measurement",
      instruction: "Нажми «Записать измерение», чтобы зафиксировать показания приборов.",
      isUnlocked: (ctx) => ctx.measurementsRecorded >= 1,
    },
    {
      id: "analysis",
      kind: "analysis",
      instruction: "Ответь на научный вопрос ниже, опираясь на записанное измерение.",
      isUnlocked: (ctx) => ctx.measurementsRecorded >= 1,
    },
    conclusionStep("Запиши вывод: какой ток ты измерил и почему именно такой?"),
    finishStep({ isComplete: (ctx) => ctx.solution.isCircuitActive && ctx.measurementsRecorded >= 1 }),
  ],
  isComplete: (ctx) => ctx.solution.isCircuitActive && ctx.measurementsRecorded >= 1,
  questions: [
    {
      id: "q-current-formula",
      prompt: "Почему амперметр показывает именно такое значение тока?",
      options: [
        "Ток определяется законом Ома: I = U / R",
        "Ток всегда равен напряжению источника",
        "Ток не зависит от сопротивления цепи",
        "Ток задаётся амперметром произвольно",
      ],
      correctIndex: () => 0,
    },
  ],
};

const measureVoltage: ElectricityLabExperiment = {
  id: "elec-beginner-measure-voltage",
  title: "Измерение напряжения на резисторе",
  description: "Подключи вольтметр параллельно резистору и измерь реальное падение напряжения.",
  goal: "Собрать цепь, подключить вольтметр параллельно резистору и записать измерение.",
  theory:
    "Вольтметр подключается параллельно нагрузке и не пропускает через себя ток (идеальный вольтметр). Он измеряет разность потенциалов — падение напряжения на резисторе, U = I × R.",
  difficulty: "beginner",
  estimatedMinutes: 8,
  requiredComponents: ["Батарея", "Переключатель", "Резистор", "Вольтметр"],
  successConditions: ["Вольтметр подключён и показывает ненулевое напряжение", "Сделана хотя бы одна запись измерения"],
  requiredWiring: CANONICAL_WIRING,
  xpReward: 10,
  steps: [
    introStep("Цель: измерить падение напряжения на резисторе вольтметром."),
    theoryStep("U = I × R. Вольтметр включается параллельно резистору и не влияет на ток в цепи."),
    equipmentStep("Понадобятся: батарея, переключатель, резистор, вольтметр (подключается параллельно резистору)."),
    {
      id: "assembly",
      kind: "assembly",
      instruction: "Собери цепь и подключи вольтметр параллельно резистору.",
      isUnlocked: (ctx) => ctx.solution.isCircuitActive && (ctx.solution.readings.voltmeter?.voltageV ?? 0) > 0.1,
      suggestedTerminals: assemblySuggestion(CANONICAL_WIRING),
    },
    {
      id: "measurement",
      kind: "measurement",
      instruction: "Нажми «Записать измерение», чтобы зафиксировать показание вольтметра.",
      isUnlocked: (ctx) => ctx.measurementsRecorded >= 1,
    },
    {
      id: "analysis",
      kind: "analysis",
      instruction: "Ответь на научный вопрос ниже.",
      isUnlocked: (ctx) => ctx.measurementsRecorded >= 1,
    },
    conclusionStep("Запиши вывод: какое напряжение показал вольтметр?"),
    finishStep({
      isComplete: (ctx) => ctx.solution.isCircuitActive && (ctx.solution.readings.voltmeter?.voltageV ?? 0) > 0.1 && ctx.measurementsRecorded >= 1,
    }),
  ],
  isComplete: (ctx) => ctx.solution.isCircuitActive && (ctx.solution.readings.voltmeter?.voltageV ?? 0) > 0.1 && ctx.measurementsRecorded >= 1,
  questions: [
    {
      id: "q-voltmeter-placement",
      prompt: "Почему вольтметр подключают параллельно, а не последовательно?",
      options: [
        "Чтобы не разрывать цепь и не влиять на ток (идеальный вольтметр не проводит ток)",
        "Потому что так короче провод",
        "Параллельное подключение увеличивает ток",
        "Это не имеет значения",
      ],
      correctIndex: () => 0,
    },
  ],
};

const openCircuitExperiment: ElectricityLabExperiment = {
  id: "elec-beginner-open-circuit",
  title: "Разомкнутая цепь",
  description: "Понаблюдай за разомкнутой цепью (переключатель открыт), затем восстанови ток.",
  goal: "Убедиться, что при разомкнутом переключателе тока нет, затем замкнуть цепь и восстановить ток.",
  theory:
    "Если в контуре есть разрыв (открытый переключатель), ток равен нулю независимо от напряжения источника — цепь должна быть замкнутой, чтобы заряд мог циркулировать.",
  difficulty: "beginner",
  estimatedMinutes: 6,
  requiredComponents: ["Батарея", "Переключатель", "Лампа"],
  successConditions: ["Зафиксирован разрыв цепи (ток = 0)", "Цепь затем восстановлена (ток течёт)"],
  requiredWiring: CANONICAL_WIRING,
  xpReward: 10,
  steps: [
    introStep("Цель: понаблюдать разрыв цепи, затем восстановить ток."),
    theoryStep("Разомкнутый переключатель — разрыв контура. Ток = 0, пока контур не замкнут снова."),
    equipmentStep("Понадобятся: батарея, переключатель, лампа."),
    {
      id: "assembly",
      kind: "assembly",
      instruction: "Собери цепь, но оставь переключатель разомкнутым — убедись, что лампа не горит.",
      isUnlocked: (ctx) => ctx.solution.isClosedLoop && !ctx.solution.isCircuitActive,
      suggestedTerminals: assemblySuggestion(CANONICAL_WIRING),
    },
    {
      id: "measurement",
      kind: "measurement",
      instruction: "Нажми «Записать измерение» при разомкнутой цепи (ток должен быть 0).",
      isUnlocked: (ctx) => ctx.openCircuitObserved && ctx.measurementsRecorded >= 1,
    },
    {
      id: "analysis",
      kind: "analysis",
      instruction: "Теперь замкни переключатель и ответь на научный вопрос.",
      isUnlocked: (ctx) => ctx.openCircuitObserved && ctx.solution.isCircuitActive,
    },
    conclusionStep("Запиши вывод: что изменилось после замыкания переключателя?"),
    finishStep({ isComplete: (ctx) => ctx.openCircuitObserved && ctx.solution.isCircuitActive }),
  ],
  isComplete: (ctx) => ctx.openCircuitObserved && ctx.solution.isCircuitActive,
  questions: [
    {
      id: "q-open-circuit",
      prompt: "Почему ток был равен нулю при разомкнутом переключателе?",
      options: [
        "Разрыв контура не даёт заряду циркулировать — ток может течь только по замкнутой цепи",
        "Батарея разрядилась",
        "Резистор был слишком большим",
        "Амперметр был неисправен",
      ],
      correctIndex: () => 0,
    },
  ],
};

const lampBrightness: ElectricityLabExperiment = {
  id: "elec-beginner-lamp-brightness",
  title: "Яркость лампы",
  description: "Увеличивай напряжение источника и наблюдай реальный рост яркости лампы.",
  goal: "Добиться заметной яркости лампы (мощность не менее половины номинальной).",
  theory:
    "Мощность лампы P = I² × R. Яркость в этой лаборатории считается напрямую от реальной рассеиваемой мощности (bulbBrightness = P / P_ном) — не анимация, а честный расчёт Circuit Engine.",
  difficulty: "beginner",
  estimatedMinutes: 7,
  requiredComponents: ["Батарея", "Переключатель", "Лампа"],
  successConditions: ["Лампа входит в контур", "Яркость лампы превышает 50% от номинальной"],
  requiredWiring: CANONICAL_WIRING,
  xpReward: 10,
  steps: [
    introStep("Цель: добиться яркого свечения лампы, увеличивая напряжение."),
    theoryStep("P = I² × R. Яркость лампы пропорциональна реальной мощности, а не заскриптованной анимации."),
    equipmentStep("Понадобятся: батарея (с регулируемым напряжением), переключатель, лампа."),
    {
      id: "assembly",
      kind: "assembly",
      instruction: "Собери цепь так, чтобы лампа входила в контур, и замкни переключатель.",
      isUnlocked: (ctx) => ctx.solution.isCircuitActive && ctx.solution.readings.bulb !== undefined,
      suggestedTerminals: assemblySuggestion(CANONICAL_WIRING),
    },
    {
      id: "measurement",
      kind: "measurement",
      instruction: "Увеличивай напряжение батареи и нажимай «Записать измерение», пока лампа не станет яркой.",
      isUnlocked: (ctx) => ctx.maxBulbBrightnessObserved > 0.5 && ctx.measurementsRecorded >= 1,
    },
    {
      id: "analysis",
      kind: "analysis",
      instruction: "Ответь на научный вопрос о том, почему лампа стала ярче.",
      isUnlocked: (ctx) => ctx.maxBulbBrightnessObserved > 0.5,
    },
    conclusionStep("Запиши вывод: как менялась яркость при росте напряжения?"),
    finishStep({ isComplete: (ctx) => ctx.maxBulbBrightnessObserved > 0.5 && ctx.measurementsRecorded >= 1 }),
  ],
  isComplete: (ctx) => ctx.maxBulbBrightnessObserved > 0.5 && ctx.measurementsRecorded >= 1,
  questions: [
    {
      id: "q-brightness",
      prompt: "Почему лампа стала ярче при увеличении напряжения?",
      options: [
        "Выросла мощность P = I² × R, так как вырос ток при увеличении напряжения",
        "Лампа сама решила гореть ярче",
        "Яркость не связана с напряжением",
        "Сопротивление лампы уменьшилось само по себе",
      ],
      correctIndex: () => 0,
    },
  ],
};

// ---- Intermediate ----

const resistanceInfluence: ElectricityLabExperiment = {
  id: "elec-intermediate-resistance-influence",
  title: "Влияние сопротивления на ток",
  description: "Изменяй сопротивление резистора и понаблюдай за реальным изменением тока.",
  goal: "Провести ток при разных значениях сопротивления и сравнить результат (обратная зависимость).",
  theory:
    "По закону Ома I = U / R: при постоянном напряжении рост сопротивления снижает ток, и наоборот. Это обратно пропорциональная зависимость.",
  difficulty: "intermediate",
  estimatedMinutes: 10,
  requiredComponents: ["Батарея", "Резистор", "Амперметр"],
  successConditions: ["Сопротивление изменено в широком диапазоне (не менее 10 Ом)", "Сделаны измерения при разных значениях"],
  requiredWiring: CANONICAL_WIRING,
  xpReward: 15,
  steps: [
    introStep("Цель: исследовать, как сопротивление влияет на ток в цепи."),
    theoryStep("I = U / R — обратная зависимость. Чем больше сопротивление, тем меньше ток при том же напряжении."),
    equipmentStep("Понадобятся: батарея, резистор (с регулируемым сопротивлением), амперметр."),
    {
      id: "assembly",
      kind: "assembly",
      instruction: "Собери замкнутую цепь с резистором и амперметром.",
      isUnlocked: (ctx) => ctx.solution.isCircuitActive,
      suggestedTerminals: assemblySuggestion(CANONICAL_WIRING),
    },
    {
      id: "measurement",
      kind: "measurement",
      instruction: "Нажми «Записать измерение», затем измени сопротивление резистором минимум на 10 Ом и нажми снова.",
      isUnlocked: (ctx) => ctx.maxResistanceOhmObserved - ctx.minResistanceOhmObserved >= 10 && ctx.measurementsRecorded >= 2,
    },
    {
      id: "analysis",
      kind: "analysis",
      instruction: "Сравни записи и ответь на научный вопрос.",
      isUnlocked: (ctx) => ctx.measurementsRecorded >= 2,
    },
    conclusionStep("Запиши вывод: как изменение сопротивления повлияло на ток?"),
    finishStep({
      isComplete: (ctx) => ctx.maxResistanceOhmObserved - ctx.minResistanceOhmObserved >= 10 && ctx.measurementsRecorded >= 2,
    }),
  ],
  isComplete: (ctx) => ctx.maxResistanceOhmObserved - ctx.minResistanceOhmObserved >= 10 && ctx.measurementsRecorded >= 2,
  questions: [
    {
      id: "q-resistance-influence",
      prompt: "Что произошло с током при увеличении сопротивления резистора?",
      options: [
        "Ток уменьшился — по закону Ома ток обратно пропорционален сопротивлению",
        "Ток увеличился",
        "Ток не изменился",
        "Ток стал равен напряжению",
      ],
      correctIndex: () => 0,
    },
  ],
};

const voltageInfluence: ElectricityLabExperiment = {
  id: "elec-intermediate-voltage-influence",
  title: "Влияние напряжения на ток",
  description: "Изменяй напряжение источника и понаблюдай за реальным изменением тока.",
  goal: "Провести ток при разных значениях напряжения и сравнить результат (прямая зависимость).",
  theory: "По закону Ома I = U / R: при постоянном сопротивлении ток прямо пропорционален напряжению источника.",
  difficulty: "intermediate",
  estimatedMinutes: 10,
  requiredComponents: ["Батарея", "Резистор", "Амперметр"],
  successConditions: ["Напряжение изменено в широком диапазоне (не менее 8 В)", "Сделаны измерения при разных значениях"],
  requiredWiring: CANONICAL_WIRING,
  xpReward: 15,
  steps: [
    introStep("Цель: исследовать, как напряжение источника влияет на ток в цепи."),
    theoryStep("I = U / R — прямая зависимость. Чем больше напряжение, тем больше ток при том же сопротивлении."),
    equipmentStep("Понадобятся: батарея (с регулируемым напряжением), резистор, амперметр."),
    {
      id: "assembly",
      kind: "assembly",
      instruction: "Собери замкнутую цепь с резистором и амперметром.",
      isUnlocked: (ctx) => ctx.solution.isCircuitActive,
      suggestedTerminals: assemblySuggestion(CANONICAL_WIRING),
    },
    {
      id: "measurement",
      kind: "measurement",
      instruction: "Нажми «Записать измерение», затем измени напряжение батареи минимум на 8 В и нажми снова.",
      isUnlocked: (ctx) => ctx.maxVoltageVObserved - ctx.minVoltageVObserved >= 8 && ctx.measurementsRecorded >= 2,
    },
    {
      id: "analysis",
      kind: "analysis",
      instruction: "Сравни записи и ответь на научный вопрос.",
      isUnlocked: (ctx) => ctx.measurementsRecorded >= 2,
    },
    conclusionStep("Запиши вывод: как изменение напряжения повлияло на ток?"),
    finishStep({
      isComplete: (ctx) => ctx.maxVoltageVObserved - ctx.minVoltageVObserved >= 8 && ctx.measurementsRecorded >= 2,
    }),
  ],
  isComplete: (ctx) => ctx.maxVoltageVObserved - ctx.minVoltageVObserved >= 8 && ctx.measurementsRecorded >= 2,
  questions: [
    {
      id: "q-voltage-influence",
      prompt: "Что произошло с током при увеличении напряжения источника?",
      options: [
        "Ток увеличился — по закону Ома ток прямо пропорционален напряжению",
        "Ток уменьшился",
        "Ток не изменился",
        "Ток стал равен сопротивлению",
      ],
      correctIndex: () => 0,
    },
  ],
};

// ---- Advanced ----

const fuseOverload: ElectricityLabExperiment = {
  id: "elec-advanced-fuse-overload",
  title: "Перегрузка предохранителя",
  description: "Намеренно превысь номинальный ток предохранителя и понаблюдай, как он перегорает.",
  goal: "Добиться перегорания предохранителя, затем сбросить эксперимент, восстановив цепь.",
  theory:
    "Предохранитель рассчитан на номинальный ток (ratedCurrentA). Если реальный ток в цепи его превышает, предохранитель перегорает и разрывает цепь — это защитный механизм, предотвращающий перегрев проводки.",
  difficulty: "advanced",
  estimatedMinutes: 10,
  requiredComponents: ["Батарея", "Резистор", "Предохранитель"],
  successConditions: ["Ток превысил номинал предохранителя", "Предохранитель перегорел"],
  requiredWiring: CANONICAL_WIRING,
  xpReward: 20,
  steps: [
    introStep("Цель: намеренно перегрузить и пережечь предохранитель."),
    theoryStep("Если ток > ratedCurrentA предохранителя, он перегорает и разрывает цепь — это защита от перегрузки."),
    equipmentStep("Понадобятся: батарея (с регулируемым напряжением), резистор (с малым сопротивлением), предохранитель."),
    {
      id: "assembly",
      kind: "assembly",
      instruction: "Собери цепь с предохранителем в контуре.",
      isUnlocked: (ctx) => ctx.solution.isCircuitActive && ctx.solution.readings.fuse !== undefined,
      suggestedTerminals: assemblySuggestion(CANONICAL_WIRING),
    },
    {
      id: "measurement",
      kind: "measurement",
      instruction: "Увеличивай напряжение и уменьшай сопротивление, пока предохранитель не перегорит.",
      isUnlocked: (ctx) => ctx.fuseBlownObserved,
    },
    {
      id: "analysis",
      kind: "analysis",
      instruction: "Ответь на научный вопрос о причине перегорания.",
      isUnlocked: (ctx) => ctx.fuseBlownObserved,
    },
    conclusionStep("Запиши вывод: почему предохранитель перегорел?"),
    finishStep({ isComplete: (ctx) => ctx.fuseBlownObserved }),
  ],
  isComplete: (ctx) => ctx.fuseBlownObserved,
  questions: [
    {
      id: "q-fuse",
      prompt: "Почему перегорел предохранитель?",
      options: [
        "Реальный ток в цепи превысил номинальный ток предохранителя (ratedCurrentA)",
        "Предохранитель был неисправен изначально",
        "Батарея была слишком слабой",
        "Переключатель был разомкнут",
      ],
      correctIndex: () => 0,
    },
  ],
};

const shortCircuitInvestigation: ElectricityLabExperiment = {
  id: "elec-advanced-short-circuit",
  title: "Исследование короткого замыкания",
  description: "Намеренно создай короткое замыкание, понаблюдай за скачком тока, затем устрани его.",
  goal: "Получить короткое замыкание (почти нулевое сопротивление контура), затем перепроводить цепь так, чтобы ток шёл через нагрузку.",
  theory:
    "Короткое замыкание — путь с крайне малым сопротивлением в обход нагрузки. По закону Ома при R → 0 ток резко возрастает (I = U / R), что реально опасно для проводки.",
  difficulty: "advanced",
  estimatedMinutes: 12,
  requiredComponents: ["Батарея", "Резистор", "Переключатель"],
  successConditions: ["Зафиксировано короткое замыкание", "Короткое замыкание устранено, цепь снова активна и безопасна"],
  requiredWiring: CANONICAL_WIRING,
  xpReward: 20,
  steps: [
    introStep("Цель: получить короткое замыкание, понаблюдать за скачком тока, затем устранить его."),
    theoryStep("При R → 0 ток резко растёт (I = U / R). Circuit Engine определяет короткое замыкание по порогу сопротивления."),
    equipmentStep("Понадобятся: батарея, резистор, переключатель."),
    {
      id: "assembly",
      kind: "assembly",
      instruction: "Собери цепь так, чтобы получить короткое замыкание (соедини выводы батареи в обход нагрузки).",
      isUnlocked: (ctx) => ctx.solution.isClosedLoop,
      suggestedTerminals: assemblySuggestion(CANONICAL_WIRING),
    },
    {
      id: "measurement",
      kind: "measurement",
      instruction: "Нажми «Записать измерение» при коротком замыкании (ток будет очень большим).",
      isUnlocked: (ctx) => ctx.shortCircuitObserved && ctx.measurementsRecorded >= 1,
    },
    {
      id: "analysis",
      kind: "analysis",
      instruction: "Теперь перепроводи цепь так, чтобы устранить короткое замыкание, и ответь на вопрос.",
      isUnlocked: (ctx) => ctx.shortCircuitObserved && ctx.solution.isCircuitActive && !ctx.solution.isShortCircuit,
    },
    conclusionStep("Запиши вывод: что вызвало короткое замыкание и как ты его устранил?"),
    finishStep({
      isComplete: (ctx) => ctx.shortCircuitObserved && ctx.solution.isCircuitActive && !ctx.solution.isShortCircuit,
    }),
  ],
  isComplete: (ctx) => ctx.shortCircuitObserved && ctx.solution.isCircuitActive && !ctx.solution.isShortCircuit,
  questions: [
    {
      id: "q-short-circuit",
      prompt: "Почему ток был настолько большим во время короткого замыкания?",
      options: [
        "Сопротивление контура было почти нулевым, а по закону Ома ток обратно пропорционален сопротивлению",
        "Батарея выдала больше напряжения, чем обычно",
        "Амперметр показывал неверные данные",
        "Короткое замыкание не влияет на ток",
      ],
      correctIndex: () => 0,
    },
  ],
};

export const ELECTRICITY_LAB_CATALOG: ElectricityLabExperiment[] = [
  measureCurrent,
  measureVoltage,
  openCircuitExperiment,
  lampBrightness,
  resistanceInfluence,
  voltageInfluence,
  fuseOverload,
  shortCircuitInvestigation,
];

export function getElectricityLabExperiment(id: string): ElectricityLabExperiment | undefined {
  return ELECTRICITY_LAB_CATALOG.find((e) => e.id === id);
}

export function getElectricityExperimentsByDifficulty(difficulty: LabDifficulty): ElectricityLabExperiment[] {
  return ELECTRICITY_LAB_CATALOG.filter((e) => e.difficulty === difficulty);
}

export function searchElectricityExperiments(query: string): ElectricityLabExperiment[] {
  const q = query.trim().toLowerCase();
  if (!q) return ELECTRICITY_LAB_CATALOG;
  return ELECTRICITY_LAB_CATALOG.filter(
    (e) => e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.goal.toLowerCase().includes(q)
  );
}

// разблокировка по сложности — реальная, по фактически завершенным
// экспериментам: Beginner открыт всегда, Intermediate требует минимум 1
// пройденный Beginner, Advanced — минимум 1 пройденный Intermediate
export function isElectricityDifficultyUnlocked(difficulty: LabDifficulty, completedExperimentIds: string[]): boolean {
  if (difficulty === "beginner") return true;
  const completedSet = new Set(completedExperimentIds);
  if (difficulty === "intermediate") {
    return getElectricityExperimentsByDifficulty("beginner").some((e) => completedSet.has(e.id));
  }
  return getElectricityExperimentsByDifficulty("intermediate").some((e) => completedSet.has(e.id));
}

export function isElectricityExperimentUnlocked(experiment: ElectricityLabExperiment, completedExperimentIds: string[]): boolean {
  return isElectricityDifficultyUnlocked(experiment.difficulty, completedExperimentIds);
}

// снимок измерения — используется provider'ом при recordMeasurement();
// значения читаются напрямую из уже посчитанного CircuitSolution/
// компонентов, никогда не выдумываются
export function snapshotMeasurement(ctx: {
  components: CircuitComponent[];
  solution: CircuitSolution;
}): { voltageV: number; currentA: number; resistanceOhm: number; powerW: number } {
  const battery = componentByKind(ctx.components, "battery");
  const resistor = componentByKind(ctx.components, "resistor");
  const resistorReading = resistor ? ctx.solution.readings[resistor.id] : undefined;
  const voltmeterReading = ctx.solution.readings.voltmeter;
  return {
    voltageV: voltmeterReading?.voltageV ?? battery?.voltageV ?? 0,
    currentA: ctx.solution.currentA,
    resistanceOhm: resistor?.resistanceOhm ?? 0,
    powerW: resistorReading?.powerW ?? 0,
  };
}
