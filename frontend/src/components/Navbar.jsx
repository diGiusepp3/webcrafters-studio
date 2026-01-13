import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from './ui/button';
import { Code2, LogOut, History, Sparkles } from 'lucide-react';
import {WebcraftersLogo} from "@/components/WebcraftersLogo";

export const Navbar = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-50 bg-black/60 backdrop-blur-md border-b border-white/5" data-testid="navbar">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group" data-testid="navbar-logo">
          <WebcraftersLogo size={40} />
          <span className="font-heading text-xl font-bold text-white group-hover:text-cyan-400 transition-colors">
            Webcrafters Studio <span className="text-cyan-400">(AI)</span>
          </span>
        </Link>

        <nav className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              <Link to="/generate" data-testid="nav-generate">
                <Button variant="ghost" className="text-gray-300 hover:text-white hover:bg-white/5">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate
                </Button>
              </Link>
              <Link to="/dashboard" data-testid="nav-dashboard">
                <Button variant="ghost" className="text-gray-300 hover:text-white hover:bg-white/5">
                  <History className="w-4 h-4 mr-2" />
                  History
                </Button>
              </Link>
              <div className="flex items-center gap-3 pl-4 border-l border-white/10">
                <span className="text-sm text-gray-400">{user?.name}</span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={handleLogout}
                  className="text-gray-400 hover:text-white hover:bg-white/5"
                  data-testid="logout-btn"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <Link to="/login" data-testid="nav-login">
                <Button variant="ghost" className="text-gray-300 hover:text-white hover:bg-white/5">
                  Login
                </Button>
              </Link>
              <Link to="/register" data-testid="nav-register">
                <Button className="bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition-all hover:shadow-[0_0_20px_rgba(6,182,212,0.6)]">
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};
