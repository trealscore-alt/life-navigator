import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import ClrkActivityFeed from '@/components/ClrkActivityFeed';
import ClrkSystemStatus from '@/components/ClrkSystemStatus';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useBackgroundTasks } from '@/hooks/useBackgroundTasks';
import {
  MessageSquare, Target, LogOut, Zap, TrendingUp,
  Heart, Brain, DollarSign, Briefcase, Activity, Settings,
  Radio, Bluetooth, Eye, Shield, ChevronRight, Clock, Cpu, Share2,
  Bot,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const DOMAIN_ICONS: Record<string, LucideIcon> = {
  work: Briefcase, finance: DollarSign, health: Activity,
  relationships: Heart, learning: Brain, lifestyle: Zap, ambition: TrendingUp,
};
const DOMAIN_COLORS: Record<string, string> = {
  work: 'text-accent', finance: 'text-primary', health: 'text-green-400',
  relationships: 'text-pink-400', learning: 'text-purple-400',
  lifestyle: 'text-orange-400', ambition: 'text-yellow-400',
};

interface Profile { display_name: string; onboarding_completed: boolean; }
interface Goal { id: string; title: string; domain: string; progress: number; status: string; timeframe: string; }
interface Domain { domain: string; priority: number; is_active: boolean; }

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  usePushNotifications(user?.id);
  useBackgroundTasks(user?.id);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [uptime, setUptime] = useState(0);

  // Uptime counter
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setUptime(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

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
        if (!profileRes.data.onboarding_completed) { navigate('/onboarding'); return; }
      }
      if (goalsRes.data) setGoals(goalsRes.data as Goal[]);
      if (domainsRes.data) setDomains(domainsRes.data as Domain[]);

      setBriefingLoading(true);
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-briefing`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
            body: JSON.stringify({ userId: user.id }),
          }
        );
        if (resp.ok) {
          const data = await resp.json();
          if (data.briefing) setBriefing(data.briefing);
        }
      } catch (err) { console.error('Briefing error:', err); }
      setBriefingLoading(false);
    };
    load();
  }, [user, navigate]);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const fmtUptime = (s: number) => `${Math.floor(s / 3600).toString().padStart(2, '0')}:${Math.floor((s % 3600) / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="min-h-screen clrk-shell relative">
      <div className="absolute inset-0 scanline-overlay opacity-10" />

      {/* Top Bar */}
      <header className="relative z-10 control-bar">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="agent-mark h-9 w-9 rounded-lg">
              <Brain className="h-5 w-5" />
            </div>
            <h1 className="font-mono text-xl neon-text font-bold tracking-wider">CLRK</h1>
            <div className="hidden md:flex items-center gap-3 border-l border-border/40 pl-4 ml-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="status-pill border-green-400/20 bg-green-400/10 text-green-300">Super Agent Online</span>
              </div>
              <div className="status-pill"><Cpu className="w-3 h-3" /> <span>Core Active</span></div>
              <div className="status-pill"><Clock className="w-3 h-3" /> <span>{fmtUptime(uptime)}</span></div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">
              {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} • {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <Link to="/settings"><Button variant="ghost" size="icon" className="h-8 w-8"><Settings className="w-4 h-4" /></Button></Link>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={signOut}><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Greeting + Quick Nav */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="command-surface rounded-lg p-5 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-primary/70 mb-2">Mission Control</p>
            <h2 className="text-2xl font-mono text-balance">
              {greeting}, <span className="neon-text">{profile?.display_name || 'Agent'}</span>
            </h2>
            <p className="text-muted-foreground text-xs mt-1 font-mono">
              CLRK is actively monitoring {domains.length} domain{domains.length !== 1 ? 's' : ''} • {goals.length} goal{goals.length !== 1 ? 's' : ''} tracked • All systems operational
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/live">
              <Button size="sm" className="font-mono text-xs bg-primary text-primary-foreground shadow-[0_0_15px_hsl(var(--primary)/0.3)]">
                <Eye className="w-3.5 h-3.5 mr-1.5" /> Live Mode
              </Button>
            </Link>
            <Link to="/chat">
              <Button size="sm" variant="outline" className="font-mono text-xs bg-secondary/40">
                <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> <span className="hidden sm:inline">Talk to</span> CLRK
              </Button>
            </Link>
            <Link to="/autonomy">
              <Button size="sm" variant="outline" className="font-mono text-xs bg-secondary/40">
                <Bot className="w-3.5 h-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Autonomy</span>
              </Button>
            </Link>
            <Link to="/agents">
              <Button size="sm" variant="outline" className="font-mono text-xs bg-secondary/40">
                <Radio className="w-3.5 h-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Agents</span>
              </Button>
            </Link>
            <Link to="/devices">
              <Button size="sm" variant="outline" className="font-mono text-xs bg-secondary/40">
                <Bluetooth className="w-3.5 h-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Devices</span>
              </Button>
            </Link>
            <Link to="/robot">
              <Button size="sm" variant="outline" className="font-mono text-xs bg-secondary/40">
                <Bot className="w-3.5 h-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Robot</span>
              </Button>
            </Link>
            <Link to="/social">
              <Button size="sm" variant="outline" className="font-mono text-xs bg-secondary/40">
                <Share2 className="w-3.5 h-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Social</span>
              </Button>
            </Link>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: Activity Feed */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-5 glass-card neon-border rounded-lg p-5 hover-lift"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono text-xs text-primary uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4" /> CLRK Activity Feed
              </h3>
              <span className="text-[9px] font-mono text-green-400 flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> LIVE DB
              </span>
            </div>
            <ClrkActivityFeed goalCount={goals.length} domainCount={domains.length} />
          </motion.div>

          {/* CENTER COLUMN: Briefing + Goals */}
          <div className="lg:col-span-4 space-y-6">
            {/* Daily Briefing */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="glass-card rounded-lg p-5 hover-lift"
            >
              <h3 className="font-mono text-xs text-primary uppercase tracking-wider flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4" /> Daily Intelligence Briefing
              </h3>
              {briefingLoading ? (
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-muted-foreground text-xs font-mono">CLRK analyzing your data...</p>
                </div>
              ) : (
                <p className="text-foreground/80 text-xs leading-relaxed whitespace-pre-line">
                  {briefing || `CLRK is monitoring ${goals.length} active goals across ${domains.length} domains. All systems operational. Open chat for a full strategic briefing.`}
                </p>
              )}
            </motion.div>

            {/* Active Goals */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Target className="w-4 h-4" /> Active Goals
                </h3>
                <span className="text-[10px] font-mono text-muted-foreground">{goals.length}</span>
              </div>
              {goals.length === 0 ? (
                <div className="glass-card rounded-lg p-6 text-center">
                  <p className="text-muted-foreground text-xs font-mono">No goals set. CLRK needs objectives to operate at full capacity.</p>
                  <Link to="/chat">
                    <Button size="sm" className="mt-3 font-mono text-xs">Define Goals with CLRK</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {goals.slice(0, 5).map(goal => {
                    const Icon = DOMAIN_ICONS[goal.domain] || Target;
                    const color = DOMAIN_COLORS[goal.domain] || 'text-primary';
                    return (
                      <div key={goal.id} className="command-surface rounded-lg p-4 space-y-2 group hover-lift">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className={`w-3.5 h-3.5 ${color}`} />
                            <span className="font-mono text-xs">{goal.title}</span>
                          </div>
                          <span className="text-[9px] font-mono text-muted-foreground uppercase">{goal.timeframe}</span>
                        </div>
                        <Progress value={goal.progress} className="h-1" />
                        <div className="flex justify-between text-[9px] font-mono text-muted-foreground">
                          <span className="capitalize">{goal.domain}</span>
                          <span className={goal.progress >= 75 ? 'text-green-400' : goal.progress >= 40 ? 'text-yellow-400' : ''}>{goal.progress}%</span>
                        </div>
                      </div>
                    );
                  })}
                  {goals.length > 5 && (
                    <p className="text-[10px] font-mono text-muted-foreground text-center">+{goals.length - 5} more goals</p>
                  )}
                </div>
              )}
            </motion.div>
          </div>

          {/* RIGHT COLUMN: System Status + Domains */}
          <div className="lg:col-span-3 space-y-6">
            {/* System Status */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card rounded-lg p-5 hover-lift"
            >
              <h3 className="font-mono text-xs text-primary uppercase tracking-wider flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4" /> System Status
              </h3>
              <ClrkSystemStatus />
            </motion.div>

            {/* Active Domains */}
            {domains.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-3">Active Domains</h3>
                <div className="grid grid-cols-2 gap-2">
                  {domains.map(d => {
                    const Icon = DOMAIN_ICONS[d.domain] || Zap;
                    const color = DOMAIN_COLORS[d.domain] || 'text-primary';
                    const domainGoals = goals.filter(g => g.domain === d.domain);
                    const avgProgress = domainGoals.length > 0
                      ? Math.round(domainGoals.reduce((s, g) => s + g.progress, 0) / domainGoals.length)
                      : 0;
                    return (
                      <div key={d.domain} className="command-surface rounded-lg p-3 text-center space-y-1 hover-lift cursor-pointer">
                        <Icon className={`w-5 h-5 mx-auto ${color}`} />
                        <p className="font-mono text-[10px] capitalize">{d.domain}</p>
                        <div className="flex items-center gap-1 justify-center">
                          <Progress value={avgProgress} className="h-0.5 w-10" />
                          <span className="text-[8px] text-muted-foreground">{avgProgress}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Quick Stats */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card rounded-lg p-4"
            >
              <h3 className="font-mono text-[9px] text-muted-foreground uppercase tracking-wider mb-3">CLRK METRICS</h3>
              <div className="space-y-2 text-[10px] font-mono">
                <div className="flex justify-between"><span className="text-muted-foreground">Domains monitored</span><span className="text-primary">{domains.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Active goals</span><span className="text-primary">{goals.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Subsystems online</span><span className="text-green-400">8/8</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Agent trust level</span><span className="text-green-400">Secure</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cognitive Council</span><span className="text-purple-400">12 minds</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Session uptime</span><span className="neon-text">{fmtUptime(uptime)}</span></div>
              </div>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
