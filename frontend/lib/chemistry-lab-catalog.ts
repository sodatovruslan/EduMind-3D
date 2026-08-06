/**
 * Chemistry World — Laboratory Experiment Catalog (Stage 5.6). Единственное
 * место, которое описывает УЧЕБНЫЕ лабораторные работы: список, шаги,
 * цели, оборудование, технику безопасности, ожидаемые наблюдения и
 * условие завершения. Это НЕ замена Experiment Validator
 * (experiment-validator.ts) — тот модуль и его 4 эксперимента остаются
 * без изменений и продолжают работать как раньше. Этот файл — новый,
 * более богатый учебный слой поверх уже существующих движков.
 *
 * КРИТИЧЕСКИ ВАЖНО: ни один шаг не проверяет UI/нажатие кнопки. Каждое
 * условие (`isUnlocked`/`isComplete`) читает РЕАЛЬНОЕ состояние,
 * посчитанное Chemistry Engine / Reaction Engine / Hazard Engine /
 * Safety System. Ничего здесь не пересчитывает химию заново — только
 * читает уже готовые числа и флаги.
 *
 * Все 12 экспериментов используют ТОЛЬКО то, что уже реально поддержано
 * движком: растворение (chemistry-engine.addSubstance), 3 зарегистрированные
 * реакции (reaction-engine.ts), кипение/испарение (Pressure Engine),
 * герметизация/давление/целостность (Hazard Engine + Container Physics).
 * Никакой новой "химии" не придумано.
 */
import { aggregateStateOf, type Container } from "./chemistry-engine";
import { getRegisteredReactions } from "./reaction-engine";
import type { SafetyWarning } from "./chemistry-safety";
import type { HazardResult } from "./hazard-engine";

export type LabDifficulty = "beginner" | "intermediate" | "advanced";

// контекст для проверки шагов/завершения — целиком собирается из уже
// посчитанных данных, которыми ChemistryWorldScene и так владеет; здесь
// не выполняется НИКАКИХ новых вычислений физики/химии
export interface LabStepContext {
  activeContainerId: string;
  activeContainer: Container;
  isSealed: boolean;
  isOnStand: boolean;
  burnerOn: boolean;
  heatingAttached?: boolean;
  hazard: HazardResult;
  occurredReactionIds: string[]; // только для активного сосуда
  allOccurredReactionIds: string[]; // объединение по всем сосудам за сессию
  safetyWarnings: SafetyWarning[]; // только для активного сосуда
  allContainers: { id: string; data: Container }[];
  pourLog: { sourceId: string; targetId: string; at: number }[];
  maxTemperatureCObserved: number;
  maxPressureRatioObserved: number;
}

export type LabStepKind =
  | "goal"
  | "safety_briefing"
  | "prepare_equipment"
  | "add_substance"
  | "heat"
  | "observe"
  | "explain"
  | "finish";

export interface LabStep {
  id: string;
  kind: LabStepKind;
  instruction: string;
  // реальная проверка состояния симулятора — шаг разблокируется, только
  // когда это возвращает true. Для чисто информационных шагов (goal/
  // safety_briefing), для которых физического состояния не существует,
  // условие тривиально true — там нечего "обмануть" нажатием кнопки.
  isUnlocked: (ctx: LabStepContext) => boolean;
}

export interface LabExperiment {
  id: string;
  title: string;
  description: string;
  difficulty: LabDifficulty;
  estimatedMinutes: number;
  objectives: string[];
  requiredEquipment: string[];
  requiredSubstances: string[];
  safetyNotes: string[];
  expectedObservations: string[];
  steps: LabStep[];
  isComplete: (ctx: LabStepContext) => boolean;
  xpReward: number;
}

function gramsOf(list: { substanceId: string; grams: number }[], substanceId: string): number {
  return list.find((c) => c.substanceId === substanceId)?.grams ?? 0;
}

function hasSubstance(container: Container, substanceId: string, minGrams = 0.01): boolean {
  return gramsOf(container.contents, substanceId) > minGrams;
}

function isExothermicReaction(reactionId: string): boolean {
  return getRegisteredReactions().find((r) => r.id === reactionId)?.isExothermic ?? false;
}

const alwaysUnlocked: LabStep["isUnlocked"] = () => true;

// ---- Beginner ----

