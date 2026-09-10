import type { CardDefinition } from "./cardDefinition";
import { accumulatedKnowledgeCardDefinition } from "./accumulated-knowledge";
import { brainstormCardDefinition } from "./brainstorm";
import { crystalSprayCardDefinition } from "./crystal-spray";
import { danceOfTheSkywiseCardDefinition } from "./dance-of-the-skywise";
import { diminishingReturnsCardDefinition } from "./diminishing-returns";
import { dandanCardDefinition } from "./dandan";
import { islandCardDefinition } from "./island";
import { memoryLapseCardDefinition } from "./memory-lapse";
import { mindBendCardDefinition } from "./mind-bend";
import { mysticalTutorCardDefinition } from "./mystical-tutor";
import { predictCardDefinition } from "./predict";
import { rayOfCommandCardDefinition } from "./ray-of-command";
import { visionCharmCardDefinition } from "./vision-charm";

export const cardRegistry: Map<string, CardDefinition> = new Map([
  [accumulatedKnowledgeCardDefinition.id, accumulatedKnowledgeCardDefinition],
  [brainstormCardDefinition.id, brainstormCardDefinition],
  [crystalSprayCardDefinition.id, crystalSprayCardDefinition],
  [danceOfTheSkywiseCardDefinition.id, danceOfTheSkywiseCardDefinition],
  [diminishingReturnsCardDefinition.id, diminishingReturnsCardDefinition],
  [dandanCardDefinition.id, dandanCardDefinition],
  [islandCardDefinition.id, islandCardDefinition],
  [memoryLapseCardDefinition.id, memoryLapseCardDefinition],
  [mindBendCardDefinition.id, mindBendCardDefinition],
  [mysticalTutorCardDefinition.id, mysticalTutorCardDefinition],
  [predictCardDefinition.id, predictCardDefinition],
  [rayOfCommandCardDefinition.id, rayOfCommandCardDefinition],
  [visionCharmCardDefinition.id, visionCharmCardDefinition]
]);

export { accumulatedKnowledgeCardDefinition };
export { brainstormCardDefinition };
export { crystalSprayCardDefinition };
export { danceOfTheSkywiseCardDefinition };
export { diminishingReturnsCardDefinition };
export { dandanCardDefinition };
export { islandCardDefinition };
export { memoryLapseCardDefinition };
export { mindBendCardDefinition };
export { mysticalTutorCardDefinition };
export { predictCardDefinition };
export { rayOfCommandCardDefinition };
export { visionCharmCardDefinition };
export type { CardDefinition } from "./cardDefinition";
export type { ResolveEffectKind, ResolveEffectSpec } from "./resolveEffect";
