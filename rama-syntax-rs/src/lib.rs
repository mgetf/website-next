//! Rust parser and type-checker stub for Rama surface syntax (`.rama`).
//!
//! Inspired by [tommy-mor/rama-syntax](https://github.com/tommy-mor/rama-syntax):
//! C-style dataflow syntax with `-->` select / `!<--` transform, plus a
//! `pstate` schema declaration that feeds a path static type-checker stub.
//!
//! Fixtures under `fixtures/` mirror patterns from this repo's Clojure
//! `MatchModule` / `UsersModule` spikes.

pub mod ast;
pub mod check;
pub mod error;
pub mod lex;
pub mod parse;
pub mod span;

pub use ast::SourceFile;
pub use check::{CheckResult, TypeEnv, check};
pub use error::{Diagnostic, DiagnosticKind, ParseError};
pub use lex::{Token, TokenKind, lex};
pub use parse::parse;

/// Parse source and run the type-checker stub.
pub fn analyze(src: &str) -> Result<(SourceFile, CheckResult), ParseError> {
    let file = parse(src)?;
    let result = check(&file);
    Ok((file, result))
}
