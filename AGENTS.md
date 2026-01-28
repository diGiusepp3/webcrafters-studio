# Repository Guidelines

## Project Structure & Module Organization
- `backend/` runs FastAPI (`server.py`), routes in `api/`, SQLAlchemy models/schemas, and services that orchestrate generation, clarify, and security helpers.
- `frontend/` is a React/Tailwind shell: store components in `src/components/`, pages in `src/pages/`, context providers in `src/context/`, and shared API helpers in `src/api.js`. `Generator.jsx` wires the prompt → clarify → generate flow.
- `Docs/`, `scripts/`, `memory/`, and `webcrafters-ai-helpers/` are supporting folders; treat snapshots as read-only unless a task explicitly changes them.

## Build, Test, and Development Commands
- `cd frontend && yarn install` then `yarn start` for development; `npm run build` produces `frontend/build`.
- `cd backend && pip install -r requirements.txt`, copy `env-dev.txt` to `backend/.env`, fill `OPENAI_API_KEY`, `JWT_SECRET`, and `REACT_APP_BACKEND_URL`, and run `uvicorn server:app --host 0.0.0.0 --port 8000 --reload`.
- Once the API is live, run `python backend_test.py` and keep `tests/testCommands.txt` updated with manual verification steps.

## Coding Style & Naming Conventions
- Python files use `snake_case` (modules) and `PascalCase` (classes); align folders with their domain (e.g., `validators/`, `services/`).
- React components and pages stay in PascalCase; keep Tailwind utilities inline so styling stays near markup.
- Reuse helpers from `/webcrafters-ai-helpers/` when extending generation or agent logic for consistent frontend/backend flows.

## Testing Guidelines
- Update `backend_test.py` whenever new endpoints land and name new suites `test_*.py` for future pytest discovery.
- Record manual troubleshooting steps, clarifications, and generation checks in `tests/testCommands.txt` so on-call engineers have a current playbook.
- When running frontend checks (`npm run test` or `npm run build`), confirm warnings are understood and no unhandled rejections remain.

## Commit & Pull Request Guidelines
- Keep commits short and imperative (e.g., “Fix generator polling”). Each PR needs a concise description, linked issues if applicable, and a list of QA commands.
- Attach screenshots only when UI changes; call out generator/agent updates so reviewers can run the clarify → generate → confirm loop.

## Security & Configuration Tips
- Never commit `.env`, `env-dev.txt`, or other credential files. Keep placeholders and rotate `JWT_SECRET` before production releases.
- Limit `CORS_ORIGINS` to the domains you actually serve and follow the README’s production hardening guidance (HTTPS, rate limits, scans) before deploying.

## Agent & Helper References
- Follow `Docs/AGENTS.md` for the Reasoning → CODE → TEST → BUILD workflow, the timeline event format, and approval expectations before switching phases.
- Treat `/webcrafters-ai-helpers/` as the shared primitive library for generators, clarifiers, and security tooling.
 