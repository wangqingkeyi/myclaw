import type { AppConfig } from "../config/index.js";
import type { EventBus } from "../event-bus/index.js";

export interface PermissionEngine {
  canExecute(toolName: string): Promise<boolean>;
}

export interface PermissionsModule {
  initialize(context: { config: AppConfig; eventBus: EventBus }): Promise<PermissionEngine>;
}

export const createPermissionsModule = (): PermissionsModule => ({
  async initialize(_context) {
    return {
      async canExecute(_toolName) {
        return true;
      }
    };
  }
});
