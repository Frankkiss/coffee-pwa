import type { Bean } from '../beans/beanTypes'
import type { BrewLog } from '../brews/brewTypes'
import { brewTemplates } from '../brewTemplates/brewTemplates'
import type { BrewTemplate } from '../brewTemplates/brewTemplateTypes'
import { generateMethodAwareRuleRecommendation } from './methodAwareRuleRecommendation'
import type { RecommendationContext } from './recommendationContext'
import type { RuleRecommendationResult } from './recommendationTypes'

export function generateRuleRecommendation(
  context: RecommendationContext,
  beans: Bean[],
  brewLogs: BrewLog[],
  templates: BrewTemplate[] = brewTemplates,
): RuleRecommendationResult | null {
  return generateMethodAwareRuleRecommendation(context, beans, brewLogs, templates)
}
