export interface SaasPlugin {
  name: string // 'notify' | 'billing' | 'auth' | 'analytics'
  version: string
  description?: string
  schema: {
    input: Record<string, unknown> // JSON Schema
    output: Record<string, unknown>
  }
  execute: (input: unknown) => Promise<unknown>
  requiresApproval?: boolean // 金銭操作は true
}

export const PLUGIN_REGISTRY: Record<string, SaasPlugin> = {}

export function registerPlugin(plugin: SaasPlugin): void {
  PLUGIN_REGISTRY[plugin.name] = plugin
}

export function getPlugin(name: string): SaasPlugin | undefined {
  return PLUGIN_REGISTRY[name]
}

export function listPlugins(): Array<Omit<SaasPlugin, 'execute'>> {
  return Object.values(PLUGIN_REGISTRY).map(({ execute: _execute, ...rest }) => rest)
}
