// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { GameplayPendingChoice } from "@forgetful-fish/realtime-contract";

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
      pendingChoice: null,
      viewerHasPriority: true,
      isSubmitting: false,
      error: null,
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
        pendingChoice={null}
        viewerHasPriority={true}
        isSubmitting={false}
        error={null}
        onPassPriority={vi.fn()}
        onConcede={vi.fn()}
        onMakeChoice={vi.fn()}
        onClearError={vi.fn()}
      />
    );

    expect(html).toContain("Pass priority");
    expect(html).toContain("Concede game");
  });

  it("renders yes-no pending choice controls without advanced widgets", () => {
    const html = renderToStaticMarkup(
      <CommandPanel
        viewerPlayerId="player-1"
        pendingChoice={createPendingChoice()}
        viewerHasPriority={true}
        isSubmitting={false}
        error={null}
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
        pendingChoice={createPendingChoice()}
        viewerHasPriority={true}
        isSubmitting={true}
        error="Priority pass failed"
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
        pendingChoice={createPendingChoice({ forPlayer: "player-2" })}
        viewerHasPriority={true}
        isSubmitting={false}
        error={null}
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
        pendingChoice={createPendingChoice({
          type: "ORDER_CARDS",
          constraints: { min: 1, max: 1 }
        })}
        viewerHasPriority={true}
        isSubmitting={false}
        error={null}
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
          pendingChoice={createPendingChoice({
            id: "choice-2",
            type: "CHOOSE_CARDS",
            prompt: "Pick cards",
            constraints: { candidates: ["obj-c", "obj-d"], min: 1, max: 1 }
          })}
          viewerHasPriority={true}
          isSubmitting={false}
          error={null}
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
});
