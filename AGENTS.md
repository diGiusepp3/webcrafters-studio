# Repository Agents Guide (Extended)

This repository contains a multi-agent "project generator" (reasoning -> code -> test -> security -> build -> final review)
that produces runnable projects for users. This file is the single source of truth for how an agent should work in this repo,
even when using a smaller model: follow the checklists, update the tracking files, and never skip verification.

If you are an automated agent, you MUST:
- Keep changes incremental and reversible.
- Prefer small, scoped commits.
- Record every change request and every completed change in `todo.md` and `done.md`.
- Keep the generator pipeline deterministic: prompt -> (optional clarify) -> reasoning plan -> user confirmation -> code -> patch -> test -> security -> preview -> final reasoning -> user confirmation.

## Where Things Live

Backend (FastAPI)
- Entry point: `backend/server.py`
- Generator API + job orchestration: `backend/api/generate.py`
- Prompt templates: `backend/prompts/`
- Prompt assembly: `backend/services/prompt_service.py`
- OpenAI client + stage model routing: `backend/core/config.py`, `backend/services/openai_model_service.py`
- AI calls (clarify/reasoning/code/final): `backend/services/ai_service.py`
- Agents: `backend/agents/` (reasoning/code/test/security/build)
- Preview build & screenshots: `backend/services/preview_service.py`, `backend/services/screenshot_service.py`

Frontend (React)
- Generator UX: `frontend/src/pages/Generator.jsx`
- Credits/plans UX: `frontend/src/pages/Credits.jsx`
- API client: `frontend/src/api.js`

Helper toolkit (shared rules/skills/patterns)
- `webcrafters-ai-helpers/` (see `webcrafters-ai-helpers.md`)

## Generator Flow (Contract)

This flow is a contract between frontend and backend. Do not "simplify" it without updating both sides.

1) User enters prompt
   - Frontend posts `POST /api/generate` with `prompt`, `project_type`, and optional `preferences`.
2) Clarify (optional)
   - Backend may transition to `status=clarify` and return questions.
   - Frontend posts `POST /api/generate/continue/{job_id}` with answers.
3) Reasoning plan (required)
   - Backend transitions to `status=plan_ready`, includes `plan_summary`, `plan_message`, `plan_text`.
   - Frontend must show the plan and require explicit confirmation.
4) Plan confirmation (required)
   - Frontend calls `POST /api/generate/plan/{job_id}/confirm`.
   - Only after this do we run code generation.
5) Code + patch + test + security + preview + final reasoning
   - Backend persists the project and returns `project_id`, files, test report, security results, preview build results.
   - Final reasoning transitions to `status=review_pending` and requires `POST /api/generate/final/confirm/{job_id}`.

If any stage can be skipped, it must be an explicit, reviewed design decision and written in `optimise.md`.

## OpenAI Configuration (Key + Stage Models)

Backend reads `OPENAI_API_KEY` from `backend/.env` via `backend/core/config.py:get_openai_client()`.
Do not instantiate OpenAI clients by directly reading `os.getenv("OPENAI_API_KEY")` in random files.

Model routing (by stage) is centralized in `backend/services/openai_model_service.py`:
- `OPENAI_CLARIFY_MODEL` (clarification questions)
- `OPENAI_PLAN_MODEL` (reasoning/PRD/IA planning)
- `OPENAI_CODE_MODEL` (code generation + most "make changes" operations)
- `OPENAI_FINAL_MODEL` (final reasoning review)
- Optional: `OPENAI_REPAIR_MODEL`, `OPENAI_MODIFY_MODEL`

Rule of thumb (good defaults):
- Plan with a cheaper reasoning-capable model; code with a stronger code-writing model.
- Keep models configurable; never hardcode them in agent code paths.

## What "Production-Ready" Means Here

Production-ready is not "pretty landing page". It means:
- Multi-page structure with real routes and real user flows (not empty placeholders).
- A clean build path (`build.manifest.json` for web projects, correct `web_root`, correct `out_dir`).
- Security baseline: no secrets in code, safe input handling, sane auth defaults.
- Tests: at least smoke tests for critical flows (web e2e when applicable).
- Clear docs: `README.md` in generated output that explains how to run it.

## Change Process (How Agents Should Work)

Every work session must follow this discipline:
1) Read the request, restate the acceptance criteria in one paragraph.
2) Identify the affected modules/files (keep the list small).
3) Add/adjust tasks in `todo.md` (small checkboxes).
4) Make the smallest change that can prove progress.
5) Run the cheapest verification that meaningfully exercises the change:
   - frontend: `cd frontend; npm run build`
   - backend: `python -m py_compile ...` and optionally `python backend_test.py` with backend running
6) Update `done.md` with what changed and evidence (commands run, key outcomes).

