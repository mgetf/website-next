//! .rama v2 — parser (logos + chumsky), path checker stub, Clojure transpile.
//!
//! Pipeline: source → rama AST → [`clj::Form`] IR → pretty-printed Clojure.

pub mod ast;
pub mod check;
pub mod clj;
pub mod clj_verify;
pub mod contracts;
pub mod emit_clj;
pub mod error;
pub mod lex;
pub mod lower;
pub mod parse;
pub mod rama_ir;
pub mod rules;
pub mod span;
pub mod types;

pub use ast::SourceFile;
pub use check::{check, CheckResult, TypeEnv};
pub use clj::{Document as CljDocument, Form as CljForm};
pub use emit_clj::{compile as compile_clj, emit_clojure};
pub use error::{Diagnostic, DiagnosticKind, ParseError};
pub use lex::{lex, SpannedToken, TokenKind};
pub use parse::parse;
pub use rama_ir::Program as RamaProgram;
pub use rules::Violation as RuleViolation;

pub fn analyze(src: &str) -> Result<(SourceFile, CheckResult), ParseError> {
    let file = parse(src)?;
    let result = check(&file);
    Ok((file, result))
}
