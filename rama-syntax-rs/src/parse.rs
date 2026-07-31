//! .rama v2 parser ([`chumsky`] over logos tokens).

use crate::ast::*;
use crate::error::{Diagnostic, ParseError};
use crate::lex::{lex, TokenKind};
use crate::span::{Span, Spanned};
use chumsky::prelude::*;
use chumsky::Stream;

type Tok = TokenKind;
type Err = Simple<Tok, std::ops::Range<usize>>;

fn sp(span: std::ops::Range<usize>) -> Span {
    Span::new(span.start, span.end)
}

pub fn parse(src: &str) -> Result<SourceFile, ParseError> {
    let tokens = lex(src)?;
    let eoi = src.len()..src.len();
    let stream = Stream::from_iter(
        eoi,
        tokens
            .into_iter()
            .map(|(tok, span)| (tok, span.start..span.end)),
    );

    match file().parse(stream) {
        Ok(f) => Ok(f),
        Err(errors) => Err(ParseError {
            diagnostics: errors
                .into_iter()
                .map(|e| Diagnostic::parse(sp(e.span()), format!("{e:?}")))
                .collect(),
        }),
    }
}

fn file() -> impl Parser<Tok, SourceFile, Error = Err> {
    item()
        .repeated()
        .then_ignore(end())
        .map_with_span(|items, span| SourceFile {
            items,
            span: sp(span),
        })
}

fn item() -> impl Parser<Tok, Item, Error = Err> {
    choice((
        module_item(),
        struct_item(),
        pstate_item(),
        depot_item(),
        op_item(),
        fn_item(),
        extern_item(),
    ))
}

fn module_item() -> impl Parser<Tok, Item, Error = Err> {
    // `module Name` or `module a.b.c/Name`, optionally `topology <name>`.
    just(Tok::Module)
        .ignore_then(
            ident()
                .separated_by(just(Tok::Dot))
                .at_least(1)
                .collect::<Vec<_>>(),
        )
        .then(just(Tok::Slash).ignore_then(ident()).or_not())
        .then(
            select! { Tok::Ident(word) if word == "topology" => () }
                .ignore_then(ident())
                .or_not(),
        )
        .map_with_span(|((segments, class_name), topology), span| {
            let (name, namespace) = match class_name {
                Some(class_name) => (class_name, Some(segments.join("."))),
                None => (segments.join("."), None),
            };
            Item::Module(ModuleDecl {
                name: Spanned::new(name, sp(span.clone())),
                namespace,
                topology,
                span: sp(span),
            })
        })
}

fn struct_item() -> impl Parser<Tok, Item, Error = Err> {
    just(Tok::Struct)
        .ignore_then(ident())
        .then(
            keyword()
                .then(type_expr())
                .map(|(name, ty)| StructField { name, ty })
                .repeated()
                .delimited_by(just(Tok::LBrace), just(Tok::RBrace)),
        )
        .map_with_span(|(name, fields), span| {
            Item::Struct(StructDecl {
                name: Spanned::new(name, Span::default()),
                fields,
                span: sp(span),
            })
        })
}

fn pstate_item() -> impl Parser<Tok, Item, Error = Err> {
    just(Tok::PState)
        .ignore_then(pstate_ref())
        .then_ignore(just(Tok::Colon))
        .then(type_expr())
        .map_with_span(|(name, ty), span| {
            Item::PState(PStateDecl {
                name,
                ty,
                span: sp(span),
            })
        })
}

fn depot_item() -> impl Parser<Tok, Item, Error = Err> {
    just(Tok::Depot)
        .ignore_then(ident())
        .then_ignore(just(Tok::KeyedBy))
        .then(ident())
        .map_with_span(|(name, keyed), span| {
            Item::Depot(DepotDecl {
                name: Spanned::new(name, Span::default()),
                keyed_by: Spanned::new(keyed, Span::default()),
                span: sp(span),
            })
        })
}

