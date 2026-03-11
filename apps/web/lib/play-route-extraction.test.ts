import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

const pagePath = path.resolve(import.meta.dirname, "../app/play/[roomId]/page.tsx");
const containerPath = path.resolve(import.meta.dirname, "../components/play/PlayRoomContainer.tsx");
const contextPath = path.resolve(import.meta.dirname, "../components/play/GameStoreContext.tsx");

describe("play route extraction", () => {
  it("keeps the route thin and delegates lifecycle logic to the container/context layer", async () => {
    const [pageSource, containerSource, contextSource] = await Promise.all([
      readFile(pagePath, "utf8"),
      readFile(containerPath, "utf8"),
      readFile(contextPath, "utf8")
    ]);

    expect(pageSource).not.toContain('"use client"');
    expect(pageSource).toContain("PlayRoomContainer");
    expect(pageSource).not.toContain("useEffect(");
    expect(pageSource).not.toContain("useState(");
    expect(pageSource.split("\n").length).toBeLessThan(40);

    expect(containerSource).toContain('"use client"');
    expect(containerSource).toContain("createGameSessionAdapter");
    expect(containerSource).toContain("GameStoreProvider");
    expect(containerSource).toContain("useGameStore");

    expect(contextSource).toContain("GameStoreProvider");
    expect(contextSource).toContain("useGameStore");
  });
});
