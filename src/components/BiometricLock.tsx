import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Fingerprint, ScanEye } from 'lucide-react';

function playUnlockSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;

    // Rising confirmation tone
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(600, now);
    osc1.frequency.linearRampToValueAtTime(900, now + 0.12);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1).connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Second higher blip
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1100, now + 0.15);
    gain2.gain.setValueAtTime(0.12, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2).connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.45);

    setTimeout(() => ctx.close(), 600);
  } catch {}
}

function triggerHaptic() {
  try {
    if (navigator.vibrate) navigator.vibrate([30, 50, 60]);
  } catch {}
}

interface BiometricLockProps {
  onUnlock: () => void;
  userName?: string;
}

const BiometricLock = ({ onUnlock, userName }: BiometricLockProps) => {
  const [scanning, setScanning] = useState(false);
  const [scanType, setScanType] = useState<'fingerprint' | 'retina'>('fingerprint');
  const [scanProgress, setScanProgress] = useState(0);
  const [unlocked, setUnlocked] = useState(false);

  const startScan = (type: 'fingerprint' | 'retina') => {
    if (scanning) return;
    setScanType(type);
    setScanning(true);
    setScanProgress(0);
  };

  useEffect(() => {
    if (!scanning) return;
    const duration = 2000;
    const interval = 30;
    const steps = duration / interval;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      setScanProgress((step / steps) * 100);
      if (step >= steps) {
        clearInterval(timer);
        playUnlockSound();
        triggerHaptic();
        setUnlocked(true);
        setTimeout(onUnlock, 600);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [scanning, onUnlock]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-[#020510]">
      {/* Shooting stars canvas */}
      <ShootingStars />
      <div className="absolute inset-0 grid-bg opacity-10" />
      <div className="absolute inset-0 scanline-overlay opacity-10" />

      {/* Radial scan glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full transition-opacity duration-1000"
        style={{
          background: scanning
            ? `radial-gradient(circle, hsl(185 100% 50% / ${0.1 + scanProgress * 0.002}), transparent 70%)`
            : 'radial-gradient(circle, hsl(185 100% 50% / 0.05), transparent 70%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative z-10 flex flex-col items-center"
      >
        {/* Status */}
        <div className="flex items-center gap-2 mb-8">
          <div className={`w-2 h-2 rounded-full ${unlocked ? 'bg-green-400' : scanning ? 'bg-yellow-400 animate-pulse' : 'bg-primary animate-pulse-glow'}`} />
          <span className="font-mono text-xs text-muted-foreground uppercase tracking-[0.3em]">
            {unlocked ? 'ACCESS GRANTED' : scanning ? 'SCANNING...' : 'BIOMETRIC VERIFICATION REQUIRED'}
          </span>
        </div>

        {/* CLRK Logo */}
        <h1 className="text-5xl font-mono font-bold neon-text tracking-wider mb-2">CLRK</h1>
        {userName && (
          <p className="text-muted-foreground text-sm font-mono mb-12">
            Welcome back, <span className="text-foreground">{userName}</span>
          </p>
        )}

        {/* Scan options */}
        <div className="flex gap-8 mb-8">
          {/* Fingerprint */}
          <button
            onClick={() => startScan('fingerprint')}
            disabled={scanning}
            className="group flex flex-col items-center gap-3 focus:outline-none"
          >
            <div className={`relative w-28 h-28 rounded-2xl flex items-center justify-center transition-all duration-500 ${
              scanning && scanType === 'fingerprint'
                ? 'neon-border bg-primary/10'
                : unlocked
                  ? 'border border-green-400/50 bg-green-400/5'
                  : 'border border-border/50 bg-card/40 hover:border-primary/50 hover:bg-primary/5 cursor-pointer'
            }`}>
              {/* Scan ring animation */}
              {scanning && scanType === 'fingerprint' && (
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 112 112">
                  <circle
                    cx="56" cy="56" r="50"
                    fill="none"
                    stroke="hsl(185 100% 50%)"
                    strokeWidth="2"
                    strokeDasharray={`${scanProgress * 3.14} ${314 - scanProgress * 3.14}`}
                    strokeLinecap="round"
                    transform="rotate(-90 56 56)"
                    className="drop-shadow-[0_0_6px_hsl(185_100%_50%/0.6)]"
                  />
                </svg>
              )}
              <Fingerprint className={`w-12 h-12 transition-all duration-500 ${
                scanning && scanType === 'fingerprint'
                  ? 'text-primary scale-110'
                  : unlocked
                    ? 'text-green-400'
                    : 'text-muted-foreground group-hover:text-primary'
              }`} />
              {/* Scan line */}
              {scanning && scanType === 'fingerprint' && (
                <motion.div
                  className="absolute left-3 right-3 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent"
                  style={{ boxShadow: '0 0 10px hsl(185 100% 50% / 0.8)' }}
                  animate={{ top: ['20%', '80%', '20%'] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </div>
            <span className={`font-mono text-[10px] uppercase tracking-wider transition-colors ${
              scanning && scanType === 'fingerprint' ? 'text-primary' : 'text-muted-foreground'
            }`}>Fingerprint</span>
          </button>

          {/* Retina */}
          <button
            onClick={() => startScan('retina')}
            disabled={scanning}
            className="group flex flex-col items-center gap-3 focus:outline-none"
          >
            <div className={`relative w-28 h-28 rounded-2xl flex items-center justify-center transition-all duration-500 ${
              scanning && scanType === 'retina'
                ? 'neon-border bg-primary/10'
                : unlocked
                  ? 'border border-green-400/50 bg-green-400/5'
                  : 'border border-border/50 bg-card/40 hover:border-primary/50 hover:bg-primary/5 cursor-pointer'
            }`}>
              {scanning && scanType === 'retina' && (
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 112 112">
                  <circle
                    cx="56" cy="56" r="50"
                    fill="none"
                    stroke="hsl(185 100% 50%)"
                    strokeWidth="2"
                    strokeDasharray={`${scanProgress * 3.14} ${314 - scanProgress * 3.14}`}
                    strokeLinecap="round"
                    transform="rotate(-90 56 56)"
                    className="drop-shadow-[0_0_6px_hsl(185_100%_50%/0.6)]"
                  />
                </svg>
              )}

              {/* Retina concentric rings */}
              <div className="relative w-12 h-12 flex items-center justify-center">
                <ScanEye className={`w-12 h-12 transition-all duration-500 ${
                  scanning && scanType === 'retina'
                    ? 'text-primary scale-110'
                    : unlocked
                      ? 'text-green-400'
                      : 'text-muted-foreground group-hover:text-primary'
                }`} />
                {scanning && scanType === 'retina' && (
                  <>
                    <motion.div
                      className="absolute inset-0 rounded-full border border-primary/40"
                      animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                    <motion.div
                      className="absolute inset-0 rounded-full border border-primary/30"
                      animate={{ scale: [1, 2.2], opacity: [0.4, 0] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
                    />
                  </>
                )}
              </div>

              {/* Scan line */}
              {scanning && scanType === 'retina' && (
                <motion.div
                  className="absolute left-3 right-3 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent"
                  style={{ boxShadow: '0 0 10px hsl(185 100% 50% / 0.8)' }}
                  animate={{ top: ['20%', '80%', '20%'] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </div>
            <span className={`font-mono text-[10px] uppercase tracking-wider transition-colors ${
              scanning && scanType === 'retina' ? 'text-primary' : 'text-muted-foreground'
            }`}>Retina Scan</span>
          </button>
        </div>

        {/* Progress text */}
        <AnimatePresence mode="wait">
          {scanning && !unlocked && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <p className="font-mono text-xs text-primary">
                {scanType === 'fingerprint' ? 'ANALYZING FINGERPRINT' : 'SCANNING RETINA PATTERN'}...
                {Math.round(scanProgress)}%
              </p>
            </motion.div>
          )}
          {unlocked && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <p className="font-mono text-sm text-green-400">
                ✓ IDENTITY VERIFIED
              </p>
            </motion.div>
          )}
          {!scanning && !unlocked && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-mono text-xs text-muted-foreground"
            >
              Select a verification method to proceed
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default BiometricLock;
