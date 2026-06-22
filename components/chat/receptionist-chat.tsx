"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { useVisitorKey } from "@/lib/hooks/use-visitor-key";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { ChatCircle, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { AppointmentCard } from "@/components/shared/appointment-card";
import { CalculatorResult } from "./calculator-result";
import type { Booking } from "@/lib/types";

// ChatMessage is UIMessage — importing UIMessage from ai directly avoids
// a server/client boundary issue that would arise from importing the server route.

export function ReceptionistChat({
  businessId,
  businessName,
  knowledge,
  callerContext,
}: {
  businessId: string;
  businessName: string;
  knowledge: string;
  callerContext?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Move focus to the message input when the panel opens.
  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Globally-unique, persisted per-browser id (the same primitive the voice
  // path uses) so two visitors never share a chat session or booking anchor.
  const visitorKey = useVisitorKey();
  const sessionId = visitorKey ? `chat-${businessId}-${visitorKey}` : "";

  const { messages, sendMessage, status, error } = useChat<UIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const send = () => {
    const text = input.trim();
    if (!text || !sessionId) return;
    sendMessage(
      { text },
      { body: { businessId, businessName, knowledge, callerContext, sessionId } },
    );
    setInput("");
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label={`Chat with ${businessName}`}
          onClick={() => setOpen(true)}
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-50 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-opacity duration-[150ms] ease-out hover:opacity-90 motion-reduce:transition-none"
        >
          <ChatCircle weight="fill" className="size-6" />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label={`Chat with ${businessName}`}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-50 flex h-[min(70dvh,560px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg"
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">{businessName}</p>
            <button
              type="button"
              aria-label="Close chat"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {messages.length === 0 && (
              <p className="text-pretty text-muted-foreground">
                Ask about {businessName}&apos;s hours, services, or book an appointment.
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <p
                        key={i}
                        className="inline-block max-w-[85%] text-pretty rounded-lg bg-muted/50 px-3 py-2 text-left"
                      >
                        {part.text}
                      </p>
                    );
                  }
                  if (
                    part.type === "tool-calculator" &&
                    part.state === "output-available"
                  ) {
                    const out = part.output as { result?: number; error?: string };
                    const inp = part.input as { expression: string };
                    return (
                      <CalculatorResult
                        key={i}
                        expression={inp.expression}
                        result={out.result}
                        error={out.error}
                      />
                    );
                  }
                  if (
                    part.type === "tool-bookAppointment" &&
                    part.state === "output-available"
                  ) {
                    const out = part.output as { booked: boolean; booking: Booking | null };
                    return out.booking ? (
                      <AppointmentCard key={i} booking={out.booking} />
                    ) : null;
                  }
                  if (isToolUIPart(part) && part.state !== "output-available") {
                    return (
                      <p key={i} className="text-xs text-muted-foreground">
                        &hellip;working
                      </p>
                    );
                  }
                  return null;
                })}
              </div>
            ))}
            {(status === "submitted" || status === "streaming") && (
              <p className="text-xs text-muted-foreground">&hellip;</p>
            )}
            {error && (
              <p className="text-xs text-destructive">Something went wrong. Try again.</p>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border px-3 py-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={`Message ${businessName}`}
              aria-label="Message"
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              size="icon"
              aria-label="Send message"
              onClick={send}
              disabled={!input.trim()}
            >
              <PaperPlaneTilt className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
