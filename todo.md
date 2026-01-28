# TODO (Project-Wide)

This is the canonical task backlog. Keep it current. Prefer many small checkboxes over a few huge ones.

## Generator Quality (Output)
- [ ] Replace the current "OpenAI SDK in every Node project" validator with project-type aware checks (`backend/validators/node_openai_validator.py`).
- [ ] Add an explicit multi-page acceptance gate: fail generation if fewer than 4 meaningful routes are produced (web projects).
- [ ] Require a minimum "real flow" set for web projects: listing+detail + form flow + auth flow (when applicable).
- [ ] Improve generated backend defaults: sqlite for local, optional MySQL/Postgres wiring, consistent migrations strategy.
- [ ] Ensure generated projects include a complete `README.md` (run steps, env vars, architecture overview).
- [ ] Add a generator "design kit" (shared components, spacing scale, typography scale) as required structure for web outputs.

## Generator Reliability (Pipeline)
- [ ] Persist generation jobs beyond in-memory `JOB_STATUS` (Redis or DB) so refresh/restart does not lose jobs.
- [ ] Add "Reject plan / regenerate reasoning" button and endpoint (frontend + backend) for plan iteration.
- [ ] Ensure every stage emits an agent event (`/api/generate/events/{job_id}`) so the UI can show what/where/why.
- [ ] Add an explicit "model routing" UI line in the Generator timeline (shows clarify/plan/code/final model names).

## Preview/Build/Validation
- [ ] Make `build.manifest.json` mandatory for generated web projects and validate it during patching.
- [ ] Add Playwright e2e smoke test generation for web projects and ensure preview runner can execute it.
- [ ] Add build failure fix-loop improvements (auto-retry with capped iterations and clear diff/proposal output).

## Frontend UX
- [ ] Consolidate redundant generator panels (focus on agent output + timeline, reduce clutter during plan review).
- [ ] Add a persistent "Resume/discard job" UX that also supports canceling backend jobs (not just clearing localStorage).
- [ ] Confirm plan confirmation UX is single-source-of-truth (avoid multiple duplicate confirm buttons in different cards).

## Docs + Process
- [ ] Keep `Docs/AGENT_TODO.md` synced with this file (link or migrate items; avoid split backlogs).
- [ ] Document the exact production deployment flow (frontend build hosting + backend restart + env updates).
- [ ] Add a short "operator runbook" for production incidents (credits, jobs, preview build failures, auth failures).

## Cleanup
- [ ] Run an unused exports/symbol sweep over `backend/` and `frontend/`, record removals as separate PRs.
- [ ] Normalize encoding in Docs (remove mojibake like "â€”", "â€™") and enforce UTF-8 for markdown files.

## Backlog (Imported From `Docs/AGENT_TODO.md`)
- [ ] Re-test full plan-review workflow on production (confirm button + plan chat survive polling failures + refresh).
- [ ] Add "Reject plan / Regenerate reasoning" action (frontend + backend).
- [ ] Audit polling + event-stream lifecycle for leaked intervals / duplicate pollers.
- [ ] Capture and log generator actions (dev bypass checks, credit lookups, security scans) as agent events for diagnosis.
- [ ] Record AI input/output (timestamps + messages) and feed into events/timeline for better debugging.
- [ ] Expand preview/poll/test coverage for long-polling events, security scan triggers, and auto-apply diff flows.
- [ ] Keep dev-user flag service and navbar state in sync with backend so admin controls remain correct.
- [ ] Audit login flows and token persistence (email + GitHub + dev SSO) and improve missing UX feedback.
- [ ] Ensure `/generate` and `/modify` produce deterministic event streams and log every AI response for prompt tuning.
- [ ] Surface security scan actions in agent events feed, including propose/apply loop, with clear UI indicators.
- [ ] Capture backend logs tied to each job (GitHub refresh, preview build logs) to replay failures in the timeline.
- [ ] Improve `backend/services/modify_service.py` error handling for invalid JSON responses and decide whether dead helpers should be removed.
- [ ] Reconcile preview build status flow in `backend/services/preview_service.py` with static serving so cancel/fail states propagate to UI.
