import type { CardDefinition } from "./cardDefinition";
import { islandCardDefinition } from "./island";
import { memoryLapseCardDefinition } from "./memory-lapse";

export const cardRegistry: Map<string, CardDefinition> = new Map([
  [islandCardDefinition.id, islandCardDefinition],
  [memoryLapseCardDefinition.id, memoryLapseCardDefinition]
]);

export { islandCardDefinition };
export { memoryLapseCardDefinition };
export type { CardDefinition } from "./cardDefinition";
