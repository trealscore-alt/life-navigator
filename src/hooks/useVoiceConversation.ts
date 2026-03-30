import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';

interface UseVoiceConversationOptions {
  onTranscript: (text: string) => void;
  onSpeakStart?: () => void;
  onSpeakEnd?: () => void;
}

export function useVoiceConversation({ onTranscript, onSpeakStart, onSpeakEnd }: UseVoiceConversationOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const recognitionRef = useRef<any>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const shouldRestartRef = useRef(false);

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
    if (window.speechSynthesis.speaking) return;

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

    // Stop any ongoing speech
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
      .trim();

    // Limit length for TTS
    const truncated = cleanText.length > 1500 ? cleanText.slice(0, 1500) + '... I have more details if you need them.' : cleanText;

    const utterance = new SpeechSynthesisUtterance(truncated);
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    utterance.volume = 1;

    // Try to pick a good voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => 
      v.name.includes('Google') && v.lang.startsWith('en')
    ) || voices.find(v => 
      v.lang.startsWith('en') && v.name.includes('Male')
    ) || voices.find(v => v.lang.startsWith('en'));
    
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => {
      setIsSpeaking(true);
      onSpeakStart?.();
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      onSpeakEnd?.();
      // Auto-listen again in voice mode
      if (shouldRestartRef.current) {
        setTimeout(() => startListening(), 400);
      }
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      onSpeakEnd?.();
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
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
