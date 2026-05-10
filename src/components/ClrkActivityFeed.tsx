import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Shield, TrendingUp, AlertTriangle, Zap, Eye,
  Activity, Radio, Clock, CheckCircle2, ArrowRight, Loader2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ClrkAction {
  id: string;
  type: 'scan' | 'alert' | 'action' | 'insight' | 'defense' | 'optimization' | 'news' | 'markets' | 'politics';
  title: string;
  detail: string;
  timestamp: Date;
  domain?: string;
  status: 'running' | 'completed' | 'pending';
  source?: string;
  url?: string;
  relevance?: number;
}

type RuntimeError = { message?: string };

interface RuntimeQuery<T> extends PromiseLike<{ data: T[] | null; error: RuntimeError | null }> {
  eq(column: string, value: unknown): RuntimeQuery<T>;
  order(column: string, options: { ascending: boolean }): RuntimeQuery<T>;
  limit(count: number): RuntimeQuery<T>;
}

interface RuntimeDb {
  from<T>(table: string): {
    select(columns: string): RuntimeQuery<T>;
  };
}

type TaskRow = {
  id: string;
  title: string;
  status: string;
  domain: string | null;
  updated_at: string;
  created_at: string;
};

type SubagentRow = {
  id: string;
  name: string;
  role: string;
  status: string;
  domain: string | null;
  last_deployed_at: string | null;
  created_at: string;
};

type SubagentRunRow = {
  id: string;
  objective: string;
  status: string;
  created_at: string;
  completed_at: string | null;
};

type HistoryEventRow = {
  id: string;
  source: string;
  kind: string;
  title: string | null;
  content: string;
  occurred_at: string;
};

type DeviceReadingRow = {
  id: string;
  device_name: string | null;
  data_type: string;
  value: number;
  unit: string;
  processed: boolean | null;
  created_at: string;
};

type BriefingRow = {
  id: string;
  briefing_date: string;
  content: string;
  created_at: string;
};

type IntelligenceItem = {
  id: string;
  category: 'markets' | 'world' | 'national' | 'local' | 'politics' | 'investing' | 'mission';
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt?: string | null;
  relevance: number;
  matchedTerms: string[];
};

const ICONS: Record<string, typeof Eye> = {
  scan: Eye, alert: AlertTriangle, action: Zap,
  insight: Brain, defense: Shield, optimization: TrendingUp,
  news: Radio, markets: Activity, politics: Shield,
};

const COLORS: Record<string, string> = {
  scan: 'text-primary', alert: 'text-yellow-400', action: 'text-accent',
  insight: 'text-purple-400', defense: 'text-green-400', optimization: 'text-primary',
  news: 'text-blue-300', markets: 'text-green-300', politics: 'text-red-300',
};

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-primary animate-pulse', completed: 'bg-green-400', pending: 'bg-yellow-400',
};

const toFeedStatus = (status: string): ClrkAction['status'] => {
  if (['completed', 'failed', 'cancelled', 'archived'].includes(status)) return 'completed';
  if (['awaiting_user', 'blocked', 'pending', 'queued', 'ready', 'draft'].includes(status)) return 'pending';
  return 'running';
};

const truncate = (text: string, length = 130) =>
  text.length > length ? `${text.slice(0, length - 1).trim()}...` : text;

