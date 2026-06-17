"use client";

import * as React from "react";

/** Stable anonymous per-browser key for rate limiting (plan §4). Persisted locally. */
export function useVisitorKey(): string {
  const [key, setKey] = React.useState("");
  React.useEffect(() => {
    let k = localStorage.getItem("visitorKey");
    if (!k) {
      k = crypto.randomUUID();
      localStorage.setItem("visitorKey", k);
    }
    setKey(k);
  }, []);
  return key;
}
