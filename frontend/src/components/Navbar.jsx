// FILE: frontend/src/components/Navbar.jsx
import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Menu, X, Sparkles, Settings, LogOut, CreditCard,
  LayoutDashboard, Wand2, ChevronDown, Zap, Bot
} from 'lucide-react';

// ✅ Zet hier JOUW user UUID (die in je JWT/user object zit)
// Voorbeeld uit je token: 241a8c44-669b-422f-a1c1-a89cd7faa7e9
const DEV_USER_ID = "241a8c44-669b-422f-a1c1-a89cd7faa7e9";

function isDevUser(user) {
  return String(user?.id || "").trim() === DEV_USER_ID;
}

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // ✅ Alleen jij ziet de knop
  const showDevAssistant = isAuthenticated && isDevUser(user);

  const navLinks = isAuthenticated
      ? [
        { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
        { href: '/generate', label: 'Generate', icon: <Wand2 className="w-4 h-4" /> },
        { href: '/credits', label: 'Credits', icon: <CreditCard className="w-4 h-4" /> },
        ...(showDevAssistant
            ? [{ href: '/code-assistant', label: 'AI Assistant', icon: <Bot className="w-4 h-4" /> }]
            : []),
      ]
      : [];

  return (
      <nav
          className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
              isScrolled
                  ? 'bg-[#030712]/80 backdrop-blur-xl border-b border-white/5'
                  : 'bg-transparent'
          }`}
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-all">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-500 opacity-0 group-hover:opacity-20 blur-lg transition-opacity" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-heading text-xl font-bold text-white">Webcrafters</span>
                <span className="font-heading text-xl font-bold gradient-text">Studio</span>
              </div>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                  <Link
                      key={link.href}
                      to={link.href}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          location.pathname === link.href
                              ? 'text-cyan-400 bg-cyan-500/10'
                              : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    {link.icon}
                    {link.label}
                  </Link>
              ))}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center text-white text-sm font-bold">
                          {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <span className="hidden sm:block text-sm text-white font-medium">
                      {user?.name || 'User'}
                    </span>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end" className="w-56 glass-panel border-white/10 p-2">
                      <div className="px-3 py-2 mb-2">
                        <p className="text-sm font-medium text-white">{user?.name}</p>
                        <p className="text-xs text-gray-500">{user?.email}</p>
                      </div>

                      <DropdownMenuSeparator className="bg-white/10" />

                      <DropdownMenuItem
                          onClick={() => navigate('/dashboard')}
                          className="flex items-center gap-2 px-3 py-2 text-gray-300 hover:text-white cursor-pointer"
                      >
                        <LayoutDashboard className="w-4 h-4" />
                        Dashboard
                      </DropdownMenuItem>

                      <DropdownMenuItem
                          onClick={() => navigate('/generate')}
                          className="flex items-center gap-2 px-3 py-2 text-gray-300 hover:text-white cursor-pointer"
                      >
                        <Wand2 className="w-4 h-4" />
                        New Project
                      </DropdownMenuItem>

                      <DropdownMenuItem
                          onClick={() => navigate('/credits')}
                          className="flex items-center gap-2 px-3 py-2 text-gray-300 hover:text-white cursor-pointer"
                      >
                        <CreditCard className="w-4 h-4" />
                        Credits
                      </DropdownMenuItem>

                      {showDevAssistant ? (
                          <>
                            <DropdownMenuSeparator className="bg-white/10" />
                            <DropdownMenuItem
                                onClick={() => navigate('/code-assistant')}
                                className="flex items-center gap-2 px-3 py-2 text-cyan-300 hover:text-cyan-200 cursor-pointer"
                            >
                              <Bot className="w-4 h-4" />
                              AI Assistant
                            </DropdownMenuItem>
                          </>
                      ) : null}

                      <DropdownMenuSeparator className="bg-white/10" />

                      <DropdownMenuItem
                          onClick={() => navigate('/settings')}
                          className="flex items-center gap-2 px-3 py-2 text-gray-300 hover:text-white cursor-pointer"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </DropdownMenuItem>

                      <DropdownMenuItem
                          onClick={handleLogout}
                          className="flex items-center gap-2 px-3 py-2 text-red-400 hover:text-red-300 cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
              ) : (
                  <>
                    <Link to="/login">
                      <Button variant="ghost" className="text-gray-400 hover:text-white">
                        Login
                      </Button>
                    </Link>
                    <Link to="/register">
                      <Button className="btn-primary">
                        <Zap className="w-4 h-4 mr-2" />
                        Get Started
                      </Button>
                    </Link>
                  </>
              )}

              {/* Mobile menu button */}
              <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="md:hidden p-2 rounded-lg hover:bg-white/5 text-gray-400"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          {isMobileMenuOpen && (
              <div className="md:hidden py-4 border-t border-white/5">
                <div className="flex flex-col gap-1">
                  {navLinks.map((link) => (
                      <Link
                          key={link.href}
                          to={link.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                              location.pathname === link.href
                                  ? 'text-cyan-400 bg-cyan-500/10'
                                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                          }`}
                      >
                        {link.icon}
                        {link.label}
                      </Link>
                  ))}
                </div>
              </div>
          )}
        </div>
      </nav>
  );
}
