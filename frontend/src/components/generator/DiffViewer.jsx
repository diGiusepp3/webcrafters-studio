// Diff Viewer - Shows changes made to files
import { useState } from 'react';
import { X, FileCode, Plus, Minus, Edit3, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function DiffViewer({
  changes,
  onClose,
  mode = 'applied',
  onApply,
  applying = false,
  summary,
  notes
}) {
  const [selectedChange, setSelectedChange] = useState(changes?.[0] || null);
  const isProposal = mode === 'proposal';

  if (!changes || changes.length === 0) return null;

  const normalizeAction = (action) => (action || 'modify').toLowerCase();

  const getActionIcon = (action) => {
    const normalized = normalizeAction(action);
    switch (normalized) {
      case 'create':
        return <Plus className="w-4 h-4 text-green-400" />;
      case 'delete':
      case 'deleted':
        return <Minus className="w-4 h-4 text-red-400" />;
      default:
        return <Edit3 className="w-4 h-4 text-cyan-400" />;
    }
  };

  const getActionColor = (action) => {
    const normalized = normalizeAction(action);
    switch (normalized) {
      case 'create':
        return 'text-green-400 bg-green-500/10 border-green-500/30';
      case 'delete':
      case 'deleted':
        return 'text-red-400 bg-red-500/10 border-red-500/30';
      default:
        return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    }
  };

  const getActionLabel = (action) => {
    const normalized = normalizeAction(action);
    return normalized === 'deleted' ? 'delete' : normalized;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="glass-card rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-cyan-400" />
              {isProposal ? 'Proposed Changes' : 'Changes Applied'}
            </h2>
            <p className="text-sm text-gray-500">
              {changes.length} file(s) {isProposal ? 'proposed' : 'modified'}
            </p>
            {summary && (
              <p className="text-sm text-gray-400 mt-1">{summary}</p>
            )}
            {Array.isArray(notes) && notes.length > 0 && (
              <ul className="mt-2 text-xs text-gray-500 list-disc pl-4 space-y-1">
                {notes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
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
                  <p
                    className={`text-sm truncate ${
                      selectedChange?.path === change.path ? 'text-cyan-400' : 'text-gray-300'
                    }`}
                  >
                    {change.path?.split('/').pop() || change.path}
                  </p>
                  <p className="text-xs text-gray-600 truncate">{change.path}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded border ${getActionColor(change.action)}`}>
                  {getActionLabel(change.action) || 'modify'}
                </span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {selectedChange ? (
              <div className="p-4">
                {(() => {
                  const selectedAction = normalizeAction(selectedChange.action);
                  const isDelete = selectedAction === 'delete' || selectedAction === 'deleted';
                  const explanation = selectedChange.explanation || {};
                  const changeList = Array.isArray(selectedChange.change_list)
                    ? selectedChange.change_list
                    : (Array.isArray(selectedChange.changeList) ? selectedChange.changeList : []);
                  const hasExplanation = explanation && (explanation.what || explanation.where || explanation.why);
                  const hasChangeList = changeList.length > 0;

                  return (
                    <>
                      <div className="flex items-center gap-2 mb-4">
                        <FileCode className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm text-white font-mono">{selectedChange.path}</span>
                      </div>

                      {isDelete ? (
                        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                          This file was deleted
                        </div>
                      ) : (
                        <pre className="text-sm font-mono text-gray-300 bg-black/40 rounded-lg p-4 overflow-x-auto">
                          <code>{selectedChange.content || 'No content'}</code>
                        </pre>
                      )}

                      {(hasExplanation || hasChangeList || selectedChange.reason) && (
                        <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/10">
                          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                            Change Summary
                          </p>
                          {hasExplanation && (
                            <div className="space-y-2 text-sm text-gray-300">
                              {explanation.what && (
                                <div>
                                  <span className="text-xs text-gray-500 uppercase tracking-wider">What</span>
                                  <p>{explanation.what}</p>
                                </div>
                              )}
                              {explanation.where && (
                                <div>
                                  <span className="text-xs text-gray-500 uppercase tracking-wider">Where</span>
                                  <p>{explanation.where}</p>
                                </div>
                              )}
                              {explanation.why && (
                                <div>
                                  <span className="text-xs text-gray-500 uppercase tracking-wider">Why</span>
                                  <p>{explanation.why}</p>
                                </div>
                              )}
                            </div>
                          )}
                          {hasChangeList && (
                            <ul className="mt-2 text-sm text-gray-300 list-disc pl-5 space-y-1">
                              {changeList.map((item, idx) => (
                                <li key={idx}>{item}</li>
                              ))}
                            </ul>
                          )}
                          {!hasExplanation && !hasChangeList && selectedChange.reason && (
                            <p className="text-sm text-gray-300">{selectedChange.reason}</p>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
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
          {isProposal ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button onClick={onApply} className="btn-primary" disabled={applying || !onApply}>
                {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
              </Button>
            </div>
          ) : (
            <Button onClick={onClose} className="btn-primary">
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
