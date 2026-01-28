// FILE: frontend/src/pages/Credits.jsx

import { useEffect, useState } from 'react';
import api from '@/api';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { CreditCard, Sparkles, Check, ArrowRight, Loader2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';

export default function Credits() {
  const location = useLocation();
  const [balance, setBalance] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchasingPlan, setPurchasingPlan] = useState("");
  const [purchaseMessage, setPurchaseMessage] = useState("");

  useEffect(() => {
    load();
    const params = new URLSearchParams(location.search);
    if (params.get('success')) {
      setPurchaseMessage('Betaling gelukt! Credits worden toegevoegd.');
    }
    if (params.get('canceled')) {
      setPurchaseMessage('Betaling geannuleerd.');
    }
  }, []);

  async function load() {
    try {
      const [b, p] = await Promise.all([
        api.get('/credits/balance'),
        api.get('/credits/plans'),
      ]);

      setBalance(b.data); // { balance_cents, balance_display }
      setPlans(p.data);
    } catch (e) {
      // harde fallback: geen credits
      setBalance({ balance_cents: 0, balance_display: '0.00' });
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }

  const handlePurchase = async (plan) => {
    setPurchasingPlan(plan.id);
    setPurchaseMessage("");
    try {
      // package_id must be a string slug; ensure we pass plan.slug if available.
      const packageId = plan.slug || plan.id;

      const response = await api.post('/credits/purchase', {
        package_id: packageId,
        payment_method: 'stripe',
      });

      const paymentId = response?.data?.payment_id;
      if (!paymentId) {
        throw new Error('Missing payment ID');
      }

      // If backend returns a hosted checkout URL (Stripe), redirect the browser.
      const checkoutUrl = response?.data?.checkout_url;
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }

      try {
        const completion = await api.post(`/credits/purchase/${paymentId}/complete`);
        setPurchaseMessage(completion.data?.message || 'Credits added successfully!');
      } catch (err) {
        // If completion fails (e.g., already auto-completed server-side), surface success anyway.
        setPurchaseMessage('Credits added successfully!');
      }
      await load();
    } catch (error) {
      console.error(error);
      setPurchaseMessage('Unable to complete the purchase right now. Please try again.');
    } finally {
      setPurchasingPlan('');
    }
  };

  return (
      <div className="min-h-screen bg-[#030712]">
        <Navbar />

        <div className="max-w-6xl mx-auto px-6 pt-24 pb-12">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-6">
              <CreditCard className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-gray-300">Credits & Billing</span>
            </div>
            <h1 className="text-4xl font-bold text-white mb-3">
              Buy credits to generate projects
            </h1>
            <p className="text-gray-400">
              No free tier. Generation requires credits.
            </p>
            {purchaseMessage && (
                <p className="text-green-400 text-sm mt-3">{purchaseMessage}</p>
            )}
          </div>

          {/* Balance */}
          <div className="glass-card p-6 rounded-2xl mb-12">
            {loading || !balance ? (
                <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
            ) : (
                <p className="text-3xl font-bold text-white">
                  €{(balance.balance_cents / 100).toFixed(2)}
                </p>
            )}
          </div>

          {/* Plans */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map(plan => (
                <div key={plan.id} className="glass-card rounded-2xl p-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 p-0.5 mb-4">
                    <div className="w-full h-full rounded-xl bg-[#0a0f1a] flex items-center justify-center">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                  </div>

                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                  <p className="text-gray-400 mb-2">€{plan.price_monthly} / month</p>

                  <ul className="space-y-2 mb-6 text-sm text-gray-400">
                    <li className="flex gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      {plan.credits_monthly} credits / month
                    </li>
                    <li className="flex gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      Max {plan.max_generations_per_day} generations / day
                    </li>
                    <li className="flex gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      Models: {plan.allowed_models.join(', ')}
                    </li>
                  </ul>

                  <Button
                      className="w-full btn-primary"
                      disabled={Boolean(purchasingPlan && purchasingPlan !== plan.id)}
                      onClick={() => handlePurchase(plan)}
                  >
                    {purchasingPlan === plan.id ? 'Buying…' : 'Buy / Upgrade'}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
            ))}
          </div>
        </div>
      </div>
  );
}
