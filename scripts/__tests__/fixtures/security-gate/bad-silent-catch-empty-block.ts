export async function cleanupQualityRun(id: string): Promise<void> {
  // Intentional fixture violation: fully silent catch, no logging —
  // should trigger `no-silent-catch`.
  await finishSomething(id).catch(() => {});
}

declare function finishSomething(id: string): Promise<void>;
