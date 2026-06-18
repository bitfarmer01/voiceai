import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

// Signal Bold identity: Space Grotesk (display) · Hanken Grotesk (body) · IBM Plex Mono (data)
const sans = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-sans" });

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Receptionist · Voice AI",
  description:
    "Talk to a document-grounded AI voice receptionist — live in the browser, no signup. Built with production observability, provider benchmarking, evals, and a hard budget guard.",
};

// Signal Bold brand tokens: ink #121210 (dark bg) / paper #F4F4EE (light bg)
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#121210" },
    { media: "(prefers-color-scheme: light)", color: "#F4F4EE" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full", "antialiased", sans.variable, display.variable, mono.variable, "font-sans")}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
