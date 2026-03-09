import type { AppConfig } from "../config/index.js";

export interface StorageModule {
  initialize(config: AppConfig): Promise<void>;
}

export const createStorageModule = (): StorageModule => ({
  async initialize(_config) {
    // placeholder: initialize sqlite connection, migrations, repositories
  }
});
