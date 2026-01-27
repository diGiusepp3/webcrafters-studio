import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import {
  Code2, Zap, Download, ArrowRight, Sparkles, Layers, FileCode,
  Bot, Shield, Cpu, GitBranch, Terminal, Rocket, Check, Star,
  Play, Eye, RefreshCw, Lock, Gauge, Globe, ChevronRight
} from 'lucide-react';

const features = [
  {
    icon: <Bot className="w-6 h-6" />,
    title: 'Autonomous AI Agent',
    description: 'A real AI agent that thinks, plans, writes code, tests, and iterates until your project is perfect.',
    gradient: 'from-cyan-500 to-blue-500'
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: 'Built-in Security Scans',
    description: 'Every generated project is automatically scanned for vulnerabilities, secrets, and security issues.',
    gradient: 'from-green-500 to-emerald-500'
  },
  {
    icon: <Terminal className="w-6 h-6" />,
    title: 'Live Code Preview',
    description: 'Watch your code being written in real-time with syntax highlighting and instant preview.',
    gradient: 'from-violet-500 to-purple-500'
  },
  {
    icon: <RefreshCw className="w-6 h-6" />,
    title: 'Auto-Fix & Iterate',
    description: 'AI automatically detects and fixes errors, missing dependencies, and code issues.',
    gradient: 'from-orange-500 to-amber-500'
  },
  {
    icon: <Layers className="w-6 h-6" />,
    title: 'Full-Stack & More',
    description: 'Generate React, Vue, FastAPI, Django, mobile apps, CLI tools, or any tech stack you need.',
    gradient: 'from-pink-500 to-rose-500'
  },
  {
    icon: <Download className="w-6 h-6" />,
    title: 'Production-Ready Export',
    description: 'Download complete projects with proper architecture, configs, tests, and documentation.',
    gradient: 'from-cyan-500 to-teal-500'
  }
];

const steps = [
  {
    step: '01',
    title: 'Describe Your Vision',
    description: 'Write what you want to build in plain language. Be as detailed or brief as you like.',
    icon: <Sparkles className="w-8 h-8" />
  },
  {
    step: '02',
    title: 'AI Plans & Clarifies',
    description: 'The agent analyzes your request, asks clarifying questions if needed, and creates a plan.',
    icon: <Bot className="w-8 h-8" />
  },
  {
    step: '03',
    title: 'Watch It Build',
    description: 'See your code being written in real-time with live preview and security analysis.',
    icon: <Code2 className="w-8 h-8" />
  },
  {
    step: '04',
    title: 'Review & Download',
    description: 'Preview the running app, review all files, and download the production-ready project.',
    icon: <Rocket className="w-8 h-8" />
  }
];

const testimonials = [
  {
    quote: "This saved me weeks of boilerplate work. The code quality is surprisingly good.",
    author: "Sarah Chen",
    role: "Senior Developer at TechCorp",
    avatar: "SC"
  },
  {
    quote: "Finally, an AI tool that actually understands what I want to build.",
    author: "Marcus Johnson",
    role: "Startup Founder",
    avatar: "MJ"
  },
  {
    quote: "The security scanning feature alone is worth it. Caught issues I would have missed.",
    author: "Alex Rivera",
    role: "Security Engineer",
    avatar: "AR"
  }
];

const stats = [
  { value: '50K+', label: 'Projects Generated' },
  { value: '10K+', label: 'Happy Developers' },
  { value: '99.9%', label: 'Uptime' },
  { value: '<30s', label: 'Avg Generation Time' }
];

