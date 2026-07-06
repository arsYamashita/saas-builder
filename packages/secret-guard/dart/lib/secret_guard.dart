/// secret_guard — secret-shape masking with enforced output-route coverage.
/// See ../README.md for the full design rationale and usage. Dart port of
/// the TypeScript package one directory up (`../src`).
library secret_guard;

export 'src/mask.dart';
export 'src/patterns.dart' show MaskPattern, patterns;
export 'src/sinks.dart';
