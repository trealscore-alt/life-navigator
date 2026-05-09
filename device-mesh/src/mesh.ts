import type { ConversationMode, DeviceAdapter, DeviceCategory, DeviceContext, MeshDevice } from "./types.js";

export interface DeviceMeshOptions {
  adapters: DeviceAdapter[];
}

export class DeviceMesh {
  private readonly adapters: DeviceAdapter[];

  constructor(options: DeviceMeshOptions) {
    this.adapters = options.adapters;
  }

  async scan(category: DeviceCategory | "all" = "all"): Promise<MeshDevice[]> {
    const adapters = this.adaptersFor(category);
    const results = await Promise.all(adapters.map((adapter) => adapter.scan()));
    return results.flat();
  }

  async connect(deviceId: string): Promise<MeshDevice> {
    return this.adapterForDevice(deviceId).connect(deviceId);
  }

  async disconnect(deviceId: string): Promise<{ disconnected: boolean }> {
    return this.adapterForDevice(deviceId).disconnect(deviceId);
  }

  async status(deviceId?: string): Promise<MeshDevice[]> {
    if (deviceId) return this.adapterForDevice(deviceId).status(deviceId);
    const results = await Promise.all(this.adapters.map((adapter) => adapter.status()));
    return results.flat();
  }

  async startConversation(deviceId: string, mode: ConversationMode): Promise<{ sessionId: string; mode: ConversationMode }> {
    return this.adapterForDevice(deviceId).startConversation(deviceId, mode);
  }

  async stopConversation(deviceId: string): Promise<{ stopped: boolean; summary?: string }> {
    return this.adapterForDevice(deviceId).stopConversation(deviceId);
  }

  async readContext(deviceId: string, signals?: string[]): Promise<DeviceContext> {
    return this.adapterForDevice(deviceId).readContext(deviceId, signals);
  }

  async command(deviceId: string, command: string, args?: Record<string, unknown>) {
    return this.adapterForDevice(deviceId).command(deviceId, command, args);
  }

  private adaptersFor(category: DeviceCategory | "all"): DeviceAdapter[] {
    return category === "all" ? this.adapters : this.adapters.filter((adapter) => adapter.category === category);
  }

  private adapterForDevice(deviceId: string): DeviceAdapter {
    const direct = this.adapters.find((adapter) => adapter.id === deviceId);
    if (direct) return direct;
    for (const adapter of this.adapters) {
      // Mock and most real adapters use category-specific id prefixes. Status
      // is async, so callers should connect using ids returned by scan/status.
      if (deviceId.startsWith(adapter.category.split("_")[0]) || deviceId.includes(adapter.category.split("_")[0])) {
        return adapter;
      }
    }
    const fallback = this.adapters[0];
    if (!fallback) throw new Error("No device adapters installed.");
    return fallback;
  }
}
