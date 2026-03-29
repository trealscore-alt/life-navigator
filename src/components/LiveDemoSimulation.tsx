import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  Glasses, Play, Users, Globe, Loader2, Eye, TrendingUp,
  AlertTriangle, Lightbulb, Target, Zap,
} from 'lucide-react';

interface SimEntry {
  id: string;
  type: 'visual' | 'audio' | 'clrk-analysis' | 'clrk-action' | 'clrk-alert';
  source: string;
  text: string;
  timestamp: Date;
  icon?: 'eye' | 'trend' | 'alert' | 'idea' | 'target' | 'zap';
}

type Scenario = 'meeting' | 'newsfeed';

const MEETING_SCRIPT: Omit<SimEntry, 'id' | 'timestamp'>[] = [
  { type: 'visual', source: 'GLASSES VISUAL', text: 'Conference room detected. 6 participants seated. Whiteboard reads: "PMF Sprint — Q3 Targets". CEO at head of table.' },
  { type: 'audio', source: 'GLASSES AUDIO', text: '"Our churn is at 8.2% this quarter. We need to decide if we double down on enterprise or pivot to SMB." — CEO speaking.' },
  { type: 'clrk-analysis', source: 'CLRK ANALYSIS', text: '8.2% churn is 2.4x above SaaS median. Buffett framework: this signals a "leaky bucket" — acquiring customers into a broken retention model destroys capital. Fix retention BEFORE growth spend.', icon: 'trend' },
  { type: 'visual', source: 'GLASSES VISUAL', text: 'VP of Sales pulling up slide: "Enterprise pipeline: $2.1M. SMB pipeline: $480K. Enterprise close rate: 12%. SMB close rate: 34%."' },
  { type: 'clrk-analysis', source: 'CLRK ANALYSIS', text: 'Critical insight: Enterprise pipeline is 4.4x larger BUT SMB converts 2.8x better. Expected value — Enterprise: $252K, SMB: $163K. However, SMB has faster feedback loops for PMF iteration. Jobs would say: ship faster, learn faster. Recommend SMB-first for PMF signal, enterprise for revenue.', icon: 'idea' },
  { type: 'audio', source: 'GLASSES AUDIO', text: '"What if we raise prices 20% and see who stays?" — VP Product.' },
  { type: 'clrk-alert', source: 'CLRK ALERT', text: 'Price increase without value-add is dangerous. Dimon principle: you can raise prices only when switching costs are high. Your NPS is unknown to me — I need that data. But if churn is 8.2%, customers are already price-sensitive. Counter-proposal: add a premium tier with exclusive features, keep base price. Captures willingness-to-pay data without risking the base.', icon: 'alert' },
  { type: 'visual', source: 'GLASSES VISUAL', text: 'CTO typing on laptop — screen shows GitHub: 14 open PRs, 3 marked "critical bug". Body language: leaning back, arms crossed.' },
  { type: 'clrk-analysis', source: 'CLRK ANALYSIS', text: 'CTO body language signals disengagement or disagreement. 14 open PRs with 3 critical bugs suggests engineering bandwidth is stretched. Musk principle: if the product has critical bugs, PMF discussions are premature — fix the product first. Recommend addressing CTO concerns before strategy decisions.', icon: 'target' },
  { type: 'audio', source: 'GLASSES AUDIO', text: '"We have runway for 11 months. If we don\'t hit PMF by month 8, we need to start fundraising." — CFO.' },
  { type: 'clrk-action', source: 'CLRK DECISION BRIEF', text: 'STRATEGIC RECOMMENDATION:\n\n1. IMMEDIATE (Week 1-2): Fix 3 critical bugs. Zero new features until resolved.\n2. SHORT-TERM (Month 1-3): Run SMB cohort experiment — 50 customers, premium tier test. Measure: retention delta, NPS, willingness-to-pay.\n3. MEDIUM-TERM (Month 3-6): If SMB retention improves >40%, double down. If not, pivot enterprise with dedicated success team.\n4. FUNDRAISE TRIGGER: Begin at month 6 regardless — 5 months runway buffer, not 3.\n\nThis is a Rockefeller play: control the downside, let the upside take care of itself.', icon: 'zap' },
];

