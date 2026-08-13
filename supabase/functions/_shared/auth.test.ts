import { assertEquals } from "jsr:@std/assert@1";
import { requireUser } from "./auth.ts";

Deno.test("requireUser returns 401 without a bearer token", async () => {
  let clientCreated = false;
  const result = await requireUser(new Request("https://example.test"), {
    getEnv: () => "configured",
    createClient: () => {
      clientCreated = true;
      throw new Error("must not create a client");
    },
  });

  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.response.status, 401);
  assertEquals(clientCreated, false);
});

Deno.test("requireUser verifies the bearer token with auth.getUser", async () => {
  let receivedAuthorization = "";
  const user = { id: "verified-user" } as never;
  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user }, error: null }) },
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
  const result = await requireUser(
    new Request("https://example.test", {
      headers: { Authorization: "Bearer verified-token" },
    }),
    {
      getEnv: (name) =>
        name === "SUPABASE_URL" ? "https://project.test" : "anon-key",
      createClient: (_url, _key, options) => {
        receivedAuthorization = options.global.headers.Authorization;
        return client;
      },
    },
  );

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.user, user);
    assertEquals(result.client, client);
  }
  assertEquals(receivedAuthorization, "Bearer verified-token");
});

Deno.test("requireUser returns 401 when Supabase rejects the token", async () => {
  const result = await requireUser(
    new Request("https://example.test", {
      headers: { Authorization: "Bearer expired-token" },
    }),
    {
      getEnv: () => "configured",
      createClient: () => ({
        auth: {
          getUser: () =>
            Promise.resolve({
              data: { user: null },
              error: new Error("token details must not leak"),
            }),
        },
        rpc: () => Promise.resolve({ data: null, error: null }),
      }),
    },
  );

  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.response.status, 401);
    assertEquals(await result.response.json(), { error: "AUTH_REQUIRED" });
  }
});
