"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AuthHeading, FormError, SubmitButton, TextField } from "@/components/auth/auth-form-parts";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({
      email: String(new FormData(event.currentTarget).get("email")),
      redirectTo: "/reset-password",
    });
    setPending(false);
    if (error) setError(error.message ?? "Something went wrong");
    else setSent(true);
  }

  return (
    <>
      <AuthHeading
        title="Reset your password"
        description={sent ? "If that email has an account, a reset link is on its way." : "We'll email you a link to choose a new one."}
      />
      {!sent && (
        <form onSubmit={onSubmit} className="grid gap-4">
          <FormError message={error} />
          <TextField id="email" label="Email" type="email" autoComplete="email" required />
          <SubmitButton pending={pending}>Send reset link</SubmitButton>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/sign-in" className="text-muted-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
