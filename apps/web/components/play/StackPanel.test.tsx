// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

import { StackPanel } from "./StackPanel";

function createStackItem(
  objectId: string,
  cardDefId: string,
  name = cardDefId,
  controller = "player-2"
): {
  stackItem: PlayerGameView["stack"][number];
  objectView: PlayerGameView["objectPool"][string];
} {
  return {
    stackItem: {
      object: { id: objectId, zcc: 0 },
      controller
    },
    objectView: {
      id: objectId,
      zcc: 0,
      cardDefId,
      name,
      owner: controller,
      controller,
      counters: {},
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      zone: { kind: "stack", scope: "shared" }
    }
  };
}

describe("StackPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
  });

  it("renders stack items with stable labels resolved from objectPool", () => {
    const first = createStackItem("obj-stack-1", "brainstorm", "Brainstorm");
    const second = createStackItem("obj-stack-2", "memory-lapse", "Memory Lapse");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <StackPanel
          stack={[first.stackItem, second.stackItem]}
          objectPool={{
            [first.objectView.id]: first.objectView,
            [second.objectView.id]: second.objectView
          }}
          viewerHasPriority={true}
          isSubmitting={false}
          targetingCardLabel={null}
          onSelectStackTarget={vi.fn()}
          onCancelTargetSelection={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain("Brainstorm");
    expect(container.textContent).toContain("Memory Lapse");
    expect(container.textContent).not.toContain("obj-stack-1");
    expect(container.textContent).not.toContain("obj-stack-2");
  });

  it("submits selected stack object while target mode is active", () => {
    const onSelectStackTarget = vi.fn();
    const item = createStackItem("obj-stack-1", "brainstorm");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <StackPanel
          stack={[item.stackItem]}
          objectPool={{ [item.objectView.id]: item.objectView }}
          viewerHasPriority={true}
          isSubmitting={false}
          targetingCardLabel="memory-lapse"
          onSelectStackTarget={onSelectStackTarget}
          onCancelTargetSelection={vi.fn()}
        />
      );
    });

    const targetButton = container.querySelector(
      '[data-testid="stack-target-obj-stack-1"]'
    ) as HTMLButtonElement | null;
    expect(targetButton).toBeTruthy();

    act(() => {
      targetButton?.click();
    });

    expect(onSelectStackTarget).toHaveBeenCalledWith({
      kind: "object",
      object: { id: "obj-stack-1", zcc: 0 }
    });
  });

  it("disambiguates duplicate stack spell names without exposing raw ids", () => {
    const first = createStackItem("obj-stack-1", "brainstorm", "Brainstorm");
    const second = createStackItem("obj-stack-2", "brainstorm", "Brainstorm");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <StackPanel
          stack={[first.stackItem, second.stackItem]}
          objectPool={{
            [first.objectView.id]: first.objectView,
            [second.objectView.id]: second.objectView
          }}
          viewerHasPriority={true}
          isSubmitting={false}
          targetingCardLabel={null}
          onSelectStackTarget={vi.fn()}
          onCancelTargetSelection={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain("Brainstorm #1");
    expect(container.textContent).toContain("Brainstorm #2");
    expect(container.textContent).not.toContain("obj-stack-1");
    expect(container.textContent).not.toContain("obj-stack-2");
  });
});