fn op_item() -> impl Parser<Tok, Item, Error = Err> {
    just(Tok::Op)
        .ignore_then(ident())
        .then(typed_params())
        .then(block())
        .map_with_span(|((name, params), body), span| {
            Item::Op(OpDef {
                name: Spanned::new(name, Span::default()),
                params,
                body,
                span: sp(span),
            })
        })
}

fn fn_item() -> impl Parser<Tok, Item, Error = Err> {
    just(Tok::Fn)
        .ignore_then(ident_spanned())
        .then(typed_params())
        .then(just(Tok::ThinArrow).ignore_then(value_type_expr()).or_not())
        .then(block())
        .map_with_span(|(((name, params), return_ty), body), span| {
            Item::Fn(FnDef {
                name,
                params,
                return_ty,
                body,
                span: sp(span),
            })
        })
}

fn extern_item() -> impl Parser<Tok, Item, Error = Err> {
    just(Tok::Extern)
        .ignore_then(ident_spanned())
        .then(
            ident_spanned()
                .separated_by(just(Tok::Comma))
                .allow_trailing()
                .delimited_by(just(Tok::Lt), just(Tok::Gt))
                .or_not()
                .map(Option::unwrap_or_default),
        )
        .then(just(Tok::Eq).ignore_then(qualified_var_spanned()).or_not())
        .then(typed_params())
        .then_ignore(just(Tok::ThinArrow))
        .then(value_type_expr())
        .then_ignore(just(Tok::Semicolon).or_not())
        .map_with_span(
            |((((name, type_params), target), params), return_ty), span| {
                Item::Extern(ExternDecl {
                    name,
                    target,
                    type_params,
                    params,
                    return_ty,
                    span: sp(span),
                })
            },
        )
}

fn typed_params() -> impl Parser<Tok, Vec<Param>, Error = Err> {
    ident_spanned()
        .then(just(Tok::Colon).ignore_then(value_type_expr()).or_not())
        .map(|(name, ty)| Param { name, ty })
        .separated_by(just(Tok::Comma))
        .allow_trailing()
        .delimited_by(just(Tok::LParen), just(Tok::RParen))
}

fn block() -> impl Parser<Tok, Block, Error = Err> + Clone {
    recursive(|block| {
        let if_stmt = just(Tok::If)
            .ignore_then(expr().delimited_by(just(Tok::LParen), just(Tok::RParen)))
            .then(block.clone())
            .then(just(Tok::Else).ignore_then(block.clone()).or_not())
            .map_with_span(|((condition, consequence), alternative), span| Stmt::If {
                condition,
                consequence,
                alternative,
                span: sp(span),
            });

        let stmt = choice((
            let_stmt(),
            fail_stmt(),
            return_stmt(),
            select_stmt(),
            transform_stmt(),
            hash_stmt(),
            if_stmt,
            effect_stmt(),
        ))
        .boxed();

        stmt.repeated()
            .delimited_by(just(Tok::LBrace), just(Tok::RBrace))
            .map_with_span(|stmts, span| Block {
                stmts,
                span: sp(span),
            })
    })
}

fn let_stmt() -> impl Parser<Tok, Stmt, Error = Err> {
    just(Tok::Let)
        .ignore_then(choice((
            ident_spanned()
                .separated_by(just(Tok::Comma))
                .at_least(1)
                .delimited_by(just(Tok::LBrace), just(Tok::RBrace))
                .map(LetPattern::Destructure),
            ident_spanned().map(LetPattern::Name),
        )))
        .then_ignore(just(Tok::Eq))
        .then(expr())
        .map_with_span(|(pattern, value), span| Stmt::Let {
            pattern,
            value,
            span: sp(span),
        })
}

fn fail_stmt() -> impl Parser<Tok, Stmt, Error = Err> {
    just(Tok::Fail)
        .ignore_then(expr())
        .then_ignore(just(Tok::If))
        .then(expr())
        .map_with_span(|(value, condition), span| Stmt::Fail {
            value,
            condition,
            span: sp(span),
        })
}

