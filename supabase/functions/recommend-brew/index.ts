import { requireUser, type RequireUserResult } from "../_shared/auth.ts";
import { consumeRateLimit } from "../_shared/rateLimit.ts";

type RecommendationRequest = {
  targetBean: Record<string, unknown>;
  primaryRecommendation: unknown;
  finalRuleRecommendation?: unknown;
  confidence?: unknown;
  baseSource?: unknown;
  beanAdjustmentReasons?: string[];
  references: Record<string, unknown>[];
  templateCandidates?: Record<string, unknown>[];
};

type SecurityLogEntry = {
  requestId: string;
  status: number;
  elapsedMs: number;
  userHash: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const maxRequestBodyBytes = 262_144;
const maxDeepSeekResponseBytes = 262_144;
const maxAiTextCharacters = 50_000;
const deepSeekTimeoutMs = 30_000;

export type RecommendBrewDependencies = {
  getApiKey: () => string | undefined;
  requireUser: (request: Request) => Promise<RequireUserResult>;
  consumeRateLimit: typeof consumeRateLimit;
  fetch: typeof fetch;
  setTimeout: (callback: () => void, delay: number) => unknown;
  clearTimeout: (timer: unknown) => void;
  now: () => number;
  randomUUID: () => string;
  log: (entry: SecurityLogEntry) => void;
};

const defaultDependencies: RecommendBrewDependencies = {
  getApiKey: () => Deno.env.get("DEEPSEEK_VISION_API_KEY"),
  requireUser,
  consumeRateLimit,
  fetch,
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (timer) =>
    globalThis.clearTimeout(timer as ReturnType<typeof globalThis.setTimeout>),
  now: () => Date.now(),
  randomUUID: () => crypto.randomUUID(),
  log: (entry) => console.info(JSON.stringify(entry)),
};

export async function handleRecommendBrewRequest(
  request: Request,
  dependencies: RecommendBrewDependencies = defaultDependencies,
) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        configured: false,
        suggestion: null,
        structured: null,
        error: "METHOD_NOT_ALLOWED",
      },
      405,
    );
  }

  const requestId = dependencies.randomUUID();
  const startedAt = dependencies.now();
  const authentication = await dependencies.requireUser(request);
  if (!authentication.ok) {
    return withCors(authentication.response);
  }

  const userHash = await hashUserId(authentication.user.id);
  const finish = (response: Response) => {
    dependencies.log({
      requestId,
      status: response.status,
      elapsedMs: Math.max(0, dependencies.now() - startedAt),
      userHash,
    });
    const headers = new Headers(response.headers);
    headers.set("X-Request-Id", requestId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  const rateLimitResponse = await dependencies.consumeRateLimit(
    "recommend-brew",
    authentication.client,
  );
  if (rateLimitResponse) {
    return finish(withCors(rateLimitResponse));
  }

  let payload: RecommendationRequest;
  try {
    payload = await readBoundedRecommendationBody(request);
  } catch (error) {
    if (error instanceof RecommendationBodyTooLargeError) {
      return finish(jsonResponse({
        configured: true,
        suggestion: null,
        structured: null,
        error: "RECOMMENDATION_BODY_TOO_LARGE",
      }, 413));
    }
    return finish(invalidInputResponse());
  }

  if (!isRecommendationRequest(payload)) {
    return finish(invalidInputResponse());
  }

  const apiKey = dependencies.getApiKey();
  if (!apiKey) {
    return finish(jsonResponse({
      configured: false,
      suggestion: null,
      structured: null,
    }));
  }

  const controller = new AbortController();
  const timeout = dependencies.setTimeout(
    () => controller.abort(),
    deepSeekTimeoutMs,
  );

  try {
    const deepSeekResponse = await dependencies.fetch(
      "https://api.deepseek.com/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-v4-flash-vision-exp",
          messages: [
            {
              role: "system",
              content:
                "你是一个谨慎的手冲咖啡助手。只能基于用户提供的豆子信息、拼配组成、候选冲煮模板、规则推荐参数和历史记录给建议，不要编造不存在的设备、数据或冲煮方法。必须只输出 JSON，不要输出 Markdown。",
            },
            {
              role: "user",
              content: buildPrompt(payload),
            },
          ],
          response_format: { type: "json_object" },
          stream: false,
        }),
        signal: controller.signal,
      },
    );

    if (!deepSeekResponse.ok) {
      return finish(aiErrorResponse("AI_UPSTREAM_ERROR"));
    }

    const data = await readBoundedJsonResponse(deepSeekResponse);
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return finish(aiErrorResponse("AI_UPSTREAM_ERROR"));
    }

    const suggestion = content.slice(0, maxAiTextCharacters);
    const structured = parseStructuredRecommendation(suggestion);

    return finish(jsonResponse({ configured: true, suggestion, structured }));
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      return finish(aiErrorResponse("AI_TIMEOUT"));
    }
    return finish(aiErrorResponse("AI_UPSTREAM_ERROR"));
  } finally {
    dependencies.clearTimeout(timeout);
  }
}

