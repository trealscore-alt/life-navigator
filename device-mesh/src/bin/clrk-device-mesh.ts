#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { DeviceMesh } from "../mesh.js";
import { createDefaultMockAdapters } from "../mockAdapters.js";
import { parseVoiceDeviceIntent } from "../voiceIntent.js";

const rl = createInterface({ input, output });
const mesh = new DeviceMesh({ adapters: createDefaultMockAdapters() });

console.log("CLRK Device Mesh online.");
console.log("Try: scan for smart glasses, connect glasses, continue conversation in my glasses, vehicle telemetry");

while (true) {
  const text = await rl.question("> ");
  if (["exit", "quit"].includes(text.trim().toLowerCase())) break;
  const intent = parseVoiceDeviceIntent(text);
  if (!intent) {
    console.log("No device intent detected.");
    continue;
  }

  if (intent.action === "scan") {
    console.log(JSON.stringify(await mesh.scan(intent.category || "all"), null, 2));
  } else if (intent.action === "status") {
    console.log(JSON.stringify(await mesh.status(), null, 2));
  } else if (intent.action === "read_context") {
    const devices = await mesh.scan(intent.category || "all");
    if (!devices[0]) console.log("No device found.");
    else console.log(JSON.stringify(await mesh.readContext(devices[0].id), null, 2));
  } else if (intent.action === "start_conversation") {
    const devices = await mesh.scan(intent.category || "all");
    if (!devices[0]) console.log("No device found.");
    else console.log(JSON.stringify(await mesh.startConversation(devices[0].id, intent.mode || "hands_free"), null, 2));
  } else {
    console.log(`Intent parsed: ${JSON.stringify(intent, null, 2)}`);
  }
}

rl.close();
