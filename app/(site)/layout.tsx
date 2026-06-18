import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

/** Shared shell for every public screen. /admin lives outside this group (own NOC chrome). */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {/* pt-14 clears the fixed h-14 SiteHeader — keep in sync if header height changes */}
      <main className="flex-1 pt-14">{children}</main>
      <SiteFooter />
    </>
  );
}
