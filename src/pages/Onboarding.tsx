import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { ChevronRight, ChevronLeft, User, Target, Compass, Settings, Zap } from 'lucide-react';

const DOMAINS = [
  { value: 'work', label: 'Work & Career', icon: '💼' },
  { value: 'finance', label: 'Wealth & Finance', icon: '💰' },
  { value: 'health', label: 'Health & Lifestyle', icon: '🏃' },
  { value: 'relationships', label: 'Relationships', icon: '❤️' },
  { value: 'learning', label: 'Learning & Growth', icon: '📚' },
  { value: 'lifestyle', label: 'Lifestyle Design', icon: '🏡' },
  { value: 'ambition', label: 'Ambition & Legacy', icon: '🚀' },
];

const ROLES = ['Founder', 'Executive', 'Employee', 'Freelancer', 'Parent', 'Student', 'Investor', 'Creator', 'Leader'];

const Onboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [data, setData] = useState({
    displayName: '',
    roles: [] as string[],
    personalityType: '',
    selectedDomains: [] as string[],
    goals: [{ title: '', domain: 'work', timeframe: 'month' }],
    communicationStyle: 'direct',
    riskTolerance: 'moderate',
    automationComfort: 'advisory',
    challenges: '',
    timeDrains: '',
    priorities: '',
  });

  const steps = [
    { title: 'Identity', icon: User, desc: 'Who you are' },
    { title: 'Domains', icon: Compass, desc: 'What matters' },
    { title: 'Goals', icon: Target, desc: 'Where you\'re headed' },
    { title: 'Preferences', icon: Settings, desc: 'How CLRK operates' },
    { title: 'Current State', icon: Zap, desc: 'Where you are now' },
  ];

  const progress = ((step + 1) / steps.length) * 100;

  const toggleRole = (role: string) => {
    setData(d => ({
      ...d,
      roles: d.roles.includes(role) ? d.roles.filter(r => r !== role) : [...d.roles, role],
    }));
  };

  const toggleDomain = (domain: string) => {
    setData(d => ({
      ...d,
      selectedDomains: d.selectedDomains.includes(domain)
        ? d.selectedDomains.filter(dd => dd !== domain)
        : [...d.selectedDomains, domain],
    }));
  };

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);

    try {
      // Update profile
      await supabase.from('profiles').update({
        display_name: data.displayName || user.email,
        roles: data.roles,
        personality_type: data.personalityType,
        communication_style: data.communicationStyle,
        risk_tolerance: data.riskTolerance,
        automation_comfort: data.automationComfort,
        current_challenges: data.challenges.split('\n').filter(Boolean),
        time_drains: data.timeDrains.split('\n').filter(Boolean),
        top_priorities: data.priorities.split('\n').filter(Boolean),
        onboarding_completed: true,
      }).eq('user_id', user.id);

      // Insert domains
      if (data.selectedDomains.length > 0) {
        await supabase.from('user_domains').insert(
          data.selectedDomains.map((domain, i) => ({
            user_id: user.id,
            domain: domain as any,
            priority: i,
            is_active: true,
          }))
        );
      }

      // Insert goals
      const validGoals = data.goals.filter(g => g.title.trim());
      if (validGoals.length > 0) {
        await supabase.from('user_goals').insert(
          validGoals.map(g => ({
            user_id: user.id,
            title: g.title,
            domain: g.domain as any,
            timeframe: g.timeframe,
          }))
        );
      }

      navigate('/dashboard');
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to save profile', variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-20" />

      {/* Header */}
      <div className="relative z-10 p-6">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <h1 className="font-mono text-lg neon-text">CLRK</h1>
          <span className="font-mono text-xs text-muted-foreground">
            INITIALIZATION {step + 1}/{steps.length}
          </span>
        </div>
        <div className="max-w-2xl mx-auto mt-4">
          <Progress value={progress} className="h-1 bg-secondary" />
        </div>
        {/* Step indicators */}
        <div className="max-w-2xl mx-auto mt-4 flex justify-between">
          {steps.map((s, i) => (
            <button
              key={s.title}
              onClick={() => i < step && setStep(i)}
              className={`flex flex-col items-center gap-1 transition-colors ${
                i === step ? 'text-primary' : i < step ? 'text-muted-foreground cursor-pointer' : 'text-border'
              }`}
            >
              <s.icon className="w-4 h-4" />
              <span className="text-[10px] font-mono hidden sm:block">{s.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 relative z-10">
        <div className="w-full max-w-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="glass-card neon-border rounded-xl p-8"
            >
              {step === 0 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-mono text-2xl mb-1">Identity Profile</h2>
                    <p className="text-muted-foreground text-sm">Help CLRK understand who you are.</p>
                  </div>
                  <div>
                    <label className="text-xs font-mono text-muted-foreground uppercase">Display Name</label>
                    <Input
                      value={data.displayName}
                      onChange={e => setData(d => ({ ...d, displayName: e.target.value }))}
                      placeholder="How should CLRK address you?"
                      className="mt-1.5 bg-secondary/50 border-border/50"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-muted-foreground uppercase mb-3 block">Your Roles</label>
                    <div className="flex flex-wrap gap-2">
                      {ROLES.map(role => (
                        <button
                          key={role}
                          onClick={() => toggleRole(role)}
                          className={`px-3 py-1.5 rounded-md text-sm font-mono transition-all ${
                            data.roles.includes(role)
                              ? 'bg-primary text-primary-foreground shadow-[0_0_10px_-3px_hsl(var(--neon-glow)/0.5)]'
                              : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
                          }`}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-mono text-muted-foreground uppercase">Personality Type (optional)</label>
                    <Input
                      value={data.personalityType}
                      onChange={e => setData(d => ({ ...d, personalityType: e.target.value }))}
                      placeholder="e.g., INTJ, Type A, Enneagram 8"
                      className="mt-1.5 bg-secondary/50 border-border/50"
                    />
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-mono text-2xl mb-1">Life Domains</h2>
                    <p className="text-muted-foreground text-sm">Which areas should CLRK focus on?</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {DOMAINS.map(d => (
                      <button
                        key={d.value}
                        onClick={() => toggleDomain(d.value)}
                        className={`p-4 rounded-lg text-left transition-all flex items-center gap-3 ${
                          data.selectedDomains.includes(d.value)
                            ? 'neon-border bg-primary/5'
                            : 'bg-secondary/30 border border-border/30 hover:border-border'
                        }`}
                      >
                        <span className="text-2xl">{d.icon}</span>
                        <span className={`font-mono text-sm ${
                          data.selectedDomains.includes(d.value) ? 'text-primary' : 'text-foreground'
                        }`}>{d.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-mono text-2xl mb-1">Goals</h2>
                    <p className="text-muted-foreground text-sm">What are you working toward?</p>
                  </div>
                  {data.goals.map((goal, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <div className="flex-1">
                        <Input
                          value={goal.title}
                          onChange={e => {
                            const goals = [...data.goals];
                            goals[i].title = e.target.value;
                            setData(d => ({ ...d, goals }));
                          }}
                          placeholder="e.g., Launch my startup"
                          className="bg-secondary/50 border-border/50"
                        />
                      </div>
                      <select
                        value={goal.timeframe}
                        onChange={e => {
                          const goals = [...data.goals];
                          goals[i].timeframe = e.target.value;
                          setData(d => ({ ...d, goals }));
                        }}
                        className="bg-secondary/50 border border-border/50 rounded-md px-3 py-2 text-sm font-mono text-foreground"
                      >
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                        <option value="quarter">This Quarter</option>
                        <option value="year">This Year</option>
                        <option value="3year">3 Years</option>
                      </select>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setData(d => ({ ...d, goals: [...d.goals, { title: '', domain: 'work', timeframe: 'month' }] }))}
                    className="font-mono text-xs"
                  >
                    + Add Goal
                  </Button>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-mono text-2xl mb-1">Preferences</h2>
                    <p className="text-muted-foreground text-sm">How should CLRK interact with you?</p>
                  </div>
                  <div>
                    <label className="text-xs font-mono text-muted-foreground uppercase mb-2 block">Communication Style</label>
                    <div className="flex gap-2">
                      {['direct', 'balanced', 'supportive'].map(s => (
                        <button
                          key={s}
                          onClick={() => setData(d => ({ ...d, communicationStyle: s }))}
                          className={`flex-1 py-2 rounded-md text-sm font-mono capitalize transition-all ${
                            data.communicationStyle === s
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-mono text-muted-foreground uppercase mb-2 block">Risk Tolerance</label>
                    <div className="flex gap-2">
                      {['conservative', 'moderate', 'aggressive'].map(s => (
                        <button
                          key={s}
                          onClick={() => setData(d => ({ ...d, riskTolerance: s }))}
                          className={`flex-1 py-2 rounded-md text-sm font-mono capitalize transition-all ${
                            data.riskTolerance === s
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-mono text-muted-foreground uppercase mb-2 block">Autonomy Level</label>
                    <div className="flex gap-2">
                      {['advisory', 'assisted', 'autonomous'].map(s => (
                        <button
                          key={s}
                          onClick={() => setData(d => ({ ...d, automationComfort: s }))}
                          className={`flex-1 py-2 rounded-md text-sm font-mono capitalize transition-all ${
                            data.automationComfort === s
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-mono text-2xl mb-1">Current State</h2>
                    <p className="text-muted-foreground text-sm">Where are you right now?</p>
                  </div>
                  <div>
                    <label className="text-xs font-mono text-muted-foreground uppercase">Top Priorities</label>
                    <Textarea
                      value={data.priorities}
                      onChange={e => setData(d => ({ ...d, priorities: e.target.value }))}
                      placeholder="One per line — what matters most right now?"
                      className="mt-1.5 bg-secondary/50 border-border/50"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-muted-foreground uppercase">Current Challenges</label>
                    <Textarea
                      value={data.challenges}
                      onChange={e => setData(d => ({ ...d, challenges: e.target.value }))}
                      placeholder="One per line — what's creating friction?"
                      className="mt-1.5 bg-secondary/50 border-border/50"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-mono text-muted-foreground uppercase">Biggest Time Drains</label>
                    <Textarea
                      value={data.timeDrains}
                      onChange={e => setData(d => ({ ...d, timeDrains: e.target.value }))}
                      placeholder="One per line — where do you lose time?"
                      className="mt-1.5 bg-secondary/50 border-border/50"
                      rows={3}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex justify-between mt-6">
            <Button
              variant="ghost"
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
              className="font-mono text-xs"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            {step < steps.length - 1 ? (
              <Button
                onClick={() => setStep(s => s + 1)}
                className="font-mono text-xs bg-primary text-primary-foreground"
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleFinish}
                disabled={saving}
                className="font-mono text-xs bg-primary text-primary-foreground shadow-[0_0_20px_-5px_hsl(var(--neon-glow)/0.5)]"
              >
                {saving ? 'Initializing...' : 'Activate CLRK'} <Zap className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
