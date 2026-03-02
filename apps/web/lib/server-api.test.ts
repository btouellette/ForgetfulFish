import { describe, expect, it, vi } from "vitest";

import { ServerApiError, buildServerApiUrl, joinRoom } from "./server-api";

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

describe("server API request errors", () => {
  it("throws ServerApiError with HTTP status", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "room_full" }), {
        status: 409,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    try {
      await joinRoom("11111111-2222-4333-8444-555555555555");
      throw new Error("expected joinRoom to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ServerApiError);
      expect(error).toMatchObject({
        status: 409,
        message: "server request failed (409)"
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
