import { describe, expect, it } from "vitest";

describe("web dependency baseline", () => {
  it("provides zustand and framer-motion for upcoming gameplay slices", async () => {
    const zustand = await import("zustand");
    const framerMotion = await import("framer-motion");

    expect(typeof zustand.create).toBe("function");
    expect(framerMotion.motion.div).toBeDefined();
  }, 15000);
});