fn return_stmt() -> impl Parser<Tok, Stmt, Error = Err> {
    just(Tok::Return)
        .ignore_then(expr())
        .map_with_span(|value, span| Stmt::Return {
            value,
            span: sp(span),
        })
}

fn select_stmt() -> impl Parser<Tok, Stmt, Error = Err> {
    pstate_ref()
        .then_ignore(just(Tok::ArrowSelect))
        .then(path())
        .then_ignore(just(Tok::Gt))
        .then(binding_target())
        .map_with_span(|((pstate, path), target), span| Stmt::Select {
            pstate,
            path,
            target,
            span: sp(span),
        })
}

fn transform_stmt() -> impl Parser<Tok, Stmt, Error = Err> {
    pstate_ref()
        .then_ignore(just(Tok::ArrowTransform))
        .then(path())
        .map_with_span(|(pstate, path), span| Stmt::Transform {
            pstate,
            path,
            span: sp(span),
        })
}

fn hash_stmt() -> impl Parser<Tok, Stmt, Error = Err> {
    filter_map(|span, tok| match tok {
        Tok::Pipe(s) if s == "hash" => Ok(()),
        t => Err(Simple::expected_input_found(span, None, Some(t))),
    })
    .ignore_then(expr())
    .map_with_span(|key, span| Stmt::Hash {
        key,
        span: sp(span),
    })
}

fn effect_stmt() -> impl Parser<Tok, Stmt, Error = Err> {
    expr().map_with_span(|value, span| Stmt::Effect {
        value,
        span: sp(span),
    })
}

fn path() -> impl Parser<Tok, Vec<Expr>, Error = Err> {
    expr().separated_by(just(Tok::Comma)).at_least(1)
}

fn binding_target() -> impl Parser<Tok, BindingTarget, Error = Err> {
    choice((
        ident_spanned()
            .separated_by(just(Tok::Comma))
            .at_least(1)
            .delimited_by(just(Tok::LBrace), just(Tok::RBrace))
            .map(BindingTarget::Destructure),
        ident_spanned().map(BindingTarget::Name),
    ))
}

fn type_expr() -> impl Parser<Tok, Spanned<TypeExpr>, Error = Err> {
    recursive(|ty: Recursive<'_, Tok, Spanned<TypeExpr>, Err>| {
        let named = choice((
            select! { Tok::Ident(s) => TypeExpr::Named(s) },
            select! { Tok::Object => TypeExpr::Object },
        ))
        .map_with_span(|t, span| Spanned::new(t, sp(span)));

        let map = just(Tok::Map)
            .ignore_then(
                ty.clone()
                    .then_ignore(just(Tok::Comma))
                    .then(ty)
                    .delimited_by(just(Tok::Lt), just(Tok::Gt)),
            )
            .then(
                just(Tok::At)
                    .ignore_then(select! { Tok::Ident(s) => s })
                    .or_not(),
            )
            .map_with_span(
                |((key, value), at): ((Spanned<TypeExpr>, Spanned<TypeExpr>), Option<String>),
                 span| {
                    Spanned::new(
                        TypeExpr::Map {
                            key: Box::new(key.node),
                            value: Box::new(value.node),
                            subindexed: matches!(at.as_deref(), Some("subindexed")),
                        },
                        sp(span),
                    )
                },
            );

        choice((map, named))
    })
}

