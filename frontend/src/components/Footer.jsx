import { Link } from 'react-router-dom';
import { Sparkles, Github, Twitter, Linkedin, Mail } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();

  const footerLinks = {
    Product: [
      { label: 'Features', href: '/#features' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Templates', href: '/templates' },
      { label: 'Changelog', href: '/changelog' },
    ],
    Resources: [
      { label: 'Documentation', href: '/docs' },
      { label: 'API Reference', href: '/api' },
      { label: 'Tutorials', href: '/tutorials' },
      { label: 'Blog', href: '/blog' },
    ],
    Company: [
      { label: 'About', href: '/about' },
      { label: 'Careers', href: '/careers' },
      { label: 'Contact', href: '/contact' },
      { label: 'Press', href: '/press' },
    ],
    Legal: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Security', href: '/security' },
      { label: 'Cookies', href: '/cookies' },
    ],
  };

  const socialLinks = [
    { icon: <Github className="w-5 h-5" />, href: 'https://github.com', label: 'GitHub' },
    { icon: <Twitter className="w-5 h-5" />, href: 'https://twitter.com', label: 'Twitter' },
    { icon: <Linkedin className="w-5 h-5" />, href: 'https://linkedin.com', label: 'LinkedIn' },
    { icon: <Mail className="w-5 h-5" />, href: 'mailto:hello@webcrafters.studio', label: 'Email' },
  ];

  return (
    <footer className="relative border-t border-white/5 bg-[#030712]">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/5 to-transparent pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-heading text-lg font-bold text-white">
                Webcrafters Studio
              </span>
            </Link>
            <p className="text-gray-500 text-sm mb-6 max-w-xs">
              Build production-ready applications with AI. From idea to running code in minutes.
            </p>
            <div className="flex items-center gap-3">
              {socialLinks.map((social, index) => (
                <a
                  key={index}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg glass-card flex items-center justify-center text-gray-400 hover:text-white hover:border-cyan-500/30 transition-all"
                  aria-label={social.label}
                >
                  {social.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-heading font-semibold text-white mb-4">{category}</h4>
              <ul className="space-y-2">
                {links.map((link, index) => (
                  <li key={index}>
                    <Link
                      to={link.href}
                      className="text-gray-500 hover:text-cyan-400 text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">
            © {currentYear} Webcrafters Studio. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
