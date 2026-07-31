//! Turn runtime contract violations back into source edits.
//!
//! Generated contracts append `path \t expected \t actual` lines to a tape
//! file. `rama-check learn` reads that tape, matches each violation against
//! the parsed `.rama` source, and proposes (or applies) precise fixes. This
//! closes the loop: runtime facts become explicit, reviewable program text.

use std::collections::BTreeMap;

use crate::ast::{Item, SourceFile};
use crate::span::Span;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TapeViolation {
    pub path: String,
    pub expected: String,
    pub actual: String,
}

pub fn parse_tape(tape: &str) -> Vec<TapeViolation> {
    tape.lines()
        .filter_map(|line| {
            let mut fields = line.splitn(3, '\t');
            Some(TapeViolation {
                path: fields.next()?.to_string(),
                expected: fields.next()?.to_string(),
                actual: fields.next()?.to_string(),
            })
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Suggestion {
    pub message: String,
    /// Precise replacement of a source span, when the fix is mechanical.
    pub fix: Option<(Span, String)>,
}

pub fn analyze_tape(
    source: &str,
    file: &SourceFile,
    violations: &[TapeViolation],
) -> Vec<Suggestion> {
    let mut grouped: BTreeMap<(String, String, String), usize> = BTreeMap::new();
    for violation in violations {
        *grouped
            .entry((
                violation.path.clone(),
                violation.expected.clone(),
                violation.actual.clone(),
            ))
            .or_default() += 1;
    }

    let mut suggestions = Vec::new();
    for ((path, expected, actual), count) in &grouped {
        if let Some(name) = extern_return_name(path) {
            // Same extern return violated with a consistent runtime class →
            // the pinned declaration is wrong; rewrite its return type.
            let consistent = grouped
                .keys()
                .filter(|(other_path, _, _)| other_path == path)
                .count()
                == 1
                && actual != "nil";
            let declaration = file.items.iter().find_map(|item| match item {
                Item::Extern(declaration) if declaration.name.node == name => Some(declaration),
                _ => None,
            });
            match (declaration, consistent) {
                (Some(declaration), true) => {
                    let replacement = source_alias(actual);
                    suggestions.push(Suggestion {
                        message: format!(
                            "extern `{name}` declares return `{expected}` but runtime returned `{actual}` ({count}x); \
                             fix the pin to `{replacement}`"
                        ),
                        fix: Some((declaration.return_ty.span, replacement)),
                    });
                }
                (Some(_), false) => suggestions.push(Suggestion {
                    message: format!(
                        "extern `{name}` return violated with multiple runtime classes; \
                         observe more calls before repinning"
                    ),
                    fix: None,
                }),
                (None, _) => suggestions.push(Suggestion {
                    message: format!(
                        "runtime reported a violation for extern `{name}` which is not declared in this file"
                    ),
                    fix: None,
                }),
            }
        } else if let Some((function, argument)) = fn_argument_target(path) {
            suggestions.push(Suggestion {
                message: format!(
                    "callers pass `{actual}` where `{function}` argument `{argument}` declares `{expected}` ({count}x); \
                     either the caller is wrong or the parameter type should widen"
                ),
                fix: None,
            });
        } else {
            suggestions.push(Suggestion {
                message: format!(
                    "contract at `{path}` expected `{expected}` but saw `{actual}` ({count}x)"
                ),
                fix: None,
            });
        }
    }
    let _ = source;
    suggestions
}

/// Apply mechanical fixes; returns the updated source and how many applied.
pub fn apply_fixes(source: &str, suggestions: &[Suggestion]) -> (String, usize) {
    let mut fixes: Vec<(Span, String)> = suggestions
        .iter()
        .filter_map(|suggestion| suggestion.fix.clone())
        .collect();
    fixes.sort_by_key(|(span, _)| std::cmp::Reverse(span.start));
    fixes.dedup_by_key(|(span, _)| *span);

    let mut updated = source.to_string();
    let mut applied = 0;
    for (span, replacement) in fixes {
        if span.end <= updated.len() {
            updated.replace_range(span.start..span.end, &replacement);
            applied += 1;
        }
    }
    (updated, applied)
}

fn extern_return_name(path: &str) -> Option<&str> {
    path.strip_prefix("extern `")?.strip_suffix("` return")
}

fn fn_argument_target(path: &str) -> Option<(&str, &str)> {
    let (function, rest) = path.split_once(" argument `")?;
    Some((function, rest.strip_suffix('`')?))
}

fn source_alias(class: &str) -> String {
    match class {
        "java.lang.String" => "String",
        "java.lang.Long" => "Long",
        "java.lang.Integer" => "Int",
        "java.lang.Boolean" => "Boolean",
        "java.lang.Object" => "Object",
        other => other,
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse;

    const SOURCE: &str = r#"module Demo

extern str = clojure.core/str(value: Long) -> Long

fn bad(value: Long) -> Long {
  return str(value)
}
"#;

    #[test]
    fn parses_tab_separated_tape() {
        let tape = "extern `str` return\tjava.lang.Long\tjava.lang.String\n";
        assert_eq!(
            parse_tape(tape),
            vec![TapeViolation {
                path: "extern `str` return".into(),
                expected: "java.lang.Long".into(),
                actual: "java.lang.String".into(),
            }]
        );
    }

    #[test]
    fn dishonest_extern_return_gets_a_mechanical_fix() {
        let file = parse(SOURCE).expect("parse");
        let violations = parse_tape(
            "extern `str` return\tjava.lang.Long\tjava.lang.String\n\
             extern `str` return\tjava.lang.Long\tjava.lang.String\n",
        );
        let suggestions = analyze_tape(SOURCE, &file, &violations);
        assert_eq!(suggestions.len(), 1);
        assert!(suggestions[0].message.contains("fix the pin to `String`"));
        assert!(suggestions[0].message.contains("(2x)"));

        let (updated, applied) = apply_fixes(SOURCE, &suggestions);
        assert_eq!(applied, 1);
        assert!(
            updated.contains("extern str = clojure.core/str(value: Long) -> String"),
            "{updated}"
        );
        // The corrected pin must surface the real bug statically.
        let (_, result) = crate::analyze(&updated).expect("reparse");
        assert!(result
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("return type")));
    }

    #[test]
    fn inconsistent_actual_classes_do_not_autofix() {
        let file = parse(SOURCE).expect("parse");
        let violations = parse_tape(
            "extern `str` return\tjava.lang.Long\tjava.lang.String\n\
             extern `str` return\tjava.lang.Long\tjava.lang.Boolean\n",
        );
        let suggestions = analyze_tape(SOURCE, &file, &violations);
        assert!(suggestions
            .iter()
            .all(|suggestion| suggestion.fix.is_none()));
    }

    #[test]
    fn argument_violations_report_without_autofix() {
        let file = parse(SOURCE).expect("parse");
        let violations = parse_tape("bad argument `value`\tjava.lang.Long\tjava.lang.String\n");
        let suggestions = analyze_tape(SOURCE, &file, &violations);
        assert_eq!(suggestions.len(), 1);
        assert!(suggestions[0].fix.is_none());
        assert!(suggestions[0]
            .message
            .contains("`bad` argument `value` declares `java.lang.Long`"));
    }
}
