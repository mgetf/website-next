//! Recursive-descent parser for Rama surface syntax.

use crate::ast::*;
use crate::error::{Diagnostic, ParseError};
use crate::lex::{lex, Token, TokenKind};
use crate::span::{Span, Spanned};

pub fn parse(src: &str) -> Result<SourceFile, ParseError> {
    let tokens = lex(src)?;
    let mut p = Parser::new(tokens);
    p.parse_source_file()
}

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn new(tokens: Vec<Token>) -> Self {
        Self { tokens, pos: 0 }
    }

    fn peek(&self) -> &Token {
        self.tokens
            .get(self.pos)
            .unwrap_or_else(|| self.tokens.last().expect("token stream"))
    }

    fn peek_kind(&self) -> &TokenKind {
        &self.peek().kind
    }

    fn bump(&mut self) -> Token {
        let t = self.peek().clone();
        if !matches!(t.kind, TokenKind::Eof) {
            self.pos += 1;
        }
        t
    }

    fn expect(&mut self, kind: TokenKind, msg: &str) -> Result<Token, ParseError> {
        if std::mem::discriminant(self.peek_kind()) == std::mem::discriminant(&kind) {
            Ok(self.bump())
        } else {
            Err(ParseError::one(Diagnostic::parse(
                self.peek().span,
                format!("{msg}, got {:?}", self.peek_kind()),
            )))
        }
    }

    fn parse_source_file(&mut self) -> Result<SourceFile, ParseError> {
        let start = self.peek().span.start;
        let mut items = Vec::new();
        while !matches!(self.peek_kind(), TokenKind::Eof) {
            items.push(self.parse_item()?);
        }
        let end = self.peek().span.end;
        Ok(SourceFile {
            items,
            span: Span::new(start, end),
        })
    }

    fn parse_item(&mut self) -> Result<Item, ParseError> {
        match self.peek_kind() {
            TokenKind::RamaOp => Ok(Item::RamaOp(self.parse_ramaop()?)),
            TokenKind::RamaFn => Ok(Item::RamaFn(self.parse_ramafn()?)),
            TokenKind::PState => Ok(Item::PState(self.parse_pstate_decl()?)),
            _ => Err(ParseError::one(Diagnostic::parse(
                self.peek().span,
                format!(
                    "expected ramaop, ramafn, or pstate, got {:?}",
                    self.peek_kind()
                ),
            ))),
        }
    }

    fn parse_ramaop(&mut self) -> Result<RamaOpDef, ParseError> {
        let start = self
            .expect(TokenKind::RamaOp, "expected ramaop")?
            .span
            .start;
        let name = self.parse_op_or_ident_name()?;
        self.expect(TokenKind::LParen, "expected '(' after ramaop name")?;
        let params = self.parse_param_list()?;
        self.expect(TokenKind::RParen, "expected ')' after parameters")?;
        let body = self.parse_block()?;
        let span = Span::new(start, body.span.end);
        Ok(RamaOpDef {
            name,
            params,
            body,
            span,
        })
    }

    fn parse_ramafn(&mut self) -> Result<RamaFnDef, ParseError> {
        let start = self
            .expect(TokenKind::RamaFn, "expected ramafn")?
            .span
            .start;
        let name_tok = self.bump();
        let name = match name_tok.kind {
            TokenKind::Binding(n) => Spanned::new(n, name_tok.span),
            TokenKind::Ident(n) => Spanned::new(n, name_tok.span),
            _ => {
                return Err(ParseError::one(Diagnostic::parse(
                    name_tok.span,
                    "expected ramafn name",
                )))
            }
        };
        self.expect(TokenKind::LParen, "expected '(' after ramafn name")?;
        let params = self.parse_param_list()?;
        self.expect(TokenKind::RParen, "expected ')'")?;
        self.expect(TokenKind::LBrace, "expected '{' for ramafn body")?;
        let mut body = Vec::new();
        while !matches!(self.peek_kind(), TokenKind::RBrace | TokenKind::Eof) {
            body.push(self.parse_inline_binding()?);
        }
        let end = self.expect(TokenKind::RBrace, "expected '}'")?.span.end;
        if body.is_empty() {
            return Err(ParseError::one(Diagnostic::parse(
                Span::new(start, end),
                "ramafn body must contain at least one binding",
            )));
        }
        Ok(RamaFnDef {
            name,
            params,
            body,
            span: Span::new(start, end),
        })
    }

    fn parse_pstate_decl(&mut self) -> Result<PStateDecl, ParseError> {
        let start = self
            .expect(TokenKind::PState, "expected pstate")?
            .span
            .start;
        let name_tok = self.bump();
        let name = match name_tok.kind {
            TokenKind::PStateRef(n) => Spanned::new(n, name_tok.span),
            _ => {
                return Err(ParseError::one(Diagnostic::parse(
                    name_tok.span,
                    "expected $$pstate name",
                )))
            }
        };
        self.expect(TokenKind::LBrace, "expected '{' after pstate name")?;
        let key = self.parse_type_expr()?;
        self.expect(TokenKind::ArrowType, "expected '->' in pstate schema")?;
        let value = self.parse_type_expr()?;
        let end = self.expect(TokenKind::RBrace, "expected '}'")?.span.end;
        Ok(PStateDecl {
            name,
            key,
            value,
            span: Span::new(start, end),
        })
    }

    fn parse_type_expr(&mut self) -> Result<Spanned<TypeExpr>, ParseError> {
        let start = self.peek().span.start;
        match self.peek_kind() {
            TokenKind::Fixed => {
                self.bump();
                self.expect(TokenKind::LBrace, "expected '{' after fixed")?;
                let mut fields = Vec::new();
                while !matches!(self.peek_kind(), TokenKind::RBrace | TokenKind::Eof) {
                    let key_tok = self.bump();
                    let key = match key_tok.kind {
                        TokenKind::String(s) => s,
                        TokenKind::Ident(s) => s,
                        TokenKind::Keyword(s) => s,
                        _ => {
                            return Err(ParseError::one(Diagnostic::parse(
                                key_tok.span,
                                "expected field name in fixed schema",
                            )))
                        }
                    };
                    // optional colon
                    if matches!(self.peek_kind(), TokenKind::Colon) {
                        self.bump();
                    }
                    let ty = self.parse_type_expr()?.node;
                    fields.push((key, ty));
                    if matches!(self.peek_kind(), TokenKind::Comma) {
                        self.bump();
                    }
                }
                let end = self.expect(TokenKind::RBrace, "expected '}'")?.span.end;
                Ok(Spanned::new(
                    TypeExpr::Fixed { fields },
                    Span::new(start, end),
                ))
            }
            TokenKind::Map => {
                self.bump();
                let inner = self.parse_type_expr()?;
                Ok(Spanned::new(
                    TypeExpr::Map {
                        value: Box::new(inner.node),
                    },
                    Span::new(start, inner.span.end),
                ))
            }
            TokenKind::Object => {
                let t = self.bump();
                Ok(Spanned::new(TypeExpr::Object, t.span))
            }
            TokenKind::Ident(_) | TokenKind::String(_) => {
                let t = self.bump();
                let name = match t.kind {
                    TokenKind::Ident(s) | TokenKind::String(s) => s,
                    _ => unreachable!(),
                };
                Ok(Spanned::new(TypeExpr::Named(name), t.span))
            }
            _ => Err(ParseError::one(Diagnostic::parse(
                self.peek().span,
                format!("expected type expression, got {:?}", self.peek_kind()),
            ))),
        }
    }

    fn parse_op_or_ident_name(&mut self) -> Result<Spanned<String>, ParseError> {
        let t = self.bump();
        match t.kind {
            TokenKind::Operator(n) | TokenKind::Ident(n) => Ok(Spanned::new(n, t.span)),
            _ => Err(ParseError::one(Diagnostic::parse(
                t.span,
                "expected ramaop name",
            ))),
        }
    }

    fn parse_param_list(&mut self) -> Result<Vec<Spanned<Param>>, ParseError> {
        let mut params = Vec::new();
        if matches!(self.peek_kind(), TokenKind::RParen) {
            return Ok(params);
        }
        loop {
            let t = self.bump();
            let param = match t.kind {
                TokenKind::Binding(n) => Spanned::new(Param::Binding(n), t.span),
                TokenKind::Ident(n) => Spanned::new(Param::Ident(n), t.span),
                _ => {
                    return Err(ParseError::one(Diagnostic::parse(
                        t.span,
                        "expected parameter",
                    )))
                }
            };
            params.push(param);
            if matches!(self.peek_kind(), TokenKind::Comma) {
                self.bump();
                continue;
            }
            break;
        }
        Ok(params)
    }

    fn parse_block(&mut self) -> Result<Block, ParseError> {
        let start = self.expect(TokenKind::LBrace, "expected '{'")?.span.start;
        let mut stmts = Vec::new();
        while !matches!(self.peek_kind(), TokenKind::RBrace | TokenKind::Eof) {
            stmts.push(self.parse_stmt()?);
        }
        let end = self.expect(TokenKind::RBrace, "expected '}'")?.span.end;
        Ok(Block {
            stmts,
            span: Span::new(start, end),
        })
    }

    fn parse_stmt(&mut self) -> Result<Stmt, ParseError> {
        match self.peek_kind() {
            TokenKind::Anchor => self.parse_anchor_stmt(),
            TokenKind::Hook => self.parse_hook_stmt(),
            TokenKind::Unify => self.parse_unify_stmt(),
            TokenKind::If => self.parse_if_stmt(),
            TokenKind::Atomic => self.parse_atomic_stmt(),
            TokenKind::RamaFn => {
                let def = self.parse_ramafn()?;
                self.optional_semi();
                Ok(Stmt::RamaFn(def))
            }
            TokenKind::BindPipe => self.parse_sink_stmt(),
            TokenKind::PStateRef(_) => self.parse_pstate_stmt(),
            _ => self.parse_effect_stmt(),
        }
    }

    fn parse_anchor_stmt(&mut self) -> Result<Stmt, ParseError> {
        let start = self.bump().span.start;
        let a = self.bump();
        let TokenKind::AnchorRef(name) = a.kind else {
            return Err(ParseError::one(Diagnostic::parse(
                a.span,
                "expected <anchor>",
            )));
        };
        let end = self.optional_semi().max(a.span.end);
        Ok(Stmt::Anchor {
            anchor: Spanned::new(name, a.span),
            span: Span::new(start, end),
        })
    }

    fn parse_hook_stmt(&mut self) -> Result<Stmt, ParseError> {
        let start = self.bump().span.start;
        if matches!(self.peek_kind(), TokenKind::Colon) {
            self.bump();
            let name = self.parse_callable_name()?;
            let arg = if matches!(self.peek_kind(), TokenKind::LParen) {
                self.bump();
                // hook:name(arg) — single argument expression, or empty
                let arg = if matches!(self.peek_kind(), TokenKind::RParen) {
                    None
                } else {
                    // may be multiple comma-separated — fold as call args into a list? grammar says single _expression
                    // but first.rama has hook:writing-result(*a, *b, *c) — allow arg list as one call-like
                    let mut args = vec![self.parse_expr()?];
                    while matches!(self.peek_kind(), TokenKind::Comma) {
                        self.bump();
                        args.push(self.parse_expr()?);
                    }
                    if args.len() == 1 {
                        Some(args.remove(0))
                    } else {
                        let span = args
                            .first()
                            .unwrap()
                            .span()
                            .merge(args.last().unwrap().span());
                        Some(Expr::List { elems: args, span })
                    }
                };
                self.expect(TokenKind::RParen, "expected ')' after hook args")?;
                arg
            } else {
                None
            };
            let end = self.optional_semi();
            return Ok(Stmt::HookNamed {
                name,
                arg,
                span: Span::new(start, end),
            });
        }
        let a = self.bump();
        let TokenKind::AnchorRef(name) = a.kind else {
            return Err(ParseError::one(Diagnostic::parse(
                a.span,
                "expected hook <anchor> or hook:name",
            )));
        };
        let end = self.optional_semi().max(a.span.end);
        Ok(Stmt::HookAnchor {
            anchor: Spanned::new(name, a.span),
            span: Span::new(start, end),
        })
    }

    fn parse_unify_stmt(&mut self) -> Result<Stmt, ParseError> {
        let start = self.bump().span.start;
        self.expect(TokenKind::LParen, "expected '(' after unify>")?;
        let mut anchors = Vec::new();
        loop {
            let a = self.bump();
            let TokenKind::AnchorRef(name) = a.kind else {
                return Err(ParseError::one(Diagnostic::parse(
                    a.span,
                    "expected anchor in unify>",
                )));
            };
            anchors.push(Spanned::new(name, a.span));
            if matches!(self.peek_kind(), TokenKind::Comma) {
                self.bump();
                continue;
            }
            break;
        }
        self.expect(TokenKind::RParen, "expected ')'")?;
        let end = self.optional_semi();
        Ok(Stmt::Unify {
            anchors,
            span: Span::new(start, end),
        })
    }

    fn parse_if_stmt(&mut self) -> Result<Stmt, ParseError> {
        let start = self.bump().span.start;
        self.expect(TokenKind::LParen, "expected '(' after if")?;
        let condition = self.parse_expr()?;
        self.expect(TokenKind::RParen, "expected ')' after if condition")?;
        let consequence = self.parse_block()?;
        let mut end = consequence.span.end;
        end = self.optional_semi().max(end);
        let alternative = if matches!(self.peek_kind(), TokenKind::Else) {
            self.bump();
            let alt = self.parse_block()?;
            end = alt.span.end;
            end = self.optional_semi().max(end);
            Some(alt)
        } else {
            None
        };
        Ok(Stmt::If {
            condition,
            consequence,
            alternative,
            span: Span::new(start, end),
        })
    }

    fn parse_atomic_stmt(&mut self) -> Result<Stmt, ParseError> {
        let start = self.bump().span.start;
        let body = self.parse_block()?;
        Ok(Stmt::Atomic {
            span: Span::new(start, body.span.end),
            body,
        })
    }

    fn parse_sink_stmt(&mut self) -> Result<Stmt, ParseError> {
        let start = self.bump().span.start;
        let target = self.parse_binding_target()?;
        let end = self.optional_semi();
        Ok(Stmt::Sink {
            target,
            span: Span::new(start, end),
        })
    }

    fn parse_pstate_stmt(&mut self) -> Result<Stmt, ParseError> {
        let pstate_tok = self.bump();
        let TokenKind::PStateRef(name) = pstate_tok.kind else {
            unreachable!()
        };
        let pstate = Spanned::new(name, pstate_tok.span);

        if matches!(self.peek_kind(), TokenKind::ArrowTransform) {
            self.bump();
            let path = self.parse_path()?;
            // optional trailing BindPipe `>` (grammar)
            if matches!(self.peek_kind(), TokenKind::BindPipe) {
                self.bump();
            }
            let end = self.optional_semi();
            return Ok(Stmt::Transform {
                pstate,
                path,
                span: Span::new(pstate_tok.span.start, end),
            });
        }

        if matches!(self.peek_kind(), TokenKind::ArrowSelect) {
            self.bump();
            let path = self.parse_path()?;
            let target = if matches!(self.peek_kind(), TokenKind::BindPipe) {
                self.bump();
                Some(self.parse_binding_target()?)
            } else {
                None
            };
            let end = self.optional_semi();
            return Ok(Stmt::Select {
                pstate,
                path,
                target,
                span: Span::new(pstate_tok.span.start, end),
            });
        }

        // Fall through: pstate used as expression start of effect
        // Put the token back conceptually by parsing effect from an Ident-like expr
        Err(ParseError::one(Diagnostic::parse(
            self.peek().span,
            "expected --> or !<-- after pstate",
        )))
    }

    fn parse_effect_stmt(&mut self) -> Result<Stmt, ParseError> {
        let start = self.peek().span.start;
        let value = self.parse_expr()?;
        let binding = if matches!(self.peek_kind(), TokenKind::BindPipe) {
            self.bump();
            let target = self.parse_binding_target()?;
            let alias = if matches!(self.peek_kind(), TokenKind::As) {
                self.bump();
                let t = self.bump();
                match t.kind {
                    TokenKind::Binding(n) => Some(Spanned::new(n, t.span)),
                    _ => {
                        return Err(ParseError::one(Diagnostic::parse(
                            t.span,
                            "expected binding alias after as",
                        )))
                    }
                }
            } else {
                None
            };
            Some(EffectBinding { target, alias })
        } else {
            None
        };
        let end = self.optional_semi().max(value.span().end);
        Ok(Stmt::Effect {
            value,
            binding,
            span: Span::new(start, end),
        })
    }

    fn parse_inline_binding(&mut self) -> Result<InlineBinding, ParseError> {
        let start = self.peek().span.start;
        // optional value, then bind pipe, then target
        let value = if matches!(self.peek_kind(), TokenKind::BindPipe) {
            None
        } else {
            Some(self.parse_expr()?)
        };
        self.expect(TokenKind::BindPipe, "expected '>' in ramafn body")?;
        let target = if matches!(self.peek_kind(), TokenKind::Operator(_))
            || (matches!(self.peek_kind(), TokenKind::Ident(_))
                && matches!(
                    self.tokens.get(self.pos + 1).map(|t| &t.kind),
                    Some(TokenKind::LParen)
                )) {
            InlineTarget::Call(self.parse_call_from_callee()?)
        } else {
            InlineTarget::Binding(self.parse_binding_target()?)
        };
        let end = self.optional_semi();
        Ok(InlineBinding {
            value,
            target,
            span: Span::new(start, end),
        })
    }

    fn parse_path(&mut self) -> Result<Vec<Expr>, ParseError> {
        let mut path = vec![self.parse_expr()?];
        while matches!(self.peek_kind(), TokenKind::Comma) {
            self.bump();
            // stop path if next would be binding / end
            if matches!(
                self.peek_kind(),
                TokenKind::BindPipe | TokenKind::Semicolon | TokenKind::RBrace | TokenKind::Eof
            ) {
                break;
            }
            path.push(self.parse_expr()?);
        }
        Ok(path)
    }

    fn parse_binding_target(&mut self) -> Result<BindingTarget, ParseError> {
        match self.peek_kind() {
            TokenKind::Binding(_) => {
                let t = self.bump();
                let TokenKind::Binding(n) = t.kind else {
                    unreachable!()
                };
                Ok(BindingTarget::Name(Spanned::new(n, t.span)))
            }
            TokenKind::LBrace => {
                let map = self.parse_map_expr()?;
                let Expr::Map { entries, .. } = map else {
                    unreachable!()
                };
                Ok(BindingTarget::Map(entries))
            }
            TokenKind::LBracket => {
                let list = self.parse_list_expr()?;
                let Expr::List { elems, .. } = list else {
                    unreachable!()
                };
                Ok(BindingTarget::List(elems))
            }
            _ => Err(ParseError::one(Diagnostic::parse(
                self.peek().span,
                "expected binding target",
            ))),
        }
    }

    fn parse_expr(&mut self) -> Result<Expr, ParseError> {
        // call if ident/op followed by (
        if self.is_callable_start()
            && matches!(
                self.tokens.get(self.pos + 1).map(|t| &t.kind),
                Some(TokenKind::LParen)
            )
        {
            return Ok(Expr::Call(self.parse_call_from_callee()?));
        }

        match self.peek_kind() {
            TokenKind::LBracket => self.parse_list_expr(),
            TokenKind::LBrace => self.parse_map_expr(),
            TokenKind::String(_) => {
                let t = self.bump();
                let TokenKind::String(s) = t.kind else {
                    unreachable!()
                };
                Ok(Expr::String(Spanned::new(s, t.span)))
            }
            TokenKind::Int(_) => {
                let t = self.bump();
                let TokenKind::Int(n) = t.kind else {
                    unreachable!()
                };
                Ok(Expr::Int(Spanned::new(n, t.span)))
            }
            TokenKind::Bool(_) => {
                let t = self.bump();
                let TokenKind::Bool(b) = t.kind else {
                    unreachable!()
                };
                Ok(Expr::Bool(Spanned::new(b, t.span)))
            }
            TokenKind::AnchorRef(_) => {
                let t = self.bump();
                let TokenKind::AnchorRef(n) = t.kind else {
                    unreachable!()
                };
                Ok(Expr::Anchor(Spanned::new(n, t.span)))
            }
            TokenKind::Keyword(_) => {
                let t = self.bump();
                let TokenKind::Keyword(n) = t.kind else {
                    unreachable!()
                };
                Ok(Expr::Keyword(Spanned::new(n, t.span)))
            }
            TokenKind::Binding(_) => {
                let t = self.bump();
                let TokenKind::Binding(n) = t.kind else {
                    unreachable!()
                };
                Ok(Expr::Binding(Spanned::new(n, t.span)))
            }
            TokenKind::PStateRef(_) => {
                let t = self.bump();
                let TokenKind::PStateRef(n) = t.kind else {
                    unreachable!()
                };
                Ok(Expr::PState(Spanned::new(n, t.span)))
            }
            TokenKind::PipeVariant(_) => {
                // `|direct` alone, or `|hash(...)` call (handled above when followed by '(')
                let t = self.bump();
                let TokenKind::PipeVariant(n) = t.kind else {
                    unreachable!()
                };
                Ok(Expr::Pipe(Spanned::new(n, t.span)))
            }
            TokenKind::Operator(_) | TokenKind::Ident(_) => {
                let name = self.parse_callable_name()?;
                Ok(Expr::Ident(name))
            }
            _ => Err(ParseError::one(Diagnostic::parse(
                self.peek().span,
                format!("expected expression, got {:?}", self.peek_kind()),
            ))),
        }
    }

    fn is_callable_start(&self) -> bool {
        matches!(
            self.peek_kind(),
            TokenKind::Operator(_)
                | TokenKind::Ident(_)
                | TokenKind::Keyword(_)
                | TokenKind::Binding(_)
                | TokenKind::PipeVariant(_)
        )
    }

    fn parse_callable_name(&mut self) -> Result<Spanned<String>, ParseError> {
        let t = self.bump();
        match t.kind {
            TokenKind::Operator(n)
            | TokenKind::Ident(n)
            | TokenKind::Keyword(n)
            | TokenKind::Binding(n) => Ok(Spanned::new(n, t.span)),
            TokenKind::PipeVariant(n) => Ok(Spanned::new(format!("|{n}"), t.span)),
            _ => Err(ParseError::one(Diagnostic::parse(
                t.span,
                "expected callable name",
            ))),
        }
    }

    fn parse_call_from_callee(&mut self) -> Result<CallExpr, ParseError> {
        let callee = self.parse_callable_name()?;
        let start = callee.span.start;
        self.expect(TokenKind::LParen, "expected '('")?;
        let mut args = Vec::new();
        if !matches!(self.peek_kind(), TokenKind::RParen) {
            loop {
                args.push(self.parse_expr()?);
                // commas optional between args (grammar)
                if matches!(self.peek_kind(), TokenKind::Comma) {
                    self.bump();
                    if matches!(self.peek_kind(), TokenKind::RParen) {
                        break;
                    }
                    continue;
                }
                if matches!(self.peek_kind(), TokenKind::RParen) {
                    break;
                }
                // allow space-separated args
                if self.is_expr_start() {
                    continue;
                }
                break;
            }
        }
        let end = self.expect(TokenKind::RParen, "expected ')'")?.span.end;
        Ok(CallExpr {
            callee,
            args,
            span: Span::new(start, end),
        })
    }

    fn is_expr_start(&self) -> bool {
        matches!(
            self.peek_kind(),
            TokenKind::LBracket
                | TokenKind::LBrace
                | TokenKind::LParen
                | TokenKind::String(_)
                | TokenKind::Int(_)
                | TokenKind::Bool(_)
                | TokenKind::AnchorRef(_)
                | TokenKind::Keyword(_)
                | TokenKind::Binding(_)
                | TokenKind::PStateRef(_)
                | TokenKind::PipeVariant(_)
                | TokenKind::Operator(_)
                | TokenKind::Ident(_)
        )
    }

    fn parse_list_expr(&mut self) -> Result<Expr, ParseError> {
        let start = self.expect(TokenKind::LBracket, "expected '['")?.span.start;
        let mut elems = Vec::new();
        while !matches!(self.peek_kind(), TokenKind::RBracket | TokenKind::Eof) {
            elems.push(self.parse_expr()?);
            if matches!(self.peek_kind(), TokenKind::Comma) {
                self.bump();
            } else if matches!(self.peek_kind(), TokenKind::RBracket) {
                break;
            } else if self.is_expr_start() {
                continue;
            } else {
                break;
            }
        }
        let end = self.expect(TokenKind::RBracket, "expected ']'")?.span.end;
        Ok(Expr::List {
            elems,
            span: Span::new(start, end),
        })
    }

    fn parse_map_expr(&mut self) -> Result<Expr, ParseError> {
        let start = self.expect(TokenKind::LBrace, "expected '{'")?.span.start;
        let mut entries = Vec::new();
        while !matches!(self.peek_kind(), TokenKind::RBrace | TokenKind::Eof) {
            let key = self.parse_expr()?;
            let value = if self.is_expr_start()
                && !matches!(self.peek_kind(), TokenKind::Comma | TokenKind::RBrace)
            {
                // optional colon between key/value for ergonomics
                if matches!(self.peek_kind(), TokenKind::Colon) {
                    self.bump();
                }
                if self.is_expr_start() {
                    Some(self.parse_expr()?)
                } else {
                    None
                }
            } else if matches!(self.peek_kind(), TokenKind::Colon) {
                self.bump();
                Some(self.parse_expr()?)
            } else {
                None
            };
            entries.push(MapEntry { key, value });
            if matches!(self.peek_kind(), TokenKind::Comma) {
                self.bump();
            }
        }
        let end = self.expect(TokenKind::RBrace, "expected '}'")?.span.end;
        Ok(Expr::Map {
            entries,
            span: Span::new(start, end),
        })
    }

    fn optional_semi(&mut self) -> usize {
        if matches!(self.peek_kind(), TokenKind::Semicolon) {
            self.bump().span.end
        } else if self.pos > 0 {
            self.tokens[self.pos - 1].span.end
        } else {
            self.peek().span.end
        }
    }
}
