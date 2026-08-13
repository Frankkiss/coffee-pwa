import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  assertSafeHttpUrl,
  type DnsResolver,
  isForbiddenHostname,
  isForbiddenIpAddress,
  type SafeFetchDependencies,
  safeFetchText,
} from "./safeFetch.ts";

const publicDns: DnsResolver = (_hostname, recordType) =>
  Promise.resolve(
    recordType === "A"
      ? ["93.184.216.34"]
      : ["2606:2800:220:1:248:1893:25c8:1946"],
  );

function dependencies(
  fetchImpl: typeof fetch,
  options: {
    resolveDns?: DnsResolver;
    now?: () => number;
    controller?: AbortController;
    pinnedAddresses?: string[];
  } = {},
): SafeFetchDependencies {
  return {
    fetchImpl,
    resolveDns: options.resolveDns ?? publicDns,
    now: options.now ?? (() => 0),
    createAbortController: () => options.controller ?? new AbortController(),
    createPinnedHttpClient: (address) => {
      options.pinnedAddresses?.push(address);
      return {
        client: { marker: address } as unknown as Deno.HttpClient,
        close: () => undefined,
      };
    },
  };
}

Deno.test("hostname and IP guards reject local and non-public address ranges", () => {
  for (const hostname of ["localhost", "LOCALHOST.", "api.localhost"]) {
    assertEquals(isForbiddenHostname(hostname), true, hostname);
  }
  assertEquals(isForbiddenHostname("coffee.example"), false);

  for (
    const address of [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.0.2.1",
      "192.88.99.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "255.255.255.255",
      "::",
      "::1",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:10.0.0.1",
      "::ffff:c0a8:101",
    ]
  ) {
    assertEquals(isForbiddenIpAddress(address), true, address);
  }

  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
    assertEquals(isForbiddenIpAddress(address), false, address);
  }
});

Deno.test("assertSafeHttpUrl rejects unsafe syntax, credentials, and DNS answers", async () => {
  for (
    const value of [
      "ftp://example.com/file",
      "https://user:secret@example.com/",
      "http://localhost/",
      "http://127.1/",
      "http://[::1]/",
    ]
  ) {
    await assertRejects(() => assertSafeHttpUrl(new URL(value), publicDns));
  }

  await assertRejects(() =>
    assertSafeHttpUrl(
      new URL("https://public.example"),
      (_host, type) =>
        Promise.resolve(type === "A" ? ["93.184.216.34", "10.0.0.8"] : []),
    )
  );
  await assertRejects(() =>
    assertSafeHttpUrl(
      new URL("https://public.example"),
      () => Promise.reject(new Error("DNS unavailable")),
    )
  );
  await assertSafeHttpUrl(new URL("https://public.example"), publicDns);
});

Deno.test("safeFetchText validates every redirect and permits at most three hops", async () => {
  const visited: string[] = [];
  const pinnedAddresses: string[] = [];
  const fetchImpl = ((
    input: URL | RequestInfo,
    init?: RequestInit & { client?: Deno.HttpClient },
  ) => {
    const url = String(input);
    visited.push(url);
    assertEquals(Boolean(init?.client), true);
    const hop = visited.length;
    if (hop <= 3) {
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: {
            Location: hop === 1 ? "/two" : `https://hop${hop + 1}.example/`,
          },
        }),
      );
    }
    return Promise.resolve(
      new Response("coffee text", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
    );
  }) as typeof fetch;

  assertEquals(
    await safeFetchText(
      "https://hop1.example/one",
      dependencies(fetchImpl, { pinnedAddresses }),
    ),
    "coffee text",
  );
  assertEquals(visited.length, 4);
  assertEquals(pinnedAddresses, Array(4).fill("93.184.216.34"));

  const endlessRedirect = (() =>
    Promise.resolve(
      new Response(null, { status: 302, headers: { Location: "/again" } }),
    )) as typeof fetch;
  await assertRejects(() =>
    safeFetchText("https://public.example/", dependencies(endlessRedirect))
  );

  let forbiddenTargetFetched = false;
  const redirectToPrivate = ((input: URL | RequestInfo) => {
    if (String(input).includes("169.254.169.254")) {
      forbiddenTargetFetched = true;
    }
    return Promise.resolve(
      new Response(null, {
        status: 302,
        headers: { Location: "http://169.254.169.254/latest/meta-data" },
      }),
    );
  }) as typeof fetch;
  await assertRejects(() =>
    safeFetchText("https://public.example/", dependencies(redirectToPrivate))
  );
  assertEquals(forbiddenTargetFetched, false);
});

