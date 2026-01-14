// frontend/src/pages/Credits.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/api";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Coins,
  Plus,
  Sparkles,
  Check,
  Zap,
  Crown,
  Rocket,
  ArrowRight,
  History,
  CreditCard,
  Gift,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Credit packages data
const creditPackages = [
  {
    id: "starter",
    name: "Starter Pack",
    credits: 1000,
    price: "€4.99",
    priceNum: 4.99,
    icon: Zap,
    color: "from-blue-500 to-cyan-500",
    popular: false,
  },
  {
    id: "basic",
    name: "Basic Pack",
    credits: 5000,
    price: "€19.99",
    priceNum: 19.99,
    bonus: "+5% bonus",
    icon: Sparkles,
    color: "from-purple-500 to-pink-500",
    popular: false,
  },
  {
    id: "pro",
    name: "Pro Pack",
    credits: 15000,
    price: "€49.99",
    priceNum: 49.99,
    bonus: "+10% bonus",
    icon: Crown,
    color: "from-amber-500 to-orange-500",
    popular: true,
  },
  {
    id: "power",
    name: "Power Pack",
    credits: 50000,
    price: "€149.99",
    priceNum: 149.99,
    bonus: "+20% bonus",
    icon: Rocket,
    color: "from-red-500 to-rose-500",
    popular: false,
  },
];

// Subscription plans
const subscriptionPlans = [
  {
    id: "starter",
    name: "Starter / Builder",
    price: "€9.99",
    priceNum: 9.99,
    credits: "10,000",
    features: [
      "10,000 credits/month",
      "GPT-4.1-mini, GPT-4.1, GPT-5-mini",
      "30 generations/day",
      "16K output tokens",
    ],
    color: "from-blue-500 to-cyan-500",
  },
  {
    id: "pro",
    name: "Pro",
    price: "€24.99",
    priceNum: 24.99,
    credits: "35,000",
    features: [
      "35,000 credits/month",
      "All Starter models + GPT-5, Codex",
      "60 generations/day",
      "32K output tokens",
      "Priority support",
    ],
    color: "from-purple-500 to-pink-500",
    popular: true,
  },
  {
    id: "power",
    name: "Power / Studio",
    price: "€49.99",
    priceNum: 49.99,
    credits: "100,000",
    features: [
      "100,000 credits/month",
      "All AI models",
      "120 generations/day",
      "64K output tokens",
      "Priority support",
      "Custom integrations",
    ],
    color: "from-amber-500 to-orange-500",
  },
];

