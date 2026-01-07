import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Navbar } from '../components/Navbar';
import { CodePreview } from '../components/CodePreview';
import { 
  Download, ArrowLeft, Loader2, AlertCircle, FileCode, 
  Calendar, Folder, ChevronLeft, ChevronRight, ChevronDown, File, FolderOpen
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Simple flat file list instead of tree for now
function SimpleFileList({ files, onSelect, selectedPath }) {
  if (!files || files.length === 0) {
    return <div className="p-4 text-gray-500 text-sm">No files</div>;
  }
  
  return (
    <div className="py-2">
      {files.map((file, index) => (
        <div
          key={index}
          onClick={() => onSelect(file)}
          className={`flex items-center gap-2 px-4 py-2 cursor-pointer text-sm font-mono ${
            selectedPath === file.path 
              ? 'bg-cyan-500/20 text-cyan-400' 
              : 'text-gray-300 hover:bg-white/5'
          }`}
          data-testid={`file-item-${index}`}
        >
          <File className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">{file.path}</span>
        </div>
      ))}
    </div>
  );
}

export default function ProjectView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/projects/${id}`);
      setProject(response.data);
      if (response.data.files && response.data.files.length > 0) {
        setSelectedFile(response.data.files[0]);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Project not found');
      } else {
        setError('Failed to load project');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await axios.get(`${API}/projects/${id}/download`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${project.name.replace(/\s+/g, '_')}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download project');
    } finally {
      setDownloading(false);
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

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
          <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400" data-testid="project-error">
            <AlertCircle className="w-5 h-5" />
            {error || 'Project not found'}
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
        <div className="max-w-screen-2xl mx-auto px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                data-testid="back-btn"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="font-heading text-xl font-bold text-white" data-testid="project-title">
                  {project.name}
                </h1>
                <p className="text-gray-400 text-sm">{project.description}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <FileCode className="w-4 h-4" />
                  {project.files?.length || 0} files
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(project.created_at)}
                </span>
              </div>
              
              <Button
                onClick={handleDownload}
                disabled={downloading}
                className="bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition-all hover:shadow-[0_0_20px_rgba(6,182,212,0.6)]"
                data-testid="download-btn"
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

      <div className="flex-1 flex overflow-hidden" data-testid="project-ide">
        <div className="w-64 lg:w-72 border-r border-white/5 bg-[#0f172a] flex flex-col">
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <Folder className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium text-gray-300">Files</span>
            <span className="text-xs text-gray-500 ml-auto">{project.files?.length || 0}</span>
          </div>
          <div className="flex-1 overflow-auto">
            <SimpleFileList 
              files={project.files || []} 
              onSelect={setSelectedFile}
              selectedPath={selectedFile?.path}
            />
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-[#1e1e1e]">
          <CodePreview file={selectedFile} />
        </div>
      </div>
    </div>
  );
}
