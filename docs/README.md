# Docs Index

## Root Docs

- `README.md`: repository overview and quick-start commands.
- `AGENTS.md`: root agent entrypoint that points to the canonical AI tooling rules.
- `TODO.md`: active follow-up backlog that is not captured in a dedicated plan doc.

## Overview

- `docs/overview/product-overview.md`: product scope, variant rules, canonical decklist, and success criteria.
- `docs/overview/open-questions.md`: unresolved product, rules, and operational questions.

## Standards

- `docs/standards/ai-tooling-rules.md`: repository rules for AI-assisted work.
- `docs/standards/nextjs-boundary-rules.md`: web/app boundary rules for `apps/web`.

## Architecture

- `docs/architecture/system-architecture.md`: cross-package boundaries, runtime model, and server/engine contracts.
- `docs/architecture/rules-engine-architecture.md`: canonical rules-engine design reference.

## Contracts

- `docs/contracts/auth-api-contract.md`: auth strategy, route contract, and authorization rules.
- `docs/contracts/gameplay-transport-contract.md`: gameplay HTTP/WebSocket payload contract and evolution policy.

## Decisions

- `docs/decisions/decision-log.md`: canonical record of approved product and technical decisions.
- `docs/decisions/technology-baseline.md`: current stack baseline and constraints; not the source of truth for approvals.

## Operations

- `docs/operations/development-tooling.md`: development tooling baseline and core commands.
- `docs/operations/deployment-runbook.md`: production deployment, validation, and rollback runbook.
- `docs/operations/production-cutover-checklist.md`: concise command-first cutover checklist.

## Active Plans

- `docs/plans/roadmap.md`: current milestone-level roadmap.
- `docs/plans/rules-engine/README.md`: split rules-engine implementation plan index and shared planning conventions.
- `docs/plans/web-prototype-current-cards.md`: commit-slice execution plan for web-playable prototype work using currently implemented cards.

## Archive

- `docs/archive/plans/`: completed or superseded execution plans retained for posterity.

## Authoring Conventions

- Use `standards/` for rules and guardrails, not work tracking.
- Use `plans/` for active planning docs; start them with a `Status:` line and track tasks with GitHub checklists.
- Use `archive/plans/` for completed or superseded plans; keep a short note explaining why the file was archived and what doc supersedes it.
- Prefer milestone, phase, `Exit Criteria`, and `Notes` sections over ad hoc heading names when updating planning docs.
