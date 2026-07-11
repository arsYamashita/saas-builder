/**
 * Safely serializes a value for embedding inside a `<script type="application/ld+json">`
 * element via `dangerouslySetInnerHTML`.
 *
 * `JSON.stringify` alone is NOT safe for this purpose: it does not escape
 * `</script>`, which lets attacker-controlled string content in the data
 * break out of the script context (stored XSS), nor U+2028/U+2029 line
 * separators, which are valid in JSON strings but invalid in JS string
 * literals in some engines/contexts.
 *
 * "JSON safe" is not the same thing as "HTML safe" -- this function bridges
 * that gap by escaping the characters that matter for the HTML/script
 * embedding context.
 *
 * Regexes are built from \uXXXX escapes (rather than literal unicode
 * characters in the source) so this file stays plain ASCII.
 */
const LESS_THAN = /</g;
const LINE_SEPARATOR = new RegExp("\u2028", "g");
const PARAGRAPH_SEPARATOR = new RegExp("\u2029", "g");

export function serializeJsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(LESS_THAN, "\\u003c")
    .replace(LINE_SEPARATOR, "\\u2028")
    .replace(PARAGRAPH_SEPARATOR, "\\u2029");
}
