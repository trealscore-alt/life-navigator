import { SafetyPolicy } from "./safety.js";
import type {
  AgentMessage,
  AgentTransport,
  ClientToolCall,
  ClientToolResult,
  MoveBaseInput,
  RobotAdapter,
  RobotMode,
} from "./types.js";

export interface HyperAgentKernelOptions {
  adapter: RobotAdapter;
  transport: AgentTransport;
  safety: SafetyPolicy;
  conversationId?: string;
  maxToolRounds?: number;
}

export class HyperAgentKernel {
  private readonly adapter: RobotAdapter;
  private readonly transport: AgentTransport;
  private readonly safety: SafetyPolicy;
  private readonly conversationId?: string;
  private readonly maxToolRounds: number;

  constructor(options: HyperAgentKernelOptions) {
    this.adapter = options.adapter;
    this.transport = options.transport;
    this.safety = options.safety;
    this.conversationId = options.conversationId;
    this.maxToolRounds = options.maxToolRounds ?? 8;
  }

  async sendUserText(text: string): Promise<string> {
    const status = await this.adapter.status();
    let messages: AgentMessage[] = [{
      role: "user",
      content: this.buildRobotUserMessage(text, status.capabilities),
    }];
    let clientToolResults: ClientToolResult[] | undefined;

    for (let round = 0; round < this.maxToolRounds; round++) {
      const robotState = await this.adapter.status();
      const response = await this.transport.runTurn({
        messages,
        conversationId: this.conversationId,
        clientToolResults,
        robotState,
      });

      messages = response.messages;
      clientToolResults = undefined;

      if (response.done) return response.finalText ?? "";

      const calls = response.pendingClientCalls ?? [];
      if (calls.length === 0) return "";

      clientToolResults = [];
      for (const call of calls) {
        clientToolResults.push(await this.executeToolCall(call));
      }
    }

    await this.adapter.stop();
    return "I stopped because the robot tool loop reached its local safety limit.";
  }

  async executeToolCall(call: ClientToolCall): Promise<ClientToolResult> {
    try {
      if (!call.name.startsWith("robot_")) {
        return {
          tool_use_id: call.id,
          is_error: true,
          content: JSON.stringify({ error: `Robot runtime cannot execute non-robot tool ${call.name}` }),
        };
      }

      const status = await this.adapter.status();
      const decision = await this.safety.authorize(call, status);
      if (!decision.allowed) {
        if (call.name !== "robot_stop") await this.adapter.stop();
        return {
          tool_use_id: call.id,
          is_error: true,
          content: JSON.stringify({ error: decision.reason, risk: decision.risk }),
        };
      }

      const result = await this.dispatchRobotTool(call);
      return { tool_use_id: call.id, content: JSON.stringify(result) };
    } catch (err) {
      await this.adapter.stop().catch(() => undefined);
      return {
        tool_use_id: call.id,
        is_error: true,
        content: JSON.stringify({ error: err instanceof Error ? err.message : "Unknown robot runtime error" }),
      };
    }
  }

  private async dispatchRobotTool(call: ClientToolCall): Promise<unknown> {
    switch (call.name) {
      case "robot_status":
        return this.adapter.status();
      case "robot_say":
        return this.adapter.say({
          text: String(call.input.text ?? ""),
          voice: call.input.voice ? String(call.input.voice) : undefined,
        });
      case "robot_read_sensors":
        return this.adapter.readSensors({
          sensors: Array.isArray(call.input.sensors) ? call.input.sensors.map(String) : undefined,
        });
      case "robot_capture_image":
        return this.adapter.captureImage({
          camera: call.input.camera ? String(call.input.camera) : undefined,
        });
      case "robot_move_base":
        return this.adapter.moveBase({
          direction: String(call.input.direction) as MoveBaseInput["direction"],
          distance_m: call.input.distance_m === undefined ? undefined : Number(call.input.distance_m),
          angle_deg: call.input.angle_deg === undefined ? undefined : Number(call.input.angle_deg),
          speed: call.input.speed ? String(call.input.speed) as MoveBaseInput["speed"] : "slow",
        });
      case "robot_stop":
        return this.adapter.stop();
      case "robot_set_mode":
        return this.adapter.setMode({ mode: String(call.input.mode) as RobotMode });
      default:
        throw new Error(`Unknown robot tool: ${call.name}`);
    }
  }

  private buildRobotUserMessage(text: string, capabilities: string[]): string {
    return [
      "You are connected to a personal robot through the CLRK Robot Hyper Agent Runtime.",
      "Use robot_* tools when embodied sensing or action is needed.",
      "Before movement, always call robot_status or robot_read_sensors.",
      "If safety is uncertain, call robot_stop and explain the blocker.",
      `Installed robot capabilities: ${capabilities.join(", ")}`,
      "",
      `User command: ${text}`,
    ].join("\n");
  }
}
