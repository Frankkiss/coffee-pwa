export type NumericRange = { min: number; max: number };

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
  if (!isRecord(value) || !isRecord(value.recipe)) return null;
  const recipe = value.recipe;
  const selection = context.selection;
  if (
    recipe.brewMode !== selection.mode ||
    (recipe.brewVariant ?? null) !== selection.variant
  ) return null;
  if (
    !same(recipe.dripper, selection.brewer) ||
    !same(recipe.grinder, selection.grinder)
  ) return null;
  if (
    selection.grinder &&
    recipe.grindSetting !== context.rule.recipe.grindSetting
  ) return null;
  if (
    selection.mode === "espresso" &&
    recipe.coffeeGrams !== selection.espressoDoseGrams
  ) return null;
  if (
    !inside(ratio(recipe.ratio), context.rule.allowedRanges.ratioDenominator)
  ) return null;
  for (
    const key of [
      "waterTemperatureC",
      "coffeeGrams",
      "waterGrams",
      "iceGrams",
      "beverageGrams",
      "totalTimeSeconds",
    ]
  ) {
    const range = context.rule.allowedRanges[key];
    const actual = recipe[key];
    if (range === null ? actual != null : !inside(actual, range)) return null;
  }
  if (!consistentMass(recipe, selection.mode)) return null;
  return value;
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
