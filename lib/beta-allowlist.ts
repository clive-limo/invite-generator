import "server-only";

/** The only people who can create an account or sign in during the private beta. */
const BETA_EMAILS = ["clivelimo84@gmail.com", "chenahdiana001@gmail.com"];

/**
 * BETA_ALLOWLIST adds more, comma-separated: full addresses, or "@domain" for a whole domain
 * (local dev allows "@example.com" so the e2e tests can create accounts).
 */
export function isBetaAllowed(email: string): boolean {
  const address = email.trim().toLowerCase();
  const extra = (process.env.BETA_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return [...BETA_EMAILS, ...extra].some((entry) => (entry.startsWith("@") ? address.endsWith(entry) : address === entry));
}
