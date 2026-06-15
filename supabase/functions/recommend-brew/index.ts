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
    return jsonResponse({ configured: false, suggestion: null, error: 'Method not allowed' }, 405)
  }

  const apiKey = Deno.env.get('DEEPSEEK_API_KEY')

  if (!apiKey) {
    return jsonResponse({ configured: false, suggestion: null })
  }

  let payload: RecommendationRequest

  try {
    payload = await request.json()
  } catch {
    return jsonResponse(
      { configured: true, suggestion: null, error: 'Invalid JSON body' },
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
                '你是一个谨慎的手冲咖啡助手。只能基于用户提供的豆子信息、候选冲煮模板、规则推荐参数和历史记录给建议，不要编造不存在的设备、数据或冲煮方法。输出中文，简洁、可执行。',
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
        error: `DeepSeek request failed: ${deepseekResponse.status}`,
      })
    }

    const data = await deepseekResponse.json()
    const suggestion =
      data?.choices?.[0]?.message?.content ??
      'AI 已返回结果，但没有可显示的建议文本。'

    return jsonResponse({ configured: true, suggestion })
  } catch {
    return jsonResponse({
      configured: true,
      suggestion: null,
      error: 'DeepSeek request failed',
    })
  }
})

function buildPrompt(payload: RecommendationRequest) {
  return [
    '请基于以下 JSON 生成第一杯手冲建议。',
    '要求：',
    '1. 必须先从 templateCandidates 中选择 1 个模板作为基础，并写出模板名。',
    '2. 不要创造 templateCandidates 之外的新冲煮方法；可以只微调粉量、水量、粉水比、水温、研磨、分段时间和注水解释。',
    '3. 先给出最终建议参数和分段注水步骤。',
    '4. 解释为什么这个模板适合这支豆子，以及你做了哪些微调。',
    '5. 给出偏酸、偏苦、口感薄、口感重时的下一次调整方向。',
    '6. 如果 templateCandidates 为空，明确说明缺少模板上下文，并只基于历史规则参数给保守建议。',
    '7. 不要输出超出 JSON 的虚构事实。',
    JSON.stringify(payload, null, 2),
  ].join('\n')
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
