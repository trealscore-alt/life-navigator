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

export function useVoiceConversation({ onTranscript, onSpeakStart, onSpeakEnd, onWake, onStop }: UseVoiceConversationOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const recognitionRef = useRef<any>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const shouldRestartRef = useRef(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

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

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition not supported in this browser');
      return;
    }

    // Don't start if currently speaking
    if (window.speechSynthesis?.speaking) return;

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event: any) => {
      const text = event.results[0]?.[0]?.transcript?.trim();
      if (text) {
        onTranscript(text);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.error('Voice recognition error:', e.error);
      }
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try { recognition.start(); } catch { /* ignore */ }
  }, [onTranscript]);

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

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const toggleVoiceMode = useCallback(() => {
    setIsVoiceMode(prev => {
      const next = !prev;
      if (next) {
        shouldRestartRef.current = true;
        startListening();
        toast.success('Voice mode activated — speak to CLRK');
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
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    toggleVoiceMode,
  };
}
