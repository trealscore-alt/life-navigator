import { useCallback, useRef } from 'react';
import { toast } from 'sonner';

export interface DeviceCommand {
  type: 'connect' | 'disconnect' | 'scan' | 'status' | 'monitor' | 'conversation' | 'context';
  target: string; // 'glasses', 'car', 'home', 'all', specific device name
  raw: string;
  mode?: 'hands_free' | 'push_to_talk' | 'ambient' | 'meeting' | 'navigation';
}

const CONNECT_PATTERNS = [
  /connect\s+(?:to\s+)?(?:my\s+)?(.+)/i,
  /pair\s+(?:with\s+)?(?:my\s+)?(.+)/i,
  /link\s+(?:to\s+)?(?:my\s+)?(.+)/i,
  /hook\s+(?:up\s+)?(?:to\s+)?(?:my\s+)?(.+)/i,
];

const DISCONNECT_PATTERNS = [
  /disconnect\s+(?:from\s+)?(?:my\s+)?(.+)/i,
  /unpair\s+(?:from\s+)?(?:my\s+)?(.+)/i,
  /drop\s+(?:connection\s+(?:to\s+)?)?(?:my\s+)?(.+)/i,
];

const SCAN_PATTERNS = [
  /scan\s+(?:for\s+)?(?:nearby\s+)?(?:devices|bluetooth)/i,
  /find\s+(?:nearby\s+)?(?:devices|bluetooth)/i,
  /search\s+(?:for\s+)?(?:devices|bluetooth)/i,
  /look\s+(?:for\s+)?(?:nearby\s+)?devices/i,
];

const STATUS_PATTERNS = [
  /(?:what(?:'s|\s+is)\s+)?(?:the\s+)?status\s+(?:of\s+)?(?:my\s+)?(.+)/i,
  /(?:check|show)\s+(?:my\s+)?(?:device|connection)s?\s*(?:status)?/i,
  /(?:how(?:'s|\s+is)\s+)?(?:my\s+)?(.+?)\s+doing/i,
];

const CONVERSATION_PATTERNS = [
  /(?:continue|move|switch|start|open)\s+(?:this\s+)?(?:conversation|chat|voice|talk)\s+(?:on|in|to|through)\s+(?:my\s+)?(.+)/i,
  /(?:talk|speak)\s+(?:to\s+me\s+)?(?:through|in|on)\s+(?:my\s+)?(.+)/i,
  /(?:use|activate)\s+(?:my\s+)?(.+?)\s+(?:for\s+)?(?:voice|conversation|hands free|hands-free)/i,
];

const CONTEXT_PATTERNS = [
  /(?:what\s+do\s+you\s+see|read\s+(?:the\s+)?context|what(?:'s|\s+is)\s+around\s+me)\s*(?:through|from|on|in)?\s*(?:my\s+)?(.+)?/i,
  /(?:check|read|pull)\s+(?:my\s+)?(.+?)\s+(?:telemetry|context|scene|feed|sensors)/i,
];

const MONITOR_PATTERNS = [
  /(?:start\s+)?monitor(?:ing)?\s+(?:my\s+)?(.+)/i,
  /(?:start\s+)?track(?:ing)?\s+(?:my\s+)?(.+)/i,
  /(?:watch|read)\s+(?:my\s+)?(.+)/i,
];

// Map spoken device categories to search terms
const DEVICE_ALIASES: Record<string, string[]> = {
  glasses: ['glasses', 'glass', 'smart glasses', 'ray-ban', 'xreal', 'vuzix', 'meta'],
  vr: ['vr', 'headset', 'quest', 'vision pro', 'xr', 'virtual reality', 'mixed reality'],
  car: ['car', 'vehicle', 'auto', 'tesla', 'obd', 'elm327'],
  home: ['home', 'house', 'smart home', 'thermostat', 'light', 'lock', 'door', 'nest', 'hue', 'ring'],
  watch: ['watch', 'fitbit', 'garmin', 'apple watch', 'galaxy watch', 'band'],
  headphones: ['headphones', 'earbuds', 'airpods', 'buds', 'earphones'],
  speaker: ['speaker', 'sonos', 'echo', 'alexa', 'homepod'],
  phone: ['phone', 'iphone', 'android', 'pixel', 'galaxy'],
  all: ['all', 'everything', 'all devices', 'all my devices', 'every device'],
};

function inferConversationMode(raw: string): DeviceCommand['mode'] {
  const lower = raw.toLowerCase();
  if (lower.includes('ambient')) return 'ambient';
  if (lower.includes('meeting')) return 'meeting';
  if (lower.includes('navigation') || lower.includes('driving')) return 'navigation';
  if (lower.includes('push to talk')) return 'push_to_talk';
  return 'hands_free';
}

function normalizeTarget(raw: string): string {
  const cleaned = raw.replace(/[.,!?]/g, '').trim().toLowerCase();
  for (const [category, aliases] of Object.entries(DEVICE_ALIASES)) {
    if (aliases.some(a => cleaned.includes(a))) return category;
  }
  return cleaned;
}

function parseCommand(text: string): DeviceCommand | null {
  const lower = text.toLowerCase().trim();

  // Scan
  for (const p of SCAN_PATTERNS) {
    if (p.test(lower)) return { type: 'scan', target: 'all', raw: text };
  }

  // Connect
  for (const p of CONNECT_PATTERNS) {
    const m = lower.match(p);
    if (m) return { type: 'connect', target: normalizeTarget(m[1]), raw: text };
  }

  // Disconnect
  for (const p of DISCONNECT_PATTERNS) {
    const m = lower.match(p);
    if (m) return { type: 'disconnect', target: normalizeTarget(m[1]), raw: text };
  }

  // Monitor
  for (const p of MONITOR_PATTERNS) {
    const m = lower.match(p);
    if (m) return { type: 'monitor', target: normalizeTarget(m[1]), raw: text };
  }

  // Conversation endpoint handoff
  for (const p of CONVERSATION_PATTERNS) {
    const m = lower.match(p);
    if (m) return { type: 'conversation', target: normalizeTarget(m[1]), raw: text, mode: inferConversationMode(text) };
  }

  // Context reading from smart glasses, VR, vehicles, etc.
  for (const p of CONTEXT_PATTERNS) {
    const m = lower.match(p);
    if (m) {
      const t = m[1] || 'glasses';
      return { type: 'context', target: normalizeTarget(t), raw: text };
    }
  }

  // Status
  for (const p of STATUS_PATTERNS) {
    const m = lower.match(p);
    if (m) {
      const t = m[1] || 'all';
      return { type: 'status', target: normalizeTarget(t), raw: text };
    }
  }

  return null;
}

export function useVoiceCommands() {
  const parse = useCallback((text: string): DeviceCommand | null => {
    return parseCommand(text);
  }, []);

  return { parseCommand: parse };
}
