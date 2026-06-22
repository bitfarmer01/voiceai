import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { buildChatTools } from "@/lib/chat/tools";
import { buildChatSystemPrompt } from "@/lib/chat/system-prompt";

export const runtime = "nodejs";
export const maxDuration = 30;

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_MODEL = "nvidia/nemotron-3-nano-30b-a3b";

export type ChatMessage = UIMessage;

export async function POST(req: Request) {
  const {
    messages,
    businessId,
    businessName,
    knowledge,
    callerContext,
    sessionId,
  }: {
    messages: ChatMessage[];
    businessId: string;
    businessName: string;
    knowledge: string;
    callerContext?: string;
    sessionId: string;
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
  });

  const today = new Date().toISOString().slice(0, 10);

  const result = streamText({
    model: nim(process.env.CHAT_MODEL ?? DEFAULT_MODEL),
    system: buildChatSystemPrompt({ businessName, knowledge, today, callerContext }),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: buildChatTools({ businessId, sessionId }),
  });

  return result.toUIMessageStreamResponse();
}
