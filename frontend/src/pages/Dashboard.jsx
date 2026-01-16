import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '@/api';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Navbar } from '@/components/Navbar';
import {
  Plus, Folder, Calendar, FileCode, Trash2, Download, Eye,
  Loader2, AlertCircle, Sparkles, Search, Filter, Grid3X3,
  List, Clock, Code2, Zap, TrendingUp, Activity, Copy,
  MoreVertical, Archive, Share2, Star, StarOff, Bot,
  ChevronRight, ArrowUpRight, BarChart3, FolderOpen
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const normalizeError = (err, fallback = 'Something went wrong') =>
  err?.response?.data?.message || err?.response?.data?.detail || err?.message || fallback;

// Stats Card Component
function StatsCard({ icon, label, value, trend, color = 'cyan' }) {
  const colors = {
    cyan: 'from-cyan-500 to-blue-500',
    violet: 'from-violet-500 to-purple-500',
    green: 'from-green-500 to-emerald-500',
    orange: 'from-orange-500 to-amber-500',
  };

  return (
    <div className="glass-card p-5 rounded-xl">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colors[color]} p-0.5`}>
          <div className="w-full h-full rounded-lg bg-[#0a0f1a] flex items-center justify-center text-white">
            {icon}
          </div>
        </div>
        {trend && (
          <span className={`text-xs px-2 py-1 rounded-full ${
            trend > 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}

// Project Card Component
function ProjectCard({ project, onView, onDownload, onDelete, onDuplicate, onToggleFavorite }) {
  const [isHovered, setIsHovered] = useState(false);

  const getProjectTypeColor = (type) => {
    const colors = {
      fullstack: 'from-violet-500 to-purple-500',
      frontend: 'from-cyan-500 to-blue-500',
      backend: 'from-green-500 to-emerald-500',
      mobile: 'from-orange-500 to-amber-500',
      cli: 'from-gray-500 to-slate-500',
      any: 'from-pink-500 to-rose-500',
    };
    return colors[type] || colors.any;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div
      className="glass-card rounded-xl overflow-hidden group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${getProjectTypeColor(project.project_type)} p-0.5`}>
              <div className="w-full h-full rounded-lg bg-[#0a0f1a] flex items-center justify-center">
                <Code2 className="w-5 h-5 text-white" />
              </div>
            </div>
            <div>
              <h3 className="font-heading font-bold text-white group-hover:text-cyan-400 transition-colors truncate max-w-[180px]">
                {project.name}
              </h3>
              <span className={`inline-flex text-xs px-2 py-0.5 rounded-full bg-gradient-to-r ${getProjectTypeColor(project.project_type)} bg-opacity-20 text-white/80`}>
                {project.project_type}
              </span>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-white transition-colors">
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="glass-panel border-white/10 w-48">
              <DropdownMenuItem onClick={() => onView(project)} className="flex items-center gap-2 cursor-pointer">
                <Eye className="w-4 h-4" />
                View Project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDownload(project)} className="flex items-center gap-2 cursor-pointer">
                <Download className="w-4 h-4" />
                Download ZIP
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(project)} className="flex items-center gap-2 cursor-pointer">
                <Copy className="w-4 h-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem onClick={() => onToggleFavorite(project)} className="flex items-center gap-2 cursor-pointer">
                {project.is_favorite ? (
                  <><StarOff className="w-4 h-4" /> Remove Favorite</>
                ) : (
                  <><Star className="w-4 h-4" /> Add to Favorites</>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem className="flex items-center gap-2 cursor-pointer">
                <Archive className="w-4 h-4" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem onClick={() => onDelete(project)} className="flex items-center gap-2 text-red-400 cursor-pointer">
                <Trash2 className="w-4 h-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="text-gray-500 text-sm line-clamp-2 mb-4 min-h-[40px]">
          {project.description || 'No description'}
        </p>

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <FileCode className="w-3.5 h-3.5" />
            {project.file_count || 0} files
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {formatDate(project.created_at)}
          </span>
        </div>
      </div>

      {/* Actions footer */}
      <div className="px-5 py-3 bg-black/20 border-t border-white/5 flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onView(project)}
          className="flex-1 text-gray-400 hover:text-white hover:bg-white/5"
        >
          <Eye className="w-4 h-4 mr-1.5" />
          View
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDownload(project)}
          className="flex-1 text-gray-400 hover:text-white hover:bg-white/5"
        >
          <Download className="w-4 h-4 mr-1.5" />
          Download
        </Button>
      </div>
    </div>
  );
}

// Quick Action Card
function QuickActionCard({ icon, title, description, onClick, gradient }) {
  return (
    <button
      onClick={onClick}
      className="glass-card p-5 rounded-xl text-left group hover:border-cyan-500/30 transition-all w-full"
    >
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${gradient} p-0.5 mb-3`}>
        <div className="w-full h-full rounded-lg bg-[#0a0f1a] flex items-center justify-center text-white group-hover:bg-transparent transition-colors">
          {icon}
        </div>
      </div>
      <h4 className="font-heading font-bold text-white mb-1 group-hover:text-cyan-400 transition-colors">
        {title}
      </h4>
      <p className="text-sm text-gray-500">{description}</p>
    </button>
  );
}

// Recent Activity Item
function ActivityItem({ activity }) {
  const getIcon = (type) => {
    switch (type) {
      case 'created': return <Plus className="w-4 h-4" />;
      case 'downloaded': return <Download className="w-4 h-4" />;
      case 'updated': return <Code2 className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
        {getIcon(activity.type)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{activity.message}</p>
        <p className="text-xs text-gray-500">{activity.time}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('newest');
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

  const handleDownload = async (project) => {
    try {
      const response = await api.get(`/projects/${project.id}/download`, {
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
      setError(normalizeError(err, 'Failed to download project'));
    }
  };

  const handleView = (project) => {
    navigate(`/generate?projectId=${project.id}`);
  };

  const handleDuplicate = async (project) => {
    // TODO: Implement duplicate API
    console.log('Duplicate:', project.id);
  };

  const handleToggleFavorite = async (project) => {
    // TODO: Implement favorite toggle API
    console.log('Toggle favorite:', project.id);
  };

  // Filter and sort projects
  const filteredProjects = useMemo(() => {
    let result = [...projects];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        p => p.name.toLowerCase().includes(query) ||
             p.description?.toLowerCase().includes(query)
      );
    }

    // Type filter
    if (filterType !== 'all') {
      result = result.filter(p => p.project_type === filterType);
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        break;
      case 'oldest':
        result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        break;
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'files':
        result.sort((a, b) => (b.file_count || 0) - (a.file_count || 0));
        break;
    }

    return result;
  }, [projects, searchQuery, filterType, sortBy]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalFiles = projects.reduce((sum, p) => sum + (p.file_count || 0), 0);
    const typeCount = {};
    projects.forEach(p => {
      typeCount[p.project_type] = (typeCount[p.project_type] || 0) + 1;
    });
    const mostUsedType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    
    return {
      totalProjects: projects.length,
      totalFiles,
      mostUsedType,
      thisWeek: projects.filter(p => {
        const date = new Date(p.created_at);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return date > weekAgo;
      }).length,
    };
  }, [projects]);

  // Recent activities (mock - would come from API)
  const recentActivities = useMemo(() => {
    return projects.slice(0, 5).map(p => ({
      type: 'created',
      message: `Created "${p.name}"`,
      time: new Date(p.created_at).toLocaleDateString(),
    }));
  }, [projects]);

  return (
    <div className="min-h-screen bg-[#030712]">
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 pt-24 pb-12">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
          <div>
            <h1 className="font-heading text-3xl font-bold text-white mb-2">
              Welcome back, {user?.name?.split(' ')[0] || 'Developer'}! 👋
            </h1>
            <p className="text-gray-400">
              Manage your AI-generated projects and create new ones
            </p>
          </div>

          <Link to="/generate">
            <Button className="btn-primary pulse-neon" data-testid="new-project-btn">
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatsCard
            icon={<FolderOpen className="w-5 h-5" />}
            label="Total Projects"
            value={stats.totalProjects}
            color="cyan"
          />
          <StatsCard
            icon={<FileCode className="w-5 h-5" />}
            label="Total Files"
            value={stats.totalFiles}
            color="violet"
          />
          <StatsCard
            icon={<Zap className="w-5 h-5" />}
            label="This Week"
            value={stats.thisWeek}
            trend={stats.thisWeek > 0 ? 12 : 0}
            color="green"
          />
          <StatsCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Most Used"
            value={stats.mostUsedType}
            color="orange"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Quick Actions */}
            <div className="mb-8">
              <h2 className="font-heading text-lg font-bold text-white mb-4">Quick Actions</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <QuickActionCard
                  icon={<Bot className="w-5 h-5" />}
                  title="AI Generator"
                  description="Create a new project with AI"
                  onClick={() => navigate('/generate')}
                  gradient="from-cyan-500 to-blue-500"
                />
                <QuickActionCard
                  icon={<Sparkles className="w-5 h-5" />}
                  title="Templates"
                  description="Start from a template"
                  onClick={() => navigate('/templates')}
                  gradient="from-violet-500 to-purple-500"
                />
                <QuickActionCard
                  icon={<BarChart3 className="w-5 h-5" />}
                  title="Analytics"
                  description="View usage statistics"
                  onClick={() => navigate('/analytics')}
                  gradient="from-green-500 to-emerald-500"
                />
              </div>
            </div>

            {/* Projects Section */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h2 className="font-heading text-lg font-bold text-white">Your Projects</h2>
                
                <div className="flex items-center gap-3">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <Input
                      placeholder="Search projects..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 w-48 glass-input border-white/10 bg-black/40 text-white placeholder:text-gray-500"
                    />
                  </div>

                  {/* Filter */}
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-32 glass-input border-white/10 bg-black/40 text-white">
                      <Filter className="w-4 h-4 mr-2 text-gray-500" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-panel border-white/10">
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="fullstack">Fullstack</SelectItem>
                      <SelectItem value="frontend">Frontend</SelectItem>
                      <SelectItem value="backend">Backend</SelectItem>
                      <SelectItem value="mobile">Mobile</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* View toggle */}
                  <div className="flex items-center glass-card rounded-lg p-1">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-1.5 rounded ${
                        viewMode === 'grid' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-white'
                      }`}
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-1.5 rounded ${
                        viewMode === 'list' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-white'
                      }`}
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 mb-6">
                  <AlertCircle className="w-5 h-5" />
                  {error}
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                </div>
              ) : filteredProjects.length === 0 ? (
                <div className="glass-card rounded-xl">
                  <div className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-500 p-0.5 mb-6">
                      <div className="w-full h-full rounded-2xl bg-[#0a0f1a] flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-cyan-400" />
                      </div>
                    </div>
                    <h3 className="font-heading text-xl font-bold text-white mb-2">
                      {searchQuery || filterType !== 'all' ? 'No matching projects' : 'No projects yet'}
                    </h3>
                    <p className="text-gray-500 text-center mb-6 max-w-sm">
                      {searchQuery || filterType !== 'all'
                        ? 'Try adjusting your search or filter'
                        : 'Create your first AI-generated project and watch the magic happen'}
                    </p>
                    {!searchQuery && filterType === 'all' && (
                      <Link to="/generate">
                        <Button className="btn-primary">
                          <Plus className="w-4 h-4 mr-2" />
                          Create Your First Project
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <div className={`grid gap-4 ${
                  viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'
                }`}>
                  {filteredProjects.map(project => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onView={handleView}
                      onDownload={handleDownload}
                      onDelete={(p) => setDeleteId(p.id)}
                      onDuplicate={handleDuplicate}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Recent Activity */}
            <div className="glass-card-static rounded-xl p-5">
              <h3 className="font-heading font-bold text-white mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                Recent Activity
              </h3>
              {recentActivities.length > 0 ? (
                <div className="divide-y divide-white/5">
                  {recentActivities.map((activity, index) => (
                    <ActivityItem key={index} activity={activity} />
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No recent activity</p>
              )}
            </div>

            {/* Tips */}
            <div className="glass-card-static rounded-xl p-5">
              <h3 className="font-heading font-bold text-white mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                Pro Tips
              </h3>
              <ul className="space-y-3 text-sm text-gray-400">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-cyan-500 mt-0.5 flex-shrink-0" />
                  Be specific in your prompts for better results
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-cyan-500 mt-0.5 flex-shrink-0" />
                  Use the clarify feature for complex projects
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-4 h-4 text-cyan-500 mt-0.5 flex-shrink-0" />
                  Review security findings before deploying
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="glass-panel border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Project?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              This action cannot be undone. All project files will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