fn value_type_expr() -> impl Parser<Tok, Spanned<ValueTypeExpr>, Error = Err> + Clone {
    recursive(|ty: Recursive<'_, Tok, Spanned<ValueTypeExpr>, Err>| {
        let segment = choice((
            select! { Tok::Ident(s) => s },
            just(Tok::Map).to("Map".to_string()),
            just(Tok::Object).to("Object".to_string()),
        ));

        let named = segment
            .separated_by(just(Tok::Dot))
            .at_least(1)
            .collect::<Vec<_>>()
            .then(
                ty.clone()
                    .separated_by(just(Tok::Comma))
                    .allow_trailing()
                    .delimited_by(just(Tok::Lt), just(Tok::Gt))
                    .or_not()
                    .map(Option::unwrap_or_default),
            )
            .map_with_span(|(segments, args), span| {
                let mut path = segments.join(".");
                let inline_nullable = path.ends_with('?');
                if inline_nullable {
                    path.pop();
                }
                let base = match path.as_str() {
                    "Nil" => ValueTypeExpr::Nil,
                    "Unknown" => ValueTypeExpr::Unknown,
                    "Dynamic" | "Dyn" => ValueTypeExpr::Dynamic,
                    "Any" => ValueTypeExpr::Any,
                    "Never" => ValueTypeExpr::Never,
                    "Seqable" | "Reducible" | "Countable" | "Transducer" => {
                        ValueTypeExpr::Capability {
                            name: path,
                            args: args.into_iter().map(|arg| arg.node).collect(),
                        }
                    }
                    _ => ValueTypeExpr::Named {
                        path,
                        args: args.into_iter().map(|arg| arg.node).collect(),
                    },
                };
                let node = if inline_nullable {
                    ValueTypeExpr::Union(vec![base, ValueTypeExpr::Nil])
                } else {
                    base
                };
                Spanned::new(node, sp(span))
            });

        let function = select! {
            Tok::Ident(name) if name == "Fn" => (),
        }
        .ignore_then(just(Tok::Lt))
        .ignore_then(
            ty.clone()
                .separated_by(just(Tok::Comma))
                .allow_trailing()
                .delimited_by(just(Tok::LParen), just(Tok::RParen)),
        )
        .then_ignore(just(Tok::ThinArrow))
        .then(ty.clone())
        .then_ignore(just(Tok::Gt))
        .map_with_span(|(params, ret), span| {
            Spanned::new(
                ValueTypeExpr::Function {
                    params: params.into_iter().map(|param| param.node).collect(),
                    ret: Box::new(ret.node),
                },
                sp(span),
            )
        });

        let nullable = choice((function, named))
            .then(just(Tok::Question).or_not())
            .map(|(base, nullable)| {
                if nullable.is_some() {
                    let span = base.span;
                    Spanned::new(
                        ValueTypeExpr::Union(vec![base.node, ValueTypeExpr::Nil]),
                        span,
                    )
                } else {
                    base
                }
            });

        nullable
            .separated_by(just(Tok::Union))
            .at_least(1)
            .collect::<Vec<_>>()
            .map(|types| {
                if types.len() == 1 {
                    types.into_iter().next().unwrap()
                } else {
                    let span = types
                        .iter()
                        .skip(1)
                        .fold(types[0].span, |span, ty| span.merge(ty.span));
                    Spanned::new(
                        ValueTypeExpr::Union(types.into_iter().map(|ty| ty.node).collect()),
                        span,
                    )
                }
            })
    })
}

