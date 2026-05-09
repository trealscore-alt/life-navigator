import type { ConversationMode, DeviceCategory, VoiceDeviceIntent } from "./types.js";

const CATEGORY_ALIASES: Record<DeviceCategory | "all", string[]> = {
  all: ["all", "everything", "all devices", "every device", "nearby devices"],
  smart_glasses: ["glasses", "smart glasses", "ray ban", "ray-ban", "xreal", "vuzix", "vision glasses"],
  vr_headset: ["vr", "headset", "quest", "vision pro", "xr", "virtual reality"],
  vehicle: ["car", "vehicle", "truck", "tesla", "obd", "garage car"],
  wearable: ["watch", "ring", "wearable", "fitbit", "garmin", "apple watch"],
  smart_home: ["home", "house", "lights", "thermostat", "lock", "door", "matter", "homekit"],
  robot: ["robot", "bot", "personal robot"],
  phone: ["phone", "iphone", "android", "mobile"],
  audio: ["earbuds", "headphones", "speaker", "airpods", "audio"],
};

function categoryFromText(text: string): DeviceCategory | "all" | undefined {
  const lower = text.toLowerCase();
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((alias) => lower.includes(alias))) return category as DeviceCategory | "all";
  }
  return undefined;
}

function modeFromText(text: string): ConversationMode {
  const lower = text.toLowerCase();
  if (lower.includes("ambient")) return "ambient";
  if (lower.includes("meeting")) return "meeting";
  if (lower.includes("navigation") || lower.includes("driving")) return "navigation";
  if (lower.includes("push to talk")) return "push_to_talk";
  return "hands_free";
}

export function parseVoiceDeviceIntent(text: string): VoiceDeviceIntent | null {
  const lower = text.toLowerCase().trim();
  const category = categoryFromText(lower);

  if (/\b(scan|find|search|look for|discover)\b/.test(lower) && /\b(device|devices|bluetooth|glasses|headset|car|vehicle|home|robot)\b/.test(lower)) {
    return { action: "scan", category: category || "all", raw: text };
  }

  if (/\b(connect|pair|link|sync)\b/.test(lower)) {
    return { action: "connect", category, target: text, raw: text };
  }

  if (/\b(disconnect|unpair|unlink)\b/.test(lower)) {
    return { action: "disconnect", category, target: text, raw: text };
  }

  if (/\b(status|how.*doing|check)\b/.test(lower) && category) {
    return { action: "status", category, target: text, raw: text };
  }

  if (/\b(continue|start|open|move|switch)\b/.test(lower) && /\b(conversation|talk|voice|chat)\b/.test(lower)) {
    return { action: "start_conversation", category, target: text, mode: modeFromText(lower), raw: text };
  }

  if (/\b(stop|end|close)\b/.test(lower) && /\b(conversation|talk|voice|chat)\b/.test(lower)) {
    return { action: "stop_conversation", category, target: text, raw: text };
  }

  if (/\b(what do you see|read context|what.*around|vehicle telemetry|car telemetry|scene)\b/.test(lower)) {
    return { action: "read_context", category, target: text, raw: text };
  }

  return null;
}
