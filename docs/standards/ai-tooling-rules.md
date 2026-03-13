# AI Tooling Rules

These rules define how AI agents should operate in this repository.

## Conciseness (High Priority)

- CONCISENESS IS MANDATORY.
- Be concise by default in both code changes and written responses.
- Do not create new docs when an existing doc can be updated.
- Avoid duplicating the same decision across multiple files; keep one source of truth and link to it.
- Keep docs task-focused and short; remove stale or repeated sections when editing.
- In user updates, prefer short status + key outcomes over long narrative.

## Core Workflow

- Start with tests for every new feature or behavior change (test-first by default).
- If behavior is a bug fix, first add or update a failing test that reproduces the bug.
- Implement the smallest code change needed to make tests pass.
- Refactor only after tests pass, and keep behavior unchanged.

## GitHub Workflow

- Use a pull-request workflow for all GitHub work; do not push direct commits to `main`.
- For each new user request, start from an updated `main`: `git checkout main` then fast-forward from `origin/main`.
- Create a new branch from updated `main` for that request unless the user explicitly asks to continue the same branch/PR.
- Do not reuse a branch that already has an open or merged PR for unrelated follow-up work.
- Before pushing, confirm `git log origin/main..HEAD` contains only commits for the current request.
- After any PR creation or branch push, immediately return to local `main` and fast-forward from `origin/main` unless the user explicitly asks to stay on the feature branch.
- Before final handoff on PR/push tasks, verify the working branch is `main` and report if it is not.

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

## Decision Confirmation

- Confirm major technology choices with the user before implementing them (frameworks, runtime, database, deployment model).
- If the user has already approved a choice, record it in `docs/decisions/decision-log.md` and proceed.
- If there is ambiguity in stack direction, pause and ask before scaffolding.

## Documentation Requirements

- Update relevant docs when behavior, architecture, or decisions change.
- Record major implementation decisions in `docs/decisions/decision-log.md`.
- For new rules/mechanics, document canonical behavior and edge cases.

## Implementation Preferences

- Follow existing project conventions and naming patterns.
- Favor pure, deterministic game-engine logic over side-effect-heavy code.
- Keep server authoritative for multiplayer game state and rules enforcement.
- Do not use TypeScript casts (`as`, angle-bracket assertions, or double assertions) in non-test files.
- Prefer proper type packages (for example `@types/*`) or explicit type-safe wrappers instead of assertions.

## Validation Before Completion

- Run the relevant test suite for affected areas before declaring done.
- If tests cannot be run, explicitly state what was not run and why.
- Include a brief note of what was changed, why, and how it was validated.

## Pre-Commit Review Gate

- Before creating any large commit, perform a final review of the full `git diff`.
- If meaningful improvements are identified during that review, present them and ask the user to confirm whether to apply them before committing.
