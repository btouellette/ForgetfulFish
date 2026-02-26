import { describe, expect, it } from "vitest";

import {
  AUTH_VERIFY_PATH,
  buildAuthProviders,
  getDefaultCallbackUrl,
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

  it("always enables email provider", () => {
    const providers = buildAuthProviders({
      authEmailFrom: "noreply@example.com",
      authEmailServer: "smtp://localhost:2525",
      googleClientId: "",
      googleClientSecret: ""
    });

    expect(providers).toContainEqual(expect.objectContaining({ id: "email", name: "Email" }));
  });

  it("enables google provider only when google credentials are set", () => {
    const withoutGoogle = buildAuthProviders({
      authEmailFrom: "noreply@example.com",
      authEmailServer: "smtp://localhost:2525",
      googleClientId: "",
      googleClientSecret: ""
    });

    expect(withoutGoogle).not.toContainEqual(
      expect.objectContaining({ id: "google", name: "Google" })
    );

    const withGoogle = buildAuthProviders({
      authEmailFrom: "noreply@example.com",
      authEmailServer: "smtp://localhost:2525",
      googleClientId: "client-id",
      googleClientSecret: "client-secret"
    });

    expect(withGoogle).toContainEqual(expect.objectContaining({ id: "google", name: "Google" }));
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
