// frontend/src/components/SecurityFindings.jsx
import { Shield, AlertTriangle, AlertCircle, Info, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const SeverityBadge = ({ severity }) => {
  const styles = {
    high: "bg-red-500/20 text-red-400 border-red-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };

  const icons = {
    high: AlertCircle,
    medium: AlertTriangle,
    low: Info,
  };

  const Icon = icons[severity] || Info;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
        styles[severity] || styles.low
      )}
    >
      <Icon className="w-3 h-3" />
      {severity}
    </span>
  );
};

const FindingItem = ({ finding }) => {
  return (
    <AccordionItem value={`${finding.file}-${finding.line}`} className="border-white/10">
      <AccordionTrigger className="hover:no-underline py-2">
        <div className="flex items-center gap-3 text-left">
          <SeverityBadge severity={finding.severity} />
          <div className="flex-1">
            <span className="text-sm text-white">{finding.name}</span>
            {finding.fixed && (
              <span className="ml-2 text-xs text-green-400 flex items-center gap-1 inline-flex">
                <CheckCircle className="w-3 h-3" /> Fixed
              </span>
            )}
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-2 text-sm">
          <p className="text-gray-400">{finding.description}</p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>📁 {finding.file}</span>
            <span>Line {finding.line}</span>
          </div>
          {finding.line_content && (
            <pre className="bg-black/40 p-2 rounded text-xs text-gray-400 overflow-x-auto">
              {finding.line_content}
            </pre>
          )}
          {finding.fix_suggestion && (
            <p className="text-cyan-400 text-xs">
              💡 {finding.fix_suggestion}
            </p>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};

export function SecurityFindings({ findings = [], className }) {
  if (!findings.length) {
    return null;
  }

  const highCount = findings.filter((f) => f.severity === "high").length;
  const mediumCount = findings.filter((f) => f.severity === "medium").length;
  const lowCount = findings.filter((f) => f.severity === "low").length;
  const fixedCount = findings.filter((f) => f.fixed).length;

  return (
    <div className={cn("rounded-lg border border-white/10 bg-black/40", className)} data-testid="security-findings">
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-cyan-400" />
          <span className="font-medium text-white">Security Findings</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {highCount > 0 && (
            <span className="text-red-400">{highCount} high</span>
          )}
          {mediumCount > 0 && (
            <span className="text-yellow-400">{mediumCount} medium</span>
          )}
          {lowCount > 0 && (
            <span className="text-blue-400">{lowCount} low</span>
          )}
          {fixedCount > 0 && (
            <span className="text-green-400">({fixedCount} fixed)</span>
          )}
        </div>
      </div>

      <Accordion type="multiple" className="px-4">
        {findings.map((finding, index) => (
          <FindingItem key={index} finding={finding} />
        ))}
      </Accordion>
    </div>
  );
}
