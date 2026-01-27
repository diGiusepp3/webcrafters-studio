# Frontend Component Test Inventory

## Top-level components (src/components)
- `AgentChatbox.jsx` — test chat message rendering + interaction with AgentTimeline data.
- `AgentTimeline.jsx` — verify timeline step styles and icon mapping for statuses.
- `CodeEditor.jsx` — ensure editor props trigger save/dirty states and read-only when typing.
- `CodePreview.jsx` — cover preview iframe toggles, download/cancel buttons, and log messages.
- `FileTree.jsx` — confirm file selection fires events and highlights selected paths.
- `Footer.jsx` — basic rendering tests (links, copyright).
- `GitHubImportModal.jsx` — exercise import flows (modal open/close, repo list handling).
- `Navbar.jsx` — assert dev-user nav links toggle, mobile menu, login/logout flows.
- `PreviewPanel.jsx` — cover preview status display, fullscreen toggle, close behavior.
- `SecurityFindings.jsx` — ensure severity badges, expanding items, and grouping sorts.
- `WebcraftersLogo.jsx` — static rendering (SVG correctness).

## Generator-specific components (src/components/generator)
- `AgentEventStream.jsx` — test event list rendering, severity badges, empty state messaging.
- `AgentTimelinePanel.jsx` — verify progressStep mapping + status class logic.
- `ClarifyDialog.jsx` — cover question prompts, input control, submit/skip buttons.
- `DiffViewer.jsx` — assert diff data renders, apply summary, and onApply callbacks.
- `LiveCodeEditor.jsx` — simulate typing animation, file switching, and scroll behavior.
- `PreviewSidebar.jsx` — cover navigation between preview controls, screenshot opener.
- `ProjectTypeSelector.jsx` — ensure selector options trigger callbacks, disabled states.
- `PromptSuggestions.jsx` — confirm suggestion click fills prompt and closes list.
- `TemplateSelector.jsx` — test template cards, selection highlight, and open/close actions.

## Next steps
1. For each component above, write a test stub (render + props + interactions) and list the necessary mocks (e.g., `api` for GitHub imports).
2. Track failing tests or missing coverage in this file, grouping by component so we can repeatedly mark progress.
3. Write next steps in this file
4. rerun a complete site check using AGENTS.md