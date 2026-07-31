//! Semantic view of a parsed `.rama` program.
//!
//! The parser AST preserves source syntax. `Program` adds the context needed by
//! validation and lowering: declaration tables and explicit fn/op body kinds.
//! It borrows syntax nodes so diagnostics retain their original source spans.

use std::collections::HashMap;

use crate::ast::{
    Block, DepotDecl, FnDef, Item, OpDef, PStateDecl, SourceFile, StructDecl, TypeExpr,
};
use crate::span::Span;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BodyKind {
    Fn,
    Op,
}

#[derive(Debug, Clone, Copy)]
pub struct Body<'a> {
    pub kind: BodyKind,
    pub name: &'a str,
    pub block: &'a Block,
    pub span: Span,
}

/// Normalized semantic context consumed by rules and target lowering.
#[derive(Debug)]
pub struct Program<'a> {
    pub source: &'a SourceFile,
    pub module_name: &'a str,
    pub structs: HashMap<&'a str, &'a StructDecl>,
    pub pstates: HashMap<&'a str, &'a PStateDecl>,
    pub depots: HashMap<&'a str, &'a DepotDecl>,
    pub functions: HashMap<&'a str, &'a FnDef>,
    pub operations: HashMap<&'a str, &'a OpDef>,
    pub bodies: Vec<Body<'a>>,
}

impl<'a> Program<'a> {
    pub fn from_ast(source: &'a SourceFile) -> Self {
        let mut module_name = "Generated";
        let mut structs = HashMap::new();
        let mut pstates = HashMap::new();
        let mut depots = HashMap::new();
        let mut functions = HashMap::new();
        let mut operations = HashMap::new();
        let mut bodies = Vec::new();

        for item in &source.items {
            match item {
                Item::Module(m) => module_name = &m.name.node,
                Item::Struct(s) => {
                    structs.insert(s.name.node.as_str(), s);
                }
                Item::PState(p) => {
                    pstates.insert(p.name.node.as_str(), p);
                }
                Item::Depot(d) => {
                    depots.insert(d.name.node.as_str(), d);
                }
                Item::Fn(f) => {
                    functions.insert(f.name.node.as_str(), f);
                    bodies.push(Body {
                        kind: BodyKind::Fn,
                        name: &f.name.node,
                        block: &f.body,
                        span: f.span,
                    });
                }
                Item::Op(op) => {
                    operations.insert(op.name.node.as_str(), op);
                    bodies.push(Body {
                        kind: BodyKind::Op,
                        name: &op.name.node,
                        block: &op.body,
                        span: op.span,
                    });
                }
            }
        }

        Self {
            source,
            module_name,
            structs,
            pstates,
            depots,
            functions,
            operations,
            bodies,
        }
    }

    pub fn pstate_type(&self, name: &str) -> Option<&TypeExpr> {
        self.pstates.get(name).map(|p| &p.ty.node)
    }
}
