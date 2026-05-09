#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { MockRobotAdapter } from "../adapters/mockRobot.js";
import { HyperAgentKernel } from "../kernel.js";
import { SafetyPolicy } from "../safety.js";
import { ClrkAgentTransport } from "../transports/clrkAgentTransport.js";
import type { AutonomyLevel } from "../types.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const autonomyLevel = (process.env.CLRK_AUTONOMY_LEVEL || "L1_drafting") as AutonomyLevel;
const requireMotionApproval = process.env.CLRK_REQUIRE_MOTION_APPROVAL !== "false";

const rl = createInterface({ input, output });

const approve = async ({ call, risk, reason }: { call: { name: string; input: Record<string, unknown> }; risk: string; reason: string }) => {
  const answer = await rl.question(`Approve ${call.name} (${risk})? ${reason}\n${JSON.stringify(call.input)}\nType yes to approve: `);
  return answer.trim().toLowerCase() === "yes";
};

const adapter = new MockRobotAdapter(
  process.env.CLRK_ROBOT_ID || "clrk-robot-01",
  process.env.CLRK_ROBOT_NAME || "CLRK Robot",
);

const kernel = new HyperAgentKernel({
  adapter,
  transport: new ClrkAgentTransport({
    supabaseUrl: requireEnv("CLRK_SUPABASE_URL"),
    accessToken: requireEnv("CLRK_ACCESS_TOKEN"),
    conversationId: process.env.CLRK_CONVERSATION_ID || undefined,
    voiceMode: true,
  }),
  safety: new SafetyPolicy({ autonomyLevel, requireMotionApproval }, approve),
  conversationId: process.env.CLRK_CONVERSATION_ID || undefined,
});

console.log("CLRK Robot Hyper Agent Runtime online.");
console.log("Type a robot command. Type exit to stop.");

while (true) {
  const text = await rl.question("> ");
  if (["exit", "quit"].includes(text.trim().toLowerCase())) break;
  if (!text.trim()) continue;
  const reply = await kernel.sendUserText(text);
  console.log(`CLRK: ${reply}`);
}

await adapter.stop();
rl.close();
