import { assertEquals } from "jsr:@std/assert@1";
import { requestDeepSeekDraft } from "./index.ts";

Deno.test("DeepSeek source import uses the vision model and image content block", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> = {};

  globalThis.fetch = (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return Promise.resolve(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  };

  try {
    await requestDeepSeekDraft(
      "vision-key",
      "manual://pasted-text",
      "包装文字",
      {
        mediaType: "image/jpeg",
        dataUrl: "data:image/jpeg;base64,/9j/",
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assertEquals(requestBody.model, "deepseek-v4-flash-vision-exp");
  const messages = requestBody.messages as Array<Record<string, unknown>>;
  const userContent = messages[1].content as Array<Record<string, unknown>>;
  assertEquals(userContent[0].type, "text");
  assertEquals(userContent[1], {
    type: "image_url",
    image_url: {
      url: "data:image/jpeg;base64,/9j/",
      detail: "original",
    },
  });
});