const heatingWater: LabExperiment = {
  id: "lab-beginner-heating-water",
  title: "Нагрев воды",
  description: "Доведи воду до кипения и понаблюдай за изменением температуры.",
  difficulty: "beginner",
  estimatedMinutes: 8,
  objectives: ["Нагреть воду в сосуде до 100°C", "Убедиться, что вода перешла в газообразное состояние"],
  requiredEquipment: ["Стакан", "Горелка", "Штатив", "Термометр"],
  requiredSubstances: ["Вода"],
  safetyNotes: ["Никогда не нагревай пустой сосуд", "Не прикасайся к горячему стеклу"],
  expectedObservations: ["Температура растёт, пока горелка включена", "При 100°C появляется пар"],
  xpReward: 10,
  steps: [
    { id: "goal", kind: "goal", instruction: "Цель: довести воду до кипения (100°C).", isUnlocked: alwaysUnlocked },
    {
      id: "safety",
      kind: "safety_briefing",
      instruction: "Правило безопасности: никогда не включай горелку под пустым сосудом.",
      isUnlocked: alwaysUnlocked,
    },
    {
      id: "prepare",
      kind: "prepare_equipment",
      instruction: "Поставь сосуд на штатив.",
      isUnlocked: (ctx) => ctx.isOnStand,
    },
    {
      id: "add-water",
      kind: "add_substance",
      instruction: "Налей воду в сосуд.",
      isUnlocked: (ctx) => hasSubstance(ctx.activeContainer, "water"),
    },
    {
      id: "heat",
      kind: "heat",
      instruction: "Включи горелку.",
      isUnlocked: (ctx) => ctx.burnerOn,
    },
    {
      id: "observe",
      kind: "observe",
      instruction: "Наблюдай за термометром, пока температура не достигнет 100°C.",
      isUnlocked: (ctx) => ctx.activeContainer.temperatureC >= 100 && aggregateStateOf(ctx.activeContainer) === "gas",
    },
    {
      id: "explain",
      kind: "explain",
      instruction: "Объясни: почему при 100°C вода закипает и переходит в пар?",
      isUnlocked: (ctx) => aggregateStateOf(ctx.activeContainer) === "gas",
    },
    { id: "finish", kind: "finish", instruction: "Эксперимент завершён.", isUnlocked: (ctx) => heatingWater.isComplete(ctx) },
  ],
  isComplete: (ctx) => ctx.activeContainer.temperatureC >= 100 && aggregateStateOf(ctx.activeContainer) === "gas",
};

const stateChanges: LabExperiment = {
  id: "lab-beginner-state-changes",
  title: "Изменения агрегатного состояния",
  description: "Понаблюдай, как вода переходит из жидкого состояния в газообразное.",
  difficulty: "beginner",
  estimatedMinutes: 7,
  objectives: ["Зафиксировать переход жидкость → газ по реальной температуре кипения"],
  requiredEquipment: ["Пробирка", "Горелка", "Штатив"],
  requiredSubstances: ["Вода"],
  safetyNotes: ["Не нагревай пустой сосуд"],
  expectedObservations: ["До 100°C вещество остаётся жидким", "При 100°C агрегатное состояние меняется на газообразное"],
  xpReward: 10,
  steps: [
    { id: "goal", kind: "goal", instruction: "Цель: зафиксировать момент перехода воды в газ.", isUnlocked: alwaysUnlocked },
    { id: "safety", kind: "safety_briefing", instruction: "Не нагревай пустой сосуд.", isUnlocked: alwaysUnlocked },
    { id: "prepare", kind: "prepare_equipment", instruction: "Поставь пробирку на штатив.", isUnlocked: (ctx) => ctx.isOnStand },
    {
      id: "add-water",
      kind: "add_substance",
      instruction: "Налей воду в пробирку.",
      isUnlocked: (ctx) => hasSubstance(ctx.activeContainer, "water"),
    },
    { id: "heat", kind: "heat", instruction: "Включи горелку и нагревай.", isUnlocked: (ctx) => ctx.burnerOn },
    {
      id: "observe",
      kind: "observe",
      instruction: "Следи за агрегатным состоянием, пока оно не станет газообразным.",
      isUnlocked: (ctx) => aggregateStateOf(ctx.activeContainer) === "gas",
    },
    {
      id: "explain",
      kind: "explain",
      instruction: "Объясни, что физически произошло с молекулами воды при кипении.",
      isUnlocked: (ctx) => aggregateStateOf(ctx.activeContainer) === "gas",
    },
    { id: "finish", kind: "finish", instruction: "Эксперимент завершён.", isUnlocked: (ctx) => stateChanges.isComplete(ctx) },
  ],
  isComplete: (ctx) => aggregateStateOf(ctx.activeContainer) === "gas",
};

