import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Bot, Send, Loader2, HelpCircle } from 'lucide-react';

export function ClarifyDialog({ questions, answers, onAnswerChange, onSubmit, isSubmitting }) {
  if (!questions || questions.length === 0) return null;

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="p-4 border-b border-white/5 bg-cyan-500/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-white">AI Agent Needs Clarification</h3>
            <p className="text-sm text-gray-400">Please answer these questions for better results</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {questions.map((question, index) => {
          const key = `q${index}`;
          return (
            <div key={index} className="space-y-2">
              <label className="flex items-start gap-2 text-sm text-white">
                <HelpCircle className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                <span>{question}</span>
              </label>
              <Textarea
                value={answers[key] || ''}
                onChange={(e) => onAnswerChange(key, e.target.value)}
                placeholder="Type your answer..."
                className="bg-black/40 border-white/10 text-white placeholder:text-gray-500 min-h-[80px]"
                disabled={isSubmitting}
              />
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t border-white/5">
        <Button
          onClick={onSubmit}
          disabled={isSubmitting || Object.keys(answers).length < questions.length}
          className="w-full btn-primary"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Submit Answers & Continue
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
