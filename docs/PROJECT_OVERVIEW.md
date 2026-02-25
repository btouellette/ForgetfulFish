# Forgetful Fish Webapp - Project Overview

## Goal
Build a two-player online web app for the Magic: The Gathering variant "Forgetful Fish" where both players interact with a shared deck, shared graveyard, and a full stack/priority system.

## Product Objectives
- Fast, synchronous online play between two players.
- Rules enforcement for variant-specific mechanics.
- Clear game log and stack visualization to reduce rules ambiguity.
- Replay-friendly state model (deterministic actions, event log).
- Expandable architecture for additional variants later.

## Initial Scope (v1)
- Basic accounts for player identity and reconnect continuity.
- Two-player private game rooms via invite link/code.
- Full implementation of the listed 80-card deck and card interactions needed for Forgetful Fish.
- Shared library + shared graveyard model.
- Turn structure, priority passing, stack resolution, and combat relevant to deck.
- Mulligan flow including free mulligan condition.
- Life/counter tracking optimized for 4-damage increments.
- Game history log (actions, stack events, draws, reveals, shuffles).

## Out of Scope (v1)
- General MTG rules engine for all cards/formats.
- Spectator mode.
- Public quick-match queue.
- Ranked ladder.
- Mobile app binaries (web mobile responsive only).

## Core Variant Rules to Encode
- Single shared library and graveyard.
- Ownership of a card = player who cast/played it from hand.
- Simultaneous draws from same effect are dealt alternately from top, active player dealing.
- Free mulligan if a 7-card opener has <2 or >=6 lands.
- Starting life 20 (optionally represented as five 4-life counters).
- Strict priority passing around stack and draws.

## Decklist (Canonical Source for v1)
- 10 Dandan
- 8 Memory Lapse
- 4 Accumulated Knowledge
- 2 Brainstorm
- 2 Crystal Spray
- 2 Dance of the Skywise
- 2 Diminishing Returns
- 2 Metamorphose
- 2 Mind Bend
- 2 Mystical Tutor
- 2 Mystic Retrieval
- 2 Predict
- 2 Ray of Command
- 2 Supplant Form
- 2 Unsubstantiate
- 2 Vision Charm
- 2 Izzet Boilerworks
- 2 Lonely Sandbar
- 2 Halimar Depths
- 2 Mystic Sanctuary
- 2 Remote Isle
- 2 Svyelunite Temple
- 2 Temple of Epiphany
- 18 Island

## Success Criteria
- Two users can complete a full game online without manual rule arbitration.
- No desync between clients under normal latency.
- Reconnect restores current game state correctly.
- Rules test suite covers core variant behavior and key card interactions.
