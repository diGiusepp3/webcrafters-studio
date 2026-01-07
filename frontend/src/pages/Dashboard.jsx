import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Navbar } from '../components/Navbar';
import { 
  Plus, Folder, Calendar, FileCode, Trash2, Download, Eye, 
  Loader2, AlertCircle, Sparkles 
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await axios.get(`${API}/projects`);
      setProjects(response.data);
    } catch (err) {
      setError('Failed to load projects');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    
    try {
      await axios.delete(`${API}/projects/${deleteId}`);
      setProjects(projects.filter(p => p.id !== deleteId));
      setDeleteId(null);
    } catch (err) {
      setError('Failed to delete project');
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = async (projectId, projectName) => {
    try {
      const response = await axios.get(`${API}/projects/${projectId}/download`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${projectName.replace(/\s+/g, '_')}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download project');
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getProjectTypeColor = (type) => {
    const colors = {
      fullstack: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
      frontend: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      backend: 'bg-green-500/20 text-green-400 border-green-500/30',
      any: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    };
    return colors[type] || colors.any;
  };

  return (
    <div className="min-h-screen bg-[#030712]">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-heading text-3xl font-bold text-white" data-testid="dashboard-title">
              Your Projects
            </h1>
            <p className="text-gray-400 mt-1">
              Welcome back, {user?.name}! Here are your generated projects.
            </p>
          </div>
          
          <Link to="/generate">
            <Button className="bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition-all hover:shadow-[0_0_20px_rgba(6,182,212,0.6)]" data-testid="new-project-btn">
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </Link>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 mb-6" data-testid="dashboard-error">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <Card className="bg-black/40 backdrop-blur-xl border-white/10" data-testid="empty-state">
            <CardContent className="flex flex-col items-center justify-center py-20">
              <div className="w-20 h-20 rounded-2xl bg-cyan-500/10 flex items-center justify-center mb-6">
                <Sparkles className="w-10 h-10 text-cyan-400" />
              </div>
              <h3 className="font-heading text-xl font-bold text-white mb-2">No Projects Yet</h3>
              <p className="text-gray-400 text-center max-w-md mb-6">
                Start building by describing your first app. Our AI will generate complete, production-ready code for you.
              </p>
              <Link to="/generate">
                <Button className="bg-cyan-500 text-black font-bold hover:bg-cyan-400">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Project
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="projects-grid">
            {projects.map((project) => (
              <Card 
                key={project.id} 
                className="bg-black/40 backdrop-blur-xl border-white/10 hover:border-cyan-500/30 transition-all group"
                data-testid={`project-card-${project.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                        <Folder className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div>
                        <CardTitle className="font-heading text-lg text-white line-clamp-1">
                          {project.name}
                        </CardTitle>
                        <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border ${getProjectTypeColor(project.project_type)}`}>
                          {project.project_type}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <CardDescription className="text-gray-400 line-clamp-2 mb-4 min-h-[40px]">
                    {project.description}
                  </CardDescription>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <FileCode className="w-4 h-4" />
                      {project.file_count} files
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {formatDate(project.created_at)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/project/${project.id}`)}
                      className="flex-1 border-white/10 text-gray-300 hover:text-white hover:bg-white/5"
                      data-testid={`view-project-${project.id}`}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(project.id, project.name)}
                      className="flex-1 border-white/10 text-gray-300 hover:text-white hover:bg-white/5"
                      data-testid={`download-project-${project.id}`}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(project.id)}
                      className="text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                      data-testid={`delete-project-${project.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-[#0f172a] border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Project?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This action cannot be undone. The project and all its generated files will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 text-gray-300 hover:bg-white/5">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 text-white hover:bg-red-600"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
