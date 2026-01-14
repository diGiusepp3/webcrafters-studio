// frontend/src/pages/Studio.jsx
// Live Coding Agent Studio - The main workspace
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  Send,
  Code,
  Eye,
  FileCode,
  Loader2,
  CheckCircle,
  XCircle,
  ChevronRight,
  Play,
  RefreshCw,
  Download,
  Copy,
  Sparkles,
  MessageSquare,
  FolderTree,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';
const WS_URL = BACKEND_URL.replace('http', 'ws');

// Status badge component
const StatusBadge = ({ status }) => {
  const statusConfig = {
    idle: { color: "bg-gray-500", label: "Idle", icon: null },
    thinking: { color: "bg-yellow-500 animate-pulse", label: "Thinking...", icon: Loader2 },
    generating: { color: "bg-cyan-500 animate-pulse", label: "Generating...", icon: Sparkles },
    building: { color: "bg-purple-500 animate-pulse", label: "Building...", icon: RefreshCw },
    testing: { color: "bg-orange-500 animate-pulse", label: "Testing...", icon: Play },
    done: { color: "bg-green-500", label: "Ready", icon: CheckCircle },
    error: { color: "bg-red-500", label: "Error", icon: XCircle },
  };
  
  const config = statusConfig[status] || statusConfig.idle;
  const Icon = config.icon;
  
  return (
    <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full text-white text-sm", config.color)}>
      {Icon && <Icon className="w-4 h-4" />}
      {config.label}
    </div>
  );
};

// Chat message component
const ChatMessage = ({ message, isUser }) => (
  <div className={cn("flex gap-3 p-4", isUser ? "bg-white/5" : "bg-cyan-500/5")}>
    <div className={cn(
      "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
      isUser ? "bg-blue-500/20" : "bg-cyan-500/20"
    )}>
      {isUser ? (
        <MessageSquare className="w-4 h-4 text-blue-400" />
      ) : (
        <Bot className="w-4 h-4 text-cyan-400" />
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">
        {message.content}
      </p>
      {message.metadata?.files?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {message.metadata.files.map((file, i) => (
            <span key={i} className="text-xs bg-white/10 px-2 py-1 rounded text-cyan-400">
              {file.path}
            </span>
          ))}
        </div>
      )}
    </div>
  </div>
);

// File tree item
const FileTreeItem = ({ file, isSelected, onClick }) => {
  const getLanguage = (path) => {
    const ext = path.split('.').pop();
    const langMap = {
      js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
      py: 'python', css: 'css', html: 'html', json: 'json',
      md: 'markdown', sql: 'sql', sh: 'bash'
    };
    return langMap[ext] || 'text';
  };

  return (
    <button
      onClick={() => onClick(file)}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded transition-colors",
        isSelected
          ? "bg-cyan-500/20 text-cyan-400"
          : "text-gray-400 hover:bg-white/5 hover:text-white"
      )}
    >
      <FileCode className="w-4 h-4 flex-shrink-0" />
      <span className="truncate">{file.path}</span>
      <span className="ml-auto text-xs text-gray-600">{file.lines}L</span>
    </button>
  );
};

