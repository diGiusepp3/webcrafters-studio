// Agent Timeline Panel - Shows real-time progress like Emergent.sh
import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';

export function AgentTimelinePanel({ steps, progressSteps }) {
  if (!steps || steps.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        Waiting for agent to start...
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {steps.map((step, index) => {
        const stepInfo = progressSteps?.find(s => s.id === step.step) || {};
        const isRunning = step.status === 'running' || step.isRunning;
        const isComplete = step.status === 'success' || step.isComplete;
        const isError = step.status === 'error' || step.isError;
        const isPending = !isRunning && !isComplete && !isError;

        return (
          <div
            key={step.step || index}
            className={`relative flex items-start gap-3 py-2 px-3 rounded-lg transition-all ${
              isRunning ? 'bg-cyan-500/10' :
              isComplete ? 'bg-green-500/5' :
              isError ? 'bg-red-500/5' :
              'bg-transparent'
            }`}
          >
            {/* Timeline line */}
            {index < steps.length - 1 && (
              <div className={`absolute left-[23px] top-9 bottom-0 w-0.5 ${
                isComplete ? 'bg-green-500/30' : 'bg-white/10'
              }`} />
            )}

            {/* Icon */}
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
              isRunning ? 'bg-cyan-500/20 text-cyan-400' :
              isComplete ? 'bg-green-500/20 text-green-400' :
              isError ? 'bg-red-500/20 text-red-400' :
              'bg-white/10 text-gray-500'
            }`}>
              {isRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isComplete ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : isError ? (
                <XCircle className="w-3.5 h-3.5" />
              ) : (
                stepInfo.icon || <Clock className="w-3.5 h-3.5" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className={`text-sm font-medium ${
                  isRunning ? 'text-cyan-400' :
                  isComplete ? 'text-green-400' :
                  isError ? 'text-red-400' :
                  'text-gray-500'
                }`}>
                  {step.title || stepInfo.title || step.step}
                </p>
                {(step.duration_ms !== undefined || isComplete) && (
                  <span className="text-xs text-gray-600">
                    {step.duration_ms ? `${(step.duration_ms / 1000).toFixed(1)}s` : '0s'}
                  </span>
                )}
              </div>
              {(stepInfo.description || step.description) && (
                <p className={`text-xs mt-0.5 ${
                  isRunning ? 'text-cyan-400/60' :
                  isPending ? 'text-gray-600' :
                  'text-gray-500'
                }`}>
                  {step.description || stepInfo.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
