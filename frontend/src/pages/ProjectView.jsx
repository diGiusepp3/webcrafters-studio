// frontend/src/pages/ProjectView.jsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api from "@/api";

import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { CodePreview } from "@/components/CodePreview";
import { FileTree } from "@/components/FileTree";

import {
  Download,
  ArrowLeft,
  Loader2,
  AlertCircle,
  FileCode,
  Calendar,
  Folder,
  ChevronLeft,
} from "lucide-react";

const DISABLED_FILES = new Set(["ProjectView.jsx"]);

export default function ProjectView() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [downloading, setDownloading] = useState(false);

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

  const [previewing, setPreviewing] = useState(false);



  const handlePreview = async () => {
    if (!project) return;

    setPreviewing(true);
    setError("");

    try {
      const res = await api.post(`/projects/${id}/preview`);
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError("Preview starten mislukt.");
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

  if (error || !project) {
    return (
        <div className="min-h-screen bg-[#030712]">
          <Navbar />
          <div className="max-w-4xl mx-auto px-6 py-12">
            <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
              <AlertCircle className="w-5 h-5" />
              {error || "Project not found"}
            </div>
            <Link to="/dashboard" className="mt-4 inline-block">
              <Button variant="ghost" className="text-gray-400 hover:text-white">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>
    );
  }

  return (
      <div className="min-h-screen bg-[#030712] flex flex-col">
        <Navbar />

        <div className="border-b border-white/5 bg-black/40">
          <div className="max-w-screen-2xl mx-auto px-6 py-4 flex justify-between">
            <div className="flex items-center gap-4">
              <button
                  onClick={() => navigate("/dashboard")}
                  className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white"
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

              {project.type === "web" && (
                  <Button
                      variant="outline"
                      onClick={handlePreview}
                      disabled={previewing}
                      className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                  >
                    {previewing ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <FileCode className="w-4 h-4 mr-2" />
                    )}
                    Preview
                  </Button>
              )}

              <Button onClick={handleDownload} disabled={downloading}>
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

        <div className="flex flex-1 overflow-hidden">
          <div className="w-64 border-r border-white/5 bg-[#0f172a]">
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
      </div>
  );
}
