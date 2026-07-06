import 'patterns.dart';

/// Masks every known secret shape in [text]. Pure function: no I/O, no
/// mutation. Safe to call on anything before it leaves the process (a log
/// line, an HTTP response body, a generated file on disk, ...).
String mask(String text) {
  if (text.isEmpty) return text;
  var out = text;
  for (final pattern in patterns) {
    out = pattern.apply(out);
  }
  return out;
}
