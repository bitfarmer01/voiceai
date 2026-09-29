/**
 * Shared NVIDIA NIM settings for every `@ai-sdk/openai` caller (Convex ingest actions
 * and the Next.js `/api/chat` route). Dependency-free so it bundles in either runtime.
 *
 * Callers must use `nim.chat(model)`, not `nim(model)`: since `@ai-sdk/openai` v2 the
 * bare call targets the OpenAI Responses API (`/v1/responses`), which NIM does not
 * serve (404).
 */
export const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";

/** Text model for extraction, drafting, suggestions and chat. */
export const NIM_TEXT_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

/** Vision model for image OCR during document ingest. */
export const NIM_VLM_MODEL = "meta/llama-3.2-11b-vision-instruct";

/**
 * `fetch` wrapper that disables Nemotron's reasoning mode. With thinking on, the
 * reasoning trace lands in `content` ahead of the answer and breaks `generateObject`'s
 * JSON parsing. Models that don't use the chat template flag ignore it.
 */
export const nimFetch: typeof fetch = (input, init) => {
  if (typeof init?.body === "string") {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    body.chat_template_kwargs = { enable_thinking: false };
    init = { ...init, body: JSON.stringify(body) };
  }
  return fetch(input, init);
};
