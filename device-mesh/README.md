# CLRK Device Mesh

CLRK Device Mesh is the universal endpoint framework for smart glasses, VR/XR headsets, vehicles, wearables, smart-home devices, audio devices, phones, and robot runtimes.

The goal is simple: every device becomes a CLRK conversation endpoint and tool surface.

## What It Provides

- One device registry across Bluetooth, Wi-Fi/LAN, Matter, HomeKit, vehicle bridges, XR bridges, and robot runtimes.
- Persistent conversation sessions per device.
- Verbal command parsing for connection, status, context, and mode changes.
- Context readers for glasses camera summaries, VR scene state, vehicle telemetry, wearable readings, smart-home state, and robot status.
- Safety gates for high-risk commands such as vehicle actions, locks, doors, and robot motion.

## Device Categories

- `smart_glasses`: Ray-Ban Meta, XREAL, Vuzix, Brilliant Labs, future camera glasses.
- `vr_headset`: Meta Quest, Apple Vision Pro, SteamVR/OpenXR devices.
- `vehicle`: Tesla, OBD-II bridge, Android Auto/CarPlay-adjacent bridges, fleet APIs.
- `wearable`: Apple Watch, Garmin, Fitbit, Galaxy Watch, rings.
- `smart_home`: Matter, HomeKit, Hue, Nest, Ring, locks, thermostats.
- `robot`: CLRK robot runtime and future hardware agents.
- `phone`: local mobile app endpoint.
- `audio`: earbuds, headphones, speakers.

## Install

```bash
cd device-mesh
npm install
npm run build
cp .env.example .env
npm start
```

The included runtime uses mock adapters so it is safe to run without hardware.

## Adapter Contract

Implement `DeviceAdapter` for each hardware family. Keep vendor SDKs inside adapters; keep CLRK protocol and safety in the mesh.

```ts
import type { DeviceAdapter } from "@clrk/device-mesh";

export class MyGlassesAdapter implements DeviceAdapter {
  // scan, connect, status, startConversation, stopConversation, readContext, command
}
```

## Conversation Continuity

Each device can hold a `conversationSessionId`. When CLRK moves from phone to glasses to vehicle, the same user intent can continue:

1. User says: "Hey CLRK, continue this in my glasses."
2. Mesh starts a `hands_free` conversation on the glasses.
3. CLRK receives device context and uses `smart_device_*` tools.
4. Summaries remain in CLRK's cloud memory while the device runtime owns audio/video IO.

## Safety Defaults

- Vehicles default to telemetry-only.
- Ambient listening defaults off.
- Door/lock/vehicle/robot commands require explicit adapter approval.
- Emergency stop remains local for robots and vehicles.
