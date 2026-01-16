// frontend/src/components/generator/PreviewSidebar.jsx
// Collapsible preview sidebar with iframe

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Monitor,
  ExternalLink,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Minimize2,
  X,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function PreviewSidebar({
  previewUrl,
  isOpen,
  onToggle,
  isLoading = false,
  projectType,
  className,
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef(null);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleOpenExternal = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Handle fullscreen
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullscreen]);

  // Toggle button when closed
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className={cn(
          'fixed right-0 top-1/2 -translate-y-1/2 z-40',
          'flex items-center gap-2 px-2 py-4 rounded-l-lg',
          'bg-cyan-500/20 border border-r-0 border-cyan-500/30',
          'text-cyan-400 hover:bg-cyan-500/30 transition-all',
          className
        )}
        data-testid="preview-toggle-open"
      >
        <ChevronLeft className="w-5 h-5" />
        <Monitor className="w-5 h-5" />
      </button>
    );
  }

  // Fullscreen overlay
  if (isFullscreen && previewUrl) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="bg-black/50 border-white/20 text-white hover:bg-white/10"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenExternal}
            className="bg-black/50 border-white/20 text-white hover:bg-white/10"
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFullscreen(false)}
            className="bg-black/50 border-white/20 text-white hover:bg-white/10"
          >
            <Minimize2 className="w-4 h-4" />
          </Button>
        </div>
        <iframe
          key={refreshKey}
          ref={iframeRef}
          src={previewUrl}
          className="w-full h-full"
          title="Preview"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    );
  }

  // Sidebar panel
  return (
    <div
      className={cn(
        'w-[400px] lg:w-[500px] flex-shrink-0 h-full',
        'flex flex-col border-l border-white/10 bg-[#0a0a0f]',
        className
      )}
      data-testid="preview-sidebar"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-white">Preview</span>
          {projectType && (
            <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded">
              {projectType}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {previewUrl && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                className="h-7 w-7 p-0 text-gray-400 hover:text-white"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFullscreen(true)}
                className="h-7 w-7 p-0 text-gray-400 hover:text-white"
                title="Fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenExternal}
                className="h-7 w-7 p-0 text-gray-400 hover:text-white"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-7 w-7 p-0 text-gray-400 hover:text-white"
            title="Close preview"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Loader2 className="w-8 h-8 mb-3 animate-spin text-cyan-400" />
            <span className="text-sm">Building preview...</span>
          </div>
        ) : previewUrl ? (
          <iframe
            key={refreshKey}
            ref={iframeRef}
            src={previewUrl}
            className="w-full h-full bg-white"
            title="Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Monitor className="w-10 h-10 mb-3 opacity-30" />
            <span className="text-sm">No preview available</span>
            <span className="text-xs text-gray-600 mt-1">
              Generate or open a project to see preview
            </span>
          </div>
        )}
      </div>

      {/* Footer with URL */}
      {previewUrl && (
        <div className="px-4 py-2 border-t border-white/10 bg-black/40">
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-cyan-400 hover:underline truncate block"
          >
            {previewUrl}
          </a>
        </div>
      )}
    </div>
  );
}
