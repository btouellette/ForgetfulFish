import { describe, expect, it } from "vitest";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const playRoot = path.resolve(import.meta.dirname, "../components/play");
const rendererRoot = path.resolve(playRoot, "renderer");
const playRoomCssPath = path.resolve(playRoot, "PlayRoom.module.css");

describe("play CSS infrastructure", () => {
  it("creates play component roots and required layout classes", async () => {
    await expect(access(playRoot)).resolves.toBeUndefined();
    await expect(access(rendererRoot)).resolves.toBeUndefined();
    await expect(access(playRoomCssPath)).resolves.toBeUndefined();

    const css = await readFile(playRoomCssPath, "utf8");

    for (const className of [
      "playRoom",
      "lobbyView",
      "gameplayView",
      "statusRail",
      "commandPanel",
      "sidebar",
      "canvasArea"
    ]) {
      expect(css).toContain(`.${className}`);
    }
  });
});