class RecommendationBodyTooLargeError extends Error {}
class DeepSeekResponseTooLargeError extends Error {}

async function readBoundedRecommendationBody(
  request: Request,
): Promise<RecommendationRequest> {
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isInteger(parsedLength) || parsedLength < 0) {
      throw new SyntaxError("invalid content length");
    }
    if (parsedLength > maxRequestBodyBytes) {
      throw new RecommendationBodyTooLargeError();
    }
  }
  if (!request.body) throw new SyntaxError("missing body");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > maxRequestBodyBytes) {
        await reader.cancel();
        throw new RecommendationBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteCount);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function isRecommendationRequest(
  value: unknown,
): value is RecommendationRequest {
  if (!isRecord(value)) return false;
  const allowedKeys = new Set([
    "targetBean",
    "primaryRecommendation",
    "finalRuleRecommendation",
    "confidence",
    "baseSource",
    "beanAdjustmentReasons",
    "references",
    "templateCandidates",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return false;
  if (
    !isRecord(value.targetBean) ||
    !isNonEmptyString(value.targetBean.id) ||
    !isNonEmptyString(value.targetBean.name)
  ) return false;
  if (!Object.prototype.hasOwnProperty.call(value, "primaryRecommendation")) {
    return false;
  }
  if (
    value.primaryRecommendation !== null &&
    !isRecord(value.primaryRecommendation)
  ) return false;
  if (
    value.finalRuleRecommendation !== undefined &&
    !isRecord(value.finalRuleRecommendation)
  ) return false;
  if (
    value.confidence !== undefined &&
    value.confidence !== "high" &&
    value.confidence !== "medium" &&
    value.confidence !== "low"
  ) return false;
  if (value.baseSource !== undefined && !isBaseSource(value.baseSource)) {
    return false;
  }
  if (!isRecordArray(value.references)) return false;
  if (
    value.templateCandidates !== undefined &&
    !isRecordArray(value.templateCandidates)
  ) return false;
  if (
    value.beanAdjustmentReasons !== undefined &&
    (!Array.isArray(value.beanAdjustmentReasons) ||
      !value.beanAdjustmentReasons.every((item) => typeof item === "string"))
  ) return false;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBaseSource(value: unknown) {
  if (!isRecord(value) || !isNonEmptyString(value.label)) return false;
  if (value.type === "history") return isNonEmptyString(value.brewLogId);
  if (value.type === "template") return isNonEmptyString(value.templateId);
  return false;
}

async function readBoundedJsonResponse(response: Response) {
  const declaredLength = response.headers.get("Content-Length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (
      !Number.isInteger(parsedLength) || parsedLength < 0 ||
      parsedLength > maxDeepSeekResponseBytes
    ) {
      throw new DeepSeekResponseTooLargeError();
    }
  }
  if (!response.body) throw new SyntaxError("missing upstream body");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteCount = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > maxDeepSeekResponseBytes) {
        await reader.cancel();
        throw new DeepSeekResponseTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteCount);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function hashUserId(userId: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(userId),
  );
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function invalidInputResponse() {
  return jsonResponse({
    configured: true,
    suggestion: null,
    structured: null,
    error: "INVALID_RECOMMENDATION_INPUT",
  }, 400);
}

function aiErrorResponse(error: "AI_TIMEOUT" | "AI_UPSTREAM_ERROR") {
  return jsonResponse({
    configured: true,
    suggestion: null,
    structured: null,
    error,
  });
}

function buildPrompt(payload: RecommendationRequest) {
  return [
    "请基于以下 JSON 生成第一杯冲煮建议，并且只返回一个 JSON 对象。",
    "JSON schema:",
    JSON.stringify(
      {
        summary: "一句话总结推荐方案",
        recipe: {
          method: "手冲或冷萃等方法",
          dripper: "器具名称",
          grindSetting: "研磨建议",
          waterTemperatureC: 92,
          coffeeGrams: 15,
          waterGrams: 240,
          ratio: "1:16",
          totalTimeSeconds: 150,
        },
        pourPlan: [
          {
            label: "闷蒸",
            time: "0:00-0:30",
            waterGrams: 30,
            action: "轻柔绕圈注水",
          },
        ],
        adjustments: ["偏酸时升高水温 1°C 或略微磨细"],
        reasons: ["基于模板和豆子信息的理由"],
        riskNotes: ["不确定信息或需要实测校正的点"],
        rawText: "完整中文建议原文",
      },
      null,
      2,
    ),
    "要求：",
    "1. 必须先从 templateCandidates 中选择 1 个模板作为基础，并写出模板名。",
    "2. 不要创造 templateCandidates 之外的新冲煮方法；可以只微调粉量、水量、粉水比、水温、研磨、分段时间和注水解释。",
    "3. 先给出最终建议参数和分段注水步骤。",
    "4. 解释为什么这个模板适合这支豆子，以及你做了哪些微调。",
    "5. 如果 targetBean.bean_type 是 blend，请明确说明它是拼配豆，并结合 blend_components、上方多个产地/处理法/品种或 blend_notes 解释如何平衡甜感、香气和酸质。",
    "6. 拼配比例未知时，不要猜测哪支豆子是主体；把已知组成视为共同影响风味的线索。只有 percentage 明确存在时，才按比例判断主次。",
    "7. 给出偏酸、偏苦、口感薄、口感重时的下一次调整方向。",
    "8. 如果 templateCandidates 为空，明确说明缺少模板上下文，并只基于历史规则参数给保守建议。",
    "9. 字段缺失时使用 null 或空数组，不要编造。",
    "10. 不要输出 JSON 以外的任何文字。",
    "Additional deterministic rule context:",
    "If finalRuleRecommendation exists, treat it as the deterministic base recipe. Keep its ratio, dripper, method, water temperature, grind, and total time unless you explain a small safe change.",
    "Use confidence and beanAdjustmentReasons to explain uncertainty and bean-aware micro-adjustments. Do not claim the recipe is guaranteed perfect; describe it as the first recommended brew to validate.",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function parseStructuredRecommendation(content: unknown) {
  if (typeof content !== "string") return null;
  const jsonText = extractJsonText(content);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? {
        ...parsed,
        rawText: typeof parsed.rawText === "string" ? parsed.rawText : content,
      }
      : null;
  } catch {
    return null;
  }
}

function extractJsonText(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return "";
  }
  return content.slice(firstBrace, lastBrace + 1).trim();
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

if (import.meta.main) {
  Deno.serve((request) => handleRecommendBrewRequest(request));
}