export default function Credits() {
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [activeTab, setActiveTab] = useState("packages"); // packages | subscriptions | history
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [balanceRes, historyRes] = await Promise.all([
        api.get("/credits/balance"),
        api.get("/credits/history"),
      ]);
      setBalance(balanceRes.data);
      setHistory(historyRes.data);
    } catch (err) {
      console.error("Failed to fetch credit data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (packageId) => {
    setPurchasing(packageId);
    try {
      // Start purchase
      const res = await api.post("/credits/purchase", {
        package_id: packageId,
        payment_method: "stripe",
      });

      // For demo: immediately complete the purchase
      await api.post(`/credits/purchase/${res.data.payment_id}/complete`);

      // Refresh balance
      await fetchData();
      alert("Credits purchased successfully!");
    } catch (err) {
      alert("Purchase failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setPurchasing(null);
    }
  };

  const addDemoCredits = async () => {
    try {
      await api.post("/credits/add-demo-credits");
      await fetchData();
      alert("Demo credits added!");
    } catch (err) {
      alert("Failed to add demo credits");
    }
  };

  const getKindLabel = (kind) => {
    const labels = {
      purchase: "Purchase",
      usage: "Generation",
      bonus: "Bonus",
      refund: "Refund",
      subscription: "Subscription",
    };
    return labels[kind] || kind;
  };

  const getKindIcon = (kind) => {
    const icons = {
      purchase: CreditCard,
      usage: Sparkles,
      bonus: Gift,
      refund: ArrowRight,
      subscription: Crown,
    };
    const Icon = icons[kind] || Coins;
    return <Icon className="w-4 h-4" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030712]">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712]">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header with Balance */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Credits & Billing</h1>
            <p className="text-gray-400">Manage your credits and subscription</p>
          </div>

          {/* Balance Card */}
          <Card className="bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-cyan-500/30">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-cyan-500/20">
                  <Coins className="w-8 h-8 text-cyan-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-400">Current Balance</p>
                  <p className="text-3xl font-bold text-white" data-testid="credit-balance">
                    {balance?.balance_display || "0.00"}
                    <span className="text-lg text-cyan-400 ml-2">credits</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-white/10 pb-4">
          {[
            { id: "packages", label: "Credit Packages", icon: Coins },
            { id: "subscriptions", label: "Subscriptions", icon: Crown },
            { id: "history", label: "Transaction History", icon: History },
          ].map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "default" : "ghost"}
              className={cn(
                "gap-2",
                activeTab === tab.id
                  ? "bg-cyan-500 text-black"
                  : "text-gray-400 hover:text-white"
              )}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-${tab.id}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </Button>
          ))}

          {/* Demo credits button */}
          <Button
            variant="outline"
            className="ml-auto border-green-500/50 text-green-400 hover:bg-green-500/10"
            onClick={addDemoCredits}
          >
            <Gift className="w-4 h-4 mr-2" />
            Add Demo Credits
          </Button>
        </div>

        {/* Credit Packages Tab */}
        {activeTab === "packages" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {creditPackages.map((pkg) => {
              const Icon = pkg.icon;
              return (
                <Card
                  key={pkg.id}
                  className={cn(
                    "relative overflow-hidden border-white/10 bg-black/40 hover:border-white/20 transition-all",
                    pkg.popular && "border-amber-500/50 ring-1 ring-amber-500/30"
                  )}
                  data-testid={`package-${pkg.id}`}
                >
                  {pkg.popular && (
                    <div className="absolute top-0 right-0 bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-bl-lg">
                      POPULAR
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <div
                      className={cn(
                        "w-12 h-12 rounded-lg bg-gradient-to-br flex items-center justify-center mb-3",
                        pkg.color
                      )}
                    >
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <CardTitle className="text-white">{pkg.name}</CardTitle>
                    <CardDescription>
                      <span className="text-2xl font-bold text-white">
                        {pkg.credits.toLocaleString()}
                      </span>
                      <span className="text-gray-400 ml-1">credits</span>
                      {pkg.bonus && (
                        <span className="ml-2 text-green-400 text-sm">
                          {pkg.bonus}
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white mb-4">
                      {pkg.price}
                    </div>
                    <Button
                      className={cn(
                        "w-full bg-gradient-to-r text-white font-bold",
                        pkg.color
                      )}
                      onClick={() => handlePurchase(pkg.id)}
                      disabled={purchasing === pkg.id}
                      data-testid={`buy-${pkg.id}`}
                    >
                      {purchasing === pkg.id ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Plus className="w-4 h-4 mr-2" />
                      )}
                      Buy Now
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Subscriptions Tab */}
        {activeTab === "subscriptions" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {subscriptionPlans.map((plan) => (
              <Card
                key={plan.id}
                className={cn(
                  "relative overflow-hidden border-white/10 bg-black/40",
                  plan.popular && "border-purple-500/50 ring-1 ring-purple-500/30 scale-105"
                )}
                data-testid={`plan-${plan.id}`}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0 bg-purple-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                    MOST POPULAR
                  </div>
                )}
                <CardHeader>
                  <div
                    className={cn(
                      "w-12 h-12 rounded-lg bg-gradient-to-br flex items-center justify-center mb-3",
                      plan.color
                    )}
                  >
                    <Crown className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle className="text-white text-xl">{plan.name}</CardTitle>
                  <CardDescription>
                    <span className="text-3xl font-bold text-white">
                      {plan.price}
                    </span>
                    <span className="text-gray-400">/month</span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-cyan-400 font-medium mb-4">
                    {plan.credits} credits/month
                  </div>
                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-300">
                        <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={cn(
                      "w-full bg-gradient-to-r text-white font-bold",
                      plan.color
                    )}
                    data-testid={`subscribe-${plan.id}`}
                  >
                    Subscribe
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <Card className="bg-black/40 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Transaction History</CardTitle>
              <CardDescription>Your recent credit transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>No transactions yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      data-testid={`tx-${tx.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center",
                            tx.amount_cents > 0
                              ? "bg-green-500/20 text-green-400"
                              : "bg-red-500/20 text-red-400"
                          )}
                        >
                          {getKindIcon(tx.kind)}
                        </div>
                        <div>
                          <p className="font-medium text-white">
                            {getKindLabel(tx.kind)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(tx.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div
                        className={cn(
                          "text-lg font-bold",
                          tx.amount_cents > 0 ? "text-green-400" : "text-red-400"
                        )}
                      >
                        {tx.amount_display}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
