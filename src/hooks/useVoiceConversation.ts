import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

interface UseVoiceConversationOptions {
  onTranscript: (text: string) => void;
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
  /** Called when user says a wake phrase like "listen CLRK" */
  onWake?: () => void;
  /** Called when user says "stop" to silence CLRK */
  onStop?: () => void;
}

export type VoiceSessionState = 'sleeping' | 'active' | 'thinking' | 'speaking' | 'paused';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
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
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
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

const ACTIVE_SESSION_TIMEOUT_MS = 120000;
const WAKE_PHRASE_RE = /\b(?:hey|listen|wake up)\s*(clrk|clark|clerk)\b/;
const SLEEP_PHRASE_RE = /\b(?:clrk\s*)?(sleep|go to sleep|stop listening|end voice|end conversation|goodbye|pause listening)\b/;
const STOP_SPEAKING_RE = /\b(stop|shut up|be quiet|silence|enough)\b/;

export function useVoiceConversation({ onTranscript, onSpeakStart, onSpeakEnd, onWake, onStop }: UseVoiceConversationOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [sessionState, setSessionState] = useState<VoiceSessionState>('sleeping');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const shouldRestartRef = useRef(false);
  const processingHoldRef = useRef(false);
  const sessionTimeoutRef = useRef<number | null>(null);
  const endVoiceSessionRef = useRef<(message?: string) => void>(() => {});
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const browserSupportsVoice =
    typeof window !== 'undefined' &&
    Boolean((window as SpeechRecognitionWindow).SpeechRecognition || (window as SpeechRecognitionWindow).webkitSpeechRecognition);

  // Pre-load voices — Chrome requires waiting for voiceschanged
  useEffect(() => {
    if (!window.speechSynthesis) return;

    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  const clearSessionTimeout = useCallback(() => {
    if (sessionTimeoutRef.current) {
      window.clearTimeout(sessionTimeoutRef.current);
      sessionTimeoutRef.current = null;
    }
  }, []);

  const resetSessionTimeout = useCallback(() => {
    clearSessionTimeout();
    if (!shouldRestartRef.current) return;

    sessionTimeoutRef.current = window.setTimeout(() => {
      endVoiceSessionRef.current('Voice session ended after quiet time.');
    }, ACTIVE_SESSION_TIMEOUT_MS);
  }, [clearSessionTimeout]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const endVoiceSession = useCallback((message = 'Voice session ended') => {
    shouldRestartRef.current = false;
    processingHoldRef.current = false;
    clearSessionTimeout();
    stopListening();
    stopSpeaking();
    setIsVoiceMode(false);
    setSessionState('sleeping');
    toast.info(message);
  }, [clearSessionTimeout, stopListening, stopSpeaking]);

  useEffect(() => {
    endVoiceSessionRef.current = endVoiceSession;
  }, [endVoiceSession]);

  const startListening = useCallback((keepSessionActive = true) => {
    const speechWindow = window as SpeechRecognitionWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const message = 'Speech recognition is not supported in this browser. Try Chrome or the native CLRK app.';
      setVoiceError(message);
      toast.error(message);
      return false;
    }

    // Don't start if currently speaking
    if (window.speechSynthesis?.speaking) return false;

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setVoiceError(null);
      setIsListening(true);
      if (shouldRestartRef.current) {
        setSessionState('active');
        resetSessionTimeout();
      }
    };
    
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const text = event.results[event.results.length - 1]?.[0]?.transcript?.trim();
      if (!text) return;

      const lower = text.toLowerCase().replace(/[^a-z\s]/g, '');
      resetSessionTimeout();

      if (SLEEP_PHRASE_RE.test(lower)) {
        endVoiceSession('CLRK is sleeping. Say Hey CLRK or tap the mic to reopen the session.');
        return;
      }

      // "stop" command — silence CLRK
      if (STOP_SPEAKING_RE.test(lower)) {
        stopSpeaking();
        onStop?.();
        if (shouldRestartRef.current) setSessionState('active');
        return;
      }

      // "listen CLRK" wake command — activate voice mode if not already
      if (WAKE_PHRASE_RE.test(lower)) {
        onWake?.();
        if (!shouldRestartRef.current) {
          shouldRestartRef.current = true;
          setIsVoiceMode(true);
          setSessionState('active');
        }
        resetSessionTimeout();
        return;
      }

      if (shouldRestartRef.current) {
        processingHoldRef.current = true;
        setSessionState('thinking');
        try { recognition.stop(); } catch { /* ignore */ }
      }
      onTranscript(text);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      // Auto-restart if we're in voice mode and not currently speaking
      if (shouldRestartRef.current && !processingHoldRef.current && !window.speechSynthesis?.speaking) {
        setTimeout(() => startListening(), 300);
      } else if (!shouldRestartRef.current) {
        setSessionState('sleeping');
      }
    };

    recognition.onerror = (e: SpeechRecognitionErrorEventLike) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.error('Voice recognition error:', e.error);
        setVoiceError(`Voice recognition error: ${e.error}`);
      }
      setIsListening(false);
      recognitionRef.current = null;
      // Auto-restart on non-fatal errors in voice mode
      if (shouldRestartRef.current && e.error === 'no-speech') {
        setTimeout(() => startListening(), 300);
      }
    };

    recognitionRef.current = recognition;
    try {
      if (keepSessionActive) {
        shouldRestartRef.current = true;
        setIsVoiceMode(true);
        resetSessionTimeout();
      }
      recognition.start();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Voice recognition could not start.';
      setVoiceError(message);
      toast.error(message);
      return false;
    }
  }, [endVoiceSession, onStop, onTranscript, onWake, resetSessionTimeout, stopSpeaking]);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) {
      toast.error('Text-to-speech not supported');
      return;
    }

    // Stop any ongoing speech & listening
    window.speechSynthesis.cancel();
    stopListening();

    // Strip markdown for cleaner speech
    const cleanText = text
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[-•]\s/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!cleanText) return;

    // Limit length for TTS
    const truncated = cleanText.length > 800 
      ? cleanText.slice(0, 800) + '... I have more details if you want.' 
      : cleanText;

    const utterance = new SpeechSynthesisUtterance(truncated);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1;

    // Pick the best available voice
    const voices = voicesRef.current.length > 0 
      ? voicesRef.current 
      : window.speechSynthesis.getVoices();
    
    const preferred = voices.find(v => 
      v.name.includes('Google UK English Male') 
    ) || voices.find(v => 
      v.name.includes('Google') && v.lang.startsWith('en')
    ) || voices.find(v => 
      v.lang.startsWith('en-') && !v.name.includes('Female')
    ) || voices.find(v => v.lang.startsWith('en'));
    
    if (preferred) {
      utterance.voice = preferred;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      if (shouldRestartRef.current) {
        setSessionState('speaking');
        resetSessionTimeout();
      }
      onSpeakStart?.();
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      onSpeakEnd?.();
      // Auto-listen again in voice mode
      if (shouldRestartRef.current) {
        setSessionState('active');
        setTimeout(() => startListening(), 500);
      }
    };

    utterance.onerror = (e) => {
      console.error('TTS error:', e);
      setIsSpeaking(false);
      onSpeakEnd?.();
      if (shouldRestartRef.current) setSessionState('active');
    };

    utteranceRef.current = utterance;
    
    // Chrome bug workaround: speechSynthesis can stall if called too fast
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 100);
  }, [stopListening, startListening, onSpeakStart, onSpeakEnd, resetSessionTimeout]);

  const startVoiceSession = useCallback(() => {
    processingHoldRef.current = false;
    shouldRestartRef.current = true;
    setIsVoiceMode(true);
    setSessionState('active');
    resetSessionTimeout();

    const started = startListening();
    if (!started) {
      shouldRestartRef.current = false;
      clearSessionTimeout();
      setIsVoiceMode(false);
      setSessionState('sleeping');
      return false;
    }
    toast.success('Continuous voice session active. Say "CLRK sleep" to end it.');
    return true;
  }, [clearSessionTimeout, resetSessionTimeout, startListening]);

  const resumeVoiceSession = useCallback(() => {
    if (!shouldRestartRef.current) return;
    processingHoldRef.current = false;
    setSessionState('active');
    resetSessionTimeout();
    if (!recognitionRef.current && !window.speechSynthesis?.speaking) {
      setTimeout(() => startListening(), 250);
    }
  }, [resetSessionTimeout, startListening]);

  const toggleVoiceMode = useCallback(() => {
    if (shouldRestartRef.current || isVoiceMode) {
      endVoiceSession('Voice session deactivated');
      return;
    }
    startVoiceSession();
  }, [endVoiceSession, isVoiceMode, startVoiceSession]);

  useEffect(() => {
    return () => clearSessionTimeout();
  }, [clearSessionTimeout]);

  return {
    isListening,
    isSpeaking,
    isVoiceMode,
    sessionState,
    browserSupportsVoice,
    voiceError,
    startListening,
    stopListening,
    startVoiceSession,
    endVoiceSession,
    resumeVoiceSession,
    speak,
    stopSpeaking,
    toggleVoiceMode,
  };
}
