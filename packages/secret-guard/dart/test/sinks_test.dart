import 'package:flutter_test/flutter_test.dart';
import 'package:secret_guard/secret_guard.dart';

void main() {
  setUp(() {
    resetRegistryForTests();
  });

  test('registerSink returns a mask()-backed function usable at the call site',
      () {
    final maskIt =
        registerSink(const SinkRegistration(SinkKind.log, 'test-call-site'));
    final out = maskIt('token=${'a' * 32}');
    expect(out.contains('a' * 32), isFalse);
  });

  test('records the registration for later coverage checks', () {
    registerSink(const SinkRegistration(SinkKind.log, 'test-call-site'));
    final sinks = listRegisteredSinks();
    expect(sinks.length, 1);
    expect(sinks[0].kind, SinkKind.log);
    expect(sinks[0].name, 'test-call-site');
  });

  test('throws on duplicate (kind, name) registration', () {
    registerSink(const SinkRegistration(SinkKind.log, 'dup'));
    expect(
      () => registerSink(const SinkRegistration(SinkKind.log, 'dup')),
      throwsA(isA<DuplicateSinkRegistrationError>()),
    );
  });

  test('allows the same name under a different kind', () {
    registerSink(const SinkRegistration(SinkKind.log, 'shared-name'));
    expect(
      () => registerSink(
        const SinkRegistration(SinkKind.httpResponse, 'shared-name'),
      ),
      returnsNormally,
    );
  });

  group('assertAllKindsRegistered — the 未登録経路検出 test', () {
    test('throws listing every missing kind when nothing is registered', () {
      expect(
        () => assertAllKindsRegistered(),
        throwsA(isA<MissingSinkKindsError>().having(
          (e) => e.missing.length,
          'missing.length',
          allSinkKinds.length,
        )),
      );
    });

    test('throws only for the kinds still missing after partial registration',
        () {
      registerSink(const SinkRegistration(SinkKind.log, 'a'));
      registerSink(const SinkRegistration(SinkKind.httpResponse, 'b'));
      try {
        assertAllKindsRegistered();
        fail('expected assertAllKindsRegistered to throw');
      } on MissingSinkKindsError catch (e) {
        expect(e.missing, contains(SinkKind.errorMessage));
        expect(e.missing, contains(SinkKind.urlQuery));
        expect(e.missing, contains(SinkKind.artifactFile));
        expect(e.missing, isNot(contains(SinkKind.log)));
        expect(e.missing, isNot(contains(SinkKind.httpResponse)));
      }
    });

    test('passes once every kind has at least one registered sink', () {
      for (final kind in allSinkKinds) {
        registerSink(SinkRegistration(kind, 'synthetic-${kind.name}'));
      }
      expect(() => assertAllKindsRegistered(), returnsNormally);
    });
  });
}
