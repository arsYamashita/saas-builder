/**
 * Note Adapter (note.com)
 *
 * Fetches articles from note.com (Japanese creator platform).
 * Note.com does not have an official public API.
 * This adapter uses OGP parsing of public pages as a workaround.
 *
 * Limitations:
 *   - No official API; scraping may break with site changes
 *   - Rate limited to avoid overload
 *   - Limited metadata extraction
 */

import { DataSourceAdapter } from "../data-source-adapter";
import type { DataSourceConfig, RawIdea } from "../../core/types";

export class NoteAdapter extends DataSourceAdapter {
  constructor(config: DataSourceConfig) {
    super(config);
  }

  protected async fetchIdeas(): Promise<RawIdea[]> {
    // Note.com lacks public API; returning empty for now.
    // In production, implement OGP-based scraping with heavy rate limiting.
    console.warn(
      "[Note] Note.com adapter not implemented. " +
        "Requires OGP scraping; use with caution and respect robots.txt."
    );

    return [];
  }
}
