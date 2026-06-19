/**
 * Tiny CLIENT-side defensive readers for `unknown` values — shared by the VAPI
 * Web SDK client-message parser (`lib/vapi/use-vapi-call.ts`) and the booking
 * extractor (`lib/calls/booking.ts`).
 *
 * NOTE: the Convex SERVER side has its own readers in `convex/lib/vapiWire.ts`
 * (Convex bundles `convex/` separately from `lib/`); deliberately NOT shared
 * across that runtime boundary.
 */

/** Read a property off an unknown value, or undefined if it isn't an object. */
export function prop(obj: unknown, key: string): unknown {
  return obj && typeof obj === "object" ? (obj as Record<string, unknown>)[key] : undefined;
}

/** Narrow an unknown to a string, or undefined. */
export function asString(x: unknown): string | undefined {
  return typeof x === "string" ? x : undefined;
}

/** Narrow an unknown to a finite number, or undefined. */
export function asNumber(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}
