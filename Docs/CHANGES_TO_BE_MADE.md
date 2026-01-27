# Changes To Be Made

This file tracks high-leverage improvements identified but not yet implemented.

## Outstanding Non-Functional Items
- Landing page "Watch Demo" button scrolls to a missing `demoRef` target, so clicking it currently does nothing (there is no demo section to reveal).
- The hero/demo experience still lacks a recorded walkthrough or interactive preview, so the CTA cannot surface the hands-on demo it promises.
- Preview logs, runtime errors, and build insights introduced by the new chat layout still need a drawer/accordion so users can audit failure details without leaving the workspace.

## Generator Quality Gates
- Add a post-generation validator that rejects outputs missing: header, hero, features, social proof, CTA, footer.
- Add a validator that checks for `build.manifest.json` and warns if it conflicts with file structure.
- Add a validator that scans generated JS/JSX for `console.log` and strips or fails it.

## Security and Reliability Gates
- Add a generated-code scan that flags hardcoded secrets and common risky patterns.
- Add explicit checks that frontend previews render without any backend dependency.
- Ensure preview error messages include the last N build log lines in the UI by default.

## Testing Improvements
- Encourage or inject a minimal smoke test for the main UI in standard templates.
- Add a fast CI-like test command for generator outputs (schema check + build check + preview manifest check).

## Prompt System Improvements
- Split prompts further by project type: `frontend`, `fullstack`, `backend`.
- Add a `backend/prompts/rules/` folder that mirrors helper rules (security, style, testing) and is injected into the system prompt.
- Include a clear instruction to use only declared dependencies when adding icons, UI kits, or animations.

## Agent-Like Specialization (Without Claude)
- Add internal "roles" in the fix loop, for example: planner, architect, code-reviewer, build-error-resolver.
- Run the "reviewer" role after generation and before saving to reduce broken previews.

## Preview Pipeline Improvements
- Persist preview build logs per preview id and surface them via a "Show logs" button in the UI.
- Record a compact preview summary per build attempt (framework, build tool, out dir, error signature).
- Add a fast fallback mode that serves a static index with section anchors if the build fails.
- Surface the preview log stream and runtime errors inside the new chat-first workspace so the timeline and final reasoning can highlight them before final confirmation.
