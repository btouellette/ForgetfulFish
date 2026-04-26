# Rules Engine Implementation: Phase 4 — Combat + triggers + trigger ordering

Status: planned

> Current engine status before Phase 4: attacker legality and must-attack enforcement already exist through shared combat helpers used by `commands/validate.ts` and `engine/processCommand.ts`, but attacker declaration still emits no dedicated combat event and blocker assignment/evasion legality are not implemented yet. `DECLARE_BLOCKERS` is scaffolding only and currently supports the no-assignment path, not real blocking rules.

### [ ] P4.1 — Declare attackers

**Files**: `engine/combat.ts`, `engine/processCommand.ts`

Implement per §4:
- Extend the existing attacker-legality helpers and `DECLARE_ATTACKERS` command handling:
  - Keep validation sourced from the computed object view (control, tapped/summoning-sick, Dandan-style restrictions, must-attack)
  - Move to attackers declared → give priority
  - Emit events for attacker declaration

<!-- Confirmed current legality checks already read the computed Layer 3-rewritten view; Phase 4 needs to preserve that when combat events and damage resolution are added. -->

**Test file**: `test/engine/combat_attack.test.ts`
Depends: P1.2, P3.2, P3.9
Test: **Write tests FIRST**, then implement.
1. Declare Dandan as attacker when opponent controls an Island → legal.
2. Declare Dandan as attacker when opponent controls no Island → rejected.
3. Tapped creature or summoning sick creature cannot be declared as attacker.
4. "Must attack" requirement (from Dandan or Ray) is enforced.
5. Attacker declaration emits `DECLARE_ATTACKERS` event.
6. `assertStateInvariants` passes after attackers are declared.
Acceptance: Attacker legality is correct including Dandan restrictions.

### [ ] P4.2 — Declare blockers

**Files**: `engine/combat.ts` (extend)

Implement:
- Replace the current `DECLARE_BLOCKERS` scaffolding with full blocker declaration handling:
  - Validate: defender's untapped creatures can block, evasion checks (islandwalk, flying)
  - Islandwalk: can't be blocked if defending player controls an Island (again, Layer 3-rewritable)
  - Flying: can only be blocked by creatures with flying or reach
  - Block assignment (which blocker blocks which attacker)

**Test file**: `test/engine/combat_block.test.ts`
Depends: P4.1, P3.2, P3.7
Test: **Write tests FIRST**, then implement.
1. Dandan with islandwalk attacking a player with an Island → cannot be blocked.
2. Dandan with Mind-Bent swampwalk attacking a player with no Swamps → can be blocked.
3. Creature with flying can only be blocked by another creature with flying.
4. Block assignment correctly associates attackers with blockers.
5. Blockers must be untapped to be declared.
6. `assertStateInvariants` holds after blocking is finalized.
Acceptance: Evasion checks use computed (layer-derived) abilities.

### [ ] P4.3 — Combat damage assignment and resolution

**Files**: `engine/combat.ts` (extend)

Implement:
- Damage assignment for each attacker-blocker pair
- Unblocked attacker deals damage to defending player
- Blocked attacker deals damage to blocker(s), blocker deals damage to attacker
- Emit `DAMAGE_DEALT` and `LIFE_CHANGED` events
- After damage: SBA check (creatures with lethal damage die, players at 0 lose)

**Test file**: `test/engine/combat_damage.test.ts`
Depends: P4.1, P4.2, P1.8
Test: **Write tests FIRST**, then implement.
1. Unblocked Dandan (4/1) deals exactly 4 damage to the defending player.
2. Dandan blocked by another Dandan → both deal 4 damage and both are destroyed.
3. Player with 4 life taking 4 damage goes to 0 and loses via SBA.
4. Lethal damage on a creature correctly results in it moving to the shared graveyard.
5. Damage resolution emits correct `DAMAGE_DEALT` and `LIFE_CHANGED` events.
6. Multiple attackers/blockers resolve damage simultaneously.
7. `assertStateInvariants` passes after damage and SBA processing.
Acceptance: Combat damage math is correct, SBAs fire after damage.

### [ ] P4.4 — "Must attack if able" enforcement

**Files**: `engine/combat.ts` (extend)

Cards: **Dandan**, **Ray of Command** (temporary "must attack")

Implement per §4:
- Extend and verify the existing must-attack enforcement during the declare attackers step:
  - Preserve current behavior where creatures with a continuous-effect or ability-based must-attack requirement are rejected if omitted while able to attack
  - Keep the impossibility exception (e.g. Dandan restriction, tapping, summoning sickness)
  - Add any missing combat events / coverage needed as full combat implementation lands

