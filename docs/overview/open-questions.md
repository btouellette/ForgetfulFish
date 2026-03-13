# Open Questions

## Product and Scope
- Is spectator mode needed in early milestones?

## Rules and UX Fidelity
- Do we need full hidden-information rigor immediately (private hand visibility, explicit reveal events, audit log), or can this phase in?
- Should players be able to disable auto-pass globally and use explicit priority windows only?
- For shared-deck draws, does the drawn card's owner become the drawing player for downstream owner-based effects?
- Does the starting player skip their first draw step, following standard MTG turn rules, or does Forgetful Fish override that behavior?

## Tech and Operations
- Preferred hosting stack (single cloud provider vs mixed web/server providers)?
- Do we target container-based deploys from day one, or managed platform defaults first?

## Persistence and Replays
- Should completed games be permanently stored for replay/share?
- How long should inactive room/game state be retained?

## Compliance and Content
- Do we need to avoid copyrighted card art/name usage in UI assets for initial release?
- Any privacy or region requirements (GDPR, COPPA, etc.) now?

## Team Workflow
- CI preference (GitHub Actions assumed unless you prefer another system).
