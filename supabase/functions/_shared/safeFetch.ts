export type DnsResolver = (
  hostname: string,
  recordType: "A" | "AAAA",
) => Promise<string[]>;

export type SafeFetchDependencies = {
  fetchImpl: typeof fetch;
  resolveDns: DnsResolver;
  now: () => number;
  createAbortController: () => AbortController;
  createPinnedHttpClient: (
    address: string,
    port: number,
  ) => { client: Deno.HttpClient; close: () => void };
};

export class SafeFetchError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "SafeFetchError";
  }
}

const maxRedirects = 3;
const maxResponseBytes = 1_000_000;
const totalTimeoutMilliseconds = 10_000;
const acceptedMediaTypes = new Set([
  "text/html",
  "application/xhtml+xml",
  "text/plain",
]);

const defaultDependencies: SafeFetchDependencies = {
  fetchImpl: fetch,
  resolveDns: (hostname, recordType) =>
    Deno.resolveDns(hostname, recordType) as Promise<string[]>,
  now: () => performance.now(),
  createAbortController: () => new AbortController(),
  createPinnedHttpClient: (address, port) => {
    const client = Deno.createHttpClient({
      proxy: { transport: "tcp", hostname: address, port },
      poolMaxIdlePerHost: 0,
    });
    return { client, close: () => client.close() };
  },
};

function unsafeUrl(): never {
  throw new SafeFetchError("UNSAFE_SOURCE_URL", 400);
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((part) =>
    /^(0|[1-9]\d{0,2})$/.test(part) ? Number(part) : Number.NaN
  );
  return bytes.every((byte) =>
      Number.isInteger(byte) && byte >= 0 && byte <= 255
    )
    ? bytes
    : null;
}

