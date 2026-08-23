import { assertEquals } from "jsr:@std/assert@1";
import {
  isBoundedRecommendationRequest,
  validateStructuredAiResponse,
} from "./contract.ts";

const request = {
  version: 2,
  targetBean: { id: "bean", name: "豆" },
  selection: {
    mode: "espresso",
    variant: null,
    brewer: "Flair 58",
    grinder: "C40",
    espressoDoseGrams: 18,
  },
  rule: {
    recipe: { grindSetting: "8" },
    allowedRanges: {
      ratioDenominator: { min: 1.5, max: 3 },
      waterTemperatureC: { min: 85, max: 96 },
      coffeeGrams: { min: 18, max: 18 },
      waterGrams: null,
      iceGrams: null,
      beverageGrams: { min: 27, max: 54 },
      totalTimeSeconds: { min: 20, max: 40 },
    },
    confidence: "high",
    baseSource: {},
    reasons: {},
  },
  references: [],
  templates: { selected: null, alternatives: [] },
  tasteGoals: [],
};

Deno.test("bounded contract rejects extra request keys and out-of-range recipes", () => {
  assertEquals(isBoundedRecommendationRequest(request), true);
  assertEquals(
    isBoundedRecommendationRequest({ ...request, remaining_grams: 20 }),
    false,
  );
  const recipe = {
    brewMode: "espresso",
    brewVariant: null,
    dripper: "Flair 58",
    grinder: "C40",
    grindSetting: "8",
    waterTemperatureC: 92,
    coffeeGrams: 18,
    waterGrams: null,
    iceGrams: null,
    beverageGrams: 36,
    ratio: "1:2",
    totalTimeSeconds: 28,
  };
  assertEquals(
    validateStructuredAiResponse({ recipe }, request as never) !== null,
    true,
  );
  assertEquals(
    validateStructuredAiResponse(
      { recipe: { ...recipe, ratio: "1:4" } },
      request as never,
    ),
    null,
  );
  assertEquals(
    validateStructuredAiResponse(
      { recipe: { ...recipe, beverageGrams: 54 } },
      request as never,
    ),
    null,
  );
});
