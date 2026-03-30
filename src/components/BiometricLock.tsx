import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Fingerprint, ScanEye } from 'lucide-react';

const ShootingStars = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    interface Star { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; hue: number; }
    const stars: Star[] = [];
    const bgStars: { x: number; y: number; r: number; a: number; twinkle: number }[] = [];

    // Static background stars
    for (let i = 0; i < 500; i++) {
      bgStars.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 1.5 + 0.3,
        a: Math.random() * 0.8 + 0.2,
        twinkle: Math.random() * Math.PI * 2,
      });
    }

    const spawnStar = () => {
      const angle = Math.random() * 0.8 + 0.3; // downward-ish
      const speed = Math.random() * 6 + 3;
      const hue = Math.random() * 40 + 200; // blue range 200-240
      stars.push({
        x: Math.random() * window.innerWidth * 1.2 - window.innerWidth * 0.1,
        y: -10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: Math.random() * 60 + 40,
        size: Math.random() * 2 + 1,
        hue,
      });
    };

    let frame = 0;
    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // Deep space gradient
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.8);
      grad.addColorStop(0, '#050d1a');
      grad.addColorStop(0.5, '#020510');
      grad.addColorStop(1, '#000208');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Nebula glow
      const neb = ctx.createRadialGradient(w * 0.3, h * 0.4, 0, w * 0.3, h * 0.4, w * 0.4);
      neb.addColorStop(0, 'rgba(30, 60, 180, 0.06)');
      neb.addColorStop(0.5, 'rgba(20, 40, 140, 0.03)');
      neb.addColorStop(1, 'transparent');
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, w, h);

      // Background stars with twinkle
      frame++;
      for (const s of bgStars) {
        const flicker = Math.sin(frame * 0.02 + s.twinkle) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 200, 255, ${s.a * flicker})`;
        ctx.fill();
      }

      // Spawn shooting stars
      if (Math.random() < 0.18) spawnStar();

      // Draw shooting stars
      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i];
        s.x += s.vx;
        s.y += s.vy;
        s.life++;
        const progress = s.life / s.maxLife;
        const alpha = progress < 0.1 ? progress * 10 : progress > 0.7 ? (1 - progress) / 0.3 : 1;

        // Trail
        const tailLen = 30;
        const gradient = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * tailLen * 0.3, s.y - s.vy * tailLen * 0.3);
        gradient.addColorStop(0, `hsla(${s.hue}, 90%, 70%, ${alpha * 0.9})`);
        gradient.addColorStop(0.4, `hsla(${s.hue}, 80%, 50%, ${alpha * 0.4})`);
        gradient.addColorStop(1, `hsla(${s.hue}, 70%, 40%, 0)`);

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * tailLen * 0.3, s.y - s.vy * tailLen * 0.3);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = s.size;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Head glow
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${s.hue}, 100%, 85%, ${alpha * 0.8})`;
        ctx.fill();

        if (s.life >= s.maxLife) stars.splice(i, 1);
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 z-0" />;
};

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

        {/* CLRK Logo - star explosion intro */}
        <div className="relative mb-2">
          {/* Initial star glow that fades out */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 1, scale: 0.3 }}
            animate={{ opacity: 0, scale: 3 }}
            transition={{ duration: 3, ease: 'easeOut' }}
          >
            <div
              className="w-20 h-20 rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(210 100% 80%), hsl(220 100% 60%), hsl(230 100% 40%), transparent)',
                boxShadow: '0 0 60px 30px hsl(215 100% 60% / 0.8), 0 0 120px 60px hsl(220 100% 50% / 0.4)',
              }}
            />
          </motion.div>

          {/* Explosion particles */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const dist = 80 + Math.random() * 40;
            return (
              <motion.div
                key={i}
                className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full"
                style={{ background: `hsl(${200 + Math.random() * 40} 100% ${60 + Math.random() * 30}%)` }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1.5 }}
                animate={{
                  x: Math.cos(angle) * dist,
                  y: Math.sin(angle) * dist,
                  opacity: 0,
                  scale: 0,
                }}
                transition={{ duration: 2, delay: 1, ease: 'easeOut' }}
              />
            );
          })}

          {/* The CLRK text scales from tiny bright point */}
          <motion.h1
            className="text-5xl font-mono font-bold neon-text tracking-wider"
            initial={{ scale: 0, opacity: 0, filter: 'brightness(3) blur(8px)' }}
            animate={{ scale: 1, opacity: 1, filter: 'brightness(1) blur(0px)' }}
            transition={{ duration: 2, delay: 0.8, type: 'spring', stiffness: 80, damping: 14 }}
          >
            CLRK
          </motion.h1>
        </div>
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
