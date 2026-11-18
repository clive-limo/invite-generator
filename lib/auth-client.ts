import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";
