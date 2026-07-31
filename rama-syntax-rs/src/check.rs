//! Type-checker stub for Rama surface syntax.
//!
//! Focus (from tommy-mor/rama-syntax `init.tdsl`):
//! > "having a path static typechecker on pstates would be amazing.
//! > Existing semantics are it usually returns nil or _maybe_ throws if you're lucky."
//!
//! This stub walks select (`-->`) / transform (`!<--`) paths against declared
//! `pstate` schemas and emits diagnostics. It does **not** yet model full
//! dataflow types, partition hops, or Clojure helper return types.

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

/// Environment of known PState schemas.
#[derive(Debug, Clone, Default)]
pub struct TypeEnv {
    pub pstates: HashMap<String, PStateSchema>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PStateSchema {
    pub key: TypeExpr,
    pub value: TypeExpr,
}

pub fn check(file: &SourceFile) -> CheckResult {
    let mut env = TypeEnv::default();
    let mut diagnostics = Vec::new();

    // Collect schemas first.
    for item in &file.items {
        if let Item::PState(decl) = item {
            env.pstates.insert(
                decl.name.node.clone(),
                PStateSchema {
                    key: decl.key.node.clone(),
                    value: decl.value.node.clone(),
                },
            );
        }
    }

    for item in &file.items {
        match item {
            Item::RamaOp(op) => check_block(&op.body, &env, &mut diagnostics),
            Item::RamaFn(_) => {
                // inline ramafn bodies are expression-only; no path checks yet
            }
            Item::PState(_) => {}
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
        Stmt::Transform { pstate, path, span } => {
            check_path_access(pstate, path, PathMode::Transform, env, *span, out);
        }
        Stmt::Select {
            pstate,
            path,
            span,
            ..
        } => {
            check_path_access(pstate, path, PathMode::Select, env, *span, out);
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
        Stmt::Atomic { body, .. } => check_block(body, env, out),
        Stmt::RamaFn(_)
        | Stmt::Anchor { .. }
        | Stmt::Effect { .. }
        | Stmt::HookNamed { .. }
        | Stmt::HookAnchor { .. }
        | Stmt::Unify { .. }
        | Stmt::Sink { .. } => {}
    }
}

#[derive(Clone, Copy)]
enum PathMode {
    Select,
    Transform,
}

fn check_path_access(
    pstate: &Spanned<String>,
    path: &[Expr],
    mode: PathMode,
    env: &TypeEnv,
    stmt_span: Span,
    out: &mut Vec<Diagnostic>,
) {
    let Some(schema) = env.pstates.get(&pstate.node) else {
        out.push(Diagnostic::type_error(
            pstate.span,
            format!(
                "unknown pstate $${}; declare it with `pstate $${} {{ Key -> Value }}`",
                pstate.node, pstate.node
            ),
        ));
        return;
    };

    if path.is_empty() {
        out.push(Diagnostic::type_error(
            stmt_span,
            "empty path expression",
        ));
        return;
    }

    // Walk path segments against the value schema.
    // Common patterns from MatchModule / rama-syntax examples:
    //   keypath(*id)                          — root entity
    //   keypath(*id, "field")                 — fixed field
    //   keypath(*id, "field"), termval(x)     — transform write
    //   keypath(*id), AFTER-ELEM, termval(x)  — navigator after keypath (NOT inside)
    //   keypath(*a, *b), termval(x)           — nested map

    let mut ty = &schema.value;
    let mut i = 0usize;

    while i < path.len() {
        let seg = &path[i];

        if let Some(call) = as_call(seg) {
            match call.callee.node.as_str() {
                "keypath" => {
                    if call.args.is_empty() {
                        out.push(Diagnostic::type_error(
                            call.span,
                            "keypath requires at least the partition/entity key",
                        ));
                        i += 1;
                        continue;
                    }
                    // args[0] = map key (checked loosely against schema.key)
                    check_key_compat(&call.args[0], &schema.key, out);

                    // MatchModule scar: flag navigators inside keypath before
                    // field descent (so unknown fields don't hide this check).
                    let mut nav_in_keypath = false;
                    for arg in call.args.iter().skip(1) {
                        if let Some((nav, span)) = navigator_lit(arg) {
                            out.push(Diagnostic::type_error(
                                span,
                                format!(
                                    "navigator `{nav}` must not appear inside keypath — use it as a sibling path step"
                                ),
                            ));
                            nav_in_keypath = true;
                        }
                    }
                    if nav_in_keypath {
                        i += 1;
                        continue;
                    }

                    // remaining keypath args are nested field / map keys into `ty`
                    let mut dead = false;
                    for arg in call.args.iter().skip(1) {
                        match descend_field(ty, arg, out) {
                            Some(next) => ty = next,
                            None => {
                                dead = true;
                                break;
                            }
                        }
                    }
                    if dead {
                        i += 1;
                        continue;
                    }
                }
                "termval" | "term" | "nil->val" | "selected" | "selected?" | "multi-path"
                | "set-elem" => {
                    // terminal / navigator ops — transform paths should end with term/termval/NONE>
                    if matches!(mode, PathMode::Select)
                        && matches!(call.callee.node.as_str(), "termval" | "term")
                    {
                        out.push(Diagnostic::type_error(
                            call.span,
                            format!(
                                "{} is a write terminator; use it on !<-- transform paths, not --> select",
                                call.callee.node
                            ),
                        ));
                    }
                    if matches!(mode, PathMode::Transform)
                        && i == path.len() - 1
                        && !matches!(call.callee.node.as_str(), "termval" | "term" | "NONE>")
                    {
                        // soft note: last segment of transform should terminate
                        // keep as warning-style type error for the stub
                        if !matches!(
                            call.callee.node.as_str(),
                            "termval" | "term" | "nil->val" | "multi-path"
                        ) {
                            out.push(Diagnostic::type_error(
                                call.span,
                                "transform path should end in term / termval / NONE>",
                            ));
                        }
                    }
                    // termval value type vs current field — stub equality check
                    if call.callee.node == "termval" {
                        if let (Some(val), Some(expected)) =
                            (call.args.first(), leaf_type_name(ty))
                        {
                            if let Some(got) = infer_lit_type(val) {
                                if !types_compatible(&got, expected) {
                                    out.push(Diagnostic::type_error(
                                        val.span(),
                                        format!(
                                            "termval type mismatch: expected {expected}, got {got}"
                                        ),
                                    ));
                                }
                            }
                        }
                    }
                }
                other => {
                    // Unknown path helper — allow, but flag ALL / AFTER-ELEM mistaken as keypath args elsewhere
                    if other == "keypath" {
                        unreachable!()
                    }
                }
            }
            i += 1;
            continue;
        }

        // Bare navigators (AFTER-ELEM, NONE>, ALL, MAP-VALS) — must not be treated as map keys.
        if let Expr::Ident(Spanned { node, span }) | Expr::Keyword(Spanned { node, span }) = seg {
            let nav = node.trim_start_matches(':');
            if is_navigator(nav) {
                // Knot from mge.tf MatchModule: navigators do not go *inside* keypath.
                // If previous segment was keypath with >1 args and this is AFTER-ELEM, that's fine (sibling).
                // Flag if someone wrote a string "AFTER-ELEM" as a field — handled below.
                i += 1;
                continue;
            }
            // keyword field step on fixed schema
            ty = match descend_named_field(ty, nav, *span, out) {
                Some(next) => next,
                None => return,
            };
            i += 1;
            continue;
        }

        if let Expr::String(Spanned { node, span }) = seg {
            if is_navigator(node) {
                out.push(Diagnostic::type_error(
                    *span,
                    format!(
                        "`{node}` looks like a navigator — pass it as a bare path step, not a string key (and never inside keypath)"
                    ),
                ));
            } else {
                ty = match descend_named_field(ty, node, *span, out) {
                    Some(next) => next,
                    None => return,
                };
            }
            i += 1;
            continue;
        }

        // Binding / other dynamic segments — opaque descend into map values
        if let TypeExpr::Map { value } = ty {
            ty = value.as_ref();
        } else if matches!(ty, TypeExpr::Object) {
            // opaque
        }
        i += 1;
    }

    // Transform must terminate
    if matches!(mode, PathMode::Transform) {
        let last = path.last();
        if let Some(Expr::Call(c)) = last {
            if c.callee.node == "nil->val" {
                out.push(Diagnostic::type_error(
                    c.span,
                    "transform path ending in nil->val alone is not a write; follow with term / termval",
                ));
            } else if !matches!(c.callee.node.as_str(), "termval" | "term" | "multi-path")
                && !c.callee.node.ends_with('>')
            {
                out.push(Diagnostic::type_error(
                    stmt_span,
                    "transform path should end in term / termval / NONE>",
                ));
            }
        } else {
            let ok = match last {
                Some(Expr::Ident(Spanned { node, .. })) => {
                    node == "NONE>" || is_navigator(node)
                }
                Some(Expr::Keyword(Spanned { node, .. })) => {
                    node == "NONE>" || is_navigator(node)
                }
                _ => false,
            };
            if !ok {
                out.push(Diagnostic::type_error(
                    stmt_span,
                    "transform path should end in term / termval / NONE>",
                ));
            }
        }
    }
}

fn as_call(expr: &Expr) -> Option<&CallExpr> {
    match expr {
        Expr::Call(c) => Some(c),
        _ => None,
    }
}

fn is_navigator(name: &str) -> bool {
    matches!(
        name,
        "AFTER-ELEM"
            | "NONE-ELEM"
            | "NONE>"
            | "ALL"
            | "MAP-VALS"
            | "MAP-KEYS"
            | "STAY"
            | "STOP"
            | "BEGIN"
            | "END"
            | "all"
    )
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

fn check_key_compat(arg: &Expr, expected: &TypeExpr, out: &mut Vec<Diagnostic>) {
    if let (Some(got), TypeExpr::Named(exp)) = (infer_lit_type(arg), expected) {
        if !types_compatible(&got, exp) {
            out.push(Diagnostic::type_error(
                arg.span(),
                format!("keypath key type mismatch: expected {exp}, got {got}"),
            ));
        }
    }
}

fn descend_field<'a>(
    ty: &'a TypeExpr,
    arg: &Expr,
    out: &mut Vec<Diagnostic>,
) -> Option<&'a TypeExpr> {
    match arg {
        Expr::String(Spanned { node, span }) => {
            if is_navigator(node) {
                out.push(Diagnostic::type_error(
                    *span,
                    format!(
                        "navigator `{node}` must not appear inside keypath — use it as a sibling path step"
                    ),
                ));
                return None;
            }
            descend_named_field(ty, node, *span, out)
        }
        Expr::Keyword(Spanned { node, span }) => {
            if is_navigator(node) {
                out.push(Diagnostic::type_error(
                    *span,
                    format!(
                        "navigator `{node}` must not appear inside keypath — use it as a sibling path step"
                    ),
                ));
                return None;
            }
            descend_named_field(ty, node, *span, out)
        }
        Expr::Binding(_) | Expr::Ident(_) | Expr::Call(_) => {
            // dynamic key — if map, descend to value; if fixed, opaque
            match ty {
                TypeExpr::Map { value } => Some(value.as_ref()),
                TypeExpr::Fixed { .. } => Some(ty), // can't refine
                TypeExpr::Object => Some(ty),
                TypeExpr::Named(_) => Some(ty),
            }
        }
        _ => Some(ty),
    }
}

fn descend_named_field<'a>(
    ty: &'a TypeExpr,
    field: &str,
    span: Span,
    out: &mut Vec<Diagnostic>,
) -> Option<&'a TypeExpr> {
    match ty {
        TypeExpr::Fixed { fields } => {
            if let Some((_, field_ty)) = fields.iter().find(|(k, _)| k == field) {
                Some(field_ty)
            } else {
                let known: Vec<_> = fields.iter().map(|(k, _)| k.as_str()).collect();
                out.push(Diagnostic::type_error(
                    span,
                    format!(
                        "unknown field `{field}` on fixed-keys schema (known: {})",
                        if known.is_empty() {
                            "<none>".to_string()
                        } else {
                            known.join(", ")
                        }
                    ),
                ));
                None
            }
        }
        TypeExpr::Map { value } => Some(value.as_ref()),
        TypeExpr::Object => Some(ty),
        TypeExpr::Named(name) => {
            out.push(Diagnostic::type_error(
                span,
                format!("cannot select field `{field}` on scalar type {name}"),
            ));
            None
        }
    }
}

fn leaf_type_name(ty: &TypeExpr) -> Option<&str> {
    match ty {
        TypeExpr::Named(n) => Some(n.as_str()),
        TypeExpr::Object => Some("Object"),
        TypeExpr::Fixed { .. } | TypeExpr::Map { .. } => None,
    }
}

fn infer_lit_type(expr: &Expr) -> Option<String> {
    match expr {
        Expr::String(_) => Some("String".into()),
        Expr::Int(_) => Some("Long".into()),
        Expr::Bool(_) => Some("Boolean".into()),
        Expr::List { .. } => Some("Object".into()),
        Expr::Map { .. } => Some("Object".into()),
        _ => None,
    }
}

fn types_compatible(got: &str, expected: &str) -> bool {
    if got == expected || expected == "Object" {
        return true;
    }
    // JSON numbers often arrive as Int; Rama stores Long
    matches!((got, expected), ("Long", "Long") | ("Long", "Object"))
        || (got == "Long" && expected == "Long")
}
