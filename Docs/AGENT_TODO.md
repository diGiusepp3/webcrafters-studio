# Agent TODO

- [ ] Re-test the full plan-review workflow on production: ensure `plan_ready` always shows a confirm button plus a chat input, even after a transient polling failure or a page refresh.
- [ ] Add a dedicated “Reject plan / Regenerate reasoning” action so the reasoning agent can iterate without requiring manual API calls.
- [ ] Audit the polling + event-stream lifecycle for leaked intervals or duplicate polling when recovering from `localStorage`.
- [ ] Capture and log every generator action (dev bypass checks, credit lookups, security scans) so we can diagnose why certain IDs still hit credit gating.
- [ ] Record AI chat input/output/responses (timestamps + messages) and feed that into the event/timeline work to improve autonomous heuristics.
- [ ] Expand preview/poll/test coverage for generation jobs, including long-polling events, security scan triggers, and auto-apply diff flows.
- [ ] Keep the dev-user flag service and navbar state in sync with backend updates so admin controls remain visible for configured IDs.
- [ ] Explore automation path for safe tool execution: log requests, confirm before writes, and surface events in UI timelines to ensure transparency.
- [ ] Audit the login/openid flows (email, GitHub, and dev SSO) to check token persistence, error handling, and missing UI feedback when authentication fails.
- [ ] Verify `/generate` and `/modify` produce deterministic event streams (plan/propose/approve/verify) and log every AI response so we can tune prompts based on actual outputs.
- [ ] Ensure security scan actions are surfaced in the new agent events feed, including the propose/apply loop, and add UI indicators if scans are still pending.
- [ ] Automate capturing backend logs (audit, incarceration of GitHub refresh, preview build logs) tied to each job so we can replay failures in the agent timeline.
- [ ] Audit `backend/services/modify_service.py`: surface errors when the AI response isn’t valid JSON, log failed parses, and decide whether `generate_modification_chat` is dead code or should drive chat history.
- [ ] Review GitHub import/sync endpoints for missing retries and ensure the service uses the secret-detection helpers before writing imported code (right now the scanner is defined but never used before sync).
- [ ] Reconcile the preview build status flow in `backend/services/preview_service.py` with `server.py` static serving so the `/preview` endpoint tracks cancelled/failed builds and adds events for the agent timeline.
- [ ] Run a backend unused-symbol sweep (e.g., `vulture`/`ruff` ductile hooks) over `backend/` and capture every unused function/class so we can prune dead helpers and guarantee 0 unused functions before release.
- [ ] Enable strict linting/unused checking on the frontend (ESLint `no-unused-vars`, `@typescript-eslint/no-unused-vars`, unused exports) and document all modules that currently have unused exports so tests can target them.
- [ ] Trace the frontend route map (components, pages, context providers) to confirm each exported function/component is actually imported somewhere; record missing references as separate AGENT_TODO entries so nothing leaks.
