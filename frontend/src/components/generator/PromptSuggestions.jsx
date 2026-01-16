import { useState } from 'react';
import { Sparkles, ArrowRight, Layers, Globe, ShoppingCart, BarChart3, MessageSquare, Calendar, FileText, Gamepad2 } from 'lucide-react';

const suggestions = {
  fullstack: [
    "Build a SaaS dashboard with user authentication, subscription billing via Stripe, and usage analytics",
    "Create a project management app like Trello with drag-and-drop boards, team collaboration, and real-time updates",
    "Build an e-commerce platform with product catalog, shopping cart, checkout, and order management",
    "Create a social media app with posts, comments, likes, followers, and real-time notifications",
  ],
  frontend: [
    "Build a modern landing page with hero section, features grid, testimonials, and pricing table",
    "Create an interactive data visualization dashboard with charts, filters, and export functionality",
    "Build a portfolio website with project gallery, about page, contact form, and blog section",
    "Create a weather app with location search, 7-day forecast, and animated weather icons",
  ],
  backend: [
    "Build a REST API for a blog with posts, comments, tags, user authentication, and rate limiting",
    "Create a microservices architecture with user service, product service, and order service",
    "Build a real-time chat server with WebSocket support, rooms, and message history",
    "Create an API gateway with authentication, rate limiting, and request logging",
  ],
  mobile: [
    "Build a fitness tracking app with workout logs, progress charts, and goal setting",
    "Create a recipe app with ingredient lists, step-by-step instructions, and meal planning",
    "Build a habit tracker with daily reminders, streak tracking, and statistics",
    "Create a note-taking app with folders, tags, search, and cloud sync",
  ],
  cli: [
    "Build a CLI tool for managing Git repositories with shortcuts and automation",
    "Create a file organizer CLI that sorts files by type, date, or custom rules",
    "Build a project scaffolding tool that generates boilerplate code from templates",
    "Create a database migration CLI with up/down migrations and version tracking",
  ],
  any: [
    "Build whatever makes sense for: A platform to help people find and book local services",
    "Create an application for: Managing personal finances with budgets and expense tracking",
    "Build something for: A small business to manage inventory and orders",
    "Create a tool for: Teachers to create and grade assignments online",
  ],
};

export function PromptSuggestions({ onSelect, projectType }) {
  const [showAll, setShowAll] = useState(false);
  const typeSuggestions = suggestions[projectType] || suggestions.any;
  const displaySuggestions = showAll ? typeSuggestions : typeSuggestions.slice(0, 2);

  return (
    <div className="mb-4">
      <p className="text-sm text-gray-500 mb-3 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-cyan-400" />
        Need inspiration? Try one of these:
      </p>
      <div className="space-y-2">
        {displaySuggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSelect(suggestion)}
            className="w-full text-left p-3 rounded-lg bg-white/5 hover:bg-cyan-500/10 border border-white/5 hover:border-cyan-500/30 transition-all group"
          >
            <p className="text-sm text-gray-400 group-hover:text-white transition-colors line-clamp-2">
              {suggestion}
            </p>
          </button>
        ))}
      </div>
      {!showAll && typeSuggestions.length > 2 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 text-sm text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
        >
          Show more suggestions
          <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
