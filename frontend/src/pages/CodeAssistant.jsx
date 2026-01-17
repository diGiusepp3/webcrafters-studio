// FILE: frontend/src/pages/CodeAssistant.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "@/api";

/**
 * Plug-in route (voor createBrowserRouter / route arrays):
 *   import CodeAssistant, { CODE_ASSISTANT_ROUTE } from "@/pages/CodeAssistant";
 *   voeg CODE_ASSISTANT_ROUTE toe aan je routes.
 */
export const CODE_ASSISTANT_ROUTE = {
    path: "/code-assistant",
    element: <CodeAssistant />,
};

/**
 * CodeAssistant Page
 * - Full "content-aware" UI shell: project picker + file search + context selection + chat.
 * - Verwacht backend endpoints (maak ze in je FastAPI):
 *   - GET  /api/code-assistant/projects
 *   - GET  /api/code-assistant/tree?project_id=...
 *   - POST /api/code-assistant/chat   { project_id, message, selected_paths, mode }
 *
 * Als endpoints nog niet bestaan: UI toont duidelijke errors (zonder te crashen).
 *
 * ✅ AANGEPAST AAN JOUW HUIDIGE BACKEND:
 * backend/api/code_assistant.py heeft:
 *   - GET  /api/codeassistant/fs/list?path=...
 *   - GET  /api/codeassistant/fs/read?path=...
 *   - POST /api/codeassistant/ai/chat { message, context_paths, model }
 *
 * Omdat api.js baseURL al op /api eindigt, gebruiken we hieronder:
 *   /codeassistant/...
 */
