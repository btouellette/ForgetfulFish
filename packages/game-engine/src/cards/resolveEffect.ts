/**
 * Draw `drawAmount` cards, then pause to let the controller choose `returnAmount`
 * cards from their hand to put back on top of their library in a chosen order.
 *
 * @param drawAmount - Number of cards drawn at the start of resolution.
 * @param returnAmount - Exact number of cards the controller must return to library top.
 */
export type DrawChooseReturnSpec = {
  id: "DRAW_CHOOSE_RETURN";
  drawAmount: number;
  returnAmount: number;
};

/**
 * Pause to let the controller search their library for a card whose type line
 * includes any entry in `typeFilter`, selecting between `min` and `max` cards.
 * The library is then shuffled and the chosen card (if any) is placed on top.
 *
 * @param typeFilter - Type-line strings a card must match to be a valid candidate (e.g. ["Instant", "Sorcery"]).
 * @param min - Minimum number of cards to choose (0 means the search is optional).
 * @param max - Maximum number of cards to choose.
 */
export type SearchLibraryShuffleTopSpec = {
  id: "SEARCH_LIBRARY_SHUFFLE_TOP";
  typeFilter: string[];
  min: number;
  max: number;
};

/**
 * Pause to let the controller name a card, then mill `millAmount` cards from
 * the top of the targeted player's library (or the controller if no player
 * target is provided). The controller always draws at least
 * `missDrawAmount` cards; if the named card was among the milled cards, the
 * controller draws `drawOnHitAmount` cards instead.
 *
 * @param millAmount - Number of cards milled from the top of the library.
 * @param drawOnHitAmount - Cards drawn when the named card is among the milled cards.
 * @param missDrawAmount - Cards drawn when the named card is NOT among the milled cards.
 */
export type NameMillDrawOnHitSpec = {
  id: "NAME_MILL_DRAW_ON_HIT";
  millAmount: number;
  drawOnHitAmount: number;
  missDrawAmount: number;
};

/**
 * Counter the target spell on the stack and move it to the specified destination zone.
 * Does nothing if the targeted object is no longer on the stack at its original zcc.
 *
 * @param destination - Where the countered spell is placed:
 *   - "graveyard": owner's graveyard (standard counterspell behavior).
 *   - "library-top": top of the owner's library (e.g. Memory Lapse).
 */
export type CounterSpellSpec = {
  id: "COUNTER_SPELL";
  destination: "graveyard" | "library-top";
};

/**
 * Draw cards equal to the number of copies of this card (by name) in the
 * controller's graveyard, plus `bonus`.
 *
 * Example: if `bonus` is 1 and there are 2 copies already in the graveyard,
 * the controller draws 3 cards.
 *
 * @param bonus - Additional cards drawn on top of the graveyard copy count.
 */
export type DrawByGraveyardCopyCountSpec = {
  id: "DRAW_BY_GRAVEYARD_COPY_COUNT";
  bonus: number;
};

export type ResolveEffectSpec =
  | DrawChooseReturnSpec
  | SearchLibraryShuffleTopSpec
  | NameMillDrawOnHitSpec
  | CounterSpellSpec
  | DrawByGraveyardCopyCountSpec;

export type ResolveEffectId = ResolveEffectSpec["id"];
