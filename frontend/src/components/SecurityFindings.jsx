import { Shield, AlertTriangle, AlertCircle, Info, CheckCircle, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { useState } from 'react';

const severityConfig = {
  high: {
    icon: <AlertCircle className="w-4 h-4" />,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    label: 'High',
  },
  medium: {
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    label: 'Medium',
  },
  low: {
    icon: <Info className="w-4 h-4" />,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    label: 'Low',
  },
  info: {
    icon: <Info className="w-4 h-4" />,
    color: 'text-gray-400',
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
    label: 'Info',
  },
  fixed: {
    icon: <CheckCircle className="w-4 h-4" />,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    label: 'Fixed',
  },
};

function FindingItem({ finding }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const severity = finding.severity?.toLowerCase() || 'info';
  const config = severityConfig[severity] || severityConfig.info;

  return (
    <div className={`rounded-lg border ${config.border} ${config.bg} overflow-hidden`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-start gap-3 text-left hover:bg-white/5 transition-colors"
      >
        <span className={config.color}>
          {config.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-1.5 py-0.5 rounded ${config.bg} ${config.color}`}>
              {config.label}
            </span>
            <span className="text-xs text-gray-500 truncate">
              {finding.file || finding.location || 'General'}
            </span>
          </div>
          <p className="text-sm text-white font-medium line-clamp-2">
            {finding.title || finding.message || finding.description}
          </p>
        </div>
        <span className="text-gray-500">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 pt-0 border-t border-white/5">
          <div className="mt-3 space-y-3">
            {finding.description && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Description</p>
                <p className="text-sm text-gray-300">{finding.description}</p>
              </div>
            )}
            {finding.recommendation && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Recommendation</p>
                <p className="text-sm text-gray-300">{finding.recommendation}</p>
              </div>
            )}
            {finding.code && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Affected Code</p>
                <pre className="text-xs bg-black/40 p-2 rounded overflow-x-auto text-gray-400 font-mono">
                  {finding.code}
                </pre>
              </div>
            )}
            {finding.cwe && (
              <a
                href={`https://cwe.mitre.org/data/definitions/${finding.cwe}.html`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
              >
                CWE-{finding.cwe}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SecurityFindings({ findings }) {
  if (!findings || findings.length === 0) {
    return (
      <div className="p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
          <Shield className="w-6 h-6 text-green-400" />
        </div>
        <p className="text-white font-medium mb-1">No Security Issues Found</p>
        <p className="text-sm text-gray-500">Your project passed the security scan</p>
      </div>
    );
  }

  // Group by severity
  const grouped = findings.reduce((acc, finding) => {
    const severity = finding.severity?.toLowerCase() || 'info';
    if (!acc[severity]) acc[severity] = [];
    acc[severity].push(finding);
    return acc;
  }, {});

  const severityOrder = ['high', 'medium', 'low', 'info', 'fixed'];
  const sortedSeverities = severityOrder.filter(s => grouped[s]);

  return (
    <div className="p-4 space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-4 pb-3 border-b border-white/5">
        {sortedSeverities.map(severity => {
          const config = severityConfig[severity];
          return (
            <div key={severity} className="flex items-center gap-1.5">
              <span className={config.color}>{config.icon}</span>
              <span className="text-sm text-gray-400">
                {grouped[severity].length} {config.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Findings list */}
      <div className="space-y-2">
        {sortedSeverities.flatMap(severity =>
          grouped[severity].map((finding, index) => (
            <FindingItem key={`${severity}-${index}`} finding={finding} />
          ))
        )}
      </div>
    </div>
  );
}