**Test file**: `test/engine/combat_constraints.test.ts`
Depends: P4.1, P3.2, P3.9, P3.10
Test: **Write tests FIRST**, then implement.
1. Dandan is in play and legal to attack → declaring no attackers is rejected.
2. Dandan cannot attack (opponent has no Islands) → player can safely pass attackers step.
3. Ray of Command creature has "must attack" → must be included in the declaration.
4. Multiple "must attack" creatures must all be declared if legal.
5. "Must attack" does not override tapping or summoning sickness.
6. `assertStateInvariants` passes after enforcing requirements.
Acceptance: Existing must-attack enforcement remains correct as combat events/blockers/damage are added, and impossibility exceptions are still honored.

### [ ] P4.5 — Trigger batching with APNAP ordering

**Files**: `triggers/trigger.ts`, `triggers/batch.ts`

Implement per §10:
- After events are emitted, scan for matching triggers:
  - Iterate all permanents with `triggeredAbilities`
  - Check event type match and condition AST
  - Collect into `triggerQueue`
- APNAP ordering:
  - Active player's triggers first, then non-active
  - Within each player's triggers: if >1, emit `PendingChoice { type: 'ORDER_TRIGGERS' }`
  - Put ordered triggers on stack
- Loop: after triggers go on stack → SBA check → more triggers possible → repeat

**Test file**: `test/triggers/batch.test.ts`
Depends: P0.12, P2.2, P1.9
Test: **Write tests FIRST**, then implement.
1. A single trigger event correctly puts the trigger onto the stack.
2. Two triggers for the same player results in an `ORDER_TRIGGERS` pending choice.
3. APNAP ordering ensures active player's triggers go on the stack first (resolve last).
4. Trigger results in an SBA which triggers a new ability → cycle continues.
5. Triggers targeting objects use correct `zcc` for reference stability.
6. `assertStateInvariants` passes after the trigger batching cycle finishes.
Acceptance: APNAP ordering with player choice for simultaneous triggers.

### [ ] P4.6 — State-triggered abilities

**Files**: `triggers/trigger.ts` (extend), `engine/sba.ts` (extend)

Cards: **Dandan** ("when you control no Islands, sacrifice Dandan")

Implement:
- State-triggered abilities: triggered by a game state condition becoming true (not by an event)
- Check during SBA loop: for each permanent with state-triggered abilities, evaluate condition
- If condition true and trigger hasn't already been put on stack this SBA cycle → add to triggerQueue
- Dandan: condition = "controller controls no permanents with SubtypeAtom { kind: 'basic_land_type', value: <Layer-3-rewritten value> }"

**Test file**: `test/triggers/state.test.ts`
Depends: P4.5, P3.2, P3.9
Test: **Write tests FIRST**, then implement.
1. Dandan's sacrifice trigger does not fire if its controller has an Island.
2. Dandan's sacrifice trigger fires immediately when its controller's last Island is removed.
3. Mind Bend changing "Island" to "Swamp" causes the trigger to check for Swamps instead.
4. State-triggered abilities fire at most once per SBA cycle to prevent infinite loops.
5. Triggered ability is added to the stack via the APNAP batching system.
6. `assertStateInvariants` passes after state-trigger resolution.
Acceptance: State-triggered ability with Layer 3-rewritable token works.

### [ ] P4.7 — Card: Mystic Sanctuary (ETB trigger)

**Files**: `cards/mystic-sanctuary.ts`

Cards: **Mystic Sanctuary** (ETB: if you control 3+ Islands, return instant/sorcery from graveyard to top of library)

Implement:
- CardDefinition: land (Island subtype — enters untapped? check Oracle)
- ETB trigger:
  - Condition: controller controls 3 or more Islands (including Mystic Sanctuary itself)
  - Effect: `CHOOSE_CARDS` from instants/sorceries in graveyard + `MOVE_ZONE` to top of library

<!-- TODO: Mystic Sanctuary Oracle: "If you control three or more other Islands" — the word "other" means Mystic Sanctuary itself doesn't count. Verify the condition checks for 3+ OTHER Islands, not including itself. Also: in shared-deck, "your graveyard" → shared graveyard via GameMode. -->

**Test file**: `test/cards/mysticSanctuary.test.ts`
Depends: P0.11, P4.5, P2.2
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as a land with Island subtype.
2. (Casting) Playing as a land triggers the ETB effect.
3. (Resolution) Trigger fires only if controller has 3+ *other* Islands.
4. (Resolution) Player chooses an instant/sorcery from the shared graveyard.
5. (Resolution) Chosen card moves to the top (index 0) of the common library.
6. (Shared-deck) Search correctly accesses the shared graveyard.
7. (Edge case) If 0 instants/sorceries in graveyard, trigger produces no choice.
8. (State) `assertStateInvariants` passes after graveyard-to-library move.
Acceptance: ETB trigger fires conditionally, graveyard search works.

### [ ] P4.8 — Card: Halimar Depths (ETB trigger)

**Files**: `cards/halimar-depths.ts`

