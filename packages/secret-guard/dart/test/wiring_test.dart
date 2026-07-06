import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:secret_guard/secret_guard.dart';

/// The "配線テスト" (wiring test): registers a sink for every one of the
/// five known output-route kinds, then flows a battery of known secret
/// shapes through each one and asserts zero plaintext survives. Dart port
/// of `../../src/__tests__/wiring.test.ts` — see that file's header
/// comment for the full rationale.

String _base64Url(Map<String, dynamic> json) {
  return base64Url.encode(utf8.encode(jsonEncode(json))).replaceAll('=', '');
}

String _buildFakeJwt(Map<String, dynamic> payload) {
  return '${_base64Url({'alg': 'HS256'})}.${_base64Url(payload)}.fakeSig1234567890abcdef';
}

void main() {
  final knownSecrets = <String, String>{
    'anthropicKey': 'sk-ant-api03-${'Q' * 50}',
    'stripeSecretKey': 'sk_live_${'R2s3T4u5' * 4}',
    'googleApiKey': 'AIza${'V' * 35}',
    'bearerToken': 'Bearer ${'W' * 30}',
    'hexToken': 'f' * 40,
    'serviceRoleJwt': _buildFakeJwt({'role': 'service_role'}),
  };

  void assertNoSecretSurvives(String masked) {
    knownSecrets.forEach((label, secret) {
      expect(masked.contains(secret), isFalse, reason: '$label leaked through unmasked');
    });
  }

  late String Function(String) logSink;
  late String Function(String) httpResponseSink;
  late String Function(String) errorMessageSink;
  late String Function(String) urlQuerySink;
  late String Function(String) artifactFileSink;

  setUpAll(() {
    resetRegistryForTests();
    logSink = registerSink(
      const SinkRegistration(SinkKind.log, 'wiring-test/debugPrint'),
    );
    httpResponseSink = registerSink(
      const SinkRegistration(
          SinkKind.httpResponse, 'wiring-test/json-response-body'),
    );
    errorMessageSink = registerSink(
      const SinkRegistration(
          SinkKind.errorMessage, 'wiring-test/thrown-error-message'),
    );
    urlQuerySink = registerSink(
      const SinkRegistration(
          SinkKind.urlQuery, 'wiring-test/outbound-request-url'),
    );
    artifactFileSink = registerSink(
      const SinkRegistration(
          SinkKind.artifactFile, 'wiring-test/generated-report-file'),
    );
  });

  test('registers all five required kinds (coverage gate passes)', () {
    expect(() => assertAllKindsRegistered(), returnsNormally);
  });

  test('log sink: masks a log line embedding every known secret', () {
    final line = '[provider] request failed: ${knownSecrets.values.join(' | ')}';
    assertNoSecretSurvives(logSink(line));
  });

  test('http_response sink: masks a JSON error body before it reaches the client',
      () {
    final body = jsonEncode({
      'error': 'upstream 500: ${knownSecrets['stripeSecretKey']} rejected',
    });
    assertNoSecretSurvives(httpResponseSink(body));
  });

  test("error_message sink: masks a caught exception's message", () {
    final message = 'Auth failed with token ${knownSecrets['serviceRoleJwt']}';
    assertNoSecretSurvives(errorMessageSink(message));
  });

  test(
      'url_query sink: masks a bare key= query param (gemini_api_key_url_query_masker_bypass regression)',
      () {
    final url =
        'https://generativelanguage.googleapis.com/v1/models/gemini:generateContent?key=${knownSecrets['googleApiKey']}&alt=sse';
    final masked = urlQuerySink(url);
    assertNoSecretSurvives(masked);
    expect(RegExp(r'key=(AIza)?\[MASKED\]').hasMatch(masked), isTrue);
    expect(masked.contains('alt=sse'), isTrue);
  });

  test('artifact_file sink: masks secrets before they are written into a generated file',
      () {
    final fileContents = [
      '# Debug report',
      'Authorization header sent: ${knownSecrets['bearerToken']}',
      'Raw hex secret observed: ${knownSecrets['hexToken']}',
      'Anthropic key in stack trace: ${knownSecrets['anthropicKey']}',
    ].join('\n');
    assertNoSecretSurvives(artifactFileSink(fileContents));
  });

  test('every registered sink independently masks every known secret (full matrix)',
      () {
    final sinks = <String, String Function(String)>{
      'log': logSink,
      'http_response': httpResponseSink,
      'error_message': errorMessageSink,
      'url_query': urlQuerySink,
      'artifact_file': artifactFileSink,
    };
    sinks.forEach((sinkName, sinkFn) {
      knownSecrets.forEach((secretLabel, secret) {
        final out = sinkFn('payload containing $secret inline');
        expect(out.contains(secret), isFalse,
            reason: '$sinkName sink failed to mask $secretLabel');
      });
    });
  });
}
