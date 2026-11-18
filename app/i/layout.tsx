import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/brand";

export const metadata: Metadata = {
  title: "Create your invite",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PublicLayout({ children }: LayoutProps<"/i">) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-96" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-8 sm:px-6 md:pt-12">{children}</main>
      <footer className="hidden border-t md:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 font-mono text-xs text-muted-foreground">
          <span>Your invite is created on your device.</span>
          <Link href="/" className="inline-flex items-center gap-2 transition-colors hover:text-foreground">
            <LogoMark className="size-5" /> Made with Chenah Invites
          </Link>
        </div>
      </footer>
    </div>
  );
}
