import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Plus, Shield, ShieldAlert, ShieldCheck, ShieldOff,
  Radio, Bot, ArrowDownLeft, ArrowUpRight, Check, X, Clock,
  AlertTriangle, Zap, Settings,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const GATEWAY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-gateway`;

interface Agent {
  id: string;
  agent_name: string;
  agent_description: string | null;
  agent_endpoint: string | null;
  trust_level: 'trusted' | 'limited' | 'untrusted';
  allowed_actions: string[];
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
}

interface AgentMessage {
  id: string;
  agent_id: string;
  direction: 'inbound' | 'outbound';
  message_type: string;
  content: Record<string, unknown>;
  status: string;
  clrk_response: { response?: string } | null;
  created_at: string;
  agent_registry?: { agent_name: string; trust_level: string };
}

const TRUST_CONFIG = {
  trusted: { icon: ShieldCheck, color: 'text-green-400', border: 'border-green-400/30', bg: 'bg-green-400/10', label: 'Trusted' },
  limited: { icon: Shield, color: 'text-yellow-400', border: 'border-yellow-400/30', bg: 'bg-yellow-400/10', label: 'Limited' },
  untrusted: { icon: ShieldOff, color: 'text-destructive', border: 'border-destructive/30', bg: 'bg-destructive/10', label: 'Untrusted' },
};

const STATUS_CONFIG: Record<string, { icon: typeof Check; color: string }> = {
  approved: { icon: Check, color: 'text-green-400' },
  executed: { icon: Zap, color: 'text-primary' },
  pending: { icon: Clock, color: 'text-yellow-400' },
  rejected: { icon: X, color: 'text-destructive' },
  failed: { icon: AlertTriangle, color: 'text-destructive' },
};

const AgentNetwork = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [newAgent, setNewAgent] = useState({ name: '', description: '', endpoint: '', trustLevel: 'limited' });
  const [demoRunning, setDemoRunning] = useState(false);

  const apiCall = async (payload: Record<string, unknown>) => {
    const resp = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ ...payload, userId: user?.id }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Error ${resp.status}`);
    }
    return resp.json();
  };

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [agentRes, msgRes] = await Promise.all([
        apiCall({ action: 'list' }),
        apiCall({ action: 'messages', limit: 100 }),
      ]);
      setAgents(agentRes.agents || []);
      setMessages(msgRes.messages || []);
    } catch (err: any) {
      toast({ title: 'Load error', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [user]);

  const registerAgent = async () => {
    if (!newAgent.name.trim()) return;
    try {
      const res = await apiCall({
        action: 'register',
        agentName: newAgent.name,
        agentDescription: newAgent.description || null,
        agentEndpoint: newAgent.endpoint || null,
        trustLevel: newAgent.trustLevel,
      });
      toast({
        title: 'Agent Registered',
        description: `API Key: ${res.apiKey} — save this, it won't be shown again.`,
      });
      setRegisterOpen(false);
      setNewAgent({ name: '', description: '', endpoint: '', trustLevel: 'limited' });
      loadData();
    } catch (err: any) {
      toast({ title: 'Registration failed', description: err.message, variant: 'destructive' });
    }
  };

  const updateTrust = async (agentId: string, trustLevel: string) => {
    try {
      await apiCall({ action: 'update', agentId, trustLevel });
      toast({ title: 'Trust level updated' });
      loadData();
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    }
  };

  const toggleActive = async (agentId: string, isActive: boolean) => {
    try {
      await apiCall({ action: 'update', agentId, isActive: !isActive });
      loadData();
    } catch (err: any) {
      toast({ title: 'Toggle failed', description: err.message, variant: 'destructive' });
    }
  };

  const respondToMessage = async (messageId: string, decision: 'approved' | 'rejected') => {
    try {
      await apiCall({ action: 'respond', messageId, decision });
      toast({ title: `Message ${decision}` });
      loadData();
    } catch (err: any) {
      toast({ title: 'Response failed', description: err.message, variant: 'destructive' });
    }
  };

  const runDemo = async () => {
    if (!user || demoRunning) return;
    setDemoRunning(true);
    toast({ title: 'A2A Demo Initiated', description: 'CLRK is receiving messages from 3 external agents...' });
    try {
      await apiCall({ action: 'simulate' });
      toast({ title: 'Demo Complete', description: 'CLRK processed messages from CTO, Cousin, and Coworker agents.' });
      await loadData();
    } catch (err: any) {
      toast({ title: 'Demo error', description: err.message, variant: 'destructive' });
    }
    setDemoRunning(false);
  };

  const pendingCount = messages.filter(m => m.status === 'pending').length;
  const filteredMessages = selectedAgent
    ? messages.filter(m => m.agent_id === selectedAgent)
    : messages;

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 grid-bg opacity-10" />

      {/* Header */}
      <header className="relative z-10 border-b border-border/50 bg-card/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <div>
              <h1 className="font-mono text-lg flex items-center gap-2">
                <Radio className="w-5 h-5 text-primary" />
                <span className="neon-text">Agent Network</span>
              </h1>
              <p className="text-[10px] font-mono text-muted-foreground">
                A2A Protocol • {agents.length} agents connected
                {pendingCount > 0 && ` • ${pendingCount} pending`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={runDemo}
              disabled={demoRunning}
              variant="outline"
              className="font-mono text-xs border-primary/50 text-primary hover:bg-primary/10"
            >
              {demoRunning ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                  Running Demo...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" /> Run A2A Demo
                </>
              )}
            </Button>

            <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
              <DialogTrigger asChild>
                <Button className="font-mono text-xs bg-primary text-primary-foreground">
                  <Plus className="w-4 h-4 mr-2" /> Register Agent
                </Button>
              </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="font-mono neon-text">Register External Agent</DialogTitle>
                <DialogDescription className="text-muted-foreground text-xs font-mono">
                  Connect an external AI agent to CLRK's network
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-xs font-mono text-muted-foreground mb-1 block">Agent Name *</label>
                  <Input
                    value={newAgent.name}
                    onChange={e => setNewAgent(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. FinanceBot, HealthTracker"
                    className="bg-secondary/50 border-border/50 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-muted-foreground mb-1 block">Description</label>
                  <Textarea
                    value={newAgent.description}
                    onChange={e => setNewAgent(p => ({ ...p, description: e.target.value }))}
                    placeholder="What does this agent do?"
                    className="bg-secondary/50 border-border/50 font-mono text-sm"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-muted-foreground mb-1 block">Endpoint URL</label>
                  <Input
                    value={newAgent.endpoint}
                    onChange={e => setNewAgent(p => ({ ...p, endpoint: e.target.value }))}
                    placeholder="https://api.agent.com/webhook"
                    className="bg-secondary/50 border-border/50 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-muted-foreground mb-1 block">Trust Level</label>
                  <Select
                    value={newAgent.trustLevel}
                    onValueChange={v => setNewAgent(p => ({ ...p, trustLevel: v }))}
                  >
                    <SelectTrigger className="bg-secondary/50 border-border/50 font-mono text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trusted">🟢 Trusted — Auto-execute requests</SelectItem>
                      <SelectItem value="limited">🟡 Limited — Requires approval</SelectItem>
                      <SelectItem value="untrusted">🔴 Untrusted — Auto-reject</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={registerAgent} className="w-full font-mono text-xs bg-primary text-primary-foreground">
                  Register & Generate API Key
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Trust Protocol Overview */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card neon-border rounded-xl p-5">
          <h3 className="font-mono text-xs text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Trust Protocol
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['trusted', 'limited', 'untrusted'] as const).map(level => {
              const conf = TRUST_CONFIG[level];
              const Icon = conf.icon;
              const count = agents.filter(a => a.trust_level === level).length;
              return (
                <div key={level} className={`rounded-lg border ${conf.border} ${conf.bg} p-3 flex items-center gap-3`}>
                  <Icon className={`w-5 h-5 ${conf.color}`} />
                  <div>
                    <p className={`font-mono text-sm ${conf.color}`}>{conf.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {level === 'trusted' && 'Auto-execute • Full access'}
                      {level === 'limited' && 'Requires approval • Review first'}
                      {level === 'untrusted' && 'Auto-reject • Blocked'}
                    </p>
                  </div>
                  <span className={`ml-auto font-mono text-lg ${conf.color}`}>{count}</span>
                </div>
              );
            })}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Agent Registry */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-1 space-y-3">
            <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Bot className="w-4 h-4" /> Connected Agents
            </h3>

            {loading ? (
              <div className="glass-card rounded-xl p-6 text-center">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : agents.length === 0 ? (
              <div className="glass-card rounded-xl p-6 text-center">
                <p className="text-muted-foreground text-xs font-mono">No agents connected yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {agents.map(agent => {
                  const trust = TRUST_CONFIG[agent.trust_level];
                  const TrustIcon = trust.icon;
                  const isSelected = selectedAgent === agent.id;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => setSelectedAgent(isSelected ? null : agent.id)}
                      className={`w-full text-left glass-card rounded-lg p-4 transition-all hover:neon-border ${isSelected ? 'neon-border' : ''} ${!agent.is_active ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <TrustIcon className={`w-4 h-4 ${trust.color}`} />
                          <span className="font-mono text-sm">{agent.agent_name}</span>
                        </div>
                        <div className={`w-2 h-2 rounded-full ${agent.is_active ? 'bg-green-400' : 'bg-muted-foreground'}`} />
                      </div>
                      {agent.agent_description && (
                        <p className="text-[10px] text-muted-foreground line-clamp-2 mb-2">{agent.agent_description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={`text-[9px] font-mono ${trust.color} ${trust.border}`}>
                          {trust.label}
                        </Badge>
                        {agent.last_seen_at && (
                          <span className="text-[9px] font-mono text-muted-foreground">
                            Last: {new Date(agent.last_seen_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {/* Inline controls when selected */}
                      {isSelected && (
                        <div className="mt-3 pt-3 border-t border-border/30 space-y-2" onClick={e => e.stopPropagation()}>
                          <Select value={agent.trust_level} onValueChange={v => updateTrust(agent.id, v)}>
                            <SelectTrigger className="h-7 text-[10px] font-mono bg-secondary/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="trusted">Trusted</SelectItem>
                              <SelectItem value="limited">Limited</SelectItem>
                              <SelectItem value="untrusted">Untrusted</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-[10px] font-mono h-7"
                            onClick={() => toggleActive(agent.id, agent.is_active)}
                          >
                            {agent.is_active ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Message Feed */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4" /> Communication Log
                {selectedAgent && (
                  <Badge variant="outline" className="text-[9px] font-mono ml-2">
                    Filtered
                    <button onClick={() => setSelectedAgent(null)} className="ml-1">×</button>
                  </Badge>
                )}
              </h3>
              {pendingCount > 0 && (
                <Badge className="bg-yellow-400/10 text-yellow-400 border-yellow-400/30 font-mono text-[9px]">
                  {pendingCount} pending review
                </Badge>
              )}
            </div>

            {filteredMessages.length === 0 ? (
              <div className="glass-card rounded-xl p-8 text-center">
                <Radio className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground text-xs font-mono">No agent communications yet</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                <AnimatePresence>
                  {filteredMessages.map(msg => {
                    const statusConf = STATUS_CONFIG[msg.status] || STATUS_CONFIG.pending;
                    const StatusIcon = statusConf.icon;
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="glass-card rounded-lg p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {msg.direction === 'inbound' ? (
                              <ArrowDownLeft className="w-3.5 h-3.5 text-primary" />
                            ) : (
                              <ArrowUpRight className="w-3.5 h-3.5 text-accent" />
                            )}
                            <span className="font-mono text-xs">
                              {msg.agent_registry?.agent_name || 'Unknown Agent'}
                            </span>
                            <Badge variant="outline" className="text-[8px] font-mono">{msg.message_type}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusIcon className={`w-3.5 h-3.5 ${statusConf.color}`} />
                            <span className={`text-[9px] font-mono ${statusConf.color}`}>{msg.status}</span>
                          </div>
                        </div>

                        <div className="bg-secondary/30 rounded p-2 mb-2">
                          <pre className="text-[10px] text-foreground/70 font-mono whitespace-pre-wrap break-all">
                            {JSON.stringify(msg.content, null, 2)}
                          </pre>
                        </div>

                        {msg.clrk_response?.response && (
                          <div className="bg-primary/5 border border-primary/20 rounded p-2 mb-2">
                            <p className="text-[9px] font-mono text-primary mb-1">CLRK Response:</p>
                            <p className="text-[10px] text-foreground/80">{msg.clrk_response.response}</p>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono text-muted-foreground">
                            {new Date(msg.created_at).toLocaleString()}
                          </span>
                          {msg.status === 'pending' && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[9px] font-mono text-green-400 border-green-400/30 hover:bg-green-400/10"
                                onClick={() => respondToMessage(msg.id, 'approved')}
                              >
                                <Check className="w-3 h-3 mr-1" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[9px] font-mono text-destructive border-destructive/30 hover:bg-destructive/10"
                                onClick={() => respondToMessage(msg.id, 'rejected')}
                              >
                                <X className="w-3 h-3 mr-1" /> Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default AgentNetwork;
