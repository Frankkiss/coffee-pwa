import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  handleRecommendBrewRequest,
  type RecommendBrewDependencies,
} from "./index.ts";

const verifiedAuth = {
  ok: true as const,
  user: { id: "123e4567-e89b-12d3-a456-426614174000" } as never,
  client: {
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
};

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    targetBean: { id: "bean-1", name: "测试豆" },
    selection: {
      mode: "hot_pourover",
      variant: null,
      brewer: "V60",
      grinder: "C40",
      espressoDoseGrams: null,
    },
    rule: {
      recipe: {
        brewMode: "hot_pourover",
        brewVariant: null,
        dripper: "V60",
        grinder: "C40",
        grindSetting: "24",
      },
      allowedRanges: {
        ratioDenominator: { min: 14, max: 18 },
        waterTemperatureC: { min: 84, max: 96 },
        coffeeGrams: { min: 15, max: 15 },
        waterGrams: { min: 210, max: 270 },
        iceGrams: null,
        beverageGrams: null,
        totalTimeSeconds: { min: 90, max: 300 },
      },
      confidence: "high",
      baseSource: { type: "history", label: "测试豆", brewLogId: "brew-1" },
      reasons: { bean: [], feedback: [], freshness: [] },
    },
    references: [],
    templates: { selected: null, alternatives: [] },
    tasteGoals: [],
    ...overrides,
  };
}

function request(body: unknown, headers: HeadersInit = {}) {
  return new Request("http://localhost/recommend-brew", {
    method: "POST",
    headers: {
      Authorization: "Bearer secret-bearer-token",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function dependencies(
  overrides: Partial<RecommendBrewDependencies> = {},
): RecommendBrewDependencies {
  return {
    getApiKey: () => "deepseek-secret",
    requireUser: () => Promise.resolve(verifiedAuth),
    consumeRateLimit: () => Promise.resolve(null),
    fetch: () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"summary":"ok"}' } }],
          }),
          { status: 200 },
        ),
      ),
    setTimeout: (callback) => globalThis.setTimeout(callback, 30_000),
    clearTimeout: (timer) =>
      globalThis.clearTimeout(
        timer as ReturnType<typeof globalThis.setTimeout>,
      ),
    now: () => 100,
    randomUUID: () => "request-id",
    log: () => undefined,
    ...overrides,
  };
}

Deno.test("recommend-brew uses the shared vision model with a text-only request", async () => {
  let upstreamBody: Record<string, unknown> = {};
  const response = await handleRecommendBrewRequest(
    request(validBody()),
    dependencies({
      fetch: (_input, init) => {
        upstreamBody = JSON.parse(String(init?.body));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"summary":"ok"}' } }],
            }),
            { status: 200 },
          ),
        );
      },
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(upstreamBody?.model, "deepseek-v4-flash-vision-exp");
  const messages = upstreamBody?.messages as Array<{
    role: string;
    content: unknown;
  }>;
  assertEquals(messages.length, 2);
  assertEquals(messages[0].role, "system");
  assertEquals(typeof messages[0].content, "string");
  assertEquals(messages[1].role, "user");
  assertEquals(Array.isArray(messages[1].content), true);
  const userContent = messages[1].content as Array<Record<string, unknown>>;
  assertEquals(userContent.length, 1);
  assertEquals(userContent[0].type, "text");
  assertEquals(typeof userContent[0].text, "string");
  assertEquals(userContent.some((block) => block.type === "image_url"), false);
  assertStringIncludes(String(userContent[0].text), "规则层已经选择了基础来源");
  assertStringIncludes(String(userContent[0].text), "不得改变 brewMode");
  assertEquals(String(userContent[0].text).includes("blend_components"), false);
  assertEquals(String(userContent[0].text).includes("自行选择"), false);
});
Deno.test("recommend-brew rejects unauthenticated calls before rate limiting or parsing", async () => {
  let rateLimitCalled = false;
  let fetched = false;
  const response = await handleRecommendBrewRequest(
    request(validBody()),
    dependencies({
      requireUser: () =>
        Promise.resolve({
          ok: false,
          response: new Response(JSON.stringify({ error: "AUTH_REQUIRED" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }),
        }),
      consumeRateLimit: () => {
        rateLimitCalled = true;
        return Promise.resolve(null);
      },
      fetch: () => {
        fetched = true;
        return Promise.reject(new Error("must not fetch"));
      },
    }),
  );

  assertEquals(response.status, 401);
  assertEquals((await response.json()).error, "AUTH_REQUIRED");
  assertEquals(rateLimitCalled, false);
  assertEquals(fetched, false);
});

Deno.test("recommend-brew returns the authenticated rate-limit response before parsing", async () => {
  const response = await handleRecommendBrewRequest(
    new Request("http://localhost/recommend-brew", {
      method: "POST",
      headers: { Authorization: "Bearer secret-bearer-token" },
      body: "not-json",
    }),
    dependencies({
      consumeRateLimit: () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
            status: 429,
            headers: { "Retry-After": "12" },
          }),
        ),
    }),
  );

  assertEquals(response.status, 429);
  assertEquals(response.headers.get("Retry-After"), "12");
  assertEquals((await response.json()).error, "RATE_LIMITED");
});