## Agent Roles (What Each Agent Must Do)

This repo is designed around a plan-driven multi-agent pipeline. Even if one process is doing all work,
you must keep the boundaries clear so the UI and logs remain meaningful.

Reasoning agent
- Inputs: user prompt, project_type, design guidelines summary, helper rules summary.
- Outputs: strict JSON plan including information architecture (`pages[]`) and (when applicable) `api_endpoints[]`.
- Non-negotiable: plan must be shown to the user and explicitly confirmed before code generation starts.

Code agent
- Inputs: user prompt + confirmed plan text.
- Outputs: full project file tree (no placeholders), including `build.manifest.json` for web outputs.
- Non-negotiable: multi-page routes and at least one realistic data-driven flow for web outputs.

Test agent
- Inputs: generated files.
- Outputs: actionable validation report; must not "pass" while obvious breakages exist (missing imports, invalid manifest, etc).

Security agent
- Inputs: generated files.
- Outputs: findings + stats; auto-fix only when changes are safe and can be justified.

Build/preview agent
- Inputs: generated files + project metadata.
- Outputs: build result, preview URL, logs, screenshots (when configured).

Doc agent
- Inputs: repository state + changes.
- Outputs: updated documentation and tracking files (`todo.md`, `done.md`, `optimise.md`).

## Output Quality Checklists (By Project Type)

These are minimum bars. If generation does not meet them, treat it as a bug and add it to `todo.md`.

Web frontend (`project_type=frontend`)
- Vite + React Router + Tailwind, dark mode default.
- Minimum 4 routes/pages, all meaningful and styled.
- At least one listing + detail page and one form flow page with validation and UX states.
- `build.manifest.json` present and matches `frontend/` + `dist/`.

Web fullstack (`project_type=fullstack`)
- Includes the full frontend checklist.
- Backend API (FastAPI) with routers/schemas/services, consistent error handling.
- Auth scaffolding appropriate for the app (user/admin when required).
- Frontend must still render without backend (mock fallback) but can use `REACT_APP_BACKEND_URL` when configured.

Backend-only (`project_type=backend`)
- FastAPI service with versioned routes and docs.
- Clear env configuration and `.env.example`.
- Pytest tests for key endpoints, including auth if present.

Mobile (`project_type=mobile`)
- Prefer Expo + React Native, plus optional backend if required.
- At least 4 screens and one real flow (list -> detail, form submit, auth if needed).
- Document run steps clearly in README.

CLI (`project_type=cli`)
- Python (Typer) or Node (Commander) with subcommands, help text, and tests.
- README includes installation and example commands.

## Model Downgrade Strategy (So Smaller Models Still Ship Quality)

If running with a smaller/cheaper model:
- Reduce degrees of freedom: reuse existing templates, keep prompts strict, and prefer known-good stacks.
- Enforce structure: require the reasoning plan to include pages/routes and key flows; reject vague plans.
- Prefer repair loops over one-shot: validate output, then fix the smallest errors first.
- Use the helper rules as checklists (security, testing, coding style) rather than relying on "taste".

## Debugging Playbook (Common Failures)

Generator UI issues
- Missing or duplicated inputs: check `frontend/src/pages/Generator.jsx` conditional rendering.
- "Plan ready but can't confirm": verify `/api/generate/status/{job_id}` returns `status=plan_ready` and
  frontend `confirmPlan()` posts to `/api/generate/plan/{job_id}/confirm`.
- Events 404 spam: verify `/api/generate/events/{job_id}` route exists and frontend retries gracefully.

Backend job issues
- 404 on status/events: job is missing from in-memory store; check worker restarts and plan persistence.
- "Reasoning runs on refresh": check `localStorage` recovery logic in `frontend/src/pages/Generator.jsx`.
- Invalid AI JSON: check prompt templates and the JSON parser in `backend/repair/ai_repair.py`.

Preview/build issues
- Missing `build.manifest.json`: generator prompt must include it; verify `preview_service` manifest detection.
- Wrong `web_root`/`out_dir`: ensure manifest matches the generated folder structure.

## Task Tracking (Non-Negotiable)

These files must always reflect reality:
- `todo.md`: all pending work (tiny and huge).
- `done.md`: every completed item (with dates/commit IDs when possible).
- `optimise.md`: performance and quality roadmap + choices we made (and why).
- `webcrafters-ai-helpers.md`: what helper modules exist, what is already integrated, and what remains.

If you discover work while debugging, add it to `todo.md` immediately. Do not keep "mental TODOs".

## References

- Agent workflow spec: `Docs/AGENTS.md`
- Current backlog from earlier passes: `Docs/AGENT_TODO.md`
- Change logs: `Docs/MADE_CHANGES.md`, `Docs/NON_MADE_CHANGES.md`
