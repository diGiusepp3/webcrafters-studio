// frontend/src/components/AgentChatbox.jsx
import { useRef, useEffect } from "react";
import { Bot, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const ChatMessage = ({ message }) => {
  const isError = message.metadata?.error;
  const timestamp = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <div
      className={cn(
        "flex gap-3 p-3 rounded-lg",
        isError ? "bg-red-500/10" : "bg-white/5"
      )}
      data-testid="chat-message"
    >
      <div
        className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0",
          isError ? "bg-red-500/20" : "bg-cyan-500/20"
        )}
      >
        {isError ? (
          <AlertCircle className="w-4 h-4 text-red-400" />
        ) : (
          <Bot className="w-4 h-4 text-cyan-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn("text-xs font-medium", isError ? "text-red-400" : "text-cyan-400")}>
            Agent
          </span>
          {timestamp && (
            <span className="text-xs text-gray-600">{timestamp}</span>
          )}
        </div>
        <p className={cn("text-sm break-words", isError ? "text-red-300" : "text-gray-300")}>
          {message.message}
        </p>
      </div>
    </div>
  );
};

export function AgentChatbox({ messages = [], className }) {
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  if (!messages.length) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-8 text-gray-500", className)}>
        <Bot className="w-6 h-6 mb-2 opacity-50" />
        <span className="text-sm">Agent will narrate progress here...</span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)} data-testid="agent-chatbox">
      <div className="flex items-center gap-2 p-3 border-b border-white/5">
        <Bot className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-medium text-gray-300">Agent Chat</span>
        <span className="text-xs text-gray-500 ml-auto">{messages.length} messages</span>
      </div>
      
      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        <div className="space-y-2">
          {messages.map((msg, index) => (
            <ChatMessage key={index} message={msg} />
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
