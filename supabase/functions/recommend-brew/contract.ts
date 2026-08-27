export type NumericRange = { min: number; max: number };

export type AiValidationFailure =
  | "OUTPUT_TRUNCATED"
  | "INVALID_JSON"
  | "MISSING_RECIPE"
  | "MODE_LOCK"
  | "EQUIPMENT_LOCK"
  | "GRIND_LOCK"
  | "ESPRESSO_DOSE_LOCK"
  | "RATIO_RANGE"
  | "WATER_TEMPERATURE_RANGE"
  | "COFFEE_RANGE"
  | "WATER_RANGE"
  | "ICE_RANGE"
  | "BEVERAGE_RANGE"
  | "TIME_RANGE"
  | "MASS_CONSISTENCY"
  | "BREW_STEPS";

export type RecommendationRequest = {
  version: 2;
  targetBean: Record<string, unknown>;
  selection: {
    mode: "hot_pourover" | "iced_pourover" | "cold_brew" | "espresso";
    variant: "ready_to_drink" | "concentrate" | null;
    brewer: string;
    grinder: string;
    espressoDoseGrams: number | null;
  };
  rule: {
    recipe: Record<string, unknown>;
    allowedRanges: Record<string, NumericRange | null>;
    confidence: "high" | "medium" | "low";
    baseSource: Record<string, unknown>;
    reasons: Record<string, unknown>;
  };
  references: Record<string, unknown>[];
  templates: {
    selected: Record<string, unknown> | null;
    alternatives: Record<string, unknown>[];
  };
  tasteGoals: string[];
};

const topKeys = [
  "version",
  "targetBean",
  "selection",
  "rule",
  "references",
  "templates",
  "tasteGoals",
];
const beanKeys = [
  "id",
  "name",
  "roaster",
  "beanType",
  "origin",
  "farmOrStation",
  "process",
  "variety",

  "altitudeMeters",
  "roastDate",
  "roastLevel",
  "flavorTags",
  "flavorNotes",
];
const recipeKeys = [
  "method",
  "brewMode",
  "brewVariant",
  "grinder",
  "coffeeGrams",
  "waterGrams",
  "iceGrams",
  "beverageGrams",
  "bloomTimeDeltaSeconds",
  "dripper",
  "grindSetting",
  "ratio",
  "waterTemperatureC",
  "totalTimeSeconds",
];
const rangeKeys = [
  "ratioDenominator",
  "waterTemperatureC",
  "coffeeGrams",
  "waterGrams",
  "iceGrams",
  "beverageGrams",
  "totalTimeSeconds",
];
const referenceKeys = [
  "id",
  "beanName",
  "rating",
  "sensory",
  "notes",
  "equipmentMatch",
  "recipe",
];
const sensoryKeys = [
  "acidity",
  "sweetness",
  "bitterness",
  "astringency",
  "body",
  "aftertaste",
];
const templateKeys = [
  "id",
  "name",
  "brewer",
  "ratio",
  "waterTemperature",
  "targetTime",
  "pourSummary",
  "isChampionReference",
  "score",
  "reasons",
];
const stepKeys = [
  "label",
  "startSeconds",
  "endSeconds",
  "targetType",
  "targetGrams",
  "action",
];
const targetTypes = ["water", "ice", "beverage", "none"] as const;

function hasExactly(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return recordWithOnly(value, keys) &&
    keys.every((key) => Object.hasOwn(value, key));
}
function validRange(value: unknown) {
  return value === null ||
    (hasExactly(value, ["min", "max"]) && finite(value.min) &&
      finite(value.max) && value.min <= value.max);
}
function validRecipe(value: unknown) {
  return recordWithOnly(value, recipeKeys);
}
function validReference(value: unknown) {
  return hasExactly(value, referenceKeys) && validRecipe(value.recipe) &&
    recordWithOnly(value.sensory, sensoryKeys) &&
    recordWithOnly(value.equipmentMatch, ["brewer", "grinder"]);
}
function validTemplate(value: unknown) {
  return recordWithOnly(value, templateKeys);
}

