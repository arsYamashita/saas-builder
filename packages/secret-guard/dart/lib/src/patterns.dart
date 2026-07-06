import 'dart:convert';

/// Secret-shape patterns — pure regex/string transforms, no network calls,
/// no file writes. Dart port of `../../src/patterns.ts` — keep the two in
/// sync when adding a new pattern; see that file's header comment for the
/// full history (aeo-service `harness/masker.py`, commit b2acc6e /
/// `gemini_api_key_url_query_masker_bypass`).
class MaskPattern {
  final String name;
  final String Function(String text) apply;

  const MaskPattern(this.name, this.apply);
}

/// Supabase (and similar) JWTs encode `{"role": "..."}` in the payload
/// segment. `anon`-role tokens are the public, safe-to-log counterpart of
/// the anon key — left alone to keep log/error output readable. Everything
/// else (service_role, authenticated, no role claim at all, malformed
/// payload) is masked: fail-closed, not fail-open.
const Set<String> _safeJwtRoles = {'anon'};

final RegExp _jwtRe = RegExp(r'eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}');

String? _base64UrlDecode(String segment) {
  try {
    var padded = segment;
    final remainder = padded.length % 4;
    if (remainder != 0) {
      padded += '=' * (4 - remainder);
    }
    return utf8.decode(base64Url.decode(padded));
  } catch (_) {
    return null;
  }
}

String? _jwtRole(String token) {
  final parts = token.split('.');
  if (parts.length < 2) return null;
  final payload = _base64UrlDecode(parts[1]);
  if (payload == null) return null;
  final match = RegExp(r'"role"\s*:\s*"([^"]+)"').firstMatch(payload);
  return match?.group(1);
}

String _maskJwts(String text) {
  return text.replaceAllMapped(_jwtRe, (m) {
    final token = m.group(0)!;
    final role = _jwtRole(token);
    if (role != null && _safeJwtRoles.contains(role)) return token;
    return '[JWT_MASKED]';
  });
}

final List<MaskPattern> patterns = [
  // Role-aware first: a service_role JWT must never survive to hit the
  // generic hex/base64 patterns below as a false "safe" pass-through.
  const MaskPattern('supabase-style-jwt', _maskJwts),

  // OpenAI/Anthropic-style `sk-...` keys (Anthropic's own `sk-ant-...` also
  // matches this prefix).
  MaskPattern(
    'sk-prefixed-key',
    (t) => t.replaceAll(RegExp(r'sk-[A-Za-z0-9\-_]{20,}'), 'sk-[MASKED]'),
  ),

  // Stripe secret/restricted keys — `sk_live_`/`sk_test_`/`rk_live_`/
  // `rk_test_`. Deliberately excludes `pk_live_`/`pk_test_` (publishable,
  // meant to ship to the client).
  MaskPattern(
    'stripe-secret-key',
    (t) => t.replaceAllMapped(
      RegExp(r'\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}\b'),
      (m) => '${m.group(1)}_${m.group(2)}_[MASKED]',
    ),
  ),

  // Google API keys: `AIza` + 35 more chars (39 total). Not hex, so the
  // hex32+ rule below would miss it.
  MaskPattern(
    'google-aiza-key',
    (t) => t.replaceAll(RegExp(r'AIza[A-Za-z0-9\-_]{35,}'), 'AIza[MASKED]'),
  ),

  // Bare `key=` in a URL query string — the exact
  // gemini_api_key_url_query_masker_bypass shape: an exception message
  // embeds the full request URL, query string and all.
  MaskPattern(
    'url-query-key-param',
    (t) => t.replaceAllMapped(
      RegExp(r'([?&]key=)[A-Za-z0-9\-_.]{16,}', caseSensitive: false),
      (m) => '${m.group(1)}[MASKED]',
    ),
  ),

  MaskPattern(
    'bearer-token',
    (t) => t.replaceAllMapped(
      RegExp(r'Bearer\s+[A-Za-z0-9\-_.]{20,}', caseSensitive: false),
      (_) => 'Bearer [MASKED]',
    ),
  ),

  // Generic `api_key=`/`token=`/`token:`/`"token": "..."`/etc. assignments
  // (ad hoc internal tokens that don't match a known provider prefix —
  // including opaque non-hex values). Two Codex review rounds on PR #37
  // shaped this: bare `token` in the alternation (also catches compounds
  // ending in it: `auth_token=`, `refresh_token=`), and optional quotes
  // around the KEY side — without them, the JSON-serialized form
  // `{"token":"..."}` (quoted key, `"` between key name and `:`) never
  // matched, which is exactly the http_response / structured-log shape
  // this package exists for. It can't false-match `tokenizer=` /
  // `"tokenizer":` because `=`/`:` (modulo an optional closing quote and
  // whitespace) must immediately follow the key name. Value min-length
  // stays at {20,} — same false-positive guard as the other alternatives.
  MaskPattern(
    'generic-key-assignment',
    (t) => t.replaceAllMapped(
      RegExp(
        r'''["']?(api[_-]?key|apikey|api[_-]?token|access[_-]?token|secret[_-]?key|token)["']?\s*[=:]\s*["']?([A-Za-z0-9\-_.]{20,})["']?''',
        caseSensitive: false,
      ),
      (m) => '${m.group(1)}=[MASKED]',
    ),
  ),

  // Generic long hex blob. Runs last: every known non-hex secret shape has
  // already been replaced with a `[..._MASKED]` placeholder by now.
  MaskPattern(
    'hex32-plus',
    (t) => t.replaceAll(RegExp(r'\b[0-9a-fA-F]{32,}\b'), '[HEX_MASKED]'),
  ),
];
