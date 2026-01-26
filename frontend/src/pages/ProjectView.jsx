// frontend/src/pages/ProjectView.jsx
// Enhanced with AI editing capabilities, Timeline, Chat, and Security Findings
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/api";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { CodeEditor } from "@/components/CodeEditor";
import { FileTree } from "@/components/FileTree";
import { AgentTimeline } from "@/components/AgentTimeline";
import { AgentChatbox } from "@/components/AgentChatbox";
import { SecurityFindings } from "@/components/SecurityFindings";
import { DiffViewer } from "@/components/generator/DiffViewer";
import { Toaster, toast } from "sonner";

import {
  Download,
  Loader2,
  AlertCircle,
  FileCode,
  Calendar,
  Folder,
  ChevronLeft,
  Bot,
  Sparkles,
  RefreshCw,
  Shield,
  Wrench,
  X,
} from "lucide-react";

export default function ProjectView() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [previewJob, setPreviewJob] = useState(null);
  const [editorDrafts, setEditorDrafts] = useState({});
  const [editorSaving, setEditorSaving] = useState(false);
  const [refreshSummary, setRefreshSummary] = useState(null);

  // AI Agent state
  const [wsConnected, setWsConnected] = useState(false);
  const [agentMessage, setAgentMessage] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [securityFindings, setSecurityFindings] = useState([]);
  const [securityStats, setSecurityStats] = useState(null);
  const [securityScanRan, setSecurityScanRan] = useState(false);
  const [securityScanning, setSecurityScanning] = useState(false);
  const [securityFixing, setSecurityFixing] = useState(false);
  const [securityProposal, setSecurityProposal] = useState(null);
  const [securityProposalId, setSecurityProposalId] = useState(null);
  const [securityApplying, setSecurityApplying] = useState(false);
  const [showSecurityDiff, setShowSecurityDiff] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  
  const wsRef = useRef(null);
  const previewPollRef = useRef(null);
  const previewStartedAtRef = useRef(null);

  const fetchProject = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get(`/projects/${id}`);
      setProject(response.data);
      if (response.data.files?.length) {
        setSelectedFile(response.data.files[0]);
      }
    } catch (err) {
      const status = err?.response?.status;
      setError(status === 404 ? "Project not found" : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    return () => {
      if (previewPollRef.current) {
        clearInterval(previewPollRef.current);
        previewPollRef.current = null;
      }
    };
  }, []);

  // WebSocket connection for AI agent
  useEffect(() => {
    if (!project) return;

    const newSessionId = `project-${id}-${Date.now()}`;
    setSessionId(newSessionId);

    const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
    const wsUrl = backendUrl.replace(/^http/, 'ws') + `/ws/agent/${newSessionId}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
        setChatMessages([{
          message: "👋 AI Agent connected! Ask me to modify your project, add features, or fix issues.",
          timestamp: new Date().toISOString(),
        }]);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "message" || data.type === "assistant_message") {
            setChatMessages(prev => [...prev, {
              message: data.content || data.message,
              timestamp: new Date().toISOString(),
            }]);
          }
          
          if (data.type === "timeline_update" && data.timeline) {
            setTimeline(data.timeline);
          }
          
          if (data.type === "security_findings" && data.findings) {
            setSecurityFindings(data.findings);
          }
          
          if (data.type === "files_updated" && data.files) {
            // Update project files
            setProject(prev => ({
              ...prev,
              files: data.files.map(f => ({
                path: f.path,
                content: f.content,
                language: detectLanguage(f.path),
              })),
            }));
          }
          
          if (data.type === "status_update") {
            setAgentLoading(data.status === "thinking" || data.status === "generating");
          }
        } catch (err) {
          console.error('WebSocket message parse error:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWsConnected(false);
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setWsConnected(false);
      };

      return () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      };
    } catch (err) {
      console.error('WebSocket connection error:', err);
      setWsConnected(false);
    }
  }, [project, id]);

  const detectLanguage = (path) => {
    const ext = path.split('.').pop();
    const langMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'md': 'markdown',
    };
    return langMap[ext] || 'text';
  };

  const PREVIEW_POLL_TIMEOUT_MS = 20 * 60 * 1000;
  const apiBase = String(api?.defaults?.baseURL || "").replace(/\/$/, "");
  const backendBase = apiBase
    ? apiBase.replace(/\/api\/?$/, "")
    : (process.env.REACT_APP_BACKEND_URL || "");

  const resolvePreviewUrl = (value) => {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    const base = backendBase || window.location.origin;
    const suffix = value.startsWith("/") ? value : `/${value}`;
    return `${base}${suffix}`;
  };

  const toApiPath = (value) => {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) {
      try {
        const parsed = new URL(value);
        if (apiBase) {
          const base = new URL(apiBase);
          if (parsed.origin === base.origin) {
            return `${parsed.pathname}${parsed.search}`.replace(/^\/api\/?/, "");
          }
        }
      } catch {
        return value;
      }
      return value;
    }
    let path = value.replace(/^\/api\/?/, "").replace(/^api\/?/, "");
    if (path.startsWith("/")) path = path.slice(1);
    return path;
  };

  const sendAgentMessage = () => {
    if (!agentMessage.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    setAgentLoading(true);
    
    // Add user message to chat
    setChatMessages(prev => [...prev, {
      message: agentMessage,
      timestamp: new Date().toISOString(),
      metadata: { role: 'user' },
    }]);

    // Send to WebSocket
    wsRef.current.send(JSON.stringify({
      type: "message",
      content: agentMessage,
      context: {
        project_id: id,
        current_files: project?.files || [],
      },
    }));

    setAgentMessage("");
  };

  const reloadProjectFiles = async () => {
    const response = await api.get(`/projects/${id}`);
    const refreshed = response.data;
    setProject(refreshed);

    if (refreshed?.files?.length) {
      const currentPath = selectedFile?.path;
      const nextFile =
        refreshed.files.find((f) => f.path === currentPath) || refreshed.files[0];
      setSelectedFile(nextFile);
    } else {
      setSelectedFile(null);
    }
  };

  const applyUpdatedFilesToState = (updatedFiles) => {
    if (!updatedFiles || updatedFiles.length === 0) return;
    setProject((prev) => {
      if (!prev) return prev;
      const files = [...(prev.files || [])];
      updatedFiles.forEach((u) => {
        const idx = files.findIndex((f) => f.path === u.path);
        if (idx >= 0) {
          files[idx] = {
            ...files[idx],
            content: u.content ?? files[idx].content,
            language: u.language || files[idx].language,
          };
        } else if (u.content !== undefined) {
          files.push({ path: u.path, content: u.content, language: u.language || "text" });
        }
      });
      return { ...prev, files };
    });
    setSelectedFile((prev) => {
      if (!prev) return prev;
      const updated = (updatedFiles || []).find((u) => u.path === prev.path);
      return updated
        ? {
            ...prev,
            content: updated.content ?? prev.content,
            language: updated.language || prev.language,
          }
        : prev;
    });
  };

  const handleSecurityScan = async () => {
    if (!project) return;
    setSecurityScanning(true);
    setError("");
    try {
      const res = await api.post(`/projects/${id}/security/scan`);
      const payload = res?.data || {};
      setSecurityFindings(payload.findings || []);
      setSecurityStats(payload.stats || null);
      setSecurityScanRan(true);
      toast.success("Security scan complete.");
    } catch (err) {
      const msg = err?.response?.data?.detail || "Security scan failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setSecurityScanning(false);
    }
  };

  const handleSecurityFixPropose = async () => {
    if (!project) return;
    setSecurityFixing(true);
    setError("");
    try {
      const res = await api.post(`/projects/${id}/security/fix/propose`);
      const payload = res?.data || {};
      setSecurityFindings(payload.findings || []);
      setSecurityStats(payload.stats || null);
      setSecurityScanRan(true);
      if (!payload?.proposal?.updated_files?.length) {
        toast.info(payload?.proposal?.summary || "No auto-fixable issues found.");
        return;
      }
      setSecurityProposal(payload.proposal || null);
      setSecurityProposalId(payload.proposal_id || null);
      setShowSecurityDiff(true);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to propose fixes";
      setError(msg);
      toast.error(msg);
    } finally {
      setSecurityFixing(false);
    }
  };

  const handleSecurityApply = async () => {
    if (!securityProposalId) return;
    setSecurityApplying(true);
    setError("");
    try {
      const res = await api.post(`/projects/${id}/security/fix/apply/${securityProposalId}`);
      const updated = res?.data?.updated_files || [];
      applyUpdatedFilesToState(updated);
      setShowSecurityDiff(false);
      setSecurityProposal(null);
      setSecurityProposalId(null);
      toast.success(res?.data?.message || "Security fixes applied.");
      await handleSecurityScan();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to apply fixes";
      setError(msg);
      toast.error(msg);
    } finally {
      setSecurityApplying(false);
    }
  };

  const getEditorValue = () => {
    if (!selectedFile) return "";
    const hasDraft = Object.prototype.hasOwnProperty.call(editorDrafts, selectedFile.path);
    return hasDraft ? editorDrafts[selectedFile.path] : (selectedFile.content || "");
  };

  const isEditorDirty = () => {
    if (!selectedFile) return false;
    const hasDraft = Object.prototype.hasOwnProperty.call(editorDrafts, selectedFile.path);
    if (!hasDraft) return false;
    return editorDrafts[selectedFile.path] !== (selectedFile.content || "");
  };

  const handleEditorChange = (value) => {
    if (!selectedFile) return;
    setEditorDrafts((prev) => ({
      ...prev,
      [selectedFile.path]: value,
    }));
  };

  const handleSaveFile = async () => {
    if (!selectedFile || !id) return;
    const path = selectedFile.path;
    const hasDraft = Object.prototype.hasOwnProperty.call(editorDrafts, path);
    const content = hasDraft ? editorDrafts[path] : (selectedFile.content || "");
    if (content === (selectedFile.content || "")) return;

    setEditorSaving(true);
    setError("");
    try {
      const res = await api.post(`/projects/${id}/files`, {
        path,
        content,
        language: selectedFile.language,
      });
      const saved = res.data;
      const nextLanguage = saved.language || detectLanguage(saved.path);
      setProject((prev) => {
        if (!prev) return prev;
        const files = [...(prev.files || [])];
        const idx = files.findIndex((f) => f.path === saved.path);
        if (idx >= 0) {
          files[idx] = { ...files[idx], content: saved.content, language: nextLanguage };
        } else {
          files.push({ ...saved, language: nextLanguage });
        }
        return { ...prev, files };
      });
      setSelectedFile((prev) => {
        if (!prev || prev.path !== saved.path) return prev;
        return { ...prev, content: saved.content, language: nextLanguage };
      });
      setEditorDrafts((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to save file");
    } finally {
      setEditorSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!project) return;
    setDownloading(true);
    setError("");

    try {
      const response = await api.get(`/projects/${id}/download`, {
        responseType: "blob",
      });

      const blob = new Blob([response.data], { type: "application/zip" });
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${(project.name || "project").replace(/\s+/g, "_")}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download project");
    } finally {
      setDownloading(false);
    }
  };

  const handlePreview = async () => {
    if (!project) return;

    setPreviewing(true);
    setError("");

    try {
      const res = await api.post(`/projects/${id}/preview`);
      const { url, preview_id, status_url } = res.data || {};

      const fullUrl = resolvePreviewUrl(url);
      if (!fullUrl || !preview_id || !status_url) {
        setPreviewing(false);
        setError("Failed to start preview");
        return;
      }

      setPreviewJob({ id: preview_id, statusUrl: status_url });
      previewStartedAtRef.current = Date.now();

      if (previewPollRef.current) {
        clearInterval(previewPollRef.current);
        previewPollRef.current = null;
      }

      try {
        const buildRes = await api.post(`/projects/preview/${preview_id}/build`);
        if (buildRes?.data?.ok === false) {
          setPreviewing(false);
          setError(buildRes?.data?.error || "Failed to start preview build");
          return;
        }
      } catch (buildErr) {
        setPreviewing(false);
        setError(buildErr?.response?.data?.detail || "Failed to start preview build");
        return;
      }

      const statusPath = toApiPath(status_url);
      if (!statusPath) {
        setPreviewing(false);
        setPreviewJob(null);
        setError("Preview status URL invalid");
        return;
      }

      previewPollRef.current = setInterval(async () => {
        try {
          const st = await api.get(statusPath);
          const status = st.data?.status;
          const err = st.data?.error || null;

          const startedAt = previewStartedAtRef.current || Date.now();
          if (Date.now() - startedAt > PREVIEW_POLL_TIMEOUT_MS) {
            clearInterval(previewPollRef.current);
            previewPollRef.current = null;
            setPreviewing(false);
            setPreviewJob(null);
            setError("Preview build timed out");
            try { await api.post(`/projects/preview/${preview_id}/cancel`); } catch {}
            return;
          }

          if (status === "ready") {
            clearInterval(previewPollRef.current);
            previewPollRef.current = null;
            setPreviewing(false);
            setPreviewJob(null);
            window.open(fullUrl, "_blank", "noopener,noreferrer");
          }

          if (status === "failed") {
            clearInterval(previewPollRef.current);
            previewPollRef.current = null;
            setPreviewing(false);
            setPreviewJob(null);
            setError(err || "Preview build failed");
          }

          if (status === "cancelled") {
            clearInterval(previewPollRef.current);
            previewPollRef.current = null;
            setPreviewing(false);
            setPreviewJob(null);
            setError("Preview build cancelled");
          }
        } catch (pollErr) {
          clearInterval(previewPollRef.current);
          previewPollRef.current = null;
          setPreviewing(false);
          setPreviewJob(null);
          setError("Preview status check failed");
        }
      }, 1000);
    } catch (err) {
      setPreviewing(false);
      setPreviewJob(null);
      setError(err?.response?.data?.detail || "Failed to start preview");
    }
  };

  const handleCancelPreview = async () => {
    if (!previewJob?.id) return;
    if (previewPollRef.current) {
      clearInterval(previewPollRef.current);
      previewPollRef.current = null;
    }
    setPreviewing(false);
    setPreviewJob(null);
    try {
      await api.post(`/projects/preview/${previewJob.id}/cancel`);
      setError("Preview build cancelled");
    } catch (err) {
      setError("Failed to cancel preview build");
    }
  };

  const handleRefresh = async (force = false) => {
    if (!project) return;

    setRefreshing(true);
    setError("");

    try {
      const res = await api.post(`/projects/${id}/github/refresh`, { force });
      const payload = res?.data;
      if (!payload?.success) {
        if (payload?.has_local_changes && !force) {
          const ok = window.confirm("Local changes detected. Force refresh and overwrite local edits?");
          if (ok) return await handleRefresh(true);
        }
        setError(payload?.message || "GitHub refresh failed");
        toast.error(payload?.message || "GitHub refresh failed");
        setRefreshSummary(null);
        return;
      }
      setRefreshSummary({
        message: payload?.message || "Refreshed from GitHub.",
        updates: payload?.updated_files || [],
        warnings: payload?.warnings || [],
      });
      toast.success(payload?.message || "Refreshed from GitHub.");
      await reloadProjectFiles();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const message = err?.response?.data?.message;
      const msg = detail || message || "Failed to refresh from GitHub";
      setError(msg);
      toast.error(msg);
    } finally {
      setRefreshing(false);
    }
  };

  const formatDate = (dateStr) =>
      new Date(dateStr).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  if (loading) {
    return (
        <div className="min-h-screen bg-[#030712]">
          <Navbar />
          <div className="flex items-center justify-center h-[calc(100vh-64px)]">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          </div>
        </div>
    );
  }

  if (error && !project) {
    return (
        <div className="min-h-screen bg-[#030712]">
          <Navbar />
          <div className="max-w-4xl mx-auto px-6 py-12">
            <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
              <AlertCircle className="w-5 h-5" />
              {error || "Project not found"}
            </div>
            <Button
              onClick={() => navigate("/dashboard")}
              variant="ghost"
              className="mt-4 text-gray-400 hover:text-white"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>
    );
  }

  return (
      <div className="min-h-screen bg-[#030712] flex flex-col">
        <Navbar />

        {/* Header */}
        <div className="border-b border-white/5 bg-black/40">
          <div className="max-w-screen-2xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate("/dashboard")}
                    className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                    data-testid="back-button"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-white">{project.name}</h1>
                  <p className="text-gray-400 text-sm">{project.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1 text-gray-500 text-sm">
                  <FileCode className="w-4 h-4" />
                  {project.files?.length || 0} files
                </span>
                <span className="flex items-center gap-1 text-gray-500 text-sm">
                  <Calendar className="w-4 h-4" />
                    {formatDate(project.created_at)}
                </span>

                {project.project_type && ["web", "frontend", "fullstack"].includes(project.project_type) && (
                    <Button
                        variant="outline"
                        onClick={handlePreview}
                        disabled={previewing}
                        className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                        data-testid="preview-button"
                    >
                      {previewing ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                          <FileCode className="w-4 h-4 mr-2" />
                      )}
                      Preview
                    </Button>
                )}
                {previewing && previewJob?.id && (
                  <Button
                    variant="outline"
                    onClick={handleCancelPreview}
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                )}

                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                  data-testid="refresh-github-button"
                >
                  {refreshing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Refresh GitHub
                </Button>

                <Button 
                  onClick={handleDownload} 
                  disabled={downloading}
                  data-testid="download-button"
                >
                  {downloading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                      <Download className="w-4 h-4 mr-2" />
                  )}
                  Download ZIP
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="max-w-screen-2xl mx-auto px-6 py-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        {refreshSummary && (
          <div className="max-w-screen-2xl mx-auto px-6 py-2">
            <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-200">
              <div className="text-sm">{refreshSummary.message}</div>
              {refreshSummary.warnings?.length > 0 && (
                <div className="mt-1 text-xs text-amber-300">
                  Warning: {refreshSummary.warnings[0]}
                </div>
              )}
              <div className="mt-2 text-xs text-gray-300">Updated files:</div>
              {refreshSummary.updates?.length > 0 ? (
                <ul className="mt-1 space-y-1 text-xs">
                  {refreshSummary.updates.map((u) => (
                    <li key={`${u.action}:${u.path}`} className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wide ${
                        u.action === "added" ? "bg-emerald-500/20 text-emerald-300" :
                        u.action === "deleted" ? "bg-red-500/20 text-red-300" :
                        "bg-amber-500/20 text-amber-300"
                      }`}>{u.action}</span>
                      <span className="font-mono text-gray-200">{u.path}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-1 text-xs text-gray-400">No file changes.</div>
              )}
            </div>
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: File Browser and Code Editor */}
          <div className="flex-1 flex overflow-hidden">
            <div className="w-64 border-r border-white/5 bg-[#0f172a] flex-shrink-0">
              <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                <Folder className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-gray-300">Files</span>
              </div>
              <FileTree
                  files={project.files || []}
                  onSelect={setSelectedFile}
                  selectedPath={selectedFile?.path}
              />
            </div>

            <div className="flex-1 bg-[#1e1e1e] overflow-hidden">
              <CodeEditor
                file={selectedFile}
                value={getEditorValue()}
                onChange={handleEditorChange}
                onSave={handleSaveFile}
                isDirty={isEditorDirty()}
                isSaving={editorSaving}
              />
            </div>
          </div>

          {/* Right: AI Agent Panel */}
          <div className="w-[450px] border-l border-white/5 bg-[#030712] flex flex-col overflow-hidden">
            {/* AI Input Section */}
            <Card className="m-4 mb-2 bg-black/40 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Bot className="w-4 h-4 text-cyan-400" />
                  AI Assistant
                  {wsConnected ? (
                    <span className="ml-auto text-xs text-green-400 flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      Connected
                    </span>
                  ) : (
                    <span className="ml-auto text-xs text-gray-500 flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-gray-500" />
                      Connecting...
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={agentMessage}
                  onChange={(e) => setAgentMessage(e.target.value)}
                  placeholder="Ask AI to modify your project: 'Add a dark mode toggle', 'Fix the navbar layout', 'Add form validation'..."
                  className="min-h-[100px] bg-black/60 border-white/10 text-white text-sm resize-none"
                  disabled={!wsConnected || agentLoading}
                  data-testid="ai-input"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      sendAgentMessage();
                    }
                  }}
                />

                <Button
                  onClick={sendAgentMessage}
                  disabled={!wsConnected || !agentMessage.trim() || agentLoading}
                  className="w-full bg-cyan-500 text-black font-bold hover:bg-cyan-400"
                  data-testid="ai-send-button"
                >
                  {agentLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      AI is working...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Send to AI
                    </>
                  )}
                </Button>

                <p className="text-xs text-gray-500 text-center">
                  Cmd/Ctrl + Enter to send
                </p>
              </CardContent>
            </Card>

            {/* Agent Timeline */}
            {timeline.length > 0 && (
              <Card className="mx-4 mb-2 bg-black/40 border-white/10 max-h-[200px] overflow-hidden">
                <AgentTimeline timeline={timeline} />
              </Card>
            )}

            {/* Security Scan Actions */}
            <Card className="mx-4 mb-2 bg-black/40 border-white/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  Security Scan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-gray-400">
                  {securityStats
                    ? `High: ${securityStats.high_severity || 0} • Medium: ${securityStats.medium_severity || 0} • Low: ${securityStats.low_severity || 0}`
                    : "Run a scan to check for security issues."
                  }
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSecurityScan}
                    disabled={securityScanning}
                    className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
                  >
                    {securityScanning ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Shield className="w-4 h-4 mr-1" />}
                    Scan
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSecurityFixPropose}
                    disabled={securityFixing || !(securityStats?.auto_fixable > 0)}
                    className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                  >
                    {securityFixing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Wrench className="w-4 h-4 mr-1" />}
                    Propose Fixes ({securityStats?.auto_fixable || 0})
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Security Findings */}
            {(securityScanRan || securityFindings.length > 0) && (
              <div className="mx-4 mb-2">
                <SecurityFindings findings={securityFindings} />
              </div>
            )}

            {/* Agent Chatbox */}
            <Card className="mx-4 mb-4 flex-1 bg-black/40 border-white/10 overflow-hidden flex flex-col min-h-0">
              <AgentChatbox messages={chatMessages} />
            </Card>
          </div>
        </div>
      </div>
      {showSecurityDiff && securityProposal?.updated_files?.length > 0 && (
        <DiffViewer
          changes={securityProposal.updated_files}
          onClose={() => {
            setShowSecurityDiff(false);
            setSecurityProposal(null);
            setSecurityProposalId(null);
          }}
          mode="proposal"
          onApply={handleSecurityApply}
          applying={securityApplying}
          summary={securityProposal?.summary}
          notes={securityProposal?.notes}
        />
      )}
      <Toaster position="top-right" richColors />
  );
}
