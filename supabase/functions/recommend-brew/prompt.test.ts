import { assertStringIncludes } from "jsr:@std/assert@1";
import { buildBoundedPrompt } from "./prompt.ts";

const base = {
  version: 2,
  targetBean: { id: "bean", name: "豆" },
  selection: {
    mode: "hot_pourover",
    variant: null,
    brewer: "V60",
    grinder: "C40",
    espressoDoseGrams: null,
  },
  rule: {
    recipe: {},
    allowedRanges: {},
    confidence: "low",
    baseSource: {},
    reasons: {},
  },
  references: [],
  templates: { selected: null, alternatives: [] },
  tasteGoals: [],
} as never;

Deno.test("prompt defines typed steps and all four mode boundaries", () => {
  const prompt = buildBoundedPrompt(base);
  assertStringIncludes(prompt, "targetType");
  assertStringIncludes(prompt, "hot_pourover");
  assertStringIncludes(prompt, "iced_pourover");
  assertStringIncludes(prompt, "cold_brew");
  assertStringIncludes(prompt, "espresso");
  assertStringIncludes(prompt, "原始反馈");
  assertStringIncludes(prompt, "禁止反复复述输入");
  assertStringIncludes(prompt, "优先完成最终 JSON");
  assertStringIncludes(prompt, "冰手冲粉水比只计算热水，不包含冰量");
});
