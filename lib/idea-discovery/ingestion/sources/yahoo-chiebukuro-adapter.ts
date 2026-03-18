/**
 * Yahoo Chiebukuro Adapter (chiebukuro.yahoo.co.jp)
 *
 * Fetches Q&A from Yahoo Chiebukuro (Japanese Q&A platform).
 * Yahoo Chiebukuro lacks official public API.
 * This adapter demonstrates how to handle closed platforms.
 *
 * Status: Placeholder
 * To implement, consider:
 *   - Selenium/Puppeteer for JavaScript rendering
 *   - Respecting robots.txt and rate limits
 *   - Caching to minimize requests
 */

import { DataSourceAdapter } from "../data-source-adapter";
import type { DataSourceConfig, RawIdea } from "../../core/types";

export class YahooChiebukuroAdapter extends DataSourceAdapter {
  constructor(config: DataSourceConfig) {
    super(config);
  }

  protected async fetchIdeas(): Promise<RawIdea[]> {
    // Yahoo Chiebukuro has no official API and uses JavaScript rendering.
    // Implementing requires heavy machinery; returning empty for now.
    console.warn(
      "[Yahoo Chiebukuro] Adapter not implemented. " +
        "Requires browser automation (Puppeteer) and careful rate limiting."
    );

    return [];
  }
}
