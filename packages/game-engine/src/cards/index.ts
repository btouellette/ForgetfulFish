import type { CardDefinition } from "./cardDefinition";
import { accumulatedKnowledgeCardDefinition } from "./accumulated-knowledge";
import { brainstormCardDefinition } from "./brainstorm";
import { islandCardDefinition } from "./island";
import { memoryLapseCardDefinition } from "./memory-lapse";
import { mindBendCardDefinition } from "./mind-bend";
import { mysticalTutorCardDefinition } from "./mystical-tutor";
import { predictCardDefinition } from "./predict";
import { rayOfCommandCardDefinition } from "./ray-of-command";

export const cardRegistry: Map<string, CardDefinition> = new Map([
  [accumulatedKnowledgeCardDefinition.id, accumulatedKnowledgeCardDefinition],
  [brainstormCardDefinition.id, brainstormCardDefinition],
  [islandCardDefinition.id, islandCardDefinition],
  [memoryLapseCardDefinition.id, memoryLapseCardDefinition],
  [mindBendCardDefinition.id, mindBendCardDefinition],
  [mysticalTutorCardDefinition.id, mysticalTutorCardDefinition],
  [predictCardDefinition.id, predictCardDefinition],
  [rayOfCommandCardDefinition.id, rayOfCommandCardDefinition]
]);

export { accumulatedKnowledgeCardDefinition };
export { brainstormCardDefinition };
export { islandCardDefinition };
export { memoryLapseCardDefinition };
export { mindBendCardDefinition };
export { mysticalTutorCardDefinition };
export { predictCardDefinition };
export { rayOfCommandCardDefinition };
export type { CardDefinition } from "./cardDefinition";
export type { ResolveEffectKind, ResolveEffectSpec } from "./resolveEffect";
