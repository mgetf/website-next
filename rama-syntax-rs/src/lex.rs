//! Lexer for Rama surface syntax.
//!
//! Token shapes follow `tree-sitter-rama` in tommy-mor/rama-syntax.

use crate::error::{Diagnostic, ParseError};
use crate::span::Span;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
    pub kind: TokenKind,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TokenKind {
    // Keywords / special forms
    RamaOp,
    RamaFn,
    Anchor,
    Hook,
    Unify,
    If,
    Else,
    Atomic,
    As,
    PState,
    Fixed,
    Map,
    Object,

    // Punctuation / operators
    LParen,
    RParen,
    LBrace,
    RBrace,
    LBracket,
    RBracket,
    Comma,
    Semicolon,
    Colon,
    BindPipe,   // `>` used as binding pipe / sink
    ArrowSelect, // `-->`
    ArrowTransform, // `!<--`
    ArrowType,  // `->` in pstate schemas

    // Literals / names
    Binding(String),     // `*foo` / `%bar`
    PStateRef(String),   // `$$matches`
    AnchorRef(String),   // `<root>`
    Keyword(String),     // `:ack-val`
    PipeVariant(String), // `|direct`
    Operator(String),    // `send-emits>`, `ack-return>`
    Ident(String),       // bare / qualified identifiers
    String(String),
    Int(i64),
    Bool(bool),

    Eof,
}

pub fn lex(src: &str) -> Result<Vec<Token>, ParseError> {
    let mut lx = Lexer::new(src);
    lx.tokenize_all()
}

struct Lexer<'a> {
    src: &'a str,
    bytes: &'a [u8],
    pos: usize,
    diagnostics: Vec<Diagnostic>,
}

impl<'a> Lexer<'a> {
    fn new(src: &'a str) -> Self {
        Self {
            src,
            bytes: src.as_bytes(),
            pos: 0,
            diagnostics: Vec::new(),
        }
    }

    fn tokenize_all(&mut self) -> Result<Vec<Token>, ParseError> {
        let mut tokens = Vec::new();
        loop {
            self.skip_trivia();
            if self.pos >= self.bytes.len() {
                tokens.push(Token {
                    kind: TokenKind::Eof,
                    span: Span::new(self.pos, self.pos),
                });
                break;
            }
            tokens.push(self.next_token());
        }
        if self.diagnostics.is_empty() {
            Ok(tokens)
        } else {
            Err(ParseError {
                diagnostics: self.diagnostics.clone(),
            })
        }
    }

    fn skip_trivia(&mut self) {
        loop {
            self.skip_ws();
            if self.starts_with("//") {
                while self.pos < self.bytes.len() && self.bytes[self.pos] != b'\n' {
                    self.pos += 1;
                }
                continue;
            }
            if self.starts_with("/*") {
                let start = self.pos;
                self.pos += 2;
                while self.pos + 1 < self.bytes.len()
                    && !(self.bytes[self.pos] == b'*' && self.bytes[self.pos + 1] == b'/')
                {
                    self.pos += 1;
                }
                if self.pos + 1 < self.bytes.len() {
                    self.pos += 2;
                } else {
                    self.diagnostics.push(Diagnostic::lex(
                        Span::new(start, self.pos),
                        "unterminated block comment",
                    ));
                }
                continue;
            }
            break;
        }
    }

    fn skip_ws(&mut self) {
        while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_whitespace() {
            self.pos += 1;
        }
    }

