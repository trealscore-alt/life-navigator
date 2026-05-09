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

export function useVoiceConversation({ onTranscript, onSpeakStart, onSpeakEnd, onWake, onStop }: UseVoiceConversationOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const shouldRestartRef = useRef(false);
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

  const stopListening = useCallback(() => {
    shouldRestartRef.current = false;
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

  const startListening = useCallback(() => {
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
    };
    
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const text = event.results[event.results.length - 1]?.[0]?.transcript?.trim();
      if (!text) return;

      const lower = text.toLowerCase().replace(/[^a-z\s]/g, '');

      // "stop" command — silence CLRK
      if (/\b(stop|shut up|be quiet|silence|enough)\b/.test(lower)) {
        stopSpeaking();
        onStop?.();
        // Keep listening for next command in voice mode
        return;
      }

      // "listen CLRK" wake command — activate voice mode if not already
      if (/\blisten\s*(clrk|clark|clerk)\b/.test(lower) || /\bhey\s*(clrk|clark|clerk)\b/.test(lower)) {
        onWake?.();
        return;
      }

      onTranscript(text);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      // Auto-restart if we're in voice mode and not currently speaking
      if (shouldRestartRef.current && !window.speechSynthesis?.speaking) {
        setTimeout(() => startListening(), 300);
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
      recognition.start();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Voice recognition could not start.';
      setVoiceError(message);
      toast.error(message);
      return false;
    }
  }, [onStop, onTranscript, onWake, stopSpeaking]);

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
      onSpeakStart?.();
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      onSpeakEnd?.();
      // Auto-listen again in voice mode
      if (shouldRestartRef.current) {
        setTimeout(() => startListening(), 500);
      }
    };

    utterance.onerror = (e) => {
      console.error('TTS error:', e);
      setIsSpeaking(false);
      onSpeakEnd?.();
    };

    utteranceRef.current = utterance;
    
    // Chrome bug workaround: speechSynthesis can stall if called too fast
    setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 100);
  }, [stopListening, startListening, onSpeakStart, onSpeakEnd]);

  const toggleVoiceMode = useCallback(() => {
    setIsVoiceMode(prev => {
      const next = !prev;
      if (next) {
        shouldRestartRef.current = true;
        const started = startListening();
        if (!started) {
          shouldRestartRef.current = false;
          return false;
        }
        toast.success('Voice mode activated. Speak to CLRK.');
      } else {
        shouldRestartRef.current = false;
        stopListening();
        stopSpeaking();
        toast.info('Voice mode deactivated');
      }
      return next;
    });
  }, [startListening, stopListening, stopSpeaking]);

  return {
    isListening,
    isSpeaking,
    isVoiceMode,
    browserSupportsVoice,
    voiceError,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    toggleVoiceMode,
  };
}
