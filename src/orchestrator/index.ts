import type { ChannelDefinition } from "../channels/index.js";
import type { EventBus } from "../event-bus/index.js";
import type { PermissionEngine } from "../permissions/index.js";
import type { ToolDefinition } from "../tools/index.js";

export interface Orchestrator {
  start(): Promise<void>;
}

export interface OrchestratorModule {
  create(context: {
    eventBus: EventBus;
    permissions: PermissionEngine;
    channels: ChannelDefinition[];
    tools: ToolDefinition[];
  }): Orchestrator;
}

export const createOrchestratorModule = (): OrchestratorModule => ({
  create(_context) {
    return {
      async start() {
        // placeholder: message pipeline and agent orchestration
      }
    };
  }
});
