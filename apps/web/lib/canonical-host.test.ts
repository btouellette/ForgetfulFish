import { describe, expect, it } from "vitest";

import { getCanonicalRedirectUrl } from "./canonical-host";

describe("canonical host", () => {
  it("redirects www host to apex host over https", () => {
    const redirectUrl = getCanonicalRedirectUrl({
      url: new URL("http://www.forgetfulfish.com/auth/verify?from=google"),
      hostHeader: "www.forgetfulfish.com"
    });

    expect(redirectUrl?.toString()).toBe("https://forgetfulfish.com/auth/verify?from=google");
  });

  it("ignores non-www hosts", () => {
    const redirectUrl = getCanonicalRedirectUrl({
      url: new URL("https://forgetfulfish.com/auth/verify"),
      hostHeader: "forgetfulfish.com"
    });

    expect(redirectUrl).toBeNull();
  });

  it("handles host headers with ports", () => {
    const redirectUrl = getCanonicalRedirectUrl({
      url: new URL("http://www.forgetfulfish.com:3000/path"),
      hostHeader: "www.forgetfulfish.com:3000"
    });

    expect(redirectUrl?.toString()).toBe("https://forgetfulfish.com/path");
  });

  it("uses canonical origin from config when provided", () => {
    const redirectUrl = getCanonicalRedirectUrl({
      url: new URL("http://www.forgetfulfish.com/play?room=abc"),
      hostHeader: "www.forgetfulfish.com",
      canonicalOrigin: "https://play.forgetfulfish.com"
    });

    expect(redirectUrl?.toString()).toBe("https://play.forgetfulfish.com/play?room=abc");
  });
});
