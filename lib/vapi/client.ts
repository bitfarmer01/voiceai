"use client";

import Vapi from "@vapi-ai/web";

let instance: Vapi | null = null;

/** Singleton VAPI Web SDK client (browser-only), keyed by the public key. */
export function getVapi(): Vapi {
  if (!instance) {
    const key = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!key) throw new Error("NEXT_PUBLIC_VAPI_PUBLIC_KEY is not set");
    instance = new Vapi(key);
  }
  return instance;
}
