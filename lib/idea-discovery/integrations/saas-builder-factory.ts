/**
 * SaaS Builder Discovery Engine Factory
 *
 * Creates a fully configured IdeaDiscoveryEngine for SaaS Builder.
 * Wires together all adapters with sensible defaults.
 */

import { DiscoveryEngine } from "../engine";
import type { DiscoveryEngineConfig } from "../engine";
import { DEFAULT_DATA_SOURCE_CONFIGS } from "../core/constants";
import { SaaSBuilderTemplateAdapter } from "./saas-builder-template-adapter";
import { SaaSBuilderAiAdapter } from "./saas-builder-ai-adapter";
import { SaaSBuilderStorageAdapter } from "./saas-builder-storage-adapter";

/**
 * Create a fully configured IdeaDiscoveryEngine for SaaS Builder.
 *
 * This engine is ready to use with:
 * - Data sources: Twitter, Hatena, Qiita, Reddit, Note, Yahoo Chiebukuro
 * - AI: Gemini (quick filter) + Claude (deep analysis)
 * - Templates: SaaS Builder template catalog
 * - Storage: JSON files in data/idea-discovery/
 */
export function createSaaSBuilderDiscoveryEngine(options?: {
  dataDir?: string;
  maxIdeasPerRun?: number;
  dedupThreshold?: number;
  targetDomains?: string[];
}): DiscoveryEngine {
  const config: DiscoveryEngineConfig = {
    dataSourceConfigs: Object.values(DEFAULT_DATA_SOURCE_CONFIGS),
    provider: new SaaSBuilderAiAdapter(),
    templateCatalog: new SaaSBuilderTemplateAdapter(),
    storage: new SaaSBuilderStorageAdapter(options?.dataDir),
    maxIdeasPerRun: options?.maxIdeasPerRun || 500,
    dedupThreshold: options?.dedupThreshold || 0.75,
    targetDomains: options?.targetDomains || [
      "membership",
      "crm",
      "reservation",
      "community",
      "admin",
    ],
  };

  return new DiscoveryEngine(config);
}

/**
 * Export adapters for direct use if needed.
 */
export { SaaSBuilderTemplateAdapter };
export { SaaSBuilderAiAdapter };
export { SaaSBuilderStorageAdapter };
