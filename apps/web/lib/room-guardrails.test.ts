import { describe, expect, it } from "vitest";

import {
  getReadyUpdateStatusMessage,
  getRealtimeGuardrailMessage,
  shouldPollLobbyWhileDisconnected
} from "./room-guardrails";

describe("shouldPollLobbyWhileDisconnected", () => {
  it("polls while websocket is reconnecting or offline", () => {
    expect(shouldPollLobbyWhileDisconnected("reconnecting")).toBe(true);
    expect(shouldPollLobbyWhileDisconnected("offline")).toBe(true);
  });

  it("does not poll while websocket is connecting or connected", () => {
    expect(shouldPollLobbyWhileDisconnected("connecting")).toBe(false);
    expect(shouldPollLobbyWhileDisconnected("connected")).toBe(false);
  });
});

describe("getRealtimeGuardrailMessage", () => {
  it("returns no guardrail text while connected", () => {
    expect(getRealtimeGuardrailMessage("connected")).toBeNull();
  });

  it("returns a reconnecting warning", () => {
    expect(getRealtimeGuardrailMessage("reconnecting")).toContain("reconnecting");
    expect(getRealtimeGuardrailMessage("reconnecting")).toContain("not update");
  });

  it("returns an offline warning", () => {
    expect(getRealtimeGuardrailMessage("offline")).toContain("offline");
    expect(getRealtimeGuardrailMessage("offline")).toContain("not update");
  });
});

describe("getReadyUpdateStatusMessage", () => {
  it("uses a normal success message when live sync is connected", () => {
    expect(getReadyUpdateStatusMessage(true, "connected")).toBe("You are now ready.");
    expect(getReadyUpdateStatusMessage(false, "connected")).toBe("You are now not ready.");
  });

  it("uses a guardrail success message when live sync is unavailable", () => {
    expect(getReadyUpdateStatusMessage(true, "reconnecting")).toContain("saved");
    expect(getReadyUpdateStatusMessage(true, "reconnecting")).toContain("reconnecting");
    expect(getReadyUpdateStatusMessage(false, "offline")).toContain("saved");
    expect(getReadyUpdateStatusMessage(false, "offline")).toContain("offline");
  });
});
