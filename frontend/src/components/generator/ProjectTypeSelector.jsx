import { Layers, Globe, Server, Smartphone, Terminal, Sparkles } from 'lucide-react';

const projectTypes = [
  {
    id: 'fullstack',
    name: 'Full-Stack',
    description: 'Frontend + Backend + Database',
    icon: <Layers className="w-5 h-5" />,
    gradient: 'from-violet-500 to-purple-500',
  },
  {
    id: 'frontend',
    name: 'Frontend',
    description: 'React, Vue, or vanilla web app',
    icon: <Globe className="w-5 h-5" />,
    gradient: 'from-cyan-500 to-blue-500',
  },
  {
    id: 'backend',
    name: 'Backend',
    description: 'API, server, or microservices',
    icon: <Server className="w-5 h-5" />,
    gradient: 'from-green-500 to-emerald-500',
  },
  {
    id: 'mobile',
    name: 'Mobile',
    description: 'iOS, Android, or cross-platform',
    icon: <Smartphone className="w-5 h-5" />,
    gradient: 'from-orange-500 to-amber-500',
  },
  {
    id: 'cli',
    name: 'CLI Tool',
    description: 'Command-line application',
    icon: <Terminal className="w-5 h-5" />,
    gradient: 'from-gray-500 to-slate-500',
  },
  {
    id: 'any',
    name: 'AI Decides',
    description: 'Let AI choose the best approach',
    icon: <Sparkles className="w-5 h-5" />,
    gradient: 'from-pink-500 to-rose-500',
  },
];

export function ProjectTypeSelector({ selected, onSelect, disabled }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {projectTypes.map((type) => (
        <button
          key={type.id}
          onClick={() => !disabled && onSelect(type.id)}
          disabled={disabled}
          className={`relative p-4 rounded-xl text-left transition-all ${
            selected === type.id
              ? 'bg-gradient-to-br ' + type.gradient + ' bg-opacity-20 border-2 border-white/30 shadow-lg'
              : 'bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          data-testid={`project-type-${type.id}`}
        >
          <div className={`w-10 h-10 rounded-lg mb-3 flex items-center justify-center ${
            selected === type.id
              ? 'bg-white/20 text-white'
              : 'bg-gradient-to-br ' + type.gradient + ' text-white'
          }`}>
            {type.icon}
          </div>
          <h4 className={`font-medium mb-1 ${
            selected === type.id ? 'text-white' : 'text-gray-200'
          }`}>
            {type.name}
          </h4>
          <p className={`text-xs ${
            selected === type.id ? 'text-white/70' : 'text-gray-500'
          }`}>
            {type.description}
          </p>
          
          {/* Selection indicator */}
          {selected === type.id && (
            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white flex items-center justify-center">
              <svg className="w-3 h-3 text-violet-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
