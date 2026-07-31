//! Abstract syntax tree for Rama surface syntax.
//!
//! Mirrors the shapes in [tommy-mor/rama-syntax](https://github.com/tommy-mor/rama-syntax)
//! (`tree-sitter-rama` grammar + `examples/*.rama`), plus a `pstate` schema
//! declaration used by the type-checker stub.

use crate::span::{Span, Spanned};

/// A parsed `.rama` source file.
#[derive(Debug, Clone, PartialEq)]
pub struct SourceFile {
    pub items: Vec<Item>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Item {
    /// `ramaop name>(params) { ... }`
    RamaOp(RamaOpDef),
    /// Top-level `ramafn %name(params) { > expr; }`
    RamaFn(RamaFnDef),
    /// Type-checker extension: `pstate $$name { Key -> Value }`
    PState(PStateDecl),
}

#[derive(Debug, Clone, PartialEq)]
pub struct RamaOpDef {
    pub name: Spanned<String>,
    pub params: Vec<Spanned<Param>>,
    pub body: Block,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RamaFnDef {
    pub name: Spanned<String>,
    pub params: Vec<Spanned<Param>>,
    pub body: Vec<InlineBinding>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PStateDecl {
    pub name: Spanned<String>,
    pub key: Spanned<TypeExpr>,
    pub value: Spanned<TypeExpr>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Param {
    Binding(String),
    Ident(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Block {
    pub stmts: Vec<Stmt>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Stmt {
    Anchor {
        anchor: Spanned<String>,
        span: Span,
    },
    Effect {
        value: Expr,
        binding: Option<EffectBinding>,
        span: Span,
    },
    Transform {
        pstate: Spanned<String>,
        path: Vec<Expr>,
        span: Span,
    },
    Select {
        pstate: Spanned<String>,
        path: Vec<Expr>,
        target: Option<BindingTarget>,
        span: Span,
    },
    HookNamed {
        name: Spanned<String>,
        arg: Option<Expr>,
        span: Span,
    },
    HookAnchor {
        anchor: Spanned<String>,
        span: Span,
    },
    Unify {
        anchors: Vec<Spanned<String>>,
        span: Span,
    },
    If {
        condition: Expr,
        consequence: Block,
        alternative: Option<Block>,
        span: Span,
    },
    Atomic {
        body: Block,
        span: Span,
    },
    Sink {
        target: BindingTarget,
        span: Span,
    },
    RamaFn(RamaFnDef),
}

#[derive(Debug, Clone, PartialEq)]
pub struct EffectBinding {
    pub target: BindingTarget,
    pub alias: Option<Spanned<String>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct InlineBinding {
    pub value: Option<Expr>,
    pub target: InlineTarget,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub enum InlineTarget {
    Binding(BindingTarget),
    Call(CallExpr),
}

#[derive(Debug, Clone, PartialEq)]
pub enum BindingTarget {
    Name(Spanned<String>),
    Map(Vec<MapEntry>),
    List(Vec<Expr>),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Expr {
    Call(CallExpr),
    List {
        elems: Vec<Expr>,
        span: Span,
    },
    Map {
        entries: Vec<MapEntry>,
        span: Span,
    },
    String(Spanned<String>),
    Anchor(Spanned<String>),
    Keyword(Spanned<String>),
    Binding(Spanned<String>),
    PState(Spanned<String>),
    Pipe(Spanned<String>),
    Ident(Spanned<String>),
    /// Integer literal (type-checker / MatchModule fixtures).
    Int(Spanned<i64>),
    Bool(Spanned<bool>),
}

impl Expr {
    pub fn span(&self) -> Span {
        match self {
            Expr::Call(c) => c.span,
            Expr::List { span, .. }
            | Expr::Map { span, .. }
            | Expr::String(Spanned { span, .. })
            | Expr::Anchor(Spanned { span, .. })
            | Expr::Keyword(Spanned { span, .. })
            | Expr::Binding(Spanned { span, .. })
            | Expr::PState(Spanned { span, .. })
            | Expr::Pipe(Spanned { span, .. })
            | Expr::Ident(Spanned { span, .. })
            | Expr::Int(Spanned { span, .. })
            | Expr::Bool(Spanned { span, .. }) => *span,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct CallExpr {
    pub callee: Spanned<String>,
    pub args: Vec<Expr>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MapEntry {
    pub key: Expr,
    pub value: Option<Expr>,
}

/// Type expressions for `pstate` schema decls (type-checker stub).
#[derive(Debug, Clone, PartialEq)]
pub enum TypeExpr {
    Named(String),
    /// `fixed { "field": Type, ... }`
    Fixed {
        fields: Vec<(String, TypeExpr)>,
    },
    /// `map Value` (subindexed map values)
    Map {
        value: Box<TypeExpr>,
    },
    /// Opaque / escape hatch
    Object,
}
