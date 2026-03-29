import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Brain, Eye, Shield, Radio, Bluetooth, MessageSquare,
  Cpu, Wifi, Database, Globe,
} from 'lucide-react';

interface Subsystem {
  name: string;
  icon: any;
  status: 'online' | 'standby' | 'scanning' | 'processing';
  detail: string;
  load?: number;
}

const STATUS_DOT: Record<string, string> = {
  online: 'bg-green-400',
  standby: 'bg-yellow-400/60',
  scanning: 'bg-primary animate-pulse',
  processing: 'bg-accent animate-pulse',
};

const STATUS_LABEL: Record<string, string> = {
  online: 'Online',
  standby: 'Standby',
  scanning: 'Scanning',
  processing: 'Processing',
};

export default function ClrkSystemStatus() {
  const [subsystems, setSubsystems] = useState<Subsystem[]>([
    { name: 'Cognitive Core', icon: Brain, status: 'online', detail: 'Reasoning engine active', load: 12 },
    { name: 'Vision System', icon: Eye, status: 'standby', detail: 'Ready for Live Mode' },
    { name: 'Agent Firewall', icon: Shield, status: 'online', detail: '0 threats blocked today', load: 3 },
    { name: 'Agent Network', icon: Radio, status: 'online', detail: 'A2A protocol ready' },
    { name: 'Device Hub', icon: Bluetooth, status: 'standby', detail: 'BLE scanner idle' },
    { name: 'Chat Engine', icon: MessageSquare, status: 'online', detail: 'Stream ready', load: 5 },
    { name: 'Data Pipeline', icon: Database, status: 'online', detail: 'Sync nominal', load: 8 },
    { name: 'Cognitive Council', icon: Globe, status: 'online', detail: '12 minds loaded', load: 2 },
  ]);

  // Simulate subsystem activity — status changes
  useEffect(() => {
    const interval = setInterval(() => {
      setSubsystems(prev => {
        const idx = Math.floor(Math.random() * prev.length);
        const states: Subsystem['status'][] = ['online', 'scanning', 'processing', 'online'];
        const next = [...prev];
        const current = next[idx];
        const newStatus = states[Math.floor(Math.random() * states.length)];
        next[idx] = {
          ...current,
          status: newStatus,
          load: current.load !== undefined ? Math.max(1, Math.min(95, (current.load || 10) + (Math.random() * 20 - 10))) : undefined,
        };
        return next;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = subsystems.filter(s => s.status === 'online' || s.status === 'scanning' || s.status === 'processing').length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-mono text-muted-foreground">
            {onlineCount}/{subsystems.length} SUBSYSTEMS ACTIVE
          </span>
        </div>
        <span className="text-[10px] font-mono text-green-400">SYSTEM HEALTHY</span>
      </div>
      {subsystems.map((sys, i) => (
        <motion.div
          key={sys.name}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-secondary/20 transition-colors"
        >
          <sys.icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-[11px] font-mono flex-1 truncate">{sys.name}</span>
          <span className="text-[9px] text-muted-foreground/60 truncate max-w-[100px]">{sys.detail}</span>
          {sys.load !== undefined && (
            <div className="w-12 h-1 bg-secondary/50 rounded-full overflow-hidden flex-shrink-0">
              <motion.div
                className="h-full bg-primary/60 rounded-full"
                animate={{ width: `${sys.load}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
          )}
          <div className={`w-2 h-2 rounded-full ${STATUS_DOT[sys.status]} flex-shrink-0`} />
        </motion.div>
      ))}
    </div>
  );
}