fn expr() -> impl Parser<Tok, Expr, Error = Err> + Clone {
    recursive(|expr| {
        let lit = choice((
            select! { Tok::String(s) => s }
                .map_with_span(|s, span| Expr::String(Spanned::new(s, sp(span)))),
            select! { Tok::Int(n) => n }
                .map_with_span(|n, span| Expr::Int(Spanned::new(n, sp(span)))),
            select! { Tok::Bool(b) => b }
                .map_with_span(|b, span| Expr::Bool(Spanned::new(b, sp(span)))),
            select! { Tok::Keyword(s) => s }
                .map_with_span(|s, span| Expr::Keyword(Spanned::new(s, sp(span)))),
        ))
        .boxed();

        let callee = select! {
            Tok::Ident(s) => s,
            Tok::Ge => ">=".into(),
            Tok::Gt => ">".into(),
            Tok::Eq => "=".into(),
        }
        .map_with_span(|s, span| Spanned::new(s, sp(span)));

        let call = callee
            .then(
                expr.clone()
                    .separated_by(just(Tok::Comma).or_not())
                    .allow_trailing()
                    .delimited_by(just(Tok::LParen), just(Tok::RParen))
                    .or_not(),
            )
            .map(|(name, args)| match args {
                Some(args) => Expr::Call(CallExpr {
                    span: name.span,
                    callee: name,
                    args,
                }),
                None => Expr::Ident(name),
            })
            .boxed();

        let list = expr
            .clone()
            .separated_by(just(Tok::Comma).or_not())
            .allow_trailing()
            .delimited_by(just(Tok::LBracket), just(Tok::RBracket))
            .map_with_span(|elems, span| Expr::List {
                elems,
                span: sp(span),
            })
            .boxed();

        let map = expr
            .clone()
            .then(expr.clone().or_not())
            .separated_by(just(Tok::Comma).or_not())
            .allow_trailing()
            .delimited_by(just(Tok::LBrace), just(Tok::RBrace))
            .map_with_span(|entries, span| Expr::Map {
                entries: entries
                    .into_iter()
                    .map(|(key, value)| MapEntry { key, value })
                    .collect(),
                span: sp(span),
            })
            .boxed();

        let atom = choice((
            expr.clone()
                .delimited_by(just(Tok::LParen), just(Tok::RParen)),
            call,
            list,
            map,
            lit,
        ))
        .boxed();

        let cast = atom
            .then(
                select! {
                    Tok::Ident(name) if name == "as" => (),
                }
                .ignore_then(value_type_expr())
                .or_not(),
            )
            .map(|(value, ty)| match ty {
                Some(ty) => {
                    let span = value.span().merge(ty.span);
                    Expr::As {
                        value: Box::new(value),
                        ty,
                        span,
                    }
                }
                None => value,
            })
            .boxed();

        let equality = cast
            .clone()
            .then(
                choice((
                    just(Tok::EqEq).to(BinaryOp::Eq),
                    just(Tok::NotEq).to(BinaryOp::NotEq),
                ))
                .then(cast)
                .or_not(),
            )
            .map(|(left, rest)| match rest {
                Some((op, right)) => Expr::Binary {
                    span: left.span().merge(right.span()),
                    op,
                    left: Box::new(left),
                    right: Box::new(right),
                },
                None => left,
            })
            .boxed();

        equality
            .then(
                just(Tok::Question)
                    .ignore_then(expr.clone())
                    .then_ignore(just(Tok::Colon))
                    .then(expr)
                    .or_not(),
            )
            .map(|(cond, rest)| match rest {
                Some((then_branch, else_branch)) => Expr::Ternary {
                    span: cond.span().merge(else_branch.span()),
                    cond: Box::new(cond),
                    then_branch: Box::new(then_branch),
                    else_branch: Box::new(else_branch),
                },
                None => cond,
            })
    })
}

fn ident() -> impl Parser<Tok, String, Error = Err> {
    select! { Tok::Ident(s) => s }
}

fn ident_spanned() -> impl Parser<Tok, Spanned<String>, Error = Err> {
    ident().map_with_span(|s, span| Spanned::new(s, sp(span)))
}

fn qualified_var_spanned() -> impl Parser<Tok, Spanned<String>, Error = Err> {
    ident()
        .separated_by(just(Tok::Dot))
        .at_least(1)
        .collect::<Vec<_>>()
        .then_ignore(just(Tok::Slash))
        .then(choice((ident(), just(Tok::Plus).to("+".to_string()))))
        .map_with_span(|(namespace, name), span| {
            Spanned::new(format!("{}/{}", namespace.join("."), name), sp(span))
        })
}

fn keyword() -> impl Parser<Tok, Spanned<String>, Error = Err> {
    select! { Tok::Keyword(s) => s }.map_with_span(|s, span| Spanned::new(s, sp(span)))
}

fn pstate_ref() -> impl Parser<Tok, Spanned<String>, Error = Err> {
    select! { Tok::PStateRef(s) => s }.map_with_span(|s, span| Spanned::new(s, sp(span)))
}
