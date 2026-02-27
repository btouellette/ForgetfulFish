import { describe, expect, it } from "vitest";

import { buildServerApiUrl } from "./server-api";

describe("buildServerApiUrl", () => {
  it("uses relative path when no base URL is configured", () => {
    expect(buildServerApiUrl("/api/me", "")).toBe("/api/me");
  });

  it("joins base URL and path", () => {
    expect(buildServerApiUrl("/api/me", "http://localhost:4000")).toBe(
      "http://localhost:4000/api/me"
    );
  });

  it("trims trailing slash from base URL", () => {
    expect(buildServerApiUrl("/api/me", "https://forgetfulfish.com/")).toBe(
      "https://forgetfulfish.com/api/me"
    );
  });
});
