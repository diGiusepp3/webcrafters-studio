// frontend/src/pages/Generator.jsx
// Complete Generator: Create + Edit projects with live coding experience

import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import api from "@/api";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { AgentTimeline } from "@/components/AgentTimeline";
import { AgentChatbox } from "@/components/AgentChatbox";
import { SecurityFindings } from "@/components/SecurityFindings";
import { FileTree } from "@/components/FileTree";

// New modular components
import {
  LiveCodeEditor,
  ProjectTypeSelector,
  ClarifyDialog,
  PreviewSidebar,
} from "@/components/generator";

import {
  Sparkles,
  Loader2,
  Wand2,
  AlertCircle,
  Bot,
  ChevronRight,
  Download,
  FileCode,
  Calendar,
  Folder,
  ChevronLeft,
  Eye,
  Play,
  Code2,
} from "lucide-react";

// ==========================================
// MAIN GENERATOR COMPONENT
// ==========================================
export default function Generator() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Mode detection
  const projectId = searchParams.get("projectId") || location.state?.projectId;
  const isEditMode = !!projectId;

  // ===== STATE =====
  // Create mode
  const [prompt, setPrompt] = useState("");
  const [projectType, setProjectType] = useState("fullstack");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");

  // Edit mode
  const [project, setProject] = useState(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // Preview
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  // AI Agent
  const [wsConnected, setWsConnected] = useState(false);
  const [agentMessage, setAgentMessage] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [securityFindings, setSecurityFindings] = useState([]);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  // Clarify
  const [clarifyJobId, setClarifyJobId] = useState(null);
  const [clarifyQuestions, setClarifyQuestions] = useState([]);
  const [clarifyAnswers, setClarifyAnswers] = useState({});

  // Live coding
  const [isTyping, setIsTyping] = useState(false);
  const [currentTypingFile, setCurrentTypingFile] = useState(null);

  // Refs
  const pollRef = useRef(null);
  const wsRef = useRef(null);

  // ==========================================
  // EDIT MODE: Load existing project
  // ==========================================
  const fetchProject = useCallback(async () => {
    if (!projectId) return;

    setProjectLoading(true);
    setError("");
    try {
      const response = await api.get(`/projects/${projectId}`);
      setProject(response.data);
      if (response.data.files?.length) {
        setSelectedFile(response.data.files[0]);
      }
      // Set project type from loaded project
      if (response.data.project_type) {
        setProjectType(response.data.project_type);
      }
    } catch (err) {
      const status = err?.response?.status;
      setError(status === 404 ? "Project not found" : "Failed to load project");
    } finally {
      setProjectLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isEditMode) {
      fetchProject();
    }
  }, [isEditMode, fetchProject]);

  // ==========================================
  // WEBSOCKET: AI Agent connection
  // ==========================================
  useEffect(() => {
    if (!isEditMode || !project) return;

    const newSessionId = `project-${projectId}-${Date.now()}`;
    setSessionId(newSessionId);

    const backendUrl = process.env.REACT_APP_BACKEND_URL || "";
    const wsUrl = backendUrl.replace(/^http/, "ws") + `/api/ws/agent/${newSessionId}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setWsConnected(true);
        setChatMessages([
          {
            message: "👋 AI Agent connected! Ask me to modify your project.",
            timestamp: new Date().toISOString(),
          },
        ]);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle different message types
          switch (data.type) {
            case "message":
            case "assistant_message":
              setChatMessages((prev) => [
                ...prev,
                {
                  message: data.content || data.message,
                  timestamp: new Date().toISOString(),
                },
              ]);
              break;

            case "timeline_update":
              if (data.timeline) setTimeline(data.timeline);
              break;

            case "security_findings":
              if (data.findings) setSecurityFindings(data.findings);
              break;

            case "file_update":
              // Live coding: show typing effect
              if (data.file) {
                setIsTyping(true);
                setCurrentTypingFile(data.file);
                
                // Update project files
                setProject((prev) => {
                  const files = [...(prev?.files || [])];
                  const existingIndex = files.findIndex(f => f.path === data.file.path);
                  
                  if (existingIndex >= 0) {
                    files[existingIndex] = {
                      ...files[existingIndex],
                      content: data.file.content,
                    };
                  } else {
                    files.push(data.file);
                  }
                  
                  return { ...prev, files };
                });

                // Select the updated file
                setSelectedFile(data.file);
                
                // Stop typing after a delay
                setTimeout(() => setIsTyping(false), 2000);
              }
              break;

            case "files_updated":
              if (data.files) {
                setProject((prev) => ({
                  ...prev,
                  files: data.files.map((f) => ({
                    path: f.path,
                    content: f.content,
                    language: detectLanguage(f.path),
                  })),
                }));
              }
              break;

            case "status_update":
              setAgentLoading(
                data.status === "thinking" || data.status === "generating"
              );
              break;

            case "preview_ready":
              if (data.url) {
                setPreviewUrl(data.url);
                setPreviewOpen(true);
              }
              break;
          }
        } catch (err) {
          console.error("WebSocket message parse error:", err);
        }
      };

      ws.onerror = () => setWsConnected(false);
      ws.onclose = () => setWsConnected(false);

      return () => {
        if (ws.readyState === WebSocket.OPEN) ws.close();
      };
    } catch (err) {
      console.error("WebSocket connection error:", err);
      setWsConnected(false);
    }
  }, [isEditMode, project, projectId]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close();
    };
  }, []);

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================
  const detectLanguage = (path) => {
    const ext = path?.split(".").pop() || "";
    const langMap = {
      js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
      py: "python", html: "html", css: "css", json: "json", md: "markdown",
      php: "php", rb: "ruby", go: "go", rs: "rust", java: "java",
    };
    return langMap[ext] || "text";
  };

  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  // ==========================================
  // CREATE MODE: Generation
  // ==========================================
  const resetState = () => {
    setError("");
    setClarifyJobId(null);
    setClarifyQuestions([]);
    setClarifyAnswers({});
    setTimeline([]);
    setChatMessages([]);
    setSecurityFindings([]);
    setPreviewUrl(null);
  };

  const startPolling = (jobId) => {
    setCurrentJobId(jobId);

    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/generate/status/${jobId}`);
        const {
          status, step, project_id, questions, error: jobError,
          timeline: jobTimeline, chat_messages: jobChatMessages,
          security_findings: jobSecurityFindings, message, preview_url,
        } = res.data;

        if (jobTimeline) setTimeline(jobTimeline);
        if (jobChatMessages) setChatMessages(jobChatMessages);
        if (jobSecurityFindings) setSecurityFindings(jobSecurityFindings);
        if (preview_url) setPreviewUrl(preview_url);

        // Handle clarification
        if (status === "clarify") {
          clearInterval(pollRef.current);
          setLoading(false);
          setClarifyJobId(jobId);
          setClarifyQuestions(questions || []);
          setStatusText("Clarification required");
          return;
        }

        if (status === "queued" || status === "running") {
          setStatusText(message || "Working…");
        }

        if (status === "done") {
          clearInterval(pollRef.current);
          // Navigate to edit mode with new project
          navigate(`/generate?projectId=${project_id}`);
        }

        if (status === "error") {
          clearInterval(pollRef.current);
          setLoading(false);
          setStatusText("");
          setError(typeof jobError === "string" ? jobError : JSON.stringify(jobError, null, 2));
        }
      } catch (e) {
        clearInterval(pollRef.current);
        setLoading(false);
        setStatusText("");
        setError("Polling failed. Please try again.");
      }
    }, 1500);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    resetState();
    setStatusText("Starting...");
    setLoading(true);

    try {
      const res = await api.post("/generate", {
        prompt,
        project_type: projectType,
      });
      startPolling(res.data.job_id);
    } catch (e) {
      setLoading(false);
      setError(e?.response?.data?.detail || "Failed to start generation");
    }
  };

  const submitClarify = async () => {
    setLoading(true);
    setStatusText("Resuming…");

    try {
      await api.post(`/generate/continue/${clarifyJobId}`, clarifyAnswers);
      setClarifyJobId(null);
      setClarifyQuestions([]);
      setClarifyAnswers({});
      startPolling(clarifyJobId);
    } catch (e) {
      setLoading(false);
      setError("Failed to continue generation");
    }
  };

  // ==========================================
  // EDIT MODE: Actions
  // ==========================================
  const sendAgentMessage = () => {
    if (!agentMessage.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    setAgentLoading(true);
    setChatMessages((prev) => [
      ...prev,
      {
        message: agentMessage,
        timestamp: new Date().toISOString(),
        metadata: { role: "user" },
      },
    ]);

    wsRef.current.send(
      JSON.stringify({
        type: "message",
        content: agentMessage,
        context: {
          project_id: projectId,
          project_type: project?.project_type || projectType,
          current_files: project?.files || [],
        },
      })
    );

    setAgentMessage("");
  };

  const handleDownload = async () => {
    if (!project) return;
    setDownloading(true);
    setError("");

    try {
      const response = await api.get(`/projects/${projectId}/download`, {
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

    setPreviewLoading(true);
    setError("");

    try {
      const res = await api.post(`/projects/${projectId}/preview`);
      const backendUrl = process.env.REACT_APP_BACKEND_URL || "";
      const url = res.data.url;
      const fullUrl = url.startsWith("http") ? url : `${backendUrl}${url}`;

      setPreviewUrl(fullUrl);
      setPreviewOpen(true);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to start preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  // ==========================================
  // RENDER: Loading state
  // ==========================================
  if (isEditMode && projectLoading) {
    return (
      <div className="min-h-screen bg-[#030712]">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: Error state (edit mode)
  // ==========================================
  if (isEditMode && error && !project) {
    return (
      <div className="min-h-screen bg-[#030712]">
        <Navbar />
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
            <AlertCircle className="w-5 h-5" />
            {error}
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

  // ==========================================
  // RENDER: EDIT MODE (existing project)
  // ==========================================
  if (isEditMode && project) {
    return (
      <div className="min-h-screen bg-[#030712] flex flex-col">
        <Navbar />

        {/* Header */}
        <div className="border-b border-white/5 bg-black/40">
          <div className="max-w-screen-2xl mx-auto px-6 py-3">
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
                  <h1 className="text-lg font-bold text-white">{project.name}</h1>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Code2 className="w-3 h-3" />
                      {project.project_type || "fullstack"}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileCode className="w-3 h-3" />
                      {project.files?.length || 0} files
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {project.created_at && formatDate(project.created_at)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreview}
                  disabled={previewLoading}
                  className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                  data-testid="preview-button"
                >
                  {previewLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Eye className="w-4 h-4 mr-2" />
                  )}
                  Preview
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={downloading}
                  data-testid="download-button"
                >
                  {downloading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Download
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="px-6 py-2">
            <div className="max-w-screen-2xl mx-auto">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Files + Code */}
          <div className="flex-1 flex overflow-hidden">
            {/* File tree */}
            <div className="w-56 border-r border-white/5 bg-[#0f172a] flex-shrink-0 overflow-y-auto">
              <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
                <Folder className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-medium text-gray-300">Files</span>
              </div>
              <FileTree
                files={project.files || []}
                onSelect={setSelectedFile}
                selectedPath={selectedFile?.path}
              />
            </div>

            {/* Code editor */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <LiveCodeEditor
                file={selectedFile}
                isTyping={isTyping && currentTypingFile?.path === selectedFile?.path}
                className="flex-1"
                maxHeight="calc(100vh - 200px)"
              />

              {/* AI Chat (bottom) */}
              <div className="h-48 border-t border-white/5 bg-[#0a0a0f]">
                <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-medium text-gray-300">AI Agent</span>
                  {wsConnected && (
                    <span className="w-2 h-2 rounded-full bg-green-500" title="Connected" />
                  )}
                </div>
                <AgentChatbox
                  messages={chatMessages}
                  inputValue={agentMessage}
                  onInputChange={setAgentMessage}
                  onSend={sendAgentMessage}
                  isLoading={agentLoading}
                  className="h-[calc(100%-40px)]"
                />
              </div>
            </div>
          </div>

          {/* Right: Preview sidebar */}
          <PreviewSidebar
            previewUrl={previewUrl}
            isOpen={previewOpen}
            onToggle={() => setPreviewOpen(!previewOpen)}
            isLoading={previewLoading}
            projectType={project.project_type}
          />
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: CREATE MODE (new project)
  // ==========================================
  return (
    <div className="min-h-screen bg-[#030712]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <Sparkles className="w-8 h-8 text-cyan-400" />
            Generate New Project
          </h1>
          <p className="text-gray-400">
            Describe what you want to build and let AI create it for you
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Input form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Project type */}
            <Card className="bg-black/40 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm font-medium">
                  Project Type
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ProjectTypeSelector
                  selected={projectType}
                  onSelect={setProjectType}
                  disabled={loading}
                />
              </CardContent>
            </Card>

            {/* Prompt input */}
            <Card className="bg-black/40 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm font-medium">
                  Describe Your Project
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="E.g., Build a task management app with user authentication, project boards, and real-time collaboration..."
                  className="min-h-[150px] bg-black/40 border-white/10 text-white placeholder:text-gray-500"
                  disabled={loading}
                  data-testid="prompt-input"
                />

                {/* Error */}
                {error && (
                  <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Clarification questions */}
                {clarifyQuestions.length > 0 && (
                  <div className="mt-4">
                    <ClarifyDialog
                      questions={clarifyQuestions}
                      answers={clarifyAnswers}
                      onAnswerChange={(key, value) =>
                        setClarifyAnswers((prev) => ({ ...prev, [key]: value }))
                      }
                      onSubmit={submitClarify}
                      isSubmitting={loading}
                    />
                  </div>
                )}

                {/* Generate button */}
                {clarifyQuestions.length === 0 && (
                  <Button
                    onClick={handleGenerate}
                    disabled={loading || !prompt.trim()}
                    className="w-full mt-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
                    data-testid="generate-button"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {statusText || "Generating..."}
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        Generate Project
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Progress */}
          <div className="space-y-6">
            {/* Timeline */}
            {timeline.length > 0 && (
              <Card className="bg-black/40 border-white/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm font-medium flex items-center gap-2">
                    <Play className="w-4 h-4 text-cyan-400" />
                    Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AgentTimeline steps={timeline} />
                </CardContent>
              </Card>
            )}

            {/* Chat messages */}
            {chatMessages.length > 0 && (
              <Card className="bg-black/40 border-white/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-white text-sm font-medium flex items-center gap-2">
                    <Bot className="w-4 h-4 text-cyan-400" />
                    AI Messages
                  </CardTitle>
                </CardHeader>
                <CardContent className="max-h-[300px] overflow-y-auto">
                  <div className="space-y-2">
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className="text-sm text-gray-300 p-2 rounded bg-white/5"
                      >
                        {msg.message}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Security findings */}
            {securityFindings.length > 0 && (
              <SecurityFindings findings={securityFindings} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
