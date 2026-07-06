import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:secret_guard/secret_guard.dart';

String _base64Url(Map<String, dynamic> json) {
  return base64Url.encode(utf8.encode(jsonEncode(json))).replaceAll('=', '');
}

String _buildFakeJwt(Map<String, dynamic> payload) {
  final header = _base64Url({'alg': 'HS256', 'typ': 'JWT'});
  final body = _base64Url(payload);
  const signature = 'fakeSignatureNotARealOne1234567890';
  return '$header.$body.$signature';
}

void main() {
  final anthropicKey = 'sk-ant-api03-${'A' * 40}1234';
  final openaiKey = 'sk-${'B' * 48}';
  final stripeSecret = 'sk_live_${'C1d2E3f4' * 4}';
  final stripeRestricted = 'rk_test_${'D1e2F3g4' * 4}';
  final stripePublishable = 'pk_live_${'E1f2G3h4' * 4}'; // must NOT be masked
  final googleKey = 'AIza${'S' * 35}';
  final bearerToken = 'Bearer ${'abcDEF123456' * 3}';
  const hexSecret =
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2c53c0f8ffa0a2c9c2e2f6b0';
  final genericApiKey = 'api_key="${'z9y8x7w6v5u4t3s2r1q0' * 2}"';
  final supabaseAnonJwt = _buildFakeJwt({'role': 'anon', 'iss': 'supabase'});
  final supabaseServiceRoleJwt =
      _buildFakeJwt({'role': 'service_role', 'iss': 'supabase'});
  final plainJwtNoRole = _buildFakeJwt({'iss': 'example'});

  test('returns empty input unchanged', () {
    expect(mask(''), '');
  });

  test('masks sk-/sk-ant- style keys', () {
    final out = mask('key was $anthropicKey in the log');
    expect(out.contains(anthropicKey), isFalse);
    expect(out.contains('sk-[MASKED]'), isTrue);
  });

  test('masks bare sk- (OpenAI-style) keys', () {
    final out = mask(openaiKey);
    expect(out.contains(openaiKey), isFalse);
  });

  test('masks Stripe secret and restricted keys but not publishable keys', () {
    final out = mask('$stripeSecret $stripeRestricted $stripePublishable');
    expect(out.contains(stripeSecret), isFalse);
    expect(out.contains(stripeRestricted), isFalse);
    expect(out.contains(stripePublishable), isTrue);
  });

  test('masks Google AIza-style keys (non-hex, needs its own rule)', () {
    final out = mask('GEMINI_API_KEY=$googleKey');
    expect(out.contains(googleKey), isFalse);
    expect(out.contains('AIza[MASKED]'), isTrue);
  });

  test(
      'masks a bare key= in a URL query string (gemini_api_key_url_query_masker_bypass regression)',
      () {
    final url =
        'https://generativelanguage.googleapis.com/v1/models/gemini:generateContent?key=$googleKey';
    final exceptionMessage = "httpx.HTTPStatusError: 429 for url '$url'";
    final out = mask(exceptionMessage);
    expect(out.contains(googleKey), isFalse);
    expect(RegExp(r'key=(AIza)?\[MASKED\]').hasMatch(out), isTrue);
  });

  test('masks a bare key= query string with no recognized provider prefix',
      () {
    const opaqueSecret = 'z9y8x7w6v5u4t3s2r1q0mnbvcxzasdfghjkl';
    const url = 'https://api.example.com/v1/resource?key=$opaqueSecret&format=json';
    final out = mask(url);
    expect(out.contains(opaqueSecret), isFalse);
    expect(out.contains('key=[MASKED]'), isTrue);
    expect(out.contains('format=json'), isTrue);
  });

  test('masks Bearer tokens', () {
    final out = mask('Authorization: $bearerToken');
    expect(out.contains(bearerToken), isFalse);
    expect(out.contains('Bearer [MASKED]'), isTrue);
  });

  test('masks generic api_key= assignments', () {
    final out = mask(genericApiKey);
    expect(out.contains(genericApiKey), isFalse);
  });

  test('masks generic 32+ char hex blobs', () {
    final out = mask('sha256=$hexSecret');
    expect(out.contains(hexSecret), isFalse);
    expect(out.contains('[HEX_MASKED]'), isTrue);
  });

  test('masks a service_role JWT (Supabase-style)', () {
    final out = mask('SUPABASE_SERVICE_ROLE_KEY=$supabaseServiceRoleJwt');
    expect(out.contains(supabaseServiceRoleJwt), isFalse);
    expect(out.contains('[JWT_MASKED]'), isTrue);
  });

  test('does NOT mask an anon-role JWT (safe/public by convention)', () {
    final out = mask('NEXT_PUBLIC_SUPABASE_ANON_KEY=$supabaseAnonJwt');
    expect(out.contains(supabaseAnonJwt), isTrue);
  });

  test('masks a JWT with no role claim (fail-closed default)', () {
    final out = mask(plainJwtNoRole);
    expect(out.contains(plainJwtNoRole), isFalse);
    expect(out.contains('[JWT_MASKED]'), isTrue);
  });

  test('leaves ordinary text untouched', () {
    const text = 'The quick brown fox jumps over the lazy dog. Order #12345.';
    expect(mask(text), text);
  });
}
