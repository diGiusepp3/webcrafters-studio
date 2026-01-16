import { useRef, useEffect } from 'react';
import { Bot, User, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function ChatMessage({ message, isUser }) {
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
        isUser 
          ? 'bg-violet-500/20 text-violet-400' 
          : 'bg-cyan-500/20 text-cyan-400'
      }`}>
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className={`flex-1 max-w-[85%] ${
        isUser ? 'text-right' : 'text-left'
      }`}>
        <div className={`inline-block p-2.5 rounded-xl text-sm ${
          isUser 
            ? 'bg-violet-500/10 border border-violet-500/20 text-white' 
            : 'bg-white/5 border border-white/10 text-gray-300'
        }`}>
          <p className="whitespace-pre-wrap break-words">{message.message || message.content}</p>
        </div>
        {message.timestamp && (
          <p className="text-[10px] text-gray-600 mt-1">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </div>
  );
}

export function AgentChatbox({ 
  messages, 
  inputValue, 
  onInputChange, 
  onSend, 
  isLoading, 
  className = '' 
}) {
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend?.();
    }
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-4">
            <Bot className="w-6 h-6 mx-auto mb-2 opacity-50" />
            <p>No messages yet</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <ChatMessage
              key={index}
              message={msg}
              isUser={msg.metadata?.role === 'user'}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {onInputChange && (
        <div className="p-2 border-t border-white/5">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the AI agent..."
              className="flex-1 bg-black/40 border-white/10 text-white placeholder:text-gray-500 text-sm"
              disabled={isLoading}
            />
            <Button
              onClick={onSend}
              disabled={isLoading || !inputValue?.trim()}
              size="icon"
              className="bg-cyan-500 hover:bg-cyan-600 text-black"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
