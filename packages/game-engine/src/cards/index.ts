import type { CardDefinition } from "./cardDefinition";
import { islandCardDefinition } from "./island";

export const cardRegistry: Map<string, CardDefinition> = new Map([
  [islandCardDefinition.id, islandCardDefinition]
]);

export { islandCardDefinition };
export type { CardDefinition } from "./cardDefinition";
