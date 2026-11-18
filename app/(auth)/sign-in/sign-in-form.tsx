"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthHeading, FormError, GoogleButton, safeNext, SubmitButton, TextField } from "@/components/auth/auth-form-parts";
import { authClient } from "@/lib/auth-client";
import { BETA_ERROR_CODE, BETA_MESSAGE } from "@/lib/beta";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [pending, setPending] = useState(false);
  // Google sign-in redirects back here with ?error=CODE when it fails.
  const oauthError = params.get("error");
  const [error, setError] = useState<string | null>(
    oauthError ? (oauthError === BETA_ERROR_CODE ? BETA_MESSAGE : "Couldn't sign you in with Google. Please try again.") : null,
  );
  const [unverified, setUnverified] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setUnverified(false);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
      callbackURL: next,
    });
    setPending(false);
    if (error) {
      if (error.code === "EMAIL_NOT_VERIFIED") setUnverified(true);
      else setError(error.message ?? "Couldn't sign you in");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <>
      <AuthHeading title="Welcome back" description="Sign in to manage your invite templates." />
      <form onSubmit={onSubmit} className="grid gap-4">
        <GoogleButton callbackURL={next} />
        {unverified && (
          <Alert>
            <AlertDescription>
              Please confirm your email first — we&apos;ve just sent you a fresh link.
            </AlertDescription>
          </Alert>
        )}
        <FormError message={error} />
        <TextField id="email" label="Email" type="email" autoComplete="email" required />
        <TextField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          hint={
            <Link href="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              Forgot?
            </Link>
          }
        />
        <SubmitButton pending={pending}>Sign in</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href={`/sign-up${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-foreground underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
