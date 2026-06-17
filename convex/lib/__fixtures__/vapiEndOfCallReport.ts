/**
 * Representative VAPI `end-of-call-report` webhook body (the value of the POST
 * JSON, i.e. `{ message: {...} }`). Field nesting matches the VAPI server SDK:
 *   - cost rollup at message.call.costBreakdown (stt/llm/tts/vapi/transport/total)
 *   - latency at message.artifact.performanceMetrics (averages + turnLatencies[])
 *   - NO message.durationSeconds — derive duration from startedAt/endedAt
 * Typed loosely as the raw webhook body the normalizer accepts as `unknown`.
 */
export const VAPI_END_OF_CALL_REPORT: unknown = {
  message: {
    type: "end-of-call-report",
    endedReason: "customer-ended-call",
    timestamp: 1781611404000,
    startedAt: "2026-06-16T10:00:00.000Z",
    endedAt: "2026-06-16T10:03:24.000Z", // 204s
    cost: 0.182,
    costs: [
      { type: "transport", minutes: 3.4, cost: 0.0204 },
      { type: "transcriber", transcriber: { provider: "deepgram", model: "nova-2" }, minutes: 3.4, cost: 0.0146 },
      { type: "model", model: { provider: "openai", model: "gpt-4o-mini" }, promptTokens: 4210, completionTokens: 380, cost: 0.0931 },
      { type: "voice", voice: { provider: "cartesia", voiceId: "sonic" }, characters: 1240, cost: 0.0432 },
      { type: "vapi", subType: "normal", minutes: 3.4, cost: 0.017 },
      { type: "analysis", analysisType: "summary", promptTokens: 980, completionTokens: 120, cost: 0.0037 },
    ],
    analysis: {
      summary: "Customer asked about pricing and booked a cleaning.",
      structuredData: { intent: "booking", booked: true },
      successEvaluation: "true",
    },
    artifact: {
      transcript: "AI: Hello!\nUser: I'd like to book a cleaning...\n",
      recordingUrl: "https://example.test/mono.wav",
      messages: [
        { role: "bot", message: "Hello!", time: 1781611201000, endTime: 1781611202100, secondsFromStart: 1.0, duration: 1.1 },
      ],
      performanceMetrics: {
        modelLatencyAverage: 540,
        voiceLatencyAverage: 210,
        transcriberLatencyAverage: 180,
        endpointingLatencyAverage: 320,
        turnLatencyAverage: 1180,
        numUserInterrupted: 1,
        numAssistantInterrupted: 0,
        turnLatencies: [
          { modelLatency: 520, voiceLatency: 200, transcriberLatency: 175, endpointingLatency: 300, turnLatency: 1150 },
        ],
      },
    },
    call: {
      id: "vapi_call_abc123",
      costBreakdown: {
        transport: 0.0204,
        stt: 0.0146,
        llm: 0.0931,
        tts: 0.0432,
        vapi: 0.017,
        total: 0.182,
        llmPromptTokens: 4210,
        llmCompletionTokens: 380,
        ttsCharacters: 1240,
      },
    },
  },
};

/**
 * A degraded report: VAPI omits performanceMetrics (opt-in / often absent) and
 * call.costBreakdown, leaving only the costs[] array and top-level cost. The
 * normalizer must still produce a valid EngineEndOfCallReport (latencies undefined,
 * costBreakdown reconstructed from costs[]).
 */
export const VAPI_END_OF_CALL_REPORT_MINIMAL: unknown = {
  message: {
    type: "end-of-call-report",
    startedAt: "2026-06-16T10:00:00.000Z",
    endedAt: "2026-06-16T10:00:48.000Z", // 48s
    cost: 0.05,
    costs: [
      { type: "transcriber", transcriber: { provider: "deepgram" }, cost: 0.01 },
      { type: "model", model: { provider: "openai" }, cost: 0.02 },
      { type: "voice", voice: { provider: "cartesia" }, cost: 0.015 },
      { type: "vapi", cost: 0.005 },
    ],
    analysis: { successEvaluation: "false" },
    artifact: {},
    call: { id: "vapi_call_minimal" },
  },
};

/** A non-report message (status-update) the normalizer must reject with null. */
export const VAPI_STATUS_UPDATE: unknown = {
  message: { type: "status-update", status: "in-progress" },
};