Cards: **Halimar Depths** (ETB: look at top 3, put back in any order)

Implement:
- CardDefinition: land, enters tapped
- ETB trigger:
  - Look at top 3 of shared library
  - `PendingChoice { type: 'ORDER_CARDS'; cards: top3 }` — player arranges them
  - Put back in chosen order

**Test file**: `test/cards/halimarDepths.test.ts`
Depends: P0.11, P4.5, P2.2
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as land that enters tapped.
2. (Casting) Triggers the "look at top 3" ability upon entering the battlefield.
3. (Resolution) Caster sees exactly the top 3 cards of the shared library.
4. (Resolution) Caster is prompted with an `ORDER_CARDS` choice.
5. (Resolution) Library top 3 are updated to match the chosen order.
6. (Shared-deck) Interaction correctly uses the shared library zone.
7. (Edge case) If library has <3 cards, caster sees and orders all remaining cards.
8. (State) `assertStateInvariants` passes after reordering.
Acceptance: ETB trigger with ordering choice works.

### [ ] P4.9 — Card: Temple of Epiphany (ETB trigger)

**Files**: `cards/temple-of-epiphany.ts`

Cards: **Temple of Epiphany** (ETB: scry 1)

Implement:
- CardDefinition: land, enters tapped
- ETB trigger:
  - Scry 1: look at top card of shared library
  - `PendingChoice { type: 'CHOOSE_CARDS'; candidates: [topCard]; min: 0; max: 1 }` — keep on top or put on bottom

<!-- TODO: Scry choice UX — scry is "look at top N, put any number on bottom in any order, rest on top in any order." For scry 1 it's binary: top or bottom. Define the choice type. Could use CHOOSE_YES_NO ("keep on top?") or CHOOSE_CARDS with special semantics. -->

**Test file**: `test/cards/templeOfEpiphany.test.ts`
Depends: P0.11, P4.5, P2.2
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as land that enters tapped.
2. (Casting) Triggers scry 1 upon entering.
3. (Resolution) Choosing 1 card (Keep) leaves it on top of the shared library.
4. (Resolution) Choosing 0 cards (Bottom) moves the top card to the bottom of the shared library.
5. (Shared-deck) Scry correctly uses the shared library.
6. (Interaction) Opponent does not see the card identity being scried.
7. (Edge case) Scrying an empty library does nothing.
8. (State) `assertStateInvariants` passes after scry completion.
Acceptance: Scry works with shared library.

### [ ] P4.10 — Card: Izzet Boilerworks (ETB trigger)

**Files**: `cards/izzet-boilerworks.ts`

Cards: **Izzet Boilerworks** (ETB: return a land you control to hand; tap for {U}{R})

Implement:
- CardDefinition: land, enters tapped
- ETB trigger:
  - `CHOOSE_CARDS { candidates: lands you control; min: 1; max: 1 }` — choose a land
  - `MOVE_ZONE` chosen land from battlefield to hand (bounce)
- Mana ability: `{T}: Add {U}{R}`

**Test file**: `test/cards/izzetBoilerworks.test.ts`
Depends: P0.11, P4.5, P2.2, P1.5
Test: **Write tests FIRST**, then implement.
1. (Definition) Loads as land that enters tapped.
2. (Casting) Triggers bounce choice upon entering.
3. (Resolution) Controller must choose a land they control to return to hand.
4. (Resolution) If Boilerworks is the only land, it must bounce itself.
5. (Resolution) Tapping for mana adds exactly one {U} and one {R} to the pool.
6. (Interaction) Bouncing a land with Mind Bend effects preserves the effect (permanent).
7. (Shared-deck) Ownership of the bounced land is determined by `GameMode`.
8. (State) `assertStateInvariants` passes after bounce.
Acceptance: ETB bounce + dual mana ability works.

### [ ] P4.11 — Integration test: combat with triggers

Wire together:
- Dandan attacks Dandan scenario (both must attack, combat damage kills both, sacrifice triggers)
- Mystic Sanctuary + Halimar Depths entering simultaneously (APNAP trigger ordering)
- Ray of Command stealing Dandan mid-combat

**Test file**: `test/integration/combat-triggers.test.ts`
Depends: all P4 tasks
Test: **Write tests FIRST**, then implement.
1. Verify Dandan vs Dandan results in both cards in shared graveyard and events emitted.
2. Verify APNAP ordering correctly handles simultaneous ETB triggers for different players.
3. Verify Ray of Command mid-combat correctly changes attacker/blocker legality.
4. Verify "must attack" is properly checked against current state restrictions.
5. `assertStateInvariants(state)` is called after every stack resolution and combat step.
6. Event log reflects correct ordering of combat damage and subsequent triggers.
7. State-triggered abilities (Dandan sacrifice) fire correctly after combat-related land losses.
Acceptance: Complex combat + trigger interactions work correctly.

---
