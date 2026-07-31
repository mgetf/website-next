//! .rama v2 — parser (logos + chumsky), path checker stub, Clojure transpile.
//!
//! Pipeline: source → rama AST → [`clj::Form`] IR → pretty-printed Clojure.

pub mod ast;
pub mod check;
pub mod clj;
pub mod emit_clj;
pub mod error;
pub mod lex;
pub mod lower;
pub mod parse;
pub mod span;

pub use ast::SourceFile;
pub use check::{check, CheckResult, TypeEnv};
pub use clj::{Document as CljDocument, Form as CljForm};
pub use emit_clj::{compile as compile_clj, emit_clojure};
pub use error::{Diagnostic, DiagnosticKind, ParseError};
pub use lex::{lex, SpannedToken, TokenKind};
pub use parse::parse;

pub fn analyze(src: &str) -> Result<(SourceFile, CheckResult), ParseError> {
    let file = parse(src)?;
    let result = check(&file);
    Ok((file, result))
}
