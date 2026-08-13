import { createClient, type User } from "npm:@supabase/supabase-js@2.108.1";

type ClientOptions = {
  global: { headers: { Authorization: string } };
  auth: { persistSession: false; autoRefreshToken: false };
};

type AuthResult = {
  data: { user: User | null };
  error: unknown;
};

export type AuthClient = {
  auth: { getUser: () => Promise<AuthResult> };
  rpc: (
    name: string,
    parameters: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type RequireUserDependencies = {
  getEnv: (name: string) => string | undefined;
  createClient: (
    url: string,
    key: string,
    options: ClientOptions,
  ) => AuthClient;
};

export type RequireUserResult =
  | { ok: true; user: User; client: AuthClient }
  | { ok: false; response: Response };

const defaultDependencies: RequireUserDependencies = {
  getEnv: (name) => Deno.env.get(name),
  createClient: (url, key, options) =>
    createClient(url, key, options) as unknown as AuthClient,
};

function unauthorizedResponse() {
  return new Response(JSON.stringify({ error: "AUTH_REQUIRED" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export async function requireUser(
  request: Request,
  dependencies: RequireUserDependencies = defaultDependencies,
): Promise<RequireUserResult> {
  const authorization = request.headers.get("Authorization")?.trim();
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    return { ok: false, response: unauthorizedResponse() };
  }

  const url = dependencies.getEnv("SUPABASE_URL");
  const anonKey = dependencies.getEnv("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    return { ok: false, response: unauthorizedResponse() };
  }

  const client = dependencies.createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      return { ok: false, response: unauthorizedResponse() };
    }

    return { ok: true, user: data.user, client };
  } catch {
    return { ok: false, response: unauthorizedResponse() };
  }
}
