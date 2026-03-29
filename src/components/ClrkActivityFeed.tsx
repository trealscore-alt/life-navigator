import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Shield, TrendingUp, AlertTriangle, Zap, Eye,
  DollarSign, Activity, Radio, Clock, CheckCircle2, ArrowRight,
} from 'lucide-react';

interface ClrkAction {
  id: string;
  type: 'scan' | 'alert' | 'action' | 'insight' | 'defense' | 'optimization';
  title: string;
  detail: string;
  timestamp: Date;
  domain?: string;
  status: 'running' | 'completed' | 'pending';
}

const ICONS: Record<string, any> = {
  scan: Eye, alert: AlertTriangle, action: Zap,
  insight: Brain, defense: Shield, optimization: TrendingUp,
};

const COLORS: Record<string, string> = {
  scan: 'text-primary', alert: 'text-yellow-400', action: 'text-accent',
  insight: 'text-purple-400', defense: 'text-green-400', optimization: 'text-primary',
};

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-primary animate-pulse', completed: 'bg-green-400', pending: 'bg-yellow-400',
};

// Simulated proactive CLRK activity — in production these come from real subsystems
const PROACTIVE_ACTIONS: Omit<ClrkAction, 'id' | 'timestamp'>[] = [
  { type: 'scan', title: 'Environment scan complete', detail: 'No threats detected. All connected systems nominal.', domain: 'lifestyle', status: 'completed' },
  { type: 'optimization', title: 'Spending pattern detected', detail: 'Recurring charge of $14.99/mo identified — unused subscription. Recommend cancellation → $180/yr saved.', domain: 'finance', status: 'completed' },
  { type: 'insight', title: 'Goal acceleration opportunity', detail: 'Your learning velocity increased 23% this week. At this rate, certification achievable 2 weeks early.', domain: 'learning', status: 'completed' },
  { type: 'defense', title: 'Agent firewall active', detail: '0 unauthorized agent requests in last 24h. Trust perimeter secure.', status: 'completed' },
  { type: 'action', title: 'Daily routine optimized', detail: 'Morning block restructured: deep work 6-9am, meetings 10-12. Saves 47min context-switching.', domain: 'work', status: 'completed' },
  { type: 'alert', title: 'Health trend flagged', detail: 'Sleep consistency dropped 15% over 5 days. Correlates with late screen time. Recommend 10pm digital cutoff.', domain: 'health', status: 'pending' },
  { type: 'scan', title: 'Market watch triggered', detail: 'S&P 500 down 2.1%. Your portfolio hedge is active. No action required — holding per Buffett protocol.', domain: 'finance', status: 'completed' },
  { type: 'optimization', title: 'Relationship maintenance', detail: 'Haven\'t contacted 3 key network connections in 30+ days. Draft messages prepared for your review.', domain: 'relationships', status: 'pending' },
  { type: 'action', title: 'Auto-saved $42.00', detail: 'Detected price drop on watched item. Purchased at optimal price per your pre-authorized rules.', domain: 'finance', status: 'completed' },
  { type: 'insight', title: 'Cognitive Council analysis', detail: 'Applied Musk first-principles to your Q2 goal set. 2 goals can be collapsed into 1 higher-leverage objective.', domain: 'ambition', status: 'completed' },
];

export default function ClrkActivityFeed({ goalCount = 0, domainCount = 0 }: { goalCount?: number; domainCount?: number }) {
  const [actions, setActions] = useState<ClrkAction[]>([]);
  const [feedIndex, setFeedIndex] = useState(0);

  // Simulate CLRK's proactive activity feed — stagger entries like a real system
  useEffect(() => {
    const initial = PROACTIVE_ACTIONS.slice(0, 3).map((a, i) => ({
      ...a,
      id: crypto.randomUUID(),
      timestamp: new Date(Date.now() - (3 - i) * 60000 * (5 + Math.random() * 10)),
    }));
    setActions(initial);
    setFeedIndex(3);
  }, []);

  // Drip-feed new actions every 12 seconds
  useEffect(() => {
    if (feedIndex >= PROACTIVE_ACTIONS.length) return;
    const timer = setInterval(() => {
      setFeedIndex(prev => {
        if (prev >= PROACTIVE_ACTIONS.length) return prev;
        const next = PROACTIVE_ACTIONS[prev];
        setActions(a => [
          { ...next, id: crypto.randomUUID(), timestamp: new Date() },
          ...a,
        ].slice(0, 12));
        return prev + 1;
      });
    }, 12000);
    return () => clearInterval(timer);
  }, [feedIndex]);

  return (
    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin">
      <AnimatePresence mode="popLayout">
        {actions.map((action) => {
          const Icon = ICONS[action.type] || Zap;
          const color = COLORS[action.type] || 'text-primary';
          return (
            <motion.div
              key={action.id}
              layout
              initial={{ opacity: 0, x: -20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="flex gap-3 items-start p-3 rounded-lg bg-secondary/20 border border-border/30 hover:border-primary/30 transition-colors group"
            >
              <div className={`p-1.5 rounded-md bg-secondary/50 ${color} flex-shrink-0`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-medium truncate">{action.title}</span>
                  <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[action.status]} flex-shrink-0`} />
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{action.detail}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  {action.domain && (
                    <span className="text-[9px] font-mono text-primary/60 uppercase">{action.domain}</span>
                  )}
                  <span className="text-[9px] text-muted-foreground/50">
                    {action.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
              {action.status === 'pending' && (
                <button className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-mono text-primary flex items-center gap-0.5 flex-shrink-0">
                  Act <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
