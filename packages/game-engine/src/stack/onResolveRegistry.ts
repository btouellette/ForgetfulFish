import {
  isCompositeSpec,
  listCompositeBranches,
  type ResolveEffectKind,
  type ResolveEffectSpec,
  type ResolveLeafSpec
} from "../cards/resolveEffect";

function listResolveKinds(specs: readonly ResolveEffectSpec[]): ResolveEffectKind[] {
  return specs.flatMap((spec) =>
    isCompositeSpec(spec)
      ? [spec.kind, ...listCompositeBranches(spec).flatMap((branch) => listResolveKinds(branch))]
      : [spec.kind]
  );
}

/**
 * True when every way through `specs` runs a leaf matching `predicate`. A step
 * inside only some branches of a `conditional`/`modal` is optional, not required.
 */
function everyPathRuns(
  specs: readonly ResolveEffectSpec[],
  predicate: (leaf: ResolveLeafSpec) => boolean
): boolean {
  return specs.some((spec) =>
    isCompositeSpec(spec)
      ? listCompositeBranches(spec).every((branch) => everyPathRuns(branch, predicate))
      : predicate(spec)
  );
}

function usesObjectTarget(spec: ResolveLeafSpec): boolean {
  switch (spec.kind) {
    case "counter_target_spell":
    case "set_control_of_target":
    case "untap_target":
    case "phase_out_target":
    case "add_text_change_effect_to_target":
      return true;
    case "add_continuous_effect":
      return spec.to.kind === "target_object";
    case "choose_mode":
      return (
        spec.modeSource.kind === "target_land_types" ||
        spec.modeSource.kind === "target_land_type_instances"
      );
    default:
      return false;
  }
}

export class OnResolveRegistry {
  private readonly effects: Set<ResolveEffectKind>;
  private readonly objectTargetRequirement: boolean;
  private readonly stackObjectTargetRequirement: boolean;
  private readonly battlefieldObjectTargetRequirement: boolean;

  public constructor(effectSpecs: readonly ResolveEffectSpec[]) {
    this.effects = new Set(listResolveKinds(effectSpecs));
    this.stackObjectTargetRequirement = everyPathRuns(
      effectSpecs,
      (leaf) => leaf.kind === "counter_target_spell"
    );
    this.battlefieldObjectTargetRequirement = everyPathRuns(
      effectSpecs,
      (leaf) => leaf.kind !== "counter_target_spell" && usesObjectTarget(leaf)
    );
    this.objectTargetRequirement =
      this.stackObjectTargetRequirement || this.battlefieldObjectTargetRequirement;
  }

  public has(effectKind: ResolveEffectKind): boolean {
    return this.effects.has(effectKind);
  }

  public requiresObjectTargets(): boolean {
    return this.objectTargetRequirement;
  }

  public requiresStackObjectTargets(): boolean {
    return this.stackObjectTargetRequirement;
  }

  public requiresBattlefieldObjectTargets(): boolean {
    return this.battlefieldObjectTargetRequirement;
  }
}
