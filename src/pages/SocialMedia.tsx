import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Plus, Twitter, Linkedin, Instagram, Send, Sparkles,
  Calendar, Clock, CheckCircle, XCircle, AlertCircle, Loader2, Trash2
} from 'lucide-react';

type Platform = 'twitter' | 'instagram' | 'linkedin';
type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'pending_approval';

interface SocialAccount {
  id: string;
  platform: Platform;
  account_name: string;
  account_handle: string | null;
  is_active: boolean;
}

interface ScheduledPost {
  id: string;
  platform: Platform;
  content: string;
  scheduled_for: string | null;
  published_at: string | null;
  status: PostStatus;
  auto_approved: boolean;
  created_at: string;
}

const FUNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/social-media`;

const platformConfig: Record<Platform, { icon: typeof Twitter; label: string; color: string; bgColor: string }> = {
  twitter: { icon: Twitter, label: 'Twitter / X', color: 'text-sky-400', bgColor: 'bg-sky-400/10 border-sky-400/30' },
  instagram: { icon: Instagram, label: 'Instagram', color: 'text-pink-400', bgColor: 'bg-pink-400/10 border-pink-400/30' },
  linkedin: { icon: Linkedin, label: 'LinkedIn', color: 'text-blue-400', bgColor: 'bg-blue-400/10 border-blue-400/30' },
};

const statusConfig: Record<PostStatus, { icon: typeof CheckCircle; label: string; color: string }> = {
  draft: { icon: AlertCircle, label: 'Draft', color: 'text-muted-foreground' },
  scheduled: { icon: Clock, label: 'Scheduled', color: 'text-yellow-400' },
  published: { icon: CheckCircle, label: 'Published', color: 'text-green-400' },
  failed: { icon: XCircle, label: 'Failed', color: 'text-destructive' },
  pending_approval: { icon: AlertCircle, label: 'Pending Approval', color: 'text-orange-400' },
};

const SocialMedia = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'content' | 'accounts' | 'scheduled'>('content');

  // Content creation state
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('twitter');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('professional but authentic');
  const [generatedContent, setGeneratedContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');

  // Connect account state
  const [connectPlatform, setConnectPlatform] = useState<Platform>('twitter');
  const [connectName, setConnectName] = useState('');
  const [connectHandle, setConnectHandle] = useState('');
  const [connecting, setConnecting] = useState(false);

  const callApi = async (action: string, params: Record<string, unknown> = {}) => {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) throw new Error('Not authenticated');

    const resp = await fetch(FUNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, ...params }),
    });

    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const [accountsRes, postsRes] = await Promise.all([
          callApi('list_accounts'),
          callApi('list_posts', {}),
        ]);
        setAccounts(accountsRes.accounts || []);
        setPosts(postsRes.posts || []);
      } catch (err: any) {
        console.error('Failed to load social data:', err);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const generateContent = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    try {
      const res = await callApi('generate_content', {
        platform: selectedPlatform,
        topic: topic.trim(),
        tone,
        contentType: 'post',
      });
      setGeneratedContent(res.content || '');
      toast({ title: 'Content Generated', description: 'CLRK crafted your post. Review and schedule it.' });
    } catch (err: any) {
      toast({ title: 'Generation Failed', description: err.message, variant: 'destructive' });
    }
    setGenerating(false);
  };

  const schedulePost = async () => {
    if (!generatedContent.trim()) return;
    setScheduling(true);
    try {
      const account = accounts.find(a => a.platform === selectedPlatform);
      await callApi('schedule_post', {
        platform: selectedPlatform,
        content: generatedContent.trim(),
        scheduledFor: scheduleDate || null,
        socialAccountId: account?.id || null,
        autoApproved: !!scheduleDate,
      });
      toast({ title: 'Post Scheduled', description: `${platformConfig[selectedPlatform].label} post queued successfully.` });
      setGeneratedContent('');
      setTopic('');
      setScheduleDate('');
      // Refresh posts
      const postsRes = await callApi('list_posts', {});
      setPosts(postsRes.posts || []);
    } catch (err: any) {
      toast({ title: 'Scheduling Failed', description: err.message, variant: 'destructive' });
    }
    setScheduling(false);
  };

  const approvePost = async (postId: string) => {
    try {
      await callApi('approve_post', { postId });
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'scheduled' as PostStatus } : p));
      toast({ title: 'Post Approved' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const connectAccount = async () => {
    if (!connectName.trim()) return;
    setConnecting(true);
    try {
      const res = await callApi('connect_account', {
        platform: connectPlatform,
        accountName: connectName.trim(),
        accountHandle: connectHandle.trim() || null,
      });
      setAccounts(prev => [...prev, res.account]);
      setConnectName('');
      setConnectHandle('');
      toast({ title: 'Account Connected', description: `${platformConfig[connectPlatform].label} account linked.` });
    } catch (err: any) {
      toast({ title: 'Connection Failed', description: err.message, variant: 'destructive' });
    }
    setConnecting(false);
  };

  const disconnectAccount = async (accountId: string) => {
    try {
      await callApi('disconnect_account', { accountId });
      setAccounts(prev => prev.filter(a => a.id !== accountId));
      toast({ title: 'Account Disconnected' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen clrk-shell relative">
      <div className="absolute inset-0 grid-bg opacity-5" />

      <header className="relative z-10 control-bar px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/dashboard">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <h1 className="font-mono text-sm neon-text font-bold">SOCIAL COMMAND</h1>
            <p className="text-[10px] font-mono text-muted-foreground">Multi-platform marketing ops</p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
          {accounts.length} CONNECTED
        </div>
      </header>

      {/* Tab Bar */}
      <div className="relative z-10 border-b border-border/50 bg-card/20 backdrop-blur-sm px-4 sm:px-6">
        <div className="flex gap-1">
          {(['content', 'scheduled', 'accounts'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-xs font-mono uppercase tracking-wider border-b-2 transition-all ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'content' ? '✍️ Create' : tab === 'scheduled' ? '📅 Queue' : '🔗 Accounts'}
            </button>
          ))}
        </div>
      </div>

      <div className="relative z-10 p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
        {/* Content Creation Tab */}
        {activeTab === 'content' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Platform Selector */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Platform</label>
              <div className="flex gap-2">
                {(Object.keys(platformConfig) as Platform[]).map(p => {
                  const cfg = platformConfig[p];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={p}
                      onClick={() => setSelectedPlatform(p)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-mono transition-all ${
                        selectedPlatform === p
                          ? `${cfg.bgColor} ${cfg.color} shadow-lg`
                          : 'border-border/50 text-muted-foreground hover:border-primary/30'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="hidden sm:inline">{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Topic Input */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Topic / Idea</label>
              <Textarea
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="What should CLRK create content about? e.g. 'Launch announcement for our new AI product'"
                className="bg-secondary/50 border-border/50 focus:border-primary font-sans text-sm min-h-[80px]"
              />
            </div>

            {/* Tone */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Tone</label>
              <div className="flex flex-wrap gap-2">
                {['professional but authentic', 'casual & fun', 'bold & provocative', 'educational', 'inspirational'].map(t => (
                  <button
                    key={t}
                    onClick={() => setTone(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                      tone === t
                        ? 'border-primary/50 text-primary bg-primary/10'
                        : 'border-border/50 text-muted-foreground hover:border-primary/30'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Button */}
            <Button
              onClick={generateContent}
              disabled={!topic.trim() || generating}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_-3px_hsl(var(--neon-glow)/0.4)]"
            >
              {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              {generating ? 'CLRK is crafting...' : 'Generate with CLRK'}
            </Button>

            {/* Generated Content Preview */}
            {generatedContent && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="glass-card border border-border/50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted-foreground uppercase">Generated Content</span>
                    <span className={`text-xs font-mono ${platformConfig[selectedPlatform].color}`}>
                      {platformConfig[selectedPlatform].label}
                    </span>
                  </div>
                  <Textarea
                    value={generatedContent}
                    onChange={e => setGeneratedContent(e.target.value)}
                    className="bg-secondary/30 border-border/30 text-sm min-h-[120px]"
                  />
                  {selectedPlatform === 'twitter' && (
                    <p className={`text-xs font-mono ${generatedContent.length > 280 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {generatedContent.length}/280 characters
                    </p>
                  )}
                </div>

                {/* Schedule Controls */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <input
                      type="datetime-local"
                      value={scheduleDate}
                      onChange={e => setScheduleDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm font-mono text-foreground"
                    />
                  </div>
                  <Button
                    onClick={schedulePost}
                    disabled={scheduling || !generatedContent.trim()}
                    className="bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    {scheduling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calendar className="w-4 h-4 mr-2" />}
                    {scheduleDate ? 'Schedule Post' : 'Save as Draft'}
                  </Button>
                  <Button
                    onClick={() => { setScheduleDate(''); schedulePost(); }}
                    disabled={scheduling || !generatedContent.trim()}
                    variant="outline"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Post Now
                  </Button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Scheduled Posts Tab */}
        {activeTab === 'scheduled' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {posts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p className="font-mono text-sm">No posts in queue yet</p>
                <p className="text-xs mt-1">Create content in the Create tab to get started</p>
              </div>
            ) : (
              posts.map(post => {
                const platCfg = platformConfig[post.platform];
                const statCfg = statusConfig[post.status];
                const StatusIcon = statCfg.icon;
                const PlatIcon = platCfg.icon;

                return (
                  <div key={post.id} className="glass-card border border-border/50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PlatIcon className={`w-4 h-4 ${platCfg.color}`} />
                        <span className={`text-xs font-mono ${platCfg.color}`}>{platCfg.label}</span>
                      </div>
                      <div className={`flex items-center gap-1.5 text-xs font-mono ${statCfg.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statCfg.label}
                      </div>
                    </div>
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap">{post.content}</p>
                    <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                      <span>{post.scheduled_for ? `Scheduled: ${new Date(post.scheduled_for).toLocaleString()}` : 'No schedule set'}</span>
                      {post.status === 'pending_approval' && (
                        <Button size="sm" variant="outline" onClick={() => approvePost(post.id)} className="text-xs h-7">
                          <CheckCircle className="w-3 h-3 mr-1" /> Approve
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </motion.div>
        )}

        {/* Accounts Tab */}
        {activeTab === 'accounts' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Connected Accounts */}
            <div className="space-y-3">
              <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Connected Accounts</h3>
              {accounts.length === 0 ? (
                <div className="text-center py-8 glass-card border border-border/50 rounded-xl text-muted-foreground">
                  <p className="font-mono text-sm">No accounts connected</p>
                  <p className="text-xs mt-1">Connect your social profiles below</p>
                </div>
              ) : (
                accounts.map(acc => {
                  const cfg = platformConfig[acc.platform];
                  const Icon = cfg.icon;
                  return (
                    <div key={acc.id} className={`flex items-center justify-between p-4 rounded-xl border ${cfg.bgColor}`}>
                      <div className="flex items-center gap-3">
                        <Icon className={`w-5 h-5 ${cfg.color}`} />
                        <div>
                          <p className="text-sm font-medium">{acc.account_name}</p>
                          {acc.account_handle && <p className={`text-xs font-mono ${cfg.color}`}>@{acc.account_handle}</p>}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => disconnectAccount(acc.id)} className="text-destructive hover:text-destructive/80">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Connect New Account */}
            <div className="glass-card border border-border/50 rounded-xl p-4 space-y-4">
              <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-3 h-3" /> Connect New Account
              </h3>
              <div className="flex gap-2">
                {(Object.keys(platformConfig) as Platform[]).map(p => {
                  const cfg = platformConfig[p];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={p}
                      onClick={() => setConnectPlatform(p)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono transition-all ${
                        connectPlatform === p ? `${cfg.bgColor} ${cfg.color}` : 'border-border/50 text-muted-foreground'
                      }`}
                    >
                      <Icon className="w-3 h-3" /> {cfg.label}
                    </button>
                  );
                })}
              </div>
              <input
                value={connectName}
                onChange={e => setConnectName(e.target.value)}
                placeholder="Account name (e.g. My Business)"
                className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm"
              />
              <input
                value={connectHandle}
                onChange={e => setConnectHandle(e.target.value)}
                placeholder="Handle (e.g. mybusiness)"
                className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm"
              />
              <Button onClick={connectAccount} disabled={connecting || !connectName.trim()} className="w-full">
                {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Connect {platformConfig[connectPlatform].label}
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default SocialMedia;
