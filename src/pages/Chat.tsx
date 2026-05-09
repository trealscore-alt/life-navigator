import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, ArrowLeft, Send, Loader2, Bot, User, Mic, MicOff, Volume2, VolumeX, Image, Bluetooth } from 'lucide-react';
import { CameraCapture } from '@/components/CameraCapture';
import { useVoiceConversation } from '@/hooks/useVoiceConversation';
import { useBluetooth, type DeviceReading } from '@/hooks/useBluetooth';

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  imageBase64?: string; // For displaying captured images in chat
}

type AgentContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

type AgentMessage = {
  role: 'user' | 'assistant';
  content: string | AgentContentBlock[] | Array<Record<string, unknown>>;
};

type AgentClientCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

type AgentResponse = {
  done: boolean;
  messages: AgentMessage[];
  finalText?: string;
  pendingClientCalls?: AgentClientCall[];
};

type AgentClientResult = {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

const AGENT_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clrk-agent`;
const LEGACY_CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clrk-chat`;

const parseDataUrl = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  return {
    mediaType: match?.[1] || 'image/jpeg',
    data: match?.[2] || dataUrl,
  };
};

const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const readLegacyChatStream = async (resp: Response) => {
  if (!resp.body) return await resp.text();
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const chunk = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }> };
        output += chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content || '';
      } catch {
        output += payload;
      }
    }
  }

  return output.trim();
};

