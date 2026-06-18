"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Waveform, List } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { OWNER_NAV, TECHNICAL_NAV, type NavItem } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ViewModeToggle } from "@/components/layout/view-mode-toggle";
import { TechnicalOnly } from "@/lib/view-mode";
import { BudgetMeter } from "@/components/shared/budget-meter";
import { useBudgetState } from "@/lib/data";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function DesktopNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {item.label}
      {active && <span className="mt-1 block h-0.5 rounded-full bg-primary" />}
    </Link>
  );
}

function MobileNavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {item.label}
    </Link>
  );
}

/** Subtle label that introduces the technical nav group. */
function BehindTheScenesDivider() {
  return (
    <span className="ml-2 mr-1 select-none text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground/70">
      Behind the scenes
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const budget = useBudgetState();
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeMenu = React.useCallback(() => setOpen(false), []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 h-14 border-b backdrop-blur-md transition-colors",
        scrolled ? "border-border bg-background/85" : "border-transparent bg-background/60",
      )}
    >
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-4 pt-[env(safe-area-inset-top)] sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Waveform weight="bold" className="size-5 text-primary" />
            <span>Receptionist</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {OWNER_NAV.map((item) => (
              <DesktopNavLink key={item.href} item={item} pathname={pathname} />
            ))}
            <TechnicalOnly>
              <span className="mx-2 h-5 w-px bg-border" aria-hidden="true" />
              <BehindTheScenesDivider />
              {TECHNICAL_NAV.map((item) => (
                <DesktopNavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </TechnicalOnly>
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <BudgetMeter budget={budget} variant="pill" className="hidden sm:inline-flex" />
          <ViewModeToggle />
          <ThemeToggle />
          <Button asChild size="sm" className="hidden md:inline-flex">
            <Link href="/try">Talk to a receptionist</Link>
          </Button>

          {/* Mobile */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 md:hidden" aria-label="Open menu">
                <List className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="px-4 pt-4 text-sm font-semibold">Receptionist</SheetTitle>
              <nav className="mt-2 flex flex-col gap-1 px-2 pb-[env(safe-area-inset-bottom)]">
                {OWNER_NAV.map((item) => (
                  <MobileNavLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    onNavigate={closeMenu}
                  />
                ))}
                <TechnicalOnly>
                  <span className="mx-3 mb-1 mt-3 select-none text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground/70">
                    Behind the scenes
                  </span>
                  {TECHNICAL_NAV.map((item) => (
                    <MobileNavLink
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      onNavigate={closeMenu}
                    />
                  ))}
                </TechnicalOnly>
                <div className="mx-2 mt-3 flex items-center gap-2">
                  <ViewModeToggle />
                  <span className="text-sm text-muted-foreground">Behind the scenes</span>
                </div>
                <Button asChild className="mt-3 mx-2" onClick={closeMenu}>
                  <Link href="/try">Talk to a receptionist</Link>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
