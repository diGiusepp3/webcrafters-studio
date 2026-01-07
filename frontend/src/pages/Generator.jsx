import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Navbar } from '../components/Navbar';
import { 
  Sparkles, Loader2, AlertCircle, Wand2, Code2, Layout, 
  Server, Layers, ChevronRight 
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const projectTypes = [
  { 
    id: 'fullstack', 
    name: 'Full-Stack', 
    icon: <Layers className="w-5 h-5" />,
    description: 'React + FastAPI + MongoDB'
  },
  { 
    id: 'frontend', 
    name: 'Frontend', 
    icon: <Layout className="w-5 h-5" />,
    description: 'React with Tailwind CSS'
  },
  { 
    id: 'backend', 
    name: 'Backend', 
    icon: <Server className="w-5 h-5" />,
    description: 'FastAPI + MongoDB'
  },
  { 
    id: 'any', 
    name: 'Any', 
    icon: <Code2 className="w-5 h-5" />,
    description: 'Any language/framework'
  }
];

const examplePrompts = [
  "Build a task management app with user authentication, drag-and-drop boards, and task assignments",
  "Create a blog platform with markdown support, categories, and a comment system",
  "Make a weather dashboard that shows forecasts, historical data, and location search",
  "Build an e-commerce product catalog with filtering, sorting, and a shopping cart"
];

export default function Generator() {
  const [prompt, setPrompt] = useState('');
  const [projectType, setProjectType] = useState('fullstack');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please describe your application');
      return;
    }
    
    setError('');
    setLoading(true);
    
    try {
      const response = await axios.post(`${API}/generate`, {
        prompt: prompt.trim(),
        project_type: projectType
      });
      
      navigate(`/project/${response.data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Generation failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#030712]">
      <Navbar />
      
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm mb-6">
            <Wand2 className="w-4 h-4" />
            AI Code Generator
          </div>
          <h1 className="font-heading text-4xl font-bold text-white mb-4" data-testid="generator-title">
            What would you like to build?
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Describe your application in detail. The more specific you are, the better the generated code will be.
          </p>
        </div>

        {/* Main Card */}
        <Card className="bg-black/40 backdrop-blur-xl border-white/10" data-testid="generator-card">
          <CardHeader>
            <CardTitle className="font-heading text-xl text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              Project Configuration
            </CardTitle>
            <CardDescription className="text-gray-400">
              Choose a project type and describe what you want to build
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Project Type Selection */}
            <div className="space-y-3">
              <Label className="text-gray-300">Project Type</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {projectTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setProjectType(type.id)}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      projectType === type.id 
                        ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400' 
                        : 'bg-black/30 border-white/10 text-gray-400 hover:border-white/20'
                    }`}
                    data-testid={`type-${type.id}`}
                  >
                    <div className={`mb-2 ${projectType === type.id ? 'text-cyan-400' : 'text-gray-500'}`}>
                      {type.icon}
                    </div>
                    <div className="font-medium text-white text-sm">{type.name}</div>
                    <div className="text-xs mt-1 opacity-70">{type.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Input */}
            <div className="space-y-3">
              <Label htmlFor="prompt" className="text-gray-300">Application Description</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your application in detail. Include features, functionality, and any specific requirements..."
                className="min-h-[200px] bg-black/50 border-white/10 focus:border-cyan-500 focus:ring-cyan-500/20 text-white placeholder:text-gray-500 font-mono text-sm resize-none"
                data-testid="prompt-input"
              />
              <p className="text-xs text-gray-500">
                Tip: Be specific about features, data models, and user flows for better results
              </p>
            </div>

            {/* Example Prompts */}
            <div className="space-y-3">
              <Label className="text-gray-300">Need inspiration? Try these:</Label>
              <div className="grid gap-2">
                {examplePrompts.map((example, index) => (
                  <button
                    key={index}
                    onClick={() => setPrompt(example)}
                    className="flex items-center gap-2 p-3 rounded-lg bg-black/30 border border-white/5 text-gray-400 text-sm text-left hover:border-cyan-500/30 hover:text-gray-300 transition-all group"
                    data-testid={`example-${index}`}
                  >
                    <ChevronRight className="w-4 h-4 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="line-clamp-1">{example}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400" data-testid="generator-error">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="w-full bg-cyan-500 text-black font-bold text-lg py-6 hover:bg-cyan-400 transition-all hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] disabled:opacity-50"
              data-testid="generate-btn"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Generating your project...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Generate Code
                </>
              )}
            </Button>

            {loading && (
              <div className="text-center">
                <p className="text-gray-400 text-sm">
                  This may take 30-60 seconds depending on complexity...
                </p>
                <div className="mt-4 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full shimmer" style={{ width: '60%' }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
