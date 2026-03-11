import { describe, expect, it } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createGameStore } from "../../lib/stores/game-store";
import { GameStoreProvider, useGameStore } from "./GameStoreContext";

function SelectedLifecycle() {
  const lifecycleState = useGameStore((state) => state.lifecycleState);

  return createElement("span", null, lifecycleState);
}

describe("GameStoreContext", () => {
  it("throws a clear error when used outside the provider", () => {
    expect(() => renderToStaticMarkup(createElement(SelectedLifecycle))).toThrow(
      /GameStoreProvider/
    );
  });

  it("provides selected store state inside the provider", () => {
    const store = createGameStore();

    store.getState().applyConnectionStatus("connected");

    const html = renderToStaticMarkup(
      <GameStoreProvider store={store}>
        <SelectedLifecycle />
      </GameStoreProvider>
    );

    expect(html).toContain("joining");
  });
});
