import { assertEquals } from "jsr:@std/assert@1";
import { consumeRateLimit, edgeRatePolicies } from "./rateLimit.ts";

Deno.test("consumeRateLimit calls the authenticated RPC with the fixed policy", async () => {
  let call: { name: string; params: Record<string, unknown> } | undefined;
  const client = {
    rpc: (name: string, params: Record<string, unknown>) => {
      call = { name, params };
      return Promise.resolve({
        data: { allowed: true, remaining: 9, retryAfterSeconds: 0 },
        error: null,
      });
    },
  };

  const response = await consumeRateLimit("import-source", client);

  assertEquals(response, null);
  assertEquals(call, {
    name: "consume_edge_rate_limit",
    params: {
      p_action: "import-source",
      p_max_requests: 10,
      p_window_seconds: 600,
    },
  });
  assertEquals(edgeRatePolicies["recommend-brew"], {
    maxRequests: 20,
    windowSeconds: 600,
  });
});

Deno.test("consumeRateLimit returns 429 and Retry-After when denied", async () => {
  const client = {
    rpc: () =>
      Promise.resolve({
        data: { allowed: false, remaining: 0, retryAfterSeconds: 37 },
        error: null,
      }),
  };

  const response = await consumeRateLimit("recommend-brew", client);

  assertEquals(response?.status, 429);
  assertEquals(response?.headers.get("Retry-After"), "37");
  assertEquals(await response?.json(), { error: "RATE_LIMITED" });
});

Deno.test("consumeRateLimit fails closed on RPC errors or malformed responses", async () => {
  for (
    const rpcResult of [
      { data: null, error: new Error("database details") },
      { data: { allowed: "yes" }, error: null },
    ]
  ) {
    const response = await consumeRateLimit("import-source", {
      rpc: () => Promise.resolve(rpcResult),
    });

    assertEquals(response?.status, 503);
    assertEquals(await response?.json(), { error: "RATE_LIMIT_UNAVAILABLE" });
  }
});
