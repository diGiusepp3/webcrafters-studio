// frontend/src/components/generator/ClarifyDialog.jsx
// Clarification questions dialog

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpCircle, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ClarifyDialog({
  questions = [],
  answers = {},
  onAnswerChange,
  onSubmit,
  isSubmitting = false,
  className,
}) {
  if (!questions || questions.length === 0) {
    return null;
  }

  return (
    <Card className={cn('bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-amber-400 text-lg">
          <HelpCircle className="w-5 h-5" />
          Clarification Needed
        </CardTitle>
        <p className="text-gray-400 text-sm">
          Please answer these questions to help us build exactly what you need.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {questions.map((question, index) => (
          <div key={index} className="space-y-2">
            <Label className="text-white font-medium">
              {index + 1}. {question}
            </Label>
            <Textarea
              value={answers[`q${index}`] || ''}
              onChange={(e) => onAnswerChange(`q${index}`, e.target.value)}
              placeholder="Your answer..."
              className="bg-black/40 border-white/10 text-white placeholder:text-gray-500 min-h-[80px]"
              disabled={isSubmitting}
            />
          </div>
        ))}

        <Button
          onClick={onSubmit}
          disabled={isSubmitting || Object.keys(answers).length === 0}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
          data-testid="clarify-submit"
        >
          {isSubmitting ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...</>
          ) : (
            <><Send className="w-4 h-4 mr-2" /> Continue Generation</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
