import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Save } from 'lucide-react';

const SettingsPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    display_name: '',
    roles: [] as string[],
    personality_type: '',
    communication_style: 'direct',
    risk_tolerance: 'moderate',
    automation_comfort: 'advisory',
    current_challenges: [] as string[],
    time_drains: [] as string[],
    top_priorities: [] as string[],
  });

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('*').eq('user_id', user.id).single().then(({ data }) => {
      if (data) setProfile({
        display_name: data.display_name || '',
        roles: data.roles || [],
        personality_type: data.personality_type || '',
        communication_style: data.communication_style || 'direct',
        risk_tolerance: data.risk_tolerance || 'moderate',
        automation_comfort: data.automation_comfort || 'advisory',
        current_challenges: data.current_challenges || [],
        time_drains: data.time_drains || [],
        top_priorities: data.top_priorities || [],
      });
    });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update(profile).eq('user_id', user.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: 'Profile updated successfully.' });
    }
    setSaving(false);
  };

  const OptionGroup = ({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) => (
    <div>
      <label className="text-xs font-mono text-muted-foreground uppercase mb-2 block">{label}</label>
      <div className="flex gap-2 flex-wrap">
        {options.map(o => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`flex-1 min-w-[80px] py-2 rounded-md text-xs sm:text-sm font-mono capitalize transition-all ${
              value === o ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 grid-bg opacity-10" />

      <header className="relative z-10 border-b border-border/50 bg-card/40 backdrop-blur-xl px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-4">
        <Link to="/dashboard">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <h1 className="font-mono text-lg neon-text">Settings</h1>
      </header>

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card neon-border rounded-xl p-4 sm:p-8 space-y-5 sm:space-y-6">
          <h2 className="font-mono text-xl">User Strategic Profile</h2>

          <div>
            <label className="text-xs font-mono text-muted-foreground uppercase">Display Name</label>
            <Input
              value={profile.display_name}
              onChange={e => setProfile(p => ({ ...p, display_name: e.target.value }))}
              className="mt-1.5 bg-secondary/50 border-border/50"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-muted-foreground uppercase">Personality Type</label>
            <Input
              value={profile.personality_type}
              onChange={e => setProfile(p => ({ ...p, personality_type: e.target.value }))}
              className="mt-1.5 bg-secondary/50 border-border/50"
              placeholder="e.g., INTJ"
            />
          </div>

          <OptionGroup
            label="Communication Style"
            value={profile.communication_style}
            options={['direct', 'balanced', 'supportive']}
            onChange={v => setProfile(p => ({ ...p, communication_style: v }))}
          />

          <OptionGroup
            label="Risk Tolerance"
            value={profile.risk_tolerance}
            options={['conservative', 'moderate', 'aggressive']}
            onChange={v => setProfile(p => ({ ...p, risk_tolerance: v }))}
          />

          <OptionGroup
            label="Autonomy Level"
            value={profile.automation_comfort}
            options={['advisory', 'assisted', 'autonomous']}
            onChange={v => setProfile(p => ({ ...p, automation_comfort: v }))}
          />

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full font-mono text-xs bg-primary text-primary-foreground shadow-[0_0_20px_-5px_hsl(var(--neon-glow)/0.5)]"
          >
            <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </motion.div>
      </main>
    </div>
  );
};

export default SettingsPage;
