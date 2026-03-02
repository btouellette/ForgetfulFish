import { describe, expect, it } from "vitest";

import { safeCollectorNumber } from "../../../scripts/sync-card-image-library.mjs";

describe("card image library collector number normalization", () => {
  it("drops trailing separator artifacts from special characters", () => {
    expect(safeCollectorNumber("88*")).toBe("88");
  });

  it("falls back when collector number has no alphanumeric content", () => {
    expect(safeCollectorNumber("***")).toBe("unknown");
  });
});
