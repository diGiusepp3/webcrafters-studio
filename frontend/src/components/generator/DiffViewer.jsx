// Diff Viewer - Shows changes made to files
import { useState } from 'react';
import { X, FileCode, Plus, Minus, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DiffViewer({ changes, onClose }) {
  const [selectedChange, setSelectedChange] = useState(changes?.[0] || null);

  if (!changes || changes.length === 0) return null;

  const getActionIcon = (action) => {
    switch (action) {
      case 'create': return <Plus className="w-4 h-4 text-green-400" />;
      case 'delete': return <Minus className="w-4 h-4 text-red-400" />;
      default: return <Edit3 className="w-4 h-4 text-cyan-400" />;
    }
  };

  const getActionColor = (action) => {
    switch (action) {
      case 'create': return 'text-green-400 bg-green-500/10 border-green-500/30';
      case 'delete': return 'text-red-400 bg-red-500/10 border-red-500/30';
      default: return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="glass-card rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-cyan-400" />
              Changes Applied
            </h2>
            <p className="text-sm text-gray-500">{changes.length} file(s) modified</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* File list */}
          <div className="w-64 border-r border-white/5 overflow-y-auto">
            {changes.map((change, idx) => (
              <button
                key={change.path || idx}
                onClick={() => setSelectedChange(change)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors border-b border-white/5 ${
                  selectedChange?.path === change.path ? 'bg-cyan-500/10' : ''
                }`}
              >
                {getActionIcon(change.action)}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${
                    selectedChange?.path === change.path ? 'text-cyan-400' : 'text-gray-300'
                  }`}>
                    {change.path?.split('/').pop() || change.path}
                  </p>
                  <p className="text-xs text-gray-600 truncate">{change.path}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded border ${getActionColor(change.action)}`}>
                  {change.action || 'modify'}
                </span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {selectedChange ? (
              <div className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <FileCode className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm text-white font-mono">{selectedChange.path}</span>
                </div>
                
                {selectedChange.action === 'delete' ? (
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                    This file was deleted
                  </div>
                ) : (
                  <pre className="text-sm font-mono text-gray-300 bg-black/40 rounded-lg p-4 overflow-x-auto">
                    <code>{selectedChange.content || 'No content'}</code>
                  </pre>
                )}

                {selectedChange.reason && (
                  <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/10">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Reason</p>
                    <p className="text-sm text-gray-300">{selectedChange.reason}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Select a file to view changes
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 flex justify-end">
          <Button onClick={onClose} className="btn-primary">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
