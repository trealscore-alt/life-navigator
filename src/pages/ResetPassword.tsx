import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get('type') === 'recovery') {
      setIsRecovery(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match.', variant: 'destructive' });
      return;
    }
    if (password.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Password updated', description: 'You can now sign in with your new password.' });
      navigate('/auth');
    }
    setSubmitting(false);
  };

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-mono font-bold neon-text">CLRK</h1>
          <p className="text-muted-foreground mt-4 font-mono text-sm">VALIDATING RECOVERY TOKEN...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="absolute inset-0 scanline-overlay opacity-20" />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, hsl(185 100% 50% / 0.15), transparent 70%)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 w-full max-w-md px-6"
      >
        <div className="text-center mb-10">
          <h1 className="text-6xl font-mono font-bold neon-text tracking-wider">CLRK</h1>
          <div className="h-[2px] w-24 mx-auto mt-3 bg-gradient-to-r from-transparent via-primary to-transparent" />
          <p className="text-muted-foreground mt-4 text-sm tracking-widest uppercase">
            Set New Password
          </p>
        </div>

        <div className="glass-card neon-border rounded-xl p-8">
          <form onSubmit={handleReset} className="space-y-5">
            <div>
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">New Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 bg-secondary/50 border-border/50 focus:border-primary"
                required
                minLength={6}
              />
            </div>
            <div>
              <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Confirm Password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 bg-secondary/50 border-border/50 focus:border-primary"
                required
                minLength={6}
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full font-mono uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_-5px_hsl(var(--neon-glow)/0.5)]"
            >
              {submitting ? 'Processing...' : 'Reset Password'}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
