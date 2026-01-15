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
  const [prompt, setPrompt] = useState("");
  const [projectType, setProjectType] = useState("fullstack");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");

  // Enhanced: Timeline and chat state
  const [timeline, setTimeline] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [securityFindings, setSecurityFindings] = useState([]);
  const [currentJobId, setCurrentJobId] = useState(null);

  // Clarify state
  const [clarifyJobId, setClarifyJobId] = useState(null);
  const [clarifyQuestions, setClarifyQuestions] = useState([]);
  const [clarifyAnswers, setClarifyAnswers] = useState({});

  const navigate = useNavigate();
  const pollRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

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

        // Update enhanced state
        if (jobTimeline) setTimeline(jobTimeline);
        if (jobChatMessages) setChatMessages(jobChatMessages);
        if (jobSecurityFindings) setSecurityFindings(jobSecurityFindings);

        // Clarify detected
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
          navigate(`/project/${project_id}`);
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

  // Show the working panel when we have timeline or chat
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
