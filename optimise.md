# Optimise (Roadmap + Decisions)

This file captures the ongoing optimization roadmap for Webcrafters Studio (quality, reliability, speed, and cost).

## Primary Optimization Goals
1) Output quality: generate projects that look premium and ship real functionality (multi-page flows, not "flat" output).
2) Reliability: generation jobs should survive refreshes, restarts, and transient network failures.
3) Observability: every stage must be explainable with events (what/where/why) and reproducible logs.
4) Cost control: use model routing by stage (cheap plan + strong code) without degrading quality.

## High-Leverage Improvements (Next)

### Output Quality Gates
- Enforce multi-page routing for web projects (min 4 meaningful routes).
- Enforce at least one listing+detail flow and one form flow with validation + good UX states.
- Enforce a design system baseline (spacing scale, typography scale, shared components).

### Fix the Validator Bias
Current validator checks accidentally bias outputs toward OpenAI SDK usage in Node projects.
Replace this with project-type aware validation (web build/run, routing, tests present; backend endpoints and tests).

### Job Persistence
`JOB_STATUS` is in-memory, which breaks on restarts and multi-worker deployments.
Roadmap: store job state in Redis (short TTL) and/or persist to DB with a clean schema.

### Preview Reliability
Make `build.manifest.json` validation a patching step; fail early if manifest doesn't match filesystem.
Add build logs + screenshots to events so failures can be debugged without SSH access.

### Token + Model Strategy
- Plan with `OPENAI_PLAN_MODEL` (cheaper, structured output).
- Code with `OPENAI_CODE_MODEL` (stronger code quality).
- Keep clarify + final review configurable.
- Reduce prompt bloat: keep prompts strict, structured, and avoid repeating long rulebooks unnecessarily.

## Decisions We Made (So Far)
- Stage-based model routing is supported via env vars in `backend/.env` and centralized in `backend/services/openai_model_service.py`.
- Reasoning plan is required and must be explicitly confirmed before code generation.

## Verification Checklist (Before Shipping)
- `cd frontend; npm run build`
- Run a full generate cycle (prompt -> plan -> confirm -> build preview -> final confirm)
- Confirm job recovery and event streaming behavior across refreshes
- Confirm no secrets in repo and `.env` is not committed
