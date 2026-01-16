import { useState, useEffect, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Loader2, FileCode } from 'lucide-react';

const customStyle = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    background: 'transparent',
    margin: 0,
    padding: '1rem',
    fontSize: '0.875rem',
    lineHeight: '1.6',
  },
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    background: 'transparent',
    fontFamily: "'JetBrains Mono', monospace",
  },
};

export function LiveCodeEditor({ file, isTyping, className = '', maxHeight = 'auto' }) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);
  const contentRef = useRef('');
  const animationRef = useRef(null);

  // Detect language from file path
  const detectLanguage = (path) => {
    if (!path) return 'text';
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const langMap = {
      js: 'javascript',
      jsx: 'jsx',
      ts: 'typescript',
      tsx: 'tsx',
      py: 'python',
      html: 'html',
      css: 'css',
      json: 'json',
      md: 'markdown',
      yml: 'yaml',
      yaml: 'yaml',
      sh: 'bash',
      bash: 'bash',
      sql: 'sql',
      go: 'go',
      rs: 'rust',
      java: 'java',
      kt: 'kotlin',
      swift: 'swift',
      rb: 'ruby',
      php: 'php',
      c: 'c',
      cpp: 'cpp',
      cs: 'csharp',
      xml: 'xml',
      svg: 'xml',
    };
    return langMap[ext] || 'text';
  };

  // Handle typing animation
  useEffect(() => {
    if (!file?.content) {
      setDisplayedContent('');
      return;
    }

    const newContent = file.content;

    // If typing animation is active, animate the content
    if (isTyping && newContent !== contentRef.current) {
      setIsAnimating(true);
      const startIndex = contentRef.current.length;
      let currentIndex = startIndex;

      // Clear previous animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      const animate = () => {
        if (currentIndex < newContent.length) {
          // Type multiple characters at once for speed
          const charsToAdd = Math.min(10, newContent.length - currentIndex);
          currentIndex += charsToAdd;
          setDisplayedContent(newContent.substring(0, currentIndex));
          animationRef.current = requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
          contentRef.current = newContent;
        }
      };

      animationRef.current = requestAnimationFrame(animate);
    } else {
      // No animation, just set content
      setDisplayedContent(newContent);
      contentRef.current = newContent;
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [file?.content, file?.path, isTyping]);

  if (!file) {
    return (
      <div className={`flex items-center justify-center h-full bg-[#0a0f1a] ${className}`}>
        <div className="text-center text-gray-500">
          <FileCode className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Select a file to view its content</p>
        </div>
      </div>
    );
  }

  const language = file.language || detectLanguage(file.path);

  return (
    <div className={`relative bg-[#0a0f1a] ${className}`} style={{ maxHeight, overflow: 'auto' }}>
      {/* Typing indicator */}
      {isAnimating && (
        <div className="absolute top-2 right-2 flex items-center gap-2 px-2 py-1 rounded-md bg-cyan-500/20 text-cyan-400 text-xs">
          <Loader2 className="w-3 h-3 animate-spin" />
          Writing...
        </div>
      )}

      <SyntaxHighlighter
        language={language}
        style={customStyle}
        showLineNumbers
        lineNumberStyle={{
          minWidth: '3em',
          paddingRight: '1em',
          color: '#4a5568',
          userSelect: 'none',
        }}
        customStyle={{
          background: 'transparent',
          margin: 0,
          padding: 0,
        }}
      >
        {displayedContent || '// Empty file'}
      </SyntaxHighlighter>

      {/* Cursor animation when typing */}
      {isAnimating && (
        <span className="inline-block w-2 h-5 bg-cyan-400 animate-pulse ml-1" />
      )}
    </div>
  );
}