const safeBurnerUsage: LabExperiment = {
  id: "lab-beginner-safe-burner",
  title: "Безопасное использование горелки",
  description: "Потренируйся включать горелку только тогда, когда это безопасно.",
  difficulty: "beginner",
  estimatedMinutes: 6,
  objectives: ["Включить горелку только после того, как в сосуде есть вода", "Не допустить срабатывания предупреждения о нагреве пустого сосуда"],
  requiredEquipment: ["Стакан", "Горелка", "Штатив"],
  requiredSubstances: ["Вода"],
  safetyNotes: ["Всегда сначала налей вещество, потом включай горелку"],
  expectedObservations: ["Safety System не выдаёт предупреждение empty_container_heated"],
  xpReward: 10,
  steps: [
    { id: "goal", kind: "goal", instruction: "Цель: нагреть сосуд безопасно, без предупреждений.", isUnlocked: alwaysUnlocked },
    {
      id: "safety",
      kind: "safety_briefing",
      instruction: "Правило: сначала вещество, потом нагрев. Иначе сработает реальная проверка Safety System.",
      isUnlocked: alwaysUnlocked,
    },
    {
      id: "add-water",
      kind: "add_substance",
      instruction: "Сначала налей воду в сосуд.",
      isUnlocked: (ctx) => hasSubstance(ctx.activeContainer, "water"),
    },
    { id: "prepare", kind: "prepare_equipment", instruction: "Поставь сосуд на штатив.", isUnlocked: (ctx) => ctx.isOnStand },
    { id: "heat", kind: "heat", instruction: "Теперь включи горелку.", isUnlocked: (ctx) => ctx.burnerOn },
    {
      id: "observe",
      kind: "observe",
      instruction: "Убедись, что нет предупреждения о нагреве пустого сосуда.",
      isUnlocked: (ctx) => ctx.burnerOn && ctx.activeContainer.temperatureC > 25 && !ctx.safetyWarnings.some((w) => w.code === "empty_container_heated"),
    },
    {
      id: "explain",
      kind: "explain",
      instruction: "Объясни, почему нагрев пустого сосуда опасен для стекла.",
      isUnlocked: (ctx) => ctx.burnerOn && ctx.activeContainer.temperatureC > 25,
    },
    { id: "finish", kind: "finish", instruction: "Эксперимент завершён.", isUnlocked: (ctx) => safeBurnerUsage.isComplete(ctx) },
  ],
  isComplete: (ctx) =>
    ctx.burnerOn && ctx.activeContainer.temperatureC > 25 && !ctx.safetyWarnings.some((w) => w.code === "empty_container_heated"),
};

const pouringBetweenContainers: LabExperiment = {
  id: "lab-beginner-pouring",
  title: "Переливание между сосудами",
  description: "Перелей жидкость из одного сосуда в другой, сохранив массу.",
  difficulty: "beginner",
  estimatedMinutes: 6,
  objectives: ["Перелить содержимое из одного сосуда в другой"],
  requiredEquipment: ["Стакан", "Пробирка"],
  requiredSubstances: ["Вода"],
  safetyNotes: ["Держи сосуды над столом при переливании"],
  expectedObservations: ["Масса переходит из одного сосуда в другой без потерь (закон сохранения массы)"],
  xpReward: 10,
  steps: [
    { id: "goal", kind: "goal", instruction: "Цель: перелить воду из одного сосуда в другой.", isUnlocked: alwaysUnlocked },
    { id: "safety", kind: "safety_briefing", instruction: "Переливай аккуратно, над столом.", isUnlocked: alwaysUnlocked },
    {
      id: "add-water",
      kind: "add_substance",
      instruction: "Налей воду в один из сосудов.",
      isUnlocked: (ctx) => ctx.allContainers.some((c) => hasSubstance(c.data, "water")),
    },
    {
      id: "pour",
      kind: "observe",
      instruction: "Перетащи один сосуд на другой, чтобы перелить содержимое.",
      isUnlocked: (ctx) => ctx.pourLog.length > 0,
    },
    {
      id: "explain",
      kind: "explain",
      instruction: "Объясни: почему суммарная масса не изменилась после переливания?",
      isUnlocked: (ctx) => ctx.pourLog.length > 0,
    },
    { id: "finish", kind: "finish", instruction: "Эксперимент завершён.", isUnlocked: (ctx) => pouringBetweenContainers.isComplete(ctx) },
  ],
  isComplete: (ctx) => ctx.pourLog.length > 0,
};