Deno.test("recommend-brew rejects declared and streamed bodies over 262144 bytes", async () => {
  const declared = await handleRecommendBrewRequest(
    request(validBody(), { "Content-Length": "262145" }),
    dependencies(),
  );
  assertEquals(declared.status, 413);
  assertEquals((await declared.json()).error, "RECOMMENDATION_BODY_TOO_LARGE");

  const streamed = new Request("http://localhost/recommend-brew", {
    method: "POST",
    headers: { Authorization: "Bearer secret-bearer-token" },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(262_145));
        controller.close();
      },
    }),
  });
  const actual = await handleRecommendBrewRequest(streamed, dependencies());
  assertEquals(actual.status, 413);
  assertEquals((await actual.json()).error, "RECOMMENDATION_BODY_TOO_LARGE");
});

Deno.test("recommend-brew rejects malformed JSON and invalid recommendation shapes", async () => {
  const malformed = await handleRecommendBrewRequest(
    new Request("http://localhost/recommend-brew", {
      method: "POST",
      headers: { Authorization: "Bearer secret-bearer-token" },
      body: "{",
    }),
    dependencies(),
  );
  assertEquals(malformed.status, 400);
  assertEquals((await malformed.json()).error, "INVALID_RECOMMENDATION_INPUT");

  for (
    const invalid of [
      null,
      { references: [] },
      validBody({ targetBean: [] }),
      validBody({ targetBean: {} }),
      validBody({
        targetBean: { id: "bean", name: "豆", source_url: "private" },
      }),
      validBody({ selection: { mode: "espresso" } }),
      validBody({ references: "not-an-array" }),
      validBody({ templates: { selected: null, alternatives: [{}, {}, {}] } }),
      validBody({ tasteGoals: ["甜", 7] }),
      validBody({ unexpectedPromptField: "arbitrary prompt input" }),
    ]
  ) {
    const response = await handleRecommendBrewRequest(
      request(invalid),
      dependencies(),
    );
    assertEquals(response.status, 400);
    assertEquals((await response.json()).error, "INVALID_RECOMMENDATION_INPUT");
  }
});

Deno.test("recommend-brew aborts DeepSeek after 90000ms and returns a stable timeout code", async () => {
  let timeoutDelay = 0;
  let signalWasAborted = false;
  const response = await handleRecommendBrewRequest(
    request(validBody()),
    dependencies({
      setTimeout: (callback, delay) => {
        timeoutDelay = delay;
        callback();
        return 1 as never;
      },
      clearTimeout: () => undefined,
      fetch: (_input, init) => {
        signalWasAborted = Boolean(init?.signal?.aborted);
        return Promise.reject(
          new DOMException("aborted bearer prompt upstream", "AbortError"),
        );
      },
    }),
  );

  assertEquals(timeoutDelay, 90_000);
  assertEquals(signalWasAborted, true);
  assertEquals(response.status, 200);
  assertEquals((await response.json()).error, "AI_TIMEOUT");
});

Deno.test("recommend-brew caps AI content at 50000 characters before parsing and returning", async () => {
  const content = `${"x".repeat(49_980)}{"summary":"bounded"}${
    "y".repeat(100)
  }`;
  const response = await handleRecommendBrewRequest(
    request(validBody()),
    dependencies({
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ choices: [{ message: { content } }] })),
        ),
    }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.suggestion.length, 50_000);
  assertEquals(body.structured, null);
});

Deno.test("recommend-brew bounds the upstream body before parsing JSON", async () => {
  let cancelled = false;
  const response = await handleRecommendBrewRequest(
    request(validBody()),
    dependencies({
      fetch: () =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new Uint8Array(262_145));
              },
              cancel() {
                cancelled = true;
              },
            }),
          ),
        ),
    }),
  );

  assertEquals(response.status, 200);
  assertEquals((await response.json()).error, "AI_UPSTREAM_ERROR");
  assertEquals(cancelled, true);
});

Deno.test("recommend-brew redacts secrets, prompts, and upstream bodies from responses and logs", async () => {
  const logs: string[] = [];
  const response = await handleRecommendBrewRequest(
    request(validBody({
      targetBean: { id: "bean-1", name: "PRIVATE PROMPT CONTENT" },
    })),
    dependencies({
      now: (() => {
        let current = 100;
        return () => current += 25;
      })(),
      log: (entry) => logs.push(JSON.stringify(entry)),
      fetch: () =>
        Promise.resolve(new Response("PRIVATE UPSTREAM BODY", { status: 503 })),
    }),
  );
  const responseText = await response.text();
  const combined = `${responseText}\n${logs.join("\n")}`;

  assertEquals(response.status, 200);
  assertStringIncludes(responseText, "AI_UPSTREAM_ERROR");
  assertEquals(combined.includes("secret-bearer-token"), false);
  assertEquals(combined.includes("deepseek-secret"), false);
  assertEquals(combined.includes("PRIVATE PROMPT CONTENT"), false);
  assertEquals(combined.includes("PRIVATE UPSTREAM BODY"), false);
  assertStringIncludes(combined, '"requestId":"request-id"');
  assertStringIncludes(combined, '"status":200');
  assertStringIncludes(combined, '"elapsedMs":25');
  assertEquals(logs.length, 1);
  assertEquals(Object.keys(JSON.parse(logs[0])).sort(), [
    "elapsedMs",
    "requestId",
    "status",
    "userHash",
  ]);
});
