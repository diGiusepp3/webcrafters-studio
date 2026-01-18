// FILE: frontend/src/pages/CodeAssistant.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "@/api";

/**
 * Route: /code-assistant
 * Backend:
 *  - GET  /api/codeassistant/ping
 *  - GET  /api/codeassistant/fs/list?path=
 *  - GET  /api/codeassistant/fs/read?path=
 *  - POST /api/codeassistant/ai/chat   { message, context_paths, model? }
 *  - POST /api/codeassistant/fs/write  { path, content, expected_sha256?, make_dirs?, backup? }
 */

const CHAT_STORAGE_KEY_ANON = "wcstudio_codeassistant_chat_v1_anon";

const DEFAULT_MESSAGES = [
    {
        role: "assistant",
        content:
            "Dev-only CodeAssistant. Select files as context, ask a question, get safe JSON edits (backend-enforced).",
    },
];

function safeJsonParse(raw, fallback) {
    try {
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function loadStoredChat(key) {
    const payload = safeJsonParse(localStorage.getItem(key), null);
    const msgs = payload?.messages;
    if (!Array.isArray(msgs) || msgs.length === 0) return null;
    // Only persist minimal fields (avoid storing huge edits/new_content in localStorage)
    return msgs
        .filter((m) => m && typeof m === "object")
        .map((m) => ({
            role: String(m.role || "assistant"),
            content: String(m.content || ""),
        }));
}

function saveStoredChat(key, messages) {
    const minimal = Array.isArray(messages)
        ? messages.map((m) => ({
            role: String(m?.role || "assistant"),
            content: String(m?.content || ""),
        }))
        : DEFAULT_MESSAGES;

    // Keep it sane: last 200 messages
    const trimmed = minimal.slice(-200);

    localStorage.setItem(
        key,
        JSON.stringify({
            v: 1,
            ts: Date.now(),
            messages: trimmed,
        })
    );
}

export default function CodeAssistant() {
    const API_PREFIX = useMemo(() => {
        const base = String(api?.defaults?.baseURL || "");
        return base.includes("/api") ? "" : "/api";
    }, []);

    const ENDPOINTS = useMemo(
        () => ({
            ping: `${API_PREFIX}/codeassistant/ping`,
            list: `${API_PREFIX}/codeassistant/fs/list`,
            read: `${API_PREFIX}/codeassistant/fs/read`,
            write: `${API_PREFIX}/codeassistant/fs/write`,
            chat: `${API_PREFIX}/codeassistant/ai/chat`,
        }),
        [API_PREFIX]
    );

    const [ping, setPing] = useState(null);
    const [cwd, setCwd] = useState(""); // relative to DEV_FS_ROOT
    const [entries, setEntries] = useState([]);
    const [fileQuery, setFileQuery] = useState("");
    const [selected, setSelected] = useState(() => new Set()); // context_paths
    const [messages, setMessages] = useState(() => {
        const stored = loadStoredChat(CHAT_STORAGE_KEY_ANON);
        return stored || DEFAULT_MESSAGES;
    });
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const chatEndRef = useRef(null);

    // preview of a clicked file (left panel)
    const [preview, setPreview] = useState(null); // {path, content, sha256, size}

    // ✅ edit diff modal state
    const [editModal, setEditModal] = useState(null); // { edit, before, beforeSha, beforeSize }
    const [editModalLoading, setEditModalLoading] = useState(false);

    const selectedCount = selected.size;

    const chatStorageKey = useMemo(() => {
        const uid = String(ping?.user_id || "").trim();
        return uid ? `wcstudio_codeassistant_chat_v1_${uid}` : CHAT_STORAGE_KEY_ANON;
    }, [ping?.user_id]);

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

    function toggleSelect(path) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    }

    function clearSelection() {
        setSelected(new Set());
    }

    // --- ping once
    useEffect(() => {
        (async () => {
            setError("");
            try {
                const res = await api.get(ENDPOINTS.ping);
                setPing(res?.data || null);
            } catch (e) {
                setPing(null);
                setError(extractErr(e, `Ping failed (GET ${ENDPOINTS.ping}).`));
            }
        })();
    }, [ENDPOINTS.ping]);

    // ✅ migrate anon -> user key when ping becomes available
    useEffect(() => {
        const uid = String(ping?.user_id || "").trim();
        if (!uid) return;

        const userKey = `wcstudio_codeassistant_chat_v1_${uid}`;

        const userStored = loadStoredChat(userKey);
        if (userStored && userStored.length) {
            setMessages(userStored);
            return;
        }

        const anonStored = loadStoredChat(CHAT_STORAGE_KEY_ANON);
        if (anonStored && anonStored.length) {
            saveStoredChat(userKey, anonStored);
            localStorage.removeItem(CHAT_STORAGE_KEY_ANON);
            setMessages(anonStored);
        }
    }, [ping?.user_id]);

    // ✅ persist chat on every change
    useEffect(() => {
        saveStoredChat(chatStorageKey, messages);
    }, [chatStorageKey, messages]);

    // --- list directory
    async function loadDir(nextCwd) {
        setError("");
        try {
            const res = await api.get(ENDPOINTS.list, { params: { path: nextCwd || "" } });
            setCwd(String(res?.data?.base ?? nextCwd ?? ""));
            setEntries(Array.isArray(res?.data?.entries) ? res.data.entries : []);
        } catch (e) {
            setEntries([]);
            setError(extractErr(e, `Failed to list dir (GET ${ENDPOINTS.list}).`));
        }
    }

    useEffect(() => {
        loadDir("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, busy]);

    // --- filtered list
    const filteredEntries = useMemo(() => {
        const q = fileQuery.trim().toLowerCase();
        if (!q) return entries;
        return entries.filter((e) => String(e?.path || "").toLowerCase().includes(q));
    }, [entries, fileQuery]);

    // --- navigation
    function goUp() {
        if (!cwd) return;
        const parts = cwd.split("/").filter(Boolean);
        parts.pop();
        loadDir(parts.join("/"));
    }

    function openDir(path) {
        loadDir(path);
    }

    function selectAllFilteredFiles() {
        setSelected((prev) => {
            const next = new Set(prev);
            for (const e of filteredEntries) {
                if (e?.type === "file") next.add(String(e.path));
            }
            return next;
        });
    }

    // --- read file quick preview (left)
    async function openFile(path) {
        setError("");
        setPreview(null);
        try {
            const res = await api.get(ENDPOINTS.read, { params: { path } });
            setPreview(res?.data || null);
        } catch (e) {
            setError(extractErr(e, `Failed to read file (GET ${ENDPOINTS.read}).`));
        }
    }

    // --- apply edit (single file) via fs/write
    async function applyEdit(path, newContent, expectedSha) {
        setError("");
        try {
            const res = await api.post(ENDPOINTS.write, {
                path,
                content: newContent,
                expected_sha256: expectedSha || null,
                make_dirs: true,
                backup: true,
            });
            return res?.data || null;
        } catch (e) {
            throw new Error(extractErr(e, `Write failed (POST ${ENDPOINTS.write}) for ${path}.`));
        }
    }

    // --- chat
    async function send() {
        const text = input.trim();
        if (!text || busy) return;

        setBusy(true);
        setError("");
        setInput("");

        setMessages((m) => [...m, { role: "user", content: text }]);

        try {
            const res = await api.post(ENDPOINTS.chat, {
                message: text,
                context_paths: Array.from(selected),
            });

            const parsed = res?.data?.parsed;
            const raw = res?.data?.raw;

            let assistantText = "";
            if (parsed?.reply) assistantText += String(parsed.reply);
            else if (typeof raw === "string") assistantText += raw;
            else assistantText += "No response content.";

            const edits = Array.isArray(parsed?.edits) ? parsed.edits : [];

            setMessages((m) => [
                ...m,
                {
                    role: "assistant",
                    content: assistantText,
                    meta: edits.length ? { edits } : null,
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
                        "Backend error calling CodeAssistant.\n\n" +
                        `Tried: POST ${ENDPOINTS.chat}\n` +
                        `Context files: ${selectedCount}\n\n` +
                        `Error: ${msg}`,
                },
            ]);
        } finally {
            setBusy(false);
        }
    }

    // ✅ open diff modal for an edit
    async function viewEdit(edit) {
        const p = String(edit?.path || "");
        if (!p) return;
        setEditModalLoading(true);
        setError("");
        try {
            const res = await api.get(ENDPOINTS.read, { params: { path: p } });
            const before = String(res?.data?.content || "");
            setEditModal({
                edit,
                before,
                beforeSha: String(res?.data?.sha256 || ""),
                beforeSize: res?.data?.size ?? null,
            });
        } catch (e) {
            setError(extractErr(e, `Failed to read before-content (GET ${ENDPOINTS.read}).`));
            setEditModal(null);
        } finally {
            setEditModalLoading(false);
        }
    }

    function closeEditModal() {
        setEditModal(null);
    }

    // Apply edits from assistant message
    async function applyEdits(edits) {
        if (!Array.isArray(edits) || edits.length === 0 || busy) return;
        setBusy(true);
        setError("");

        try {
            const results = [];
            for (const e of edits) {
                const p = String(e?.path || "");
                const expected = String(e?.expected_sha256 || "");
                const newContent = String(e?.new_content ?? "");
                if (!p || newContent === "") continue;
                const r = await applyEdit(p, newContent, expected);
                results.push({ path: p, ok: true, result: r });
            }

            setMessages((m) => [
                ...m,
                {
                    role: "assistant",
                    content: "Applied edits:\n" + results.map((r) => `- ${r.path}: OK`).join("\n"),
                },
            ]);

            await loadDir(cwd || "");
        } catch (err) {
            setError(String(err?.message || err));
            setMessages((m) => [...m, { role: "assistant", content: `Apply failed: ${String(err?.message || err)}` }]);
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
                            Dev-only. Real server files under DEV_FS_ROOT. No browser navigation to /codeassistant/*.
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

                <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-300">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="font-semibold">Backend ping:</div>
                        {ping ? (
                            <>
                                <div className="text-zinc-200">OK</div>
                                <div className="text-zinc-500">user_id:</div>
                                <div className="text-zinc-200">{String(ping.user_id || "-")}</div>
                                <div className="text-zinc-500">root:</div>
                                <div className="text-zinc-200">{String(ping.dev_root || "-")}</div>
                            </>
                        ) : (
                            <div className="text-zinc-400">not available</div>
                        )}
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
                    {/* Left: FS + context */}
                    <div className="lg:col-span-5">
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-semibold">Filesystem</div>
                                <div className="text-xs text-zinc-400">{selectedCount} context file(s)</div>
                            </div>

                            <div className="mt-3 flex items-center gap-2">
                                <button
                                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                                    onClick={goUp}
                                    type="button"
                                    disabled={!cwd}
                                >
                                    Up
                                </button>
                                <div className="min-w-0 flex-1 truncate rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
                                    {cwd ? cwd : "(root)"}
                                </div>
                                <button
                                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-900"
                                    onClick={() => loadDir(cwd || "")}
                                    type="button"
                                >
                                    Refresh
                                </button>
                            </div>

                            <div className="mt-3">
                                <label className="text-xs text-zinc-400">Find</label>
                                <input
                                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
                                    placeholder="server.py, api.js, ..."
                                    value={fileQuery}
                                    onChange={(e) => setFileQuery(e.target.value)}
                                />
                            </div>

                            <div className="mt-3 flex gap-2">
                                <button
                                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                                    onClick={selectAllFilteredFiles}
                                    type="button"
                                    disabled={!filteredEntries.length}
                                >
                                    Select filtered files
                                </button>
                                <button
                                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                                    onClick={clearSelection}
                                    type="button"
                                    disabled={!selectedCount}
                                >
                                    Clear
                                </button>
                            </div>

                            <div className="mt-3 max-h-[460px] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-2">
                                {filteredEntries.length === 0 ? (
                                    <div className="p-2 text-xs text-zinc-500">No entries.</div>
                                ) : (
                                    <ul className="space-y-1">
                                        {filteredEntries.map((e, idx) => {
                                            const p = String(e?.path || "");
                                            const type = String(e?.type || "file");
                                            const isFile = type === "file";
                                            const checked = selected.has(p);

                                            return (
                                                <li key={`${p}-${idx}`} className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        className="h-4 w-4 accent-zinc-200"
                                                        checked={checked}
                                                        onChange={() => toggleSelect(p)}
                                                        disabled={!isFile}
                                                        title={isFile ? "Use as chat context" : "Directory (not selectable)"}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="min-w-0 flex-1 text-left"
                                                        onClick={() => (isFile ? openFile(p) : openDir(p))}
                                                    >
                                                        <div className="truncate text-xs text-zinc-200">{p}</div>
                                                        <div className="text-[11px] text-zinc-500">
                                                            {isFile ? `file • ${e?.size ?? 0}B` : "dir"}
                                                        </div>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>

                            {preview ? (
                                <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="truncate text-xs font-semibold text-zinc-200">{preview.path}</div>
                                        <div className="text-[11px] text-zinc-500">{preview.size}B</div>
                                    </div>
                                    <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap break-words text-[11px] text-zinc-300">
                    {preview.content}
                  </pre>
                                    <div className="mt-2 text-[11px] text-zinc-500">sha256: {preview.sha256}</div>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Right: chat */}
                    <div className="lg:col-span-7">
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="text-sm font-semibold">Assistant</div>
                                <div className="text-xs text-zinc-400">Context: {selectedCount} file(s)</div>
                            </div>

                            <div className="mt-3 h-[520px] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                                {messages.map((m, i) => (
                                    <MessageBubble
                                        key={i}
                                        role={m.role}
                                        meta={m.meta}
                                        onApplyEdits={applyEdits}
                                        onViewEdit={viewEdit}
                                        busy={busy}
                                    >
                                        {m.content}
                                    </MessageBubble>
                                ))}
                                {busy ? <div className="mt-3 text-xs text-zinc-500">Working…</div> : null}
                                <div ref={chatEndRef} />
                            </div>

                            <div className="mt-3 flex gap-2">
                                <input
                                    className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm outline-none"
                                    placeholder="Ask: 'check routing/auth errors in selected files'"
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
                                Uses API: <code>/api/codeassistant/*</code> (XHR). Do not open <code>/codeassistant/*</code> in the browser.
                            </div>

                            <div className="mt-6 text-xs text-zinc-500">
                                Production reminder: after adding/updating this page, run your frontend build (you deploy build output).
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit preview modal */}
            {editModal ? (
                <EditPreviewModal
                    loading={editModalLoading}
                    edit={editModal.edit}
                    before={editModal.before}
                    beforeSha={editModal.beforeSha}
                    onClose={closeEditModal}
                    onApply={async () => {
                        const e = editModal.edit;
                        const p = String(e?.path || "");
                        const expected = String(e?.expected_sha256 || "");
                        const newContent = String(e?.new_content ?? "");
                        if (!p) return;
                        setBusy(true);
                        setError("");
                        try {
                            await applyEdit(p, newContent, expected);
                            setMessages((m) => [...m, { role: "assistant", content: `Applied edit: ${p}` }]);
                            await loadDir(cwd || "");
                            closeEditModal();
                        } catch (err) {
                            setError(String(err?.message || err));
                        } finally {
                            setBusy(false);
                        }
                    }}
                    busy={busy}
                />
            ) : null}
        </div>
    );
}

function MessageBubble({ role, meta, children, onApplyEdits, onViewEdit, busy }) {
    const isUser = role === "user";
    const edits = meta?.edits;

    return (
        <div className={["mb-3 flex", isUser ? "justify-end" : "justify-start"].join(" ")}>
            <div
                className={[
                    "max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    isUser ? "bg-zinc-200 text-zinc-950" : "border border-zinc-800 bg-zinc-900/40 text-zinc-100",
                ].join(" ")}
            >
                <div className="text-[11px] font-semibold opacity-70">{isUser ? "You" : "Assistant"}</div>
                <div className="mt-1">{children}</div>

                {Array.isArray(edits) && edits.length ? (
                    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">
                        <div className="flex items-center justify-between gap-2">
                            <div className="font-semibold text-zinc-200">Proposed edits: {edits.length}</div>
                            <button
                                type="button"
                                className="rounded-lg border border-zinc-800 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                                onClick={() => onApplyEdits(edits)}
                                disabled={busy}
                                title="Apply ALL edits"
                            >
                                Apply all
                            </button>
                        </div>

                        <ul className="mt-2 space-y-1">
                            {edits.map((e, idx) => (
                                <li key={idx} className="flex items-center justify-between gap-2">
                                    <div className="min-w-0 flex-1 truncate">- {String(e?.path || "")}</div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
                                            onClick={() => onViewEdit(e)}
                                            disabled={busy}
                                            title="Preview diff"
                                        >
                                            View
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-md border border-zinc-800 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                                            onClick={() => onApplyEdits([e])}
                                            disabled={busy}
                                            title="Apply only this edit"
                                        >
                                            Apply
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>

                        <div className="mt-2 text-[11px] text-zinc-500">
                            Tip: click <b>View</b> first so you see exactly what will be written.
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function EditPreviewModal({ loading, edit, before, beforeSha, onClose, onApply, busy }) {
    const path = String(edit?.path || "");
    const expected = String(edit?.expected_sha256 || "");
    const after = String(edit?.new_content ?? "");

    const diffLines = useMemo(() => makeSimpleDiff(before, after), [before, after]);

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
                <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/40 px-4 py-3">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-100">Preview edit</div>
                        <div className="truncate text-xs text-zinc-400">{path}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-800"
                            onClick={onClose}
                            disabled={busy}
                        >
                            Close
                        </button>
                        <button
                            type="button"
                            className="rounded-lg border border-zinc-800 bg-white px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 disabled:opacity-60"
                            onClick={onApply}
                            disabled={busy}
                            title="Apply this edit"
                        >
                            Apply
                        </button>
                    </div>
                </div>

                <div className="px-4 py-3 text-xs text-zinc-400">
                    <div className="flex flex-wrap items-center gap-3">
                        <div>
                            <span className="text-zinc-500">before_sha256:</span>{" "}
                            <span className="text-zinc-200">{beforeSha || "-"}</span>
                        </div>
                        <div>
                            <span className="text-zinc-500">expected_sha256:</span>{" "}
                            <span className="text-zinc-200">{expected || "-"}</span>
                        </div>
                    </div>
                </div>

                <div className="px-4 pb-4">
                    {loading ? (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-300">
                            Loading…
                        </div>
                    ) : (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950">
                            <div className="border-b border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-300">
                                Simple diff (lines)
                            </div>
                            <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-words p-3 text-[11px] leading-relaxed text-zinc-200">
                {diffLines.map((l, i) => (
                    <DiffLine key={i} line={l} />
                ))}
              </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function DiffLine({ line }) {
    const prefix = line.slice(0, 1);
    const body = line.slice(1);

    let cls = "text-zinc-200";
    if (prefix === "+") cls = "text-emerald-300";
    if (prefix === "-") cls = "text-red-300";

    return (
        <div className="flex gap-2">
            <span className={["w-4 shrink-0 font-bold", cls].join(" ")}>{prefix}</span>
            <span className={cls}>{body}</span>
        </div>
    );
}

/**
 * Simple diff: no fancy LCS.
 * - equal line => " "
 * - removed line => "-"
 * - added line => "+"
 * - changed line => "-old" then "+new"
 */
function makeSimpleDiff(before, after) {
    const a = String(before ?? "").split("\n");
    const b = String(after ?? "").split("\n");
    const out = [];

    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max; i++) {
        const oldL = a[i];
        const newL = b[i];

        if (oldL === undefined && newL !== undefined) {
            out.push(`+${newL}`);
            continue;
        }
        if (newL === undefined && oldL !== undefined) {
            out.push(`-${oldL}`);
            continue;
        }
        if (oldL === newL) {
            out.push(` ${oldL ?? ""}`);
            continue;
        }

        out.push(`-${oldL ?? ""}`);
        out.push(`+${newL ?? ""}`);
    }

    return out;
}
