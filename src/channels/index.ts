import type { AppConfig } from "../config/index.js";

export interface ChannelDefinition {
  name: string;
}

export interface ChannelsModule {
  scan(context: { config: AppConfig }): Promise<ChannelDefinition[]>;
}

export const createChannelsModule = (): ChannelsModule => ({
  async scan(_context) {
    return [];
  }
});
