import type {
  ConditionalSpec,
  ForEachPlayerSpec,
  ModalSpec,
  ResolveEffectSpec
} from "../../cards/resolveEffect";
import { isCompositeSpec } from "../../cards/resolveEffect";
import type { GameState } from "../../state/gameState";
import type { PlayerId } from "../../state/objectRef";
import type { StackItem } from "../stackItem";
import { isChooseModePayload, resolveLeafEffect } from "./handlers";
import { pauseWithChoiceAndScratch, requireChoicePayload } from "./primitives";
import { evaluateCondition } from "./selectors";
import {
  stepPathKey,
  type ResolveBindings,
  type ResolveEffectHandlerContext,
  type ResolveEffectResult,
  type ResolveRunContext,
  type ResolveStepPath
} from "./types";

const RESUME_PATH_KEY = "onResolvePath";
const RESUME_SKIP_LEAF_KEY = "onResolveSkipLeaf";

/**
 * Where a paused resolution should pick back up. `skipLeaf` is set when the
 * leaf at `path` already ran and only its action flush was interrupted.
 */
export type ResolveResumePoint = { path: ResolveStepPath; skipLeaf: boolean };

export function readResumePoint(stackItem: StackItem): ResolveResumePoint | null {
  const scratch = stackItem.effectContext.whiteboard.scratch;
  const path = scratch[RESUME_PATH_KEY];
  if (!Array.isArray(path) || !path.every((index) => typeof index === "number")) {
    return null;
  }

  return { path, skipLeaf: scratch[RESUME_SKIP_LEAF_KEY] === true };
}

export function resumePointScratch(point: ResolveResumePoint): Record<string, unknown> {
  return { [RESUME_PATH_KEY]: [...point.path], [RESUME_SKIP_LEAF_KEY]: point.skipLeaf };
}

function isOnResumePath(resume: ResolveResumePoint | null, path: ResolveStepPath): boolean {
  return (
    resume !== null &&
    resume.path.length >= path.length &&
    path.every((index, depth) => resume.path[depth] === index)
  );
}

function stepContext(
  context: ResolveRunContext,
  path: ResolveStepPath,
  bindings: ResolveBindings
): ResolveEffectHandlerContext {
  const { flushActions: _flushActions, currentStackItem, ...handlerContext } = context;
  return {
    ...handlerContext,
    stackItem: currentStackItem(),
    path,
    bindings,
    pauseWithChoice: (choice, updatedTopItem) =>
      context.pauseWithChoice(choice, {
        ...updatedTopItem,
        effectContext: {
          ...updatedTopItem.effectContext,
          whiteboard: {
            ...updatedTopItem.effectContext.whiteboard,
            scratch: {
              ...updatedTopItem.effectContext.whiteboard.scratch,
              ...resumePointScratch({ path, skipLeaf: false })
            }
          }
        }
      })
  };
}

type Runner = {
  context: ResolveRunContext;
  resume: ResolveResumePoint | null;
};

function runList(
  runner: Runner,
  specs: readonly ResolveEffectSpec[],
  basePath: ResolveStepPath,
  bindings: ResolveBindings
): ResolveEffectResult {
  const resumeIndex =
    isOnResumePath(runner.resume, basePath) && runner.resume !== null
      ? (runner.resume.path[basePath.length] ?? 0)
      : 0;

  for (let index = resumeIndex; index < specs.length; index += 1) {
    const spec = specs[index];
    if (spec === undefined) {
      continue;
    }

    const path = [...basePath, index];
    const result = isCompositeSpec(spec)
      ? runComposite(runner, spec, path, bindings)
      : runLeaf(runner, spec, path, bindings);
    if (result.kind === "pause") {
      return result;
    }
  }

  return { kind: "continue" };
}

function runLeaf(
  runner: Runner,
  spec: Exclude<ResolveEffectSpec, { kind: "conditional" | "modal" | "for_each_player" }>,
  path: ResolveStepPath,
  bindings: ResolveBindings
): ResolveEffectResult {
  const resumingHere =
    runner.resume !== null &&
    runner.resume.path.length === path.length &&
    isOnResumePath(runner.resume, path);
  if (resumingHere && runner.resume?.skipLeaf === true) {
    return { kind: "continue" };
  }

  const result = resolveLeafEffect(spec, stepContext(runner.context, path, bindings));
  if (result.kind === "pause") {
    return result;
  }

  const flushPause = runner.context.flushActions(path);
  return flushPause === null ? { kind: "continue" } : { kind: "pause", result: flushPause };
}

