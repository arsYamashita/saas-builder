// Minimal ambient type declaration for the 'diff' package (v5.x)
// Covers only the API surface used in this codebase.
// Install @types/diff if a more complete declaration is needed.

declare module 'diff' {
  export interface Change {
    value: string;
    added?: boolean;
    removed?: boolean;
    count?: number;
  }

  export function diffWords(
    oldStr: string,
    newStr: string,
    options?: { ignoreCase?: boolean }
  ): Change[];

  export function diffLines(
    oldStr: string,
    newStr: string,
    options?: { newlineIsToken?: boolean; ignoreWhitespace?: boolean }
  ): Change[];

  export function diffChars(oldStr: string, newStr: string): Change[];

  export function createPatch(
    fileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string
  ): string;
}
