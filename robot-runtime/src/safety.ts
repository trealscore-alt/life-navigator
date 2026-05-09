import type { ApprovalHandler, AutonomyLevel, ClientToolCall, RiskLevel, RobotStatus } from "./types.js";

export interface SafetyDecision {
  allowed: boolean;
  risk: RiskLevel;
  reason: string;
  requiresApproval: boolean;
}

export interface SafetyPolicyOptions {
  autonomyLevel: AutonomyLevel;
  requireMotionApproval: boolean;
  maxMoveDistanceM: number;
  maxTurnAngleDeg: number;
  sensorFreshnessMs: number;
}

const DEFAULT_OPTIONS: SafetyPolicyOptions = {
  autonomyLevel: "L1_drafting",
  requireMotionApproval: true,
  maxMoveDistanceM: 0.75,
  maxTurnAngleDeg: 45,
  sensorFreshnessMs: 10_000,
};

const AUTONOMY_RANK: Record<AutonomyLevel, number> = {
  L0_advisory: 0,
  L1_drafting: 1,
  L2_assisted: 2,
  L3_rule_based: 3,
  L4_delegated: 4,
  L5_ambient: 5,
};

export class SafetyPolicy {
  private readonly options: SafetyPolicyOptions;
  private readonly approve?: ApprovalHandler;

  constructor(options: Partial<SafetyPolicyOptions> = {}, approve?: ApprovalHandler) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.approve = approve;
  }

  async authorize(call: ClientToolCall, status: RobotStatus): Promise<SafetyDecision> {
    const decision = this.evaluate(call, status);
    if (!decision.allowed || !decision.requiresApproval) return decision;
    if (!this.approve) return { ...decision, allowed: false, reason: `${decision.reason} No approval handler is installed.` };

    const approved = await this.approve({ call, risk: decision.risk, reason: decision.reason });
    return approved ? { ...decision, allowed: true } : { ...decision, allowed: false, reason: "User denied approval." };
  }

  private evaluate(call: ClientToolCall, status: RobotStatus): SafetyDecision {
    if (call.name === "robot_stop") {
      return { allowed: true, risk: "none", reason: "Emergency stop is always allowed.", requiresApproval: false };
    }

    if (status.safety.emergencyStop) {
      return { allowed: false, risk: "critical", reason: "Robot emergency stop is active.", requiresApproval: false };
    }

    if (call.name === "robot_move_base") {
      return this.evaluateMotion(call, status);
    }

    if (call.name === "robot_say" || call.name === "robot_set_mode") {
      const requiresApproval = AUTONOMY_RANK[this.options.autonomyLevel] < 2;
      return { allowed: !requiresApproval, risk: "medium", reason: "Embodied output changes the user's environment.", requiresApproval };
    }

    return { allowed: true, risk: "low", reason: "Read-only or low-risk robot tool.", requiresApproval: false };
  }

  private evaluateMotion(call: ClientToolCall, status: RobotStatus): SafetyDecision {
    const distance = Number(call.input.distance_m ?? 0);
    const angle = Number(call.input.angle_deg ?? 0);

    if (!status.safety.lastSensorReadAt) {
      return {
        allowed: false,
        risk: "high",
        reason: "Motion denied because sensors have not been read yet.",
        requiresApproval: false,
      };
    }

    const sensorAge = Date.now() - Date.parse(status.safety.lastSensorReadAt);
    if (sensorAge > this.options.sensorFreshnessMs) {
      return {
        allowed: false,
        risk: "high",
        reason: "Motion denied because sensor data is stale.",
        requiresApproval: false,
      };
    }

    if (Math.abs(distance) > this.options.maxMoveDistanceM) {
      return {
        allowed: false,
        risk: "high",
        reason: `Motion distance ${distance}m exceeds local limit ${this.options.maxMoveDistanceM}m.`,
        requiresApproval: false,
      };
    }

    if (Math.abs(angle) > this.options.maxTurnAngleDeg) {
      return {
        allowed: false,
        risk: "high",
        reason: `Turn angle ${angle}deg exceeds local limit ${this.options.maxTurnAngleDeg}deg.`,
        requiresApproval: false,
      };
    }

    const requiresApproval = this.options.requireMotionApproval || AUTONOMY_RANK[this.options.autonomyLevel] < 4;
    return {
      allowed: !requiresApproval,
      risk: "high",
      reason: "Base motion is physical-world actuation.",
      requiresApproval,
    };
  }
}
