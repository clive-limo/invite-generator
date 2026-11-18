import { afterEach, describe, expect, it, vi } from "vitest";
import { isBetaAllowed } from "@/lib/beta-allowlist";

afterEach(() => vi.unstubAllEnvs());

describe("isBetaAllowed", () => {
  it("lets in only the beta accounts by default, ignoring case and spaces", () => {
    vi.stubEnv("BETA_ALLOWLIST", "");
    expect(isBetaAllowed("clivelimo84@gmail.com")).toBe(true);
    expect(isBetaAllowed(" ChenahDiana001@Gmail.com ")).toBe(true);
    expect(isBetaAllowed("someone@gmail.com")).toBe(false);
    expect(isBetaAllowed("clivelimo84@gmail.com.evil.test")).toBe(false);
  });

  it("adds addresses and whole domains from BETA_ALLOWLIST", () => {
    vi.stubEnv("BETA_ALLOWLIST", "tester@chenah.test, @example.com");
    expect(isBetaAllowed("tester@chenah.test")).toBe(true);
    expect(isBetaAllowed("owner+123@example.com")).toBe(true);
    expect(isBetaAllowed("owner@notexample.com")).toBe(false);
    expect(isBetaAllowed("other@chenah.test")).toBe(false);
  });
});
