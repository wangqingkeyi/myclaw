export interface Plugin {
  name: string;
  setup(): Promise<void>;
}

export interface PluginManager {
  register(plugin: Plugin): void;
}

export const createPluginManager = (): PluginManager => {
  const plugins: Plugin[] = [];

  return {
    register(plugin) {
      plugins.push(plugin);
    }
  };
};
