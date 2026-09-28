import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { buildChatTools } from "@/lib/chat/tools";
import { NIM_BASE_URL, NIM_TEXT_MODEL, nimFetch } from "@/convex/lib/nim";
import { buildChatSystemPrompt } from "@/lib/chat/system-prompt";
import { validateIntake } from "@/convex/lib/intake";

export const runtime = "nodejs";
export const maxDuration = 30;

export type ChatMessage = UIMessage;

export async function POST(req: Request) {
  const {
    messages,
    businessId,
    businessName,
    knowledge,
    callerContext,
    sessionId,
    services,
    hours,
    intakeQuestions,
  }: {
    messages: ChatMessage[];
    businessId: string;
    businessName: string;
    knowledge: string;
    callerContext?: string;
    sessionId: string;
    services?: unknown;
    hours?: unknown;
    intakeQuestions?: unknown;
  } = await req.json();

  if (!businessId || !sessionId) {
    return new Response("Missing businessId or sessionId", { status: 400 });
  }

  if (!process.env.NVIDIA_NIM_API_KEY) {
    console.error("chat: NVIDIA_NIM_API_KEY is not set on the server");
    return new Response("Chat is not configured", { status: 500 });
  }

  const nim = createOpenAI({
    baseURL: NIM_BASE_URL,
    apiKey: process.env.NVIDIA_NIM_API_KEY ?? "",
    fetch: nimFetch,
  });

  const today = new Date().toISOString().slice(0, 10);

  // Client-supplied booking context is untrusted: narrow it and re-validate intake.
  const safeServices = Array.isArray(services)
    ? services.filter((s): s is string => typeof s === "string").slice(0, 10)
    : [];
  const booking = {
    services: safeServices,
    hours: typeof hours === "string" ? hours.slice(0, 200) : "",
    intakeQuestions: validateIntake(intakeQuestions, safeServices),
  };

  const result = streamText({
    model: nim.chat(process.env.CHAT_MODEL ?? NIM_TEXT_MODEL),
    system: buildChatSystemPrompt({ businessName, knowledge, today, callerContext, booking }),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: buildChatTools({ businessId, sessionId }),
  });

  return result.toUIMessageStreamResponse();
}
