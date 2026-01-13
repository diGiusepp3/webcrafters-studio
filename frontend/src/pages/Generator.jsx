// frontend/src/pages/Generator.jsx
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/api";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";

import {
  Sparkles,
  Loader2,
  Wand2,
  Code2,
  Layout,
  Server,
  Layers,
  AlertCircle,
} from "lucide-react";

const projectTypes = [
  { id: "fullstack", name: "Full-Stack", icon: <Layers className="w-5 h-5" /> },
  { id: "frontend", name: "Frontend", icon: <Layout className="w-5 h-5" /> },
  { id: "backend", name: "Backend", icon: <Server className="w-5 h-5" /> },
  { id: "any", name: "Any", icon: <Code2 className="w-5 h-5" /> },
];

// Backend step → human readable
const STEP_LABELS = {
  queued: "Queued…",
  preflight: "Analyzing request…",
  clarifying: "Clarifying intent…",
  saving_generation: "Saving generation…",
  calling_openai: "Generating code…",
  patching_files: "Patching files…",
  validating: "Validating output…",
  saving_project: "Saving project…",
  completed: "Done ✔",
};

export default function Generator() {
  const [prompt, setPrompt] = useState("");
  const [projectType, setProjectType] = useState("fullstack");
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");

  // 🔹 Clarify state
  const [clarifyJobId, setClarifyJobId] = useState(null);
  const [clarifyQuestions, setClarifyQuestions] = useState([]);
  const [clarifyAnswers, setClarifyAnswers] = useState({});

  const navigate = useNavigate();
  const pollRef = useRef(null);

  const startPolling = (jobId) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/generate/status/${jobId}`);
        const { status, step, project_id, questions, error } = res.data;

        // 🔹 Clarify detected
        if (status === "clarify") {
          clearInterval(pollRef.current);
          setLoading(false);
          setClarifyJobId(jobId);
          setClarifyQuestions(questions || []);
          setStatusText("Clarification required");
          return;
        }

        if (status === "queued" || status === "running") {
          setStatusText(STEP_LABELS[step] || "Working…");
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
              typeof error === "string"
                  ? error
                  : JSON.stringify(error, null, 2)
          );
        }
      } catch (e) {
        clearInterval(pollRef.current);
        setLoading(false);
        setStatusText("");
        setError("Polling mislukt.");
      }
    }, 1500);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setError("");
    setClarifyJobId(null);
    setClarifyQuestions([]);
    setClarifyAnswers({});
    setStatusText("Connecting…");
    setLoading(true);

    const res = await api.post("/generate", {
      prompt,
      project_type: projectType,
    });

    startPolling(res.data.job_id);
  };

  const submitClarify = async () => {
    setLoading(true);
    setStatusText("Resuming…");

    await api.post(
        `/generate/continue/${clarifyJobId}`,
        clarifyAnswers
    );

    setClarifyJobId(null);
    setClarifyQuestions([]);
    setClarifyAnswers({});

    startPolling(clarifyJobId);
  };

  return (
      <div className="min-h-screen bg-[#030712]">
        <Navbar />

        <div className="max-w-4xl mx-auto px-6 py-12">
          <Card className="bg-black/40 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-cyan-400" />
                AI Code Generator
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* 🔹 Clarify UI */}
              {clarifyJobId ? (
                  <>
                    <h3 className="text-cyan-400 font-semibold">
                      Clarification required
                    </h3>

                    {clarifyQuestions.map((q, i) => (
                        <Textarea
                            key={i}
                            placeholder={q}
                            className="bg-black/60 border-white/10 text-white"
                            onChange={(e) =>
                                setClarifyAnswers((a) => ({
                                  ...a,
                                  [q]: e.target.value,
                                }))
                            }
                        />
                    ))}

                    <Button onClick={submitClarify} disabled={loading}>
                      Continue
                    </Button>
                  </>
              ) : (
                  <>
                    {/* Project type selector */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {projectTypes.map((t) => (
                          <button
                              key={t.id}
                              type="button"
                              onClick={() => setProjectType(t.id)}
                              className={`p-4 rounded-lg border text-left ${
                                  projectType === t.id
                                      ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400"
                                      : "bg-black/30 border-white/10 text-gray-400"
                              }`}
                          >
                            {t.icon}
                            <div className="mt-2 text-sm">{t.name}</div>
                          </button>
                      ))}
                    </div>

                    <div>
                      <Label className="text-gray-300">Conversation</Label>
                      <Textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          placeholder="User: Beschrijf wat je wil maken..."
                          className="min-h-[260px] bg-black/60 border-white/10 text-white font-mono text-sm"
                      />
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 whitespace-pre-wrap">
                          <AlertCircle className="w-5 h-5 mt-0.5" />
                          <div>{error}</div>
                        </div>
                    )}

                    <Button
                        onClick={handleGenerate}
                        disabled={loading}
                        className="w-full bg-cyan-500 text-black font-bold py-6"
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
                  </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
  );
}
