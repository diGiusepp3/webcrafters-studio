// frontend/src/components/generator/ProjectTypeSelector.jsx
// Project type selection component

import { cn } from '@/lib/utils';
import { Layers, Layout, Server, Code2, Globe, Terminal, Smartphone } from 'lucide-react';

const projectTypes = [
  { id: 'fullstack', name: 'Full-Stack', icon: Layers, description: 'Frontend + Backend + Database' },
  { id: 'frontend', name: 'Frontend', icon: Layout, description: 'React, Vue, or static site' },
  { id: 'backend', name: 'Backend', icon: Server, description: 'API, server, or CLI tool' },
  { id: 'any', name: 'Any', icon: Code2, description: 'Let AI decide the best approach' },
];

export function ProjectTypeSelector({ selected, onSelect, disabled = false }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {projectTypes.map((type) => {
        const Icon = type.icon;
        const isSelected = selected === type.id;
        
        return (
          <button
            key={type.id}
            type="button"
            onClick={() => !disabled && onSelect(type.id)}
            disabled={disabled}
            className={cn(
              'flex flex-col items-center gap-2 p-4 rounded-xl border transition-all',
              'hover:border-cyan-500/50 hover:bg-cyan-500/5',
              isSelected
                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                : 'border-white/10 bg-white/5 text-gray-400',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            data-testid={`project-type-${type.id}`}
          >
            <Icon className={cn('w-6 h-6', isSelected && 'text-cyan-400')} />
            <span className={cn('text-sm font-medium', isSelected && 'text-white')}>
              {type.name}
            </span>
            <span className="text-xs text-gray-500 text-center">
              {type.description}
            </span>
          </button>
        );
      })}    
    </div>
  );
}
