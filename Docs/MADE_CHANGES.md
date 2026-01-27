# Made Changes (2026-01-27)

This file tracks changes that were actually implemented in this repo.

## Generator Refactor
- Externalized generator prompts into files under `backend/prompts/`.
- Added `backend/services/prompt_service.py` to load prompt templates and summarize `design_guidelines.json`.
- Updated `backend/services/ai_service.py` to build prompts from the new prompt service.

## Stronger "Complete Website" Defaults
- Updated `backend/services/preflight_service.py`.
- Default `frontend_stack` is now `react-vite`.
- Added `site_requirements` with required sections: header, hero, features, social proof, CTA, footer.
- Kept SEO `frontend/public/index.html` enforcement.

## Helper Rules Integrated (from webcrafters-ai-helpers)
- Updated `backend/prompts/generator_system_prompt.txt`.
- Added WOW-in-5-seconds emphasis.
- Added coding standards: small files, immutability, error handling, input validation, no `console.log`.
- Added security standards: no hardcoded secrets, env vars for config, avoid unsafe HTML.
- Added lightweight testing guidance.
- Added REQUIRED `build.manifest.json` instructions to help preview builds.

## Multi-Agent Pipeline & Reasoning
- Reworked the generation worker so the reasoning agent fires first, writes a PRD + plan, and waits for an explicit `/generate/plan/{job_id}/confirm` call before the code agent runs.
- Wired the pipeline through dedicated agents for code, tests, security, preview build (fix loop), and final reasoning. All stages emit timeline/chat updates plus new job metadata (`plan_*`, `test_report`, `final_reasoning`, etc.).
- Added `/generate/final/confirm/{job_id}` so users can acknowledge the reasoning agent’s final checklist before the job finishes; the final reasoning agent now references the coding-style, security, and testing checklists from `webcrafters-ai-helpers` via `backend/prompts/final_reasoning_*.txt`.
- Extended the backend status API to return plan text, plan message, build result, and final reasoning payloads so the frontend can drive the new flow.

## Generator UI Overhaul
- Replaced the dual-pane loading UI with a single chat-centric workspace that surfaces the latest reasoning plan, security snapshot, plan confirmation CTA, chat history, and final reasoning summary.
- Added frontend states, confirm buttons, and derived messaging that reacts to the new `plan_ready` and `review_pending` job statuses, and highlights the final reasoning issues, checks, and readiness flag.
- Kept the initial form/tips unchanged while exposing the new plan/final data so the UI stays as immersive as the first generation experience.

## Local Build Verification
- Ran `npm ci` and `npm run build` in `frontend/`.
- The frontend build completed successfully and produced `frontend/build/`.

## Notes
- Remote deployment was attempted via SSH but you decided to handle deployment manually.

## Claude Helper Rules
- Added `backend/services/claude_rule_service.py` to hydrate the Everything Claude rulebooks (`coding-style`, `security`, `testing`, `agents`) so every prompt can reference the same guardrails.
- Updated the generator, reasoning, and final reasoning prompts (system + user templates) to include `{{CLAUDE_RULES_SUMMARY}}`, ensuring immutability, security, and testing expectations travel with the plan.
- `prompt_service` now injects the shared rule summary whenever prompts are built, keeping the multi-agent pipeline aligned with the helper rulebook without hardcoding the text.

## Chat-First Generator Workspace
- Replaced the legacy split-grid generator page with a single-column, chat-first workspace that surfaces the plan card, timeline, agent chat, final reasoning, and preview status in the center of the page.
- The hero card now highlights live agent status/progress and consolidates template/project-type controls, prompt textarea, error/clarification messaging, and the generate button into one immersive section.
- Added map-style cards for plan confirmation, timeline visualization, final reasoning checklist, and preview build state while keeping the preview iframe and diff modal exactly where they belong.
