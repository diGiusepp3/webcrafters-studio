import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Navbar } from '../components/Navbar';
import { Code2, Zap, Download, History, ArrowRight, Sparkles, Layers, FileCode } from 'lucide-react';

const features = [
  {
    icon: <Sparkles className="w-6 h-6" />,
    title: 'AI-Powered Generation',
    description: 'Describe your app in plain English. Our GPT-5.2 powered engine generates production-ready code instantly.'
  },
  {
    icon: <Layers className="w-6 h-6" />,
    title: 'Full-Stack & Beyond',
    description: 'Generate React + FastAPI apps, frontend-only projects, or any language/framework you need.'
  },
  {
    icon: <FileCode className="w-6 h-6" />,
    title: 'Complete File Structure',
    description: 'Get a full project with proper architecture, configuration files, and documentation included.'
  },
  {
    icon: <Download className="w-6 h-6" />,
    title: 'Instant Download',
    description: 'Download your generated project as a ZIP file. Ready to run with minimal setup required.'
  }
];

const steps = [
  { step: '01', title: 'Describe Your App', description: 'Write a natural language prompt describing what you want to build' },
  { step: '02', title: 'AI Generates Code', description: 'GPT-5.2 analyzes your requirements and creates the complete project' },
  { step: '03', title: 'Review & Download', description: 'Preview the generated files, then download as a ZIP to start building' }
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#030712]">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1759735541630-036eefb7cd3a?crop=entropy&cs=srgb&fm=jpg&q=85')] bg-cover bg-center opacity-10" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#030712]/80 to-[#030712]" />
        
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }} />
        
        <div className="relative max-w-7xl mx-auto px-6 pt-24 pb-32">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm mb-8">
              <Zap className="w-4 h-4" />
              Powered by OpenAI GPT-5.2
            </div>
            
            <h1 className="font-heading text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white mb-6" data-testid="hero-title">
              Turn Ideas Into
              <span className="block bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent">
                Working Code
              </span>
            </h1>
            
            <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Describe your application in plain English. CodeForge generates complete, 
              production-ready code with proper architecture, ready to download and run.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/register" data-testid="hero-cta">
                <Button className="w-full sm:w-auto bg-cyan-500 text-black font-bold text-lg px-8 py-6 hover:bg-cyan-400 transition-all hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] pulse-neon">
                  Start Building Free
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link to="/login" data-testid="hero-login">
                <Button variant="outline" className="w-full sm:w-auto border-white/20 text-white text-lg px-8 py-6 hover:bg-white/5">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
          
          {/* Code preview mockup */}
          <div className="mt-20 relative">
            <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 to-violet-500/20 rounded-2xl blur-2xl" />
            <div className="relative bg-[#0f172a] rounded-xl border border-white/10 overflow-hidden shadow-2xl">
              <div className="flex items-center gap-2 px-4 py-3 bg-black/40 border-b border-white/10">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <span className="text-gray-500 text-sm ml-2 font-mono">codeforge_demo.py</span>
              </div>
              <pre className="p-6 text-sm font-mono overflow-x-auto">
                <code className="text-gray-300">
                  <span className="text-violet-400">from</span> <span className="text-cyan-400">codeforge</span> <span className="text-violet-400">import</span> generate{'\n\n'}
                  <span className="text-gray-500"># Describe your app in plain English</span>{'\n'}
                  prompt = <span className="text-green-400">"Build a task management app with user auth,{'\n'}          drag-and-drop boards, and real-time updates"</span>{'\n\n'}
                  <span className="text-gray-500"># Generate complete project code</span>{'\n'}
                  project = <span className="text-cyan-400">generate</span>(prompt){'\n\n'}
                  <span className="text-gray-500"># Download as ZIP</span>{'\n'}
                  project.<span className="text-yellow-400">download</span>(<span className="text-green-400">"task-manager.zip"</span>){'\n'}
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>
      
      {/* Features Section */}
      <section className="py-24 bg-[#0f172a]/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white mb-4" data-testid="features-title">
              Everything You Need to Ship Fast
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              From idea to running code in minutes, not days
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="p-6 rounded-xl bg-black/40 backdrop-blur-xl border border-white/10 hover:border-cyan-500/30 transition-all group"
                data-testid={`feature-${index}`}
              >
                <div className="w-12 h-12 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400 mb-4 group-hover:bg-cyan-500/20 transition-colors">
                  {feature.icon}
                </div>
                <h3 className="font-heading text-xl font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* How It Works */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white mb-4" data-testid="how-it-works-title">
              How It Works
            </h2>
            <p className="text-gray-400">Three simple steps to your next project</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((item, index) => (
              <div key={index} className="relative" data-testid={`step-${index}`}>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-full w-full h-px bg-gradient-to-r from-cyan-500/50 to-transparent -translate-x-8" />
                )}
                <div className="text-5xl font-heading font-black text-cyan-500/20 mb-4">{item.step}</div>
                <h3 className="font-heading text-xl font-bold text-white mb-2">{item.title}</h3>
                <p className="text-gray-400">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-violet-500/10" />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white mb-6" data-testid="cta-title">
            Ready to Build Something Amazing?
          </h2>
          <p className="text-gray-400 mb-8 text-lg">
            Join developers who are shipping faster with AI-powered code generation
          </p>
          <Link to="/register">
            <Button className="bg-cyan-500 text-black font-bold text-lg px-8 py-6 hover:bg-cyan-400 transition-all hover:shadow-[0_0_30px_rgba(6,182,212,0.5)]" data-testid="cta-btn">
              Get Started Free
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>
      
      {/* Footer */}
      <footer className="py-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-cyan-400" />
            <span className="font-heading font-bold text-white">CodeForge</span>
          </div>
          <p className="text-gray-500 text-sm">
            2024 CodeForge. AI-Powered Code Generation.
          </p>
        </div>
      </footer>
    </div>
  );
}
