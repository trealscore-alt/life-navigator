import { useCallback, useRef } from 'react';
import { toast } from 'sonner';

export interface DeviceCommand {
  type: 'connect' | 'disconnect' | 'scan' | 'status' | 'monitor';
  target: string; // 'glasses', 'car', 'home', 'all', specific device name
  raw: string;
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

const MONITOR_PATTERNS = [
  /(?:start\s+)?monitor(?:ing)?\s+(?:my\s+)?(.+)/i,
  /(?:start\s+)?track(?:ing)?\s+(?:my\s+)?(.+)/i,
  /(?:watch|read)\s+(?:my\s+)?(.+)/i,
];

// Map spoken device categories to search terms
const DEVICE_ALIASES: Record<string, string[]> = {
  glasses: ['glasses', 'glass', 'smart glasses', 'ray-ban', 'xreal', 'vuzix', 'meta'],
  car: ['car', 'vehicle', 'auto', 'tesla', 'obd', 'elm327'],
  home: ['home', 'house', 'smart home', 'thermostat', 'light', 'lock', 'door', 'nest', 'hue', 'ring'],
  watch: ['watch', 'fitbit', 'garmin', 'apple watch', 'galaxy watch', 'band'],
  headphones: ['headphones', 'earbuds', 'airpods', 'buds', 'earphones'],
  speaker: ['speaker', 'sonos', 'echo', 'alexa', 'homepod'],
  phone: ['phone', 'iphone', 'android', 'pixel', 'galaxy'],
  all: ['all', 'everything', 'all devices', 'all my devices', 'every device'],
};

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
