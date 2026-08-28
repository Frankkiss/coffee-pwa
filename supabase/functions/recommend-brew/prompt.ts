import type { RecommendationRequest } from "./contract.ts";

export function buildBoundedPrompt(payload: RecommendationRequest) {
  const modeInstructions = [
    "hot_pourover：步骤只能使用 water/none；最后一个 water 目标必须等于 recipe.waterGrams。",
    "iced_pourover：冰手冲粉水比只计算热水，不包含冰量；步骤只能使用 water/ice/none；最后 water 与 ice 目标必须分别等于 recipe.waterGrams 和 recipe.iceGrams。",
    "cold_brew：使用混合、浸泡、过滤、稀释或加冰语义，不得生成闷蒸、绕圈或分段注水。",
    "espresso：步骤只能使用 beverage/none；最后 beverage 目标必须等于 recipe.beverageGrams，不得生成手冲注水。",
  ].join("\n");
  return [
    "规则层已经选择了基础来源并完成确定性配方。请只在 allowedRanges 内优化参数、步骤和中文解释。",
    "请充分但简洁地推理，禁止反复复述输入；必须优先完成最终 JSON，不要把全部输出预算用于分析。",
    "不得改变 brewMode、brewVariant、brewer、grinder 或意式 espressoDoseGrams；不得创造磨豆机刻度、器具、压力参数或跨方式引用。",
    "必须只返回 JSON，不要返回 Markdown。recipe 必须完整复述所有锁定字段。",
    "输出字段：summary；recipe；pourPlan；adjustments（规则配方与 AI 修改差异）；reasons；riskNotes；rawText。",
    "adjustments 还应覆盖偏酸、偏苦、偏涩、过淡和过重时的下一杯调整。缺失信息写入 riskNotes，不得猜测。",
    "pourPlan 的 targetGrams 是 targetType 对应的累计秤重目标；startSeconds 和 endSeconds 使用数字秒数，none 必须使用 targetGrams: null。",
    "rule.reasons.feedback 可能包含上一杯的原始反馈；结合完整语境解释，但处方修改仍不得超出 allowedRanges。",
    modeInstructions,
    JSON.stringify({
      summary: "一句话总结",
      recipe: {
        method: payload.rule.recipe.method ?? "中文方式名",
        brewMode: payload.selection.mode,
        brewVariant: payload.selection.variant,
        dripper: payload.selection.brewer,
        grinder: payload.selection.grinder,
        grindSetting: payload.rule.recipe.grindSetting ?? null,
        waterTemperatureC: payload.rule.recipe.waterTemperatureC ?? null,
        coffeeGrams: payload.rule.recipe.coffeeGrams ?? null,
        waterGrams: payload.rule.recipe.waterGrams ?? null,
        iceGrams: payload.rule.recipe.iceGrams ?? null,
        beverageGrams: payload.rule.recipe.beverageGrams ?? null,
        ratio: payload.rule.recipe.ratio ?? null,
        totalTimeSeconds: payload.rule.recipe.totalTimeSeconds ?? null,
      },
      pourPlan: [{
        label: "阶段",
        startSeconds: 0,
        endSeconds: 30,
        targetType: "water",
        targetGrams: 30,
        action: "操作",
      }],
      adjustments: ["相对规则配方的改动或未改动"],
      reasons: ["关键依据"],
      riskNotes: ["风险或缺失信息"],
      rawText: "完整中文建议",
    }),
    JSON.stringify(payload),
  ].join("\n");
}
