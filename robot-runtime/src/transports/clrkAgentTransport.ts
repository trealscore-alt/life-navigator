import type { AgentMessage, AgentTransport, AgentTurnResponse, ClientToolResult, RobotStatus } from "../types.js";

export interface ClrkAgentTransportOptions {
  supabaseUrl: string;
  accessToken: string;
  conversationId?: string;
  voiceMode?: boolean;
}

export class ClrkAgentTransport implements AgentTransport {
  private readonly options: ClrkAgentTransportOptions;

  constructor(options: ClrkAgentTransportOptions) {
    this.options = options;
  }

  async runTurn(input: {
    messages: AgentMessage[];
    conversationId?: string;
    clientToolResults?: ClientToolResult[];
    robotState?: RobotStatus;
  }): Promise<AgentTurnResponse> {
    const response = await fetch(`${this.options.supabaseUrl}/functions/v1/clrk-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.accessToken}`,
      },
      body: JSON.stringify({
        messages: [
          ...input.messages,
          ...(input.robotState
            ? [{
                role: "user",
                content: `ROBOT_RUNTIME_STATE\n${JSON.stringify(input.robotState, null, 2)}`,
              } satisfies AgentMessage]
            : []),
        ],
        conversationId: input.conversationId ?? this.options.conversationId,
        voiceMode: this.options.voiceMode ?? true,
        clientToolResults: input.clientToolResults,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `CLRK agent returned ${response.status}`);
    }

    return (await response.json()) as AgentTurnResponse;
  }
}
