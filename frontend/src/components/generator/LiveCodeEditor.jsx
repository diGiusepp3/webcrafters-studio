// frontend/src/components/generator/LiveCodeEditor.jsx
// Live code editor with typing effect and scrollable view

import { useState, useEffect, useRef, useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, FileCode, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const getLanguage = (filename) => {
  if (!filename) return 'text';
  const ext = filename.split('.').pop().toLowerCase();
  const langMap = {
    js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
    py: 'python', json: 'json', html: 'html', css: 'css',
    md: 'markdown', yml: 'yaml', yaml: 'yaml', sh: 'bash',
    sql: 'sql', php: 'php', rb: 'ruby', go: 'go', rs: 'rust',
    java: 'java', kt: 'kotlin', swift: 'swift', c: 'c', cpp: 'cpp',
    env: 'bash', txt: 'text', xml: 'xml', toml: 'toml',
  };
  return langMap[ext] || 'text';
};

export function LiveCodeEditor({
  file,
  isTyping = false,
  typingSpeed = 5,
  className,
  maxHeight = '500px',
  showLineNumbers = true,
}) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const containerRef = useRef(null);
  const typingRef = useRef(null);
  const prevFileRef = useRef(null);

  const language = useMemo(() => getLanguage(file?.path), [file?.path]);
  const fullContent = file?.content || '';

  // Live typing effect
  useEffect(() => {
    if (!file) {
      setDisplayedContent('');
      return;
    }

    // If same file, just update content
    if (prevFileRef.current?.path === file.path && !isTyping) {
      setDisplayedContent(fullContent);
      return;
    }

    prevFileRef.current = file;

    if (isTyping && fullContent) {
      setDisplayedContent('');
      let index = 0;
      
      // Clear previous interval
      if (typingRef.current) {
        clearInterval(typingRef.current);
      }

      typingRef.current = setInterval(() => {
        if (index < fullContent.length) {
          // Type multiple characters per tick for speed
          const chunk = fullContent.slice(index, index + typingSpeed);
          setDisplayedContent(prev => prev + chunk);
          index += typingSpeed;
          
          // Auto-scroll to bottom
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          }
        } else {
          clearInterval(typingRef.current);
        }
      }, 10);

      return () => {
        if (typingRef.current) {
          clearInterval(typingRef.current);
        }
      };
    } else {
      setDisplayedContent(fullContent);
    }
  }, [file, fullContent, isTyping, typingSpeed]);

  const handleCopy = async () => {
    if (!fullContent) return;
    await navigator.clipboard.writeText(fullContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!file) {
    return (
      <div className={cn(
        'flex flex-col items-center justify-center h-64 text-gray-500 bg-[#1e1e1e] rounded-lg border border-white/10',
        className
      )}>
        <FileCode className="w-10 h-10 mb-3 opacity-30" />
        <span className="text-sm">Select a file to view code</span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col rounded-lg border border-white/10 bg-[#1e1e1e] overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-white/10">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-cyan-400" />
          <span className="text-cyan-400 font-mono text-sm truncate max-w-[200px]">
            {file.path}
          </span>
          <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded">
            {language}
          </span>
          {isTyping && displayedContent.length < fullContent.length && (
            <span className="text-xs text-green-400 animate-pulse">typing...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-white h-7 px-2"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="text-gray-400 hover:text-white h-7"
          >
            {copied ? (
              <><Check className="w-4 h-4 mr-1 text-green-400" /> Copied</>
            ) : (
              <><Copy className="w-4 h-4 mr-1" /> Copy</>
            )}
          </Button>
        </div>
      </div>

      {/* Code Content */}
      {isExpanded && (
        <div
          ref={containerRef}
          className="overflow-auto"
          style={{ maxHeight }}
        >
          <SyntaxHighlighter
            language={language}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: '1rem',
              background: 'transparent',
              fontSize: '0.8125rem',
              lineHeight: '1.6',
              minHeight: '100px',
            }}
            showLineNumbers={showLineNumbers}
            lineNumberStyle={{
              minWidth: '3em',
              paddingRight: '1em',
              color: '#4a5568',
              userSelect: 'none',
            }}
          >
            {displayedContent || ' '}
          </SyntaxHighlighter>
        </div>
      )}
    </div>
  );
}
