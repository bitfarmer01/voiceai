"use client";

import * as React from "react";

/**
 * Owner-first view mode. The product defaults to a plain-language "owner" view
 * (for a non-technical small-business owner). Flipping to "technical" reveals
 * the behind-the-scenes screens (leaderboard / evals / analytics).
 *
 * Backed by a tiny external store over localStorage and read through
 * `useSyncExternalStore`, so the server + first client paint both render the
 * default ("owner") with no hydration mismatch, the preference survives reloads,
 * and a toggle in one tab is mirrored into others.
 */

export type ViewMode = "owner" | "technical";

const STORAGE_KEY = "receptionist:view-mode";
const DEFAULT_MODE: ViewMode = "owner";

function isViewMode(value: unknown): value is ViewMode {
  return value === "owner" || value === "technical";
}

// ── external store over localStorage ───────────────────────────────────────
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // `storage` fires for OTHER tabs; same-tab writes notify via emit() below.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): ViewMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isViewMode(stored) ? stored : DEFAULT_MODE;
  } catch {
    // localStorage may be unavailable (private mode / blocked) — keep default.
    return DEFAULT_MODE;
  }
}

function getServerSnapshot(): ViewMode {
  return DEFAULT_MODE;
}

function writeMode(next: ViewMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore persistence failures — the snapshot below still updates this tab.
  }
  listeners.forEach((l) => l());
}

interface ViewModeContextValue {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  toggle: () => void;
}

const ViewModeContext = React.createContext<ViewModeContextValue | null>(null);

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const mode = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setMode = React.useCallback((next: ViewMode) => writeMode(next), []);
  const toggle = React.useCallback(
    () => writeMode(getSnapshot() === "owner" ? "technical" : "owner"),
    [],
  );

  const value = React.useMemo<ViewModeContextValue>(
    () => ({ mode, setMode, toggle }),
    [mode, setMode, toggle],
  );

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewMode(): ViewModeContextValue {
  const ctx = React.useContext(ViewModeContext);
  if (!ctx) {
    throw new Error("useViewMode must be used within a <ViewModeProvider>");
  }
  return ctx;
}

/**
 * Renders children only when the active view is "technical". During SSR and the
 * first client paint the snapshot is the default ("owner"), so server and client
 * markup match; after hydration the stored preference takes over.
 */
export function TechnicalOnly({ children }: { children: React.ReactNode }) {
  const ctx = React.useContext(ViewModeContext);
  if (!ctx) {
    throw new Error("<TechnicalOnly> must be used within a <ViewModeProvider>");
  }
  return ctx.mode === "technical" ? <>{children}</> : null;
}
