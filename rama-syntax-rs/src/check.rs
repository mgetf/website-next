//! Path type-checker stub for .rama v2.

use crate::ast::*;
use crate::error::Diagnostic;
use crate::span::{Span, Spanned};
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct CheckResult {
    pub diagnostics: Vec<Diagnostic>,
}

impl CheckResult {
    pub fn ok(&self) -> bool {
        self.diagnostics.is_empty()
    }
}

#[derive(Debug, Clone, Default)]
pub struct TypeEnv {
    pub pstates: HashMap<String, TypeExpr>,
    pub structs: HashMap<String, Vec<(String, TypeExpr)>>,
}

pub fn check(file: &SourceFile) -> CheckResult {
    let mut env = TypeEnv::default();
    let mut diagnostics = Vec::new();

    for item in &file.items {
        match item {
            Item::Struct(s) => {
                env.structs.insert(
                    s.name.node.clone(),
                    s.fields
                        .iter()
                        .map(|f| (f.name.node.clone(), f.ty.node.clone()))
                        .collect(),
                );
            }
            Item::PState(p) => {
                env.pstates
                    .insert(p.name.node.clone(), p.ty.node.clone());
            }
            _ => {}
        }
    }

    for item in &file.items {
        match item {
            Item::Op(op) => check_block(&op.body, &env, &mut diagnostics),
            Item::Fn(func) => check_block(&func.body, &env, &mut diagnostics),
            _ => {}
        }
    }

    CheckResult { diagnostics }
}

fn check_block(block: &Block, env: &TypeEnv, out: &mut Vec<Diagnostic>) {
    for stmt in &block.stmts {
        check_stmt(stmt, env, out);
    }
}

fn check_stmt(stmt: &Stmt, env: &TypeEnv, out: &mut Vec<Diagnostic>) {
    match stmt {
        Stmt::Select { pstate, path, .. } => check_path(pstate, path, false, env, out),
        Stmt::Transform { pstate, path, span } => {
            check_path(pstate, path, true, env, out);
            check_transform_terminator(path, *span, out);
        }
        Stmt::If {
            consequence,
            alternative,
            ..
        } => {
            check_block(consequence, env, out);
            if let Some(alt) = alternative {
                check_block(alt, env, out);
            }
        }
        _ => {}
    }
}

fn check_path(
    pstate: &Spanned<String>,
    path: &[Expr],
    _write: bool,
    env: &TypeEnv,
    out: &mut Vec<Diagnostic>,
) {
    if !env.pstates.contains_key(&pstate.node) {
        out.push(Diagnostic::type_error(
            pstate.span,
            format!(
                "unknown pstate $${}; declare with `pstate $${}: …`",
                pstate.node, pstate.node
            ),
        ));
        return;
    }

    for seg in path {
        if let Expr::Call(c) = seg {
            if c.callee.node == "keypath" {
                for arg in c.args.iter().skip(1) {
                    if let Some((nav, span)) = navigator_lit(arg) {
                        out.push(Diagnostic::type_error(
                            span,
                            format!(
                                "navigator `{nav}` must not appear inside keypath — use a sibling path step"
                            ),
                        ));
                    }
                }
            }
        }
    }
}

fn check_transform_terminator(path: &[Expr], span: Span, out: &mut Vec<Diagnostic>) {
    let ok = match path.last() {
        Some(Expr::Call(c)) => matches!(
            c.callee.node.as_str(),
            "termval" | "term" | "multi-path" | "nil->val"
        ),
        Some(Expr::Ident(Spanned { node, .. })) | Some(Expr::Keyword(Spanned { node, .. })) => {
            is_navigator(node) || node == "NONE>"
        }
        _ => false,
    };
    if let Some(Expr::Call(c)) = path.last() {
        if c.callee.node == "nil->val" {
            out.push(Diagnostic::type_error(
                c.span,
                "transform ending in nil->val alone is not a write; follow with term / termval",
            ));
            return;
        }
    }
    if !ok {
        out.push(Diagnostic::type_error(
            span,
            "transform path should end in term / termval / multi-path / NONE>",
        ));
    }
}

fn navigator_lit(expr: &Expr) -> Option<(String, Span)> {
    match expr {
        Expr::String(Spanned { node, span }) | Expr::Ident(Spanned { node, span })
            if is_navigator(node) =>
        {
            Some((node.clone(), *span))
        }
        Expr::Keyword(Spanned { node, span }) if is_navigator(node) => {
            Some((node.clone(), *span))
        }
        _ => None,
    }
}

fn is_navigator(name: &str) -> bool {
    matches!(
        name,
        "AFTER-ELEM" | "NONE-ELEM" | "NONE>" | "ALL" | "MAP-VALS" | "MAP-KEYS" | "all"
    )
}
