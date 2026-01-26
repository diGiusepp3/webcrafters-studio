// frontend/src/pages/ProjectView.jsx
// Enhanced with AI editing capabilities, Timeline, Chat, and Security Findings
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/api";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { CodePreview } from "@/components/CodePreview";
import { FileTree } from "@/components/FileTree";
import { AgentTimeline } from "@/components/AgentTimeline";
import { AgentChatbox } from "@/components/AgentChatbox";
import { SecurityFindings } from "@/components/SecurityFindings";

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
  Save,
  RefreshCw,
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

  // AI Agent state
  const [wsConnected, setWsConnected] = useState(false);
  const [agentMessage, setAgentMessage] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [securityFindings, setSecurityFindings] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  
  const wsRef = useRef(null);

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

  const handleRefresh = async () => {
    if (!project) return;

    setRefreshing(true);
    setError("");

    try {
      const res = await api.post(`/projects/${id}/github/refresh`);
      if (!res?.data?.success) {
        setError(res?.data?.message || "GitHub refresh failed");
        return;
      }
      await reloadProjectFiles();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const message = err?.response?.data?.message;
      setError(detail || message || "Failed to refresh from GitHub");
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
