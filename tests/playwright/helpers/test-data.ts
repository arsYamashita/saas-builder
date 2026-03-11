/**
 * Shared helpers for authenticated CRUD Playwright tests.
 */

/** Generate a unique test name to avoid collision with existing data */
export function uniqueName(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${ts}_${rand}`;
}

/** Check if auth env vars are available */
export function hasAuthCredentials(): boolean {
  return !!(process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD);
}
