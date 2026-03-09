import { createChannelsModule } from "./channels/index.js";
import { createConfigModule } from "./config/index.js";
import { createEventBusModule } from "./event-bus/index.js";
import { createOrchestratorModule } from "./orchestrator/index.js";
import { createPermissionsModule } from "./permissions/index.js";
import { createStorageModule } from "./storage/index.js";
import { createToolsModule } from "./tools/index.js";

export interface Application {
  start(): Promise<void>;
}

export const createApplication = (): Application => ({
  async start() {
    const configModule = createConfigModule();
    const storageModule = createStorageModule();
    const eventBusModule = createEventBusModule();
    const permissionsModule = createPermissionsModule();
    const toolsModule = createToolsModule();
    const channelsModule = createChannelsModule();
    const orchestratorModule = createOrchestratorModule();

    // Startup order:
    // 1) config -> 2) storage -> 3) event bus ->
    // 4) permissions -> 5) tool/channel scan -> 6) orchestrator
    const config = await configModule.load();
    await storageModule.initialize(config);

    const eventBus = eventBusModule.createBus();
    const permissions = await permissionsModule.initialize({ config, eventBus });

    const [tools, channels] = await Promise.all([
      toolsModule.scan({ config, permissions }),
      channelsModule.scan({ config })
    ]);

    const orchestrator = orchestratorModule.create({
      eventBus,
      permissions,
      channels,
      tools
    });

    await orchestrator.start();
  }
});

const app = createApplication();

void app.start();
