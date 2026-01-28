# DONE (Project-Wide)

Keep this as an append-only log of completed work. Include dates and (when possible) commit IDs.

## 2026-01-28
- Generator UI stability fixes: corrected missing state setters, hardened event polling retries, and improved plan review UX (see commits around `39f6cbd`).
- Added per-stage OpenAI model routing so planning and coding can use different models; wired routing across generator/agents and documented env knobs (commit `39f6cbd`).
- Strengthened planning + generator prompts to require multi-page routes, real flows, and deeper project output (commit `ec13d95`).
- Fixed project-type handling so `mobile` and `cli` are recognized, web entrypoints are only enforced for web builds, and Vite-friendly `frontend/index.html` is used when enforcing an entrypoint.
- Created and expanded the agent/operator documentation set: `AGENTS.md`, `todo.md`, `done.md`, `optimise.md`, and `webcrafters-ai-helpers.md`.

## Notes
- This file records completed work only. Do not move items back to TODO; add new tasks to `todo.md`.
