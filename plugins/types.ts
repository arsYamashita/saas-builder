/**
 * Plugin interface for saas-builder
 * All first-party modules (auth, billing, notifications) and third-party
 * extensions implement this contract.
 */

export interface PluginConfig {
  [key: string]: unknown;
}

export interface Plugin {
  /** Unique plugin identifier (e.g. "auth", "billing") */
  name: string;
  /** Semantic version string */
  version: string;
  /** Called once at app startup with plugin-specific config */
  init(config?: PluginConfig): Promise<void>;
  /** Optional teardown for graceful shutdown */
  teardown?(): Promise<void>;
}

export interface PluginMeta {
  name: string;
  version: string;
  initializedAt: Date;
}