export function isBoundedRecommendationRequest(
  value: unknown,
): value is RecommendationRequest {
  if (!recordWithOnly(value, topKeys) || value.version !== 2) return false;
  if (
    !recordWithOnly(value.targetBean, beanKeys) || !text(value.targetBean.id) ||
    !text(value.targetBean.name)
  ) return false;
  if (
    !recordWithOnly(value.selection, [
      "mode",
      "variant",
      "brewer",
      "grinder",
      "espressoDoseGrams",
    ])
  ) return false;
  const selection = value.selection;
  if (
    !["hot_pourover", "iced_pourover", "cold_brew", "espresso"].includes(
      String(selection.mode),
    )
  ) return false;
  if (
    selection.variant !== null && selection.variant !== "ready_to_drink" &&
    selection.variant !== "concentrate"
  ) return false;
  if (
    typeof selection.brewer !== "string" ||
    typeof selection.grinder !== "string"
  ) return false;
  if (
    selection.espressoDoseGrams !== null && !finite(selection.espressoDoseGrams)
  ) return false;
  if (
    !recordWithOnly(value.rule, [
      "recipe",
      "allowedRanges",
      "confidence",
      "baseSource",
      "reasons",
    ])
  ) return false;
  const rule = value.rule;
  if (!validRecipe(rule.recipe) || !hasExactly(rule.allowedRanges, rangeKeys)) {
    return false;
  }
  const allowedRanges = rule.allowedRanges;
  if (!rangeKeys.every((key) => validRange(allowedRanges[key]))) return false;
  if (
    !recordWithOnly(rule.baseSource, [
      "type",
      "label",
      "brewLogId",
      "templateId",
    ]) ||
    !recordWithOnly(rule.reasons, ["bean", "feedback", "freshness"]) ||
    !["high", "medium", "low"].includes(String(rule.confidence))
  ) return false;
  if (
    !Array.isArray(value.references) || value.references.length > 3 ||
    !value.references.every(validReference)
  ) return false;
  if (!recordWithOnly(value.templates, ["selected", "alternatives"])) {
    return false;
  }
  if (
    value.templates.selected !== null &&
    !validTemplate(value.templates.selected)
  ) return false;
  if (
    !Array.isArray(value.templates.alternatives) ||
    value.templates.alternatives.length > 2 ||
    !value.templates.alternatives.every(validTemplate)
  ) return false;
  return Array.isArray(value.tasteGoals) && value.tasteGoals.length <= 8 &&
    value.tasteGoals.every((item) => typeof item === "string");
}

export function validateStructuredAiResponse(
  value: unknown,
  context: RecommendationRequest,
) {
  return getStructuredAiResponseViolation(value, context) === null
    ? value as Record<string, unknown>
    : null;
}

export function getStructuredAiResponseViolation(
  value: unknown,
  context: RecommendationRequest,
): AiValidationFailure | null {
  if (!isRecord(value) || !isRecord(value.recipe)) return "MISSING_RECIPE";
  const recipe = value.recipe;
  const selection = context.selection;
  if (
    recipe.brewMode !== selection.mode ||
    (recipe.brewVariant ?? null) !== selection.variant
  ) return "MODE_LOCK";
  if (
    !same(recipe.dripper, selection.brewer) ||
    !same(recipe.grinder, selection.grinder)
  ) return "EQUIPMENT_LOCK";
  if (
    selection.grinder &&
    recipe.grindSetting !== context.rule.recipe.grindSetting
  ) return "GRIND_LOCK";
  if (
    selection.mode === "espresso" &&
    recipe.coffeeGrams !== selection.espressoDoseGrams
  ) return "ESPRESSO_DOSE_LOCK";
  if (
    !inside(ratio(recipe.ratio), context.rule.allowedRanges.ratioDenominator)
  ) return "RATIO_RANGE";
  const parameterFailures = [
    ["waterTemperatureC", "WATER_TEMPERATURE_RANGE"],
    ["coffeeGrams", "COFFEE_RANGE"],
    ["waterGrams", "WATER_RANGE"],
    ["iceGrams", "ICE_RANGE"],
    ["beverageGrams", "BEVERAGE_RANGE"],
    ["totalTimeSeconds", "TIME_RANGE"],
  ] as const;
  for (const [key, failure] of parameterFailures) {
    const range = context.rule.allowedRanges[key];
    const actual = recipe[key];
    if (range === null ? actual != null : !inside(actual, range)) {
      return failure;
    }
  }
  if (!consistentMass(recipe, selection.mode)) return "MASS_CONSISTENCY";
  if (!validBrewSteps(value.pourPlan, recipe, selection.mode)) {
    return "BREW_STEPS";
  }
  return null;
}

