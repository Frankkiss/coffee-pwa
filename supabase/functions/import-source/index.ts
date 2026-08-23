import { requireUser, type RequireUserResult } from "../_shared/auth.ts";
import { consumeRateLimit } from "../_shared/rateLimit.ts";

type SourceImportImage = {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  dataUrl: string;
};

type ImportRequest = {
  pastedText?: string;
  image?: unknown;
};

type SourceDraft = {
  name: string;
  roaster: string;
  origin: string;
  farmOrStation: string;
  process: string;
  variety: string;
  altitudeMeters: number | null;
  roastDate: string;
  roastLevel: string;
  flavorTags: string[];
  flavorNotes: string;
  netWeightGrams: number | null;
  price: number | null;
  sourceUrl: string;
  beanType: "single_origin" | "blend";
  blendComponents: Array<{
    origin: string;
    process: string;
    variety: string;
    percentage: number | null;
    role: string;
    notes: string;
  }>;
  blendNotes: string;
  notes: string;
  confidence: "low" | "medium" | "high" | "";
  missingFields: string[];
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const manualSourceUrl = "manual://pasted-text";
const minTextLength = 30;
const maxPromptTextLength = 12000;
const maxRequestBodyBytes = 12 * 1024 * 1024;
const maxImageBytes = 8 * 1024 * 1024;

export type ImportSourceDependencies = {
  getApiKey: () => string | undefined;
  requireUser: (request: Request) => Promise<RequireUserResult>;
  consumeRateLimit: typeof consumeRateLimit;
  requestDeepSeekDraft: typeof requestDeepSeekDraft;
};

const defaultDependencies: ImportSourceDependencies = {
  getApiKey: () => Deno.env.get("DEEPSEEK_VISION_API_KEY"),
  requireUser,
  consumeRateLimit,
  requestDeepSeekDraft,
};

export async function handleImportSourceRequest(
  request: Request,
  dependencies: ImportSourceDependencies = defaultDependencies,
) {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        configured: false,
        draft: null,
        error: "Method not allowed",
      },
      405,
    );
  }

  const authentication = await dependencies.requireUser(request);
  if (!authentication.ok) {
    return withCors(authentication.response);
  }

  const rateLimitResponse = await dependencies.consumeRateLimit(
    "import-source",
    authentication.client,
  );
  if (rateLimitResponse) {
    return withCors(rateLimitResponse);
  }

  let payload: ImportRequest;

  try {
    payload = await readBoundedJsonBody(request);
  } catch (error) {
    if (error instanceof ImportBodyTooLargeError) {
      return jsonResponse(
        { configured: true, draft: null, error: "IMPORT_BODY_TOO_LARGE" },
        413,
      );
    }
    return jsonResponse(
      {
        configured: true,
        draft: null,
        error: "Invalid JSON body",
      },
      400,
    );
  }

  if (Object.prototype.hasOwnProperty.call(payload, "url")) {
    return jsonResponse({
      configured: true,
      sourceUrl: manualSourceUrl,
      draft: null,
      error: "SOURCE_URL_NOT_SUPPORTED",
    }, 400);
  }

  let sourceImage: SourceImportImage | null;
  try {
    sourceImage = normalizeSourceImage(payload.image);
  } catch (error) {
    const tooLarge = error instanceof SourceImageTooLargeError;
    return jsonResponse(
      {
        configured: true,
        sourceUrl: manualSourceUrl,
        draft: null,
        error: tooLarge ? "SOURCE_IMAGE_TOO_LARGE" : "INVALID_SOURCE_IMAGE",
      },
      tooLarge ? 413 : 400,
    );
  }
  const apiKey = dependencies.getApiKey();
  if (!apiKey) {
    return jsonResponse({ configured: false, draft: null });
  }

  const normalizedText = normalizePastedText(payload.pastedText);
  const sourceForResponse = manualSourceUrl;

  if (!normalizedText && !sourceImage) {
    return jsonResponse(
      {
        configured: true,
        sourceUrl: sourceForResponse,
        draft: null,
        error: "SOURCE_INPUT_REQUIRED",
      },
      400,
    );
  }

  try {
    const sourceText = normalizedText;

    if (!sourceImage && sourceText.length < minTextLength) {
      return jsonResponse({
        configured: true,
        sourceUrl: sourceForResponse,
        draft: null,
        rawTextLength: sourceText.length,
        error: "Product detail text is too short to extract bean data",
      });
    }

    const promptText = sourceText.slice(0, maxPromptTextLength);
    const draft = await dependencies.requestDeepSeekDraft(
      apiKey,
      sourceForResponse,
      promptText,
      sourceImage,
    );

    return jsonResponse({
      configured: true,
      sourceUrl: sourceForResponse,
      draft: normalizeDraft({ ...draft, sourceUrl: "" }),
      rawTextLength: promptText.length,
    });
  } catch (error) {
    return jsonResponse(
      {
        configured: true,
        sourceUrl: sourceForResponse,
        draft: null,
        error: error instanceof Error ? error.message : "Source import failed",
      },
      200,
    );
  }
}