export default function CodeAssistant() {
    const [projects, setProjects] = useState([]);
    const [projectId, setProjectId] = useState("");
    const [tree, setTree] = useState([]); // [{ path, type: "file"|"dir" }]
    const [selectedPaths, setSelectedPaths] = useState(() => new Set());
    const [fileQuery, setFileQuery] = useState("");
    const [mode, setMode] = useState("focused"); // "focused" | "broad"
    const [messages, setMessages] = useState([
        {
            role: "assistant",
            content:
                "Drop your question. Select files/folders for context. If the backend endpoints aren’t live yet, I’ll show you exactly what failed.",
        },
    ]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const chatEndRef = useRef(null);

    const ENDPOINTS = {
        ping: "/codeassistant/ping",
        list: "/codeassistant/fs/list",
        read: "/codeassistant/fs/read",
        chat: "/codeassistant/ai/chat",
    };

    useEffect(() => {
        (async () => {
            setError("");
            try {
                // ✅ "projects" simuleren met de directories in FS_ROOT
                const res = await api.get(ENDPOINTS.list, { params: { path: "" } });
                const entries = Array.isArray(res?.data?.entries) ? res.data.entries : [];

                const dirs = entries
                    .filter((e) => String(e?.type) === "dir")
                    .map((e) => ({
                        id: String(e.path),
                        name: String(e.name || e.path),
                    }));

                // fallback: 1 virtual project als er geen dirs zijn (of backend retourneert leeg)
                const list = dirs.length ? dirs : [{ id: "", name: "(root)" }];

                setProjects(list);
                if (!projectId && list?.[0]?.id !== undefined) setProjectId(String(list[0].id));
            } catch (e) {
                setError(extractErr(e, `Failed to load projects (GET ${ENDPOINTS.list}).`));
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ✅ DEZE BLOCK BLIJFT ERIN (zoals jij wou), maar gebruikt jouw echte backend fs/list
    useEffect(() => {
        if (projectId === null || projectId === undefined) return;
        (async () => {
            setError("");
            try {
                const res = await api.get(ENDPOINTS.list, { params: { path: projectId } });
                const entries = Array.isArray(res?.data?.entries) ? res.data.entries : [];

                const list = entries.map((e) => ({
                    path: String(e.path),
                    type: String(e.type) === "dir" ? "dir" : "file",
                }));

                setTree(list);
                setSelectedPaths(new Set()); // reset context on project change
            } catch (e) {
                setTree([]);
                setSelectedPaths(new Set());
                setError(extractErr(e, `Failed to load file tree (GET ${ENDPOINTS.list}).`));
            }
        })();
    }, [projectId]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, busy]);

    const filteredTree = useMemo(() => {
        const q = fileQuery.trim().toLowerCase();
        if (!q) return tree;
        return tree.filter((n) => String(n.path || "").toLowerCase().includes(q));
    }, [tree, fileQuery]);

    const selectedCount = selectedPaths.size;

    function togglePath(p) {
        setSelectedPaths((prev) => {
            const next = new Set(prev);
            if (next.has(p)) next.delete(p);
            else next.add(p);
            return next;
        });
    }

    function selectAllFiltered() {
        setSelectedPaths((prev) => {
            const next = new Set(prev);
            for (const n of filteredTree) {
                if (n?.type === "file") next.add(String(n.path));
            }
            return next;
        });
    }

    function clearSelection() {
        setSelectedPaths(new Set());
    }

    async function send() {
        const text = input.trim();
        if (!text || busy) return;

        setError("");
        setBusy(true);
        setInput("");

        const userMsg = { role: "user", content: text };
        setMessages((m) => [...m, userMsg]);

        try {
            // ✅ match backend schema
            const payload = {
                message: text,
                context_paths: Array.from(selectedPaths),
                model: null,
                // mode is frontend-only for now
            };

            const res = await api.post(ENDPOINTS.chat, payload);

            // backend returns { ok, raw, parsed } ; parsed may contain {reply, edits}
            const answer =
                res?.data?.parsed?.reply ??
                res?.data?.answer ??
                res?.data?.message ??
                res?.data?.content ??
                res?.data?.raw ??
                (typeof res?.data === "string" ? res.data : null);

            if (!answer) {
                throw new Error(`Backend returned no answer. Expected {parsed.reply} or {raw} from POST ${ENDPOINTS.chat}.`);
            }

            setMessages((m) => [
                ...m,
                {
                    role: "assistant",
                    content: String(answer),
                    meta: res?.data?.parsed || res?.data?.meta || null,
                },
            ]);
        } catch (e) {
            const msg = extractErr(e, `Chat failed (POST ${ENDPOINTS.chat}).`);
            setError(msg);
            setMessages((m) => [
                ...m,
                {
                    role: "assistant",
                    content:
                        "I hit an error calling the backend.\n\n" +
                        "What I tried:\n" +
                        `- POST ${ENDPOINTS.chat}\n` +
                        `- project_id (UI): ${projectId || "(root)"}\n` +
                        `- context_paths: ${selectedCount}\n` +
                        `- mode (UI): ${mode}\n\n` +
                        "Error:\n" +
                        msg,
                },
            ]);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100">
            <div className="mx-auto max-w-7xl px-4 py-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-xl font-semibold tracking-tight">Code Assistant</div>
                        <div className="text-sm text-zinc-400">
                            Content-aware chat over your project files (select context → ask → get patches).
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-300">
                            /code-assistant
                        </span>
                    </div>
                </div>

                {error ? (
                    <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">
                        {error}
                    </div>
                ) : null}

                <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
                    {/* Left: context */}
                    <div className="lg:col-span-4">
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-semibold">Context</div>
                                <div className="text-xs text-zinc-400">{selectedCount} selected</div>
                            </div>

                            <div className="mt-3 grid gap-2">
                                <label className="text-xs text-zinc-400">Project</label>
                                <select
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
                                    value={projectId}
                                    onChange={(e) => setProjectId(e.target.value)}
                                >
                                    {projects.length === 0 ? (
                                        <option value="">(no projects)</option>
                                    ) : (
                                        projects.map((p) => (
                                            <option key={String(p.id)} value={String(p.id)}>
                                                {p.name ? String(p.name) : `Project ${String(p.id)}`}
                                            </option>
                                        ))
                                    )}
                                </select>

                                <label className="mt-2 text-xs text-zinc-400">Mode</label>
                                <div className="flex gap-2">
                                    <ModeButton active={mode === "focused"} onClick={() => setMode("focused")}>
                                        Focused
                                    </ModeButton>
                                    <ModeButton active={mode === "broad"} onClick={() => setMode("broad")}>
                                        Broad
                                    </ModeButton>
                                </div>

                                <label className="mt-2 text-xs text-zinc-400">Find file</label>
                                <input
                                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
                                    placeholder="e.g. server.py, App.jsx, auth..."
                                    value={fileQuery}
                                    onChange={(e) => setFileQuery(e.target.value)}
                                />

                                <div className="mt-2 flex gap-2">
                                    <button
                                        className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-900"
                                        onClick={selectAllFiltered}
                                        type="button"
                                        disabled={!filteredTree.length}
                                    >
                                        Select filtered files
                                    </button>
                                    <button
                                        className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-900"
                                        onClick={clearSelection}
                                        type="button"
                                        disabled={!selectedCount}
                                    >
                                        Clear
                                    </button>
                                </div>

                                <div className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-2">
                                    {filteredTree.length === 0 ? (
                                        <div className="p-2 text-xs text-zinc-500">
                                            {projectId !== null
                                                ? "No files loaded (tree empty or backend not implemented)."
                                                : "Pick a project."}
                                        </div>
                                    ) : (
                                        <ul className="space-y-1">
                                            {filteredTree.map((n, idx) => {
                                                const p = String(n.path || "");
                                                const isFile = String(n.type || "file") === "file";
                                                const checked = selectedPaths.has(p);
                                                return (
                                                    <li key={`${p}-${idx}`} className="flex items-center gap-2">
                                                        <input
                                                            type="checkbox"
                                                            className="h-4 w-4 accent-zinc-200"
                                                            checked={checked}
                                                            onChange={() => togglePath(p)}
                                                            disabled={!isFile}
                                                            title={isFile ? "Use as context" : "Directory (not selectable)"}
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="truncate text-xs text-zinc-200">{p}</div>
                                                            <div className="text-[11px] text-zinc-500">
                                                                {isFile ? "file" : "dir"}
                                                            </div>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>

                                <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
                                    Tip: select only the files you actually want me to “see”. Broad mode = larger
                                    context request (backend decides).
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: chat */}
                    <div className="lg:col-span-8">
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-semibold">Assistant</div>
                                <div className="text-xs text-zinc-400">
                                    Context: {selectedCount} file(s) • Mode: {mode}
                                </div>
                            </div>

                            <div className="mt-3 h-[520px] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                                {messages.map((m, i) => (
                                    <MessageBubble key={i} role={m.role} meta={m.meta}>
                                        {m.content}
                                    </MessageBubble>
                                ))}
                                {busy ? (
                                    <div className="mt-3 text-xs text-zinc-500">Thinking… (waiting on backend)</div>
                                ) : null}
                                <div ref={chatEndRef} />
                            </div>

                            <div className="mt-3 flex gap-2">
                                <input
                                    className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm outline-none"
                                    placeholder="Ask: 'why is preview missing?' or 'make /code-assistant route use auth + credits'…"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            send();
                                        }
                                    }}
                                    disabled={busy}
                                />
                                <button
                                    className="rounded-lg border border-zinc-800 bg-white px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                                    onClick={send}
                                    type="button"
                                    disabled={busy || !input.trim()}
                                >
                                    Send
                                </button>
                            </div>

                            <div className="mt-2 text-xs text-zinc-500">
                                Backend contract: dev-only endpoints under <code>/api/codeassistant/*</code>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-6 text-xs text-zinc-500">
                    Production reminder: after adding this route/page, run your frontend build (you deploy build
                    output).
                </div>
            </div>
        </div>
    );
}

function ModeButton({ active, onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "flex-1 rounded-lg border px-3 py-2 text-xs font-semibold",
                active
                    ? "border-zinc-200 bg-zinc-200 text-zinc-950"
                    : "border-zinc-800 bg-zinc-950 text-zinc-200 hover:bg-zinc-900",
            ].join(" ")}
        >
            {children}
        </button>
    );
}

function MessageBubble({ role, meta, children }) {
    const isUser = role === "user";
    return (
        <div className={["mb-3 flex", isUser ? "justify-end" : "justify-start"].join(" ")}>
            <div
                className={[
                    "max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    isUser
                        ? "bg-zinc-200 text-zinc-950"
                        : "border border-zinc-800 bg-zinc-900/40 text-zinc-100",
                ].join(" ")}
            >
                <div className="text-[11px] font-semibold opacity-70">
                    {isUser ? "You" : "Assistant"}
                </div>
                <div className="mt-1">{children}</div>
                {meta ? (
                    <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-400">
                        meta: {safeJson(meta)}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function extractErr(e, fallback) {
    try {
        const msg =
            e?.response?.data?.detail ||
            e?.response?.data?.message ||
            e?.message ||
            e?.toString?.() ||
            "";
        const status = e?.response?.status ? `HTTP ${e.response.status}` : "";
        return [fallback, status, msg].filter(Boolean).join(" — ");
    } catch {
        return fallback;
    }
}

function safeJson(v) {
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}
