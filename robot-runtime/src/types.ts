export type AutonomyLevel =
  | "L0_advisory"
  | "L1_drafting"
  | "L2_assisted"
  | "L3_rule_based"
  | "L4_delegated"
  | "L5_ambient";

export type RobotMode = "idle" | "observe" | "assist" | "dock";

export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";

export interface RobotPose {
  x?: number;
  y?: number;
  z?: number;
  yawDeg?: number;
  frame?: string;
}

export interface SensorReading {
  name: string;
  value: unknown;
  unit?: string;
  timestamp: string;
}

export interface RobotStatus {
  robotId: string;
  name: string;
  mode: RobotMode;
  batteryPct?: number;
  docked?: boolean;
  moving: boolean;
  pose?: RobotPose;
  capabilities: string[];
  safety: {
    emergencyStop: boolean;
    lastSensorReadAt?: string;
    notes?: string[];
  };
  sensors?: SensorReading[];
}

export interface MoveBaseInput {
  direction: "forward" | "backward" | "left" | "right" | "turn_left" | "turn_right";
  distance_m?: number;
  angle_deg?: number;
  speed?: "crawl" | "slow" | "normal";
}

export interface RobotAdapter {
  status(): Promise<RobotStatus>;
  say(input: { text: string; voice?: string }): Promise<{ spoken: string }>;
  readSensors(input?: { sensors?: string[] }): Promise<{ readings: SensorReading[] }>;
  captureImage(input?: { camera?: string }): Promise<{ imageBase64?: string; reference?: string; mediaType?: string }>;
  moveBase(input: MoveBaseInput): Promise<{ ok: boolean; summary: string }>;
  stop(): Promise<{ stopped: boolean }>;
  setMode(input: { mode: RobotMode }): Promise<{ mode: RobotMode }>;
}

export interface AgentContentBlock {
  type: "text" | "tool_use" | "tool_result" | "image";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
  source?: { type: "base64"; media_type: string; data: string };
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string | AgentContentBlock[];
}

export interface ClientToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ClientToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface AgentTurnResponse {
  done: boolean;
  messages: AgentMessage[];
  finalText?: string;
  pendingClientCalls?: ClientToolCall[];
  provider?: string;
  model?: string;
  steps_used?: number;
}

export interface AgentTransport {
  runTurn(input: {
    messages: AgentMessage[];
    conversationId?: string;
    clientToolResults?: ClientToolResult[];
    robotState?: RobotStatus;
  }): Promise<AgentTurnResponse>;
}

export interface ApprovalRequest {
  call: ClientToolCall;
  risk: RiskLevel;
  reason: string;
}

export type ApprovalHandler = (request: ApprovalRequest) => Promise<boolean>;
