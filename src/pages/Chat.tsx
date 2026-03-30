import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Send, Loader2, Bot, User, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useVoiceConversation } from '@/hooks/useVoiceConversation';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clrk-chat`;

const Chat = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const latestAssistantRef = useRef<string>('');
  const ttsUnlockedRef = useRef(false);

  // Unlock TTS on first user interaction (required by browsers)
  useEffect(() => {
    const unlock = () => {
      if (ttsUnlockedRef.current) return;
      ttsUnlockedRef.current = true;
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      window.speechSynthesis?.speak(u);
      window.speechSynthesis?.cancel();
    };
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  // Voice conversation
  const voiceConv = useVoiceConversation({
    onTranscript: (text) => {
      setInput(text);
      setTimeout(() => {
        sendMessageFromVoice(text);
      }, 300);
    },
  });

  const sendMessageFromVoice = async (text: string) => {
    if (!text.trim() || isLoading || !user || !conversationId) return;
    const userMsg: Message = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: 'user',
      content: userMsg.content,
    });

    let assistantContent = '';
    const upsertAssistant = (chunk: string) => {
      assistantContent += chunk;
      latestAssistantRef.current = assistantContent;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
        }
        return [...prev, { role: 'assistant', content: assistantContent }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          userId: user.id,
          voiceMode: true,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error('No stream body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      if (assistantContent) {
        await supabase.from('chat_messages').insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: 'assistant',
          content: assistantContent,
        });
        // Auto-speak in voice mode
        if (voiceConv.isVoiceMode) {
          voiceConv.speak(assistantContent);
        }
      }
    } catch (err: any) {
      toast({
        title: 'CLRK Error',
        description: err.message || 'Failed to get response',
        variant: 'destructive',
      });
    }

    setIsLoading(false);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load or create conversation
  useEffect(() => {
    if (!user) return;
    const init = async () => {
      // Get most recent conversation or create one
      const { data } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setConversationId(data.id);
        // Load messages
        const { data: msgs } = await supabase
          .from('chat_messages')
          .select('role, content')
          .eq('conversation_id', data.id)
          .order('created_at');
        if (msgs) setMessages(msgs as Message[]);
      } else {
        const { data: newConv } = await supabase
          .from('chat_conversations')
          .insert({ user_id: user.id, title: 'New Conversation' })
          .select('id')
          .single();
        if (newConv) setConversationId(newConv.id);
      }
    };
    init();
  }, [user]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !user || !conversationId) return;

    const userMsg: Message = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Save user message
    await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: 'user',
      content: userMsg.content,
    });

    let assistantContent = '';

    const upsertAssistant = (chunk: string) => {
      assistantContent += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
        }
        return [...prev, { role: 'assistant', content: assistantContent }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          userId: user.id,
          voiceMode: voiceConv.isVoiceMode,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error('No stream body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      // Save assistant message
      if (assistantContent) {
        await supabase.from('chat_messages').insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: 'assistant',
          content: assistantContent,
        });
        // Auto-speak in voice mode
        if (voiceConv.isVoiceMode) {
          voiceConv.speak(assistantContent);
        }
      }
    } catch (err: any) {
      toast({
        title: 'CLRK Error',
        description: err.message || 'Failed to get response',
        variant: 'destructive',
      });
    }

    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-screen flex flex-col relative">
      <div className="absolute inset-0 grid-bg opacity-5" />

      {/* Header */}
      <header className="relative z-10 border-b border-border/50 bg-card/40 backdrop-blur-xl px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/dashboard">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <h1 className="font-mono text-sm neon-text font-bold">CLRK</h1>
            <p className="text-[10px] font-mono text-muted-foreground">
              {voiceConv.isSpeaking ? 'Speaking...' : voiceConv.isListening ? 'Listening...' : isLoading ? 'Processing...' : 'Ready'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {voiceConv.isSpeaking && (
            <Button variant="ghost" size="icon" onClick={voiceConv.stopSpeaking} className="text-muted-foreground hover:text-destructive">
              <VolumeX className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant={voiceConv.isVoiceMode ? 'default' : 'ghost'}
            size="icon"
            onClick={voiceConv.toggleVoiceMode}
            className={voiceConv.isVoiceMode 
              ? 'bg-primary text-primary-foreground shadow-[0_0_15px_-3px_hsl(var(--neon-glow)/0.5)] animate-pulse' 
              : 'text-muted-foreground hover:text-primary'}
          >
            {voiceConv.isVoiceMode ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </Button>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <div className={`w-2 h-2 rounded-full ${voiceConv.isListening ? 'bg-primary animate-pulse-glow' : isLoading ? 'bg-yellow-400 animate-pulse' : 'bg-primary animate-pulse-glow'}`} />
            {voiceConv.isListening ? 'LISTENING' : isLoading ? 'THINKING' : 'ONLINE'}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto relative z-10 px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-full text-center"
          >
            <div className="text-6xl font-mono neon-text font-bold mb-4">CLRK</div>
            <p className="text-muted-foreground text-sm max-w-md">
              Your personal intelligence system is ready. Ask me anything about your goals, career, finances, health, relationships, or life strategy.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {['What should I focus on today?', 'Review my goals', 'Help me plan my week'].map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                  className="text-xs font-mono px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-muted-foreground hover:text-primary hover:border-primary/30 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
            )}
            <div className={`max-w-[85%] sm:max-w-[75%] rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 ${
              msg.role === 'user'
                ? 'bg-accent/20 border border-accent/30 text-foreground'
                : 'glass-card border border-border/50'
            }`}>
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm prose-invert max-w-none [&_p]:text-sm [&_p]:text-foreground/90 [&_li]:text-sm [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-mono [&_h2]:font-mono [&_h3]:font-mono [&_code]:text-primary [&_strong]:text-foreground">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm">{msg.content}</p>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-accent" />
              </div>
            )}
          </motion.div>
        ))}

        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div className="glass-card border border-border/50 rounded-xl px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="relative z-10 border-t border-border/50 bg-card/40 backdrop-blur-xl p-3 sm:p-4">
        <div className="max-w-4xl mx-auto flex gap-2 sm:gap-3">
          <Button
            onClick={voiceConv.isListening ? voiceConv.stopListening : voiceConv.startListening}
            disabled={isLoading || voiceConv.isSpeaking}
            size="icon"
            variant="ghost"
            className={`flex-shrink-0 ${voiceConv.isListening ? 'text-primary bg-primary/10 shadow-[0_0_12px_-2px_hsl(var(--neon-glow)/0.5)]' : 'text-muted-foreground hover:text-primary'}`}
          >
            {voiceConv.isListening ? <Mic className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={voiceConv.isListening ? 'Listening...' : 'Message CLRK...'}
            className="min-h-[44px] max-h-32 resize-none bg-secondary/50 border-border/50 focus:border-primary font-sans text-sm"
            rows={1}
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_-3px_hsl(var(--neon-glow)/0.4)] flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        {voiceConv.isVoiceMode && (
          <p className="text-center text-[10px] font-mono text-primary/60 mt-2">
            🎙️ VOICE MODE ACTIVE — Speak naturally, CLRK will respond aloud
          </p>
        )}
      </div>
    </div>
  );
};

export default Chat;
