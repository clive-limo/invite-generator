import { Logo } from "@/components/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center overflow-hidden px-4 py-10 sm:justify-center">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 -z-10" />
      <div aria-hidden className="glow-warm pointer-events-none absolute inset-x-0 -bottom-24 -z-10 h-72 opacity-50" />
      <Logo className="mb-8" />
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-[0_24px_60px_-32px_oklch(0.4_0.08_45/0.35)] sm:p-8">{children}</div>
      <p className="mt-6 font-mono text-[0.6875rem] text-muted-foreground">Invites are created on your device.</p>
    </div>
  );
}
