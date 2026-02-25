# AI Tooling Rules

These rules define how AI agents should operate in this repository.

## Core Workflow
- Start with tests for every new feature or behavior change (test-first by default).
- If behavior is a bug fix, first add or update a failing test that reproduces the bug.
- Implement the smallest code change needed to make tests pass.
- Refactor only after tests pass, and keep behavior unchanged.

## Testing Standards
- Prefer unit tests for rules/engine logic and integration tests for API/realtime flows.
- Add regression tests for every fixed defect.
- Do not remove or weaken existing tests to make a change pass.
- Keep tests deterministic; avoid time/network randomness unless explicitly mocked.

## Change Scope and Safety
- Keep changes focused on the requested task; avoid unrelated refactors.
- Preserve existing behavior unless a requirement explicitly changes it.
- Do not introduce breaking API/protocol changes without documenting them.
- Never commit secrets or credentials.

## Documentation Requirements
- Update relevant docs when behavior, architecture, or decisions change.
- Record major implementation decisions in `docs/DECISIONS_LOG.md`.
- For new rules/mechanics, document canonical behavior and edge cases.

## Implementation Preferences
- Follow existing project conventions and naming patterns.
- Favor pure, deterministic game-engine logic over side-effect-heavy code.
- Keep server authoritative for multiplayer game state and rules enforcement.

## Validation Before Completion
- Run the relevant test suite for affected areas before declaring done.
- If tests cannot be run, explicitly state what was not run and why.
- Include a brief note of what was changed, why, and how it was validated.
