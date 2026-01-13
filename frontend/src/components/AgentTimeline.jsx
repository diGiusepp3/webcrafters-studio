// frontend/src/components/AgentTimeline.jsx
import { useMemo } from "react";
import {
  Clock,
  Search,
  MessageCircle,
  Code,
  Wrench,
  CheckCircle,
  Shield,
  Package,
  Upload,
  Camera,
  Play,
  Tool,
  Save,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Icon mapping
const STEP_ICONS = {
  clock: Clock,
  search: Search,
  "message-circle": MessageCircle,
  code: Code,
  wrench: Wrench,
  "check-circle": CheckCircle,
  shield: Shield,
  package: Package,
  upload: Upload,
  camera: Camera,
  play: Play,
  tool: Tool,
  save: Save,
  check: Check,
  "alert-circle": AlertCircle,
  loader: Loader2,
};

const StepIcon = ({ icon, status, className }) => {
  const IconComponent = STEP_ICONS[icon] || Loader2;
  
  if (status === "running") {
    return <Loader2 className={cn("animate-spin", className)} />;
  }
  
  return <IconComponent className={className} />;
};

const TimelineStep = ({ step, isLast }) => {
  const status = step.status || "pending";
  
  const statusColors = {
    pending: "border-gray-600 bg-gray-800 text-gray-500",
    running: "border-cyan-500 bg-cyan-500/20 text-cyan-400 ring-2 ring-cyan-500/30",
    success: "border-green-500 bg-green-500/20 text-green-400",
    error: "border-red-500 bg-red-500/20 text-red-400",
    skipped: "border-gray-600 bg-gray-800 text-gray-600",
  };
  
  const lineColors = {
    pending: "bg-gray-700",
    running: "bg-gradient-to-b from-cyan-500 to-gray-700",
    success: "bg-green-500",
    error: "bg-red-500",
    skipped: "bg-gray-700",
  };

  return (
    <div className="flex gap-3" data-testid={`timeline-step-${step.step}`}>
      {/* Icon and line */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300",
            statusColors[status]
          )}
        >
          <StepIcon icon={step.icon} status={status} className="w-4 h-4" />
        </div>
        {!isLast && (
          <div
            className={cn(
              "w-0.5 flex-1 min-h-[24px] transition-all duration-300",
              lineColors[status]
            )}
          />
        )}
      </div>
      
      {/* Content */}
      <div className="pb-4 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-medium text-sm",
              status === "running" && "text-cyan-400",
              status === "success" && "text-green-400",
              status === "error" && "text-red-400",
              status === "pending" && "text-gray-500",
              status === "skipped" && "text-gray-600"
            )}
          >
            {step.title}
          </span>
          {step.duration_ms && (
            <span className="text-xs text-gray-500">
              {(step.duration_ms / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
        {step.error && (
          <p className="text-xs text-red-400 mt-1">{step.error}</p>
        )}
      </div>
    </div>
  );
};

export function AgentTimeline({ timeline = [], className }) {
  // Sort timeline by expected order
  const sortedTimeline = useMemo(() => {
    const order = [
      "queued", "preflight", "clarifying", "generating", "patching",
      "validating", "security_check", "building", "deploying",
      "screenshotting", "testing", "fixing", "saving", "done", "error"
    ];
    
    return [...timeline].sort((a, b) => {
      const indexA = order.indexOf(a.step);
      const indexB = order.indexOf(b.step);
      return indexA - indexB;
    });
  }, [timeline]);

  if (!timeline.length) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-8 text-gray-500", className)}>
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        <span className="text-sm">Waiting to start...</span>
      </div>
    );
  }

  return (
    <div className={cn("p-4", className)} data-testid="agent-timeline">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
        <span className="text-sm font-medium text-gray-300">Agent Timeline</span>
      </div>
      
      <div className="space-y-0">
        {sortedTimeline.map((step, index) => (
          <TimelineStep
            key={step.step}
            step={step}
            isLast={index === sortedTimeline.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
