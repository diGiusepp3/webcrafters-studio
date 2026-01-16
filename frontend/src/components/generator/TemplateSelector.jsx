import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  X, Layers, Globe, ShoppingCart, BarChart3, MessageSquare,
  Calendar, FileText, Gamepad2, Briefcase, GraduationCap, Heart,
  Camera, Music, Utensils, Plane, Home, Car, ChevronRight
} from 'lucide-react';

const templates = [
  {
    id: 'saas-dashboard',
    name: 'SaaS Dashboard',
    description: 'Complete dashboard with auth, billing, analytics, and settings',
    icon: <BarChart3 className="w-5 h-5" />,
    type: 'fullstack',
    prompt: 'Build a SaaS dashboard application with:\n- User authentication (login, register, password reset)\n- Subscription billing with Stripe integration\n- Analytics dashboard with charts (line, bar, pie)\n- User settings and profile management\n- Team management with roles\n- Responsive sidebar navigation\n- Dark mode support',
    gradient: 'from-cyan-500 to-blue-500',
  },
  {
    id: 'ecommerce',
    name: 'E-Commerce Store',
    description: 'Full online store with cart, checkout, and admin panel',
    icon: <ShoppingCart className="w-5 h-5" />,
    type: 'fullstack',
    prompt: 'Build an e-commerce platform with:\n- Product catalog with categories and filters\n- Shopping cart with quantity management\n- Checkout flow with address and payment\n- User accounts with order history\n- Admin panel for product management\n- Search with autocomplete\n- Product reviews and ratings\n- Responsive mobile design',
    gradient: 'from-violet-500 to-purple-500',
  },
  {
    id: 'social-app',
    name: 'Social Network',
    description: 'Social platform with posts, follows, and real-time updates',
    icon: <MessageSquare className="w-5 h-5" />,
    type: 'fullstack',
    prompt: 'Build a social networking application with:\n- User profiles with avatars and bio\n- Post creation with images and text\n- Like, comment, and share functionality\n- Follow/unfollow system\n- News feed with infinite scroll\n- Real-time notifications\n- Direct messaging\n- Hashtags and search',
    gradient: 'from-pink-500 to-rose-500',
  },
  {
    id: 'project-management',
    name: 'Project Manager',
    description: 'Kanban boards with tasks, teams, and deadlines',
    icon: <Briefcase className="w-5 h-5" />,
    type: 'fullstack',
    prompt: 'Build a project management application like Trello:\n- Kanban boards with drag-and-drop\n- Task cards with descriptions and checklists\n- Due dates and reminders\n- Team collaboration and assignments\n- Comments and activity feed\n- Labels and filters\n- Board templates\n- Archive functionality',
    gradient: 'from-green-500 to-emerald-500',
  },
  {
    id: 'landing-page',
    name: 'Landing Page',
    description: 'Modern marketing page with animations and sections',
    icon: <Globe className="w-5 h-5" />,
    type: 'frontend',
    prompt: 'Build a modern landing page with:\n- Animated hero section with CTA\n- Features grid with icons\n- Testimonials carousel\n- Pricing table with toggle\n- FAQ accordion\n- Newsletter signup\n- Contact form\n- Footer with links\n- Smooth scroll navigation\n- Mobile responsive design',
    gradient: 'from-orange-500 to-amber-500',
  },
  {
    id: 'blog-platform',
    name: 'Blog Platform',
    description: 'Content platform with posts, categories, and comments',
    icon: <FileText className="w-5 h-5" />,
    type: 'fullstack',
    prompt: 'Build a blog platform with:\n- Markdown editor for posts\n- Categories and tags\n- Featured images\n- Comments system\n- Author profiles\n- Search functionality\n- RSS feed\n- SEO optimization\n- Reading time estimation\n- Related posts',
    gradient: 'from-teal-500 to-cyan-500',
  },
  {
    id: 'booking-system',
    name: 'Booking System',
    description: 'Appointment scheduling with calendar and notifications',
    icon: <Calendar className="w-5 h-5" />,
    type: 'fullstack',
    prompt: 'Build a booking/appointment system with:\n- Calendar view with available slots\n- Service selection\n- Customer information form\n- Email confirmations\n- Admin dashboard for managing bookings\n- Recurring appointments\n- Buffer time between appointments\n- Cancellation and rescheduling\n- Payment integration',
    gradient: 'from-indigo-500 to-violet-500',
  },
  {
    id: 'api-backend',
    name: 'REST API',
    description: 'Complete backend API with auth and documentation',
    icon: <Layers className="w-5 h-5" />,
    type: 'backend',
    prompt: 'Build a REST API backend with:\n- JWT authentication\n- User CRUD operations\n- Role-based access control\n- Request validation\n- Error handling\n- Rate limiting\n- API documentation (OpenAPI/Swagger)\n- Database migrations\n- Logging and monitoring\n- Unit tests',
    gradient: 'from-gray-500 to-slate-500',
  },
];

export function TemplateSelector({ onSelect, onClose }) {
  const [filter, setFilter] = useState('all');

  const filteredTemplates = filter === 'all'
    ? templates
    : templates.filter(t => t.type === filter);

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div>
          <h3 className="font-heading font-bold text-white">Start from a Template</h3>
          <p className="text-sm text-gray-500">Choose a pre-built template to get started faster</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="px-4 py-3 border-b border-white/5 flex gap-2 overflow-x-auto">
        {['all', 'fullstack', 'frontend', 'backend'].map((type) => (
          <button
            key={type}
            onClick={() => setFilter(type)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              filter === type
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      {/* Templates grid */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
        {filteredTemplates.map((template) => (
          <button
            key={template.id}
            onClick={() => onSelect(template)}
            className="text-left p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/30 transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${template.gradient} p-0.5 flex-shrink-0`}>
                <div className="w-full h-full rounded-lg bg-[#0a0f1a] flex items-center justify-center text-white group-hover:bg-transparent transition-colors">
                  {template.icon}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-white group-hover:text-cyan-400 transition-colors">
                    {template.name}
                  </h4>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-gray-400">
                    {template.type}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                  {template.description}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-cyan-400 transition-colors flex-shrink-0" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