export default function Studio() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  
  const [ws, setWs] = useState(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("idle");
  const [currentStep, setCurrentStep] = useState("");
  
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState("");
  
  const [previewUrl, setPreviewUrl] = useState(null);
  const [activeTab, setActiveTab] = useState("chat"); // chat | files | preview
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  
  // Generate session ID if not provided
  const currentSessionId = sessionId || `session-${Date.now()}`;
  
  // Connect to WebSocket
  useEffect(() => {
    const wsUrl = `${WS_URL}/ws/agent/${currentSessionId}`;
    console.log("Connecting to:", wsUrl);
    
    const socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
      console.log("WebSocket connected");
      setConnected(true);
    };
    
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("WS message:", data);
      handleWsMessage(data);
    };
    
    socket.onclose = () => {
      console.log("WebSocket disconnected");
      setConnected(false);
    };
    
    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
    
    setWs(socket);
    
    return () => {
      socket.close();
    };
  }, [currentSessionId]);
  
  // Handle WebSocket messages
  const handleWsMessage = useCallback((data) => {
    switch (data.type) {
      case "connected":
        setStatus(data.state?.status || "idle");
        if (data.state?.files) {
          setFiles(data.state.files.map(f => ({ path: f, lines: 0 })));
        }
        // Add welcome message
        setMessages(prev => [...prev, {
          role: "assistant",
          content: data.message || "Connected! Tell me what you'd like to build.",
          timestamp: new Date().toISOString()
        }]);
        break;
        
      case "status":
        setStatus(data.status);
        setCurrentStep(data.step || "");
        // Add status message to chat
        setMessages(prev => [...prev, {
          role: "assistant",
          content: data.message,
          timestamp: new Date().toISOString(),
          isStatus: true
        }]);
        break;
        
      case "files_updated":
        // Refresh files list
        if (ws) {
          ws.send(JSON.stringify({ type: "get_files" }));
        }
        break;
        
      case "all_files":
        setFiles(data.files || []);
        break;
        
      case "file_content":
        setFileContent(data.content || "");
        break;
        
      case "preview_ready":
        setPreviewUrl(data.preview_url);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: data.message,
          timestamp: new Date().toISOString()
        }]);
        break;
        
      case "agent_response":
        setStatus("done");
        setSending(false);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: data.message,
          timestamp: new Date().toISOString(),
          nextSteps: data.next_steps
        }]);
        // Refresh files
        if (ws) {
          ws.send(JSON.stringify({ type: "get_files" }));
        }
        break;
        
      case "error":
        setStatus("error");
        setSending(false);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `❌ Error: ${data.error}`,
          timestamp: new Date().toISOString(),
          isError: true
        }]);
        break;
        
      case "history":
        setMessages(data.messages || []);
        break;
        
      default:
        console.log("Unknown message type:", data.type);
    }
  }, [ws]);
  
  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  
  // Send message
  const sendMessage = () => {
    if (!input.trim() || !ws || !connected || sending) return;
    
    // Add user message
    setMessages(prev => [...prev, {
      role: "user",
      content: input,
      timestamp: new Date().toISOString()
    }]);
    
    // Send to WebSocket
    ws.send(JSON.stringify({
      type: "message",
      content: input
    }));
    
    setInput("");
    setSending(true);
    setStatus("thinking");
  };
  
  // Select file
  const selectFile = (file) => {
    setSelectedFile(file);
    if (ws) {
      ws.send(JSON.stringify({
        type: "get_file",
        path: file.path
      }));
    }
    setActiveTab("files");
  };
  
  // Get language for syntax highlighting
  const getLanguage = (path) => {
    if (!path) return 'text';
    const ext = path.split('.').pop();
    const langMap = {
      js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
      py: 'python', css: 'css', html: 'html', json: 'json',
      md: 'markdown', sql: 'sql', sh: 'bash'
    };
    return langMap[ext] || 'text';
  };

  return (
    <div className="min-h-screen bg-[#030712] flex flex-col">
      <Navbar />
      
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-3 flex items-center justify-between bg-black/40">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-cyan-400" />
            <span className="font-medium text-white">Coding Agent</span>
          </div>
          <StatusBadge status={status} />
          {currentStep && (
            <span className="text-sm text-gray-400">{currentStep}</span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {!connected && (
            <span className="text-sm text-red-400 flex items-center gap-1">
              <XCircle className="w-4 h-4" /> Disconnected
            </span>
          )}
          {previewUrl && (
            <Button
              variant="outline"
              size="sm"
              className="border-green-500/50 text-green-400"
              onClick={() => setActiveTab("preview")}
            >
              <Eye className="w-4 h-4 mr-1" />
              Preview
            </Button>
          )}
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Chat */}
        <div className="w-1/2 border-r border-white/10 flex flex-col">
          {/* Chat Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-2">
              {messages.map((msg, i) => (
                <ChatMessage
                  key={i}
                  message={msg}
                  isUser={msg.role === "user"}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          
          {/* Input */}
          <div className="p-4 border-t border-white/10 bg-black/40">
            <div className="flex gap-2">
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Describe what you want to build or change..."
                className="flex-1 min-h-[60px] max-h-[200px] bg-black/60 border-white/10 text-white resize-none"
                disabled={!connected || sending}
              />
              <Button
                onClick={sendMessage}
                disabled={!connected || !input.trim() || sending}
                className="bg-cyan-500 text-black font-bold px-6 hover:bg-cyan-400"
              >
                {sending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
        
        {/* Right Panel - Files/Preview */}
        <div className="w-1/2 flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-white/10 bg-black/40">
            <button
              onClick={() => setActiveTab("files")}
              className={cn(
                "px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors",
                activeTab === "files"
                  ? "border-cyan-500 text-cyan-400"
                  : "border-transparent text-gray-400 hover:text-white"
              )}
            >
              <FolderTree className="w-4 h-4" />
              Files ({files.length})
            </button>
            <button
              onClick={() => setActiveTab("preview")}
              className={cn(
                "px-4 py-3 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors",
                activeTab === "preview"
                  ? "border-cyan-500 text-cyan-400"
                  : "border-transparent text-gray-400 hover:text-white"
              )}
            >
              <Eye className="w-4 h-4" />
              Preview
            </button>
          </div>
          
          {/* Files Tab */}
          {activeTab === "files" && (
            <div className="flex-1 flex overflow-hidden">
              {/* File List */}
              <div className="w-1/3 border-r border-white/10 p-2 overflow-y-auto">
                {files.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileCode className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No files yet</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {files.map((file, i) => (
                      <FileTreeItem
                        key={i}
                        file={file}
                        isSelected={selectedFile?.path === file.path}
                        onClick={selectFile}
                      />
                    ))}
                  </div>
                )}
              </div>
              
              {/* File Content */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {selectedFile ? (
                  <>
                    <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between bg-black/40">
                      <span className="text-sm text-cyan-400 font-mono">
                        {selectedFile.path}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigator.clipboard.writeText(fileContent)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <ScrollArea className="flex-1">
                      <SyntaxHighlighter
                        language={getLanguage(selectedFile.path)}
                        style={oneDark}
                        customStyle={{
                          margin: 0,
                          padding: '1rem',
                          background: 'transparent',
                          fontSize: '0.875rem'
                        }}
                        showLineNumbers
                      >
                        {fileContent}
                      </SyntaxHighlighter>
                    </ScrollArea>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <Code className="w-12 h-12 mx-auto mb-4 opacity-30" />
                      <p>Select a file to view</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Preview Tab */}
          {activeTab === "preview" && (
            <div className="flex-1 flex flex-col">
              {previewUrl ? (
                <>
                  <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between bg-black/40">
                    <span className="text-sm text-gray-400">
                      {previewUrl}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(previewUrl, "_blank")}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex-1 bg-white">
                    <iframe
                      src={`${BACKEND_URL}${previewUrl}`}
                      className="w-full h-full border-0"
                      title="Preview"
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <Eye className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>Preview will appear here</p>
                    <p className="text-sm text-gray-600 mt-1">once the agent builds your app</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
