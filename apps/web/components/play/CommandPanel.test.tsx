import React from "react";
import { describe, expect, it, vi } from "vitest";
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
  it("renders pass-priority and concede actions", () => {
    const html = renderToStaticMarkup(
      <CommandPanel
        pendingChoice={null}
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
        pendingChoice={createPendingChoice()}
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
        pendingChoice={createPendingChoice()}
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
});