Deno.test("safeFetchText pins the connection to a previously validated DNS address", async () => {
  const pinnedAddresses: string[] = [];
  const resolveDns: DnsResolver = (_hostname, recordType) =>
    Promise.resolve(recordType === "A" ? ["93.184.216.34"] : []);
  const fetchImpl = ((
    _input: URL | RequestInfo,
    init?: RequestInit & { client?: Deno.HttpClient },
  ) => {
    assertEquals(
      (init?.client as unknown as { marker: string }).marker,
      "93.184.216.34",
    );
    return Promise.resolve(
      new Response("pinned", { headers: { "Content-Type": "text/plain" } }),
    );
  }) as typeof fetch;

  assertEquals(
    await safeFetchText(
      "https://rebind.example/",
      dependencies(fetchImpl, { resolveDns, pinnedAddresses }),
    ),
    "pinned",
  );
  assertEquals(pinnedAddresses, ["93.184.216.34"]);
});

Deno.test("safeFetchText rejects malformed redirects, non-text media, and HTTP failures", async () => {
  for (
    const response of [
      new Response(null, { status: 302 }),
      new Response("image", { headers: { "Content-Type": "image/png" } }),
      new Response("no", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      }),
    ]
  ) {
    const fetchImpl = (() => Promise.resolve(response)) as typeof fetch;
    await assertRejects(() =>
      safeFetchText("https://public.example/", dependencies(fetchImpl))
    );
  }

  const malformedRedirect = (() =>
    Promise.resolve(
      new Response(null, { status: 302, headers: { Location: "http://[" } }),
    )) as typeof fetch;
  await assertRejects(() =>
    safeFetchText("https://public.example/", dependencies(malformedRedirect))
  );
});

Deno.test("safeFetchText fails closed when either DNS family lookup fails", async () => {
  for (const failingType of ["A", "AAAA"] as const) {
    const resolveDns: DnsResolver = (_hostname, recordType) =>
      recordType === failingType
        ? Promise.reject(new Error("resolver failure"))
        : Promise.resolve(
          recordType === "A" ? ["93.184.216.34"] : ["2606:4700::1111"],
        );
    let fetched = false;
    const fetchImpl = (() => {
      fetched = true;
      return Promise.resolve(new Response("must not happen"));
    }) as typeof fetch;

    await assertRejects(() =>
      safeFetchText(
        "https://public.example/",
        dependencies(fetchImpl, { resolveDns }),
      )
    );
    assertEquals(fetched, false);
  }
});

Deno.test("safeFetchText streams at most 1,000,000 bytes", async () => {
  const exact = new Uint8Array(1_000_000).fill(97);
  const exactFetch = (() =>
    Promise.resolve(
      new Response(exact, { headers: { "Content-Type": "text/plain" } }),
    )) as typeof fetch;
  assertEquals(
    (await safeFetchText("https://public.example/", dependencies(exactFetch)))
      .length,
    1_000_000,
  );

  const oversizedStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(800_000));
      controller.enqueue(new Uint8Array(200_001));
      controller.close();
    },
  });
  const oversizedFetch = (() =>
    Promise.resolve(
      new Response(oversizedStream, {
        headers: { "Content-Type": "text/html" },
      }),
    )) as typeof fetch;
  await assertRejects(() =>
    safeFetchText("https://public.example/", dependencies(oversizedFetch))
  );
});

Deno.test("safeFetchText enforces one 10-second budget and aborts the request", async () => {
  const controller = new AbortController();
  let nowCalls = 0;
  const now = () => (nowCalls++ === 0 ? 0 : 10_001);
  const fetchImpl = ((_input: URL | RequestInfo, init?: RequestInit) => {
    assertEquals(init?.redirect, "manual");
    assertEquals(init?.signal, controller.signal);
    return Promise.resolve(
      new Response("late", { headers: { "Content-Type": "text/plain" } }),
    );
  }) as typeof fetch;

  await assertRejects(() =>
    safeFetchText(
      "https://public.example/",
      dependencies(fetchImpl, { now, controller }),
    )
  );
  assertEquals(controller.signal.aborted, true);
});