class ImportBodyTooLargeError extends Error {}
class SourceImageTooLargeError extends Error {}

async function readBoundedJsonBody(request: Request): Promise<ImportRequest> {
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null && Number(declaredLength) > maxRequestBodyBytes) {
    throw new ImportBodyTooLargeError();
  }
  if (!request.body) {
    throw new SyntaxError("missing body");
  }

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
        throw new ImportBodyTooLargeError();
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
  return JSON.parse(new TextDecoder().decode(bytes)) as ImportRequest;
}

if (import.meta.main) {
  Deno.serve((request) => handleImportSourceRequest(request));
}

function normalizePastedText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}
function normalizeSourceImage(value: unknown): SourceImportImage | null {
  if (value === undefined) {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid source image");
  }
  const record = value as Record<string, unknown>;
  const mediaType = record.mediaType;
  const dataUrl = record.dataUrl;
  if (
    mediaType !== "image/jpeg" && mediaType !== "image/png" &&
    mediaType !== "image/webp"
  ) {
    throw new Error("invalid source image media type");
  }
  if (typeof dataUrl !== "string") {
    throw new Error("invalid source image data");
  }
  const prefix = `data:${mediaType};base64,`;
  if (!dataUrl.startsWith(prefix)) {
    throw new Error("source image media type mismatch");
  }
  const encoded = dataUrl.slice(prefix.length);
  if (
    !encoded || encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  ) {
    throw new Error("invalid source image base64");
  }
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const decodedSize = encoded.length * 3 / 4 - padding;
  if (decodedSize > maxImageBytes) {
    throw new SourceImageTooLargeError();
  }
  try {
    if (atob(encoded).length !== decodedSize) throw new Error("size mismatch");
  } catch {
    throw new Error("invalid source image base64");
  }
  return { mediaType, dataUrl };
}

export async function requestDeepSeekDraft(
  apiKey: string,
  sourceUrl: string,
  sourceText: string,
  sourceImage: SourceImportImage | null = null,
) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
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
            "你是谨慎的咖啡豆资料录入助手。只从用户主动提供的包装图片和商品详情文本中提取咖啡豆资料，不要浏览网页或编造。必须只返回 JSON，不要 Markdown。除专有名称外，所有面向用户展示的字段值都应尽量使用中文。",
        },
        {
          role: "user",
          content: [
            { type: "text", text: buildPrompt(sourceUrl, sourceText) },
            ...(sourceImage
              ? [{
                type: "image_url",
                image_url: { url: sourceImage.dataUrl, detail: "original" },
              }]
              : []),
          ],
        },
      ],
      response_format: { type: "json_object" },
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek request failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("DeepSeek response is missing content");
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new Error("DeepSeek response is not valid JSON");
  }
}

