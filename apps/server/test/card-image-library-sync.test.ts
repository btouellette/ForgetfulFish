import { describe, expect, it } from "vitest";

import {
  safeCollectorNumber,
  shouldSkipImageLibrarySync
} from "../../../scripts/sync-card-image-library.mjs";

describe("card image library collector number normalization", () => {
  it("drops trailing separator artifacts from special characters", () => {
    expect(safeCollectorNumber("88*")).toBe("88");
  });

  it("falls back when collector number has no alphanumeric content", () => {
    expect(safeCollectorNumber("***")).toBe("unknown");
  });
});

describe("card image library CI safeguards", () => {
  it("skips sync when CI is true", () => {
    expect(shouldSkipImageLibrarySync({ CI: "true" })).toBe(true);
  });

  it("skips sync when running in GitHub Actions", () => {
    expect(shouldSkipImageLibrarySync({ GITHUB_ACTIONS: "true" })).toBe(true);
  });

  it("allows sync outside CI", () => {
    expect(shouldSkipImageLibrarySync({ CI: "false", GITHUB_ACTIONS: "false" })).toBe(false);
  });
});
