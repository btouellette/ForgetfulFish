import { describe, expect, it } from "vitest";

import {
  AUTH_VERIFY_PATH,
  getDefaultCallbackUrl,
  isGoogleAuthEnabled,
  resolveAuthRedirect
} from "./auth-config";

describe("auth config", () => {
  it("uses static auth verification page as default callback", () => {
    expect(AUTH_VERIFY_PATH).toBe("/auth/verify");
    expect(getDefaultCallbackUrl({ googleCallback: "" })).toBe("/auth/verify");
  });

  it("uses GOOGLE_CALLBACK when configured", () => {
    expect(
      getDefaultCallbackUrl({
        googleCallback: "https://www.forgetfulfish.com/auth/google/callback"
      })
    ).toBe("https://www.forgetfulfish.com/auth/google/callback");
  });

  it("treats blank google credentials as disabled", () => {
    expect(
      isGoogleAuthEnabled({
        googleClientId: "   ",
        googleClientSecret: "client-secret"
      })
    ).toBe(false);
    expect(
      isGoogleAuthEnabled({
        googleClientId: "client-id",
        googleClientSecret: "   "
      })
    ).toBe(false);
  });

  it("keeps same-origin redirects and blocks unknown external ones", () => {
    const baseUrl = "http://localhost:3000";
    const allowedExternalCallbackUrl = "https://www.forgetfulfish.com/auth/google/callback";

    expect(resolveAuthRedirect({ url: "/lobby", baseUrl, allowedExternalCallbackUrl })).toBe(
      "http://localhost:3000/lobby"
    );
    expect(resolveAuthRedirect({ url: "http://localhost:3000/play", baseUrl })).toBe(
      "http://localhost:3000/play"
    );
    expect(
      resolveAuthRedirect({
        url: "https://www.forgetfulfish.com/auth/google/callback",
        baseUrl,
        allowedExternalCallbackUrl
      })
    ).toBe("https://www.forgetfulfish.com/auth/google/callback");
    expect(resolveAuthRedirect({ url: "https://evil.example/phish", baseUrl })).toBe(
      "http://localhost:3000/auth/verify"
    );
  });
});
