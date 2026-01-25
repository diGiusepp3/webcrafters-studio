// frontend/src/components/GitHubImportModal.jsx
import { useState, useEffect } from 'react';
import api from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Github, Link2, Lock, Unlock, Loader2, AlertCircle, CheckCircle2,
  GitBranch, Folder, Star, RefreshCw, ExternalLink, Search
} from 'lucide-react';

export function GitHubImportModal({ open, onOpenChange, onImportSuccess }) {
  const [activeTab, setActiveTab] = useState('public');
  
  // GitHub connection status
  const [connected, setConnected] = useState(false);
  const [githubUsername, setGithubUsername] = useState(null);
  const [checkingConnection, setCheckingConnection] = useState(true);
  
  // Public import state
  const [publicUrl, setPublicUrl] = useState('');
  const [publicRef, setPublicRef] = useState('');
  const [publicSubdir, setPublicSubdir] = useState('');
  const [publicProjectName, setPublicProjectName] = useState('');
  
  // Private import state
  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState('');
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [privateRef, setPrivateRef] = useState('');
  const [privateSubdir, setPrivateSubdir] = useState('');
  const [privateProjectName, setPrivateProjectName] = useState('');
  const [repoSearch, setRepoSearch] = useState('');
  
  // Import state
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState(null);

  // Check GitHub connection status
  useEffect(() => {
    if (open) {
      checkConnection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const checkConnection = async () => {
    setCheckingConnection(true);
    try {
      const res = await api.get('/github/status');
      setConnected(res.data.connected);
      setGithubUsername(res.data.github_username);
      if (res.data.connected) {
        loadRepos();
      }
    } catch (err) {
      console.error('Failed to check GitHub connection:', err);
      setConnected(false);
    } finally {
      setCheckingConnection(false);
    }
  };

  const loadRepos = async () => {
    setReposLoading(true);
    setReposError('');
    try {
      const res = await api.get('/github/repos', { params: { per_page: 50 } });
      setRepos(res.data.repos || []);
    } catch (err) {
      setReposError(err.response?.data?.detail || 'Failed to load repositories');
    } finally {
      setReposLoading(false);
    }
  };

  const connectGitHub = async () => {
    try {
      const res = await api.post('/github/oauth/start');
      // Open GitHub OAuth in new window/same window
      window.location.href = res.data.auth_url;
    } catch (err) {
      console.error('Failed to start GitHub OAuth:', err);
    }
  };

  const disconnectGitHub = async () => {
    try {
      await api.post('/github/disconnect');
      setConnected(false);
      setGithubUsername(null);
      setRepos([]);
      setSelectedRepo(null);
    } catch (err) {
      console.error('Failed to disconnect GitHub:', err);
    }
  };

  const handlePublicImport = async () => {
    if (!publicUrl.trim()) return;
    
    setImporting(true);
    setImportError('');
    setImportResult(null);
    
    try {
      const res = await api.post('/github/import/public', {
        url: publicUrl.trim(),
        ref: publicRef.trim() || null,
        subdir: publicSubdir.trim() || null,
        project_name: publicProjectName.trim() || null,
      });
      
      setImportResult(res.data);
      onImportSuccess?.(res.data);
      
      // Auto-close after short delay
      setTimeout(() => {
        onOpenChange(false);
        resetForm();
      }, 2000);
    } catch (err) {
      setImportError(err.response?.data?.detail || 'Failed to import repository');
    } finally {
      setImporting(false);
    }
  };

  const handlePrivateImport = async () => {
    if (!selectedRepo) return;
    
    setImporting(true);
    setImportError('');
    setImportResult(null);
    
    try {
      const [owner, repo] = selectedRepo.full_name.split('/');
      const res = await api.post('/github/import/private', {
        owner,
        repo,
        ref: privateRef.trim() || null,
        subdir: privateSubdir.trim() || null,
        project_name: privateProjectName.trim() || null,
      });
      
      setImportResult(res.data);
      onImportSuccess?.(res.data);
      
      // Auto-close after short delay
      setTimeout(() => {
        onOpenChange(false);
        resetForm();
      }, 2000);
    } catch (err) {
      setImportError(err.response?.data?.detail || 'Failed to import repository');
    } finally {
      setImporting(false);
    }
  };

  const resetForm = () => {
    setPublicUrl('');
    setPublicRef('');
    setPublicSubdir('');
    setPublicProjectName('');
    setSelectedRepo(null);
    setPrivateRef('');
    setPrivateSubdir('');
    setPrivateProjectName('');
    setImportError('');
    setImportResult(null);
    setRepoSearch('');
  };

  const filteredRepos = repos.filter(repo =>
    repo.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    repo.full_name.toLowerCase().includes(repoSearch.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-panel border-white/10 max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Github className="w-5 h-5" />
            Import from GitHub
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Import an existing repository to start working on it in Studio
          </DialogDescription>
        </DialogHeader>

        {importResult ? (
          <div className="flex flex-col items-center py-8">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Import Successful!</h3>
            <p className="text-gray-400 text-center mb-4">
              Imported <span className="text-cyan-400">{importResult.file_count}</span> files from{' '}
              <span className="text-white">{importResult.owner}/{importResult.repo}</span>
            </p>
            {importResult.warnings?.length > 0 && (
              <div className="w-full max-w-md p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-yellow-400 text-sm font-medium mb-1">Warnings:</p>
                <ul className="text-yellow-300/80 text-xs space-y-1">
                  {importResult.warnings.slice(0, 5).map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                  {importResult.warnings.length > 5 && (
                    <li>... and {importResult.warnings.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="glass-card border-white/10 w-full grid grid-cols-2">
                <TabsTrigger value="public" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                  <Unlock className="w-4 h-4 mr-2" />
                  Public Repository
                </TabsTrigger>
                <TabsTrigger value="private" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
                  <Lock className="w-4 h-4 mr-2" />
                  Private Repository
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-hidden">
                <TabsContent value="public" className="h-full mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-gray-300">Repository URL</Label>
                    <div className="relative">
                      <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <Input
                        placeholder="https://github.com/owner/repo"
                        value={publicUrl}
                        onChange={(e) => setPublicUrl(e.target.value)}
                        className="pl-10 bg-black/40 border-white/10 text-white placeholder:text-gray-500"
                        data-testid="github-public-url-input"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-gray-300">Branch/Tag (optional)</Label>
                      <div className="relative">
                        <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <Input
                          placeholder="main"
                          value={publicRef}
                          onChange={(e) => setPublicRef(e.target.value)}
                          className="pl-10 bg-black/40 border-white/10 text-white placeholder:text-gray-500"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-gray-300">Subdirectory (optional)</Label>
                      <div className="relative">
                        <Folder className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <Input
                          placeholder="src/app"
                          value={publicSubdir}
                          onChange={(e) => setPublicSubdir(e.target.value)}
                          className="pl-10 bg-black/40 border-white/10 text-white placeholder:text-gray-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-300">Project Name (optional)</Label>
                    <Input
                      placeholder="My Project"
                      value={publicProjectName}
                      onChange={(e) => setPublicProjectName(e.target.value)}
                      className="bg-black/40 border-white/10 text-white placeholder:text-gray-500"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="private" className="h-full mt-4 space-y-4 flex flex-col overflow-hidden">
                  {checkingConnection ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                    </div>
                  ) : !connected ? (
                    <div className="flex flex-col items-center py-8">
                      <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                        <Github className="w-8 h-8 text-gray-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">Connect Your GitHub</h3>
                      <p className="text-gray-400 text-center mb-6 max-w-sm">
                        Connect your GitHub account to import private repositories
                      </p>
                      <Button
                        onClick={connectGitHub}
                        className="bg-[#24292f] hover:bg-[#32383f] text-white"
                        data-testid="connect-github-btn"
                      >
                        <Github className="w-4 h-4 mr-2" />
                        Connect GitHub
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Connected status */}
                      <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          <span className="text-green-400 text-sm">
                            Connected as <span className="font-semibold">{githubUsername}</span>
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={disconnectGitHub}
                          className="text-gray-400 hover:text-red-400"
                        >
                          Disconnect
                        </Button>
                      </div>

                      {/* Repository search */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <Input
                          placeholder="Search repositories..."
                          value={repoSearch}
                          onChange={(e) => setRepoSearch(e.target.value)}
                          className="pl-10 bg-black/40 border-white/10 text-white placeholder:text-gray-500"
                        />
                      </div>

                      {/* Repository list */}
                      <ScrollArea className="flex-1 -mx-1 px-1" style={{ maxHeight: '200px' }}>
                        {reposLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                          </div>
                        ) : reposError ? (
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            {reposError}
                          </div>
                        ) : filteredRepos.length === 0 ? (
                          <p className="text-gray-500 text-center py-4">No repositories found</p>
                        ) : (
                          <div className="space-y-1">
                            {filteredRepos.map((repo) => (
                              <button
                                key={repo.id}
                                onClick={() => setSelectedRepo(repo)}
                                className={`w-full p-3 rounded-lg text-left transition-all ${
                                  selectedRepo?.id === repo.id
                                    ? 'bg-cyan-500/20 border border-cyan-500/30'
                                    : 'bg-white/5 border border-transparent hover:border-white/10'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <Github className="w-5 h-5 text-gray-400" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-white font-medium truncate">{repo.name}</span>
                                      {repo.private && <Lock className="w-3 h-3 text-yellow-400" />}
                                    </div>
                                    <p className="text-gray-500 text-xs truncate">{repo.description || 'No description'}</p>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-gray-500">
                                    {repo.language && <span className="text-gray-400">{repo.language}</span>}
                                    <span className="flex items-center gap-1">
                                      <Star className="w-3 h-3" />
                                      {repo.stargazers_count}
                                    </span>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </ScrollArea>

                      {selectedRepo && (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-gray-300">Branch/Tag (optional)</Label>
                              <Input
                                placeholder={selectedRepo.default_branch || 'main'}
                                value={privateRef}
                                onChange={(e) => setPrivateRef(e.target.value)}
                                className="bg-black/40 border-white/10 text-white placeholder:text-gray-500"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-gray-300">Subdirectory (optional)</Label>
                              <Input
                                placeholder="src/app"
                                value={privateSubdir}
                                onChange={(e) => setPrivateSubdir(e.target.value)}
                                className="bg-black/40 border-white/10 text-white placeholder:text-gray-500"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-gray-300">Project Name (optional)</Label>
                            <Input
                              placeholder={selectedRepo.name}
                              value={privateProjectName}
                              onChange={(e) => setPrivateProjectName(e.target.value)}
                              className="bg-black/40 border-white/10 text-white placeholder:text-gray-500"
                            />
                          </div>
                        </>
                      )}
                    </>
                  )}
                </TabsContent>
              </div>
            </Tabs>

            {importError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {importError}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-white/10 text-white hover:bg-white/5"
              >
                Cancel
              </Button>
              <Button
                onClick={activeTab === 'public' ? handlePublicImport : handlePrivateImport}
                disabled={
                  importing ||
                  (activeTab === 'public' && !publicUrl.trim()) ||
                  (activeTab === 'private' && (!connected || !selectedRepo))
                }
                className="btn-primary"
                data-testid="import-github-btn"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Github className="w-4 h-4 mr-2" />
                    Import Repository
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default GitHubImportModal;