// ---- Intermediate ----

const exothermicReaction: LabExperiment = {
  id: "lab-intermediate-exothermic",
  title: "Экзотермическая реакция",
  description: "Смешай соляную кислоту и гидроксид натрия и понаблюдай за выделением тепла.",
  difficulty: "intermediate",
  estimatedMinutes: 10,
  objectives: ["Вызвать реакцию нейтрализации HCl + NaOH", "Заметить рост температуры без внешнего нагрева"],
  requiredEquipment: ["Стакан"],
  requiredSubstances: ["Соляная кислота (HCl)", "Гидроксид натрия (NaOH)"],
  safetyNotes: ["Приливай кислоту в воду, а не наоборот", "Используй достаточное разбавление"],
  expectedObservations: ["Reaction Engine фиксирует neutralization-hcl-naoh", "Температура растёт сама по себе — реакция экзотермическая"],
  xpReward: 15,
  steps: [
    { id: "goal", kind: "goal", instruction: "Цель: вызвать экзотермическую реакцию нейтрализации.", isUnlocked: alwaysUnlocked },
    { id: "safety", kind: "safety_briefing", instruction: "Разбавляй кислоту водой перед смешиванием.", isUnlocked: alwaysUnlocked },
    {
      id: "add-hcl",
      kind: "add_substance",
      instruction: "Добавь соляную кислоту (HCl).",
      isUnlocked: (ctx) => hasSubstance(ctx.activeContainer, "hcl") || ctx.occurredReactionIds.includes("neutralization-hcl-naoh"),
    },
    {
      id: "add-naoh",
      kind: "add_substance",
      instruction: "Добавь гидроксид натрия (NaOH).",
      isUnlocked: (ctx) => ctx.occurredReactionIds.includes("neutralization-hcl-naoh"),
    },
    {
      id: "observe",
      kind: "observe",
      instruction: "Проверь Reaction Log — реакция должна была сработать.",
      isUnlocked: (ctx) => ctx.occurredReactionIds.includes("neutralization-hcl-naoh"),
    },
    {
      id: "explain",
      kind: "explain",
      instruction: "Объясни, откуда взялось тепло, ведь горелка не включена.",
      isUnlocked: (ctx) => ctx.occurredReactionIds.includes("neutralization-hcl-naoh"),
    },
    { id: "finish", kind: "finish", instruction: "Эксперимент завершён.", isUnlocked: (ctx) => exothermicReaction.isComplete(ctx) },
  ],
  isComplete: (ctx) => ctx.occurredReactionIds.includes("neutralization-hcl-naoh") && isExothermicReaction("neutralization-hcl-naoh"),
};

