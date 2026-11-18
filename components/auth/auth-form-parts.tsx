"use client";

import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, googleEnabled } from "@/lib/auth-client";

export function AuthHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-medium tracking-[-0.025em]">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function TextField({ label, id, hint, ...props }: ComponentProps<typeof Input> & { label: string; id: string; hint?: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {hint}
      </div>
      <Input id={id} name={id} {...props} />
    </div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" size="lg" className="mt-1 h-11 w-full md:h-10" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function GoogleButton({ callbackURL }: { callbackURL: string }) {
  if (!googleEnabled) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-11 w-full md:h-10"
        // Failures (including the beta allowlist) come back to sign-in as ?error=CODE.
        onClick={() => authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL: "/sign-in" })}
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.7 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
        </svg>
        Continue with Google
      </Button>
      <div className="relative my-1 text-center font-mono text-[0.6875rem] tracking-[0.14em] text-muted-foreground uppercase">
        <span className="relative z-10 bg-card px-2">or</span>
        <div className="absolute inset-x-0 top-1/2 border-t" />
      </div>
    </>
  );
}

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}
