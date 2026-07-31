//! .rama v2 lexer ([`logos`]).

use crate::error::{Diagnostic, ParseError};
use crate::span::Span;
use logos::Logos;

pub type SpannedToken = (TokenKind, Span);

#[derive(Logos, Debug, Clone, PartialEq, Eq, Hash)]
#[logos(skip r"[ \t\r\n\f]+")]
#[logos(skip r"//[^\n]*")]
#[logos(skip r"/\*(?:[^*]|\*[^/])*\*/")]
pub enum TokenKind {
    #[token("module")]
    Module,
    #[token("struct")]
    Struct,
    #[token("pstate")]
    PState,
    #[token("depot")]
    Depot,
    #[token("op")]
    Op,
    #[token("fn")]
    Fn,
    #[token("extern")]
    Extern,
    #[token("let")]
    Let,
    #[token("fail")]
    Fail,
    #[token("return")]
    Return,
    #[token("if")]
    If,
    #[token("else")]
    Else,
    #[token("keyed-by")]
    KeyedBy,
    #[token("Map")]
    Map,
    #[token("Object")]
    Object,

    #[token("true", |_| true)]
    #[token("false", |_| false)]
    Bool(bool),

    #[token("!<--")]
    ArrowTransform,
    #[token("-->")]
    ArrowSelect,
    #[token("->")]
    ThinArrow,
    #[token("==")]
    EqEq,
    #[token("!=")]
    NotEq,
    #[token(">=")]
    Ge,
    #[token("=", priority = 10)]
    Eq,
    #[token("?", priority = 10)]
    Question,
    #[token("@")]
    At,
    #[token(".")]
    Dot,
    #[token("/")]
    Slash,
    #[token("+")]
    Plus,
    #[token("|")]
    Union,

    #[token("(")]
    LParen,
    #[token(")")]
    RParen,
    #[token("{")]
    LBrace,
    #[token("}")]
    RBrace,
    #[token("[")]
    LBracket,
    #[token("]")]
    RBracket,
    #[token(",")]
    Comma,
    #[token(";")]
    Semicolon,
    #[token(":")]
    Colon,
    #[token("<")]
    Lt,
    /// Bind pipe after select, generic close, and callee `>` in `>(a, b)`.
    #[token(">")]
    Gt,

    #[regex(r#"\$\$[A-Za-z_][\w.-]*"#, |lex| lex.slice()[2..].to_string())]
    PStateRef(String),

    #[regex(r#":[A-Za-z_][\w-]*"#, |lex| lex.slice()[1..].to_string())]
    Keyword(String),

    #[regex(r#"\|[A-Za-z_][\w-]*"#, |lex| lex.slice()[1..].to_string())]
    Pipe(String),

    #[regex(r#""([^"\\]|\\.)*""#, |lex| {
        let raw = lex.slice();
        unescape(&raw[1..raw.len() - 1])
    })]
    String(String),

    #[regex(r#"[0-9]+"#, |lex| lex.slice().parse().unwrap_or(0))]
    Int(i64),

    /// Must win over hyphenated idents (otherwise `nil-` + `>` + `val`).
    #[token("nil->val", |_| "nil->val".to_string(), priority = 20)]
    /// Rama's delete navigator; `>` cannot be part of the ident regex.
    #[token("NONE>", |_| "NONE>".to_string(), priority = 20)]
    #[regex(r#"[A-Za-z_][A-Za-z0-9_?]*(?:-[A-Za-z0-9_?]+)*\??"#, |lex| lex.slice().to_string(), priority = 1)]
    Ident(String),
}

fn unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            match chars.next() {
                Some('n') => out.push('\n'),
                Some('t') => out.push('\t'),
                Some('r') => out.push('\r'),
                Some('"') => out.push('"'),
                Some('\\') => out.push('\\'),
                Some(other) => out.push(other),
                None => break,
            }
        } else {
            out.push(c);
        }
    }
    out
}

pub fn lex(src: &str) -> Result<Vec<SpannedToken>, ParseError> {
    let mut lexer = TokenKind::lexer(src);
    let mut tokens = Vec::new();
    let mut diagnostics = Vec::new();

    while let Some(result) = lexer.next() {
        let span = Span::new(lexer.span().start, lexer.span().end);
        match result {
            Ok(tok) => tokens.push((tok, span)),
            Err(()) => {
                diagnostics.push(Diagnostic::lex(
                    span,
                    format!("unexpected {:?}", span.slice(src)),
                ));
            }
        }
    }

    if diagnostics.is_empty() {
        Ok(tokens)
    } else {
        Err(ParseError { diagnostics })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lexes_v2_surface() {
        let tokens = lex(r#"pstate $$matches: Map<String, Match>
               $$mapBans --> keypath(matchId) > { turn }
               fail "x" if turn == nil
               |hash homeTeamId"#)
        .unwrap();
        assert!(tokens.iter().any(|(t, _)| matches!(t, TokenKind::Map)));
        assert!(tokens
            .iter()
            .any(|(t, _)| matches!(t, TokenKind::ArrowSelect)));
        assert!(tokens.iter().any(|(t, _)| matches!(t, TokenKind::Fail)));
        assert!(tokens.iter().any(|(t, _)| matches!(t, TokenKind::EqEq)));
        assert!(tokens
            .iter()
            .any(|(t, _)| matches!(t, TokenKind::Pipe(p) if p == "hash")));
    }
}
