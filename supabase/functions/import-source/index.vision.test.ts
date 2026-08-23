import { assertEquals } from "jsr:@std/assert@1";
import {
  handleImportSourceRequest,
  type ImportSourceDependencies,
} from "./index.ts";

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

function request(body: unknown) {
  return new Request("http://localhost/import-source", {
    method: "POST",
    headers: {
      Authorization: "Bearer valid-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function dependencies(
  requestDraft: (...args: unknown[]) => Promise<Record<string, unknown>>,
) {
  return {
    getApiKey: () => "vision-key",
    requireUser: () => Promise.resolve(verifiedAuth),
    consumeRateLimit: () => Promise.resolve(null),
    requestDeepSeekDraft: requestDraft,
  } as unknown as ImportSourceDependencies;
}

Deno.test("import-source accepts an image without pasted text", async () => {
  let receivedText: unknown;
  let receivedImage: unknown;
  const image = {
    mediaType: "image/png",
    dataUrl: "data:image/png;base64,iVBORw==",
  };

  const response = await handleImportSourceRequest(
    request({ pastedText: "", image }),
    dependencies((_key, _source, sourceText, sourceImage) => {
      receivedText = sourceText;
      receivedImage = sourceImage;
      return Promise.resolve({ name: "视觉测试豆" });
    }),
  );

  assertEquals(response.status, 200);
  assertEquals(receivedText, "");
  assertEquals(receivedImage, image);
  assertEquals((await response.json()).draft.name, "视觉测试豆");
});

Deno.test("import-source rejects invalid image data before calling DeepSeek", async () => {
  let called = false;
  const response = await handleImportSourceRequest(
    request({
      pastedText: "",
      image: {
        mediaType: "image/png",
        dataUrl: "data:image/png;base64,%%%",
      },
    }),
    dependencies(() => {
      called = true;
      return Promise.resolve({});
    }),
  );

  assertEquals(response.status, 400);
  assertEquals((await response.json()).error, "INVALID_SOURCE_IMAGE");
  assertEquals(called, false);
});

Deno.test("import-source rejects unsupported or mismatched image media types", async () => {
  for (const image of [
    { mediaType: "image/gif", dataUrl: "data:image/gif;base64,R0lGODlh" },
    { mediaType: "image/jpeg", dataUrl: "data:image/png;base64,iVBORw==" },
  ]) {
    const response = await handleImportSourceRequest(
      request({ pastedText: "包装正面", image }),
      dependencies(() => Promise.resolve({})),
    );

    assertEquals(response.status, 400);
    assertEquals((await response.json()).error, "INVALID_SOURCE_IMAGE");
  }
});

Deno.test("import-source requires text or an image", async () => {
  const response = await handleImportSourceRequest(
    request({ pastedText: "" }),
    dependencies(() => Promise.resolve({})),
  );

  assertEquals(response.status, 400);
  assertEquals((await response.json()).error, "SOURCE_INPUT_REQUIRED");
});

Deno.test("import-source rejects decoded images larger than 8 MiB", async () => {
  const decodedBytes = 8 * 1024 * 1024 + 3;
  const base64 = "A".repeat(Math.ceil(decodedBytes / 3) * 4);
  const response = await handleImportSourceRequest(
    request({
      pastedText: "包装图片",
      image: {
        mediaType: "image/jpeg",
        dataUrl: `data:image/jpeg;base64,${base64}`,
      },
    }),
    dependencies(() => Promise.resolve({})),
  );

  assertEquals(response.status, 413);
  assertEquals((await response.json()).error, "SOURCE_IMAGE_TOO_LARGE");
});
