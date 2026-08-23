import { assertStringIncludes } from "jsr:@std/assert@1";
import { requestDeepSeekDraft } from "./index.ts";

Deno.test("vision source prompt tells the model to inspect the attached packaging image", async () => {
  const originalFetch = globalThis.fetch;
  let prompt = "";
  globalThis.fetch = (_input, init) => {
    const body = JSON.parse(String(init?.body));
    prompt = body.messages[1].content[0].text;
    return Promise.resolve(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
        { status: 200 },
      ),
    );
  };

  try {
    await requestDeepSeekDraft(
      "vision-key",
      "manual://pasted-text",
      "",
      { mediaType: "image/jpeg", dataUrl: "data:image/jpeg;base64,/9j/" },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assertStringIncludes(prompt, "包装图片");
  assertStringIncludes(prompt, "不要猜测");
});