const NEWSFEED_SCRIPT: Omit<SimEntry, 'id' | 'timestamp'>[] = [
  { type: 'visual', source: 'GLASSES VISUAL', text: 'Breaking news on screen: "Federal Reserve holds rates at 5.25%. Chair signals potential cut in Q4." — Bloomberg Terminal.' },
  { type: 'clrk-analysis', source: 'CLRK ANALYSIS', text: 'Rate hold confirmed. Buffett-Dalio framework: rate cuts create a 6-12 month tailwind for equities, especially growth tech and real estate. If you have capital to deploy, the window opens in 60-90 days before markets fully price in the cut.', icon: 'trend' },
  { type: 'visual', source: 'GLASSES VISUAL', text: 'Second headline: "NVIDIA reports 122% revenue growth. AI infrastructure spend accelerating." Market reaction: NVDA +7.2% after hours.' },
  { type: 'clrk-analysis', source: 'CLRK ANALYSIS', text: 'NVIDIA\'s growth confirms the AI infrastructure thesis. But Munger principle: "The time to buy is when there\'s blood in the streets, not confetti." At 40x forward P/E after a 7% pop, the risk-reward is asymmetric to the downside. Look at NVDA\'s suppliers and pick-and-shovel plays trading at lower multiples instead.', icon: 'idea' },
  { type: 'visual', source: 'GLASSES VISUAL', text: 'Scrolling past: "Global shipping disruptions — Red Sea routes +340% insurance costs. Supply chain experts warn of Q1 delays."' },
  { type: 'clrk-alert', source: 'CLRK ALERT', text: 'Supply chain disruption is a second-order opportunity. Ford-Rockefeller playbook: when competitors face supply issues, the prepared win. ACTION ITEMS: 1) If you run a product business, pre-order 90-day inventory NOW. 2) Consider shipping/logistics ETFs — they benefit from higher rates. 3) Avoid consumer goods companies with thin margins and Asia-dependent supply chains.', icon: 'alert' },
  { type: 'visual', source: 'GLASSES VISUAL', text: 'CNN alert: "Unemployment ticks up to 4.1%. Tech layoffs continue — 12,000 jobs cut this week across 8 companies."' },
  { type: 'clrk-analysis', source: 'CLRK ANALYSIS', text: 'Rising unemployment + rate hold = classic late-cycle signal. Einstein-level pattern recognition: every recession in the last 50 years was preceded by unemployment rising while rates stayed high. This doesn\'t mean recession is guaranteed, but Dimon\'s risk management says: increase cash reserves to 6 months expenses, reduce discretionary spend, and identify counter-cyclical income streams.', icon: 'target' },
  { type: 'visual', source: 'GLASSES VISUAL', text: 'Final headline: "Y Combinator announces largest batch ever. AI startups comprise 67% of applications."' },
  { type: 'clrk-action', source: 'CLRK STRATEGIC BRIEF', text: 'MACRO INTELLIGENCE SYNTHESIS:\n\nThe signals paint a clear picture — we\'re in a "calm before the shift" moment.\n\n1. CAPITAL: Move 15-20% of liquid assets to high-yield savings (5%+ APY) while rates hold. Dry powder for the rate cut window.\n2. CAREER: Tech layoffs create a buyer\'s market for talent. If you\'re hiring, now is the time. If you\'re job-seeking, target AI infrastructure companies — that\'s where the spend is going.\n3. BUSINESS: Supply chain disruption = competitive moat opportunity. Pre-position inventory and diversify suppliers away from affected routes.\n4. INVESTMENT: Avoid momentum plays (NVDA at ATH). Target: rate-sensitive sectors (REITs, small-cap growth) positioned for the Q4 cut.\n\nAltman\'s framework: "The biggest opportunities come from the intersection of macro trends." Right now that intersection is AI + rate cuts + talent availability.', icon: 'zap' },
];

