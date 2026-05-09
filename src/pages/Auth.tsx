import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import BiometricLock from '@/components/BiometricLock';
import { ArrowLeft, Brain, Cpu, Shield, Sparkles } from 'lucide-react';

const Auth = () => {
  const { user, loading, signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [biometricUnlocked, setBiometricUnlocked] = useState(false);
  const [userName, setUserName] = useState<string>('');
  const { toast } = useToast();

  // Check if returning user with existing session
  useEffect(() => {
    if (user) {
      supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.display_name) setUserName(data.display_name);
        });
    }
  }, [user]);

  if (loading) return <LoadingScreen />;

  // Returning user: show biometric lock
  if (user && !biometricUnlocked) {
    return (
      <BiometricLock
        onUnlock={() => setBiometricUnlocked(true)}
        userName={userName}
      />
    );
  }

  // Unlocked: go to dashboard
  if (user && biometricUnlocked) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setSubmitting(true);

    const { error } = isSignUp
      ? await signUp(email.trim(), password)
      : await signIn(email.trim(), password);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else if (isSignUp) {
      toast({ title: 'Account created', description: 'Check your email to verify your account.' });
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen clrk-shell flex items-center justify-center relative overflow-hidden px-4 py-8">
      <div className="absolute inset-0 scanline-overlay opacity-10" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 grid w-full max-w-5xl grid-cols-1 gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center"
      >
        <div className="space-y-8">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1, type: 'spring' }}
            className="space-y-5"
          >
            <div className="agent-mark h-14 w-14 rounded-lg">
              <Brain className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-6xl sm:text-7xl font-mono font-bold neon-text tracking-wider">CLRK</h1>
              <div className="mt-4 h-px w-52 bg-gradient-to-r from-primary via-accent to-transparent" />
            </div>
          </motion.div>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.34em] text-primary/80">
              Cognitive Life Resource Kernel
            </p>
            <p className="mt-4 max-w-xl text-2xl font-semibold leading-tight text-balance text-foreground">
              A persistent command layer for your goals, devices, agents, and environment.
            </p>
          </div>
          <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { icon: Sparkles, label: 'Autonomy Core' },
              { icon: Cpu, label: 'Device Mesh' },
              { icon: Shield, label: 'Safety Gates' },
            ].map((item) => (
              <div key={item.label} className="command-surface rounded-lg p-3">
                <item.icon className="mb-3 h-4 w-4 text-primary" />
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
          <p className="status-pill w-fit">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_hsl(var(--accent))]" />
            System Online
          </p>
        </div>

        <div className="glass-card neon-border rounded-lg p-6 sm:p-8">
          {isForgotPassword ? (
            <ForgotPasswordForm
              forgotEmail={forgotEmail}
              setForgotEmail={setForgotEmail}
              onBack={() => setIsForgotPassword(false)}
              toast={toast}
            />
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Email</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="agent@clrk.io"
                    className="mt-1.5 bg-secondary/50 border-border/70 focus:border-primary"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Password</label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1.5 bg-secondary/50 border-border/70 focus:border-primary"
                    required
                    minLength={6}
                  />
                </div>
                {!isSignUp && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setIsForgotPassword(true)}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors font-mono"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full font-mono uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_28px_-12px_hsl(var(--neon-glow)/0.9)]"
                >
                  {submitting ? 'Processing...' : isSignUp ? 'Initialize Agent' : 'Access System'}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors font-mono"
                >
                  {isSignUp ? 'Already initialized? Sign in' : 'New agent? Create account'}
                </button>
              </div>
            </>
          )}
        </div>

      </motion.div>
    </div>
  );
};

type ToastFn = ReturnType<typeof useToast>['toast'];

const ForgotPasswordForm = ({
  forgotEmail,
  setForgotEmail,
  onBack,
  toast,
}: {
  forgotEmail: string;
  setForgotEmail: (v: string) => void;
  onBack: () => void;
  toast: ToastFn;
}) => {
  const [sending, setSending] = useState(false);

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setSending(true);

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Recovery link sent', description: 'Check your email for a password reset link.' });
    }
    setSending(false);
  };

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-3 h-3" /> Back to sign in
      </button>
      <p className="text-sm text-foreground/80 font-mono">
        Enter your email and we'll send a recovery link.
      </p>
      <form onSubmit={handleForgot} className="space-y-5">
        <div>
          <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Email</label>
          <Input
            type="email"
            value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)}
            placeholder="agent@clrk.io"
            className="mt-1.5 bg-secondary/50 border-border/50 focus:border-primary"
            required
          />
        </div>
        <Button
          type="submit"
          disabled={sending}
          className="w-full font-mono uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_-5px_hsl(var(--neon-glow)/0.5)]"
        >
          {sending ? 'Sending...' : 'Send Recovery Link'}
        </Button>
      </form>
    </div>
  );
};

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <h1 className="text-4xl font-mono font-bold neon-text animate-pulse-glow">CLRK</h1>
      <p className="text-muted-foreground mt-2 font-mono text-xs">INITIALIZING...</p>
    </div>
  </div>
);

export default Auth;
