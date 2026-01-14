// frontend/src/components/Navbar.jsx
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from './ui/button';
import { LogOut, History, Sparkles, Coins, Plus, Bell, Gift } from 'lucide-react';
import { WebcraftersLogo } from "@/components/WebcraftersLogo";
import api from '@/api';

export const Navbar = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [credits, setCredits] = useState(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchCredits();
    }
  }, [isAuthenticated]);

  const fetchCredits = async () => {
    try {
      const res = await api.get('/credits/balance');
      setCredits(res.data.balance_display);
    } catch (err) {
      console.error('Failed to fetch credits:', err);
      setCredits('0.00');
    }
  };

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

              {/* Credits Display - Like emergent.sh */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10">
                <div className="flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-400" />
                  <span className="text-white font-medium" data-testid="navbar-credits">
                    {credits || '---'}
                  </span>
                </div>
                <Link to="/credits" data-testid="nav-buy-credits">
                  <Button
                    size="sm"
                    className="h-7 px-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold hover:from-amber-400 hover:to-orange-400"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Buy Credits
                  </Button>
                </Link>
              </div>

              {/* Additional Icons */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-gray-400 hover:text-white hover:bg-white/5 h-8 w-8"
                >
                  <Bell className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-gray-400 hover:text-white hover:bg-white/5 h-8 w-8"
                >
                  <Gift className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center gap-3 pl-3 border-l border-white/10">
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
