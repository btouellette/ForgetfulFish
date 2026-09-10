import type { ResolveEffectKind, ResolveEffectSpec } from "../cards/resolveEffect";
import { targetRequirementFor } from "./effects/handlers";

export class OnResolveRegistry {
  private readonly effects: Set<ResolveEffectKind>;
  private readonly stackObjectTargetRequirement: boolean;
  private readonly battlefieldObjectTargetRequirement: boolean;

  public constructor(effectSpecs: readonly ResolveEffectSpec[]) {
    this.effects = new Set(effectSpecs.map((effect) => effect.kind));
    this.stackObjectTargetRequirement = effectSpecs.some(
      (effect) => targetRequirementFor(effect.kind) === "stack_object"
    );
    this.battlefieldObjectTargetRequirement = effectSpecs.some(
      (effect) => targetRequirementFor(effect.kind) === "battlefield_object"
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
