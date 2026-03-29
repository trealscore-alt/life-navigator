import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  MessageSquare, Target, Plus, LogOut, Zap, TrendingUp,
  Heart, Brain, DollarSign, Briefcase, Activity, Settings, Radio, Bluetooth,
} from 'lucide-react';

const DOMAIN_ICONS: Record<string, any> = {
  work: Briefcase, finance: DollarSign, health: Activity,
  relationships: Heart, learning: Brain, lifestyle: Zap, ambition: TrendingUp,
};

const DOMAIN_COLORS: Record<string, string> = {
  work: 'text-accent', finance: 'text-primary', health: 'text-green-400',
  relationships: 'text-pink-400', learning: 'text-purple-400',
  lifestyle: 'text-orange-400', ambition: 'text-yellow-400',
};

interface Profile {
  display_name: string;
  onboarding_completed: boolean;
}

interface Goal {
  id: string;
  title: string;
  domain: string;
  progress: number;
  status: string;
  timeframe: string;
}

interface Domain {
  domain: string;
  priority: number;
  is_active: boolean;
}

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      const [profileRes, goalsRes, domainsRes] = await Promise.all([
        supabase.from('profiles').select('display_name, onboarding_completed').eq('user_id', user.id).single(),
        supabase.from('user_goals').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }),
        supabase.from('user_domains').select('*').eq('user_id', user.id).eq('is_active', true).order('priority'),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
        if (!profileRes.data.onboarding_completed) {
          navigate('/onboarding');
          return;
        }
      }
      if (goalsRes.data) setGoals(goalsRes.data as Goal[]);
      if (domainsRes.data) setDomains(domainsRes.data as Domain[]);

      // Auto-generate briefing
      setBriefingLoading(true);
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-briefing`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ userId: user.id }),
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          if (data.briefing) setBriefing(data.briefing);
        }
      } catch (err) {
        console.error('Briefing error:', err);
      }
      setBriefingLoading(false);
    };

    load();
  }, [user, navigate]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 grid-bg opacity-10" />

      {/* Top Bar */}
      <header className="relative z-10 border-b border-border/50 bg-card/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-mono text-xl neon-text font-bold">CLRK</h1>
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
              ONLINE
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground font-mono">
              {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            <Link to="/settings">
              <Button variant="ghost" size="icon"><Settings className="w-4 h-4" /></Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Greeting */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-2xl font-mono">
            {greeting}, <span className="neon-text">{profile?.display_name || 'Agent'}</span>
          </h2>
          <p className="text-muted-foreground text-sm mt-1 font-mono">Command Center • System Status: Operational</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Daily Briefing */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-2 glass-card neon-border rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono text-sm text-primary uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4" /> Daily Briefing
              </h3>
              <span className="text-[10px] font-mono text-muted-foreground">
                {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {briefingLoading ? (
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-muted-foreground text-sm font-mono">Generating your daily briefing...</p>
              </div>
            ) : (
              <p className="text-foreground/80 text-sm leading-relaxed whitespace-pre-line">
                {briefing || `Welcome back. You have ${goals.length} active goal${goals.length !== 1 ? 's' : ''} across ${domains.length} domain${domains.length !== 1 ? 's' : ''}. Talk to CLRK for a personalized briefing.`}
              </p>
            )}
            <Link to="/chat">
              <Button className="mt-4 font-mono text-xs bg-primary text-primary-foreground">
                <MessageSquare className="w-4 h-4 mr-2" /> Talk to CLRK
              </Button>
            </Link>
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass-card rounded-xl p-6 space-y-3"
          >
            <h3 className="font-mono text-sm text-muted-foreground uppercase tracking-wider">Quick Actions</h3>
            <Link to="/chat" className="block">
              <Button variant="outline" className="w-full justify-start font-mono text-xs">
                <MessageSquare className="w-4 h-4 mr-2" /> Talk to CLRK
              </Button>
            </Link>
            <Button variant="outline" className="w-full justify-start font-mono text-xs" onClick={() => navigate('/chat')}>
              <Plus className="w-4 h-4 mr-2" /> Add Goal
            </Button>
            <Link to="/agents" className="block">
              <Button variant="outline" className="w-full justify-start font-mono text-xs">
                <Radio className="w-4 h-4 mr-2" /> Agent Network
              </Button>
            </Link>
            <Link to="/devices" className="block">
              <Button variant="outline" className="w-full justify-start font-mono text-xs">
                <Bluetooth className="w-4 h-4 mr-2" /> Device Hub
              </Button>
            </Link>
            <Link to="/settings" className="block">
              <Button variant="outline" className="w-full justify-start font-mono text-xs">
                <Settings className="w-4 h-4 mr-2" /> Settings
              </Button>
            </Link>
          </motion.div>
        </div>

        {/* Active Domains */}
        {domains.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h3 className="font-mono text-sm text-muted-foreground uppercase tracking-wider mb-4">Active Domains</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {domains.map(d => {
                const Icon = DOMAIN_ICONS[d.domain] || Zap;
                const color = DOMAIN_COLORS[d.domain] || 'text-primary';
                const domainGoals = goals.filter(g => g.domain === d.domain);
                return (
                  <div key={d.domain} className="glass-card rounded-lg p-4 text-center space-y-2 hover:neon-border transition-all cursor-pointer">
                    <Icon className={`w-6 h-6 mx-auto ${color}`} />
                    <p className="font-mono text-xs capitalize">{d.domain}</p>
                    <p className="text-[10px] text-muted-foreground">{domainGoals.length} goals</p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Goals */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-mono text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Target className="w-4 h-4" /> Active Goals
            </h3>
            <span className="text-xs font-mono text-muted-foreground">{goals.length} active</span>
          </div>
          {goals.length === 0 ? (
            <div className="glass-card rounded-xl p-8 text-center">
              <p className="text-muted-foreground text-sm">No goals set. Talk to CLRK to define your objectives.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {goals.map(goal => {
                const Icon = DOMAIN_ICONS[goal.domain] || Target;
                const color = DOMAIN_COLORS[goal.domain] || 'text-primary';
                return (
                  <div key={goal.id} className="glass-card rounded-xl p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${color}`} />
                        <span className="font-mono text-sm">{goal.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">{goal.timeframe}</span>
                    </div>
                    <Progress value={goal.progress} className="h-1.5" />
                    <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
                      <span className="capitalize">{goal.domain}</span>
                      <span>{goal.progress}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default Dashboard;
