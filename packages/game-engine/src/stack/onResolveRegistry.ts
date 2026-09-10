import type { ResolveEffectKind, ResolveEffectNode } from "../cards/resolveEffect";
import { targetRequirementFor } from "./effects/handlers";

/**
 * Both branches of a `conditional` count: targets are chosen at cast time, before any condition can
 * be evaluated, so a card that targets in either branch targets unconditionally.
 */
function collectLeafKinds(
  nodes: readonly ResolveEffectNode[],
  collected: Set<ResolveEffectKind>
): Set<ResolveEffectKind> {
  for (const node of nodes) {
    switch (node.kind) {
      case "sequence":
        collectLeafKinds(node.children, collected);
        break;
      case "conditional":
        collectLeafKinds(node.else === undefined ? [node.then] : [node.then, node.else], collected);
        break;
      default:
        collected.add(node.kind);
    }
  }

  return collected;
}

export class OnResolveRegistry {
  private readonly effects: Set<ResolveEffectKind>;
  private readonly stackObjectTargetRequirement: boolean;
  private readonly battlefieldObjectTargetRequirement: boolean;

  public constructor(nodes: readonly ResolveEffectNode[]) {
    this.effects = collectLeafKinds(nodes, new Set());
    this.stackObjectTargetRequirement = [...this.effects].some(
      (kind) => targetRequirementFor(kind) === "stack_object"
    );
    this.battlefieldObjectTargetRequirement = [...this.effects].some(
      (kind) => targetRequirementFor(kind) === "battlefield_object"
    );
  }

  public has(effectKind: ResolveEffectKind): boolean {
    return this.effects.has(effectKind);
  }

  public requiresObjectTargets(): boolean {
    return this.stackObjectTargetRequirement || this.battlefieldObjectTargetRequirement;
  }

  public requiresStackObjectTargets(): boolean {
    return this.stackObjectTargetRequirement;
  }

  public requiresBattlefieldObjectTargets(): boolean {
    return this.battlefieldObjectTargetRequirement;
  }
}
