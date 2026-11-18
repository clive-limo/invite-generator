import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className, href = "/" }: { className?: string; href?: "/" | "/dashboard" }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 font-display text-lg font-semibold tracking-[-0.02em]", className)}>
      <LogoMark />
      Chenah Invites
    </Link>
  );
}

/** A signal-orange disc with a folded envelope: reads at 16px and at hero size. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground", className)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="size-[55%]" aria-hidden>
        <path d="M4 8.5 12 4l8 4.5V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8.5Z" />
        <path d="m4.5 9 7.5 5 7.5-5" />
      </svg>
    </span>
  );
}
