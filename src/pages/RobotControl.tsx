import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Battery,
  Bot,
  Camera,
  Gauge,
  Mic,
  Play,
  Radio,
  ShieldAlert,
  Square,
  TerminalSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type RobotMode = 'idle' | 'observe' | 'assist' | 'dock';

const installCommands = [
  'cd robot-runtime',
  'npm install',
  'npm run build',
  'cp .env.example .env',
  'npm start',
];

const RobotControl = () => {
  const { toast } = useToast();
  const [mode, setMode] = useState<RobotMode>('observe');
  const [spokenText, setSpokenText] = useState('CLRK robot runtime is standing by.');
  const [lastAction, setLastAction] = useState('No robot runtime connected yet.');

  const capabilities = useMemo(() => [
    'robot_status',
    'robot_say',
    'robot_read_sensors',
    'robot_capture_image',
    'robot_stop',
    'robot_set_mode',
    'robot_move_base',
  ], []);

  const unavailableToast = (action: string) => {
    setLastAction(`${action} queued for robot-runtime. Install and connect the runtime on your robot to execute this on hardware.`);
    toast({
      title: 'Robot runtime not connected',
      description: 'Install robot-runtime on the robot, add your CLRK token, then start it to execute physical robot tools.',
    });
  };

  return (
    <div className="min-h-screen clrk-shell relative">
      <div className="absolute inset-0 scanline-overlay opacity-10" />

      <header className="relative z-10 control-bar">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div>
              <h1 className="flex items-center gap-2 font-mono text-lg">
                <span className="agent-mark h-9 w-9 rounded-lg"><Bot className="h-5 w-5 text-primary" /></span>
                <span className="neon-text">Robot Control</span>
              </h1>
              <p className="text-[10px] font-mono text-muted-foreground">Embodied CLRK runtime • safety kernel • hardware bridge</p>
            </div>
          </div>
          <Badge variant="outline" className="font-mono text-[10px] text-yellow-300">Bridge offline</Badge>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 sm:py-6">
        <section className="glass-card rounded-lg border-yellow-400/30 bg-yellow-400/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-yellow-300">Robot hardware is not connected to this browser session</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This screen exposes CLRK robot features and safety states. Physical motion, sensors, camera, and speech execute after `robot-runtime` is installed on the robot.
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Mode', value: mode, icon: Radio, tone: 'text-primary' },
            { label: 'Battery', value: '--', icon: Battery, tone: 'text-yellow-300' },
            { label: 'Sensors', value: 'standby', icon: Gauge, tone: 'text-cyan-300' },
            { label: 'Safety', value: 'armed', icon: ShieldAlert, tone: 'text-green-300' },
          ].map((stat) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card rounded-lg p-4 hover-lift">
              <div className="flex items-center justify-between">
                <stat.icon className={`h-4 w-4 ${stat.tone}`} />
                <span className="font-mono text-sm uppercase">{stat.value}</span>
              </div>
              <p className="mt-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-7">
            <div className="glass-card rounded-lg p-5">
              <h2 className="mb-4 flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-primary">
                <Bot className="h-4 w-4" /> Robot Actions
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Button variant="outline" className="h-14 font-mono text-xs" onClick={() => unavailableToast('Status check')}>
                  <Gauge className="mr-2 h-4 w-4" /> Status
                </Button>
                <Button variant="outline" className="h-14 font-mono text-xs" onClick={() => unavailableToast('Sensor read')}>
                  <Radio className="mr-2 h-4 w-4" /> Sensors
                </Button>
                <Button variant="outline" className="h-14 font-mono text-xs" onClick={() => unavailableToast('Camera capture')}>
                  <Camera className="mr-2 h-4 w-4" /> Camera
                </Button>
                <Button variant="outline" className="h-14 font-mono text-xs" onClick={() => unavailableToast('Speech')}>
                  <Mic className="mr-2 h-4 w-4" /> Speak
                </Button>
                <Button variant="outline" className="h-14 font-mono text-xs" onClick={() => unavailableToast('Set mode')}>
                  <Play className="mr-2 h-4 w-4" /> Assist
                </Button>
                <Button variant="destructive" className="h-14 font-mono text-xs" onClick={() => unavailableToast('Emergency stop')}>
                  <Square className="mr-2 h-4 w-4" /> Stop
                </Button>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(['idle', 'observe', 'assist', 'dock'] as RobotMode[]).map((nextMode) => (
                  <Button
                    key={nextMode}
                    variant={mode === nextMode ? 'default' : 'outline'}
                    size="sm"
                    className="font-mono text-[10px] uppercase"
                    onClick={() => {
                      setMode(nextMode);
                      unavailableToast(`Mode ${nextMode}`);
                    }}
                  >
                    {nextMode}
                  </Button>
                ))}
              </div>
            </div>

            <div className="glass-card rounded-lg p-5">
              <h2 className="mb-4 flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-primary">
                <Mic className="h-4 w-4" /> Robot Speech
              </h2>
              <Textarea
                value={spokenText}
                onChange={(e) => setSpokenText(e.target.value)}
                rows={3}
                className="bg-secondary/50"
              />
              <div className="mt-3 flex justify-end">
                <Button size="sm" className="font-mono text-xs" onClick={() => unavailableToast(`Say: ${spokenText.slice(0, 40)}`)}>
                  Send To Robot
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-6 lg:col-span-5">
            <div className="glass-card rounded-lg p-5">
              <h2 className="mb-4 flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-primary">
                <TerminalSquare className="h-4 w-4" /> Install Runtime
              </h2>
              <div className="command-surface rounded-lg p-3">
                {installCommands.map((cmd) => (
                  <p key={cmd} className="font-mono text-[11px] text-foreground/85">{cmd}</p>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Add `CLRK_SUPABASE_URL`, `CLRK_ACCESS_TOKEN`, and `CLRK_ROBOT_ID` in `robot-runtime/.env`, then start the runtime on the robot computer.
              </p>
            </div>

            <div className="glass-card rounded-lg p-5">
              <h2 className="mb-4 font-mono text-sm uppercase tracking-wider text-primary">Capabilities</h2>
              <div className="flex flex-wrap gap-2">
                {capabilities.map((capability) => (
                  <Badge key={capability} variant="secondary" className="font-mono text-[9px]">{capability}</Badge>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">{lastAction}</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default RobotControl;