interface LiveDemoSimulationProps {
  onClose: () => void;
}

const LiveDemoSimulation = ({ onClose }: LiveDemoSimulationProps) => {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [entries, setEntries] = useState<SimEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const script = scenario === 'meeting' ? MEETING_SCRIPT : NEWSFEED_SCRIPT;

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const playNext = useCallback(() => {
    if (currentIndex >= script.length) {
      setIsRunning(false);
      return;
    }
    const entry = script[currentIndex];
    const newEntry: SimEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    setEntries(prev => [...prev, newEntry]);
    setCurrentIndex(prev => prev + 1);

    const delay = entry.type === 'clrk-action' ? 4000 : entry.type.startsWith('clrk') ? 3000 : 2000;
    timerRef.current = setTimeout(() => playNext(), delay);
  }, [currentIndex, script]);

  const startDemo = (s: Scenario) => {
    setScenario(s);
    setEntries([]);
    setCurrentIndex(0);
    setIsRunning(true);
  };

  useEffect(() => {
    if (isRunning && currentIndex === 0 && scenario) {
      timerRef.current = setTimeout(() => playNext(), 1000);
    }
  }, [isRunning, currentIndex, scenario]);

  // Continue playing after state updates
  useEffect(() => {
    if (isRunning && currentIndex > 0 && currentIndex < script.length) {
      // playNext already schedules the next one
    }
  }, [currentIndex]);

  const getIcon = (icon?: string) => {
    switch (icon) {
      case 'eye': return <Eye className="w-3.5 h-3.5" />;
      case 'trend': return <TrendingUp className="w-3.5 h-3.5" />;
      case 'alert': return <AlertTriangle className="w-3.5 h-3.5" />;
      case 'idea': return <Lightbulb className="w-3.5 h-3.5" />;
      case 'target': return <Target className="w-3.5 h-3.5" />;
      case 'zap': return <Zap className="w-3.5 h-3.5" />;
      default: return <Glasses className="w-3.5 h-3.5" />;
    }
  };

  const getEntryStyle = (type: string) => {
    switch (type) {
      case 'visual': return 'bg-muted/20 border-muted-foreground/20 text-muted-foreground';
      case 'audio': return 'bg-muted/20 border-muted-foreground/20 text-muted-foreground';
      case 'clrk-analysis': return 'bg-primary/10 border-primary/30 text-foreground';
      case 'clrk-alert': return 'bg-destructive/10 border-destructive/30 text-foreground';
      case 'clrk-action': return 'bg-primary/20 border-primary/50 text-foreground';
      default: return 'bg-muted/20 border-border/30 text-foreground';
    }
  };

  const getSourceColor = (type: string) => {
    switch (type) {
      case 'visual': return 'text-muted-foreground';
      case 'audio': return 'text-muted-foreground';
      case 'clrk-analysis': return 'text-primary';
      case 'clrk-alert': return 'text-destructive';
      case 'clrk-action': return 'text-primary';
      default: return 'text-muted-foreground';
    }
  };

  if (!scenario) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
        <div className="text-center space-y-2">
          <Glasses className="w-12 h-12 text-primary mx-auto" />
          <h2 className="text-xl font-mono neon-text">CLRK LIVE DEMO</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Watch CLRK process real-time visual and audio input through smart glasses — analyzing, reasoning, and making strategic decisions.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg w-full">
          <Button
            onClick={() => startDemo('meeting')}
            variant="outline"
            className="h-auto p-6 flex flex-col items-center gap-3 border-primary/30 hover:bg-primary/10 hover:border-primary/60 transition-all"
          >
            <Users className="w-8 h-8 text-primary" />
            <span className="font-mono text-sm">PMF MEETING</span>
            <span className="text-xs text-muted-foreground text-center">
              High-stakes boardroom. CLRK monitors body language, reads slides, analyzes arguments in real-time.
            </span>
          </Button>
          <Button
            onClick={() => startDemo('newsfeed')}
            variant="outline"
            className="h-auto p-6 flex flex-col items-center gap-3 border-primary/30 hover:bg-primary/10 hover:border-primary/60 transition-all"
          >
            <Globe className="w-8 h-8 text-primary" />
            <span className="font-mono text-sm">GLOBAL NEWS</span>
            <span className="text-xs text-muted-foreground text-center">
              Scanning live news feeds. CLRK synthesizes macro signals into strategic action plans.
            </span>
          </Button>
        </div>
        <Button variant="ghost" onClick={onClose} className="text-muted-foreground text-xs">
          Back to Live Mode
        </Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Demo header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 bg-primary/5">
        <div className="flex items-center gap-2">
          {scenario === 'meeting' ? <Users className="w-4 h-4 text-primary" /> : <Globe className="w-4 h-4 text-primary" />}
          <span className="text-xs font-mono text-primary uppercase">
            {scenario === 'meeting' ? 'PMF Strategy Meeting — Live Monitoring' : 'Global News Feed — Strategic Analysis'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isRunning && (
            <div className="flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              <span className="text-[10px] font-mono text-primary">PROCESSING</span>
            </div>
          )}
          {!isRunning && entries.length > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground">SIMULATION COMPLETE</span>
          )}
          <Button variant="ghost" size="sm" onClick={() => { setScenario(null); setEntries([]); setCurrentIndex(0); if (timerRef.current) clearTimeout(timerRef.current); }} className="text-xs h-7">
            ← Scenarios
          </Button>
        </div>
      </div>

      {/* Simulated visual feed */}
      <div className="relative bg-black/80 border-b border-border/20 px-4 py-3 min-h-[60px]">
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] font-mono text-red-400">REC</span>
        </div>
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          <Eye className="w-3 h-3 text-primary/60" />
          <span className="text-[9px] font-mono text-primary/60">GLASSES FEED</span>
        </div>
        {/* Latest visual entry */}
        {entries.filter(e => e.type === 'visual').slice(-1).map(e => (
          <p key={e.id} className="text-xs text-muted-foreground/80 font-mono pt-3 italic">
            👓 {e.text}
          </p>
        ))}
        {entries.filter(e => e.type === 'visual').length === 0 && (
          <p className="text-xs text-muted-foreground/40 font-mono pt-3 italic">Awaiting visual input...</p>
        )}
        {/* Corner brackets */}
        <div className="absolute top-0 left-0 w-6 h-6 border-l border-t border-primary/30" />
        <div className="absolute top-0 right-0 w-6 h-6 border-r border-t border-primary/30" />
        <div className="absolute bottom-0 left-0 w-6 h-6 border-l border-b border-primary/30" />
        <div className="absolute bottom-0 right-0 w-6 h-6 border-r border-b border-primary/30" />
        {isRunning && (
          <motion.div
            className="absolute left-0 right-0 h-px bg-primary/40"
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          />
        )}
      </div>

      {/* Transcript feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <AnimatePresence>
          {entries.map((entry) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: entry.type.startsWith('clrk') ? -20 : 20, y: 10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className={`px-4 py-3 rounded-xl border text-sm ${getEntryStyle(entry.type)}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={getSourceColor(entry.type)}>
                    {getIcon(entry.icon)}
                  </span>
                  <span className={`text-[10px] font-mono uppercase font-semibold ${getSourceColor(entry.type)}`}>
                    {entry.source}
                  </span>
                  <span className="text-[10px] text-muted-foreground/40">
                    {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <p className="whitespace-pre-line leading-relaxed">{entry.text}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isRunning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-4 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            <span className="text-xs font-mono text-primary/60">CLRK processing input stream...</span>
          </motion.div>
        )}

        <div ref={scrollRef} />
      </div>
    </div>
  );
};

export default LiveDemoSimulation;