export default function Landing() {
  const [activeFeature, setActiveFeature] = useState(0);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const demoRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="min-h-screen bg-[#030712] overflow-hidden">
      <Navbar />

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center">
        {/* Animated background */}
        <div className="absolute inset-0">
          {/* Gradient orbs */}
          <div 
            className="absolute w-[800px] h-[800px] rounded-full opacity-20 blur-[120px] transition-all duration-1000"
            style={{
              background: 'radial-gradient(circle, rgba(6, 182, 212, 0.4) 0%, transparent 70%)',
              left: `${mousePosition.x * 0.02}px`,
              top: `${mousePosition.y * 0.02}px`,
            }}
          />
          <div 
            className="absolute right-0 bottom-0 w-[600px] h-[600px] rounded-full opacity-20 blur-[100px]"
            style={{
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.4) 0%, transparent 70%)',
            }}
          />
          
          {/* Grid pattern */}
          <div 
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px'
            }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 py-20">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left: Text */}
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
                <span className="text-sm text-cyan-400 font-medium">AI-Powered Code Generation Platform</span>
              </div>

              <h1 className="font-heading text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white mb-6 leading-[1.1]" data-testid="hero-title">
                Build Apps With
                <span className="block gradient-text">Your AI Agent</span>
              </h1>

              <p className="text-lg sm:text-xl text-gray-400 mb-8 leading-relaxed max-w-xl">
                Describe what you want. Watch an autonomous AI agent plan, code, test, 
                and deliver production-ready applications in minutes.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <Link to="/register" data-testid="hero-cta">
                  <Button className="w-full sm:w-auto btn-primary text-lg px-8 py-6 pulse-neon">
                    Start Building Free
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto glass-card border-white/10 text-white text-lg px-8 py-6 hover:bg-white/5"
                  onClick={() => demoRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  data-testid="hero-watch-demo"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Watch Demo
                </Button>
              </div>

              {/* Trust badges */}
              <div className="flex items-center gap-6 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  No credit card required
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  Free tier included
                </div>
              </div>
            </div>

            {/* Right: Terminal mockup */}
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/20 to-violet-500/20 rounded-3xl blur-2xl opacity-50" />
              
              <div className="relative glass-card rounded-2xl overflow-hidden">
                {/* Terminal header */}
                <div className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                  <div className="flex items-center gap-2 text-gray-500 text-sm font-mono">
                    <Terminal className="w-4 h-4" />
                    webcrafters-agent
                  </div>
                  <div className="w-16" />
                </div>

                {/* Terminal content */}
                <div className="p-6 font-mono text-sm space-y-4">
                  <div className="flex items-start gap-3">
                    <span className="text-cyan-400">❯</span>
                    <div>
                      <span className="text-gray-400">Prompt: </span>
                      <span className="text-white">Build a SaaS dashboard with auth, billing, and analytics</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-gray-400">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      <span>Analyzing requirements...</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      <span>Planning architecture...</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      <span>Generating 24 files...</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      <span>Running security scan...</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-cyan-400">Building preview...</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-green-400">✓ Project ready!</span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">24 files</span>
                        <span className="text-gray-600">•</span>
                        <span className="text-gray-500">28.4s</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating badges */}
              <div className="absolute -right-4 top-1/4 glass-card px-3 py-2 rounded-lg float" style={{ animationDelay: '0.5s' }}>
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="w-4 h-4 text-green-500" />
                  <span className="text-white">Security: Passed</span>
                </div>
              </div>
              
              <div className="absolute -left-4 bottom-1/4 glass-card px-3 py-2 rounded-lg float" style={{ animationDelay: '1s' }}>
                <div className="flex items-center gap-2 text-sm">
                  <Gauge className="w-4 h-4 text-cyan-500" />
                  <span className="text-white">Performance: 98</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative py-16 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl font-bold gradient-text mb-2">{stat.value}</div>
                <div className="text-gray-400 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent" />
        
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-6">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-gray-300">Powerful Features</span>
            </div>
            <h2 className="font-heading text-4xl sm:text-5xl font-bold text-white mb-4" data-testid="features-title">
              Everything You Need to Ship Fast
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto text-lg">
              A complete AI development environment that handles the hard parts
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="glass-card p-6 rounded-2xl group cursor-pointer"
                onMouseEnter={() => setActiveFeature(index)}
                data-testid={`feature-${index}`}
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} p-0.5 mb-4`}>
                  <div className="w-full h-full rounded-xl bg-[#0a0f1a] flex items-center justify-center text-white">
                    {feature.icon}
                  </div>
                </div>
                <h3 className="font-heading text-xl font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-6">
              <GitBranch className="w-4 h-4 text-violet-400" />
              <span className="text-sm text-gray-300">How It Works</span>
            </div>
            <h2 className="font-heading text-4xl sm:text-5xl font-bold text-white mb-4" data-testid="how-it-works-title">
              From Idea to Running Code
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto text-lg">
              Four simple steps to your next production-ready project
            </p>
          </div>

          <div className="relative">
            {/* Connection line */}
            <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500/50 via-violet-500/50 to-cyan-500/50" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {steps.map((item, index) => (
                <div key={index} className="relative" data-testid={`step-${index}`}>
                  <div className="glass-card p-6 rounded-2xl text-center relative z-10">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-500 p-0.5 mx-auto mb-4">
                      <div className="w-full h-full rounded-2xl bg-[#0a0f1a] flex items-center justify-center text-cyan-400">
                        {item.icon}
                      </div>
                    </div>
                    <div className="text-5xl font-heading font-bold text-cyan-500/20 mb-2">
                      {item.step}
                    </div>
                    <h3 className="font-heading text-xl font-bold text-white mb-2">
                      {item.title}
                    </h3>
                    <p className="text-gray-400 text-sm">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-violet-500/5" />
        
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-6">
              <Star className="w-4 h-4 text-yellow-400" />
              <span className="text-sm text-gray-300">Testimonials</span>
            </div>
            <h2 className="font-heading text-4xl sm:text-5xl font-bold text-white mb-4">
              Loved by Developers
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="glass-card p-6 rounded-2xl">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-300 mb-6 leading-relaxed">
                  "{testimonial.quote}"
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="text-white font-medium">{testimonial.author}</div>
                    <div className="text-gray-500 text-sm">{testimonial.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-violet-500/10" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.15),transparent_70%)]" />
        </div>
        
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <div className="glass-card p-12 rounded-3xl">
            <h2 className="font-heading text-4xl sm:text-5xl font-bold text-white mb-6" data-testid="cta-title">
              Ready to Build Something
              <span className="gradient-text"> Amazing?</span>
            </h2>
            <p className="text-gray-400 mb-8 text-lg max-w-2xl mx-auto">
              Join thousands of developers who are shipping faster with AI-powered code generation.
              Start building for free today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/register">
                <Button className="btn-primary text-lg px-8 py-6 pulse-neon" data-testid="cta-btn">
                  Get Started Free
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" className="glass-card border-white/10 text-white text-lg px-8 py-6 hover:bg-white/5">
                  Sign In
                  <ChevronRight className="w-5 h-5 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
