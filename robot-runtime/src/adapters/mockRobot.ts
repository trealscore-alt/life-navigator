import type { MoveBaseInput, RobotAdapter, RobotMode, RobotStatus, SensorReading } from "../types.js";

export class MockRobotAdapter implements RobotAdapter {
  private mode: RobotMode = "idle";
  private moving = false;
  private lastSensorReadAt: string | undefined;

  constructor(private readonly robotId: string, private readonly name: string) {}

  async status(): Promise<RobotStatus> {
    return {
      robotId: this.robotId,
      name: this.name,
      mode: this.mode,
      batteryPct: 87,
      docked: false,
      moving: this.moving,
      pose: { x: 0, y: 0, yawDeg: 0, frame: "map" },
      capabilities: [
        "robot_status",
        "robot_say",
        "robot_read_sensors",
        "robot_capture_image",
        "robot_move_base",
        "robot_stop",
        "robot_set_mode",
      ],
      safety: {
        emergencyStop: false,
        lastSensorReadAt: this.lastSensorReadAt,
        notes: ["Mock adapter: no hardware movement will occur."],
      },
      sensors: this.lastSensorReadAt ? this.makeReadings(this.lastSensorReadAt) : [],
    };
  }

  async say(input: { text: string }): Promise<{ spoken: string }> {
    console.log(`[robot:say] ${input.text}`);
    return { spoken: input.text };
  }

  async readSensors(): Promise<{ readings: SensorReading[] }> {
    this.lastSensorReadAt = new Date().toISOString();
    return { readings: this.makeReadings(this.lastSensorReadAt) };
  }

  async captureImage(): Promise<{ reference: string; mediaType: string }> {
    return { reference: "mock://camera/front/latest", mediaType: "image/jpeg" };
  }

  async moveBase(input: MoveBaseInput): Promise<{ ok: boolean; summary: string }> {
    this.moving = true;
    const summary = `Mock moved ${input.direction} ${input.distance_m ?? input.angle_deg ?? ""} at ${input.speed ?? "slow"} speed.`;
    console.log(`[robot:move] ${summary}`);
    this.moving = false;
    return { ok: true, summary };
  }

  async stop(): Promise<{ stopped: boolean }> {
    this.moving = false;
    console.log("[robot:stop] stopped");
    return { stopped: true };
  }

  async setMode(input: { mode: RobotMode }): Promise<{ mode: RobotMode }> {
    this.mode = input.mode;
    return { mode: this.mode };
  }

  private makeReadings(timestamp: string): SensorReading[] {
    return [
      { name: "battery", value: 87, unit: "%", timestamp },
      { name: "front_clearance", value: 1.8, unit: "m", timestamp },
      { name: "bumper", value: false, timestamp },
      { name: "ambient_noise", value: 41, unit: "dB", timestamp },
    ];
  }
}
