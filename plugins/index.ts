import type { Plugin, PluginConfig, PluginMeta } from "./types";

/**
 * Central registry for all saas-builder plugins.
 * Usage:
 *   import { registry } from "@/plugins";
 *   await registry.register(myPlugin, config);
 *   const plugin = registry.get("my-plugin");
 */
class PluginRegistry {
  private plugins = new Map<string, Plugin>();
  private meta = new Map<string, PluginMeta>();

  async register(plugin: Plugin, config?: PluginConfig): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[PluginRegistry] Plugin "${plugin.name}" is already registered. Skipping.`);
      return;
    }
    await plugin.init(config);
    this.plugins.set(plugin.name, plugin);
    this.meta.set(plugin.name, {
      name: plugin.name,
      version: plugin.version,
      initializedAt: new Date(),
    });
    console.log(`[PluginRegistry] Registered: ${plugin.name}@${plugin.version}`);
  }

  get<T extends Plugin = Plugin>(name: string): T {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`[PluginRegistry] Plugin "${name}" is not registered.`);
    }
    return plugin as T;
  }

  list(): PluginMeta[] {
    return Array.from(this.meta.values());
  }

  async teardownAll(): Promise<void> {
    for (const [name, plugin] of Array.from(this.plugins.entries())) {
      if (plugin.teardown) {
        await plugin.teardown();
        console.log(`[PluginRegistry] Torn down: ${name}`);
      }
    }
    this.plugins.clear();
    this.meta.clear();
  }
}

export const registry = new PluginRegistry();
export type { Plugin, PluginConfig, PluginMeta } from "./types";
