export type DeviceCategory =
  | "smart_glasses"
  | "vr_headset"
  | "vehicle"
  | "wearable"
  | "smart_home"
  | "robot"
  | "phone"
  | "audio";

export type DeviceTransport =
  | "bluetooth"
  | "wifi"
  | "matter"
  | "homekit"
  | "vehicle_bridge"
  | "xr_bridge"
  | "robot_runtime"
  | "app_bridge";

export type ConversationMode = "hands_free" | "push_to_talk" | "ambient" | "meeting" | "navigation";

export interface MeshDevice {
  id: string;
  name: string;
  category: DeviceCategory;
  transport: DeviceTransport;
  connected: boolean;
  conversationActive: boolean;
  conversationSessionId?: string;
  capabilities: string[];
  lastSeenAt: string;
  metadata?: Record<string, unknown>;
}

export interface DeviceContext {
  deviceId: string;
  category: DeviceCategory;
  timestamp: string;
  signals: Record<string, unknown>;
}

export interface DeviceCommandResult {
  ok: boolean;
  summary: string;
  data?: unknown;
}

export interface DeviceAdapter {
  readonly id: string;
  readonly category: DeviceCategory;
  scan(): Promise<MeshDevice[]>;
  connect(deviceId: string): Promise<MeshDevice>;
  disconnect(deviceId: string): Promise<{ disconnected: boolean }>;
  status(deviceId?: string): Promise<MeshDevice[]>;
  startConversation(deviceId: string, mode: ConversationMode): Promise<{ sessionId: string; mode: ConversationMode }>;
  stopConversation(deviceId: string): Promise<{ stopped: boolean; summary?: string }>;
  readContext(deviceId: string, signals?: string[]): Promise<DeviceContext>;
  command(deviceId: string, command: string, args?: Record<string, unknown>): Promise<DeviceCommandResult>;
}

export interface VoiceDeviceIntent {
  action: "scan" | "connect" | "disconnect" | "status" | "start_conversation" | "stop_conversation" | "read_context" | "command";
  category?: DeviceCategory | "all";
  target?: string;
  mode?: ConversationMode;
  command?: string;
  raw: string;
}