const gasFormation: LabExperiment = {
  id: "lab-intermediate-gas-formation",
  title: "Образование газа",
  description: "Доведи воду до кипения и понаблюдай за образованием пара (реальный расчёт Pressure Engine).",
  difficulty: "intermediate",
  estimatedMinutes: 9,
  objectives: ["Довести жидкость до состояния активного парообразования"],
  requiredEquipment: ["Стакан", "Горелка", "Штатив"],
  requiredSubstances: ["Вода"],
  safetyNotes: ["Не закрывай сосуд крышкой на этом этапе — работаем в открытом сосуде"],
  expectedObservations: ["Hazard Engine фиксирует уровень gas_release/boiling по реальной доле испарения"],
  xpReward: 15,
  steps: [
    { id: "goal", kind: "goal", instruction: "Цель: получить заметное парообразование.", isUnlocked: alwaysUnlocked },
    { id: "safety", kind: "safety_briefing", instruction: "Сосуд должен оставаться открытым.", isUnlocked: alwaysUnlocked },
    { id: "add-water", kind: "add_substance", instruction: "Налей воду.", isUnlocked: (ctx) => hasSubstance(ctx.activeContainer, "water") },
    { id: "prepare", kind: "prepare_equipment", instruction: "Поставь сосуд на штатив и включи горелку.", isUnlocked: (ctx) => ctx.isOnStand && ctx.burnerOn },
    {
      id: "observe",
      kind: "observe",
      instruction: "Дождись, пока Hazard Engine покажет активное парообразование.",
      isUnlocked: (ctx) => ctx.hazard.level === "gas_release" || ctx.hazard.level === "boiling",
    },
    {
      id: "explain",
      kind: "explain",
      instruction: "Объясни, откуда взялся газ и почему давление в открытом сосуде не растёт.",
      isUnlocked: (ctx) => ctx.hazard.level === "gas_release" || ctx.hazard.level === "boiling",
    },
    { id: "finish", kind: "finish", instruction: "Эксперимент завершён.", isUnlocked: (ctx) => gasFormation.isComplete(ctx) },
  ],
  isComplete: (ctx) => ctx.hazard.level === "gas_release" || ctx.hazard.level === "boiling" || aggregateStateOf(ctx.activeContainer) === "gas",
};

const temperatureObservation: LabExperiment = {
  id: "lab-intermediate-temperature-observation",
  title: "Наблюдение температуры",
  description: "Систематически наблюдай за ростом температуры при нагреве.",
  difficulty: "intermediate",
  estimatedMinutes: 8,
  objectives: ["Зафиксировать рост температуры минимум до 80°C", "Вести систематическое наблюдение (см. Лабораторный журнал)"],
  requiredEquipment: ["Стакан", "Горелка", "Штатив", "Термометр"],
  requiredSubstances: ["Вода"],
  safetyNotes: ["Не нагревай пустой сосуд"],
  expectedObservations: ["Температура растёт линейно, пока горелка включена"],
  xpReward: 10,
  steps: [
    { id: "goal", kind: "goal", instruction: "Цель: систематически проследить рост температуры.", isUnlocked: alwaysUnlocked },
    { id: "safety", kind: "safety_briefing", instruction: "Не нагревай пустой сосуд.", isUnlocked: alwaysUnlocked },
    { id: "add-water", kind: "add_substance", instruction: "Налей воду.", isUnlocked: (ctx) => hasSubstance(ctx.activeContainer, "water") },
    { id: "heat", kind: "heat", instruction: "Включи горелку.", isUnlocked: (ctx) => ctx.burnerOn },
    {
      id: "observe",
      kind: "observe",
      instruction: "Наблюдай, пока температура не достигнет 80°C.",
      isUnlocked: (ctx) => ctx.activeContainer.temperatureC >= 80,
    },
    {
      id: "explain",
      kind: "explain",
      instruction: "Опиши характер роста температуры (линейный, ускоряющийся, замедляющийся?).",
      isUnlocked: (ctx) => ctx.activeContainer.temperatureC >= 80,
    },
    { id: "finish", kind: "finish", instruction: "Эксперимент завершён.", isUnlocked: (ctx) => temperatureObservation.isComplete(ctx) },
  ],
  isComplete: (ctx) => ctx.maxTemperatureCObserved >= 80,
};

