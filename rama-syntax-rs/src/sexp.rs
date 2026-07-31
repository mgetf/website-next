//! S-expression mode for `.rama` files that emit arbitrary Clojure.
//!
//! If a `.rama` file's first non-comment token is `(`, it is parsed as a
//! sequence of Clojure/EDN forms into [`clj::Form`] and pretty-printed.
//! This is how tests (and any non-module Clojure) live as `.rama` sources.

use crate::clj::{self, Document, Form};
use crate::error::{Diagnostic, ParseError};
use crate::span::Span;

pub fn looks_like_sexp(src: &str) -> bool {
    let trimmed = strip_leading_trivia(src);
    trimmed.starts_with('(') || trimmed.starts_with("#!clj")
}

fn strip_leading_trivia(src: &str) -> &str {
    let mut rest = src;
    loop {
        rest = rest.trim_start();
        if rest.starts_with("#!clj") {
            rest = rest["#!clj".len()..].trim_start();
            continue;
        }
        if rest.starts_with("//") || rest.starts_with(';') {
            if let Some(idx) = rest.find('\n') {
                rest = &rest[idx + 1..];
                continue;
            }
            return "";
        }
        return rest;
    }
}

pub fn parse_document(src: &str) -> Result<Document, ParseError> {
    let body = if looks_like_sexp(src) {
        let trimmed = strip_leading_trivia(src);
        if trimmed.starts_with("#!clj") {
            strip_leading_trivia(trimmed)
        } else {
            // Keep full source for span accuracy; parser skips trivia.
            src
        }
    } else {
        src
    };

    let mut parser = Parser {
        src: body,
        pos: 0,
        diagnostics: Vec::new(),
    };
    // Skip shebang-style marker if present at the very start after trivia.
    parser.skip_trivia();
    if parser.remaining().starts_with("#!clj") {
        parser.pos += "#!clj".len();
    }

    let mut doc = Document::new();
    doc.push(clj::comment(
        "Generated from .rama sexp mode — edit the .rama source.",
    ));
    parser.skip_trivia();
    while !parser.eof() {
        if let Some(form) = parser.parse_form() {
            doc.push(form);
        } else if !parser.diagnostics.is_empty() {
            break;
        } else {
            break;
        }
        parser.skip_trivia();
    }
    parser.skip_trivia();
    if !parser.eof() {
        parser.push_error("unexpected trailing input in sexp .rama file");
    }
    if parser.diagnostics.is_empty() {
        Ok(doc)
    } else {
        Err(ParseError {
            diagnostics: parser.diagnostics,
        })
    }
}

struct Parser<'a> {
    src: &'a str,
    pos: usize,
    diagnostics: Vec<Diagnostic>,
}

impl<'a> Parser<'a> {
    fn eof(&self) -> bool {
        self.pos >= self.src.len()
    }