function parseIpv6(rawAddress: string): number[] | null {
  let address = rawAddress.toLowerCase();
  if (address.startsWith("[") && address.endsWith("]")) {
    address = address.slice(1, -1);
  }
  if (!address || address.includes("%")) return null;

  const dottedIndex = address.lastIndexOf(":");
  if (address.includes(".") && dottedIndex !== -1) {
    const bytes = parseIpv4(address.slice(dottedIndex + 1));
    if (!bytes) return null;
    address = `${address.slice(0, dottedIndex)}:${
      ((bytes[0] << 8) | bytes[1]).toString(16)
    }:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }

  if (address.split("::").length > 2) return null;
  const hasCompression = address.includes("::");
  const [leftText, rightText = ""] = address.split("::");
  const left = leftText ? leftText.split(":") : [];
  const right = rightText ? rightText.split(":") : [];
  if (
    [...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part)) ||
    (!hasCompression && left.length !== 8) ||
    (hasCompression && left.length + right.length >= 8)
  ) {
    return null;
  }

  const zeroCount = hasCompression ? 8 - left.length - right.length : 0;
  return [
    ...left.map((part) => Number.parseInt(part, 16)),
    ...Array<number>(zeroCount).fill(0),
    ...right.map((part) => Number.parseInt(part, 16)),
  ];
}

function isForbiddenIpv4(bytes: number[]): boolean {
  const [a, b] = bytes;
  return a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 88 && bytes[2] === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && bytes[2] === 100) ||
    (a === 203 && b === 0 && bytes[2] === 113) ||
    a >= 224;
}

export function isForbiddenHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" || normalized.endsWith(".localhost");
}

export function isForbiddenIpAddress(address: string): boolean {
  const ipv4 = parseIpv4(address);
  if (ipv4) return isForbiddenIpv4(ipv4);

  const ipv6 = parseIpv6(address);
  if (!ipv6) return false;

  const [a, b, c, d, e, f, g, h] = ipv6;
  const isUnspecified = ipv6.every((part) => part === 0);
  const isLoopback = a === 0 && b === 0 && c === 0 && d === 0 && e === 0 &&
    f === 0 && g === 0 && h === 1;
  const isUniqueLocal = (a & 0xfe00) === 0xfc00;
  const isLinkLocal = (a & 0xffc0) === 0xfe80;
  const isMulticast = (a & 0xff00) === 0xff00;
  const isDocumentation = a === 0x2001 && b === 0x0db8;
  const isBenchmarking = a === 0x2001 && b === 0x0002 && c === 0;
  const isDiscardOnly = a === 0x0100 && b === 0 && c === 0 && d === 0;
  const isMappedIpv4 = a === 0 && b === 0 && c === 0 && d === 0 && e === 0 &&
    f === 0xffff;

  return isUnspecified || isLoopback || isUniqueLocal || isLinkLocal ||
    isMulticast || isDocumentation || isBenchmarking || isDiscardOnly ||
    (isMappedIpv4 && isForbiddenIpv4([g >> 8, g & 0xff, h >> 8, h & 0xff]));
}

export async function assertSafeHttpUrl(
  url: URL,
  resolveDns: DnsResolver,
): Promise<void> {
  await resolveSafeHttpUrl(url, resolveDns);
}

async function resolveSafeHttpUrl(
  url: URL,
  resolveDns: DnsResolver,
): Promise<string[]> {
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    !url.hostname ||
    isForbiddenHostname(url.hostname)
  ) {
    unsafeUrl();
  }

  const literalAddress = parseIpv4(url.hostname) ?? parseIpv6(url.hostname);
  if (literalAddress) {
    if (isForbiddenIpAddress(url.hostname)) unsafeUrl();
    return [url.hostname.replace(/^\[|\]$/g, "")];
  }

  let addresses: string[];
  try {
    const [ipv4, ipv6] = await Promise.all([
      resolveDns(url.hostname, "A"),
      resolveDns(url.hostname, "AAAA"),
    ]);
    addresses = [...ipv4, ...ipv6];
  } catch {
    throw new SafeFetchError("SOURCE_DNS_FAILED", 400);
  }

  if (
    addresses.length === 0 ||
    addresses.some((address) =>
      (!parseIpv4(address) && !parseIpv6(address)) ||
      isForbiddenIpAddress(address)
    )
  ) {
    unsafeUrl();
  }
  return addresses;
}

export async function safeFetchText(
  sourceUrl: string,
  dependencies: SafeFetchDependencies = defaultDependencies,
): Promise<string> {
  const controller = dependencies.createAbortController();
  const startedAt = dependencies.now();
  const deadline = startedAt + totalTimeoutMilliseconds;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new SafeFetchError("SOURCE_TIMEOUT", 408));
    }, totalTimeoutMilliseconds);
  });

  const ensureBudget = () => {
    if (dependencies.now() > deadline) {
      controller.abort();
      throw new SafeFetchError("SOURCE_TIMEOUT", 408);
    }
  };

  const performFetch = async () => {
    let currentUrl: URL;
    try {
      currentUrl = new URL(sourceUrl);
    } catch {
      unsafeUrl();
    }

    for (
      let redirectCount = 0;
      redirectCount <= maxRedirects;
      redirectCount += 1
    ) {
      ensureBudget();
      const addresses = await resolveSafeHttpUrl(
        currentUrl,
        dependencies.resolveDns,
      );
      ensureBudget();

      const port = currentUrl.port
        ? Number(currentUrl.port)
        : currentUrl.protocol === "https:"
        ? 443
        : 80;
      const pinned = dependencies.createPinnedHttpClient(addresses[0], port);

      try {
        let response: Response;
        try {
          response = await dependencies.fetchImpl(currentUrl, {
            redirect: "manual",
            signal: controller.signal,
            client: pinned.client,
            headers: {
              "User-Agent": "KaDayCoffeeImporter/1.0",
              Accept: "text/html,application/xhtml+xml,text/plain",
            },
          });
        } catch {
          if (controller.signal.aborted) {
            throw new SafeFetchError("SOURCE_TIMEOUT", 408);
          }
          throw new SafeFetchError("SOURCE_REQUEST_FAILED", 502);
        }
        ensureBudget();

        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (redirectCount === maxRedirects) {
            throw new SafeFetchError("SOURCE_TOO_MANY_REDIRECTS", 400);
          }
          const location = response.headers.get("Location");
          if (!location) {
            throw new SafeFetchError("SOURCE_INVALID_REDIRECT", 400);
          }
          try {
            currentUrl = new URL(location, currentUrl);
          } catch {
            throw new SafeFetchError("SOURCE_INVALID_REDIRECT", 400);
          }
          continue;
        }

        if (!response.ok) {
          throw new SafeFetchError("SOURCE_UPSTREAM_ERROR", 502);
        }

        const mediaType = response.headers.get("Content-Type")?.split(";", 1)[0]
          .trim().toLowerCase();
        if (!mediaType || !acceptedMediaTypes.has(mediaType)) {
          throw new SafeFetchError("SOURCE_UNSUPPORTED_MEDIA_TYPE", 415);
        }

        const contentLength = response.headers.get("Content-Length");
        if (
          contentLength !== null && Number(contentLength) > maxResponseBytes
        ) {
          throw new SafeFetchError("SOURCE_TOO_LARGE", 413);
        }
        if (!response.body) return "";

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let byteCount = 0;
        try {
          while (true) {
            ensureBudget();
            const { done, value } = await reader.read();
            ensureBudget();
            if (done) break;
            byteCount += value.byteLength;
            if (byteCount > maxResponseBytes) {
              await reader.cancel();
              throw new SafeFetchError("SOURCE_TOO_LARGE", 413);
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
        return new TextDecoder().decode(bytes);
      } finally {
        pinned.close();
      }
    }

    throw new SafeFetchError("SOURCE_TOO_MANY_REDIRECTS", 400);
  };

  try {
    return await Promise.race([performFetch(), timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