function runComposite(
  runner: Runner,
  spec: ConditionalSpec | ModalSpec | ForEachPlayerSpec,
  path: ResolveStepPath,
  bindings: ResolveBindings
): ResolveEffectResult {
  switch (spec.kind) {
    case "conditional":
      return runConditional(runner, spec, path, bindings);
    case "modal":
      return runModal(runner, spec, path, bindings);
    case "for_each_player":
      return runForEachPlayer(runner, spec, path, bindings);
    default: {
      const exhaustive: never = spec;
      return exhaustive;
    }
  }
}

/** The branch decision is memoized in scratch so resuming never re-evaluates it. */
function runConditional(
  runner: Runner,
  spec: ConditionalSpec,
  path: ResolveStepPath,
  bindings: ResolveBindings
): ResolveEffectResult {
  const context = stepContext(runner.context, path, bindings);
  const branchKey = `branch:${stepPathKey(path)}`;
  const stored = context.stackItem.effectContext.whiteboard.scratch[branchKey];
  const branchIndex =
    typeof stored === "number" ? stored : evaluateCondition(context, spec.condition) ? 0 : 1;
  if (typeof stored !== "number") {
    context.writeScratch({ [branchKey]: branchIndex });
  }

  const branch = branchIndex === 0 ? spec.then : (spec.else ?? []);
  return runList(runner, branch, [...path, branchIndex], bindings);
}

function runModal(
  runner: Runner,
  spec: ModalSpec,
  path: ResolveStepPath,
  bindings: ResolveBindings
): ResolveEffectResult {
  const context = stepContext(runner.context, path, bindings);
  const pathKey = stepPathKey(path);
  const choiceIdKey = `choiceId:${pathKey}`;
  if (typeof context.stackItem.effectContext.whiteboard.scratch[choiceIdKey] !== "string") {
    const choice: NonNullable<GameState["pendingChoice"]> = {
      id: `${context.stackItem.id}:${pathKey}:${spec.kind}`,
      type: "CHOOSE_MODE",
      forPlayer: context.stackItem.controller,
      prompt: spec.prompt,
      constraints: {
        modes: spec.modes.map((mode) =>
          mode.label === undefined ? { id: mode.id } : { id: mode.id, label: mode.label }
        )
      }
    };
    return pauseWithChoiceAndScratch(context, choice, { [choiceIdKey]: choice.id });
  }

  const payload = requireChoicePayload(
    context.stackItem,
    choiceIdKey,
    isChooseModePayload,
    `missing ${spec.kind} choice id in scratch state at '${pathKey}'`,
    `missing ${spec.kind} payload in scratch state at '${pathKey}'`
  );
  const modeIndex = spec.modes.findIndex((mode) => mode.id === payload.mode.id);
  const mode = spec.modes[modeIndex];
  if (mode === undefined) {
    throw new Error(`unknown mode '${payload.mode.id}' for ${spec.kind} at '${pathKey}'`);
  }

  if (spec.storeKey !== undefined) {
    context.writeScratch({ [spec.storeKey]: mode.id });
  }

  return runList(runner, mode.effects, [...path, modeIndex], bindings);
}

function apnapOrder(state: Readonly<GameState>): PlayerId[] {
  const active = state.turnState.activePlayerId;
  return [active, ...state.players.map((player) => player.id).filter((id) => id !== active)];
}

function runForEachPlayer(
  runner: Runner,
  spec: ForEachPlayerSpec,
  path: ResolveStepPath,
  bindings: ResolveBindings
): ResolveEffectResult {
  const players = apnapOrder(runner.context.state);
  const resumeIndex =
    isOnResumePath(runner.resume, path) && runner.resume !== null
      ? (runner.resume.path[path.length] ?? 0)
      : 0;

  for (let index = resumeIndex; index < players.length; index += 1) {
    const playerId = players[index];
    if (playerId === undefined) {
      continue;
    }

    const result = runList(runner, spec.effects, [...path, index], {
      ...bindings,
      iteratedPlayer: playerId
    });
    if (result.kind === "pause") {
      return result;
    }
  }

  return { kind: "continue" };
}

/**
 * Walks the `onResolve` tree from `resume` (or the start), running each leaf
 * and flushing its actions before moving on. Pauses propagate unchanged.
 */
export function runResolveSteps(
  specs: readonly ResolveEffectSpec[],
  context: ResolveRunContext,
  resume: ResolveResumePoint | null
): ResolveEffectResult {
  return runList({ context, resume }, specs, [], {});
}
