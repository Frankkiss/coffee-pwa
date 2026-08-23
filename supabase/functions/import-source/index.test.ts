import { assertEquals } from "jsr:@std/assert@1";
import { handleImportSourceRequest } from "./index.ts";

const verifiedAuth = {
  ok: true as const,
  user: { id: "user-1" } as never,
  client: {
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
};

function request(body: unknown, authorization = "Bearer valid-token") {
  return new Request("http://localhost/import-source", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

Deno.test("import-source requires authentication before reading configuration or body", async () => {
  let rateLimitCalled = false;
  const response = await handleImportSourceRequest(
    request({ pastedText: "secret" }, ""),
    {
      getApiKey: () => {
        throw new Error("must not read API key");
      },
      requireUser: () =>
        Promise.resolve({
          ok: false as const,
          response: new Response(JSON.stringify({ error: "AUTH_REQUIRED" }), {
            status: 401,
          }),
        }),
      consumeRateLimit: () => {
        rateLimitCalled = true;
        return Promise.resolve(null);
      },
      requestDeepSeekDraft: () => Promise.resolve({}),
    },
  );

  assertEquals(response.status, 401);
  assertEquals(rateLimitCalled, false);
});

Deno.test("import-source stops at the authenticated per-user rate limit", async () => {
  let bodyRead = false;
  const original = request({ pastedText: "secret" });
  const guardedRequest = new Proxy(original, {
    get(target, property, receiver) {
      if (property === "json") {
        return () => {
          bodyRead = true;
          return target.json();
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const response = await handleImportSourceRequest(guardedRequest, {
    getApiKey: () => "configured",
    requireUser: () => Promise.resolve(verifiedAuth),
    consumeRateLimit: () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
          status: 429,
        }),
      ),
    requestDeepSeekDraft: () => Promise.resolve({}),
  });

  assertEquals(response.status, 429);
  assertEquals(bodyRead, false);
});

Deno.test("import-source rejects every URL field with 400 and no external fetch path", async () => {
  let deepSeekCalled = false;
  const response = await handleImportSourceRequest(
    request({
      url: "https://public.example/coffee",
      pastedText: "valid pasted coffee details",
    }),
    {
      getApiKey: () => "configured",
      requireUser: () => Promise.resolve(verifiedAuth),
      consumeRateLimit: () => Promise.resolve(null),
      requestDeepSeekDraft: () => {
        deepSeekCalled = true;
        return Promise.resolve({});
      },
    },
  );

  assertEquals(response.status, 400);
  assertEquals((await response.json()).error, "SOURCE_URL_NOT_SUPPORTED");
  assertEquals(deepSeekCalled, false);
});

Deno.test("import-source rejects oversized request bodies before JSON parsing", async () => {
  let deepSeekCalled = false;
  const oversized = new Request("http://localhost/import-source", {
    method: "POST",
    headers: {
      Authorization: "Bearer valid-token",
      "Content-Type": "application/json",
    },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(13_000_000));
        controller.close();
      },
    }),
  });
  const response = await handleImportSourceRequest(oversized, {
    getApiKey: () => "configured",
    requireUser: () => Promise.resolve(verifiedAuth),
    consumeRateLimit: () => Promise.resolve(null),
    requestDeepSeekDraft: () => {
      deepSeekCalled = true;
      return Promise.resolve({});
    },
  });

  assertEquals(response.status, 413);
  assertEquals((await response.json()).error, "IMPORT_BODY_TOO_LARGE");
  assertEquals(deepSeekCalled, false);
});

Deno.test("import-source preserves pasted text flow and caps normalized prompt text at 12,000 characters", async () => {
  let promptText = "";
  const pastedText = `  ${"coffee ".repeat(2_100)}  `;
  const response = await handleImportSourceRequest(request({ pastedText }), {
    getApiKey: () => "configured",
    requireUser: () => Promise.resolve(verifiedAuth),
    consumeRateLimit: () => Promise.resolve(null),
    requestDeepSeekDraft: (_apiKey, _sourceUrl, sourceText) => {
      promptText = sourceText;
      return Promise.resolve({ name: "测试豆" });
    },
  });

  assertEquals(response.status, 200);
  assertEquals(promptText.length, 12_000);
  assertEquals((await response.json()).rawTextLength, 12_000);
});
