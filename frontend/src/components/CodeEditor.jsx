// Code editor with Monaco
import { useState, useMemo } from "react";
import Editor from "@monaco-editor/react";
import { Copy, Check, Save, Loader2, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";

const getLanguage = (filename, fileLanguage) => {
  if (fileLanguage) return fileLanguage;
  const ext = (filename || "").split(".").pop()?.toLowerCase();
  const langMap = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    json: "json",
    html: "html",
    css: "css",
    md: "markdown",
    txt: "text",
    yml: "yaml",
    yaml: "yaml",
    sh: "bash",
    bash: "bash",
    sql: "sql",
    env: "bash",
  };
  return langMap[ext] || "text";
};

const baseOptions = {
  fontSize: 13,
  lineHeight: 20,
  minimap: { enabled: false },
  wordWrap: "on",
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  renderWhitespace: "boundary",
  fontFamily: "'JetBrains Mono', monospace",
};

export function CodeEditor({
  file,
  value,
  onChange,
  onSave,
  isDirty = false,
  isSaving = false,
  readOnly = false,
}) {
  const [copied, setCopied] = useState(false);
  const language = useMemo(
    () => getLanguage(file?.path, file?.language),
    [file?.path, file?.language]
  );

  if (!file) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-4 opacity-50">{"</>"}</div>
          <p>Select a file to view its contents</p>
        </div>
      </div>
    );
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value ?? file.content ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveDisabled = !onSave || isSaving || readOnly || !isDirty;

  return (
    <div className="h-full flex flex-col bg-[#0a0f1a]">
      <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-white/10">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-cyan-400" />
          <span className="text-cyan-400 font-mono text-sm">{file.path}</span>
          <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded">
            {language}
          </span>
          {isDirty && <span className="text-xs text-amber-400">Unsaved</span>}
          {readOnly && <span className="text-xs text-cyan-400">Read-only</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="text-gray-400 hover:text-white"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-1 text-green-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-1" />
                Copy
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onSave}
            disabled={saveDisabled}
            className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          theme="vs-dark"
          language={language}
          value={value ?? file.content ?? ""}
          onChange={(val) => onChange?.(val ?? "")}
          options={{
            ...baseOptions,
            readOnly,
          }}
        />
      </div>
    </div>
  );
}
