import { CheckCircle2, XCircle, Loader2, Clock, Lightbulb, Code2, Shield, Package, GitBranch, Bot } from 'lucide-react';

const stepIcons = {
  preflight: <Lightbulb className="w-4 h-4" />,
  clarifying: <Bot className="w-4 h-4" />,
  generating: <Code2 className="w-4 h-4" />,
  patching: <GitBranch className="w-4 h-4" />,
  validating: <CheckCircle2 className="w-4 h-4" />,
  security_check: <Shield className="w-4 h-4" />,
  fixing: <GitBranch className="w-4 h-4" />,
  saving: <Package className="w-4 h-4" />,
  done: <CheckCircle2 className="w-4 h-4" />,
  error: <XCircle className="w-4 h-4" />,
};

function formatDuration(ms) {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function AgentTimeline({ steps }) {
  if (!steps || steps.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500 text-sm">
        Waiting for agent to start...
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {steps.map((step, index) => {
        const isRunning = step.status === 'running';
        const isSuccess = step.status === 'success';
        const isError = step.status === 'error';
        const icon = stepIcons[step.step] || <Clock className="w-4 h-4" />;

        return (
          <div
            key={step.step || index}
            className={`flex items-center gap-3 p-2.5 rounded-lg transition-all ${
              isRunning ? 'bg-cyan-500/10 border border-cyan-500/30' :
              isSuccess ? 'bg-green-500/5' :
              isError ? 'bg-red-500/5' :
              'bg-white/5'
            }`}
          >
            {/* Icon */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
              isRunning ? 'bg-cyan-500/20 text-cyan-400' :
              isSuccess ? 'bg-green-500/20 text-green-400' :
              isError ? 'bg-red-500/20 text-red-400' :
              'bg-white/10 text-gray-500'
            }`}>
              {isRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isSuccess ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : isError ? (
                <XCircle className="w-4 h-4" />
              ) : (
                icon
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${
                isRunning ? 'text-cyan-400' :
                isSuccess ? 'text-green-400' :
                isError ? 'text-red-400' :
                'text-gray-400'
              }`}>
                {step.title || step.step}
              </p>
              {step.description && (
                <p className="text-xs text-gray-500 truncate">{step.description}</p>
              )}
            </div>

            {/* Duration */}
            {step.duration_ms && (
              <span className="text-xs text-gray-500 flex-shrink-0">
                {formatDuration(step.duration_ms)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