const Chat = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [cameraStreaming, setCameraStreaming] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const latestAssistantRef = useRef<string>('');
  const ttsUnlockedRef = useRef(false);

  // Bluetooth integration — auto-initialize on native
  const bluetooth = useBluetooth();
  const { isNative, initialized, initialize } = bluetooth;

  useEffect(() => {
    if (isNative && !initialized) {
      initialize();
    }
  }, [isNative, initialized, initialize]);

  // Build Bluetooth state snapshot for the API
  const getBluetoothState = useCallback(() => {
    const latestByType: Record<string, DeviceReading> = {};
    for (const r of bluetooth.liveReadings) {
      const key = `${r.deviceId}:${r.dataType}`;
      if (!latestByType[key]) latestByType[key] = r;
    }
    return {
      devices: bluetooth.devices.map(d => ({
        deviceId: d.deviceId,
        name: d.name,
        rssi: d.rssi,
        connected: d.connected,
        serviceNames: d.serviceNames,
      })),
      scanning: bluetooth.scanning,
      liveReadings: Object.values(latestByType).slice(0, 15).map((r) => ({
        deviceName: r.deviceName,
        dataType: r.dataType,
        value: r.value,
        unit: r.unit,
        serviceName: r.serviceName,
      })),
      monitoring: Array.from(bluetooth.monitoring),
    };
  }, [bluetooth.devices, bluetooth.scanning, bluetooth.liveReadings, bluetooth.monitoring]);

  // Parse and execute BT commands from CLRK's response
  const executeBluetoothCommands = useCallback(async (text: string) => {
    const commands = text.match(/\[BT:(SCAN|STOP_SCAN|CONNECT|DISCONNECT|MONITOR|STOP_MONITOR)(?::([^\]]+))?\]/g);
    if (!commands) return;

    for (const cmd of commands) {
      const match = cmd.match(/\[BT:(SCAN|STOP_SCAN|CONNECT|DISCONNECT|MONITOR|STOP_MONITOR)(?::([^\]]+))?\]/);
      if (!match) continue;
      const [, action, deviceId] = match;

      try {
        switch (action) {
          case 'SCAN':
            toast({ title: '🔍 CLRK is scanning for devices...' });
            await bluetooth.startScan(15000);
            break;
          case 'STOP_SCAN':
            await bluetooth.stopScan();
            break;
          case 'CONNECT':
            if (deviceId) {
              toast({ title: `⚡ CLRK is connecting to device...` });
              await bluetooth.connectDevice(deviceId);
            }
            break;
          case 'DISCONNECT':
            if (deviceId) {
              await bluetooth.disconnectDevice(deviceId);
              toast({ title: `Disconnected by CLRK` });
            }
            break;
          case 'MONITOR':
            if (deviceId) {
              await bluetooth.startMonitoring(deviceId);
              toast({ title: `📡 CLRK started monitoring device` });
            }
            break;
          case 'STOP_MONITOR':
            if (deviceId) await bluetooth.stopMonitoring(deviceId);
            break;
        }
      } catch (err: unknown) {
        console.error(`BT command ${action} failed:`, err);
      }
    }
  }, [bluetooth, toast]);

  // Strip BT command tokens from displayed text
  const stripBtCommands = (text: string) =>
    text.replace(/\[BT:(SCAN|STOP_SCAN|CONNECT|DISCONNECT|MONITOR|STOP_MONITOR)(?::([^\]]+))?\]\n?/g, '').trim();

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

  // Use refs to break circular dependency between voiceConv and its callbacks
  const stopSpeakingRef = useRef<() => void>(() => {});
  const toggleVoiceModeRef = useRef<() => void>(() => {});
  const isVoiceModeRef = useRef(false);

  // Voice conversation
  const voiceConv = useVoiceConversation({
    onTranscript: (text) => {
      setInput(text);
      setTimeout(() => {
        sendMessageFromVoice(text);
      }, 300);
    },
    onStop: () => {
      stopSpeakingRef.current();
    },
    onWake: () => {
      if (!isVoiceModeRef.current) {
        toggleVoiceModeRef.current();
      }
    },
  });

  // Keep refs in sync
  stopSpeakingRef.current = voiceConv.stopSpeaking;
  toggleVoiceModeRef.current = voiceConv.toggleVoiceMode;
  isVoiceModeRef.current = voiceConv.isVoiceMode;

  // Build API message content — supports Anthropic-style multimodal blocks.
  const buildApiMessages = (msgs: Message[]): AgentMessage[] => {
    return msgs.map(m => {
      if (m.imageBase64) {
        const image = parseDataUrl(m.imageBase64);
        return {
          role: m.role,
          content: [
            ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
            {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: image.mediaType,
                data: image.data,
              },
            },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });
  };

  const handleCameraCapture = (imageBase64: string) => {
    setPendingImage(imageBase64);
    textareaRef.current?.focus();
    toast({ title: '📸 Image attached', description: 'Add a message or send directly — CLRK will analyze what you captured.' });
  };

  const getAuthToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error('Sign in again to reach CLRK.');
    return token;
  };

  const executeClientTool = useCallback(async (call: AgentClientCall) => {
    const toolInput = call.input || {};

    switch (call.name) {
      case 'bluetooth_status':
        return getBluetoothState();
      case 'bluetooth_scan':
        toast({ title: 'CLRK is scanning for devices...' });
        await bluetooth.startScan(Number(toolInput.duration_ms) || 15000);
        return { ok: true, message: 'Bluetooth scan started.', bluetoothState: getBluetoothState() };
      case 'bluetooth_stop_scan':
        await bluetooth.stopScan();
        return { ok: true, message: 'Bluetooth scan stopped.', bluetoothState: getBluetoothState() };
      case 'bluetooth_connect':
        if (!toolInput.device_id) throw new Error('device_id required');
        toast({ title: 'CLRK is connecting to device...' });
        await bluetooth.connectDevice(String(toolInput.device_id));
        return { ok: true, message: 'Bluetooth device connected.', bluetoothState: getBluetoothState() };
      case 'bluetooth_disconnect':
        if (!toolInput.device_id) throw new Error('device_id required');
        await bluetooth.disconnectDevice(String(toolInput.device_id));
        return { ok: true, message: 'Bluetooth device disconnected.', bluetoothState: getBluetoothState() };
      case 'bluetooth_monitor':
        if (!toolInput.device_id) throw new Error('device_id required');
        await bluetooth.startMonitoring(String(toolInput.device_id));
        return { ok: true, message: 'Bluetooth monitoring started.', bluetoothState: getBluetoothState() };
      case 'bluetooth_stop_monitor':
        if (!toolInput.device_id) throw new Error('device_id required');
        await bluetooth.stopMonitoring(String(toolInput.device_id));
        return { ok: true, message: 'Bluetooth monitoring stopped.', bluetoothState: getBluetoothState() };
      case 'capture_image':
        throw new Error('Camera capture needs a user tap. Ask the user to press the camera button.');
      case 'robot_status':
        return {
          robotId: 'clrk-app-bridge',
          name: 'CLRK App Robot Bridge',
          mode: 'observe',
          moving: false,
          capabilities: ['robot_status', 'robot_say', 'robot_stop'],
          safety: {
            emergencyStop: false,
            notes: ['No dedicated robot runtime is connected to this app session. Install robot-runtime on the robot for physical tools.'],
          },
        };
      case 'robot_say':
        if (!isMuted && typeof toolInput.text === 'string') {
          voiceConv.speak(toolInput.text);
        }
        return { spoken: String(toolInput.text || '') };
      case 'robot_stop':
        return { stopped: true, message: 'No dedicated robot runtime connected; app bridge is already stationary.' };
      case 'robot_read_sensors':
      case 'robot_capture_image':
      case 'robot_move_base':
      case 'robot_set_mode':
        throw new Error('Install and run robot-runtime on the robot to execute physical robot tools.');
      case 'smart_device_status':
        return {
          meshId: 'clrk-app-device-bridge',
          status: 'app_bridge_only',
          activeConversationEndpoints: ['phone'],
          transports: ['bluetooth_web_preview', 'camera', 'microphone', 'speaker'],
          note: 'Install device-mesh on dedicated hardware or native app builds for glasses, VR, vehicle, Matter, and robot endpoints.',
          bluetoothState: getBluetoothState(),
        };
      case 'smart_device_scan':
        return {
          discovered: [],
          category: toolInput.category || 'all',
          transport: toolInput.transport || 'any',
          note: 'Browser bridge can only expose limited Bluetooth preview. Use Device Hub or install device-mesh for universal discovery.',
        };
      case 'smart_device_start_conversation':
        return {
          sessionId: conversationId || 'current-chat-session',
          mode: toolInput.mode || 'hands_free',
          deviceId: toolInput.device_id,
          routedTo: 'current CLRK app chat and voice session',
        };
      case 'smart_device_stop_conversation':
        return { stopped: true, deviceId: toolInput.device_id, summary: 'Stopped app-bridge conversation endpoint.' };
      case 'smart_device_command':
      case 'smart_device_connect':
      case 'smart_device_read_context':
        throw new Error('Install and run device-mesh on the target hardware to execute smart-device mesh tools.');
      default:
        throw new Error(`Unknown client tool: ${call.name}`);
    }
  }, [bluetooth, conversationId, getBluetoothState, isMuted, toast, voiceConv]);

  const runAgent = useCallback(async (initialMessages: AgentMessage[], voiceMode: boolean) => {
    const token = await getAuthToken();
    let agentMessages = initialMessages;
    let clientToolResults: AgentClientResult[] | undefined;

    const runLegacyChat = async () => {
      const resp = await fetch(LEGACY_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: initialMessages.map((message) => ({
            role: message.role,
            content: Array.isArray(message.content)
              ? message.content
                  .filter((block): block is { type: 'text'; text: string } =>
                    typeof block === 'object' && block !== null && block.type === 'text' && typeof block.text === 'string'
                  )
                  .map((block) => block.text)
                  .join('\n')
              : message.content,
          })),
          userId: user?.id,
          conversationId,
          voiceMode,
          bluetoothState: getBluetoothState(),
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(typeof errData.error === 'string' ? errData.error : `Error ${resp.status}`);
      }

      return await readLegacyChatStream(resp);
    };

    for (let step = 0; step < 8; step++) {
      const resp = await fetch(AGENT_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: agentMessages,
          conversationId,
          voiceMode,
          bluetoothState: getBluetoothState(),
          ...(clientToolResults ? { clientToolResults } : {}),
        }),
      });

      if (resp.status === 404) {
        return await runLegacyChat();
      }

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      const data = (await resp.json()) as AgentResponse;
      agentMessages = data.messages;
      clientToolResults = undefined;
      if (data.done) return data.finalText || '';

      const clientResults: AgentClientResult[] = [];
      for (const call of data.pendingClientCalls || []) {
        try {
          clientResults.push({
            tool_use_id: call.id,
            content: JSON.stringify(await executeClientTool(call)),
          });
        } catch (err: unknown) {
          clientResults.push({
            tool_use_id: call.id,
            content: JSON.stringify({ error: getErrorMessage(err, 'Client tool failed') }),
            is_error: true,
          });
        }
      }

      if (clientResults.length === 0) return '';
      clientToolResults = clientResults;
    }

    return 'I hit my tool loop limit before finishing that. Try the request again in a smaller step.';
  }, [conversationId, executeClientTool, getBluetoothState, user?.id]);

  const sendUserMessage = async (text: string, voiceMode: boolean) => {
    if (!text.trim() || isLoading || !user) return;
    if (!conversationId) {
      toast({
        title: 'Conversation not ready',
        description: conversationError || 'CLRK is still creating your conversation. Try again in a moment.',
        variant: 'destructive',
      });
      return;
    }
    const currentImage = pendingImage;
    const userMsg: Message = { role: 'user', content: text.trim(), imageBase64: currentImage || undefined };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setPendingImage(null);
    setIsLoading(true);

    await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      user_id: user.id,
      role: 'user',
      content: currentImage ? `[Image attached] ${userMsg.content}` : userMsg.content,
    });

    try {
      const assistantContent = await runAgent(buildApiMessages(nextMessages), voiceMode);
      if (assistantContent) {
        await executeBluetoothCommands(assistantContent);
        const cleanContent = stripBtCommands(assistantContent);
        latestAssistantRef.current = cleanContent;
        setMessages(prev => [...prev, { role: 'assistant', content: cleanContent }]);
        await supabase.from('chat_messages').insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: 'assistant',
          content: cleanContent,
        });
        if (!isMuted) voiceConv.speak(cleanContent);
      }
    } catch (err: unknown) {
      toast({
        title: 'CLRK Error',
        description: getErrorMessage(err, 'Failed to get response'),
        variant: 'destructive',
      });
    }

    setIsLoading(false);
  };

  const sendMessageFromVoice = async (text: string) => {
    await sendUserMessage(text, true);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load or create conversation
  useEffect(() => {
    if (!user) return;
    const init = async () => {
      setConversationError(null);
      // Get most recent conversation or create one
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        setConversationError(error.message);
      }

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
        const { data: newConv, error: createError } = await supabase
          .from('chat_conversations')
          .insert({ user_id: user.id, title: 'New Conversation' })
          .select('id')
          .single();
        if (createError) {
          setConversationError(createError.message);
          toast({ title: 'Conversation failed', description: createError.message, variant: 'destructive' });
          return;
        }
        if (newConv) setConversationId(newConv.id);
      }
    };
    init();
  }, [toast, user]);

  const sendMessage = async () => {
    if ((!input.trim() && !pendingImage) || isLoading || !user) return;
    const content = input.trim() || (pendingImage ? 'What do you see in this image? Analyze it and help me.' : '');
    await sendUserMessage(content, voiceConv.isVoiceMode);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-screen clrk-shell flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 scanline-overlay opacity-10" />

      {/* Header */}
      <header className="relative z-10 control-bar px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/dashboard">
            <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div className="agent-mark hidden h-9 w-9 rounded-lg sm:inline-flex">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-mono text-sm neon-text font-bold">CLRK</h1>
            <p className="text-[10px] font-mono text-muted-foreground flex items-center gap-2">
              {voiceConv.isSpeaking ? 'Speaking...' : voiceConv.isListening ? 'Listening...' : isLoading ? 'Processing...' : 'Ready'}
              {bluetooth.devices.some(d => d.connected) && (
                <span className="flex items-center gap-1 text-primary">
                  <Bluetooth className="w-3 h-3" />
                  {bluetooth.devices.filter(d => d.connected).length} device{bluetooth.devices.filter(d => d.connected).length !== 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (voiceConv.isSpeaking) voiceConv.stopSpeaking();
              setIsMuted(prev => !prev);
            }}
            className={isMuted ? 'text-destructive hover:text-destructive/80' : 'text-primary hover:text-primary/80'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
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
            <div className="agent-mark h-16 w-16 rounded-lg mb-5">
              <Bot className="h-8 w-8" />
            </div>
            <div className="text-6xl font-mono neon-text font-bold mb-4">CLRK</div>
            <p className="text-muted-foreground text-sm max-w-md text-balance">
              {conversationError
                ? 'CLRK is online, but the conversation store is not ready. Check the warning below.'
                : 'Your personal intelligence system is ready. Ask me anything about your goals, career, finances, health, relationships, or life strategy.'}
            </p>
            {conversationError && (
              <div className="mt-5 max-w-md rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-left">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <p className="text-xs text-destructive">{conversationError}</p>
                </div>
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {['What should I focus on today?', 'Review my goals', 'Help me plan my week'].map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                  className="text-xs font-mono px-3 py-2 rounded-md bg-secondary/50 border border-border/70 text-muted-foreground hover:text-primary hover:border-primary/40 transition-all"
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
              <div className="agent-mark w-8 h-8 rounded-lg flex-shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
            )}
            <div className={`max-w-[85%] sm:max-w-[75%] rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 ${
              msg.role === 'user'
                ? 'bg-accent/15 border border-accent/30 text-foreground shadow-[0_18px_60px_-48px_hsl(var(--accent)/0.85)]'
                : 'glass-card border border-border/70'
            }`}>
              {msg.imageBase64 && (
                <div className="mb-2">
                  <img
                    src={msg.imageBase64}
                    alt="Camera capture"
                    className="rounded-lg max-h-48 w-auto border border-border/30"
                  />
                </div>
              )}
              {msg.role === 'assistant' ? (
                <div className="prose prose-sm prose-invert max-w-none [&_p]:text-sm [&_p]:text-foreground/90 [&_li]:text-sm [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-mono [&_h2]:font-mono [&_h3]:font-mono [&_code]:text-primary [&_strong]:text-foreground">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm">{msg.content}</p>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/35 flex items-center justify-center flex-shrink-0">
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
            <div className="glass-card border border-border/70 rounded-lg px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="relative z-10 border-t border-border/60 bg-card/55 backdrop-blur-2xl p-3 sm:p-4">
        {/* Pending image preview */}
        {pendingImage && (
          <div className="max-w-4xl mx-auto mb-2 flex items-center gap-2">
            <img src={pendingImage} alt="Pending capture" className="h-16 w-auto rounded-lg border border-primary/30" />
            <div className="flex-1">
              <p className="text-[10px] font-mono text-primary">📸 Image attached</p>
              <p className="text-[9px] text-muted-foreground">CLRK will analyze this with your message</p>
            </div>
            <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => setPendingImage(null)}>
              <span className="text-xs text-muted-foreground">✕</span>
            </Button>
          </div>
        )}
        <div className="max-w-4xl mx-auto command-surface rounded-lg p-2 flex gap-2 sm:gap-3">
          <Button
            onClick={voiceConv.isListening ? voiceConv.stopListening : voiceConv.startListening}
            disabled={isLoading || voiceConv.isSpeaking}
            size="icon"
            variant="ghost"
            className={`flex-shrink-0 ${voiceConv.isListening ? 'text-primary bg-primary/10 shadow-[0_0_12px_-2px_hsl(var(--neon-glow)/0.5)]' : 'text-muted-foreground hover:text-primary'}`}
          >
            {voiceConv.isListening ? <Mic className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
          </Button>
          <CameraCapture
            onCapture={handleCameraCapture}
            isStreaming={cameraStreaming}
            onStreamToggle={setCameraStreaming}
          />
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pendingImage ? 'Ask CLRK about this image...' : voiceConv.isListening ? 'Listening...' : 'Message CLRK...'}
            className="min-h-[44px] max-h-32 resize-none bg-background/40 border-border/70 focus:border-primary font-sans text-sm"
            rows={1}
          />
          <Button
            onClick={sendMessage}
            disabled={(!input.trim() && !pendingImage) || isLoading}
            size="icon"
            className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_-3px_hsl(var(--neon-glow)/0.4)] flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        {voiceConv.isVoiceMode && (
          <p className="text-center text-[10px] font-mono text-primary/60 mt-2">
            VOICE MODE ACTIVE - Speak naturally, CLRK will respond aloud
          </p>
        )}
        {voiceConv.voiceError && (
          <p className="text-center text-[10px] font-mono text-destructive mt-2">
            {voiceConv.voiceError}
          </p>
        )}
        {!voiceConv.browserSupportsVoice && (
          <p className="text-center text-[10px] font-mono text-yellow-300 mt-2">
            Voice recognition needs Chrome or the native CLRK app. Text chat still works here.
          </p>
        )}
        {cameraStreaming && (
          <p className="text-center text-[10px] font-mono text-primary/60 mt-1">
            CAMERA ACTIVE - Capture a frame for CLRK to analyze
          </p>
        )}
      </div>
    </div>
  );
};

export default Chat;
