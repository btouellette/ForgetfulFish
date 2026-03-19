// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { GameplayPendingChoice, PlayerGameView } from "@forgetful-fish/realtime-contract";

import { CommandPanel } from "./CommandPanel";

function createPendingChoice(
  overrides: Partial<GameplayPendingChoice> = {}
): GameplayPendingChoice {
  return {
    id: "choice-1",
    type: "CHOOSE_YES_NO",
    forPlayer: "player-1",
    prompt: "Resolve the spell?",
    constraints: {},
    ...overrides
  };
}

function createGameView(overrides: Partial<PlayerGameView> = {}): PlayerGameView {
  return {
    viewerPlayerId: "player-1",
    stateVersion: 2,
    turnState: {
      phase: "MAIN_1",
      activePlayerId: "player-1",
      priorityPlayerId: "player-1"
    },
    viewer: {
      id: "player-1",
      life: 20,
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
      hand: [],
      handCount: 0
    },
    opponent: {
      id: "player-2",
      life: 20,
      manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
      handCount: 0
    },
    zones: [],
    objectPool: {},
    stack: [],
    pendingChoice: null,
    ...overrides
  };
}

describe("CommandPanel", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
  });

  function renderInteractivePanel(props: Partial<React.ComponentProps<typeof CommandPanel>> = {}) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const mergedProps: React.ComponentProps<typeof CommandPanel> = {
      viewerPlayerId: "player-1",
      gameView: createGameView(),
      pendingChoice: null,
      viewerHasPriority: true,
      isSubmitting: false,
      error: null,
      autoPassEnabled: false,
      onAutoPassEnabledChange: vi.fn(),
      onPassPriority: vi.fn(),
      onConcede: vi.fn(),
      onMakeChoice: vi.fn(),
      onClearError: vi.fn(),
      ...props
    };

    act(() => {
      root?.render(<CommandPanel {...mergedProps} />);
    });

    return { mergedProps, container };
  }

  it("renders pass-priority and concede actions", () => {
    const html = renderToStaticMarkup(
      <CommandPanel
        viewerPlayerId="player-1"
        gameView={createGameView()}
        pendingChoice={null}
        viewerHasPriority={true}
        isSubmitting={false}
        error={null}
        autoPassEnabled={false}
        onAutoPassEnabledChange={vi.fn()}
        onPassPriority={vi.fn()}
        onConcede={vi.fn()}
        onMakeChoice={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(html).toContain("Pass priority");
    expect(html).toContain("Concede game");
    expect(html).toContain("Auto-pass priority when no apparent actions");
  });

  it("renders yes-no pending choice controls without advanced widgets", () => {
    const html = renderToStaticMarkup(
      <CommandPanel
        viewerPlayerId="player-1"
        gameView={createGameView()}
        pendingChoice={createPendingChoice()}
        viewerHasPriority={true}
        isSubmitting={false}
        error={null}
        autoPassEnabled={false}
        onAutoPassEnabledChange={vi.fn()}
        onPassPriority={vi.fn()}
        onConcede={vi.fn()}
        onMakeChoice={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(html).toContain("Resolve the spell?");
    expect(html).toContain("Yes");
    expect(html).toContain("No");
    expect(html).not.toContain("select");
  });

  it("disables gameplay actions while keeping the error banner dismissible", () => {
    const html = renderToStaticMarkup(
      <CommandPanel
        viewerPlayerId="player-1"
        gameView={createGameView()}
        pendingChoice={createPendingChoice()}
        viewerHasPriority={true}
        isSubmitting={true}
        error="Priority pass failed"
        autoPassEnabled={false}
        onAutoPassEnabledChange={vi.fn()}
        onPassPriority={vi.fn()}
        onConcede={vi.fn()}
        onMakeChoice={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(html).toContain("Priority pass failed");
    expect(html).toMatch(/<button[^>]*>Dismiss<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Dismiss<\/button>/);
    expect(html).toContain("disabled");
  });

  it("hides pending-choice controls when the choice belongs to the opponent", () => {
    const html = renderToStaticMarkup(
      <CommandPanel
        viewerPlayerId="player-1"
        gameView={createGameView()}
        pendingChoice={createPendingChoice({ forPlayer: "player-2" })}
        viewerHasPriority={true}
        isSubmitting={false}
        error={null}
        autoPassEnabled={false}
        onAutoPassEnabledChange={vi.fn()}
        onPassPriority={vi.fn()}
        onConcede={vi.fn()}
        onMakeChoice={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(html).toContain("Resolve the spell?");
    expect(html).toContain("Waiting for opponent choice.");
    expect(html).not.toContain("Yes");
    expect(html).not.toContain("No");
  });

  it("renders an invalid choice payload message for malformed constraints", () => {
    const html = renderToStaticMarkup(
      <CommandPanel
        viewerPlayerId="player-1"
        gameView={createGameView()}
        pendingChoice={createPendingChoice({
          type: "ORDER_CARDS",
          constraints: { min: 1, max: 1 }
        })}
        viewerHasPriority={true}
        isSubmitting={false}
        error={null}
        autoPassEnabled={false}
        onAutoPassEnabledChange={vi.fn()}
        onPassPriority={vi.fn()}
        onConcede={vi.fn()}
        onMakeChoice={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(html).toContain("Choice payload is invalid. Waiting for refresh.");
  });

  it("renders CHOOSE_CARDS candidates with selectable toggles", () => {
    const { container } = renderInteractivePanel({
      pendingChoice: createPendingChoice({
        type: "CHOOSE_CARDS",
        prompt: "Choose cards",
        constraints: { candidates: ["obj-a", "obj-b"], min: 1, max: 2 }
      })
    });

    const optionA = container?.querySelector(
      '[data-testid="choose-card-obj-a"]'
    ) as HTMLInputElement | null;
    const optionB = container?.querySelector(
      '[data-testid="choose-card-obj-b"]'
    ) as HTMLInputElement | null;

    expect(optionA).toBeTruthy();
    expect(optionB).toBeTruthy();
    expect(optionA?.checked).toBe(false);

    act(() => {
      optionA?.click();
    });
    expect(optionA?.checked).toBe(true);

    act(() => {
      optionA?.click();
    });
    expect(optionA?.checked).toBe(false);
  });

  it("enforces CHOOSE_CARDS min/max before enabling submit", () => {
    const { container } = renderInteractivePanel({
      pendingChoice: createPendingChoice({
        type: "CHOOSE_CARDS",
        prompt: "Pick exactly one",
        constraints: { candidates: ["obj-a", "obj-b"], min: 1, max: 1 }
      })
    });

    const optionA = container?.querySelector(
      '[data-testid="choose-card-obj-a"]'
    ) as HTMLInputElement | null;
    const optionB = container?.querySelector(
      '[data-testid="choose-card-obj-b"]'
    ) as HTMLInputElement | null;
    const submitButton = container?.querySelector(
      '[data-testid="choose-cards-submit"]'
    ) as HTMLButtonElement | null;

    expect(submitButton?.disabled).toBe(true);

    act(() => {
      optionA?.click();
    });
    expect(submitButton?.disabled).toBe(false);

    act(() => {
      optionB?.click();
    });
    expect(optionB?.checked).toBe(false);
    expect(submitButton?.disabled).toBe(false);
  });

  it("submits CHOOSE_CARDS MAKE_CHOICE payload", () => {
    const onMakeChoice = vi.fn();
    const { container } = renderInteractivePanel({
      onMakeChoice,
      pendingChoice: createPendingChoice({
        type: "CHOOSE_CARDS",
        prompt: "Pick cards",
        constraints: { candidates: ["obj-a", "obj-b"], min: 1, max: 2 }
      })
    });

    const optionA = container?.querySelector(
      '[data-testid="choose-card-obj-a"]'
    ) as HTMLInputElement | null;
    const submitButton = container?.querySelector(
      '[data-testid="choose-cards-submit"]'
    ) as HTMLButtonElement | null;

    act(() => {
      optionA?.click();
    });
    act(() => {
      submitButton?.click();
    });

    expect(onMakeChoice).toHaveBeenCalledWith({
      type: "CHOOSE_CARDS",
      selected: ["obj-a"],
      min: 1,
      max: 2
    });
  });

  it("clears stale local choose-card selection when server pending choice changes", () => {
    const { container } = renderInteractivePanel({
      pendingChoice: createPendingChoice({
        id: "choice-1",
        type: "CHOOSE_CARDS",
        prompt: "Pick cards",
        constraints: { candidates: ["obj-a", "obj-b"], min: 1, max: 1 }
      })
    });

    const firstChoiceOption = container?.querySelector(
      '[data-testid="choose-card-obj-a"]'
    ) as HTMLInputElement | null;
    expect(firstChoiceOption).toBeTruthy();

    act(() => {
      firstChoiceOption?.click();
    });
    expect(firstChoiceOption?.checked).toBe(true);

    act(() => {
      root?.render(
        <CommandPanel
          viewerPlayerId="player-1"
          gameView={createGameView()}
          pendingChoice={createPendingChoice({
            id: "choice-2",
            type: "CHOOSE_CARDS",
            prompt: "Pick cards",
            constraints: { candidates: ["obj-c", "obj-d"], min: 1, max: 1 }
          })}
          viewerHasPriority={true}
          isSubmitting={false}
          error={null}
          autoPassEnabled={false}
          onAutoPassEnabledChange={vi.fn()}
          onPassPriority={vi.fn()}
          onConcede={vi.fn()}
          onMakeChoice={vi.fn()}
          onClearError={vi.fn()}
        />
      );
    });

    const nextChoiceOption = container?.querySelector(
      '[data-testid="choose-card-obj-c"]'
    ) as HTMLInputElement | null;
    expect(nextChoiceOption).toBeTruthy();
    expect(nextChoiceOption?.checked).toBe(false);
  });

  it("renders NAME_CARD input and submits trimmed card name", () => {
    const onMakeChoice = vi.fn();
    const { container } = renderInteractivePanel({
      onMakeChoice,
      pendingChoice: createPendingChoice({
        type: "NAME_CARD",
        prompt: "Name a card",
        constraints: {}
      })
    });

    const input = container?.querySelector(
      '[data-testid="name-card-input"]'
    ) as HTMLInputElement | null;
    const submitButton = container?.querySelector(
      '[data-testid="name-card-submit"]'
    ) as HTMLButtonElement | null;

    expect(input).toBeTruthy();
    expect(submitButton?.disabled).toBe(true);

    act(() => {
      if (input) {
        const valueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        valueSetter?.call(input, "  Island  ");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    expect(submitButton?.disabled).toBe(false);

    act(() => {
      submitButton?.click();
    });

    expect(onMakeChoice).toHaveBeenCalledWith({ type: "NAME_CARD", cardName: "Island" });
  });

  it("supports optional CHOOSE_CARDS flow with min 0 and max 1", () => {
    const onMakeChoice = vi.fn();
    const { container } = renderInteractivePanel({
      onMakeChoice,
      pendingChoice: createPendingChoice({
        type: "CHOOSE_CARDS",
        prompt: "You may choose a card",
        constraints: { candidates: ["obj-a"], min: 0, max: 1 }
      })
    });

    const submitButton = container?.querySelector(
      '[data-testid="choose-cards-submit"]'
    ) as HTMLButtonElement | null;

    expect(submitButton?.disabled).toBe(false);

    act(() => {
      submitButton?.click();
    });

    expect(onMakeChoice).toHaveBeenCalledWith({
      type: "CHOOSE_CARDS",
      selected: [],
      min: 0,
      max: 1
    });
  });

  it("renders ORDER_CARDS entries with reorder controls", () => {
    const { container } = renderInteractivePanel({
      pendingChoice: createPendingChoice({
        type: "ORDER_CARDS",
        prompt: "Put cards back on top",
        constraints: { cards: ["obj-a", "obj-b", "obj-c"] }
      })
    });

    expect(container?.textContent).toContain("obj-a");
    expect(container?.textContent).toContain("obj-b");
    expect(container?.textContent).toContain("obj-c");

    const moveUpButton = container?.querySelector('[data-testid="order-up-obj-b"]');
    const moveDownButton = container?.querySelector('[data-testid="order-down-obj-b"]');

    expect(moveUpButton).toBeTruthy();
    expect(moveDownButton).toBeTruthy();
  });

  it("reorders ORDER_CARDS entries deterministically via up/down controls", () => {
    const { container } = renderInteractivePanel({
      pendingChoice: createPendingChoice({
        type: "ORDER_CARDS",
        prompt: "Order cards",
        constraints: { cards: ["obj-a", "obj-b", "obj-c"] }
      })
    });

    const moveUpButton = container?.querySelector(
      '[data-testid="order-up-obj-c"]'
    ) as HTMLButtonElement | null;

    act(() => {
      moveUpButton?.click();
    });

    const orderedLabels = Array.from(
      container?.querySelectorAll('[data-testid^="order-label-"]') ?? []
    ).map((element) => element.textContent);
    expect(orderedLabels).toEqual(["obj-a", "obj-c", "obj-b"]);
  });

  it("submits ORDER_CARDS MAKE_CHOICE payload", () => {
    const onMakeChoice = vi.fn();
    const { container } = renderInteractivePanel({
      onMakeChoice,
      pendingChoice: createPendingChoice({
        type: "ORDER_CARDS",
        prompt: "Order cards",
        constraints: { cards: ["obj-a", "obj-b", "obj-c"] }
      })
    });

    const moveUpButton = container?.querySelector(
      '[data-testid="order-up-obj-c"]'
    ) as HTMLButtonElement | null;
    const submitButton = container?.querySelector(
      '[data-testid="order-cards-submit"]'
    ) as HTMLButtonElement | null;

    act(() => {
      moveUpButton?.click();
    });

    act(() => {
      submitButton?.click();
    });

    expect(onMakeChoice).toHaveBeenCalledWith({
      type: "ORDER_CARDS",
      ordered: ["obj-a", "obj-c", "obj-b"]
    });
  });

  it("renders the auto-pass checkbox as checked when enabled", () => {
    const html = renderToStaticMarkup(
      <CommandPanel
        viewerPlayerId="player-1"
        gameView={createGameView()}
        pendingChoice={null}
        viewerHasPriority={true}
        isSubmitting={false}
        error={null}
        autoPassEnabled={true}
        onAutoPassEnabledChange={vi.fn()}
        onPassPriority={vi.fn()}
        onConcede={vi.fn()}
        onMakeChoice={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(html).toContain("checked");
  });

  it("renders a will-auto-pass hint when enabled and no actions are visible", () => {
    const html = renderToStaticMarkup(
      <CommandPanel
        viewerPlayerId="player-1"
        gameView={createGameView()}
        pendingChoice={null}
        viewerHasPriority={true}
        isSubmitting={false}
        error={null}
        autoPassEnabled={true}
        onAutoPassEnabledChange={vi.fn()}
        onPassPriority={vi.fn()}
        onConcede={vi.fn()}
        onMakeChoice={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(html).toContain("Auto-pass will pass priority automatically on this state.");
  });

  it("renders an apparent-action hint when enabled but a visible play exists", () => {
    const html = renderToStaticMarkup(
      <CommandPanel
        viewerPlayerId="player-1"
        gameView={createGameView({
          viewer: {
            id: "player-1",
            life: 20,
            manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
            hand: [
              {
                id: "hand-island",
                zcc: 0,
                cardDefId: "island",
                owner: "player-1",
                controller: "player-1",
                counters: {},
                damage: 0,
                tapped: false,
                summoningSick: false,
                attachments: [],
                zone: { kind: "hand", scope: "player", playerId: "player-1" }
              }
            ],
            handCount: 1
          }
        })}
        pendingChoice={null}
        viewerHasPriority={true}
        isSubmitting={false}
        error={null}
        autoPassEnabled={true}
        onAutoPassEnabledChange={vi.fn()}
        onPassPriority={vi.fn()}
        onConcede={vi.fn()}
        onMakeChoice={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(html).toContain("Auto-pass is holding because you have an apparent action available.");
  });

  it("renders an uncertainty hint when enabled but the client cannot verify actions safely", () => {
    const html = renderToStaticMarkup(
      <CommandPanel
        viewerPlayerId="player-1"
        gameView={createGameView({
          viewer: {
            id: "player-1",
            life: 20,
            manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
            hand: [
              {
                id: "future-card",
                zcc: 0,
                cardDefId: "future-card",
                owner: "player-1",
                controller: "player-1",
                counters: {},
                damage: 0,
                tapped: false,
                summoningSick: false,
                attachments: [],
                zone: { kind: "hand", scope: "player", playerId: "player-1" }
              }
            ],
            handCount: 1
          }
        })}
        pendingChoice={null}
        viewerHasPriority={true}
        isSubmitting={false}
        error={null}
        autoPassEnabled={true}
        onAutoPassEnabledChange={vi.fn()}
        onPassPriority={vi.fn()}
        onConcede={vi.fn()}
        onMakeChoice={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(html).toContain(
      "Auto-pass is holding because the client cannot verify every action safely."
    );
  });

  it("forwards auto-pass checkbox changes", () => {
    const onAutoPassEnabledChange = vi.fn();
    const { container } = renderInteractivePanel({ onAutoPassEnabledChange });

    const checkbox = container?.querySelector(
      '[data-testid="auto-pass-checkbox"]'
    ) as HTMLInputElement | null;

    expect(checkbox?.checked).toBe(false);

    act(() => {
      checkbox?.click();
    });

    expect(onAutoPassEnabledChange).toHaveBeenCalledWith(true);
  });
});
