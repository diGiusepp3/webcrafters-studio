import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '@/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Navbar } from '@/components/Navbar';
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
} from '@/components/ui/alert-dialog';


const normalizeError = (err, fallback = 'Something went wrong') =>
    err?.response?.data?.message ||
    err?.message ||
    fallback;

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;

    if (user) {
      fetchProjects();
    } else {
      setLoading(false);
      setProjects([]);
    }
  }, [authLoading, user]);


  const fetchProjects = async () => {
    try {
      const response = await api.get('/projects');
      setProjects(response.data);
    } catch (err) {
      setError(normalizeError(err, 'Failed to load projects'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);

    try {
      await api.delete(`/projects/${deleteId}`);
      setProjects(prev => prev.filter(p => p.id !== deleteId));
      setDeleteId(null);
    } catch (err) {
      setError(normalizeError(err, 'Failed to delete project'));
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = async (projectId, projectName) => {
    try {
      const response = await api.get(`/projects/${projectId}/download`, {
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
      setError(normalizeError(err, 'Failed to download project'));
    }
  };

  const formatDate = (dateStr) =>
      new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="font-heading text-3xl font-bold text-white">
                Your Projects
              </h1>
              <p className="text-gray-400 mt-1">
                Welcome back, {user?.name}!
              </p>
            </div>

            <Link to="/generate">
              <Button className="bg-cyan-500 text-black font-bold hover:bg-cyan-400">
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            </Link>
          </div>

          {error && typeof error === 'string' && (
              <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 mb-6">
                <AlertCircle className="w-5 h-5" />
                {error}
              </div>
          )}

          {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              </div>
          ) : projects.length === 0 ? (
              <Card className="bg-black/40 border-white/10">
                <CardContent className="flex flex-col items-center justify-center py-20">
                  <Sparkles className="w-10 h-10 text-cyan-400 mb-4" />
                  <h3 className="text-white text-xl font-bold mb-2">No Projects Yet</h3>
                  <p className="text-gray-400 mb-6 text-center">
                    Create your first AI-generated project.
                  </p>
                  <Link to="/generate">
                    <Button className="bg-cyan-500 text-black font-bold">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Project
                    </Button>
                  </Link>
                </CardContent>
              </Card>
          ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map(project => (
                    <Card key={project.id} className="bg-black/40 border-white/10">
                      <CardHeader>
                        <CardTitle className="text-white">{project.name}</CardTitle>
                        <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border ${getProjectTypeColor(project.project_type)}`}>
                    {project.project_type}
                  </span>
                      </CardHeader>

                      <CardContent>
                        <CardDescription className="text-gray-400 mb-4">
                          {project.description}
                        </CardDescription>

                        <div className="flex justify-between text-sm text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <FileCode className="w-4 h-4" />
                      {project.file_count}
                    </span>
                          <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                            {formatDate(project.created_at)}
                    </span>
                        </div>

                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => navigate(`/project/${project.id}`)}>
                            <Eye className="w-4 h-4 mr-1" /> View
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDownload(project.id, project.name)}>
                            <Download className="w-4 h-4 mr-1" /> Download
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteId(project.id)}>
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                ))}
              </div>
          )}
        </div>

        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent className="bg-[#0f172a] border-white/10">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Delete Project?</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-400">
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="animate-spin w-4 h-4" /> : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
  );
}
