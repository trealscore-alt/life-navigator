import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  Clock,
  ListChecks,
  PauseCircle,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type TaskStatus =
  | 'pending'
  | 'planning'
  | 'awaiting_user'
  | 'executing'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

type AutonomyLevel =
  | 'L0_advisory'
  | 'L1_drafting'
  | 'L2_assisted'
  | 'L3_rule_based'
  | 'L4_delegated'
  | 'L5_ambient';

interface ClrkTask {
  id: string;
  title: string;
  description: string | null;
  domain: string | null;
  status: TaskStatus;
  autonomy_level: AutonomyLevel;
  plan: Array<{ id?: string; title?: string; status?: string }>;
  scheduled_for: string | null;
  created_at: string;
  completed_at: string | null;
  result: { summary?: string } | null;
}

interface MemoryFact {
  id: string;
  kind: string;
  content: string;
  importance: number | null;
  created_at: string;
}

interface AgentMessage {
  id: string;
  agent_id: string;
  message_type: string;
  content: Record<string, unknown>;
  status: string;
  clrk_response: { response?: string } | null;
  created_at: string;
  agent_registry?: { agent_name?: string; trust_level?: string } | null;
}

interface ConversationSummary {
  id: string;
  conversation_id: string;
  summary: string;
  message_count: number;
  updated_at: string;
}

const STATUS_META: Record<TaskStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', color: 'text-muted-foreground', icon: Clock },
  planning: { label: 'Planning', color: 'text-primary', icon: Sparkles },
  awaiting_user: { label: 'Needs approval', color: 'text-yellow-400', icon: ShieldAlert },
  executing: { label: 'Executing', color: 'text-green-400', icon: Play },
  blocked: { label: 'Blocked', color: 'text-orange-400', icon: PauseCircle },
  completed: { label: 'Completed', color: 'text-green-400', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'text-destructive', icon: X },
  cancelled: { label: 'Cancelled', color: 'text-muted-foreground', icon: X },
};

const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  L0_advisory: 'Advisory',
  L1_drafting: 'Drafting',
  L2_assisted: 'Assisted',
  L3_rule_based: 'Rule-based',
  L4_delegated: 'Delegated',
  L5_ambient: 'Ambient',
};

const getErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong';

const toPercent = (value: number, total: number) => (total === 0 ? 0 : Math.round((value / total) * 100));

