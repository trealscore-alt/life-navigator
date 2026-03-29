import { useState, useRef, useCallback, useEffect } from 'react';

interface UseWakeWordOptions {
  wakePhrase?: string;
  onWake: () => void;
  enabled?: boolean;
}

export const useWakeWord = ({
  wakePhrase = 'hey clerk',
  onWake,
  enabled = true,
}: UseWakeWordOptions) => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const enabledRef = useRef(enabled);
  const onWakeRef = useRef(onWake);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { onWakeRef.current = onWake; }, [onWake]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    // Clean up any existing instance
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript.toLowerCase().trim();
        // Check for wake phrase variations
        const triggers = [wakePhrase, 'hey clark', 'hey clrk', 'a clerk', 'hey cleric', 'hey click'];
        if (triggers.some(t => text.includes(t))) {
          // Stop wake word listening before activating
          stop();
          onWakeRef.current();
          return;
        }
      }
    };

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
      // Auto-restart if still enabled
      if (enabledRef.current && recognitionRef.current) {
        try {
          setTimeout(() => {
            if (enabledRef.current && recognitionRef.current) {
              recognitionRef.current.start();
            }
          }, 300);
        } catch { /* ignore */ }
      }
    };
    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.error('Wake word error:', e.error);
      }
    };

    recognitionRef.current = recognition;
    try { recognition.start(); } catch { /* ignore */ }
  }, [wakePhrase, stop]);

  // Auto-start/stop based on enabled
  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
    return stop;
  }, [enabled, start, stop]);

  return { isListening, start, stop };
};
