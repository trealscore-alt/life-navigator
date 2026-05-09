import type {
  ConversationMode,
  DeviceAdapter,
  DeviceCategory,
  DeviceCommandResult,
  DeviceContext,
  DeviceTransport,
  MeshDevice,
} from "./types.js";

export class MockDeviceAdapter implements DeviceAdapter {
  readonly id: string;
  readonly category: DeviceCategory;
  private readonly transport: DeviceTransport;
  private devices: MeshDevice[];

  constructor(input: { id: string; category: DeviceCategory; transport: DeviceTransport; devices: Array<Omit<MeshDevice, "category" | "transport" | "connected" | "conversationActive" | "lastSeenAt">> }) {
    this.id = input.id;
    this.category = input.category;
    this.transport = input.transport;
    this.devices = input.devices.map((device) => ({
      ...device,
      category: input.category,
      transport: input.transport,
      connected: false,
      conversationActive: false,
      lastSeenAt: new Date().toISOString(),
    }));
  }

  async scan(): Promise<MeshDevice[]> {
    this.touch();
    return this.devices;
  }

  async connect(deviceId: string): Promise<MeshDevice> {
    const device = this.find(deviceId);
    device.connected = true;
    device.lastSeenAt = new Date().toISOString();
    return device;
  }

  async disconnect(deviceId: string): Promise<{ disconnected: boolean }> {
    const device = this.find(deviceId);
    device.connected = false;
    device.conversationActive = false;
    return { disconnected: true };
  }

  async status(deviceId?: string): Promise<MeshDevice[]> {
    this.touch();
    return deviceId ? [this.find(deviceId)] : this.devices;
  }

  async startConversation(deviceId: string, mode: ConversationMode): Promise<{ sessionId: string; mode: ConversationMode }> {
    const device = this.find(deviceId);
    device.connected = true;
    device.conversationActive = true;
    device.conversationSessionId = device.conversationSessionId || crypto.randomUUID();
    device.metadata = { ...(device.metadata || {}), conversationMode: mode };
    return { sessionId: device.conversationSessionId, mode };
  }

  async stopConversation(deviceId: string): Promise<{ stopped: boolean; summary: string }> {
    const device = this.find(deviceId);
    device.conversationActive = false;
    return { stopped: true, summary: `Stopped ${device.name} conversation endpoint.` };
  }

  async readContext(deviceId: string, signals?: string[]): Promise<DeviceContext> {
    const device = this.find(deviceId);
    return {
      deviceId,
      category: device.category,
      timestamp: new Date().toISOString(),
      signals: this.mockSignals(device.category, signals),
    };
  }

  async command(deviceId: string, command: string, args?: Record<string, unknown>): Promise<DeviceCommandResult> {
    const device = this.find(deviceId);
    return { ok: true, summary: `${device.name} accepted command ${command}.`, data: args || {} };
  }

  private find(deviceId: string): MeshDevice {
    const device = this.devices.find((item) => item.id === deviceId);
    if (!device) throw new Error(`Unknown device ${deviceId}`);
    return device;
  }

  private touch() {
    const now = new Date().toISOString();
    this.devices = this.devices.map((device) => ({ ...device, lastSeenAt: now }));
  }

  private mockSignals(category: DeviceCategory, requested?: string[]): Record<string, unknown> {
    const base: Record<DeviceCategory, Record<string, unknown>> = {
      smart_glasses: { cameraSummary: "Forward view available", displayRoute: "monocular_overlay", microphone: "ready" },
      vr_headset: { scene: "home_space", controllers: 2, passthrough: true },
      vehicle: { speedMph: 0, batteryPct: 78, doorsLocked: true, location: "parked" },
      wearable: { heartRate: 72, stepsToday: 4200, batteryPct: 64 },
      smart_home: { occupancy: "home", lightsOn: 3, thermostatF: 71, doorsLocked: true },
      robot: { mode: "idle", batteryPct: 87, moving: false },
      phone: { batteryPct: 81, network: "wifi", audioRoute: "speaker" },
      audio: { connected: true, batteryPct: 93, microphone: "ready" },
    };
    const signals = base[category];
    if (!requested || requested.length === 0) return signals;
    return Object.fromEntries(Object.entries(signals).filter(([key]) => requested.includes(key)));
  }
}

export function createDefaultMockAdapters(): DeviceAdapter[] {
  return [
    new MockDeviceAdapter({
      id: "mock-glasses",
      category: "smart_glasses",
      transport: "xr_bridge",
      devices: [{ id: "glasses-01", name: "CLRK Smart Glasses", capabilities: ["display_text", "capture_image", "microphone", "speaker"] }],
    }),
    new MockDeviceAdapter({
      id: "mock-vr",
      category: "vr_headset",
      transport: "xr_bridge",
      devices: [{ id: "vr-01", name: "CLRK VR Headset", capabilities: ["spatial_overlay", "scene_context", "voice"] }],
    }),
    new MockDeviceAdapter({
      id: "mock-vehicle",
      category: "vehicle",
      transport: "vehicle_bridge",
      devices: [{ id: "vehicle-01", name: "Personal Vehicle Bridge", capabilities: ["telemetry", "navigation_context", "cabin_voice"] }],
    }),
    new MockDeviceAdapter({
      id: "mock-home",
      category: "smart_home",
      transport: "matter",
      devices: [{ id: "home-01", name: "Home Matter Network", capabilities: ["lights", "thermostat", "locks", "occupancy"] }],
    }),
  ];
}
