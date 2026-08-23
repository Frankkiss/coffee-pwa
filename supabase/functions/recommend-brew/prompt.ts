import type { RecommendationRequest } from "./contract.ts";

export function buildBoundedPrompt(payload: RecommendationRequest) {
  return [
    "规则层已经选择了基础来源并完成确定性配方。请只在 allowedRanges 内优化参数、步骤和中文解释。",
    "不得改变 brewMode、brewVariant、brewer、grinder 或意式 espressoDoseGrams；不得创造磨豆机刻度、器具、压力参数或跨方式引用。",
    "必须只返回 JSON，不要返回 Markdown。recipe 必须完整复述所有锁定字段。",
    "输出字段：summary；recipe；pourPlan；adjustments（规则配方与 AI 修改差异）；reasons；riskNotes；rawText。",
    "adjustments 还应覆盖偏酸、偏苦、偏涩、过淡和过重时的下一杯调整。缺失信息写入 riskNotes，不得猜测。",
    JSON.stringify({
      summary: "一句话总结",
      recipe: {
        method: "中文方式名",
        brewMode: payload.selection.mode,
        brewVariant: payload.selection.variant,
        dripper: payload.selection.brewer,
        grinder: payload.selection.grinder,
        grindSetting: payload.rule.recipe.grindSetting ?? null,
        waterTemperatureC: 92,
        coffeeGrams: 15,
        waterGrams: 240,
        iceGrams: null,
        beverageGrams: null,
        ratio: "1:16",
        totalTimeSeconds: 150,
      },
      pourPlan: [{
        label: "阶段",
        time: "0:00-0:30",
        waterGrams: 30,
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
