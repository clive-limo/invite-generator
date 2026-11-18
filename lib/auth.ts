import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { BETA_ERROR_CODE, BETA_MESSAGE } from "@/lib/beta";
import { isBetaAllowed } from "@/lib/beta-allowlist";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";

// Off for now: new accounts can sign in immediately. Set REQUIRE_EMAIL_VERIFICATION=true
// to make people confirm their address first (verification emails are already wired up).
const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION === "true";

const google =
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
    : undefined;

const betaError = () => new APIError("FORBIDDEN", { code: BETA_ERROR_CODE, message: BETA_MESSAGE });

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your password",
        text: `Hi ${user.name},\n\nSomeone asked to reset the password for your Chenah Invites account. If that was you, use the link below. It expires in an hour.`,
        action: { label: "Reset password", url },
      });
    },
  },
  emailVerification: {
    sendOnSignUp: requireEmailVerification,
    sendOnSignIn: requireEmailVerification,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Confirm your email",
        text: `Hi ${user.name},\n\nConfirm your email address to start creating invites.`,
        action: { label: "Confirm email", url },
      });
    },
  },
  socialProviders: google ? { google } : undefined,
  // Private beta. Email sign-up and sign-in are refused up front with a clear message;
  // the database hooks catch every other way in (Google, accounts from before the beta).
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email" && ctx.path !== "/sign-in/email") return;
      if (!isBetaAllowed(String(ctx.body?.email ?? ""))) throw betaError();
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!isBetaAllowed(user.email)) throw betaError();
        },
      },
    },
    session: {
      create: {
        before: async (session, ctx) => {
          // Through Better Auth's adapter when possible: it sees a user created earlier in the same transaction.
          const user = ctx
            ? await ctx.context.internalAdapter.findUserById(session.userId)
            : await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
          if (!user || !isBetaAllowed(user.email)) throw betaError();
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
