import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/button';

const getLanguage = (filename, fileLanguage) => {
  if (fileLanguage) return fileLanguage;
  
  const ext = filename.split('.').pop().toLowerCase();
  const langMap = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    json: 'json',
    html: 'html',
    css: 'css',
    md: 'markdown',
    txt: 'text',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'bash',
    bash: 'bash',
    sql: 'sql',
    env: 'bash',
  };
  return langMap[ext] || 'text';
};

export const CodePreview = ({ file }) => {
  const [copied, setCopied] = useState(false);
  
  if (!file) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500" data-testid="code-preview-empty">
        <div className="text-center">
          <div className="text-4xl mb-4 opacity-50">{'</>'}</div>
          <p>Select a file to view its contents</p>
        </div>
      </div>
    );
  }
  
  const language = getLanguage(file.path, file.language);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(file.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="h-full flex flex-col" data-testid="code-preview">
      <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 font-mono text-sm">{file.path}</span>
          <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded">{language}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="text-gray-400 hover:text-white"
          data-testid="copy-code-btn"
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
      </div>
      
      <div className="flex-1 overflow-auto bg-[#1e1e1e]">
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '1rem',
            background: 'transparent',
            fontSize: '0.875rem',
            lineHeight: '1.6',
          }}
          showLineNumbers={true}
          lineNumberStyle={{
            minWidth: '3em',
            paddingRight: '1em',
            color: '#4a5568',
            userSelect: 'none',
          }}
        >
          {file.content}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};
