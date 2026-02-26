import { afterEach, describe, expect, it } from "vitest";

import { getAuthEnvironment } from "./auth-env";

const originalEnv = { ...process.env };

function setBaseEnvironment() {
  process.env.AUTH_SECRET = "secret";
  process.env.AUTH_URL = "https://forgetfulfish.com";
  process.env.AUTH_EMAIL_FROM = "Forgetful Fish <noreply@forgetfulfish.com>";
  process.env.AUTH_EMAIL_SERVER = "smtp://localhost:1025";
  process.env.GOOGLE_CLIENT_ID = "";
  process.env.GOOGLE_CLIENT_SECRET = "";
  process.env.GOOGLE_CALLBACK = "";
}

describe("getAuthEnvironment", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns validated auth environment", () => {
    setBaseEnvironment();

    const env = getAuthEnvironment();

    expect(env.authSecret).toBe("secret");
    expect(env.authUrl).toBe("https://forgetfulfish.com");
  });

  it("throws when required values are missing", () => {
    setBaseEnvironment();
    process.env.AUTH_SECRET = "   ";

    expect(() => getAuthEnvironment()).toThrow(
      "Missing required auth environment variable: AUTH_SECRET"
    );
  });

  it("throws when url values are invalid", () => {
    setBaseEnvironment();
    process.env.AUTH_URL = "not-a-url";

    expect(() => getAuthEnvironment()).toThrow(
      "Invalid URL in auth environment variable: AUTH_URL"
    );
  });

  it("requires both google credentials when one is set", () => {
    setBaseEnvironment();
    process.env.GOOGLE_CLIENT_ID = "google-id";

    expect(() => getAuthEnvironment()).toThrow(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set or both be empty"
    );
  });
});
