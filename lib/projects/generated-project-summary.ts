/**
 * Builds a summary of the generated project from API data.
 * Used for the overview card on the project detail page.
 */

export interface FileCategoryCount {
  category: string;
  count: number;
}

export interface GeneratedProjectSummary {
  /** Latest generation run status */
  generationStatus: string | null;
  generationFinishedAt: string | null;
  /** Latest quality run status */
  qualityStatus: string | null;
  /** Counts */
  blueprintCount: number;
  implementationRunCount: number;
  generatedFileCount: number;
  /** File breakdown by category */
  categoryBreakdown: FileCategoryCount[];
  /** Path-based file type counts */
  pageCount: number;
  apiRouteCount: number;
  componentCount: number;
  testCount: number;
  libCount: number;
  otherCount: number;
  /** Whether there are any results to show */
  hasResults: boolean;
}

interface SummaryInput {
  generationRuns: Array<{
    status: string;
    finished_at?: string | null;
  }>;
  qualityRuns: Array<{ status: string }>;
  blueprints: Array<unknown>;
  implementationRuns: Array<unknown>;
  generatedFiles: Array<{
    file_category: string;
    file_path: string;
  }>;
}

export function buildGeneratedProjectSummary(
  data: SummaryInput
): GeneratedProjectSummary {
  const latestGen = data.generationRuns?.[0] ?? null;
  const latestQuality = data.qualityRuns?.[0] ?? null;
  const files = data.generatedFiles ?? [];

  // Category breakdown (from file_category field)
  const catMap = new Map<string, number>();
  for (const f of files) {
    const cat = f.file_category || "other";
    catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
  }
  const categoryBreakdown = Array.from(catMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  // Path-based type counts
  let pageCount = 0;
  let apiRouteCount = 0;
  let componentCount = 0;
  let testCount = 0;
  let libCount = 0;

  for (const f of files) {
    const p = f.file_path.toLowerCase();
    if (p.includes("/app/") && p.includes("/page.")) {
      pageCount++;
    } else if (p.includes("/api/") || p.includes("route.")) {
      apiRouteCount++;
    } else if (
      p.includes("/components/") ||
      p.includes(".component.") ||
      p.includes(".tsx")
    ) {
      componentCount++;
    } else if (
      p.includes(".test.") ||
      p.includes(".spec.") ||
      p.includes("/tests/") ||
      p.includes("/e2e/")
    ) {
      testCount++;
    } else if (p.includes("/lib/") || p.includes("/utils/")) {
      libCount++;
    }
  }

  const otherCount =
    files.length - pageCount - apiRouteCount - componentCount - testCount - libCount;

  return {
    generationStatus: latestGen?.status ?? null,
    generationFinishedAt: latestGen?.finished_at ?? null,
    qualityStatus: latestQuality?.status ?? null,
    blueprintCount: data.blueprints?.length ?? 0,
    implementationRunCount: data.implementationRuns?.length ?? 0,
    generatedFileCount: files.length,
    categoryBreakdown,
    pageCount,
    apiRouteCount,
    componentCount,
    testCount,
    libCount,
    otherCount: Math.max(0, otherCount),
    hasResults:
      files.length > 0 ||
      (data.blueprints?.length ?? 0) > 0 ||
      (data.generationRuns?.length ?? 0) > 0,
  };
}
