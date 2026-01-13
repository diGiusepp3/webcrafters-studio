// frontend/src/components/PreviewPanel.jsx
import { ExternalLink, Image, Monitor, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PreviewPanel({
  previewUrl,
  screenshots = [],
  isLoading = false,
  className,
}) {
  const hasPreview = previewUrl || screenshots.length > 0;

  if (!hasPreview && !isLoading) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center py-12 text-gray-500 border border-dashed border-white/10 rounded-lg",
          className
        )}
        data-testid="preview-panel-empty"
      >
        <Monitor className="w-10 h-10 mb-3 opacity-30" />
        <span className="text-sm">Preview will appear here</span>
        <span className="text-xs text-gray-600 mt-1">when available</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center py-12 text-gray-500 border border-white/10 rounded-lg bg-black/40",
          className
        )}
        data-testid="preview-panel-loading"
      >
        <RefreshCw className="w-8 h-8 mb-3 animate-spin text-cyan-400" />
        <span className="text-sm text-gray-400">Building preview...</span>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-white/10 bg-black/40", className)} data-testid="preview-panel">
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-gray-300">Preview</span>
        </div>
        {previewUrl && (
          <Button
            size="sm"
            variant="ghost"
            className="text-cyan-400 hover:text-cyan-300 h-7"
            onClick={() => window.open(previewUrl, "_blank")}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Open
          </Button>
        )}
      </div>

      <div className="p-4">
        {previewUrl && (
          <div className="mb-4">
            <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden border border-white/5">
              <iframe
                src={previewUrl}
                className="w-full h-full"
                title="Preview"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-cyan-400 hover:underline mt-2 inline-block"
            >
              {previewUrl}
            </a>
          </div>
        )}

        {screenshots.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Image className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">Screenshots</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {screenshots.map((screenshot, index) => (
                <div
                  key={index}
                  className="aspect-video bg-gray-900 rounded-lg overflow-hidden border border-white/5 cursor-pointer hover:border-cyan-500/50 transition-colors"
                  onClick={() => window.open(screenshot.url, "_blank")}
                >
                  <img
                    src={screenshot.url}
                    alt={screenshot.label || `Screenshot ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
