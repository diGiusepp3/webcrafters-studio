import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '@/api';
import { useAuth } from '@/context/AuthContext';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import {
  CreditCard, Plus, Zap, Sparkles, Check, ArrowRight,
  Loader2, TrendingUp, Clock, Star
} from 'lucide-react';

const pricingPlans = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    credits: 5,
    features: [
      '5 code generations / month',
      'Basic project types',
      'Community support',
      'Download as ZIP',
    ],
    gradient: 'from-gray-500 to-slate-500',
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$19',
    period: '/ month',
    credits: 50,
    features: [
      '50 code generations / month',
      'All project types',
      'Priority support',
      'Download as ZIP',
      'Security scanning',
      'Custom templates',
    ],
    gradient: 'from-cyan-500 to-blue-500',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$99',
    period: '/ month',
    credits: 500,
    features: [
      'Unlimited generations',
      'All project types',
      'Dedicated support',
      'Download as ZIP',
      'Security scanning',
      'Custom templates',
      'Team collaboration',
      'API access',
      'Self-hosted option',
    ],
    gradient: 'from-violet-500 to-purple-500',
    popular: false,
  },
];

export default function Credits() {
  const { user } = useAuth();
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState('pro');

  useEffect(() => {
    fetchCredits();
  }, []);

  const fetchCredits = async () => {
    try {
      const res = await api.get('/credits/balance');
      setCredits(res.data);
    } catch (err) {
      // Default credits for demo
      setCredits({ balance: 5, total_used: 0 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#030712]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 pt-24 pb-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-6">
            <CreditCard className="w-4 h-4 text-cyan-400" />
            <span className="text-sm text-gray-300">Credits & Billing</span>
          </div>
          <h1 className="font-heading text-4xl font-bold text-white mb-3">
            Power Your AI Creations
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Choose a plan that fits your needs and start building amazing projects
          </p>
        </div>

        {/* Current balance */}
        <div className="glass-card p-6 rounded-2xl mb-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-500 flex items-center justify-center">
                <Zap className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-gray-400 text-sm">Current Balance</p>
                {loading ? (
                  <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                ) : (
                  <p className="text-3xl font-bold text-white">
                    {credits?.balance || 0} <span className="text-lg text-gray-500">credits</span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2 text-gray-400">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <span>{credits?.total_used || 0} used this month</span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <Clock className="w-4 h-4" />
                <span>Resets monthly</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pricing plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {pricingPlans.map((plan) => (
            <div
              key={plan.id}
              className={`relative glass-card rounded-2xl p-6 ${
                plan.popular ? 'border-cyan-500/50 ring-1 ring-cyan-500/20' : ''
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-xs font-bold text-black">
                    Most Popular
                  </span>
                </div>
              )}

              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.gradient} p-0.5 mb-4`}>
                <div className="w-full h-full rounded-xl bg-[#0a0f1a] flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
              </div>

              <h3 className="font-heading text-xl font-bold text-white mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold text-white">{plan.price}</span>
                <span className="text-gray-500">{plan.period}</span>
              </div>

              <p className="text-cyan-400 text-sm mb-4">
                {plan.credits === 500 ? 'Unlimited' : plan.credits} generations included
              </p>

              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-gray-400">
                    <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => setSelectedPlan(plan.id)}
                className={`w-full ${
                  plan.popular
                    ? 'btn-primary'
                    : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                }`}
              >
                {plan.id === 'free' ? 'Current Plan' : 'Upgrade'}
                {plan.id !== 'free' && <ArrowRight className="w-4 h-4 ml-2" />}
              </Button>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="glass-card-static rounded-2xl p-8">
          <h2 className="font-heading text-2xl font-bold text-white mb-6 text-center">
            Frequently Asked Questions
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-white font-medium mb-2">What is a credit?</h3>
              <p className="text-gray-400 text-sm">
                One credit equals one AI code generation. Complex projects may use more credits.
              </p>
            </div>
            <div>
              <h3 className="text-white font-medium mb-2">Do credits expire?</h3>
              <p className="text-gray-400 text-sm">
                Credits reset monthly. Unused credits don't roll over to the next month.
              </p>
            </div>
            <div>
              <h3 className="text-white font-medium mb-2">Can I upgrade anytime?</h3>
              <p className="text-gray-400 text-sm">
                Yes! You can upgrade or downgrade your plan at any time. Changes apply immediately.
              </p>
            </div>
            <div>
              <h3 className="text-white font-medium mb-2">Is there a refund policy?</h3>
              <p className="text-gray-400 text-sm">
                Yes, we offer a 14-day money-back guarantee on all paid plans.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
