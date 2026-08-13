type RpcClient = {
  rpc: (
    name: string,
    parameters: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export const edgeRatePolicies = {
  "import-source": { maxRequests: 10, windowSeconds: 600 },
  "recommend-brew": { maxRequests: 20, windowSeconds: 600 },
} as const;

type EdgeRateAction = keyof typeof edgeRatePolicies;

function jsonError(error: string, status: number, headers?: HeadersInit) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function isRateLimitResult(value: unknown): value is {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return typeof result.allowed === "boolean" &&
    Number.isInteger(result.remaining) &&
    Number(result.remaining) >= 0 &&
    Number.isInteger(result.retryAfterSeconds) &&
    Number(result.retryAfterSeconds) >= 0;
}

export async function consumeRateLimit(
  action: EdgeRateAction,
  client: RpcClient,
): Promise<Response | null> {
  const policy = edgeRatePolicies[action];

  try {
    const { data, error } = await client.rpc("consume_edge_rate_limit", {
      p_action: action,
      p_max_requests: policy.maxRequests,
      p_window_seconds: policy.windowSeconds,
    });

    if (error || !isRateLimitResult(data)) {
      return jsonError("RATE_LIMIT_UNAVAILABLE", 503);
    }

    if (!data.allowed) {
      const retryAfter = Math.max(1, data.retryAfterSeconds);
      return jsonError("RATE_LIMITED", 429, {
        "Retry-After": String(retryAfter),
      });
    }

    return null;
  } catch {
    return jsonError("RATE_LIMIT_UNAVAILABLE", 503);
  }
}