    fn starts_with(&self, s: &str) -> bool {
        self.src[self.pos..].starts_with(s)
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn bump(&mut self) -> Option<u8> {
        let b = self.peek()?;
        self.pos += 1;
        Some(b)
    }

    fn next_token(&mut self) -> Token {
        let start = self.pos;

        // Multi-char operators first
        if self.starts_with("!<--") {
            self.pos += 4;
            return Token {
                kind: TokenKind::ArrowTransform,
                span: Span::new(start, self.pos),
            };
        }
        if self.starts_with("-->") {
            self.pos += 3;
            return Token {
                kind: TokenKind::ArrowSelect,
                span: Span::new(start, self.pos),
            };
        }
        // Schema arrow `->` only when spaced (e.g. `String -> fixed`).
        // Bare `pool->set` / `aor-types/->valid-NodeOp` stay identifiers.
        if self.starts_with("->") {
            let spaced = start == 0
                || self.bytes[start - 1].is_ascii_whitespace()
                || matches!(
                    self.bytes[start - 1],
                    b'{' | b',' | b'(' | b'[' | b';'
                );
            let after = self.bytes.get(start + 2).copied();
            let followed_by_space_or_ident = matches!(
                after,
                Some(b) if b.is_ascii_whitespace() || b.is_ascii_alphabetic()
            );
            if spaced && followed_by_space_or_ident {
                self.pos += 2;
                return Token {
                    kind: TokenKind::ArrowType,
                    span: Span::new(start, self.pos),
                };
            }
        }
        if self.starts_with("unify>") {
            self.pos += 6;
            return Token {
                kind: TokenKind::Unify,
                span: Span::new(start, self.pos),
            };
        }

        match self.peek() {
            Some(b'(') => {
                self.pos += 1;
                Token {
                    kind: TokenKind::LParen,
                    span: Span::new(start, self.pos),
                }
            }
            Some(b')') => {
                self.pos += 1;
                Token {
                    kind: TokenKind::RParen,
                    span: Span::new(start, self.pos),
                }
            }
            Some(b'{') => {
                self.pos += 1;
                Token {
                    kind: TokenKind::LBrace,
                    span: Span::new(start, self.pos),
                }
            }
            Some(b'}') => {
                self.pos += 1;
                Token {
                    kind: TokenKind::RBrace,
                    span: Span::new(start, self.pos),
                }
            }
            Some(b'[') => {
                self.pos += 1;
                Token {
                    kind: TokenKind::LBracket,
                    span: Span::new(start, self.pos),
                }
            }
            Some(b']') => {
                self.pos += 1;
                Token {
                    kind: TokenKind::RBracket,
                    span: Span::new(start, self.pos),
                }
            }
            Some(b',') => {
                self.pos += 1;
                Token {
                    kind: TokenKind::Comma,
                    span: Span::new(start, self.pos),
                }
            }
            Some(b';') => {
                self.pos += 1;
                Token {
                    kind: TokenKind::Semicolon,
                    span: Span::new(start, self.pos),
                }
            }
            Some(b'>') => {
                self.pos += 1;
                Token {
                    kind: TokenKind::BindPipe,
                    span: Span::new(start, self.pos),
                }
            }
            Some(b'"') => self.lex_string(start),
            Some(b':') => self.lex_keyword(start),
            Some(b'|') => self.lex_pipe_variant(start),
            Some(b'<') => self.lex_anchor(start),
            Some(b'$') if self.starts_with("$$") => self.lex_pstate(start),
            Some(b'*') | Some(b'%') => self.lex_binding_or_op(start),
            Some(b) if b.is_ascii_digit() => self.lex_number(start),
            Some(b) if is_ident_start(b) => self.lex_ident_or_keyword_or_op(start),
            Some(b) => {
                self.pos += 1;
                self.diagnostics.push(Diagnostic::lex(
                    Span::new(start, self.pos),
                    format!("unexpected character {:?}", b as char),
                ));
                // recover with a dummy ident
                Token {
                    kind: TokenKind::Ident(format!("{}", b as char)),
                    span: Span::new(start, self.pos),
                }
            }
            None => Token {
                kind: TokenKind::Eof,
                span: Span::new(start, start),
            },
        }
    }

    fn lex_string(&mut self, start: usize) -> Token {
        self.pos += 1; // opening "
        let mut out = String::new();
        while let Some(b) = self.peek() {
            if b == b'"' {
                self.pos += 1;
                return Token {
                    kind: TokenKind::String(out),
                    span: Span::new(start, self.pos),
                };
            }
            if b == b'\\' {
                self.pos += 1;
                match self.bump() {
                    Some(b'n') => out.push('\n'),
                    Some(b't') => out.push('\t'),
                    Some(b'r') => out.push('\r'),
                    Some(b'"') => out.push('"'),
                    Some(b'\\') => out.push('\\'),
                    Some(c) => out.push(c as char),
                    None => break,
                }
                continue;
            }
            out.push(self.bump().unwrap() as char);
        }
        self.diagnostics.push(Diagnostic::lex(
            Span::new(start, self.pos),
            "unterminated string",
        ));
        Token {
            kind: TokenKind::String(out),
            span: Span::new(start, self.pos),
        }
    }

    fn lex_keyword(&mut self, start: usize) -> Token {
        self.pos += 1; // :
        let name_start = self.pos;
        while matches!(self.peek(), Some(b) if is_name_continue(b)) {
            self.pos += 1;
        }
        if self.pos == name_start {
            // bare `:` used as punctuation (hook:name is handled elsewhere)
            return Token {
                kind: TokenKind::Colon,
                span: Span::new(start, self.pos),
            };
        }
        let name = self.src[name_start..self.pos].to_string();
        Token {
            kind: TokenKind::Keyword(name),
            span: Span::new(start, self.pos),
        }
    }

    fn lex_pipe_variant(&mut self, start: usize) -> Token {
        self.pos += 1; // |
        let name_start = self.pos;
        while matches!(self.peek(), Some(b) if is_name_continue(b)) {
            self.pos += 1;
        }
        let name = self.src[name_start..self.pos].to_string();
        Token {
            kind: TokenKind::PipeVariant(name),
            span: Span::new(start, self.pos),
        }
    }

    fn lex_anchor(&mut self, start: usize) -> Token {
        self.pos += 1; // <
        let name_start = self.pos;
        while matches!(self.peek(), Some(b) if is_name_continue(b)) {
            self.pos += 1;
        }
        if self.peek() == Some(b'>') {
            let name = self.src[name_start..self.pos].to_string();
            self.pos += 1;
            Token {
                kind: TokenKind::AnchorRef(name),
                span: Span::new(start, self.pos),
            }
        } else {
            self.diagnostics.push(Diagnostic::lex(
                Span::new(start, self.pos),
                "unterminated anchor reference",
            ));
            Token {
                kind: TokenKind::AnchorRef(self.src[name_start..self.pos].to_string()),
                span: Span::new(start, self.pos),
            }
        }
    }

    fn lex_pstate(&mut self, start: usize) -> Token {
        self.pos += 2; // $$
        let name_start = self.pos;
        while matches!(self.peek(), Some(b) if is_name_continue(b) || b == b'.') {
            self.pos += 1;
        }
        let name = self.src[name_start..self.pos].to_string();
        Token {
            kind: TokenKind::PStateRef(name),
            span: Span::new(start, self.pos),
        }
    }

    fn lex_binding_or_op(&mut self, start: usize) -> Token {
        // Bindings are `*`/`%` + name. Operators may also start with these rarely;
        // stick to binding_name from the grammar.
        let prefix = self.bump().unwrap() as char;
        let name_start = self.pos;
        while matches!(self.peek(), Some(b) if is_name_continue(b) || b == b'.') {
            self.pos += 1;
        }
        // Operator ending in `>` e.g. unusual — if next is `>` and name looks like op, take it.
        // Prefer binding; trailing `>` after `*foo` is BindPipe, not part of the name.
        let name = format!("{prefix}{}", &self.src[name_start..self.pos]);
        Token {
            kind: TokenKind::Binding(name),
            span: Span::new(start, self.pos),
        }
    }

    fn lex_number(&mut self, start: usize) -> Token {
        while matches!(self.peek(), Some(b) if b.is_ascii_digit()) {
            self.pos += 1;
        }
        let text = &self.src[start..self.pos];
        let n = text.parse::<i64>().unwrap_or(0);
        Token {
            kind: TokenKind::Int(n),
            span: Span::new(start, self.pos),
        }
    }

    fn lex_ident_or_keyword_or_op(&mut self, start: usize) -> Token {
        // Consume a rich identifier that may include `/`, `:`, `.`, `*`, `%`, `|`, `-`, `->`
        // and may end with `>` for Rama operators.
        while let Some(b) = self.peek() {
            if is_ident_continue_rich(b) {
                self.pos += 1;
                continue;
            }
            // Embedded `->` in qualified names: `pool->set`, `foo/->Bar`
            if b == b'-' && self.bytes.get(self.pos + 1) == Some(&b'>') {
                let after = self.bytes.get(self.pos + 2).copied();
                if matches!(
                    after,
                    Some(c) if is_ident_continue_rich(c) || c == b'>'
                ) {
                    self.pos += 2;
                    continue;
                }
            }
            // Trailing `>` for operator names when attached (no space): `ack-return>`, `NONE>`
            if b == b'>' {
                let candidate = &self.src[start..self.pos + 1];
                if looks_like_operator(candidate) {
                    self.pos += 1;
                    let text = candidate.to_string();
                    // Navigators are idents; ops are Operator.
                    let kind = if matches!(text.as_str(), "NONE>") {
                        TokenKind::Ident(text)
                    } else {
                        TokenKind::Operator(text)
                    };
                    return Token {
                        kind,
                        span: Span::new(start, self.pos),
                    };
                }
            }
            break;
        }

        let text = &self.src[start..self.pos];
        let kind = match text {
            "ramaop" => TokenKind::RamaOp,
            "ramafn" => TokenKind::RamaFn,
            "anchor" => TokenKind::Anchor,
            "hook" => TokenKind::Hook,
            "if" => TokenKind::If,
            "else" => TokenKind::Else,
            "atomic" => TokenKind::Atomic,
            "as" => TokenKind::As,
            "pstate" => TokenKind::PState,
            "fixed" => TokenKind::Fixed,
            "map" => TokenKind::Map,
            "Object" | "object" => TokenKind::Object,
            "true" => TokenKind::Bool(true),
            "false" => TokenKind::Bool(false),
            _ => TokenKind::Ident(text.to_string()),
        };
        Token {
            kind,
            span: Span::new(start, self.pos),
        }
    }
}

fn is_ident_start(b: u8) -> bool {
    b.is_ascii_alphabetic() || b == b'_' || b == b'=' || b == b'?'
}

fn is_name_continue(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'-'
}

fn is_ident_continue_rich(b: u8) -> bool {
    b.is_ascii_alphanumeric()
        || matches!(b, b'_' | b'-' | b'.' | b'/' | b':' | b'%' | b'*' | b'|' | b'?' | b'=')
}

/// Operators end with `>` and have at least one letter before it.
/// Also accepts navigator tokens like `NONE>`.
fn looks_like_operator(s: &str) -> bool {
    if !s.ends_with('>') || s.len() < 2 {
        return false;
    }
    if matches!(s, "NONE>") {
        return true;
    }
    let body = &s[..s.len() - 1];
    body.chars().next().is_some_and(|c| c.is_ascii_lowercase())
        && body
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | '/' | ':' | '%' | '*' | '|'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lexes_select_and_transform() {
        let tokens = lex("$$matches --> keypath(*id); $$matches !<-- keypath(*id), termval(0);")
            .unwrap();
        assert!(tokens
            .iter()
            .any(|t| matches!(t.kind, TokenKind::ArrowSelect)));
        assert!(tokens
            .iter()
            .any(|t| matches!(t.kind, TokenKind::ArrowTransform)));
        assert!(tokens.iter().any(|t| matches!(
            &t.kind,
            TokenKind::PStateRef(n) if n == "matches"
        )));
        assert!(tokens.iter().any(|t| matches!(
            &t.kind,
            TokenKind::Binding(n) if n == "*id"
        )));
    }

    #[test]
    fn lexes_operator_ack_return() {
        let tokens = lex("ack-return>({\"ok\" true});").unwrap();
        assert!(tokens.iter().any(|t| matches!(
            &t.kind,
            TokenKind::Operator(n) if n == "ack-return>"
        )));
    }
}
