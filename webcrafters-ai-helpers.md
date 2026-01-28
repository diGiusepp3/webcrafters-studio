# Webcrafters AI Helpers (What We Can Reuse)

This repository includes a local helper toolkit at `webcrafters-ai-helpers/`.
Treat it as the shared "primitive library" for rules, patterns, and workflows.

## What Exists (Directory Map)

Rules (copy/consume as canonical checklists)
- `webcrafters-ai-helpers/rules/agents.md`
- `webcrafters-ai-helpers/rules/coding-style.md`
- `webcrafters-ai-helpers/rules/security.md`
- `webcrafters-ai-helpers/rules/testing.md`
- `webcrafters-ai-helpers/rules/performance.md`
- `webcrafters-ai-helpers/rules/patterns.md`
- `webcrafters-ai-helpers/rules/git-workflow.md`

Skills (deeper guidance by domain/workflow)
- `webcrafters-ai-helpers/skills/backend-patterns/`
- `webcrafters-ai-helpers/skills/frontend-patterns/`
- `webcrafters-ai-helpers/skills/tdd-workflow/`
- `webcrafters-ai-helpers/skills/security-review/`
- `webcrafters-ai-helpers/skills/verification-loop/`
- `webcrafters-ai-helpers/skills/coding-standards/`

Commands (repeatable playbooks)
- `webcrafters-ai-helpers/commands/plan.md`
- `webcrafters-ai-helpers/commands/tdd.md`
- `webcrafters-ai-helpers/commands/e2e.md`
- `webcrafters-ai-helpers/commands/code-review.md`
- `webcrafters-ai-helpers/commands/build-fix.md`
- `webcrafters-ai-helpers/commands/refactor-clean.md`
- `webcrafters-ai-helpers/commands/verify.md`

Agents / hooks / contexts / plugins
- `webcrafters-ai-helpers/agents/`
- `webcrafters-ai-helpers/hooks/`
- `webcrafters-ai-helpers/contexts/`
- `webcrafters-ai-helpers/plugins/`
- `webcrafters-ai-helpers/mcp-configs/`

## What Is Already Integrated Here (DONE)
- Shared rules summary is injected into prompt templates via `backend/services/claude_rule_service.py`.
  Today it loads these rule files:
  - `webcrafters-ai-helpers/rules/coding-style.md`
  - `webcrafters-ai-helpers/rules/security.md`
  - `webcrafters-ai-helpers/rules/testing.md`
  - `webcrafters-ai-helpers/rules/agents.md`
- The generator pipeline references these rules in the reasoning, generation, and final review prompt templates under `backend/prompts/`.

## What We Still Need To Integrate (TODO)

### TODO (Helpers Integration)
- [ ] Expand the rules summary to include `performance.md` and `patterns.md` (and ensure prompts stay within token budget).
- [ ] Create a structured "quality gates" section derived from helper rules and enforce it during patch/test stages.
- [ ] Wire helper "commands" into the Studio UI as clickable runbooks (plan, verify, tdd, e2e, build-fix).
- [ ] Use helper "skills" as targeted retrieval sources during agent stages:
  - Backend patterns when generating FastAPI routes and auth.
  - Frontend patterns when generating React Router apps and component systems.
  - TDD workflow when generating tests and coverage targets.
- [ ] Add an explicit verification loop that runs after generation (build + smoke + security) and records pass/fail in events.

### DONE (Helpers Integration)
- [x] Rules summary injection exists and is used by the generator prompts.

## Relationship With `todo.md` / `done.md`
- This file tracks helper-specific work only.
- Project-wide tasks live in `todo.md` / `done.md`.