const comparingReactions: LabExperiment = {
  id: "lab-intermediate-comparing-reactions",
  title: "Сравнение реакций",
  description: "Проведи две разные реакции и сравни их (экзотермическая и с образованием осадка).",
  difficulty: "intermediate",
  estimatedMinutes: 12,
  objectives: ["Вызвать минимум 2 разные реакции за сессию", "Сравнить их характер (тепло/осадок)"],
  requiredEquipment: ["Стакан", "Пробирка"],
  requiredSubstances: ["HCl", "NaOH", "AgNO₃", "NaCl"],
  safetyNotes: ["Работай с каждой парой веществ в отдельном сосуде"],
  expectedObservations: ["Одна реакция выделяет тепло (isExothermic), другая образует осадок"],
  xpReward: 15,
  steps: [
    { id: "goal", kind: "goal", instruction: "Цель: провести и сравнить 2 разные реакции.", isUnlocked: alwaysUnlocked },
    { id: "safety", kind: "safety_briefing", instruction: "Используй разные сосуды для разных реакций.", isUnlocked: alwaysUnlocked },
    {
      id: "reaction-1",
      kind: "add_substance",
      instruction: "Проведи первую реакцию (например, нейтрализацию).",
      isUnlocked: (ctx) => ctx.allOccurredReactionIds.length >= 1,
    },
    {
      id: "reaction-2",
      kind: "add_substance",
      instruction: "Проведи вторую, отличающуюся реакцию (например, осаждение).",
      isUnlocked: (ctx) => new Set(ctx.allOccurredReactionIds).size >= 2,
    },
    {
      id: "observe",
      kind: "observe",
      instruction: "Сравни: какая реакция выделила тепло, а какая дала осадок?",
      isUnlocked: (ctx) => new Set(ctx.allOccurredReactionIds).size >= 2,
    },
    {
      id: "explain",
      kind: "explain",
      instruction: "Объясни разницу между экзотермической реакцией и реакцией осаждения.",
      isUnlocked: (ctx) => new Set(ctx.allOccurredReactionIds).size >= 2,
    },
    { id: "finish", kind: "finish", instruction: "Эксперимент завершён.", isUnlocked: (ctx) => comparingReactions.isComplete(ctx) },
  ],
  isComplete: (ctx) => new Set(ctx.allOccurredReactionIds).size >= 2,
};

// ---- Advanced ----

const closedContainerPressure: LabExperiment = {
  id: "lab-advanced-closed-pressure",
  title: "Давление в закрытом сосуде",
  description: "Запечатай сосуд и понаблюдай за реальным ростом давления при кипении.",
  difficulty: "advanced",
  estimatedMinutes: 12,
  objectives: ["Запечатать сосуд", "Довести до кипения и получить измеримое избыточное давление"],
  requiredEquipment: ["Стакан", "Горелка", "Штатив"],
  requiredSubstances: ["Вода"],
  safetyNotes: ["Следи за Hazard Debug Mode", "Будь готов распечатать сосуд при необходимости"],
  expectedObservations: ["Pressure Engine показывает рост избыточного давления (gaugePressureKPa > 0)"],
  xpReward: 20,
  steps: [
    { id: "goal", kind: "goal", instruction: "Цель: получить измеримое избыточное давление в закрытом сосуде.", isUnlocked: alwaysUnlocked },
    {
      id: "safety",
      kind: "safety_briefing",
      instruction: "Давление в закрытом сосуде реально опасно — следи за Hazard Debug Mode.",
      isUnlocked: alwaysUnlocked,
    },
    { id: "add-water", kind: "add_substance", instruction: "Налей воду.", isUnlocked: (ctx) => hasSubstance(ctx.activeContainer, "water") },
    { id: "seal", kind: "prepare_equipment", instruction: "Запечатай сосуд (иконка замка).", isUnlocked: (ctx) => ctx.isSealed },
    { id: "heat", kind: "heat", instruction: "Включи горелку.", isUnlocked: (ctx) => ctx.burnerOn },
    {
      id: "observe",
      kind: "observe",
      instruction: "Дождись реального роста избыточного давления.",
      isUnlocked: (ctx) => ctx.hazard.pressureRatio > 0.1,
    },
    {
      id: "explain",
      kind: "explain",
      instruction: "Объясни, почему в закрытом сосуде давление растёт, а в открытом — нет.",
      isUnlocked: (ctx) => ctx.hazard.pressureRatio > 0.1,
    },
    { id: "finish", kind: "finish", instruction: "Эксперимент завершён.", isUnlocked: (ctx) => closedContainerPressure.isComplete(ctx) },
  ],
  isComplete: (ctx) => ctx.isSealed && ctx.hazard.pressureRatio > 0.1,
};

