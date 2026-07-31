//! .rama v2 AST — Specter paths, Rust-like schemas, no naming-convention sigils.

use crate::span::{Span, Spanned};

#[derive(Debug, Clone, PartialEq)]
pub struct SourceFile {
    pub items: Vec<Item>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Item {
    Module(ModuleDecl),
    Struct(StructDecl),
    PState(PStateDecl),
    Depot(DepotDecl),
    Op(OpDef),
    Fn(FnDef),
    Extern(ExternDecl),
}

#[derive(Debug, Clone, PartialEq)]
pub struct ModuleDecl {
    /// Module class name, e.g. `UsersModule`.
    pub name: Spanned<String>,
    /// Clojure namespace when declared as `module a.b.c/Name`.
    pub namespace: Option<String>,
    /// Stream topology name (`topology users`); defaults to `main`.
    pub topology: Option<String>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructDecl {
    pub name: Spanned<String>,
    pub fields: Vec<StructField>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructField {
    /// Keyword name without leading `:`.
    pub name: Spanned<String>,
    pub ty: Spanned<TypeExpr>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PStateDecl {
    pub name: Spanned<String>,
    pub ty: Spanned<TypeExpr>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DepotDecl {
    pub name: Spanned<String>,
    pub keyed_by: Vec<Spanned<DepotKey>>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub enum DepotKey {
    Field(String),
    Literal(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct OpDef {
    pub name: Spanned<String>,
    pub params: Vec<Param>,
    pub body: Block,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FnDef {
    pub name: Spanned<String>,
    pub params: Vec<Param>,
    pub return_ty: Option<Spanned<ValueTypeExpr>>,
    pub body: Block,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Param {
    pub name: Spanned<String>,
    pub ty: Option<Spanned<ValueTypeExpr>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ExternDecl {
    pub name: Spanned<String>,
    /// Qualified Clojure Var symbol, e.g. `clojure.core/vec`.
    pub target: Option<Spanned<String>>,
    pub type_params: Vec<Spanned<String>>,
    pub params: Vec<Param>,
    pub return_ty: Spanned<ValueTypeExpr>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Block {
    pub stmts: Vec<Stmt>,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Stmt {
    Let {
        pattern: LetPattern,
        value: Expr,
        span: Span,
    },
    Select {
        pstate: Spanned<String>,
        path: Vec<Expr>,
        target: BindingTarget,
        span: Span,
    },
    Transform {
        pstate: Spanned<String>,
        path: Vec<Expr>,
        span: Span,
    },
    Fail {
        value: Expr,
        condition: Expr,
        span: Span,
    },
    Return {
        value: Expr,
        span: Span,
    },
    /// Bare `|hash key` partition hop.
    Hash {
        key: Expr,
        span: Span,
    },
    Effect {
        value: Expr,
        span: Span,
    },
    If {
        condition: Expr,
        consequence: Block,
        alternative: Option<Block>,
        span: Span,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub enum LetPattern {
    Name(Spanned<String>),
    Destructure(Vec<Spanned<String>>),
}

#[derive(Debug, Clone, PartialEq)]
pub enum BindingTarget {
    Name(Spanned<String>),
    Destructure(Vec<Spanned<String>>),
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
    Keyword(Spanned<String>),
    Ident(Spanned<String>),
    Int(Spanned<i64>),
    Bool(Spanned<bool>),
    Binary {
        op: BinaryOp,
        left: Box<Expr>,
        right: Box<Expr>,
        span: Span,
    },
    Ternary {
        cond: Box<Expr>,
        then_branch: Box<Expr>,
        else_branch: Box<Expr>,
        span: Span,
    },
    As {
        value: Box<Expr>,
        ty: Spanned<ValueTypeExpr>,
        span: Span,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BinaryOp {
    Eq,
    NotEq,
}

impl Expr {
    pub fn span(&self) -> Span {
        match self {
            Expr::Call(c) => c.span,
            Expr::List { span, .. }
            | Expr::Map { span, .. }
            | Expr::String(Spanned { span, .. })
            | Expr::Keyword(Spanned { span, .. })
            | Expr::Ident(Spanned { span, .. })
            | Expr::Int(Spanned { span, .. })
            | Expr::Bool(Spanned { span, .. })
            | Expr::Binary { span, .. }
            | Expr::Ternary { span, .. }
            | Expr::As { span, .. } => *span,
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

#[derive(Debug, Clone, PartialEq)]
pub enum TypeExpr {
    Named(String),
    Map {
        key: Box<TypeExpr>,
        value: Box<TypeExpr>,
        subindexed: bool,
    },
    Object,
}

/// JVM-oriented ordinary value type syntax. PState schemas use [`TypeExpr`]
/// until their dedicated P* parser migration lands.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ValueTypeExpr {
    Named {
        path: String,
        args: Vec<ValueTypeExpr>,
    },
    Union(Vec<ValueTypeExpr>),
    Function {
        params: Vec<ValueTypeExpr>,
        ret: Box<ValueTypeExpr>,
    },
    Capability {
        name: String,
        args: Vec<ValueTypeExpr>,
    },
    Nil,
    Unknown,
    Dynamic,
    Any,
    Never,
}
