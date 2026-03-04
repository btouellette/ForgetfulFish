import { describe, expect, it } from "vitest";

import {
  COMMAND_TYPES,
  type BlockerAssignment,
  type ChoicePayload,
  type Command,
  type Mode,
  type Target
} from "../../src/commands/command";

function sampleChoicePayloads(): ChoicePayload[] {
  return [
    { type: "CHOOSE_CARDS", selected: ["obj-1"], min: 1, max: 2 },
    { type: "ORDER_CARDS", ordered: ["obj-1", "obj-2"] },
    { type: "NAME_CARD", cardName: "Island" },
    { type: "CHOOSE_REPLACEMENT", replacementId: "replacement-1" },
    { type: "CHOOSE_MODE", mode: { id: "mode-a" } },
    { type: "CHOOSE_TARGET", target: { kind: "player", playerId: "p2" } },
    { type: "CHOOSE_YES_NO", accepted: true },
    { type: "ORDER_TRIGGERS", triggerIds: ["trigger-a", "trigger-b"] }
  ];
}

function sampleCommands(): Command[] {
  const targets: Target[] = [
    { kind: "object", object: { id: "obj-1", zcc: 0 } },
    { kind: "player", playerId: "p2" }
  ];

  return [
    {
      type: "CAST_SPELL",
      cardId: "obj-1",
      targets,
      modePick: { id: "default" }
    },
    {
      type: "ACTIVATE_ABILITY",
      sourceId: "obj-2",
      abilityIndex: 0,
      targets
    },
    { type: "PASS_PRIORITY" },
    { type: "MAKE_CHOICE", payload: sampleChoicePayloads()[0]! },
    { type: "DECLARE_ATTACKERS", attackers: ["obj-3", "obj-4"] },
    {
      type: "DECLARE_BLOCKERS",
      assignments: [{ attackerId: "obj-3", blockerIds: ["obj-5"] }]
    },
    { type: "PLAY_LAND", cardId: "obj-6" },
    { type: "CONCEDE" }
  ];
}

function assertExhaustive(command: Command): Command["type"] {
  switch (command.type) {
    case "CAST_SPELL":
    case "ACTIVATE_ABILITY":
    case "PASS_PRIORITY":
    case "MAKE_CHOICE":
    case "DECLARE_ATTACKERS":
    case "DECLARE_BLOCKERS":
    case "PLAY_LAND":
    case "CONCEDE":
      return command.type;
    default: {
      const neverCommand: never = command;
      return neverCommand;
    }
  }
}

describe("commands/command", () => {
  it("constructs each command variant with valid data", () => {
    const commands = sampleCommands();

    expect(commands).toHaveLength(8);
    expect(new Set(commands.map((command) => command.type))).toEqual(new Set(COMMAND_TYPES));
  });

  it("supports all required ChoicePayload responses", () => {
    const payloads = sampleChoicePayloads();
    const payloadTypes = new Set(payloads.map((payload) => payload.type));

    expect(payloads).toHaveLength(8);
    expect(payloadTypes).toEqual(
      new Set<ChoicePayload["type"]>([
        "CHOOSE_CARDS",
        "ORDER_CARDS",
        "NAME_CARD",
        "CHOOSE_REPLACEMENT",
        "CHOOSE_MODE",
        "CHOOSE_TARGET",
        "CHOOSE_YES_NO",
        "ORDER_TRIGGERS"
      ])
    );
  });

  it("BlockerAssignment maps attacker ids to blocker ids", () => {
    const assignment: BlockerAssignment = {
      attackerId: "attacker-1",
      blockerIds: ["blocker-1", "blocker-2"]
    };

    expect(assignment.attackerId).toBe("attacker-1");
    expect(assignment.blockerIds).toEqual(["blocker-1", "blocker-2"]);
  });

  it("Target supports both object and player targets", () => {
    const objectTarget: Target = { kind: "object", object: { id: "obj-9", zcc: 3 } };
    const playerTarget: Target = { kind: "player", playerId: "p1" };

    expect(objectTarget.kind).toBe("object");
    expect(playerTarget.kind).toBe("player");
  });

  it("narrows command types correctly in exhaustive switch", () => {
    const seen = sampleCommands().map((command) => assertExhaustive(command));
    expect(seen).toContain("CONCEDE");
  });

  it("Mode supports variant selection metadata", () => {
    const mode: Mode = { id: "choose-two", label: "Choose two cards" };
    expect(mode.id).toBe("choose-two");
  });
});