    fn remaining(&self) -> &'a str {
        &self.src[self.pos..]
    }

    fn peek(&self) -> Option<char> {
        self.remaining().chars().next()
    }

    fn bump(&mut self) -> Option<char> {
        let ch = self.peek()?;
        self.pos += ch.len_utf8();
        Some(ch)
    }

    fn span_here(&self) -> Span {
        Span::new(self.pos, self.pos)
    }

    fn push_error(&mut self, message: impl Into<String>) {
        self.diagnostics
            .push(Diagnostic::parse(self.span_here(), message));
    }

    fn skip_trivia(&mut self) {
        loop {
            if self.eof() {
                return;
            }
            let rest = self.remaining();
            if rest.starts_with("//") || rest.starts_with(';') {
                if let Some(idx) = rest.find('\n') {
                    self.pos += idx + 1;
                    continue;
                }
                self.pos = self.src.len();
                return;
            }
            match self.peek() {
                Some(ch) if ch.is_whitespace() => {
                    self.bump();
                }
                _ => return,
            }
        }
    }

    fn parse_form(&mut self) -> Option<Form> {
        self.skip_trivia();
        match self.peek()? {
            '(' => self.parse_list(),
            '[' => self.parse_vector(),
            '{' => self.parse_map(),
            '"' => self.parse_string(),
            ':' => self.parse_keyword(),
            '#' => self.parse_dispatch(),
            '\'' => {
                self.bump();
                let inner = self.parse_form()?;
                Some(clj::list([clj::sym("quote"), inner]))
            }
            ch if ch == '-' || ch.is_ascii_digit() => self.parse_number_or_symbol(),
            _ => self.parse_symbol(),
        }
    }

    fn parse_list(&mut self) -> Option<Form> {
        self.bump(); // (
        let mut items = Vec::new();
        loop {
            self.skip_trivia();
            if self.peek() == Some(')') {
                self.bump();
                return Some(Form::List(items));
            }
            if self.eof() {
                self.push_error("unclosed list");
                return None;
            }
            items.push(self.parse_form()?);
        }
    }

    fn parse_vector(&mut self) -> Option<Form> {
        self.bump(); // [
        let mut items = Vec::new();
        loop {
            self.skip_trivia();
            if self.peek() == Some(']') {
                self.bump();
                return Some(Form::Vector(items));
            }
            if self.eof() {
                self.push_error("unclosed vector");
                return None;
            }
            items.push(self.parse_form()?);
        }
    }

    fn parse_map(&mut self) -> Option<Form> {
        self.bump(); // {
        let mut entries = Vec::new();
        loop {
            self.skip_trivia();
            if self.peek() == Some('}') {
                self.bump();
                return Some(Form::Map(entries));
            }
            if self.eof() {
                self.push_error("unclosed map");
                return None;
            }
            let key = self.parse_form()?;
            self.skip_trivia();
            if self.peek() == Some('}') {
                self.push_error("map entry missing value");
                return None;
            }
            let value = self.parse_form()?;
            entries.push((key, value));
        }
    }

    fn parse_dispatch(&mut self) -> Option<Form> {
        self.bump(); // #
        match self.peek() {
            Some('{') => {
                // set literal #{…} → (hash-set …) for broad compatibility
                self.bump();
                let mut items = vec![clj::sym("hash-set")];
                loop {
                    self.skip_trivia();
                    if self.peek() == Some('}') {
                        self.bump();
                        return Some(Form::List(items));
                    }
                    if self.eof() {
                        self.push_error("unclosed set");
                        return None;
                    }
                    items.push(self.parse_form()?);
                }
            }
            Some('"') => {
                // regex #"…" — keep as symbol-ish by reading string and wrapping
                let s = match self.parse_string()? {
                    Form::String(s) => s,
                    _ => return None,
                };
                Some(clj::list([clj::sym("re-pattern"), clj::string(s)]))
            }
            _ => {
                self.push_error("unsupported dispatch macro");
                None
            }
        }
    }

    fn parse_string(&mut self) -> Option<Form> {
        self.bump(); // "
        let mut out = String::new();
        while let Some(ch) = self.bump() {
            match ch {
                '"' => return Some(Form::String(out)),
                '\\' => match self.bump() {
                    Some('n') => out.push('\n'),
                    Some('t') => out.push('\t'),
                    Some('r') => out.push('\r'),
                    Some('"') => out.push('"'),
                    Some('\\') => out.push('\\'),
                    Some(other) => out.push(other),
                    None => {
                        self.push_error("unterminated string escape");
                        return None;
                    }
                },
                _ => out.push(ch),
            }
        }
        self.push_error("unterminated string");
        None
    }

    fn parse_keyword(&mut self) -> Option<Form> {
        self.bump(); // :
        let name = self.read_token_body();
        if name.is_empty() {
            self.push_error("empty keyword");
            return None;
        }
        Some(Form::Keyword(name))
    }

    fn parse_number_or_symbol(&mut self) -> Option<Form> {
        let start = self.pos;
        let token = self.read_token_body();
        if token == "-" || token == "+" {
            // bare sign is a symbol
            return Some(Form::Symbol(token));
        }
        if let Ok(n) = token.parse::<i64>() {
            return Some(Form::Int(n));
        }
        // floats / ratios stay as symbols so we don't lose them
        if token
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_digit() || c == '-')
        {
            // rewind conceptually — already consumed; emit symbol
            let _ = start;
            return Some(Form::Symbol(token));
        }
        Some(Form::Symbol(token))
    }

    fn parse_symbol(&mut self) -> Option<Form> {
        let token = self.read_token_body();
        if token.is_empty() {
            self.push_error(format!(
                "expected form, found {:?}",
                self.peek().unwrap_or('\0')
            ));
            return None;
        }
        match token.as_str() {
            "nil" => Some(Form::Nil),
            "true" => Some(Form::Bool(true)),
            "false" => Some(Form::Bool(false)),
            _ => Some(Form::Symbol(token)),
        }
    }

    fn read_token_body(&mut self) -> String {
        let mut out = String::new();
        while let Some(ch) = self.peek() {
            if ch.is_whitespace()
                || matches!(ch, '(' | ')' | '[' | ']' | '{' | '}' | '"' | ';' | ',')
            {
                break;
            }
            // // comments
            if ch == '/' && self.remaining().starts_with("//") {
                break;
            }
            out.push(ch);
            self.bump();
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ns_and_deftest_shape() {
        let src = r#"
(ns demo-test
  (:require [clojure.test :refer [deftest is]]))

(def MODULE-NAME "x")

(deftest t
  (is (= 1 1)))
"#;
        assert!(looks_like_sexp(src));
        let doc = parse_document(src).expect("parse");
        let rendered = doc.render();
        assert!(rendered.contains("(ns demo-test"));
        assert!(rendered.contains("(deftest t"));
        assert!(rendered.contains("MODULE-NAME"));
    }

    #[test]
    fn surface_module_is_not_sexp() {
        let src = r#"
// comment
module foo/Bar topology t
"#;
        assert!(!looks_like_sexp(src));
    }
}