function buildPrompt(sourceUrl: string, sourceText: string) {
  return [
    "请从随附包装图片和/或以下商品详情文本中提取咖啡豆资料，返回严格 JSON。",
    "字段：name, roaster, origin, farmOrStation, process, variety, altitudeMeters, roastDate, roastLevel, flavorTags, flavorNotes, netWeightGrams, price, beanType, blendComponents, blendNotes, notes, confidence, missingFields。",
    "要求：",
    "1. 找不到的字段用空字符串、null 或空数组。",
    "2. altitudeMeters、netWeightGrams、price 如果无法确定，返回 null。",
    "3. flavorTags 返回字符串数组。",
    "4. confidence 只能是 high、medium、low。",
    "5. missingFields 写出建议用户补充的字段。",
    "6. beanType 只能是 single_origin 或 blend；如果原文出现拼配、Blend、配方豆、多产区、多处理法组合，返回 blend，否则返回 single_origin。",
    "7. blendComponents 是数组；拼配豆尽量拆出 origin, process, variety, percentage, role, notes。比例不确定必须返回 null，不能猜测比例或主次；找不到的字段用空字符串。",
    "8. blendNotes 保存原文里与拼配组成有关的说明，方便用户核对。拼配比例未知时，notes 可描述该组成可能的风味作用，但不要假设它是主体。",
    "9. 只记录包装图片或详情文字中明确出现的事实；看不清或有冲突时降低 confidence 并列入 missingFields，不要猜测。",
    "10. 如果原文是英文，请尽量翻译为自然中文后再写入字段。处理法、烘焙度、风味标签、风味描述、备注、缺失字段必须优先使用中文。",
    "11. 专有名称可以保留原文，尤其是烘焙商、庄园、处理站、品种、产品名；但常见咖啡术语要中文化，例如 Washed=水洗、Natural=日晒、Honey=蜜处理、Anaerobic=厌氧、Light Roast=浅烘、Medium Roast=中烘。",
    "12. flavorTags 使用短中文词条，例如 citrus=柑橘、honey=蜂蜜、jasmine=茉莉、berry=莓果、floral=花香、chocolate=巧克力。flavorNotes 可写成中文短句。",
    "13. missingFields 只能返回中文字段名，例如 烘焙日期、净含量、产地、处理法、品种、海拔、拼配组成。",
    `sourceUrl: ${sourceUrl}`,
    `sourceText: ${sourceText}`,
  ].join("\n");
}

function normalizeDraft(input: Record<string, unknown>): SourceDraft {
  return {
    name: stringValue(input.name),
    roaster: stringValue(input.roaster),
    origin: stringValue(input.origin),
    farmOrStation: stringValue(input.farmOrStation ?? input.farm_or_station),
    process: stringValue(input.process),
    variety: stringValue(input.variety),
    altitudeMeters: numberValue(input.altitudeMeters ?? input.altitude_meters),
    roastDate: stringValue(input.roastDate ?? input.roast_date),
    roastLevel: stringValue(input.roastLevel ?? input.roast_level),
    flavorTags: listValue(input.flavorTags ?? input.flavor_tags),
    flavorNotes: stringValue(input.flavorNotes ?? input.flavor_notes),
    netWeightGrams: numberValue(input.netWeightGrams ?? input.net_weight_grams),
    price: numberValue(input.price),
    sourceUrl: stringValue(input.sourceUrl ?? input.source_url),
    beanType: input.beanType === "blend" || input.bean_type === "blend"
      ? "blend"
      : "single_origin",
    blendComponents: blendComponentsValue(
      input.blendComponents ?? input.blend_components,
    ),
    blendNotes: stringValue(input.blendNotes ?? input.blend_notes),
    notes: stringValue(input.notes),
    confidence: confidenceValue(input.confidence),
    missingFields: listValue(input.missingFields ?? input.missing_fields),
  };
}

function stringValue(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function listValue(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
    ? value.split(/[,，、]/)
    : [];
  const normalized = values.map(stringValue).filter(Boolean);

  return Array.from(new Set(normalized));
}

function blendComponentsValue(value: unknown): SourceDraft["blendComponents"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;

      return {
        origin: stringValue(record.origin),
        process: stringValue(record.process),
        variety: stringValue(record.variety),
        percentage: numberValue(record.percentage),
        role: stringValue(record.role),
        notes: stringValue(record.notes),
      };
    })
    .filter((component): component is SourceDraft["blendComponents"][number] =>
      Boolean(
        component &&
          (component.origin ||
            component.process ||
            component.variety ||
            component.percentage !== null ||
            component.role ||
            component.notes),
      )
    );
}

function confidenceValue(value: unknown): SourceDraft["confidence"] {
  const normalized = stringValue(value).toLowerCase();

  if (
    normalized === "low" || normalized === "medium" || normalized === "high"
  ) {
    return normalized;
  }

  return "";
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
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
