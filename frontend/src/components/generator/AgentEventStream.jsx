import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ClipboardList,
  Edit3,
  FileSearch,
  Play,
  Search,
  Shield,
  Terminal,
} from 'lucide-react';

const TYPE_ICON_MAP = {
  repo_search: Search,
  file_read: FileSearch,
  plan: ClipboardList,
  propose_patch: Terminal,
  needs_approval: AlertTriangle,
  apply_patch: Edit3,
  verify: CheckCircle2,
  security_scan: Shield,
  preview_build: Play,
};

const SEVERITY_STYLES = {
  high: 'border-red-500/40 text-red-300 bg-red-500/10',
  medium: 'border-yellow-500/40 text-yellow-300 bg-yellow-500/10',
  low: 'border-blue-500/40 text-blue-300 bg-blue-500/10',
};

const formatTime = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export function AgentEventStream({ events = [] }) {
  if (!events.length) {
    return (
      <div className="rounded-2xl border border-white/5 bg-black/30 px-4 py-5 text-center text-xs text-gray-500">
        Events appear here once the agent starts planning your work.
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
      {events.map((event) => {
        const severity = (event.severity || '').toLowerCase();
        const Icon = TYPE_ICON_MAP[event.type] || Activity;
        const filesRead = Array.isArray(event.files_read) ? event.files_read.length : undefined;
        const filesChanged = Array.isArray(event.files_changed) ? event.files_changed.length : undefined;

        return (
          <div key={event.id} className="rounded-2xl border border-white/5 bg-black/30 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400">
                  <Icon className="w-4 h-4" />
                </span>
                <p className="text-sm font-semibold text-white">{event.title}</p>
              </div>
              <span className="text-[10px] text-gray-500">{formatTime(event.ts)}</span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">{event.detail || '—'}</p>
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-300">
              {event.type && (
                <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5">
                  {event.type.replace(/_/g, ' ')}
                </span>
              )}
              {severity && (
                <span
                  className={`px-2 py-0.5 rounded-full border ${SEVERITY_STYLES[severity] || 'border-white/10 text-white'}`}
                >
                  {severity}
                </span>
              )}
              {event.command && (
                <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5 truncate max-w-[160px]">
                  {event.command}
                </span>
              )}
              {typeof filesRead === 'number' && (
                <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5">
                  Read {filesRead} file{filesRead === 1 ? '' : 's'}
                </span>
              )}
              {typeof filesChanged === 'number' && (
                <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5">
                  Modified {filesChanged} file{filesChanged === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
