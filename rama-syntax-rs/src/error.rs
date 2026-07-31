//! Parse and check diagnostics.

use crate::span::Span;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Diagnostic {
    pub message: String,
    pub span: Span,
    pub kind: DiagnosticKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiagnosticKind {
    Lex,
    Parse,
    Type,
    Rule,
}

impl Diagnostic {
    pub fn lex(span: Span, message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            span,
            kind: DiagnosticKind::Lex,
        }
    }

    pub fn parse(span: Span, message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            span,
            kind: DiagnosticKind::Parse,
        }
    }

    pub fn type_error(span: Span, message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            span,
            kind: DiagnosticKind::Type,
        }
    }

    pub fn rule(span: Span, message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            span,
            kind: DiagnosticKind::Rule,
        }
    }

    /// Render with a one-line snippet from `src`.
    pub fn render(&self, src: &str) -> String {
        let (line, col) = offset_to_line_col(src, self.span.start);
        let line_text = src.lines().nth(line.saturating_sub(1)).unwrap_or("");
        format!(
            "{}:{}:{}: {}: {}\n  {}",
            kind_label(self.kind),
            line,
            col,
            kind_label(self.kind),
            self.message,
            line_text.trim_end()
        )
    }
}

impl fmt::Display for Diagnostic {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{} at {}: {}",
            kind_label(self.kind),
            self.span,
            self.message
        )
    }
}

fn kind_label(kind: DiagnosticKind) -> &'static str {
    match kind {
        DiagnosticKind::Lex => "lex",
        DiagnosticKind::Parse => "parse",
        DiagnosticKind::Type => "type",
        DiagnosticKind::Rule => "rule",
    }
}

fn offset_to_line_col(src: &str, offset: usize) -> (usize, usize) {
    let mut line = 1usize;
    let mut col = 1usize;
    for (i, ch) in src.char_indices() {
        if i >= offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    (line, col)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub diagnostics: Vec<Diagnostic>,
}

impl ParseError {
    pub fn one(diag: Diagnostic) -> Self {
        Self {
            diagnostics: vec![diag],
        }
    }
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (i, d) in self.diagnostics.iter().enumerate() {
            if i > 0 {
                writeln!(f)?;
            }
            write!(f, "{d}")?;
        }
        Ok(())
    }
}

impl std::error::Error for ParseError {}