const hazardPrevention: LabExperiment = {
  id: "lab-advanced-hazard-prevention",
  title: "Предотвращение опасности",
  description: "Дай давлению вырасти, но вовремя распечатай сосуд, не допустив повреждения.",
  difficulty: "advanced",
  estimatedMinutes: 14,
  objectives: ["Позволить давлению реально вырасти", "Вовремя распечатать сосуд, сохранив целостность normal"],
  requiredEquipment: ["Стакан", "Горелка", "Штатив"],
  requiredSubstances: ["Вода"],
  safetyNotes: ["Следи за целостностью сосуда в Hazard Debug Mode", "Распечатай сосуд ДО появления трещин"],
  expectedObservations: ["Целостность остаётся normal, несмотря на реально наблюдавшееся давление"],
  xpReward: 20,
  steps: [
    { id: "goal", kind: "goal", instruction: "Цель: предотвратить аварию, вовремя распечатав сосуд.", isUnlocked: alwaysUnlocked },
    { id: "safety", kind: "safety_briefing", instruction: "Следи за целостностью в Hazard Debug Mode.", isUnlocked: alwaysUnlocked },
    { id: "add-water", kind: "add_substance", instruction: "Налей воду.", isUnlocked: (ctx) => hasSubstance(ctx.activeContainer, "water") },
    { id: "seal", kind: "prepare_equipment", instruction: "Запечатай сосуд.", isUnlocked: (ctx) => ctx.isSealed },
    { id: "heat", kind: "heat", instruction: "Нагревай, пока давление реально не вырастет.", isUnlocked: (ctx) => ctx.maxPressureRatioObserved > 0.15 },
    {
      id: "prevent",
      kind: "observe",
      instruction: "Распечатай сосуд, пока целостность ещё normal.",
      isUnlocked: (ctx) => ctx.maxPressureRatioObserved > 0.15 && !ctx.isSealed && ctx.hazard.containerIntegrity.level === "normal",
    },
    {
      id: "explain",
      kind: "explain",
      instruction: "Объясни, почему своевременное открытие сосуда предотвратило повреждение.",
      isUnlocked: (ctx) => ctx.maxPressureRatioObserved > 0.15 && !ctx.isSealed && ctx.hazard.containerIntegrity.level === "normal",
    },
    { id: "finish", kind: "finish", instruction: "Эксперимент завершён.", isUnlocked: (ctx) => hazardPrevention.isComplete(ctx) },
  ],
  isComplete: (ctx) => ctx.maxPressureRatioObserved > 0.15 && !ctx.isSealed && ctx.hazard.containerIntegrity.level === "normal",
};

const pressureAnalysis: LabExperiment = {
  id: "lab-advanced-pressure-analysis",
  title: "Анализ давления",
  description: "Проведи систематический анализ роста давления в закрытом сосуде.",
  difficulty: "advanced",
  estimatedMinutes: 15,
  objectives: ["Задокументировать реальный рост избыточного давления выше 20% от предела сосуда"],
  requiredEquipment: ["Стакан", "Горелка", "Штатив"],
  requiredSubstances: ["Вода"],
  safetyNotes: ["Наблюдай за gasAmountG и freeVolumeMl в Hazard Debug Mode"],
  expectedObservations: ["Давление растёт по закону PV=nRT — зависит от количества газа, температуры и свободного объёма"],
  xpReward: 20,
  steps: [
    { id: "goal", kind: "goal", instruction: "Цель: систематически проанализировать рост давления.", isUnlocked: alwaysUnlocked },
    { id: "safety", kind: "safety_briefing", instruction: "Следи за Hazard Debug Mode на всех этапах.", isUnlocked: alwaysUnlocked },
    { id: "add-water", kind: "add_substance", instruction: "Налей воду.", isUnlocked: (ctx) => hasSubstance(ctx.activeContainer, "water") },
    { id: "seal", kind: "prepare_equipment", instruction: "Запечатай сосуд.", isUnlocked: (ctx) => ctx.isSealed },
    { id: "heat", kind: "heat", instruction: "Нагревай и фиксируй gasAmountG/pressureKPa.", isUnlocked: (ctx) => ctx.burnerOn },
    {
      id: "observe",
      kind: "observe",
      instruction: "Дождись pressureRatio выше 20%.",
      isUnlocked: (ctx) => ctx.maxPressureRatioObserved > 0.2,
    },
    {
      id: "explain",
      kind: "explain",
      instruction: "Объясни зависимость давления от температуры и свободного объёма (PV=nRT).",
      isUnlocked: (ctx) => ctx.maxPressureRatioObserved > 0.2,
    },
    { id: "finish", kind: "finish", instruction: "Эксперимент завершён.", isUnlocked: (ctx) => pressureAnalysis.isComplete(ctx) },
  ],
  isComplete: (ctx) => ctx.isSealed && ctx.maxPressureRatioObserved > 0.2,
};

