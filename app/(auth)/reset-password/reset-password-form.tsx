"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthHeading, FormError, SubmitButton, TextField } from "@/components/auth/auth-form-parts";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token || params.get("error")) {
    return (
      <>
        <AuthHeading title="Link expired" description="That reset link is invalid or has already been used." />
        <Button asChild size="lg" className="h-11 w-full md:h-10">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) {
      setError("Passwords don't match");
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token: token! });
    setPending(false);
    if (error) setError(error.message ?? "Couldn't reset your password");
    else setDone(true);
  }

  if (done) {
    return (
      <>
        <AuthHeading title="Password updated" description="You can now sign in with your new password." />
        <Button asChild size="lg" className="h-11 w-full md:h-10">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Choose a new password" />
      <form onSubmit={onSubmit} className="grid gap-4">
        <FormError message={error} />
        <TextField id="password" label="New password" type="password" autoComplete="new-password" required minLength={8} />
        <TextField id="confirm" label="Confirm password" type="password" autoComplete="new-password" required minLength={8} />
        <SubmitButton pending={pending}>Update password</SubmitButton>
      </form>
    </>
  );
}
