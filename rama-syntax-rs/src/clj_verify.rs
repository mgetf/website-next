//! Compiler-internal verification of generated Clojure IR.
//!
//! These are not user-facing Rama language rules. A failure means lowering
//! produced an invalid target shape and is therefore a compiler bug.

use crate::clj::{Document, Form};
use std::collections::BTreeSet;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Issue {
    pub invariant: &'static str,
    pub message: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Context {
    Clj,
    Dataflow,
}

pub fn verify(doc: &Document) -> Vec<Issue> {
    let mut issues = Vec::new();
    for form in &doc.forms {
        verify_form(form, Context::Clj, &mut issues);
    }
    issues
}

fn verify_form(form: &Form, context: Context, out: &mut Vec<Issue>) {
    match form {
        Form::List(xs) => {
            let head = head(xs);
            let next = match head {
                Some("deframaop") | Some("<<sources") | Some("<<if") => Context::Dataflow,
                Some("defn") | Some("fn") => Context::Clj,
                _ => context,
            };

            if head == Some("<<if")
                && xs
                    .iter()
                    .skip(1)
                    .any(|x| matches!(x, Form::Symbol(s) if s == "else>"))
            {
                out.push(Issue {
                    invariant: "clj/else-marker-is-form",
                    message: "generated <<if contains bare `else>`; expected `(else>)`".into(),
                });
            }

            if context == Context::Dataflow
                && matches!(
                    head,
                    Some("and" | "or" | "if" | "cond" | "let*" | "if-let" | "when-let")
                )
            {
                out.push(Issue {
                    invariant: "clj/no-clojure-control-in-dataflow",
                    message: format!(
                        "generated dataflow contains Clojure control macro `{}`; lift it to a top-level defn",
                        head.unwrap()
                    ),
                });
            }

            if head == Some("hash-by") && !matches!(xs.get(1), Some(Form::Symbol(_))) {
                out.push(Issue {
                    invariant: "clj/hash-by-symbol",
                    message: "generated hash-by must reference a top-level defn symbol".into(),
                });
            }

            if head == Some("fixed-keys-schema") {
                if let Some(Form::Map(entries)) = xs.get(1) {
                    for (key, _) in entries {
                        if !matches!(key, Form::String(_)) {
                            out.push(Issue {
                                invariant: "clj/rest-fixed-key-strings",
                                message: format!(
                                    "generated REST fixed-keys-schema key is not a string: {key:?}"
                                ),
                            });
                        }
                    }
                }
            }

            if head == Some("deframaop") {
                let params: BTreeSet<&str> = match xs.get(2) {
                    Some(Form::Vector(params)) => params
                        .iter()
                        .filter_map(|param| match param {
                            Form::Symbol(s) if s.starts_with("$$") => Some(s.as_str()),
                            _ => None,
                        })
                        .collect(),
                    _ => BTreeSet::new(),
                };
                let mut used = BTreeSet::new();
                for child in xs.iter().skip(3) {
                    collect_pstate_symbols(child, &mut used);
                }
                for missing in used.difference(&params) {
                    out.push(Issue {
                        invariant: "clj/deframaop-pstate-parameter",
                        message: format!(
                            "generated deframaop references {missing} without declaring it as a parameter"
                        ),
                    });
                }
            }

            for child in xs.iter().skip(1) {
                verify_form(child, next, out);
            }
        }
        Form::Vector(xs) => {
            for child in xs {
                verify_form(child, context, out);
            }
        }
        Form::Map(entries) => {
            for (key, value) in entries {
                verify_form(key, context, out);
                verify_form(value, context, out);
            }
        }
        _ => {}
    }
}

fn collect_pstate_symbols<'a>(form: &'a Form, out: &mut BTreeSet<&'a str>) {
    match form {
        Form::Symbol(s) if s.starts_with("$$") => {
            out.insert(s);
        }
        Form::List(xs) | Form::Vector(xs) => {
            for child in xs {
                collect_pstate_symbols(child, out);
            }
        }
        Form::Map(entries) => {
            for (key, value) in entries {
                collect_pstate_symbols(key, out);
                collect_pstate_symbols(value, out);
            }
        }
        _ => {}
    }
}

fn head(xs: &[Form]) -> Option<&str> {
    match xs.first() {
        Some(Form::Symbol(s)) => Some(s),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clj;

    #[test]
    fn rejects_bare_else_marker() {
        let mut doc = Document::new();
        doc.push(clj::call(
            "deframaop",
            [
                clj::sym("x>"),
                clj::vector([]),
                Form::List(vec![
                    clj::sym("<<if"),
                    clj::bool(true),
                    clj::sym("else>"),
                    clj::nil(),
                ]),
            ],
        ));
        assert_eq!(verify(&doc)[0].invariant, "clj/else-marker-is-form");
    }

    #[test]
    fn rejects_pstate_not_passed_to_ramaop() {
        let mut doc = Document::new();
        doc.push(clj::call(
            "deframaop",
            [
                clj::sym("x>"),
                clj::vector([clj::sym("*event")]),
                clj::call(
                    "local-select>",
                    [clj::call("keypath", [clj::sym("*id")]), clj::sym("$$p")],
                ),
            ],
        ));
        assert!(verify(&doc)
            .iter()
            .any(|issue| issue.invariant == "clj/deframaop-pstate-parameter"));
    }

    #[test]
    fn rejects_control_macro_in_dataflow() {
        let mut doc = Document::new();
        doc.push(clj::call(
            "deframaop",
            [
                clj::sym("x>"),
                clj::vector([]),
                clj::call(
                    "identity",
                    [
                        clj::call("if", [clj::bool(true), clj::int(1), clj::int(0)]),
                        clj::sym(":>"),
                        clj::sym("*x"),
                    ],
                ),
            ],
        ));
        assert!(verify(&doc)
            .iter()
            .any(|issue| issue.invariant == "clj/no-clojure-control-in-dataflow"));
    }
}
