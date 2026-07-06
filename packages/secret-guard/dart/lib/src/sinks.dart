import 'mask.dart';

/// The five output routes a secret can escape through. Dart port of
/// `../../src/sinks.ts` — see that file's header comment for the full
/// design rationale ("enumerate every output route, then pin it with a
/// wiring test").
enum SinkKind {
  log,
  httpResponse,
  errorMessage,
  urlQuery,
  artifactFile,
}

const List<SinkKind> allSinkKinds = SinkKind.values;

class SinkRegistration {
  final SinkKind kind;

  /// Human-readable call-site description, e.g.
  /// "lib/error_reporter.dart debugPrint".
  final String name;

  const SinkRegistration(this.kind, this.name);
}

class RegisteredSink {
  final SinkKind kind;
  final String name;

  /// Masks input the same way this sink is wired to mask it in production.
  final String Function(String input) mask;

  const RegisteredSink(this.kind, this.name, this.mask);
}

class DuplicateSinkRegistrationError implements Exception {
  final String message;
  DuplicateSinkRegistrationError(this.message);

  @override
  String toString() => 'secret-guard: $message';
}

class MissingSinkKindsError implements Exception {
  final List<SinkKind> missing;
  MissingSinkKindsError(this.missing);

  @override
  String toString() =>
      'secret-guard: no sink registered for output route kind(s): '
      '${missing.map((k) => k.name).join(", ")}. Call registerSink() at the '
      'real call site (see README.md).';
}

final Map<String, RegisteredSink> _registry = {};

String _key(SinkKind kind, String name) => '${kind.name}:$name';

/// Registers one concrete output call site as "masking-wired". Returns the
/// masking function the call site should actually use.
///
/// Throws [DuplicateSinkRegistrationError] on duplicate (kind, name)
/// registration.
String Function(String input) registerSink(SinkRegistration reg) {
  final k = _key(reg.kind, reg.name);
  if (_registry.containsKey(k)) {
    throw DuplicateSinkRegistrationError('sink already registered: $k');
  }
  _registry[k] = RegisteredSink(reg.kind, reg.name, mask);
  return mask;
}

/// For tests only: clears the registry so test files don't leak state into
/// each other.
void resetRegistryForTests() {
  _registry.clear();
}

List<RegisteredSink> listRegisteredSinks() => _registry.values.toList();

/// Asserts every kind in [required] (defaults to all five) has at least one
/// registered sink. Throws [MissingSinkKindsError] listing every kind still
/// missing — the "未登録経路検出テスト" (undetected-route detection test).
void assertAllKindsRegistered({List<SinkKind> required = allSinkKinds}) {
  final registeredKinds = listRegisteredSinks().map((s) => s.kind).toSet();
  final missing = required.where((k) => !registeredKinds.contains(k)).toList();
  if (missing.isNotEmpty) {
    throw MissingSinkKindsError(missing);
  }
}
