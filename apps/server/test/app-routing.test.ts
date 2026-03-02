import { describe, expect, it } from "vitest";

import { buildServer } from "../src/app";

describe("server routing", () => {
  it("returns health check payload", async () => {
    const app = buildServer();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/health"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    } finally {
      await app.close();
    }
  });

  it("rejects POST routes without authorizeRequest preHandler", async () => {
    const app = buildServer();

    try {
      expect(() => {
        app.post("/api/public", async () => ({ ok: true }));
      }).toThrow('POST route "/api/public" must use authorizeRequest preHandler');
    } finally {
      await app.close();
    }
  });

  it("rejects other mutating routes without authorizeRequest preHandler", async () => {
    const app = buildServer();

    try {
      expect(() => {
        app.put("/api/public-put", async () => ({ ok: true }));
      }).toThrow('PUT route "/api/public-put" must use authorizeRequest preHandler');

      expect(() => {
        app.patch("/api/public-patch", async () => ({ ok: true }));
      }).toThrow('PATCH route "/api/public-patch" must use authorizeRequest preHandler');

      expect(() => {
        app.delete("/api/public-delete", async () => ({ ok: true }));
      }).toThrow('DELETE route "/api/public-delete" must use authorizeRequest preHandler');
    } finally {
      await app.close();
    }
  });

  it("returns canonical 404 payload for unknown routes", async () => {
    const app = buildServer();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/.env"
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "not found" });
    } finally {
      await app.close();
    }
  });
});
