export interface AppConfig {
  appName: string;
  environment: "development" | "production" | "test";
}

export interface ConfigModule {
  load(): Promise<AppConfig>;
}

export const createConfigModule = (): ConfigModule => ({
  async load() {
    return {
      appName: "myclaw",
      environment: "development"
    };
  }
});
