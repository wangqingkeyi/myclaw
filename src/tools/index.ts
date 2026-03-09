import type { AppConfig } from "../config/index.js";
import type { PermissionEngine } from "../permissions/index.js";

export interface ToolDefinition {
  name: string;
  description: string;
}

export interface ToolsModule {
  scan(context: { config: AppConfig; permissions: PermissionEngine }): Promise<ToolDefinition[]>;
}

export const createToolsModule = (): ToolsModule => ({
  async scan(_context) {
    return [];
  }
});
