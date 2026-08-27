import { assertEquals } from "jsr:@std/assert@1";
import {
  getStructuredAiResponseViolation,
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

const espressoSteps = [{
  label: "萃取",
  startSeconds: 0,
  endSeconds: 28,
  targetType: "beverage",
  targetGrams: 36,
  action: "在 36g 附近停止萃取",
}];

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
    validateStructuredAiResponse(
      { recipe, pourPlan: espressoSteps },
      request as never,
    ) !== null,
    true,
  );
  assertEquals(
    getStructuredAiResponseViolation(
      { recipe, pourPlan: espressoSteps },
      request as never,
    ),
    null,
  );
  assertEquals(
    getStructuredAiResponseViolation(
      { recipe: { ...recipe, grindSetting: "9" }, pourPlan: espressoSteps },
      request as never,
    ),
    "GRIND_LOCK",
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
  assertEquals(
    validateStructuredAiResponse({
      recipe,
      pourPlan: [{
        ...espressoSteps[0],
        targetType: "water",
        targetGrams: 999,
      }],
    }, request as never),
    null,
  );
  assertEquals(
    validateStructuredAiResponse({
      recipe,
      pourPlan: [{ ...espressoSteps[0], targetGrams: 54 }],
    }, request as never),
    null,
  );
  assertEquals(
    getStructuredAiResponseViolation({
      recipe,
      pourPlan: [{ ...espressoSteps[0], targetGrams: 54 }],
    }, request as never),
    "BREW_STEPS",
  );
});

Deno.test("structured contract rejects hand-pour language for cold brew", () => {
  const coldRequest = {
    ...request,
    selection: {
      mode: "cold_brew",
      variant: "ready_to_drink",
      brewer: "冷萃壶",
      grinder: "C40",
      espressoDoseGrams: null,
    },
    rule: {
      ...request.rule,
      recipe: { grindSetting: "中粗" },
      allowedRanges: {
        ratioDenominator: { min: 12, max: 16 },
        waterTemperatureC: { min: 4, max: 8 },
        coffeeGrams: { min: 50, max: 50 },
        waterGrams: { min: 600, max: 800 },
        iceGrams: null,
        beverageGrams: null,
        totalTimeSeconds: { min: 28_800, max: 64_800 },
      },
    },
  };
  const coldRecipe = {
    brewMode: "cold_brew",
    brewVariant: "ready_to_drink",
    dripper: "冷萃壶",
    grinder: "C40",
    grindSetting: "中粗",
    waterTemperatureC: 6,
    coffeeGrams: 50,
    waterGrams: 700,
    iceGrams: null,
    beverageGrams: null,
    ratio: "1:14",
    totalTimeSeconds: 43_200,
  };

  assertEquals(
    validateStructuredAiResponse({
      recipe: coldRecipe,
      pourPlan: [{
        label: "主注水",
        startSeconds: 0,
        endSeconds: 60,
        targetType: "water",
        targetGrams: 700,
        action: "绕圈注水至 700g",
      }],
    }, coldRequest as never),
    null,
  );
});
