"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConvexClientProvider } from "@/components/convex-provider";

/**
 * App-wide client providers. Theme is class-based (light/dark/system) and
 * persisted to localStorage by next-themes; no-flash is handled by the inline
 * script next-themes injects + `suppressHydrationWarning` on <html>.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ConvexClientProvider>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </ConvexClientProvider>
    </ThemeProvider>
  );
}