const AutonomyCenter = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<ClrkTask[]>([]);
  const [memories, setMemories] = useState<MemoryFact[]>([]);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [summaries, setSummaries] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [taskPrompt, setTaskPrompt] = useState('');

  const pendingApprovals = agentMessages.filter((m) => m.status === 'pending');
  const activeTasks = tasks.filter((t) => !['completed', 'cancelled', 'failed'].includes(t.status));
  const executingCount = tasks.filter((t) => t.status === 'executing').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  const autonomyDistribution = useMemo(() => {
    return (Object.keys(AUTONOMY_LABELS) as AutonomyLevel[]).map((level) => ({
      level,
      count: tasks.filter((task) => task.autonomy_level === level).length,
    }));
  }, [tasks]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [taskRes, memoryRes, messageRes, summaryRes] = await Promise.all([
        supabase
          .from('clrk_tasks')
          .select('id, title, description, domain, status, autonomy_level, plan, scheduled_for, created_at, completed_at, result')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('clrk_memory')
          .select('id, kind, content, importance, created_at')
          .eq('user_id', user.id)
          .order('importance', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(12),
        supabase
          .from('agent_messages')
          .select('id, agent_id, message_type, content, status, clrk_response, created_at, agent_registry(agent_name, trust_level)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(25),
        supabase
          .from('chat_summaries')
          .select('id, conversation_id, summary, message_count, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(8),
      ]);

      if (taskRes.error) throw taskRes.error;
      if (memoryRes.error) throw memoryRes.error;
      if (messageRes.error) throw messageRes.error;
      if (summaryRes.error) throw summaryRes.error;

      setTasks((taskRes.data || []) as ClrkTask[]);
      setMemories((memoryRes.data || []) as MemoryFact[]);
      setAgentMessages((messageRes.data || []) as AgentMessage[]);
      setSummaries((summaryRes.data || []) as ConversationSummary[]);
    } catch (err) {
      toast({ title: 'Autonomy data unavailable', description: getErrorMessage(err), variant: 'destructive' });
    }
    setLoading(false);
  }, [toast, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const createTask = async () => {
    if (!user || !taskPrompt.trim()) return;
    setCreating(true);
    try {
      const { error } = await supabase.from('clrk_tasks').insert({
        user_id: user.id,
        title: taskPrompt.trim().slice(0, 100),
        description: taskPrompt.trim(),
        status: 'pending',
        autonomy_level: 'L1_drafting',
        plan: [
          { id: crypto.randomUUID(), title: 'Clarify objective and success criteria', status: 'pending' },
          { id: crypto.randomUUID(), title: 'Draft execution plan for user approval', status: 'pending' },
        ],
      });
      if (error) throw error;
      setTaskPrompt('');
      toast({ title: 'Task added', description: 'CLRK has a new objective in the execution queue.' });
      loadData();
    } catch (err) {
      toast({ title: 'Task creation failed', description: getErrorMessage(err), variant: 'destructive' });
    }
    setCreating(false);
  };

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    try {
      const { error } = await supabase
        .from('clrk_tasks')
        .update({
          status,
          completed_at: status === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', taskId)
        .eq('user_id', user?.id);
      if (error) throw error;
      loadData();
    } catch (err) {
      toast({ title: 'Task update failed', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  const respondToAgentMessage = async (messageId: string, decision: 'approved' | 'rejected') => {
    try {
      const { data } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-gateway`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ action: 'respond', userId: user?.id, messageId, decision }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Error ${resp.status}`);
      }
      toast({ title: decision === 'approved' ? 'Agent message approved' : 'Agent message rejected' });
      loadData();
    } catch (err) {
      toast({ title: 'Approval update failed', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 grid-bg opacity-10" />

      <header className="relative z-10 border-b border-border/50 bg-card/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <div className="min-w-0">
              <h1 className="font-mono text-lg flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                <span className="neon-text">Autonomy Center</span>
              </h1>
              <p className="text-[10px] font-mono text-muted-foreground">
                Tasks • Memory • Approvals • Execution state
              </p>
            </div>
          </div>
          <Button onClick={loadData} disabled={loading} variant="outline" size="sm" className="font-mono text-xs">
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-6 space-y-6">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Active Tasks', value: activeTasks.length, icon: ListChecks, tone: 'text-primary' },
            { label: 'Executing', value: executingCount, icon: Zap, tone: 'text-green-400' },
            { label: 'Approvals', value: pendingApprovals.length, icon: ShieldAlert, tone: 'text-yellow-400' },
            { label: 'Memory Facts', value: memories.length, icon: Brain, tone: 'text-purple-400' },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-lg p-4"
            >
              <div className="flex items-center justify-between">
                <stat.icon className={`w-4 h-4 ${stat.tone}`} />
                <span className="font-mono text-2xl">{stat.value}</span>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mt-2">{stat.label}</p>
            </motion.div>
          ))}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="font-mono text-sm text-primary uppercase tracking-wider flex items-center gap-2">
                    <ListChecks className="w-4 h-4" /> Execution Queue
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">Create, monitor, pause, and complete work CLRK is tracking.</p>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">{completedCount} completed</Badge>
              </div>

              <div className="space-y-3 mb-5">
                <Textarea
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  placeholder="Give CLRK an objective to track, plan, or execute..."
                  rows={3}
                  className="bg-secondary/50 border-border/50 text-sm"
                />
                <div className="flex justify-end">
                  <Button onClick={createTask} disabled={creating || !taskPrompt.trim()} size="sm" className="font-mono text-xs">
                    {creating ? <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
                    Add Objective
                  </Button>
                </div>
              </div>

              {loading ? (
                <div className="text-xs text-muted-foreground font-mono py-8 text-center">Loading autonomy state...</div>
              ) : tasks.length === 0 ? (
                <div className="border border-dashed border-border rounded-lg p-8 text-center">
                  <p className="text-sm font-mono text-muted-foreground">No autonomous tasks yet.</p>
                  <p className="text-xs text-muted-foreground mt-2">Start with a concrete objective. CLRK will turn it into tracked work.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task) => {
                    const meta = STATUS_META[task.status];
                    const Icon = meta.icon;
                    const doneSteps = task.plan?.filter((step) => step.status === 'completed').length || 0;
                    const totalSteps = task.plan?.length || 0;
                    return (
                      <div key={task.id} className="border border-border/60 rounded-lg p-4 bg-secondary/20">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Icon className={`w-4 h-4 ${meta.color}`} />
                              <h3 className="font-mono text-sm">{task.title}</h3>
                              <Badge variant="outline" className="font-mono text-[9px]">{AUTONOMY_LABELS[task.autonomy_level]}</Badge>
                              {task.domain && <Badge variant="secondary" className="font-mono text-[9px] capitalize">{task.domain}</Badge>}
                            </div>
                            {task.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{task.description}</p>}
                          </div>
                          <span className={`text-[10px] font-mono whitespace-nowrap ${meta.color}`}>{meta.label}</span>
                        </div>

                        {totalSteps > 0 && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-1">
                              <span>Plan progress</span>
                              <span>{doneSteps}/{totalSteps}</span>
                            </div>
                            <Progress value={toPercent(doneSteps, totalSteps)} className="h-1" />
                          </div>
                        )}

                        {task.result?.summary && <p className="text-xs text-green-400/80 mt-3">{task.result.summary}</p>}

                        <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
                          <span className="text-[10px] font-mono text-muted-foreground">
                            Created {new Date(task.created_at).toLocaleDateString()}
                          </span>
                          <div className="flex items-center gap-2">
                            {task.status !== 'executing' && task.status !== 'completed' && (
                              <Button variant="outline" size="sm" className="h-7 font-mono text-[10px]" onClick={() => updateTaskStatus(task.id, 'executing')}>
                                <Play className="w-3 h-3 mr-1" /> Start
                              </Button>
                            )}
                            {task.status !== 'blocked' && task.status !== 'completed' && (
                              <Button variant="outline" size="sm" className="h-7 font-mono text-[10px]" onClick={() => updateTaskStatus(task.id, 'blocked')}>
                                <PauseCircle className="w-3 h-3 mr-1" /> Pause
                              </Button>
                            )}
                            {task.status !== 'completed' && (
                              <Button variant="outline" size="sm" className="h-7 font-mono text-[10px] text-green-400 border-green-400/30" onClick={() => updateTaskStatus(task.id, 'completed')}>
                                <Check className="w-3 h-3 mr-1" /> Done
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card rounded-xl p-5">
              <h2 className="font-mono text-sm text-primary uppercase tracking-wider flex items-center gap-2 mb-4">
                <ShieldAlert className="w-4 h-4" /> Approval Firewall
              </h2>
              {pendingApprovals.length === 0 ? (
                <p className="text-xs text-muted-foreground">No limited-trust agent requests are waiting on you.</p>
              ) : (
                <div className="space-y-3">
                  {pendingApprovals.slice(0, 5).map((msg) => (
                    <div key={msg.id} className="border border-yellow-400/20 bg-yellow-400/5 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{msg.agent_registry?.agent_name || 'External Agent'}</span>
                        <Badge variant="outline" className="font-mono text-[9px]">{msg.message_type}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-3">
                        {JSON.stringify(msg.content)}
                      </p>
                      {msg.clrk_response?.response && (
                        <p className="text-xs text-primary/80 mt-2 line-clamp-3">{msg.clrk_response.response}</p>
                      )}
                      <div className="flex justify-end gap-2 mt-3">
                        <Button variant="outline" size="sm" className="h-7 font-mono text-[10px]" onClick={() => respondToAgentMessage(msg.id, 'rejected')}>
                          <X className="w-3 h-3 mr-1" /> Reject
                        </Button>
                        <Button size="sm" className="h-7 font-mono text-[10px]" onClick={() => respondToAgentMessage(msg.id, 'approved')}>
                          <Check className="w-3 h-3 mr-1" /> Approve
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card rounded-xl p-5">
              <h2 className="font-mono text-sm text-primary uppercase tracking-wider flex items-center gap-2 mb-4">
                <Brain className="w-4 h-4" /> Long-Term Memory
              </h2>
              {memories.length === 0 ? (
                <p className="text-xs text-muted-foreground">No stored memory facts yet. CLRK will save durable preferences and patterns during agent conversations.</p>
              ) : (
                <div className="space-y-2">
                  {memories.map((memory) => (
                    <div key={memory.id} className="border border-border/50 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <Badge variant="secondary" className="font-mono text-[9px]">{memory.kind}</Badge>
                        <span className="text-[9px] font-mono text-muted-foreground">I{memory.importance ?? 5}</span>
                      </div>
                      <p className="text-xs text-foreground/85">{memory.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card rounded-xl p-5">
              <h2 className="font-mono text-sm text-primary uppercase tracking-wider flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4" /> Autonomy Levels
              </h2>
              <div className="space-y-3">
                {autonomyDistribution.map(({ level, count }) => (
                  <div key={level}>
                    <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-1">
                      <span>{level.replace('_', ' ')} • {AUTONOMY_LABELS[level]}</span>
                      <span>{count}</span>
                    </div>
                    <Progress value={toPercent(count, Math.max(tasks.length, 1))} className="h-1" />
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card rounded-xl p-5">
              <h2 className="font-mono text-sm text-primary uppercase tracking-wider flex items-center gap-2 mb-4">
                <Bot className="w-4 h-4" /> Session Continuity
              </h2>
              {summaries.length === 0 ? (
                <p className="text-xs text-muted-foreground">No rolling chat summaries yet.</p>
              ) : (
                <div className="space-y-3">
                  {summaries.map((summary) => (
                    <div key={summary.id} className="border border-border/50 rounded-lg p-3">
                      <p className="text-xs text-foreground/85 line-clamp-3">{summary.summary}</p>
                      <p className="text-[9px] font-mono text-muted-foreground mt-2">
                        {summary.message_count} messages • {new Date(summary.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default AutonomyCenter;
