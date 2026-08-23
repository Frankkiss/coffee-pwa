import { requireUser, type RequireUserResult } from "../_shared/auth.ts";
import { consumeRateLimit } from "../_shared/rateLimit.ts";
import {
  isBoundedRecommendationRequest,
  type RecommendationRequest,
  validateStructuredAiResponse,
} from "./contract.ts";
import { buildBoundedPrompt } from "./prompt.ts";

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
const deepSeekTimeoutMs = 90_000;

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

  if (!isBoundedRecommendationRequest(payload)) {
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
                "你是谨慎的咖啡配方优化助手。规则层已经确定基础配方；你只能在请求给定边界内优化，并且必须只输出 JSON。",
            },
            {
              role: "user",
              content: [{ type: "text", text: buildBoundedPrompt(payload) }],
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
    const parsed = parseStructuredRecommendation(suggestion);
    const structured = validateStructuredAiResponse(parsed, payload);
    if (!structured) {
      return finish(
        jsonResponse({
          configured: true,
          suggestion,
          structured: null,
          error: "AI_BOUNDARY_VIOLATION",
        }),
      );
    }

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function aiErrorResponse(
  error: "AI_TIMEOUT" | "AI_UPSTREAM_ERROR" | "AI_BOUNDARY_VIOLATION",
) {
  return jsonResponse({
    configured: true,
    suggestion: null,
    structured: null,
    error,
  });
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
