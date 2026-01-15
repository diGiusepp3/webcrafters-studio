// frontend/src/pages/Generator.jsx
// Unified Generator: Create NEW projects + Edit EXISTING projects
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import api from "@/api";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { AgentTimeline } from "@/components/AgentTimeline";
import { AgentChatbox } from "@/components/AgentChatbox";
import { SecurityFindings } from "@/components/SecurityFindings";
import { FileTree } from "@/components/FileTree";
import { CodePreview } from "@/components/CodePreview";

import {
  Sparkles,
  Loader2,
  Wand2,
  Code2,
  Layout,
  Server,
  Layers,
  AlertCircle,
  Bot,
  ChevronRight,
  Download,
  FileCode,
  Calendar,
  Folder,
  ChevronLeft,
  Save,
} from "lucide-react";

const projectTypes = [
  { id: "fullstack", name: "Full-Stack", icon: <Layers className="w-5 h-5" /> },
  { id: "frontend", name: "Frontend", icon: <Layout className="w-5 h-5" /> },
  { id: "backend", name: "Backend", icon: <Server className="w-5 h-5" /> },
  { id: "any", name: "Any", icon: <Code2 className="w-5 h-5" /> },
];

export default function Generator() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Detect if we're in EDIT mode (existing project) or CREATE mode (new project)
  const projectId = searchParams.get('projectId') || location.state?.projectId;
  const isEditMode = !!projectId;

  // CREATE mode state
  const [prompt, setPrompt] = useState("");
  const [projectType, setProjectType] = useState("fullstack");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");

  // EDIT mode state
  const [project, setProject] = useState(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // AI Agent state (shared between modes)
  const [wsConnected, setWsConnected] = useState(false);
  const [agentMessage, setAgentMessage] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [securityFindings, setSecurityFindings] = useState([]);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  // Clarify state
  const [clarifyJobId, setClarifyJobId] = useState(null);
  const [clarifyQuestions, setClarifyQuestions] = useState([]);
  const [clarifyAnswers, setClarifyAnswers] = useState({});

  const pollRef = useRef(null);
  const wsRef = useRef(null);

  // ===== EDIT MODE: Load existing project =====
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

  // ===== EDIT MODE: WebSocket for AI agent =====
  useEffect(() => {
    if (!isEditMode || !project) return;

    const newSessionId = `project-${projectId}-${Date.now()}`;
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
  }, [isEditMode, project, projectId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, []);

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

  // ===== CREATE MODE: Generation functions =====
  const resetState = () => {
    setError("");
    setClarifyJobId(null);
    setClarifyQuestions([]);
    setClarifyAnswers({});
    setTimeline([]);
    setChatMessages([]);
    setSecurityFindings([]);
  };

  const startPolling = (jobId) => {
    setCurrentJobId(jobId);
    
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/generate/status/${jobId}`);
        const {
          status,
          step,
          project_id,
          questions,
          error: jobError,
          timeline: jobTimeline,
          chat_messages: jobChatMessages,
          security_findings: jobSecurityFindings,
          message,
        } = res.data;

        if (jobTimeline) setTimeline(jobTimeline);
        if (jobChatMessages) setChatMessages(jobChatMessages);
        if (jobSecurityFindings) setSecurityFindings(jobSecurityFindings);

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
          // Navigate to edit mode with the new project
          navigate(`/generate?projectId=${project_id}`);
        }

        if (status === "error") {
          clearInterval(pollRef.current);
          setLoading(false);
          setStatusText("");
          setError(
            typeof jobError === "string"
              ? jobError
              : JSON.stringify(jobError, null, 2)
          );
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
    setStatusText("Connecting…");
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

  // ===== EDIT MODE: AI Agent functions =====
  const sendAgentMessage = () => {
    if (!agentMessage.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    setAgentLoading(true);
    
    setChatMessages(prev => [...prev, {
      message: agentMessage,
      timestamp: new Date().toISOString(),
      metadata: { role: 'user' },
    }]);

    wsRef.current.send(JSON.stringify({
      type: "message",
      content: agentMessage,
      context: {
        project_id: projectId,
        current_files: project?.files || [],
      },
    }));

    setAgentMessage("");
  };

  // ===== EDIT MODE: Download & Preview =====
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

    setPreviewing(true);
    setError("");

    try {
      const res = await api.post(`/projects/${projectId}/preview`);
      const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
      const previewUrl = res.data.url;
      
      const fullUrl = previewUrl.startsWith('http') 
        ? previewUrl 
        : `${backendUrl}${previewUrl}`;
      
      window.open(fullUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to start preview");
    } finally {
      setPreviewing(false);
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

  // ===== RENDER: EDIT MODE (existing project) =====
  if (isEditMode) {
    if (projectLoading) {
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
                  <h1 className="text-xl font-bold text-white">{project?.name}</h1>
                  <p className="text-gray-400 text-sm">{project?.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1 text-gray-500 text-sm">
                  <FileCode className="w-4 h-4" />
                  {project?.files?.length || 0} files
                </span>
                <span className="flex items-center gap-1 text-gray-500 text-sm">
                  <Calendar className="w-4 h-4" />
                  {project?.created_at && formatDate(project.created_at)}
                </span>

                {project?.project_type && ["web", "frontend", "fullstack"].includes(project.project_type) && (
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
                files={project?.files || []}
                onSelect={setSelectedFile}
                selectedPath={selectedFile?.path}
              />
            </div>

            <div className="flex-1 bg-[#1e1e1e] overflow-hidden">
              <CodePreview file={selectedFile} />
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

            {/* Security Findings */}
            {securityFindings.length > 0 && (
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
    );
  }

  // ===== RENDER: CREATE MODE (new project) =====
  const showWorkingPanel = loading || timeline.length > 0 || chatMessages.length > 0;

  return (
    <div className="min-h-screen bg-[#030712]">
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-cyan-500/10">
            <Wand2 className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">AI Code Generator</h1>
            <p className="text-gray-400 text-sm">
              Describe what you want to build and let AI generate the code
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Input Form */}
          <div className="space-y-6">
            {/* Clarify UI */}
            {clarifyJobId ? (
              <Card className="bg-black/40 border-white/10">
                <CardHeader>
                  <CardTitle className="text-cyan-400 flex items-center gap-2">
                    <Bot className="w-5 h-5" />
                    Clarification Required
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-gray-400 text-sm">
                    Please answer these questions to help generate a better project:
                  </p>

                  {clarifyQuestions.map((q, i) => (
                    <div key={i}>
                      <Label className="text-gray-300 text-sm mb-2 block">{q}</Label>
                      <Textarea
                        placeholder="Your answer..."
                        className="bg-black/60 border-white/10 text-white"
                        onChange={(e) =>
                          setClarifyAnswers((a) => ({
                            ...a,
                            [q]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}

                  <Button
                    onClick={submitClarify}
                    disabled={loading}
                    className="w-full bg-cyan-500 text-black font-bold"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <ChevronRight className="w-4 h-4 mr-2" />
                        Continue Generation
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Project Type Selector */}
                <Card className="bg-black/40 border-white/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-white text-sm">Project Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {projectTypes.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setProjectType(t.id)}
                          disabled={loading}
                          data-testid={`project-type-${t.id}`}
                          className={`p-4 rounded-lg border text-left transition-all ${
                            projectType === t.id
                              ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400"
                              : "bg-black/30 border-white/10 text-gray-400 hover:border-white/20"
                          } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          {t.icon}
                          <div className="mt-2 text-sm font-medium">{t.name}</div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Prompt Input */}
                <Card className="bg-black/40 border-white/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-white text-sm">Describe Your Project</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Describe what you want to build in detail. For example: 'A task management app with user authentication, task categories, due dates, and a modern dark theme...'"
                      className="min-h-[200px] bg-black/60 border-white/10 text-white font-mono text-sm resize-none"
                      disabled={loading}
                      data-testid="prompt-input"
                    />

                    {error && (
                      <div className="flex items-start gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                        <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                        <div className="text-sm whitespace-pre-wrap">{error}</div>
                      </div>
                    )}

                    <Button
                      onClick={handleGenerate}
                      disabled={loading || !prompt.trim()}
                      className="w-full bg-cyan-500 text-black font-bold py-6 hover:bg-cyan-400 transition-colors"
                      data-testid="generate-btn"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          {statusText || "Working…"}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5 mr-2" />
                          Generate Project
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Security Findings (shown when available) */}
            {securityFindings.length > 0 && (
              <SecurityFindings findings={securityFindings} />
            )}
          </div>

          {/* Right Column: Working Agent Panel */}
          <div className="space-y-4">
            {showWorkingPanel ? (
              <>
                {/* Agent Timeline */}
                <Card className="bg-black/40 border-white/10">
                  <AgentTimeline timeline={timeline} />
                </Card>

                {/* Agent Chatbox */}
                <Card className="bg-black/40 border-white/10 h-[400px]">
                  <AgentChatbox messages={chatMessages} />
                </Card>
              </>
            ) : (
              <Card className="bg-black/40 border-white/10 border-dashed">
                <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                  <Bot className="w-12 h-12 mb-4 opacity-30" />
                  <h3 className="text-lg font-medium text-gray-400 mb-2">
                    Agent Panel
                  </h3>
                  <p className="text-sm text-center max-w-xs">
                    When you start generation, you'll see the agent's progress
                    timeline and real-time narration here.
                  </p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
