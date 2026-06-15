type RecommendationRequest = {
  targetBean: unknown
  primaryRecommendation: unknown
  references: unknown[]
  templateCandidates?: unknown[]
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      { configured: false, suggestion: null, structured: null, error: 'Method not allowed' },
      405,
    )
  }

  const apiKey = Deno.env.get('DEEPSEEK_API_KEY')

  if (!apiKey) {
    return jsonResponse({ configured: false, suggestion: null, structured: null })
  }

  let payload: RecommendationRequest

  try {
    payload = await request.json()
  } catch {
    return jsonResponse(
      { configured: true, suggestion: null, structured: null, error: 'Invalid JSON body' },
      400,
    )
  }

  try {
    const deepseekResponse = await fetch(
      'https://api.deepseek.com/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-v4-pro',
          messages: [
            {
              role: 'system',
              content:
                '你是一个谨慎的手冲咖啡助手。只能基于用户提供的豆子信息、拼配组成、候选冲煮模板、规则推荐参数和历史记录给建议，不要编造不存在的设备、数据或冲煮方法。必须只输出 JSON，不要输出 Markdown。',
            },
            {
              role: 'user',
              content: buildPrompt(payload),
            },
          ],
          stream: false,
        }),
      },
    )

    if (!deepseekResponse.ok) {
      return jsonResponse({
        configured: true,
        suggestion: null,
        structured: null,
        error: `DeepSeek request failed: ${deepseekResponse.status}`,
      })
    }

    const data = await deepseekResponse.json()
    const suggestion =
      data?.choices?.[0]?.message?.content ??
      'AI 已返回结果，但没有可显示的建议文本。'
    const structured = parseStructuredRecommendation(suggestion)

    return jsonResponse({ configured: true, suggestion, structured })
  } catch {
    return jsonResponse({
      configured: true,
      suggestion: null,
      structured: null,
      error: 'DeepSeek request failed',
    })
  }
})

function buildPrompt(payload: RecommendationRequest) {
  return [
    '请基于以下 JSON 生成第一杯冲煮建议，并且只返回一个 JSON 对象。',
    'JSON schema:',
    JSON.stringify(
      {
        summary: '一句话总结推荐方案',
        recipe: {
          method: '手冲或冷萃等方法',
          dripper: '器具名称',
          grindSetting: '研磨建议',
          waterTemperatureC: 92,
          coffeeGrams: 15,
          waterGrams: 240,
          ratio: '1:16',
          totalTimeSeconds: 150,
        },
        pourPlan: [
          {
            label: '闷蒸',
            time: '0:00-0:30',
            waterGrams: 30,
            action: '轻柔绕圈注水',
          },
        ],
        adjustments: ['偏酸时升高水温 1°C 或略微磨细'],
        reasons: ['基于模板和豆子信息的理由'],
        riskNotes: ['不确定信息或需要实测校正的点'],
        rawText: '完整中文建议原文',
      },
      null,
      2,
    ),
    '要求：',
    '1. 必须先从 templateCandidates 中选择 1 个模板作为基础，并写出模板名。',
    '2. 不要创造 templateCandidates 之外的新冲煮方法；可以只微调粉量、水量、粉水比、水温、研磨、分段时间和注水解释。',
    '3. 先给出最终建议参数和分段注水步骤。',
    '4. 解释为什么这个模板适合这支豆子，以及你做了哪些微调。',
    '5. 如果 targetBean.bean_type 是 blend，请明确说明它是拼配豆，并结合 blend_components、上方多个产地/处理法/品种或 blend_notes 解释如何平衡甜感、香气和酸质。',
    '6. 拼配比例未知时，不要猜测哪支豆子是主体；把已知组成视为共同影响风味的线索。只有 percentage 明确存在时，才按比例判断主次。',
    '7. 给出偏酸、偏苦、口感薄、口感重时的下一次调整方向。',
    '8. 如果 templateCandidates 为空，明确说明缺少模板上下文，并只基于历史规则参数给保守建议。',
    '9. 字段缺失时使用 null 或空数组，不要编造。',
    '10. 不要输出 JSON 以外的任何文字。',
    JSON.stringify(payload, null, 2),
  ].join('\n')
}

function parseStructuredRecommendation(content: unknown) {
  if (typeof content !== 'string') {
    return null
  }

  const jsonText = extractJsonText(content)

  if (!jsonText) {
    return null
  }

  try {
    const parsed = JSON.parse(jsonText)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ...parsed, rawText: typeof parsed.rawText === 'string' ? parsed.rawText : content }
      : null
  } catch {
    return null
  }
}

function extractJsonText(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)

  if (fenced?.[1]) {
    return fenced[1].trim()
  }

  const firstBrace = content.indexOf('{')
  const lastBrace = content.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return ''
  }

  return content.slice(firstBrace, lastBrace + 1).trim()
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}