const experimentalInvestigation: LabExperiment = {
  id: "lab-advanced-investigation",
  title: "Экспериментальное исследование",
  description: "Самостоятельно выбери вещества и условия, вызови и объясни реальное явление.",
  difficulty: "advanced",
  estimatedMinutes: 15,
  objectives: ["Самостоятельно вызвать реальную реакцию или опасное явление", "Задокументировать и объяснить результат в Лабораторном журнале"],
  requiredEquipment: ["Любое доступное оборудование"],
  requiredSubstances: ["На выбор ученика"],
  safetyNotes: ["Соблюдай правила безопасности, изученные в предыдущих экспериментах"],
  expectedObservations: ["Зависит от выбора ученика — фиксируется реальными данными Reaction Engine / Hazard Engine"],
  xpReward: 25,
  steps: [
    { id: "goal", kind: "goal", instruction: "Цель: самостоятельно спланировать и провести исследование.", isUnlocked: alwaysUnlocked },
    { id: "safety", kind: "safety_briefing", instruction: "Соблюдай уже изученные правила безопасности.", isUnlocked: alwaysUnlocked },
    {
      id: "investigate",
      kind: "add_substance",
      instruction: "Смешай вещества по своему выбору.",
      isUnlocked: (ctx) => ctx.allOccurredReactionIds.length > 0 || ctx.hazard.level !== "none",
    },
    {
      id: "observe",
      kind: "observe",
      instruction: "Зафиксируй, что реально произошло (реакция и/или опасное явление).",
      isUnlocked: (ctx) => ctx.allOccurredReactionIds.length > 0 || ctx.hazard.level !== "none",
    },
    {
      id: "explain",
      kind: "explain",
      instruction: "Запиши в Лабораторный журнал вывод о причине наблюдаемого явления.",
      isUnlocked: (ctx) => ctx.allOccurredReactionIds.length > 0 || ctx.hazard.level !== "none",
    },
    { id: "finish", kind: "finish", instruction: "Исследование завершено.", isUnlocked: (ctx) => experimentalInvestigation.isComplete(ctx) },
  ],
  isComplete: (ctx) => ctx.allOccurredReactionIds.length > 0 || ctx.hazard.level !== "none",
};

export const LAB_CATALOG: LabExperiment[] = [
  heatingWater,
  stateChanges,
  safeBurnerUsage,
  pouringBetweenContainers,
  exothermicReaction,
  gasFormation,
  temperatureObservation,
  comparingReactions,
  closedContainerPressure,
  hazardPrevention,
  pressureAnalysis,
  experimentalInvestigation,
];

export function getLabExperiment(id: string): LabExperiment | undefined {
  return LAB_CATALOG.find((e) => e.id === id);
}

export function getExperimentsByDifficulty(difficulty: LabDifficulty): LabExperiment[] {
  return LAB_CATALOG.filter((e) => e.difficulty === difficulty);
}

export function searchExperiments(query: string): LabExperiment[] {
  const q = query.trim().toLowerCase();
  if (!q) return LAB_CATALOG;
  return LAB_CATALOG.filter(
    (e) => e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.objectives.some((o) => o.toLowerCase().includes(q))
  );
}

// разблокировка по сложности — реальная, по фактически завершенным
// экспериментам (никаких выдуманных условий): Beginner открыт всегда,
// Intermediate требует минимум 1 пройденный Beginner, Advanced — минимум
// 1 пройденный Intermediate
export function isDifficultyUnlocked(difficulty: LabDifficulty, completedExperimentIds: string[]): boolean {
  if (difficulty === "beginner") return true;
  const completedSet = new Set(completedExperimentIds);
  if (difficulty === "intermediate") {
    return getExperimentsByDifficulty("beginner").some((e) => completedSet.has(e.id));
  }
  return getExperimentsByDifficulty("intermediate").some((e) => completedSet.has(e.id));
}

export function isExperimentUnlocked(experiment: LabExperiment, completedExperimentIds: string[]): boolean {
  return isDifficultyUnlocked(experiment.difficulty, completedExperimentIds);
}