const INTELLIGENCE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clrk-intelligence-feed`;

const feedTypeForCategory = (category: IntelligenceItem['category']): ClrkAction['type'] => {
  if (category === 'markets' || category === 'investing') return 'markets';
  if (category === 'politics') return 'politics';
  return 'news';
};

export default function ClrkActivityFeed({ goalCount = 0, domainCount = 0 }: { goalCount?: number; domainCount?: number }) {
  const { user } = useAuth();
  const [actions, setActions] = useState<ClrkAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const runtimeDb = supabase as unknown as RuntimeDb;
    let cancelled = false;

    const loadFeed = async () => {
      setLoading(true);
      setError(null);

      const intelligencePromise = fetch(INTELLIGENCE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ userId: user.id, limit: 24 }),
      }).then(async (response) => {
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Intelligence feed ${response.status}`);
        return await response.json() as { items?: IntelligenceItem[] };
      });

      const [taskRes, subagentRes, runRes, historyRes, deviceRes, briefingRes, intelligenceRes] = await Promise.all([
        runtimeDb.from<TaskRow>('clrk_tasks')
          .select('id, title, status, domain, updated_at, created_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(8),
        runtimeDb.from<SubagentRow>('clrk_subagents')
          .select('id, name, role, status, domain, last_deployed_at, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(8),
        runtimeDb.from<SubagentRunRow>('clrk_subagent_runs')
          .select('id, objective, status, created_at, completed_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(8),
        runtimeDb.from<HistoryEventRow>('clrk_history_events')
          .select('id, source, kind, title, content, occurred_at')
          .eq('user_id', user.id)
          .order('occurred_at', { ascending: false })
          .limit(8),
        supabase.from('device_data_logs')
          .select('id, device_name, data_type, value, unit, processed, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(8),
        supabase.from('daily_briefings')
          .select('id, briefing_date, content, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(3),
        intelligencePromise.then(
          (data) => ({ data: data.items || [], error: null }),
          (feedError: Error) => ({ data: [] as IntelligenceItem[], error: { message: feedError.message } }),
        ),
      ]);

      if (cancelled) return;

      const firstError = [taskRes, subagentRes, runRes, historyRes, deviceRes, briefingRes]
        .find((res) => res.error)?.error?.message;
      if (firstError) {
        setError(firstError);
        setActions([]);
        setLoading(false);
        return;
      }

      const liveActions: ClrkAction[] = [
        ...(intelligenceRes.data || []).map((item) => ({
          id: `intel-${item.id}`,
          type: feedTypeForCategory(item.category),
          title: item.title,
          detail: truncate(item.summary || item.title, 180),
          timestamp: new Date(item.publishedAt || Date.now()),
          domain: item.category,
          status: 'completed' as const,
          source: item.source,
          url: item.url,
          relevance: item.relevance,
        })),
        ...(taskRes.data || []).map((task) => ({
          id: `task-${task.id}`,
          type: 'action' as const,
          title: `Task ${task.status.replace(/_/g, ' ')}`,
          detail: task.title,
          timestamp: new Date(task.updated_at || task.created_at),
          domain: task.domain || undefined,
          status: toFeedStatus(task.status),
        })),
        ...(subagentRes.data || []).map((agent) => ({
          id: `subagent-${agent.id}`,
          type: 'defense' as const,
          title: `${agent.name} ${agent.status}`,
          detail: `${agent.role}: ${agent.status === 'deployed' ? 'actively assigned' : 'available for assignment'}`,
          timestamp: new Date(agent.last_deployed_at || agent.created_at),
          domain: agent.domain || undefined,
          status: toFeedStatus(agent.status),
        })),
        ...(runRes.data || []).map((run) => ({
          id: `run-${run.id}`,
          type: 'scan' as const,
          title: `Subagent run ${run.status.replace(/_/g, ' ')}`,
          detail: truncate(run.objective),
          timestamp: new Date(run.completed_at || run.created_at),
          status: toFeedStatus(run.status),
        })),
        ...(historyRes.data || []).map((event) => ({
          id: `history-${event.id}`,
          type: event.source === 'device' ? 'scan' as const : 'insight' as const,
          title: event.title || `${event.source} ${event.kind}`,
          detail: truncate(event.content),
          timestamp: new Date(event.occurred_at),
          domain: event.source,
          status: 'completed' as const,
        })),
        ...(deviceRes.data || []).map((reading: DeviceReadingRow) => ({
          id: `device-${reading.id}`,
          type: 'scan' as const,
          title: `${reading.device_name || 'Device'} reading`,
          detail: `${reading.data_type}: ${reading.value} ${reading.unit}${reading.processed ? ' processed by CLRK' : ' awaiting analysis'}`,
          timestamp: new Date(reading.created_at),
          domain: 'devices',
          status: reading.processed ? 'completed' as const : 'pending' as const,
        })),
        ...(briefingRes.data || []).map((briefing: BriefingRow) => ({
          id: `briefing-${briefing.id}`,
          type: 'insight' as const,
          title: `Daily briefing ${briefing.briefing_date}`,
          detail: truncate(briefing.content),
          timestamp: new Date(briefing.created_at),
          domain: 'briefing',
          status: 'completed' as const,
        })),
      ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 14);

      setActions(liveActions);
      if (intelligenceRes.error?.message && liveActions.length === 0) {
        setError(intelligenceRes.error.message);
      }
      setLoading(false);
    };

    loadFeed();
    const timer = window.setInterval(loadFeed, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user]);

  return (
    <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 scrollbar-thin">
      {loading && (
        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-secondary/20 p-3 text-[10px] font-mono text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          Reading live CLRK runtime events...
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[10px] text-destructive">
          Activity feed could not load live data: {error}
        </div>
      )}
      {!loading && !error && actions.length === 0 && (
        <div className="rounded-lg border border-border/40 bg-secondary/20 p-4 text-[10px] text-muted-foreground">
          No live runtime events yet. CLRK is tracking {goalCount} active goal{goalCount === 1 ? '' : 's'} across {domainCount} domain{domainCount === 1 ? '' : 's'}. Create tasks, subagents, device readings, or a briefing and they will appear here.
        </div>
      )}
      <AnimatePresence mode="popLayout">
        {actions.map((action) => {
          const Icon = ICONS[action.type] || Zap;
          const color = COLORS[action.type] || 'text-primary';
          const content = (
            <>
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
                  {action.source && (
                    <span className="text-[9px] text-foreground/50">{action.source}</span>
                  )}
                  {typeof action.relevance === 'number' && (
                    <span className="text-[9px] text-green-300/70">{action.relevance}% match</span>
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
              {action.url && (
                <ArrowRight className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
              )}
            </>
          );

          return (
            <motion.div
              key={action.id}
              layout
              initial={{ opacity: 0, x: -20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="group"
            >
              {action.url ? (
                <a
                  href={action.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex gap-3 items-start p-3 rounded-lg bg-secondary/20 border border-border/30 hover:border-primary/30 transition-colors"
                >
                  {content}
                </a>
              ) : (
                <div className="flex gap-3 items-start p-3 rounded-lg bg-secondary/20 border border-border/30 hover:border-primary/30 transition-colors">
                  {content}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
