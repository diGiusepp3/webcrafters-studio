// frontend/src/pages/Generator.jsx
// Complete AI Agent Generator with live coding, clarify, security checks

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import api from "@/api";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/Navbar";
import { AgentTimeline } from "@/components/AgentTimeline";
import { AgentChatbox } from "@/components/AgentChatbox";
import { SecurityFindings } from "@/components/SecurityFindings";
import { FileTree } from "@/components/FileTree";
import { LiveCodeEditor } from "@/components/generator/LiveCodeEditor";
import { ProjectTypeSelector } from "@/components/generator/ProjectTypeSelector";
import { ClarifyDialog } from "@/components/generator/ClarifyDialog";
import { PreviewSidebar } from "@/components/generator/PreviewSidebar";
import { PromptSuggestions } from "@/components/generator/PromptSuggestions";
import { TemplateSelector } from "@/components/generator/TemplateSelector";

import {
  Sparkles, Loader2, Wand2, AlertCircle, Bot, ChevronRight,
  Download, FileCode, Calendar, Folder, ChevronLeft, Eye, Play,
  Code2, Shield, CheckCircle2, XCircle, Clock, Zap, RefreshCw,
  Copy, ExternalLink, Settings2, Lightbulb, ArrowRight, Terminal,
  Cpu, GitBranch, Layers, Package
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Progress Step Component
function ProgressStep({ step, isActive, isComplete, isError }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
      isActive ? 'bg-cyan-500/10 border border-cyan-500/30' :
      isComplete ? 'bg-green-500/5 border border-green-500/20' :
      isError ? 'bg-red-500/5 border border-red-500/20' :
      'bg-white/5 border border-white/5'
    }`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
        isActive ? 'bg-cyan-500/20 text-cyan-400' :
        isComplete ? 'bg-green-500/20 text-green-400' :
        isError ? 'bg-red-500/20 text-red-400' :
        'bg-white/10 text-gray-500'
      }`}>
        {isComplete ? <CheckCircle2 className="w-4 h-4" /> :
         isError ? <XCircle className="w-4 h-4" /> :
         isActive ? <Loader2 className="w-4 h-4 animate-spin" /> :
         step.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${
          isActive ? 'text-cyan-400' :
          isComplete ? 'text-green-400' :
          isError ? 'text-red-400' :
          'text-gray-400'
        }`}>
          {step.title}
        </p>
        {step.duration && (
          <p className="text-xs text-gray-500">{step.duration}</p>
        )}
      </div>
    </div>
  );
}

// Chat Message Component
function ChatMessage({ message, isUser }) {
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isUser ? 'bg-violet-500/20 text-violet-400' : 'bg-cyan-500/20 text-cyan-400'
      }`}>
        {isUser ? 'U' : <Bot className="w-4 h-4" />}
      </div>
      <div className={`flex-1 max-w-[80%] p-3 rounded-xl ${
        isUser 
          ? 'bg-violet-500/10 border border-violet-500/20 text-white' 
          : 'bg-white/5 border border-white/10 text-gray-300'
      }`}>
        <p className="text-sm whitespace-pre-wrap">{message.message || message.content}</p>
        {message.timestamp && (
          <p className="text-xs text-gray-500 mt-1">
            {new Date(message.timestamp).toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  );
}

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
  const [progress, setProgress] = useState(0);

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

  // Chat input for modifications
  const [chatInput, setChatInput] = useState("");
  const [modifying, setModifying] = useState(false);

  // Clarify
  const [clarifyJobId, setClarifyJobId] = useState(null);
  const [clarifyQuestions, setClarifyQuestions] = useState([]);
  const [clarifyAnswers, setClarifyAnswers] = useState({});

  // Templates
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Live coding
  const [isTyping, setIsTyping] = useState(false);
  const [currentTypingFile, setCurrentTypingFile] = useState(null);
  const [generatedFiles, setGeneratedFiles] = useState([]);

  // UI
  const [activeTab, setActiveTab] = useState('chat');
  const chatEndRef = useRef(null);
  const pollRef = useRef(null);
  const wsRef = useRef(null);

  // Progress steps for create mode
  const progressSteps = useMemo(() => [
    { id: 'preflight', title: 'Analyzing Prompt', icon: <Lightbulb className="w-4 h-4" /> },
    { id: 'clarifying', title: 'Clarifying Requirements', icon: <Bot className="w-4 h-4" /> },
    { id: 'generating', title: 'Generating Code', icon: <Code2 className="w-4 h-4" /> },
    { id: 'patching', title: 'Patching Files', icon: <GitBranch className="w-4 h-4" /> },
    { id: 'validating', title: 'Validating Output', icon: <CheckCircle2 className="w-4 h-4" /> },
    { id: 'security_check', title: 'Security Scan', icon: <Shield className="w-4 h-4" /> },
    { id: 'saving', title: 'Saving Project', icon: <Package className="w-4 h-4" /> },
  ], []);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

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
      setGeneratedFiles(response.data.files || []);
      if (response.data.files?.length) {
        setSelectedFile(response.data.files[0]);
      }
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

  // Cleanup
  useEffect(() => {
    const poll = pollRef.current;
    const ws = wsRef.current;
    return () => {
      if (poll) clearInterval(poll);
      if (ws?.readyState === WebSocket.OPEN) ws.close();
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
      kt: "kotlin", swift: "swift", c: "c", cpp: "cpp", cs: "csharp",
    };
    return langMap[ext] || "text";
  };

  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const formatDuration = (ms) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

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
    setProgress(0);
    setGeneratedFiles([]);
  };

  const startPolling = (jobId) => {
    setCurrentJobId(jobId);
    let lastStep = '';

    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/generate/status/${jobId}`);
        const {
          status, step, project_id, questions, error: jobError,
          timeline: jobTimeline, chat_messages: jobChatMessages,
          security_findings: jobSecurityFindings, message, preview_url,
          applied_fixes,
        } = res.data;

        // Update timeline
        if (jobTimeline) {
          setTimeline(jobTimeline);
          // Calculate progress
          const completedSteps = jobTimeline.filter(t => t.status === 'success').length;
          setProgress((completedSteps / progressSteps.length) * 100);
        }
        if (jobChatMessages) setChatMessages(jobChatMessages);
        if (jobSecurityFindings) setSecurityFindings(jobSecurityFindings);
        if (preview_url) setPreviewUrl(preview_url);

        // Handle step changes for live feedback
        if (step !== lastStep) {
          lastStep = step;
          setStatusText(message || `${step}...`);
        }

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
          setStatusText(message || "Working...");
        }

        if (status === "done") {
          clearInterval(pollRef.current);
          setProgress(100);
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
    setStatusText("Starting AI Agent...");
    setLoading(true);

    // Add initial chat message
    setChatMessages([{
      message: `🚀 Starting generation for: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"`,
      timestamp: new Date().toISOString(),
    }]);

    try {
      const res = await api.post("/generate", {
        prompt: selectedTemplate 
          ? `${selectedTemplate.prompt}\n\nAdditional requirements: ${prompt}`
          : prompt,
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
    setStatusText("Resuming with your answers...");

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

  // Template selection
  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    setProjectType(template.type);
    setPrompt(template.prompt);
    setShowTemplates(false);
  };

  // ==========================================
  // EDIT MODE: Chat & Modifications
  // ==========================================
  const handleSendChat = async () => {
    if (!chatInput.trim() || modifying || !projectId) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setModifying(true);
    setError("");

    // Add user message to chat
    setChatMessages(prev => [...prev, {
      message: userMessage,
      timestamp: new Date().toISOString(),
      metadata: { role: 'user' }
    }]);

    // Add "thinking" message
    setChatMessages(prev => [...prev, {
      message: "🤔 Analyzing your request and preparing modifications...",
      timestamp: new Date().toISOString(),
      metadata: { role: 'agent', status: 'thinking' }
    }]);

    try {
      // Call the modify endpoint
      const res = await api.post(`/projects/${projectId}/modify`, {
        instruction: userMessage,
        context: {
          current_file: selectedFile?.path,
          project_type: project?.project_type
        }
      });

      const { job_id } = res.data;
      
      // Start polling for modification status
      pollModificationStatus(job_id);
    } catch (err) {
      setModifying(false);
      // Remove thinking message
      setChatMessages(prev => prev.filter(m => m.metadata?.status !== 'thinking'));
      // Add error message
      setChatMessages(prev => [...prev, {
        message: `❌ Error: ${err?.response?.data?.detail || 'Failed to process your request. Please try again.'}`,
        timestamp: new Date().toISOString(),
        metadata: { role: 'agent', status: 'error' }
      }]);
    }
  };

  const pollModificationStatus = (jobId) => {
    const pollInterval = setInterval(async () => {
      try {
        const res = await api.get(`/projects/modify/status/${jobId}`);
        const { status, message, updated_files, chat_messages: newMessages, error: jobError } = res.data;

        if (status === 'running') {
          // Update thinking message
          setChatMessages(prev => {
            const filtered = prev.filter(m => m.metadata?.status !== 'thinking');
            return [...filtered, {
              message: `🔄 ${message || 'Working on modifications...'}`,
              timestamp: new Date().toISOString(),
              metadata: { role: 'agent', status: 'thinking' }
            }];
          });
        }

        if (status === 'done') {
          clearInterval(pollInterval);
          setModifying(false);

          // Remove thinking message
          setChatMessages(prev => prev.filter(m => m.metadata?.status !== 'thinking'));

          // Add success message
          setChatMessages(prev => [...prev, {
            message: `✅ ${message || 'Modifications applied successfully!'}`,
            timestamp: new Date().toISOString(),
            metadata: { role: 'agent', status: 'success' }
          }]);

          // Update files if any were modified
          if (updated_files && updated_files.length > 0) {
            setIsTyping(true);
            
            // Update project files
            setProject(prev => {
              if (!prev) return prev;
              const newFiles = [...prev.files];
              updated_files.forEach(updatedFile => {
                const idx = newFiles.findIndex(f => f.path === updatedFile.path);
                if (idx >= 0) {
                  newFiles[idx] = updatedFile;
                } else {
                  newFiles.push(updatedFile);
                }
                // If this file is currently selected, update it
                if (selectedFile?.path === updatedFile.path) {
                  setCurrentTypingFile(updatedFile);
                  setSelectedFile(updatedFile);
                }
              });
              return { ...prev, files: newFiles };
            });

            // Stop typing animation after a delay
            setTimeout(() => {
              setIsTyping(false);
              setCurrentTypingFile(null);
            }, 1000);
          }

          // Refresh project data
          fetchProject();
        }

        if (status === 'error') {
          clearInterval(pollInterval);
          setModifying(false);
          setChatMessages(prev => prev.filter(m => m.metadata?.status !== 'thinking'));
          setChatMessages(prev => [...prev, {
            message: `❌ Error: ${jobError || 'Modification failed'}`,
            timestamp: new Date().toISOString(),
            metadata: { role: 'agent', status: 'error' }
          }]);
        }
      } catch (err) {
        clearInterval(pollInterval);
        setModifying(false);
        setChatMessages(prev => prev.filter(m => m.metadata?.status !== 'thinking'));
      }
    }, 2000);

    // Clear interval after 2 minutes (timeout)
    setTimeout(() => {
      clearInterval(pollInterval);
      if (modifying) {
        setModifying(false);
        setChatMessages(prev => prev.filter(m => m.metadata?.status !== 'thinking'));
        setChatMessages(prev => [...prev, {
          message: '⏱️ Request timed out. Please try again.',
          timestamp: new Date().toISOString(),
          metadata: { role: 'agent', status: 'error' }
        }]);
      }
    }, 120000);
  };

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  // ==========================================
  // EDIT MODE: Actions
  // ==========================================
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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    // Could add toast notification here
  };

  // ==========================================
  // RENDER: Loading state
  // ==========================================
  if (isEditMode && projectLoading) {
    return (
      <div className="min-h-screen bg-[#030712]">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-64px)]">
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Loading project...</p>
          </div>
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
        <div className="max-w-4xl mx-auto px-6 pt-24">
          <div className="glass-card p-8 rounded-xl text-center">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Error Loading Project</h2>
            <p className="text-gray-400 mb-6">{error}</p>
            <Button onClick={() => navigate("/dashboard")} variant="outline" className="glass-card border-white/10">
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
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
        <div className="border-b border-white/5 bg-[#0a0f1a]/80 backdrop-blur-xl pt-16">
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
                  <h1 className="text-lg font-bold text-white flex items-center gap-2">
                    {project.name}
                    <span className={`text-xs px-2 py-0.5 rounded-full bg-gradient-to-r ${
                      project.project_type === 'fullstack' ? 'from-violet-500/20 to-purple-500/20 text-violet-400' :
                      project.project_type === 'frontend' ? 'from-cyan-500/20 to-blue-500/20 text-cyan-400' :
                      project.project_type === 'backend' ? 'from-green-500/20 to-emerald-500/20 text-green-400' :
                      'from-gray-500/20 to-slate-500/20 text-gray-400'
                    }`}>
                      {project.project_type}
                    </span>
                  </h1>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <FileCode className="w-3.5 h-3.5" />
                      {project.files?.length || 0} files
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(project.created_at)}
                    </span>
                    {securityFindings.length > 0 && (
                      <span className="flex items-center gap-1 text-yellow-500">
                        <Shield className="w-3.5 h-3.5" />
                        {securityFindings.length} findings
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreview}
                  disabled={previewLoading}
                  className="glass-card border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
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
                  className="glass-card border-white/10 text-white hover:bg-white/5"
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
          <div className="px-6 py-2 bg-red-500/10 border-b border-red-500/20">
            <div className="max-w-screen-2xl mx-auto flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Files + Code */}
          <div className="flex-1 flex overflow-hidden">
            {/* File tree */}
            <div className="w-60 border-r border-white/5 bg-[#0a0f1a] flex-shrink-0 overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-medium text-white">
                  <Folder className="w-4 h-4 text-cyan-400" />
                  Files
                </span>
                <span className="text-xs text-gray-500">
                  {project.files?.length || 0}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <FileTree
                  files={project.files || []}
                  onSelect={setSelectedFile}
                  selectedPath={selectedFile?.path}
                />
              </div>
            </div>

            {/* Code editor */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {selectedFile ? (
                <>
                  {/* File header */}
                  <div className="px-4 py-2 border-b border-white/5 bg-black/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm text-white font-mono">{selectedFile.path}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(selectedFile.content)}
                        className="h-7 px-2 text-gray-400 hover:text-white"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  {/* Code */}
                  <div className="flex-1 overflow-auto">
                    <LiveCodeEditor
                      file={selectedFile}
                      isTyping={isTyping && currentTypingFile?.path === selectedFile?.path}
                      className="h-full"
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <FileCode className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Select a file to view</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="w-80 border-l border-white/5 bg-[#0a0f1a] flex-shrink-0 flex flex-col overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
              <TabsList className="grid grid-cols-3 m-2 bg-black/40">
                <TabsTrigger value="chat" className="text-xs">Chat</TabsTrigger>
                <TabsTrigger value="security" className="text-xs">Security</TabsTrigger>
                <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
              </TabsList>

              <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden mt-0 px-2 pb-2">
                <div className="flex-1 overflow-y-auto space-y-3 p-2">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No messages yet</p>
                    </div>
                  ) : (
                    chatMessages.map((msg, i) => (
                      <ChatMessage
                        key={i}
                        message={msg}
                        isUser={msg.metadata?.role === 'user'}
                      />
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>
              </TabsContent>

              <TabsContent value="security" className="flex-1 overflow-y-auto mt-0 px-2 pb-2">
                <SecurityFindings findings={securityFindings} />
              </TabsContent>

              <TabsContent value="info" className="flex-1 overflow-y-auto mt-0 p-4">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider">Project Name</label>
                    <p className="text-white font-medium">{project.name}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider">Description</label>
                    <p className="text-gray-300 text-sm">{project.description || 'No description'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase tracking-wider">Original Prompt</label>
                    <p className="text-gray-300 text-sm bg-black/40 p-3 rounded-lg mt-1">{project.prompt}</p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Preview sidebar */}
          {previewOpen && (
            <PreviewSidebar
              previewUrl={previewUrl}
              isOpen={previewOpen}
              onToggle={() => setPreviewOpen(!previewOpen)}
              isLoading={previewLoading}
              projectType={project.project_type}
            />
          )}
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

      <div className="max-w-6xl mx-auto px-6 pt-24 pb-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-6">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span className="text-sm text-cyan-400 font-medium">AI Agent Ready</span>
          </div>
          <h1 className="font-heading text-4xl font-bold text-white mb-3">
            What would you like to build?
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Describe your project and our AI agent will plan, code, test, and deliver it for you
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Input form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Template selection */}
            {showTemplates ? (
              <TemplateSelector
                onSelect={handleTemplateSelect}
                onClose={() => setShowTemplates(false)}
              />
            ) : (
              <>
                {/* Selected template badge */}
                {selectedTemplate && (
                  <div className="glass-card p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white">
                        {selectedTemplate.icon}
                      </div>
                      <div>
                        <p className="text-white font-medium">{selectedTemplate.name}</p>
                        <p className="text-gray-500 text-sm">Template selected</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedTemplate(null);
                        setPrompt('');
                      }}
                      className="text-gray-400 hover:text-white"
                    >
                      Clear
                    </Button>
                  </div>
                )}

                {/* Project type */}
                <div className="glass-card p-6 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-heading font-bold text-white flex items-center gap-2">
                      <Layers className="w-5 h-5 text-cyan-400" />
                      Project Type
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowTemplates(true)}
                      className="text-cyan-400 hover:text-cyan-300"
                    >
                      <Sparkles className="w-4 h-4 mr-1" />
                      Use Template
                    </Button>
                  </div>
                  <ProjectTypeSelector
                    selected={projectType}
                    onSelect={setProjectType}
                    disabled={loading}
                  />
                </div>

                {/* Prompt input */}
                <div className="glass-card p-6 rounded-xl">
                  <h3 className="font-heading font-bold text-white flex items-center gap-2 mb-4">
                    <Terminal className="w-5 h-5 text-cyan-400" />
                    Describe Your Project
                  </h3>
                  
                  {/* Prompt suggestions */}
                  {!prompt && <PromptSuggestions onSelect={setPrompt} projectType={projectType} />}

                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="E.g., Build a SaaS dashboard with user authentication, subscription billing, analytics charts, and a settings page. Use React, Tailwind, and FastAPI..."
                    className="min-h-[180px] bg-black/40 border-white/10 text-white placeholder:text-gray-500 resize-none text-base"
                    disabled={loading}
                    data-testid="prompt-input"
                  />

                  {/* Error */}
                  {error && (
                    <div className="mt-4 flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                      <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">Generation Failed</p>
                        <p className="text-sm opacity-80 mt-1">{error}</p>
                      </div>
                    </div>
                  )}

                  {/* Clarification questions */}
                  {clarifyQuestions.length > 0 && (
                    <div className="mt-6">
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
                      className="w-full mt-6 btn-primary py-6 text-lg"
                      data-testid="generate-button"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          {statusText || "Processing..."}
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-5 h-5 mr-2" />
                          Generate Project
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right: Progress & Status */}
          <div className="space-y-6">
            {/* Progress */}
            {loading && (
              <div className="glass-card p-6 rounded-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-heading font-bold text-white flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-cyan-400 animate-pulse" />
                    AI Agent Working
                  </h3>
                  <span className="text-sm text-cyan-400">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2 mb-6" />
                
                <div className="space-y-2">
                  {progressSteps.map((step, index) => {
                    const timelineStep = timeline.find(t => t.step === step.id);
                    const isActive = timelineStep?.status === 'running';
                    const isComplete = timelineStep?.status === 'success';
                    const isError = timelineStep?.status === 'error';
                    
                    return (
                      <ProgressStep
                        key={step.id}
                        step={{
                          ...step,
                          duration: timelineStep?.duration_ms ? formatDuration(timelineStep.duration_ms) : undefined
                        }}
                        isActive={isActive}
                        isComplete={isComplete}
                        isError={isError}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Chat messages */}
            {chatMessages.length > 0 && (
              <div className="glass-card rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-white">Agent Log</span>
                </div>
                <div className="max-h-[400px] overflow-y-auto p-4 space-y-3">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className="text-sm text-gray-300 p-3 rounded-lg bg-black/40">
                      {msg.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Security findings */}
            {securityFindings.length > 0 && (
              <div className="glass-card rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-medium text-white">Security Findings</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                    {securityFindings.length}
                  </span>
                </div>
                <SecurityFindings findings={securityFindings} />
              </div>
            )}

            {/* Tips */}
            {!loading && (
              <div className="glass-card p-6 rounded-xl">
                <h3 className="font-heading font-bold text-white flex items-center gap-2 mb-4">
                  <Lightbulb className="w-5 h-5 text-yellow-400" />
                  Tips for Better Results
                </h3>
                <ul className="space-y-3 text-sm text-gray-400">
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-4 h-4 text-cyan-500 mt-0.5 flex-shrink-0" />
                    Be specific about features and functionality
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-4 h-4 text-cyan-500 mt-0.5 flex-shrink-0" />
                    Mention preferred tech stack if you have one
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-4 h-4 text-cyan-500 mt-0.5 flex-shrink-0" />
                    Include authentication requirements
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-4 h-4 text-cyan-500 mt-0.5 flex-shrink-0" />
                    Describe the UI/UX you envision
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
