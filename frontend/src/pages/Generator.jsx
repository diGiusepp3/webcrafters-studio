// frontend/src/pages/Generator.jsx
// Complete AI Agent Generator with live coding, agent timeline, security checks

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import api from "@/api";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Navbar } from "@/components/Navbar";
import { FileTree } from "@/components/FileTree";
import { SecurityFindings } from "@/components/SecurityFindings";
import { CodeEditor } from "@/components/CodeEditor";
import { ProjectTypeSelector } from "@/components/generator/ProjectTypeSelector";
import { ClarifyDialog } from "@/components/generator/ClarifyDialog";
import { PromptSuggestions } from "@/components/generator/PromptSuggestions";
import { TemplateSelector } from "@/components/generator/TemplateSelector";
import { AgentTimelinePanel } from "@/components/generator/AgentTimelinePanel";
import { DiffViewer } from "@/components/generator/DiffViewer";
import { useAuth } from "@/context/AuthContext";

import {
  Sparkles, Loader2, Wand2, AlertCircle, Bot, ChevronRight,
  Download, FileCode, Calendar, Folder, ChevronLeft, Eye, Play,
  Code2, Shield, CheckCircle2, XCircle, Clock, Zap, RefreshCw,
  ExternalLink, Lightbulb, Terminal, Send,
  Cpu, GitBranch, Layers, Package, Search, FlaskConical,
  Activity, Maximize2, Minimize2, X, MonitorPlay
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Chat Message Component
function ChatMessage({ message, isUser, isThinking }) {
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
        isUser ? 'bg-violet-500/20 text-violet-400' : 
        isThinking ? 'bg-cyan-500/20 text-cyan-400 animate-pulse' :
        'bg-cyan-500/20 text-cyan-400'
      }`}>
        {isUser ? 'U' : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className={`flex-1 max-w-[85%] ${isUser ? 'text-right' : 'text-left'}`}>
        <div className={`inline-block p-2.5 rounded-xl text-sm ${
          isUser ? 'bg-violet-500/10 border border-violet-500/20 text-white' : 
          isThinking ? 'bg-cyan-500/5 border border-cyan-500/20 text-cyan-400' :
          'bg-white/5 border border-white/10 text-gray-300'
        }`}>
          <p className="whitespace-pre-wrap break-words">{message.message || message.content}</p>
        </div>
        {message.timestamp && (
          <p className="text-[10px] text-gray-600 mt-1">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
  const { user } = useAuth();

  // Mode detection
  const projectId = searchParams.get("projectId") || location.state?.projectId;
  const isEditMode = !!projectId;
  const ACTIVE_JOB_STORAGE_KEY = "activeGenerationJobId";

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
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  const [previewJob, setPreviewJob] = useState(null);

  // AI Agent
  const [timeline, setTimeline] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [securityFindings, setSecurityFindings] = useState([]);
  const [securityStats, setSecurityStats] = useState(null);
  const [securityScanning, setSecurityScanning] = useState(false);
  const [securityScanRan, setSecurityScanRan] = useState(false);
  const devUserIdSet = useMemo(() => {
    const entries = [
      process.env.REACT_APP_DEV_USER_ID,
      process.env.REACT_APP_DEV_USER_CODEX,
      process.env.REACT_APP_DEV_USER_IDS,
      process.env.DEV_USER_ID,
      process.env.DEV_USER_CODEX,
      process.env.DEV_USER_IDS,
    ];
    const normalized = new Set();
    const addTokens = (value) => {
      if (!value) return;
      value
        .split(/[;,]+/)
        .map((token) => token?.trim())
        .filter(Boolean)
        .forEach((token) => normalized.add(token));
    };
    entries.forEach(addTokens);
    return normalized;
  }, []);
  const [agentEvents, setAgentEvents] = useState([]);
  const eventPollingActiveRef = useRef(false);
  const eventCursorRef = useRef(null);
  const [currentJobId, setCurrentJobId] = useState(null);

  const [agentActivity, setAgentActivity] = useState([]);
  const [agentHeadline, setAgentHeadline] = useState("");
  const [agentDetail, setAgentDetail] = useState("");
  const [agentCommand, setAgentCommand] = useState("");
  const [agentOutput, setAgentOutput] = useState("");

  const [jobStatus, setJobStatus] = useState("");
  const [jobStep, setJobStep] = useState("");
  const [planSummary, setPlanSummary] = useState("");
  const [planMessageText, setPlanMessageText] = useState("");
  const [planConfirmed, setPlanConfirmed] = useState(false);
  const [planReadyAt, setPlanReadyAt] = useState(null);
  const [planConfirming, setPlanConfirming] = useState(false);
  const [planFeedback, setPlanFeedback] = useState("");
  const [planFeedbackSending, setPlanFeedbackSending] = useState(false);
  const [finalReasoning, setFinalReasoning] = useState(null);
  const [finalReasoningData, setFinalReasoningData] = useState(null);
  const [finalReasoningMessage, setFinalReasoningMessage] = useState("");
  const [finalConfirming, setFinalConfirming] = useState(false);
  const [finalConfirmed, setFinalConfirmed] = useState(false);
  const [buildResult, setBuildResult] = useState(null);

  // Chat input for modifications
  const [chatInput, setChatInput] = useState("");
  const [modifying, setModifying] = useState(false);
  const [agentChatInput, setAgentChatInput] = useState("");
  const [agentChatSending, setAgentChatSending] = useState(false);

  // Clarify
  const [clarifyJobId, setClarifyJobId] = useState(null);
  const [clarifyQuestions, setClarifyQuestions] = useState([]);
  const [clarifyAnswers, setClarifyAnswers] = useState({});
  const clarifyRef = useRef(null);

  // Templates
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Live coding
  const [isTyping, setIsTyping] = useState(false);
  const [currentTypingFile, setCurrentTypingFile] = useState(null);
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [liveFileContent, setLiveFileContent] = useState({});

  // Diff view
  const [showDiff, setShowDiff] = useState(false);
  const [diffData, setDiffData] = useState(null);
  const [diffMode, setDiffMode] = useState("applied");
  const [proposalJobId, setProposalJobId] = useState(null);
  const [proposalSummary, setProposalSummary] = useState("");
  const [proposalNotes, setProposalNotes] = useState([]);
  const [applyingProposal, setApplyingProposal] = useState(false);
  const [editorDrafts, setEditorDrafts] = useState({});
  const [editorSaving, setEditorSaving] = useState(false);

  // UI
  const [activeTab, setActiveTab] = useState('chat');
  const chatEndRef = useRef(null);
  const chatScrollRef = useRef(null);
  const [autoScrollChat, setAutoScrollChat] = useState(true);
  const pollRef = useRef(null);
  const previewPollRef = useRef(null);
  const previewStartedAtRef = useRef(null);
  const previewRetryRef = useRef({ attempts: 0, max: 3, pending: false });
  const previewFixAttemptsRef = useRef(0);
  const lastAgentStepRef = useRef("");
  const pollRetryRef = useRef(0);
  const recoverAttemptedRef = useRef(false);
  const [pendingRecoveryJobId, setPendingRecoveryJobId] = useState(null);
  const [pendingRecoveryStatus, setPendingRecoveryStatus] = useState("");
  const [pendingRecoveryStep, setPendingRecoveryStep] = useState("");

  // Progress steps
  const progressSteps = useMemo(() => [
    { id: 'preflight', title: 'Analyzing Request', icon: <Search className="w-4 h-4" />, description: 'Understanding your requirements and planning the project structure' },
    { id: 'clarifying', title: 'Clarifying Intent', icon: <Bot className="w-4 h-4" />, description: 'Gathering additional details to ensure accurate generation' },
    { id: 'generating', title: 'Generating Code', icon: <Code2 className="w-4 h-4" />, description: 'AI is writing the source code for your project' },
    { id: 'patching', title: 'Patching Files', icon: <GitBranch className="w-4 h-4" />, description: 'Applying necessary patches and configurations' },
    { id: 'validating', title: 'Validating Output', icon: <CheckCircle2 className="w-4 h-4" />, description: 'Checking code quality and structure' },
    { id: 'security_check', title: 'Security Check', icon: <Shield className="w-4 h-4" />, description: 'Scanning for security vulnerabilities and best practices' },
    { id: 'saving', title: 'Saving Project', icon: <Package className="w-4 h-4" />, description: 'Persisting your project to the database' },
  ], []);

  const planMessageSections = useMemo(() => {
    if (!planMessageText) return [];
    return planMessageText
      .split(/\n\s*\n+/)
      .map((segment) => segment.trim())
      .filter(Boolean);
  }, [planMessageText]);

  const planReviewPending = jobStatus === "plan_ready" || jobStep === "plan_review";
  const planInteractionEnabled = Boolean(currentJobId) && planReviewPending && !planConfirmed;

  // Scroll chat to bottom when user is near the end
  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
      setAutoScrollChat(atBottom);
    };

    handleScroll();
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [activeTab, loading, isEditMode]);

  useEffect(() => {
    if (!autoScrollChat) return;
    if (!loading && activeTab !== 'chat') return;
    const container = chatScrollRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
  }, [chatMessages, autoScrollChat, activeTab, loading]);

  useEffect(() => {
    if (!clarifyQuestions.length) return;
    clarifyRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [clarifyQuestions.length]);

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
    return () => {
      if (poll) clearInterval(poll);
      stopEventPolling();
    };
  }, []);

  // ==========================================
  // UTILITY FUNCTIONS
  // ==========================================
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
  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const formatDuration = (ms) => {
    if (!ms && ms !== 0) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const agentBusy = modifying || previewLoading;

  const activityDotClass = (status) => {
    if (status === 'error') return 'bg-red-500';
    if (status === 'success') return 'bg-green-500';
    return 'bg-cyan-400';
  };

  const detectMissingDependencies = (logText) => {
    if (!logText) return false;
    return /(cannot find module|module not found|err_module_not_found|missing script|cannot find package|failed to resolve dependency|command not found|not found: vite)/i.test(logText);
  };

  const detectPackageManager = (logText) => {
    const lower = String(logText || '').toLowerCase();
    if (lower.includes('pnpm')) return 'pnpm';
    if (lower.includes('yarn')) return 'yarn';
    if (lower.includes('bun')) return 'bun';
    return 'npm';
  };

  const extractCommandFromLog = (logText) => {
    if (!logText) return '';
    const patterns = [
      /^\s*(npm|pnpm|yarn|bun)\s+(install|ci)\b/m,
      /^\s*(npm|pnpm|yarn|bun)\s+run\s+\S+/m,
      /^\s*(pip|poetry)\s+\S+/m,
    ];

    for (const pattern of patterns) {
      const match = logText.match(pattern);
      if (match) return match[0].trim();
    }

    return '';
  };

  const resetAgentActivity = () => {
    setAgentActivity([]);
    setAgentHeadline('');
    setAgentDetail('');
    setAgentCommand('');
    setAgentOutput('');
    lastAgentStepRef.current = '';
  };

  const setAgentStep = (title, detail, status = 'running', options = {}) => {
    const key = `${title}|${detail}|${status}`;
    if (lastAgentStepRef.current !== key) {
      lastAgentStepRef.current = key;
      setAgentActivity((prev) => {
        const next = [...prev, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          detail: detail || '',
          status,
          timestamp: new Date().toISOString(),
        }];
        return next.slice(-6);
      });
    }

    setAgentHeadline(title);
    setAgentDetail(detail || '');

    if (options.command !== undefined) setAgentCommand(options.command);
    if (options.output !== undefined) setAgentOutput(options.output);
  };

  // ==========================================
  // CREATE MODE: Generation
  // ==========================================
  const resetState = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    recoverAttemptedRef.current = false;
    setError("");
    setClarifyJobId(null);
    setClarifyQuestions([]);
    setClarifyAnswers({});
    setTimeline([]);
    setChatMessages([]);
    setSecurityFindings([]);
    setSecurityStats(null);
    setSecurityScanRan(false);
    resetAgentEvents();
    setPreviewUrl(null);
    setProgress(0);
    setGeneratedFiles([]);
    setLiveFileContent({});
    setSelectedFile(null);
    resetAgentActivity();
  };

  const stopEventPolling = () => {
    eventPollingActiveRef.current = false;
  };

  const resetAgentEvents = () => {
    stopEventPolling();
    eventCursorRef.current = null;
    setAgentEvents([]);
  };

  const pollAgentEvents = async (jobId) => {
    if (!jobId) return;
    while (eventPollingActiveRef.current) {
      try {
        const params = { wait_ms: 10000 };
        if (eventCursorRef.current) {
          params.after = eventCursorRef.current;
        }
        const res = await api.get(`/generate/events/${jobId}`, { params });
        if (!eventPollingActiveRef.current) break;
        const newEvents = res?.data?.events || [];
        if (newEvents.length) {
          const lastId = newEvents[newEvents.length - 1]?.id;
          eventCursorRef.current = res?.data?.next_cursor || lastId;
          setAgentEvents((prev) => {
            const merged = [...prev, ...newEvents];
            return merged.slice(-40);
          });
        }
      } catch (err) {
        if (!eventPollingActiveRef.current) break;
        if (err?.response?.status === 404) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  };

  const startEventPolling = (jobId) => {
    if (!jobId) return;
    stopEventPolling();
    eventCursorRef.current = null;
    eventPollingActiveRef.current = true;
    void pollAgentEvents(jobId);
  };

  const addChatMessage = (message, role = 'agent', status = null, extraMetadata = {}) => {
    setChatMessages(prev => [...prev, {
      role,
      message,
      timestamp: new Date().toISOString(),
      metadata: { role, status, ...extraMetadata }
    }]);
  };


  const upsertAgentLog = (key, text) => {
    if (typeof text === 'string') {
      const cleaned = text
        .replace(/^```[a-z]*\n?/i, '')
        .replace(/```$/i, '')
        .trim();
      if (cleaned) {
        setAgentOutput(cleaned.slice(-8000));
      }
    }

    setChatMessages((prev) => {
      const idx = prev.findIndex((m) => m?.metadata?.key === key);

      const msg = {
        message: text,
        timestamp: new Date().toISOString(),
        metadata: { role: "agent", status: "thinking", key, kind: "cli" },
      };

      if (idx === -1) return [...prev, msg];

      const next = [...prev];
      next[idx] = msg;
      return next;
    });
  };

  const applyJobUpdate = (data) => {
    const {
      status, step,
      timeline: jobTimeline,
      chat_messages: jobChatMessages,
      security_findings: jobSecurityFindings,
      plan_summary: planSummary,
      plan_message: planMessage,
      plan_confirmed: planConfirmedFlag,
      plan_ready_at: planReadyAt,
      final_reasoning: finalReasoning,
      final_reasoning_message: finalReasoningMessage,
      final_confirmation: finalConfirmation,
      build_result: buildResult,
      preview_url: previewUrlFromJob,
    } = data || {};

    if (jobTimeline && jobTimeline.length > 0) {
      setTimeline(jobTimeline.map(t => ({
        ...t,
        isComplete: t.status === 'success',
        isRunning: t.status === 'running',
        isError: t.status === 'error',
      })));
      const completedSteps = jobTimeline.filter(t => t.status === 'success').length;
      setProgress((completedSteps / progressSteps.length) * 100);
    }

    if (jobChatMessages && jobChatMessages.length > 0) {
      setChatMessages(jobChatMessages.map(m => ({
        ...m,
        metadata: m.metadata || { role: 'agent' }
      })));
    }

    if (jobSecurityFindings) {
      setSecurityFindings(jobSecurityFindings);
      setSecurityScanRan(true);
    }

    if (previewUrlFromJob) {
      setPreviewUrl(previewUrlFromJob);
    }

    setPlanSummary(planSummary || "");
    setPlanMessageText(planMessage || "");
    setPlanConfirmed(Boolean(planConfirmedFlag));
    setPlanReadyAt(planReadyAt || null);
    setJobStatus(status || "");
    setJobStep(step || "");
    setFinalReasoning(finalReasoning || null);
    setFinalReasoningMessage(finalReasoningMessage || "");
    setFinalReasoningData(finalReasoning || null);
    setFinalConfirmed(Boolean(finalConfirmation));
    setBuildResult(buildResult || null);

    if (status === "plan_ready" || status === "clarify" || status === "done" || status === "error") {
      setLoading(false);
    }
    if (status === "plan_ready") {
      setStatusText("Plan ready. Review it and confirm to continue.");
    }

    return { status, step };
  };

  const handleRefreshStatus = async () => {
    if (!currentJobId) return;
    setStatusText("Refreshing job status...");
    try {
      const res = await api.get(`/generate/status/${currentJobId}`);
      applyJobUpdate(res.data);
      pollRetryRef.current = 0;
      if (!pollRef.current) {
        startPolling(currentJobId);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to refresh the job status.");
    }
  };

  const startPolling = (jobId) => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setCurrentJobId(jobId);
    localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, jobId);
    startEventPolling(jobId);
    let lastStep = '';
    let lastFilesCount = 0;

    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/generate/status/${jobId}`);
        const {
          project_id,
          questions,
          error: jobError,
          message,
          files,
        } = res.data;
        const { status, step } = applyJobUpdate(res.data);

        pollRetryRef.current = 0;

        // Live file updates - show files as they're generated
        if (files && files.length > lastFilesCount) {
          const newFiles = files.slice(lastFilesCount);
          lastFilesCount = files.length;
          
          // Animate each new file
          for (const file of newFiles) {
            setGeneratedFiles(prev => {
              const existing = prev.find(f => f.path === file.path);
              if (existing) {
                return prev.map(f => f.path === file.path ? file : f);
              }
              return [...prev, file];
            });
            
            // Show typing effect for current file
            setIsTyping(true);
            setCurrentTypingFile(file);
            setSelectedFile(file);
            setLiveFileContent(prev => ({ ...prev, [file.path]: file.content }));
          }
          
          setTimeout(() => setIsTyping(false), 500);
        }

        // Handle step changes
        if (step !== lastStep) {
          lastStep = step;
          setStatusText(message || `${step}...`);
        }

        // Handle clarification
        if (status === "clarify") {
          stopEventPolling();
          clearInterval(pollRef.current);
          pollRef.current = null;
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
          stopEventPolling();
          clearInterval(pollRef.current);
          pollRef.current = null;
          localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
          setProgress(100);
          setIsTyping(false);
          addChatMessage("✅ Your project is ready! You can now preview, edit, or download it.", 'agent', 'success');
          navigate(`/generate?projectId=${project_id}`);
        }

        if (status === "error") {
          stopEventPolling();
          clearInterval(pollRef.current);
          pollRef.current = null;
          localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
          setLoading(false);
          setStatusText("");
          setIsTyping(false);
          setError(typeof jobError === "string" ? jobError : JSON.stringify(jobError, null, 2));
        }
      } catch (e) {
        pollRetryRef.current += 1;
        if (pollRetryRef.current <= 3) {
          setStatusText("Connection interrupted; retrying...");
          return;
        }
        console.error("Generation poll failed", e);
        pollRetryRef.current = 3;
        const detail = e?.response?.data?.detail || e?.message || "Connection interrupted; retrying...";
        setStatusText(detail);
      }
    }, 1500);
  };

  const discardPendingGeneration = () => {
    localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
    setPendingRecoveryJobId(null);
    setPendingRecoveryStatus("");
    setPendingRecoveryStep("");
  };

  const handleResumePendingGeneration = () => {
    if (!pendingRecoveryJobId) return;
    setStatusText("Resuming your previous generation...");
    setLoading(true);
    const jobIdToResume = pendingRecoveryJobId;
    discardPendingGeneration();
    startPolling(jobIdToResume);
  };

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (isEditMode || currentJobId || recoverAttemptedRef.current) return;
    const savedJobId = localStorage.getItem(ACTIVE_JOB_STORAGE_KEY);
    if (!savedJobId) return;
    recoverAttemptedRef.current = true;

    const recover = async () => {
      try {
        const res = await api.get(`/generate/status/${savedJobId}`);
        const { status, step } = res.data;
        if (status === "done" || status === "error") {
          localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
          return;
        }
        setPendingRecoveryJobId(savedJobId);
        setPendingRecoveryStatus(status || "");
        setPendingRecoveryStep(step || "");
      } catch {
        localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY);
      }
    };

    void recover();
  }, [isEditMode, currentJobId]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const confirmPlan = async () => {
    if (!currentJobId || planConfirmed) return;
    setPlanConfirming(true);
    try {
      await api.post(`/generate/plan/${currentJobId}/confirm`);
      setPlanConfirmed(true);
      setStatusText("Plan confirmed. Generating…");
      addChatMessage("✅ Plan confirmed. Code agent starting…", "agent", "success");
    } catch (err) {
      setError("Unable to confirm the plan. Please try again.");
    } finally {
      setPlanConfirming(false);
    }
  };

  const sendPlanNote = async (note) => {
    if (!currentJobId) return;
    await api.post(`/generate/plan/${currentJobId}/feedback`, { message: note });
    addChatMessage(note, "user", null, { plan_feedback: true });
    setStatusText("Plan feedback recorded. Confirm when ready.");
    await handleRefreshStatus();
  };

  const handleSendPlanFeedback = async () => {
    if (!currentJobId || !planFeedback.trim()) return;
    setPlanFeedbackSending(true);
    const note = planFeedback.trim();
    setPlanFeedback("");
    try {
      await sendPlanNote(note);
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to send plan feedback.");
    } finally {
      setPlanFeedbackSending(false);
    }
  };

  const handleSendAgentChat = async () => {
    if (!planInteractionEnabled || !agentChatInput.trim()) return;
    setAgentChatSending(true);
    const note = agentChatInput.trim();
    setAgentChatInput("");
    try {
      await sendPlanNote(note);
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to send your message to the reasoning agent.");
    } finally {
      setAgentChatSending(false);
    }
  };

  const confirmFinalReview = async () => {
    if (!currentJobId || finalConfirmed) return;
    setFinalConfirming(true);
    try {
      await api.post(`/generate/final/confirm/${currentJobId}`);
      setFinalConfirmed(true);
    } catch (err) {
      setError("Unable to confirm the final review. Please try again.");
    } finally {
      setFinalConfirming(false);
    }
  };

  // ===== HARD CREDIT CHECK =====
  const ensureCanGenerate = async () => {
    if (!user?.id) {
      navigate("/login");
      throw new Error("Not authenticated");
    }

    const normalizedId = String(user.id);
    if (user?.is_dev || devUserIdSet.has(normalizedId)) {
      return;
    }

    // ✅ CORRECT: check echte credits
    const res = await api.get("/credits/balance");

    const credits = Number(res.data?.credits ?? 0);

    if (credits <= 0) {
      navigate("/credits");
      throw new Error("No credits");
    }
  };


  const handleGenerate = async () => {
    try {
      await ensureCanGenerate();
    } catch {
      return;
    }

    if (!prompt.trim()) return;
    resetState();
    setStatusText("Starting AI Agent...");
    setLoading(true);

    // Initialize timeline
    setTimeline(progressSteps.map((step, idx) => ({
      step: step.id,
      title: step.title,
      description: step.description,
      status: idx === 0 ? 'running' : 'pending',
      duration_ms: 0,
      isRunning: idx === 0,
      isComplete: false,
    })));

    // Add initial chat messages
    addChatMessage(`🚀 Starting your project generation...`, 'agent');
    addChatMessage(`🔍 Analyzing your request to understand the project requirements...`, 'agent');

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
    addChatMessage("📝 Processing your answers...", 'agent');

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
    setProposalJobId(null);
    setProposalSummary("");
    setProposalNotes([]);
    setDiffData(null);
    setDiffMode("applied");
    setShowDiff(false);
    resetAgentActivity();
    setAgentStep("Analyzing request", "Reviewing instructions and project context.", "running");

    // Add user message
    addChatMessage(userMessage, 'user');
    addChatMessage("🤔 Analyzing your request and preparing modifications...", 'agent', 'thinking');

    try {
      const res = await api.post(`/projects/${projectId}/modify`, {
        instruction: userMessage,
        context: {
          current_file: selectedFile?.path,
          project_type: project?.project_type
        }
      });

      pollModificationStatus(res.data.job_id);
    } catch (err) {
      setModifying(false);
      setChatMessages(prev => prev.filter(m => m.metadata?.status !== 'thinking'));
      addChatMessage(`❌ Error: ${err?.response?.data?.detail || 'Failed to process your request.'}`, 'agent', 'error');
    }
  };

  const applyUpdatedFilesToState = (updatedFiles) => {
    if (!updatedFiles || updatedFiles.length === 0) return;
    setProject(prev => {
      if (!prev) return prev;
      const newFiles = [...(prev.files || [])];
      let nextSelected = selectedFile;

      updatedFiles.forEach(updatedFile => {
        const action = (updatedFile.action || "modify").toLowerCase();
        const isDelete = action === "delete" || action === "deleted";
        const idx = newFiles.findIndex(f => f.path === updatedFile.path);

        if (isDelete) {
          if (idx >= 0) newFiles.splice(idx, 1);
          if (nextSelected?.path === updatedFile.path) {
            nextSelected = newFiles[0] || null;
          }
          return;
        }

        if (idx >= 0) {
          newFiles[idx] = {
            ...newFiles[idx],
            ...updatedFile,
            content: updatedFile.content ?? newFiles[idx].content,
          };
        } else {
          newFiles.push(updatedFile);
        }

        if (nextSelected?.path === updatedFile.path) {
          nextSelected = {
            ...nextSelected,
            ...updatedFile,
            content: updatedFile.content ?? nextSelected.content,
          };
        }
      });

      setSelectedFile(nextSelected);
      return { ...prev, files: newFiles };
    });
  };

  const pollModificationStatus = (jobId, options = {}) => {
    const { autoApply = false, autoPreviewRetry = false } = options;
    const pollInterval = setInterval(async () => {
      try {
        const res = await api.get(`/projects/modify/status/${jobId}`);
        const {
          status,
          message,
          updated_files,
          proposal,
          requires_confirmation,
          error: jobError
        } = res.data;

        if (status === 'running') {
          setAgentStep("Applying changes", message || "Updating files and validating.", "running");
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
          setChatMessages(prev => prev.filter(m => m.metadata?.status !== 'thinking'));
          if (requires_confirmation && autoApply) {
            setModifying(true);
            setAgentStep("Auto-apply fixes", "Applying changes to continue preview.", "running");
            try {
              const applyRes = await api.post(`/projects/modify/apply/${jobId}`);
              const appliedFiles = applyRes.data?.updated_files || [];

              addChatMessage(
                `✅ ${applyRes.data?.message || 'Modifications applied successfully!'}`,
                'agent',
                'success'
              );
              setAgentStep("Changes applied", applyRes.data?.message || "Modifications applied successfully.", "success");
              setModifying(false);

              setProposalJobId(null);
              setProposalSummary("");
              setProposalNotes([]);

              if (appliedFiles.length > 0) {
                setDiffData(appliedFiles);
                setDiffMode("applied");
                setShowDiff(true);
                applyUpdatedFilesToState(appliedFiles);
                setIsTyping(true);
                setTimeout(() => setIsTyping(false), 1000);
              }

              fetchProject();

              if (autoPreviewRetry) {
                schedulePreviewRetry();
              }
            } catch (applyErr) {
              setModifying(false);
              addChatMessage(
                `❌ Error: ${applyErr?.response?.data?.detail || 'Failed to auto-apply changes.'}`,
                'agent',
                'error'
              );
              setAgentStep("Auto-apply failed", "Failed to apply changes automatically.", "error");
            }
            return;
          }
          if (requires_confirmation) {
            const proposedFiles = proposal?.updated_files || updated_files || [];
            addChatMessage(
              `✅ ${message || 'Proposal ready. Review and apply to continue.'}`,
              'agent',
              'success'
            );
            setAgentStep("Review required", message || "A proposal is ready for your approval.", "running");

            if (proposedFiles.length > 0) {
              setProposalJobId(jobId);
              setProposalSummary(proposal?.summary || "");
              setProposalNotes(Array.isArray(proposal?.notes) ? proposal.notes : []);
              setDiffData(proposedFiles);
              setDiffMode("proposal");
              setShowDiff(true);
            }
            return;
          }

          addChatMessage(`✅ ${message || 'Modifications applied successfully!'}`, 'agent', 'success');

          setAgentStep("Changes applied", message || "Modifications applied successfully.", "success");

          if (updated_files && updated_files.length > 0) {
            setDiffData(updated_files);
            setDiffMode("applied");
            setShowDiff(true);

            applyUpdatedFilesToState(updated_files);
            setIsTyping(true);
            setTimeout(() => setIsTyping(false), 1000);
          }

          fetchProject();

          if (autoPreviewRetry) {
            schedulePreviewRetry();
          }
        }

        if (status === 'error') {
          clearInterval(pollInterval);
          setModifying(false);
          setChatMessages(prev => prev.filter(m => m.metadata?.status !== 'thinking'));
          addChatMessage(`❌ Error: ${jobError || 'Modification failed'}`, 'agent', 'error');
          setAgentStep("Change failed", jobError || "Modification failed.", "error");
        }
      } catch (err) {
        clearInterval(pollInterval);
        setModifying(false);
        setChatMessages(prev => prev.filter(m => m.metadata?.status !== 'thinking'));
        setAgentStep("Change failed", "Connection lost while applying changes.", "error");
      }
    }, 2000);

    setTimeout(() => {
      clearInterval(pollInterval);
      if (modifying) {
        setModifying(false);
        addChatMessage('⏱️ Request timed out. Please try again.', 'agent', 'error');
        setAgentStep("Change timed out", "The request took too long.", "error");
      }
    }, 120000);
  };

  const handleApplyProposal = async () => {
    if (!proposalJobId || applyingProposal) return;
    setApplyingProposal(true);
    setError("");
    setAgentStep("Applying proposed changes", "Applying approved modifications.", "running");
    addChatMessage("Applying approved changes...", "agent", "thinking");

    try {
      const res = await api.post(`/projects/modify/apply/${proposalJobId}`);
      const updatedFiles = res.data?.updated_files || [];

      setChatMessages(prev => prev.filter(m => m.metadata?.status !== 'thinking'));
      addChatMessage(
        `✅ ${res.data?.message || 'Modifications applied successfully!'}`,
        'agent',
        'success'
      );
      setAgentStep("Changes applied", res.data?.message || "Modifications applied successfully.", "success");

      setProposalJobId(null);
      setProposalSummary("");
      setProposalNotes([]);

      if (updatedFiles.length > 0) {
        setDiffData(updatedFiles);
        setDiffMode("applied");
        setShowDiff(true);
        applyUpdatedFilesToState(updatedFiles);
        setIsTyping(true);
        setTimeout(() => setIsTyping(false), 1000);
      }
    } catch (err) {
      setChatMessages(prev => prev.filter(m => m.metadata?.status !== 'thinking'));
      addChatMessage(
        `❌ Error: ${err?.response?.data?.detail || 'Failed to apply changes.'}`,
        'agent',
        'error'
      );
      setAgentStep("Apply failed", err?.response?.data?.detail || "Failed to apply changes.", "error");
    } finally {
      setApplyingProposal(false);
    }
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


  const handlePreview = async (options = {}) => {
    const { auto = false } = options;
    if (!projectId) return;

    if (!auto) {
      previewRetryRef.current.attempts = 0;
      previewRetryRef.current.pending = false;
      previewFixAttemptsRef.current = 0;
    }

    if (auto && previewRetryRef.current.attempts >= previewRetryRef.current.max) {
      setAgentStep("Preview attempts reached", "Please review build logs before retrying.", "error");
      return;
    }

    previewRetryRef.current.attempts += 1;

    // UI: open Agent tab + show loading
    setActiveTab("chat");
    setPreviewLoading(true);
    setError("");

    resetAgentActivity();
    setAgentStep("Starting preview", "Starting build on deployment server. Please wait.", "running");
    setAgentCommand("");
    setAgentOutput("");

    addChatMessage("Preview: starting build on deployment server...", "agent");
    upsertAgentLog("preview-log", "```bash\nstarting preview...\n```");

    // cleanup old poll
    if (previewPollRef.current) clearInterval(previewPollRef.current);

    try {
      // Start preview (backend currently returns { url, ... } in your codebase)
      const res = await api.post(`/projects/${projectId}/preview`);
      const { url, status_url, log_url, preview_id } = res.data || {};
      const fullUrl = resolvePreviewUrl(url);

      if (!preview_id) {
        setPreviewLoading(false);
        addChatMessage("Preview start failed: missing preview id.", "agent", "error");
        setAgentStep("Preview failed", "Missing preview id from server.", "error");
        return;
      }

      if (!fullUrl) {
        setPreviewLoading(false);
        addChatMessage("❌ Preview start failed: backend returned no url", "agent", "error");
        return;
      }

      setPreviewJob(preview_id ? { id: preview_id, statusUrl: status_url, logUrl: log_url } : null);
      previewStartedAtRef.current = Date.now();

      try {
        const buildRes = await api.post(`/projects/preview/${preview_id}/build`);
        if (buildRes?.data?.ok === false) {
          setPreviewLoading(false);
          addChatMessage(
            `Preview build failed: ${buildRes?.data?.error || "unknown error"}`,
            "agent",
            "error"
          );
          return;
        }
      } catch (buildErr) {
        setPreviewLoading(false);
        addChatMessage(
          `Preview build failed: ${buildErr?.response?.data?.detail || "unknown error"}`,
          "agent",
          "error"
        );
        return;
      }

      // If backend has no testing-agent endpoints yet -> just open preview
      if (!status_url || !log_url) {
        upsertAgentLog("preview-log", "```bash\nno build agent endpoints; opening preview...\n```");
        setPreviewUrl(fullUrl);
        setPreviewOpen(true);
        setPreviewLoading(false);
        setPreviewJob(null);
        addChatMessage("✅ Preview gestart.", "agent", "success");
        return;
      }

      const statusPath = toApiPath(status_url);
      const logPath = toApiPath(log_url);
      if (!statusPath || !logPath) {
        setPreviewLoading(false);
        setPreviewJob(null);
        addChatMessage("❌ Preview polling failed: invalid status/log url.", "agent", "error");
        return;
      }

      let lastLog = "";
      let fixAttempted = false;

      // poll logs + status (CLI-like tail)
      previewPollRef.current = setInterval(async () => {
        try {
          const [st, lg] = await Promise.all([
            api.get(statusPath),
            api.get(logPath, { responseType: "text" }),
          ]);

          const status = st.data?.status;
          const err = st.data?.error || null;
          const serveRoot = st.data?.serve_root || null;

          const logText = (typeof lg.data === "string" ? lg.data : "") || "";
          if (logText && logText !== lastLog) {
            lastLog = logText;
            upsertAgentLog("preview-log", "```bash\n" + logText.slice(-12000) + "\n```");
          }

          const startedAt = previewStartedAtRef.current || Date.now();
          if (Date.now() - startedAt > PREVIEW_POLL_TIMEOUT_MS) {
            clearInterval(previewPollRef.current);
            previewPollRef.current = null;
            setPreviewLoading(false);
            setPreviewJob(null);
            addChatMessage("⏱️ Preview build timed out.", "agent", "error");
            try { await api.post(`/projects/preview/${preview_id}/cancel`); } catch {}
            return;
          }

          if (status === "ready") {
            clearInterval(previewPollRef.current);
            previewPollRef.current = null;

            setPreviewUrl(fullUrl);
            setPreviewOpen(true);
            setPreviewLoading(false);
            setPreviewJob(null);

            addChatMessage(
                `✅ Build ok (${serveRoot || "output"}). Preview gestart.`,
                "agent",
                "success"
            );
            return;
          }

          if (status === "failed") {
            clearInterval(previewPollRef.current);
            previewPollRef.current = null;

            setPreviewLoading(false);
            setPreviewJob(null);
            addChatMessage(`❌ Build failed. Error: ${err || "unknown"}`, "agent", "error");

            // auto-fix loop: 1x via bestaande modify endpoint (OpenAI)
            if (!fixAttempted) {
              fixAttempted = true;

              setModifying(true);
              addChatMessage("🛠️ Auto-fix: sending build error + logs to AI…", "agent", "thinking");

              const fixRes = await api.post(`/projects/${projectId}/modify`, {
                instruction:
                    "Fix this project so it can be built and previewed as a web app. " +
                    "Use the build logs below. Make minimal changes. Ensure Vite/React preview works.\n\n" +
                    "BUILD LOGS:\n" +
                    logText.slice(-12000),
                context: {
                  project_type: project?.project_type,
                  current_file: selectedFile?.path,
                },
              });

              pollModificationStatus(fixRes.data.job_id);
              addChatMessage(
                  "🔁 Auto-fix submitted. Wanneer klaar: klik Preview opnieuw om opnieuw te builden.",
                  "agent"
                );
            }
          }

          if (status === "cancelled") {
            clearInterval(previewPollRef.current);
            previewPollRef.current = null;
            setPreviewLoading(false);
            setPreviewJob(null);
            addChatMessage("🛑 Preview build cancelled.", "agent");
          }
        } catch (e) {
          clearInterval(previewPollRef.current);
          previewPollRef.current = null;

          setPreviewLoading(false);
          setPreviewJob(null);
          addChatMessage("❌ Preview polling failed (status/log).", "agent", "error");
        }
      }, 1000);
    } catch (e) {
      setPreviewLoading(false);
      setPreviewJob(null);
      addChatMessage(
          `❌ Preview start failed: ${e?.response?.data?.detail || "unknown error"}`,
          "agent",
          "error"
      );
    }
  };

  const handleCancelPreview = async () => {
    if (!previewJob?.id) return;
    if (previewPollRef.current) {
      clearInterval(previewPollRef.current);
      previewPollRef.current = null;
    }
    setPreviewLoading(false);
    setPreviewJob(null);
    try {
      await api.post(`/projects/preview/${previewJob.id}/cancel`);
      addChatMessage("🛑 Preview build cancelled.", "agent");
    } catch (err) {
      addChatMessage("⚠️ Failed to cancel preview build.", "agent", "error");
    }
  };

  const handleSecurityScan = async () => {
    const targetId = project?.id || projectId;
    if (!targetId) {
      setError("Save or load a project before running a security scan.");
      return;
    }

    if (securityScanning) return;

    setSecurityScanning(true);
    setError("");
    try {
      const res = await api.post(`/projects/${targetId}/security/scan`);
      const payload = res?.data || {};
      setSecurityFindings(payload.findings || []);
      setSecurityStats(payload.stats || null);
      setSecurityScanRan(true);
    } catch (err) {
      setError(err?.response?.data?.detail || "Security scan failed.");
    } finally {
      setSecurityScanning(false);
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
    if (!selectedFile || !projectId) return;
    const path = selectedFile.path;
    const hasDraft = Object.prototype.hasOwnProperty.call(editorDrafts, path);
    const content = hasDraft ? editorDrafts[path] : (selectedFile.content || "");
    if (content === (selectedFile.content || "")) return;

    setEditorSaving(true);
    setError("");
    try {
      const res = await api.post(`/projects/${projectId}/files`, {
        path,
        content,
        language: selectedFile.language,
      });
      const saved = res.data;
      setProject((prev) => {
        if (!prev) return prev;
        const files = [...(prev.files || [])];
        const idx = files.findIndex((f) => f.path === saved.path);
        if (idx >= 0) {
          files[idx] = { ...files[idx], content: saved.content, language: saved.language };
        } else {
          files.push(saved);
        }
        return { ...prev, files };
      });
      setSelectedFile((prev) => {
        if (!prev || prev.path !== saved.path) return prev;
        return { ...prev, content: saved.content, language: saved.language };
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
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-lg font-bold text-white flex items-center gap-2">
                    {project.name}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      project.project_type === 'fullstack' ? 'bg-violet-500/20 text-violet-400' :
                      project.project_type === 'frontend' ? 'bg-cyan-500/20 text-cyan-400' :
                      project.project_type === 'backend' ? 'bg-green-500/20 text-green-400' :
                      'bg-gray-500/20 text-gray-400'
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
                >
                  {previewLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <MonitorPlay className="w-4 h-4 mr-2" />
                  )}
                  Preview
                </Button>
                {previewLoading && previewJob?.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelPreview}
                    className="glass-card border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="glass-card border-white/10 text-white hover:bg-white/5"
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
          {/* Left: File tree */}
          <div className="w-60 border-r border-white/5 bg-[#0a0f1a] flex-shrink-0 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-white">
                <Folder className="w-4 h-4 text-cyan-400" />
                Files
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

          {/* Center: Code editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedFile ? (
              <CodeEditor
                file={selectedFile}
                value={getEditorValue()}
                onChange={handleEditorChange}
                onSave={handleSaveFile}
                isDirty={isEditorDirty()}
                isSaving={editorSaving}
                readOnly={isTyping && currentTypingFile?.path === selectedFile.path}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <FileCode className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Select a file to view</p>
                </div>
              </div>
            )}
          </div>

          {/* Right: Chat & Info */}
          <div className="w-80 border-l border-white/5 bg-[#0a0f1a] flex-shrink-0 flex flex-col overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
              <TabsList className="grid grid-cols-3 m-2 bg-black/40">
                <TabsTrigger value="chat" className="text-xs">Agent</TabsTrigger>
                <TabsTrigger value="security" className="text-xs">Security</TabsTrigger>
                <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
              </TabsList>

              <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden mt-0 px-2 pb-2">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto space-y-3 p-2">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm mb-2">Ask me to modify your code!</p>
                      <p className="text-xs text-gray-600">E.g., "Add dark mode" or "Fix the login"</p>
                    </div>
                  ) : (
                    chatMessages.map((msg, i) => (
                      <ChatMessage
                        key={i}
                        message={msg}
                        isUser={msg.metadata?.role === 'user' || msg.role === 'user'}
                        isThinking={msg.metadata?.status === 'thinking'}
                      />
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input */}
                <div className="border-t border-white/5 pt-2 mt-2">
                  <Textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    placeholder="Ask for changes..."
                    className="min-h-[60px] max-h-[100px] bg-black/40 border-white/10 text-white text-sm placeholder:text-gray-500 resize-none mb-2"
                    disabled={modifying}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {modifying ? (
                        <span className="flex items-center gap-1 text-cyan-400">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          AI working...
                        </span>
                      ) : 'Enter to send'}
                    </span>
                    <Button
                      onClick={handleSendChat}
                      disabled={modifying || !chatInput.trim()}
                      size="sm"
                      className="btn-primary h-8"
                    >
                      {modifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="security" className="flex-1 overflow-y-auto mt-0">
                <div className="flex flex-1 flex-col gap-3 px-3 py-2">
                  <div className="rounded-2xl border border-white/5 bg-gradient-to-br from-[#050910] to-[#03060c] p-4 space-y-3">
                    <div className="text-xs text-gray-400">
                      {securityStats
                        ? `High: ${securityStats.high_severity || 0} • Medium: ${securityStats.medium_severity || 0} • Low: ${securityStats.low_severity || 0}`
                        : "Run a scan to check for security issues."
                      }
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSecurityScan}
                      disabled={securityScanning || !(project?.id || projectId)}
                      className="glass-card border-cyan-500/30 !justify-center gap-2 text-xs text-cyan-300 hover:bg-cyan-500/10"
                    >
                      {securityScanning ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Shield className="w-4 h-4 text-cyan-400" />
                      )}
                      {securityScanning ? "Scanning..." : "Run security scan"}
                    </Button>
                  </div>
                  <SecurityFindings findings={securityFindings} />
                </div>
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

          {/* Preview Panel */}
          {previewOpen && (
            <div className={`border-l border-white/5 bg-[#0a0f1a] flex flex-col ${
              previewFullscreen ? 'fixed inset-0 z-50' : 'w-[500px]'
            }`}>
              <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between bg-black/40">
                <span className="text-sm font-medium text-white flex items-center gap-2">
                  <MonitorPlay className="w-4 h-4 text-cyan-400" />
                  Live Preview
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPreviewFullscreen(!previewFullscreen)}
                    className="h-7 w-7 p-0 text-gray-400 hover:text-white"
                  >
                    {previewFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </Button>
                  {previewUrl && (
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-white"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPreviewOpen(false)}
                    className="h-7 w-7 p-0 text-gray-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 bg-white">
                {previewUrl ? (
                  <iframe
                    src={previewUrl}
                    className="w-full h-full border-0"
                    title="Project Preview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Diff Modal */}
        {showDiff && diffData && (
          <DiffViewer
            changes={diffData}
            mode={diffMode}
            onApply={diffMode === 'proposal' ? handleApplyProposal : null}
            applying={applyingProposal}
            summary={proposalSummary}
            notes={proposalNotes}
            onClose={() => setShowDiff(false)}
          />
        )}
      </div>
    );
  }

  // ==========================================
  // RENDER: CREATE MODE (chat-first workspace)
  // ==========================================
  return (
    <div className="min-h-screen bg-[#030712]">
      <Navbar />

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-8 md:space-y-10">
        <section className="rounded-3xl border border-white/10 bg-[#0a0f1a]/80 p-6 space-y-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span className="text-sm text-cyan-400 font-medium">AI Agent Ready</span>
            </div>
            <div>
              <h1 className="font-heading text-4xl font-bold text-white leading-tight">
                What would you like to build?
              </h1>
              <p className="text-gray-400 mt-2 text-lg max-w-3xl">
                Describe your project and watch the reasoning, coding, testing, and preview agents collaborate in a chat-first workspace.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500">Agent status</p>
                <p className="text-lg font-semibold text-white">
                  {statusText || jobStatus || "Waiting on your prompt..."}
                </p>
              </div>
              <span className="text-xs text-cyan-400">{jobStep || jobStatus}</span>
            </div>
            <Progress value={Math.min(progress, 100)} className="h-2 rounded-full mt-3" />
          </div>

          {pendingRecoveryJobId && (
            <div className="rounded-3xl border border-yellow-400/30 bg-[#1f1a10]/80 p-4 mb-5 space-y-3">
              <p className="text-sm text-yellow-200">
                A previous generation is still in progress ({pendingRecoveryStatus || "unknown"} / {pendingRecoveryStep || "pending"}). You can resume it or discard it before creating a new project.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleResumePendingGeneration} className="btn-primary">
                  Resume previous run
                </Button>
                <Button size="sm" variant="ghost" onClick={discardPendingGeneration}>
                  Discard draft
                </Button>
              </div>
            </div>
          )}
          {showTemplates ? (
            <TemplateSelector
              onSelect={handleTemplateSelect}
              onClose={() => setShowTemplates(false)}
            />
          ) : (
            <div className="space-y-5">
              {selectedTemplate && (
                <div className="glass-card p-4 rounded-2xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-white font-medium">{selectedTemplate.name}</p>
                      <p className="text-gray-500 text-sm">Template selected</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedTemplate(null); setPrompt(''); }}>
                    Clear
                  </Button>
                </div>
              )}
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <ProjectTypeSelector selected={projectType} onSelect={setProjectType} disabled={loading} />
                <Button
                  variant="outline"
                  className="w-full md:w-auto glass-card border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
                  onClick={() => setShowTemplates(true)}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Templates
                </Button>
              </div>
              <div className="space-y-3">
                {!prompt && <PromptSuggestions onSelect={setPrompt} projectType={projectType} />}
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="E.g., Build a SaaS dashboard with auth, billing, and analytics..."
                  className="min-h-[200px] bg-black/40 border-white/10 text-white placeholder:text-gray-500 resize-none text-base"
                  disabled={loading}
                />
                {error && (
                  <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-300" />
                    <div>
                      <p className="font-semibold">Generation failed</p>
                      <p className="text-xs text-red-100 mt-1">{error}</p>
                    </div>
                  </div>
                )}
              </div>
              <Button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                className="w-full bg-gradient-to-br from-cyan-500 to-violet-500 text-lg text-white py-4 rounded-2xl"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Wand2 className="w-5 h-5" />
                    Generate Project
                  </span>
                )}
              </Button>
              {clarifyQuestions.length > 0 && (
                <div ref={clarifyRef} className="mt-4">
                  <ClarifyDialog
                    questions={clarifyQuestions}
                    answers={clarifyAnswers}
                    onAnswerChange={(key, value) => setClarifyAnswers((prev) => ({ ...prev, [key]: value }))}
                    onSubmit={submitClarify}
                    isSubmitting={loading}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="relative">
            <div className="rounded-3xl p-[1px] bg-gradient-to-r from-[#ff4aa8] via-[#ff69a8] to-[#ff2299] shadow-[0_0_25px_rgba(255,26,123,0.65)]">
              <div className="rounded-3xl border border-white/10 bg-[#0b1220]/80 p-6 space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Reasoning Plan</p>
                <h2 className="text-2xl font-semibold text-white">
                  {planSummary || "Awaiting the reasoning agent's plan..."}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {planReviewPending && !planConfirmed && (
                  <Button size="sm" onClick={confirmPlan} disabled={planConfirming || planConfirmed}>
                    {planConfirming ? "Confirming..." : planConfirmed ? "Plan confirmed" : "Confirm plan"}
                  </Button>
                )}
                {planConfirmed && <span className="text-xs text-emerald-400">Plan accepted</span>}
              </div>
            </div>
            {planSummary && (
              <p className="text-sm text-gray-300 max-w-3xl">
                {planSummary}
              </p>
            )}
            {planMessageSections.length > 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-3 max-h-[280px] overflow-y-auto">
                {planMessageSections.map((section, index) => (
                  <p
                    key={`plan-msg-${index}`}
                    className="text-sm text-gray-100 leading-relaxed whitespace-pre-line"
                  >
                    {section}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                The reasoning agent is still drafting the PRD and user problem statement.
              </p>
            )}
            {planInteractionEnabled && (
              <div className="rounded-2xl border border-white/10 bg-[#090d16]/70 p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-white">Need to adjust the plan?</p>
                  <p className="text-xs text-gray-400">
                    Drop a quick note and we’ll log it in the agent chat before you confirm the next step.
                  </p>
                </div>
                <Textarea
                  value={planFeedback}
                  onChange={(e) => setPlanFeedback(e.target.value)}
                  placeholder="Share feedback or ask a question about the plan..."
                  className="min-h-[80px] max-h-[120px] resize-none bg-black/40 border-white/10 text-white text-sm placeholder:text-gray-500"
                  disabled={planFeedbackSending}
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-xs text-gray-400">
                    Messages appear in the agent chat below for traceability.
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={confirmPlan}
                      disabled={planConfirming || planConfirmed}
                      className="btn-secondary h-9"
                    >
                      {planConfirming ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Confirming plan
                        </span>
                      ) : (
                        "Accept plan & start generation"
                      )}
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSendPlanFeedback}
                      disabled={planFeedbackSending || !planFeedback.trim()}
                      className="btn-primary h-9"
                    >
                      {planFeedbackSending ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Sending...
                        </span>
                      ) : (
                        "Send note"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {planReadyAt && (
              <p className="text-xs text-gray-500">
                Plan ready at {new Date(planReadyAt).toLocaleTimeString()}
              </p>
            )}
            {securityFindings.length > 0 && (
              <div className="rounded-2xl border border-cyan-500/30 bg-black/40 p-4">
                <h4 className="text-sm font-semibold text-white mb-2">Security snapshot</h4>
                <SecurityFindings findings={securityFindings} />
              </div>
            )}
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-[#080d18]/80 p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-white">Agent Timeline</h3>
              <span className="text-xs text-gray-400">Progress: {Math.min(progress, 100)}%</span>
            </div>
            <AgentTimelinePanel steps={timeline} progressSteps={progressSteps} />
          </div>
        </section>

          {!(planReviewPending && !planConfirmed) && (
            <section className="rounded-3xl border border-white/10 bg-[#05090f]/80 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Agent Chat</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{chatMessages.length} messages</span>
              {currentJobId && (
                <Button size="sm" variant="outline" onClick={handleRefreshStatus}>
                  Refresh
                </Button>
              )}
            </div>
          </div>
          <div ref={chatScrollRef} className="max-h-[340px] w-full space-y-3 overflow-y-auto pr-1">
            {chatMessages.length === 0 ? (
              <p className="text-sm text-gray-500">The conversation will appear here once the agent engages.</p>
            ) : (
              chatMessages.map((msg, idx) => (
                <ChatMessage
                  key={`${msg.timestamp}-${idx}`}
                  message={msg}
                  isUser={msg.metadata?.role === 'user' || msg.role === 'user'}
                  isThinking={msg.metadata?.status === 'thinking'}
                />
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          {planInteractionEnabled && (
            <div className="mt-4 border-t border-white/10 pt-4 space-y-2">
              <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Reasoning Agent Reply</p>
              <Textarea
                value={agentChatInput}
                onChange={(e) => setAgentChatInput(e.target.value)}
                placeholder="Approve the plan or suggest changes..."
                className="min-h-[80px] max-h-[140px] resize-none bg-black/40 border-white/10 text-white text-sm placeholder:text-gray-500"
                disabled={agentChatSending}
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">
                  Your note is logged before the code agent starts.
                </span>
                <Button
                  size="sm"
                  onClick={handleSendAgentChat}
                  disabled={agentChatSending || !agentChatInput.trim()}
                  className="btn-primary h-9"
                >
                  {agentChatSending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Sending...
                    </span>
                  ) : (
                    "Send to agent"
                  )}
                </Button>
              </div>
            </div>
          )}
          </section>
          )}

        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-[#0a0f1a]/80 p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">Final Reasoning</h3>
              {!finalConfirmed && jobStatus === 'review_pending' && (
                <Button size="sm" onClick={confirmFinalReview} disabled={finalConfirming}>
                  {finalConfirming ? 'Confirming...' : 'Confirm final review'}
                </Button>
              )}
              {finalConfirmed && (
                <span className="text-xs text-emerald-400">Final review confirmed</span>
              )}
            </div>
            {finalReasoningData ? (
              <div className="space-y-3 text-sm text-gray-300">
                <p>{finalReasoningData.final_summary}</p>
                {finalReasoningData.issues?.length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-gray-400 space-y-1">
                    {finalReasoningData.issues.map((issue, index) => (
                      <li key={`issue-${index}`}>{issue}</li>
                    ))}
                  </ul>
                )}
                {finalReasoningData.next_steps?.length > 0 && (
                  <div className="text-xs text-gray-400">
                    <p className="font-semibold text-white mb-1">Next steps:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {finalReasoningData.next_steps.map((stepText, idx) => (
                        <li key={`next-${idx}`}>{stepText}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {finalReasoningData.checks?.length > 0 && (
                  <div className="text-xs text-gray-400">
                    <p className="font-semibold text-white mb-1">Checks:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {finalReasoningData.checks.map((check, idx) => (
                        <li key={`check-${idx}`}>{check}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {typeof finalReasoningData.ready_for_release === 'boolean' && (
                  <p className="text-xs text-gray-500">
                    Ready for release?{' '}
                    <span className="font-semibold text-cyan-400">
                      {finalReasoningData.ready_for_release ? 'Yes' : 'No'}
                    </span>
                  </p>
                )}
                {buildResult && (
                  <p className="text-xs text-gray-500">
                    Build status: {buildResult.status || 'pending'}{buildResult.error ? ` - ${buildResult.error}` : ''}
                  </p>
                )}
              </div>
            ) : finalReasoningMessage ? (
              <pre className="rounded-2xl border border-white/10 bg-black/40 p-3 text-xs text-gray-300">
                {finalReasoningMessage}
              </pre>
            ) : (
              <p className="text-sm text-gray-500">Final reasoning will appear once the preview evaluation finishes.</p>
            )}
          </div>
          <div className="rounded-3xl border border-white/10 bg-[#0a0f1a]/80 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Preview / Build</p>
                <p className="text-lg font-semibold text-white">
                  {buildResult?.status || 'Waiting for preview'}
                </p>
              </div>
              {previewUrl && (
                <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
                  Open preview
                </Button>
              )}
            </div>
            <p className="text-sm text-gray-400">
              {buildResult?.error
                ? `Error: ${buildResult.error}`
                : previewUrl
                  ? 'Preview ready. Click the button to open it.'
                  : 'Preview will be built once the agent finishes coding.'
              }
            </p>
            {previewUrl && (
              <div className="rounded-2xl border border-white/10 bg-black/40 p-3 text-xs text-gray-400 truncate">
                {previewUrl}
              </div>
            )}
            {previewLoading && (
              <p className="text-xs text-amber-300">Preview build in progress... this may take a minute.</p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-[#05090f]/80 p-6">
          <h3 className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-4">Tips for Better Results</h3>
          <div className="grid gap-3 sm:grid-cols-2 text-sm text-gray-400">
            <p className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-cyan-500 mt-0.5" />Be specific about features and functionality.</p>
            <p className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-cyan-500 mt-0.5" />Mention preferred tech stack if you have one.</p>
            <p className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-cyan-500 mt-0.5" />Include authentication requirements.</p>
            <p className="flex items-start gap-2"><ChevronRight className="w-4 h-4 text-cyan-500 mt-0.5" />Describe the UI/UX you envision.</p>
          </div>
        </section>
      </main>

      {previewOpen && (
        <div className={`border-l border-white/5 bg-[#0a0f1a] flex flex-col ${previewFullscreen ? 'fixed inset-0 z-50' : 'w-[500px]'}`}>
          <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between bg-black/40">
            <span className="text-sm font-medium text-white flex items-center gap-2">
              <MonitorPlay className="w-4 h-4 text-cyan-400" />
              Live Preview
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPreviewFullscreen((prev) => !prev)}
                className="h-7 w-7 p-0 text-gray-400 hover:text-white"
              >
                {previewFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </Button>
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-white"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPreviewOpen(false)}
                className="h-7 w-7 p-0 text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 bg-white">
            {previewUrl ? (
              <iframe
                src={previewUrl}
                className="w-full h-full border-0"
                title="Project Preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            )}
          </div>
        </div>
      )}

      {showDiff && diffData && (
        <DiffViewer
          changes={diffData}
          mode={diffMode}
          onApply={diffMode === 'proposal' ? handleApplyProposal : null}
          applying={applyingProposal}
          summary={proposalSummary}
          notes={proposalNotes}
          onClose={() => setShowDiff(false)}
        />
      )}
    </div>
  );
}