function validBrewSteps(
  value: unknown,
  recipe: Record<string, unknown>,
  mode: RecommendationRequest["selection"]["mode"],
) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    return false;
  }
  let previousStart = -1;
  const targets = new Map<string, number[]>();

  for (const raw of value) {
    if (!hasExactly(raw, stepKeys) || !text(raw.label) || !text(raw.action)) {
      return false;
    }
    if (
      !finite(raw.startSeconds) || raw.startSeconds < 0 ||
      raw.startSeconds < previousStart
    ) return false;
    if (
      raw.endSeconds !== null &&
      (!finite(raw.endSeconds) || raw.endSeconds < raw.startSeconds)
    ) return false;
    if (
      !targetTypes.includes(
        raw.targetType as typeof targetTypes[number],
      )
    ) return false;
    if (
      raw.targetType === "none"
        ? raw.targetGrams !== null
        : !finite(raw.targetGrams) || raw.targetGrams <= 0
    ) return false;
    previousStart = raw.startSeconds;
    if (raw.targetType !== "none") {
      const values = targets.get(String(raw.targetType)) ?? [];
      values.push(raw.targetGrams as number);
      targets.set(String(raw.targetType), values);
    }
  }

  const allowed = mode === "espresso"
    ? new Set(["beverage", "none"])
    : mode === "hot_pourover"
    ? new Set(["water", "none"])
    : new Set(["water", "ice", "none"]);
  if ([...targets.keys()].some((key) => !allowed.has(key))) return false;
  if (
    (mode === "cold_brew" || mode === "espresso") &&
    value.some((step) =>
      isRecord(step) && /绕圈|闷蒸|分段注水/.test(String(step.action))
    )
  ) return false;

  return finalTargetMatches(targets.get("water"), recipe.waterGrams) &&
    finalTargetMatches(targets.get("ice"), recipe.iceGrams) &&
    finalTargetMatches(targets.get("beverage"), recipe.beverageGrams);
}

function finalTargetMatches(values: number[] | undefined, expected: unknown) {
  if (expected === null || expected === undefined) return values === undefined;
  if (!finite(expected) || !values || values.length === 0) return false;
  return values.every((value, index) =>
    index === 0 || value >= values[index - 1]
  ) && Math.abs(values[values.length - 1] - expected) <= 0.1;
}

function recordWithOnly(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return isRecord(value) &&
    Object.keys(value).every((key) => keys.includes(key));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function same(value: unknown, expected: string) {
  return typeof value === "string" &&
    value.trim().toLowerCase() === expected.trim().toLowerCase();
}
function consistentMass(
  recipe: Record<string, unknown>,
  mode: RecommendationRequest["selection"]["mode"],
) {
  const coffee = recipe.coffeeGrams;
  const denominator = ratio(recipe.ratio);
  if (!finite(coffee) || !finite(denominator)) return false;
  const output = mode === "espresso"
    ? recipe.beverageGrams
    : mode === "iced_pourover"
    ? finite(recipe.waterGrams) && finite(recipe.iceGrams)
      ? recipe.waterGrams + recipe.iceGrams
      : null
    : recipe.waterGrams;
  return finite(output) && Math.abs(output / coffee - denominator) <= 0.15;
}

function ratio(value: unknown) {
  const match = typeof value === "string"
    ? value.match(/^1\s*:\s*(\d+(?:\.\d+)?)$/)
    : null;
  return match ? Number(match[1]) : null;
}
function inside(value: unknown, range: unknown) {
  return finite(value) && isRecord(range) && finite(range.min) &&
    finite(range.max) && value >= range.min && value <= range.max;
}
