"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthHeading, FormError, GoogleButton, safeNext, SubmitButton, TextField } from "@/components/auth/auth-form-parts";
import { authClient } from "@/lib/auth-client";

export function SignUpForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    setPending(true);
    setError(null);
    const { data, error } = await authClient.signUp.email({
      name: String(form.get("name")),
      email,
      password: String(form.get("password")),
      callbackURL: next,
    });
    setPending(false);
    if (error) {
      setError(error.message ?? "Couldn't create your account");
      return;
    }
    // With email verification off the account is signed in straight away; otherwise
    // there's no session until the confirmation link is opened.
    if (data?.token) {
      router.replace(next);
      router.refresh();
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto size-10 text-brand" />
        <AuthHeading title="Check your inbox" />
        <p className="-mt-4 text-sm text-muted-foreground">
          We sent a confirmation link to <span className="font-medium text-foreground">{sentTo}</span>. Open it on this
          device to finish signing up.
        </p>
      </div>
    );
  }

  return (
    <>
      <AuthHeading title="Create your account" description="Free to start. Your first invite takes about two minutes." />
      <form onSubmit={onSubmit} className="grid gap-4">
        <GoogleButton callbackURL={next} />
        <FormError message={error} />
        <TextField id="name" label="Name" autoComplete="name" required maxLength={80} />
        <TextField id="email" label="Email" type="email" autoComplete="email" required />
        <TextField id="password" label="Password" type="password" autoComplete="new-password" required minLength={8} placeholder="At least 8 characters" />
        <SubmitButton pending={pending}>Create account</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
