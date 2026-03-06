import type {
  ActivatedAbilityAst,
  Color,
  KeywordAbilityAst,
  StaticAbilityAst,
  SubtypeAtom,
  TriggerDefinitionAst
} from "./abilityAst";
import type { ResolveEffectSpec } from "./resolveEffect";

export type ManaCost = Partial<{
  white: number;
  blue: number;
  black: number;
  red: number;
  green: number;
  colorless: number;
  generic: number;
}>;

export type CardDefinition = {
  id: string;
  name: string;
  manaCost: ManaCost;
  typeLine: string[];
  subtypes: SubtypeAtom[];
  color: Color[];
  supertypes: string[];
  power: number | null;
  toughness: number | null;
  keywords: KeywordAbilityAst[];
  staticAbilities: StaticAbilityAst[];
  triggeredAbilities: TriggerDefinitionAst[];
  activatedAbilities: ActivatedAbilityAst[];
  onResolve: ResolveEffectSpec[];
  continuousEffects: string[];
  replacementEffects: string[];
};
