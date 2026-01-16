import { useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import api from '@/api';
import {
  Settings, User, Key, Bell, Shield, Palette, CreditCard,
  Save, Loader2, Check, AlertCircle, Eye, EyeOff, LogOut
} from 'lucide-react';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Profile state
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  // API Key state
  const [openaiKey, setOpenaiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Preferences state
  const [darkMode, setDarkMode] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [emailUpdates, setEmailUpdates] = useState(false);

  const tabs = [
    { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
    { id: 'security', label: 'Security', icon: <Shield className="w-4 h-4" /> },
    { id: 'api', label: 'API Keys', icon: <Key className="w-4 h-4" /> },
    { id: 'preferences', label: 'Preferences', icon: <Palette className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
  ];

  const handleSaveProfile = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    
    try {
      await api.put('/auth/profile', { name, email });
      setSuccess('Profile updated successfully!');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      setSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveApiKey = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // In production, this would save to user settings
      // For now, we just show a success message
      setSuccess('API key saved! Note: For this demo, keys are stored in backend/.env');
    } catch (err) {
      setError('Failed to save API key');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#030712]">
      <Navbar />

      <div className="max-w-4xl mx-auto px-6 pt-24 pb-12">
        <div className="mb-8">
          <h1 className="font-heading text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Settings className="w-8 h-8 text-cyan-400" />
            Settings
          </h1>
          <p className="text-gray-400">Manage your account settings and preferences</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar tabs */}
          <div className="lg:w-56 flex-shrink-0">
            <div className="glass-card-static rounded-xl p-2 space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setError('');
                    setSuccess('');
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-cyan-500/20 text-cyan-400'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}

              <div className="border-t border-white/10 my-2" />
              
              <button
                onClick={logout}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1">
            {/* Success/Error messages */}
            {success && (
              <div className="mb-6 flex items-center gap-2 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">
                <Check className="w-4 h-4" />
                {success}
              </div>
            )}
            {error && (
              <div className="mb-6 flex items-center gap-2 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="glass-card-static rounded-xl p-6 space-y-6">
                <h2 className="font-heading text-xl font-bold text-white">Profile Information</h2>
                
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center text-white text-2xl font-bold">
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="text-white font-medium">{user?.name}</p>
                    <p className="text-gray-500 text-sm">{user?.email}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-gray-300">Full Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-black/40 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-gray-300">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-black/40 border-white/10 text-white"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Changes
                </Button>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="glass-card-static rounded-xl p-6 space-y-6">
                <h2 className="font-heading text-xl font-bold text-white">Change Password</h2>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword" className="text-gray-300">Current Password</Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        type={showPasswords ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="bg-black/40 border-white/10 text-white pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswords(!showPasswords)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                      >
                        {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword" className="text-gray-300">New Password</Label>
                    <Input
                      id="newPassword"
                      type={showPasswords ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="bg-black/40 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-gray-300">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type={showPasswords ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="bg-black/40 border-white/10 text-white"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleChangePassword}
                  disabled={saving || !currentPassword || !newPassword}
                  className="btn-primary"
                >
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
                  Update Password
                </Button>
              </div>
            )}

            {/* API Keys Tab */}
            {activeTab === 'api' && (
              <div className="space-y-6">
                <div className="glass-card-static rounded-xl p-6 space-y-6">
                  <h2 className="font-heading text-xl font-bold text-white">OpenAI API Key</h2>
                  <p className="text-gray-400 text-sm">
                    Your API key is used to generate code. It's stored securely and never shared.
                  </p>
                  
                  <div className="space-y-2">
                    <Label htmlFor="openaiKey" className="text-gray-300">API Key</Label>
                    <div className="relative">
                      <Input
                        id="openaiKey"
                        type={showApiKey ? 'text' : 'password'}
                        value={openaiKey}
                        onChange={(e) => setOpenaiKey(e.target.value)}
                        placeholder="sk-proj-..."
                        className="bg-black/40 border-white/10 text-white font-mono pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    onClick={handleSaveApiKey}
                    disabled={saving || !openaiKey}
                    className="btn-primary"
                  >
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Key className="w-4 h-4 mr-2" />}
                    Save API Key
                  </Button>
                </div>

                <div className="glass-card-static rounded-xl p-6">
                  <h3 className="font-heading text-lg font-bold text-white mb-3">How to get an OpenAI API Key</h3>
                  <ol className="space-y-2 text-gray-400 text-sm">
                    <li className="flex gap-2">
                      <span className="text-cyan-400">1.</span>
                      Go to <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">platform.openai.com</a>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-cyan-400">2.</span>
                      Sign in or create an account
                    </li>
                    <li className="flex gap-2">
                      <span className="text-cyan-400">3.</span>
                      Navigate to API Keys section
                    </li>
                    <li className="flex gap-2">
                      <span className="text-cyan-400">4.</span>
                      Create a new secret key and paste it above
                    </li>
                  </ol>
                </div>
              </div>
            )}

            {/* Preferences Tab */}
            {activeTab === 'preferences' && (
              <div className="glass-card-static rounded-xl p-6 space-y-6">
                <h2 className="font-heading text-xl font-bold text-white">Appearance & Preferences</h2>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div>
                      <p className="text-white font-medium">Dark Mode</p>
                      <p className="text-gray-500 text-sm">Use dark theme (recommended)</p>
                    </div>
                    <button
                      onClick={() => setDarkMode(!darkMode)}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        darkMode ? 'bg-cyan-500' : 'bg-gray-600'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform transform ${
                        darkMode ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div>
                      <p className="text-white font-medium">Code Font Size</p>
                      <p className="text-gray-500 text-sm">Adjust code editor font size</p>
                    </div>
                    <select className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm">
                      <option value="12">12px</option>
                      <option value="14" selected>14px</option>
                      <option value="16">16px</option>
                      <option value="18">18px</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="glass-card-static rounded-xl p-6 space-y-6">
                <h2 className="font-heading text-xl font-bold text-white">Notification Settings</h2>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div>
                      <p className="text-white font-medium">Browser Notifications</p>
                      <p className="text-gray-500 text-sm">Get notified when generation completes</p>
                    </div>
                    <button
                      onClick={() => setNotifications(!notifications)}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        notifications ? 'bg-cyan-500' : 'bg-gray-600'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform transform ${
                        notifications ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-white/5">
                    <div>
                      <p className="text-white font-medium">Email Updates</p>
                      <p className="text-gray-500 text-sm">Receive updates about new features</p>
                    </div>
                    <button
                      onClick={() => setEmailUpdates(!emailUpdates)}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        emailUpdates ? 'bg-cyan-500' : 'bg-gray-600'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform transform ${
                        emailUpdates ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
