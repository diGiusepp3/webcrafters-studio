import { useState } from 'react';
import { X, ExternalLink, RefreshCw, Maximize2, Minimize2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PreviewSidebar({ previewUrl, isOpen, onToggle, isLoading, projectType }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed right-0 top-1/2 -translate-y-1/2 bg-cyan-500 text-black px-2 py-4 rounded-l-lg shadow-lg hover:bg-cyan-400 transition-colors"
        title="Open Preview"
      >
        <span className="writing-vertical text-xs font-bold">Preview</span>
      </button>
    );
  }

  const width = isFullscreen ? 'w-1/2' : 'w-96';

  return (
    <div className={`${width} border-l border-white/5 bg-[#0a0f1a] flex-shrink-0 flex flex-col transition-all duration-300`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-sm font-medium text-white">Live Preview</span>
        <div className="flex items-center gap-1">
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
            title={isFullscreen ? 'Minimize' : 'Maximize'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 rounded hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
            title="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Preview content */}
      <div className="flex-1 relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0f1a]">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Building preview...</p>
            </div>
          </div>
        ) : previewUrl ? (
          <iframe
            src={previewUrl}
            className="w-full h-full border-0 bg-white"
            title="Project Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <p className="mb-2">No preview available</p>
              <p className="text-xs">Click "Preview" to generate a live preview</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer with info */}
      {previewUrl && (
        <div className="px-4 py-2 border-t border-white/5 text-xs text-gray-500">
          <p className="truncate">{previewUrl}</p>
        </div>
      )}
    </div>
  );
}
