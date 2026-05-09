import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft, Camera, CameraOff, Mic, MicOff, Volume2, VolumeX,
  Eye, Radio, Loader2, Glasses, Play,
} from 'lucide-react';
import LiveDemoSimulation from '@/components/LiveDemoSimulation';
import { useWakeWord } from '@/hooks/useWakeWord';
import { useVoiceCommands, DeviceCommand } from '@/hooks/useVoiceCommands';

interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface ClrkLiveResponse {
  reply?: string;
  error?: string;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Failed to communicate with CLRK';

const LiveMode = () => {
  const { user } = useAuth();
  const { parseCommand } = useVoiceCommands();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  const [isActive, setIsActive] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentSpeech, setCurrentSpeech] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [showDemo, setShowDemo] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Wake word detection — "Hey CLRK" activates Live Mode hands-free
  const { isListening: isWakeListening } = useWakeWord({
    onWake: () => {
      toast.success('Wake word detected — activating CLRK Live');
      startAll();
    },
    enabled: wakeWordEnabled && !isActive,
  });

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current || !cameraOn) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, 640, 480);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
    return dataUrl.split(',')[1]; // Return base64 without prefix
  }, [cameraOn]);

  const speak = useCallback((text: string) => {
    if (!speakerOn) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 0.95;

    // Try to find a good voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v =>
      v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Daniel')
    ) || voices.find(v => v.lang.startsWith('en'));
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // Resume listening after speaking
      if (micOn && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch { /* already running */ }
      }
    };
    synthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [speakerOn, micOn]);

  const handleDeviceCommand = useCallback((cmd: DeviceCommand) => {
    const actionMap: Record<string, string> = {
      glasses: 'smart glasses',
      car: 'vehicle system',
      home: 'home devices',
      vr: 'VR headset',
      watch: 'smartwatch',
      headphones: 'headphones',
      speaker: 'smart speaker',
      phone: 'phone',
      all: 'all nearby devices',
    };
    const targetLabel = actionMap[cmd.target] || cmd.target;

    let response = '';
    switch (cmd.type) {
      case 'scan':
        response = `Scanning for ${targetLabel} now. On a native device, I'll discover all nearby Bluetooth devices. In the browser, navigate to Device Hub to initiate a scan.`;
        toast.info(`CLRK: Scanning for ${targetLabel}...`);
        break;
      case 'connect':
        response = `Initiating connection to your ${targetLabel}. On a native device with Bluetooth enabled, I'll pair and begin monitoring automatically. For now, head to Device Hub where you can scan and connect.`;
        toast.info(`CLRK: Connecting to ${targetLabel}...`);
        break;
      case 'disconnect':
        response = `Disconnecting from your ${targetLabel}. I'll stop monitoring and release the connection.`;
        toast.info(`CLRK: Disconnecting ${targetLabel}...`);
        break;
      case 'monitor':
        response = `Starting live monitoring on your ${targetLabel}. I'll track all available data streams — heart rate, temperature, battery, whatever it broadcasts — and sync insights to your dashboard.`;
        toast.info(`CLRK: Monitoring ${targetLabel}...`);
        break;
      case 'status':
        response = `Checking status of your ${targetLabel}. On a native build, I'd pull live connection states and recent readings. Check Device Hub for the full picture.`;
        toast.info(`CLRK: Checking ${targetLabel} status...`);
        break;
      case 'conversation':
        response = `Starting a ${cmd.mode || 'hands-free'} CLRK conversation endpoint on your ${targetLabel}. Once the Device Mesh runtime is installed there, I'll keep this same conversation continuous across the app, glasses, vehicle, VR, and robot.`;
        toast.info(`CLRK: Routing conversation to ${targetLabel}...`);
        break;
      case 'context':
        response = `Reading context from your ${targetLabel}. With the Device Mesh runtime connected, I'll use its live sensors, camera, scene, or telemetry feed and keep the conversation grounded in what that device sees.`;
        toast.info(`CLRK: Reading ${targetLabel} context...`);
        break;
    }

    // Add to transcript as if CLRK responded
    const assistantEntry: TranscriptEntry = {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: response,
      timestamp: new Date(),
    };
    setTranscript(prev => [...prev, assistantEntry]);
    setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    speak(response);
  }, [speak]);

  const sendToClrk = useCallback(async (userText: string) => {
    if (!user) return;

    // Check for device commands first
    const cmd = parseCommand(userText);
    if (cmd) {
      // Add user message to transcript
      const userEntry: TranscriptEntry = {
        id: crypto.randomUUID(),
        role: 'user',
        text: userText,
        timestamp: new Date(),
      };
      setTranscript(prev => [...prev, userEntry]);
      setMessages(prev => [...prev, { role: 'user', content: userText }]);
      handleDeviceCommand(cmd);
      return;
    }

    setIsProcessing(true);

    const userEntry: TranscriptEntry = {
      id: crypto.randomUUID(),
      role: 'user',
      text: userText,
      timestamp: new Date(),
    };
    setTranscript(prev => [...prev, userEntry]);

    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);

    try {
      const imageBase64 = captureFrame();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clrk-live`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: newMessages.slice(-10),
            userId: user.id,
            imageBase64,
          }),
        }
      );

      if (!response.ok) {
        const err = (await response.json()) as ClrkLiveResponse;
        throw new Error(err.error || 'Failed to reach CLRK');
      }

      const data = (await response.json()) as ClrkLiveResponse;
      const reply = data.reply || 'I heard you, but I did not receive a complete CLRK response.';

      const assistantEntry: TranscriptEntry = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: reply,
        timestamp: new Date(),
      };
      setTranscript(prev => [...prev, assistantEntry]);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);

      speak(reply);
    } catch (error) {
      console.error('CLRK Live error:', error);
      toast.error(getErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  }, [user, messages, captureFrame, speak, parseCommand, handleDeviceCommand]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraOn(true);
    } catch (error) {
      console.error('Camera error:', error);
      toast.error('Camera access denied. Enable camera permissions.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  const startMic = useCallback(() => {
    const speechWindow = window as SpeechRecognitionWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setCurrentSpeech(interim);
      if (final.trim()) {
        setCurrentSpeech('');
        // Pause recognition while processing
        try { recognition.stop(); } catch { /* ignore */ }
        sendToClrk(final.trim());
      }
    };

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
      // Auto-restart if mic is still on and not speaking
      if (micOn && !isSpeaking) {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };
    recognition.onerror = (e: SpeechRecognitionErrorEventLike) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.error('Speech recognition error:', e.error);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setMicOn(true);
  }, [sendToClrk, isSpeaking, micOn]);

  const stopMic = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setMicOn(false);
    setIsListening(false);
    setCurrentSpeech('');
  }, []);

  const startAll = useCallback(async () => {
    await startCamera();
    startMic();
    setIsActive(true);
    // Load voices
    window.speechSynthesis.getVoices();
  }, [startCamera, startMic]);

  const stopAll = useCallback(() => {
    stopCamera();
    stopMic();
    window.speechSynthesis.cancel();
    setIsActive(false);
    setIsSpeaking(false);
  }, [stopCamera, stopMic]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAll();
    };
  }, [stopAll]);

  const statusColor = isProcessing ? 'bg-yellow-500' : isSpeaking ? 'bg-primary' : isListening ? 'bg-green-500' : isWakeListening ? 'bg-cyan-500' : 'bg-muted';
  const statusText = isProcessing ? 'Processing...' : isSpeaking ? 'CLRK Speaking' : isListening ? 'Listening...' : isWakeListening ? '"Hey CLRK" ready' : 'Standby';

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <header className="flex items-center justify-between p-3 sm:p-4 border-b border-border/30 gap-2">
        <Link to="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-mono">EXIT LIVE</span>
        </Link>
        <div className="flex items-center gap-2">
          <Glasses className="w-5 h-5 text-primary" />
          <span className="font-mono text-sm neon-text">LIVE MODE</span>
          {!showDemo && (
            <Button variant="ghost" size="sm" onClick={() => setShowDemo(true)} className="text-xs h-6 px-2 text-primary/60 hover:text-primary">
              <Play className="w-3 h-3 mr-1" /> DEMO
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${statusColor} animate-pulse`} />
          <span className="text-xs font-mono text-muted-foreground">{statusText}</span>
        </div>
      </header>

      {/* Main content */}
      {showDemo ? (
        <LiveDemoSimulation onClose={() => setShowDemo(false)} />
      ) : (
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Camera feed */}
        <div className="relative lg:w-1/2 bg-black flex items-center justify-center min-h-[200px] sm:min-h-[300px]">
          {cameraOn ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Camera overlay */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Corner brackets */}
                <div className="absolute top-4 left-4 w-12 h-12 border-l-2 border-t-2 border-primary/60" />
                <div className="absolute top-4 right-4 w-12 h-12 border-r-2 border-t-2 border-primary/60" />
                <div className="absolute bottom-4 left-4 w-12 h-12 border-l-2 border-b-2 border-primary/60" />
                <div className="absolute bottom-4 right-4 w-12 h-12 border-r-2 border-b-2 border-primary/60" />
                {/* Scanning line */}
                {isProcessing && (
                  <motion.div
                    className="absolute left-0 right-0 h-0.5 bg-primary/80"
                    animate={{ top: ['10%', '90%', '10%'] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  />
                )}
                {/* Status indicator */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-background/60 backdrop-blur-sm px-3 py-1 rounded-full">
                  <Eye className="w-3 h-3 text-primary" />
                  <span className="text-xs font-mono text-primary">VISUAL FEED ACTIVE</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
              <CameraOff className="w-16 h-16" />
              <p className="font-mono text-sm">Camera inactive</p>
            </div>
          )}
        </div>

        {/* Transcript & controls */}
        <div className="flex-1 flex flex-col lg:w-1/2">
          {/* Live transcript */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {transcript.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
                <Radio className="w-12 h-12 animate-pulse" />
                <p className="font-mono text-sm text-center">
                  {isActive ? 'Speak to CLRK...' : 'Activate Live Mode to begin'}
                </p>
                <p className="text-xs text-center max-w-xs">
                  CLRK will see through your camera, hear your voice, and respond verbally in real-time.
                </p>
              </div>
            )}
            <AnimatePresence>
              {transcript.map((entry) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${
                      entry.role === 'user'
                        ? 'bg-primary/20 text-primary-foreground border border-primary/30'
                        : 'bg-muted/30 text-foreground border border-border/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {entry.role === 'assistant' && <Glasses className="w-3 h-3 text-primary" />}
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">
                        {entry.role === 'user' ? 'You' : 'CLRK'}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">
                        {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p>{entry.text}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Current speech preview */}
            {currentSpeech && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-end"
              >
                <div className="max-w-[85%] px-4 py-3 rounded-2xl text-sm bg-primary/10 border border-primary/20 text-muted-foreground italic">
                  {currentSpeech}...
                </div>
              </motion.div>
            )}

            {isProcessing && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="px-4 py-3 rounded-2xl bg-muted/30 border border-border/30 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground font-mono">Processing visual + audio...</span>
                </div>
              </motion.div>
            )}

            <div ref={transcriptEndRef} />
          </div>

          {/* Controls */}
          <div className="p-4 border-t border-border/30 bg-background/80 backdrop-blur-sm">
            {!isActive ? (
              <div className="space-y-3">
                <Button
                  onClick={startAll}
                  className="w-full h-14 text-lg font-mono bg-primary hover:bg-primary/80 text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.4)]"
                >
                  <Eye className="w-5 h-5 mr-2" />
                  ACTIVATE LIVE MODE
                </Button>
                {isWakeListening && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground"
                  >
                    <motion.div
                      className="w-2 h-2 rounded-full bg-cyan-500"
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                    Listening for "Hey CLRK"...
                  </motion.div>
                )}
                <button
                  onClick={() => setWakeWordEnabled(!wakeWordEnabled)}
                  className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors font-mono"
                >
                  {wakeWordEnabled ? 'Disable' : 'Enable'} wake word
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Listening indicator */}
                <div className="flex items-center justify-center gap-3">
                  {isListening && (
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="w-1 bg-green-500 rounded-full"
                          animate={{
                            height: [4, 16 + Math.random() * 12, 4],
                          }}
                          transition={{
                            duration: 0.5 + Math.random() * 0.3,
                            repeat: Infinity,
                            delay: i * 0.1,
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {isSpeaking && (
                    <div className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="w-1 bg-primary rounded-full"
                          animate={{
                            height: [4, 20 + Math.random() * 10, 4],
                          }}
                          transition={{
                            duration: 0.4 + Math.random() * 0.3,
                            repeat: Infinity,
                            delay: i * 0.08,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Control buttons */}
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="icon"
                    className={`w-12 h-12 rounded-full ${cameraOn ? 'border-primary text-primary' : 'border-muted text-muted-foreground'}`}
                    onClick={cameraOn ? stopCamera : startCamera}
                  >
                    {cameraOn ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    className={`w-12 h-12 rounded-full ${micOn ? 'border-green-500 text-green-500' : 'border-muted text-muted-foreground'}`}
                    onClick={micOn ? stopMic : startMic}
                  >
                    {micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    className={`w-12 h-12 rounded-full ${speakerOn ? 'border-primary text-primary' : 'border-muted text-muted-foreground'}`}
                    onClick={() => {
                      setSpeakerOn(!speakerOn);
                      if (speakerOn) window.speechSynthesis.cancel();
                    }}
                  >
                    {speakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                  </Button>

                  <Button
                    variant="destructive"
                    size="icon"
                    className="w-12 h-12 rounded-full"
                    onClick={stopAll}
                  >
                    <Radio className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default LiveMode;
