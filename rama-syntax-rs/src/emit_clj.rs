//! Emit v2 AST as Clojure Rama source (transpiler).

use crate::ast::*;

pub fn emit_clojure(file: &SourceFile) -> String {
    let mut out = String::from(";; Generated from .rama v2 — edit the .rama source.\n\n");
    for (i, item) in file.items.iter().enumerate() {
        if i > 0 {
            out.push('\n');
        }
        out.push_str(&emit_item(item));
        out.push('\n');
    }
    out
}

fn emit_item(item: &Item) -> String {
    match item {
        Item::Module(m) => format!("(ns {} (:use [com.rpl.rama] [com.rpl.rama.path]))", m.name.node),
        Item::Struct(s) => {
            let fields: Vec<_> = s
                .fields
                .iter()
                .map(|f| format!(":{} {}", f.name.node, emit_type(&f.ty.node)))
                .collect();
            format!(";; struct {} {{{}}}", s.name.node, fields.join(" "))
        }
        Item::PState(p) => format!(
            "(declare-pstate s $${}\n  {})",
            p.name.node,
            emit_pstate_type(&p.ty.node)
        ),
        Item::Depot(d) => format!(
            "(declare-depot setup *{} (hash-by {}))",
            d.name.node, d.keyed_by.node
        ),
        Item::Op(op) => {
            let params: Vec<_> = op.params.iter().map(|p| format!("*{}", p.node)).collect();
            format!(
                "(deframaop {}>\n  [{}]\n{})",
                op.name.node,
                params.join(" "),
                emit_block(&op.body, 2)
            )
        }
        Item::Fn(func) => {
            let params: Vec<_> = func.params.iter().map(|p| p.node.clone()).collect();
            format!(
                "(defn {}\n  [{}]\n{})",
                func.name.node,
                params.join(" "),
                emit_block(&func.body, 2)
            )
        }
    }
}

fn emit_pstate_type(ty: &TypeExpr) -> String {
    match ty {
        TypeExpr::Map {
            key,
            value,
            subindexed,
        } => match value.as_ref() {
            TypeExpr::Named(name) => {
                format!("{{{} {}}}", emit_type(key), name)
            }
            TypeExpr::Map {
                key: k2,
                value: v2,
                subindexed: inner_sub,
            } => {
                let sub = if *subindexed || *inner_sub {
                    " {:subindex? true}"
                } else {
                    ""
                };
                format!(
                    "{{{} (map-schema {} {}{sub})}}",
                    emit_type(key),
                    emit_type(k2),
                    emit_type(v2)
                )
            }
            other => format!("{{{} {}}}", emit_type(key), emit_type(other)),
        },
        other => emit_type(other),
    }
}

fn emit_type(ty: &TypeExpr) -> String {
    match ty {
        TypeExpr::Named(n) => n.clone(),
        TypeExpr::Object => "Object".into(),
        TypeExpr::Map {
            key,
            value,
            subindexed,
        } => {
            let sub = if *subindexed {
                " {:subindex? true}"
            } else {
                ""
            };
            format!(
                "(map-schema {} {}{sub})",
                emit_type(key),
                emit_type(value)
            )
        }
    }
}

fn emit_block(block: &Block, indent: usize) -> String {
    if block.stmts.is_empty() {
        return format!("{}nil", pad(indent));
    }
    block
        .stmts
        .iter()
        .map(|s| emit_stmt(s, indent))
        .collect::<Vec<_>>()
        .join("\n")
}

fn emit_stmt(stmt: &Stmt, indent: usize) -> String {
    let p = pad(indent);
    match stmt {
        Stmt::Let { pattern, value, .. } => {
            let target = emit_let_pattern(pattern);
            format!("{p}{}", emit_bind(value, &target))
        }
        Stmt::Select {
            pstate,
            path,
            target,
            ..
        } => {
            format!(
                "{p}(local-select> {} $${} :> {})",
                emit_path(path),
                pstate.node,
                emit_binding_target(target)
            )
        }
        Stmt::Transform { pstate, path, .. } => {
            format!(
                "{p}(local-transform> [{}] $${})",
                path.iter().map(emit_expr).collect::<Vec<_>>().join(" "),
                pstate.node
            )
        }
        Stmt::Fail {
            value, condition, ..
        } => format!(
            "{p}(<<if {}\n{}(ack-return> {{\"ok\" false \"error\" {}}})\n{p})",
            emit_expr(condition),
            pad(indent + 2),
            emit_expr(value)
        ),
        Stmt::Return { value, .. } => format!("{p}(ack-return> {})", emit_expr(value)),
        Stmt::Hash { key, .. } => format!("{p}(|hash {})", emit_expr(key)),
        Stmt::Effect { value, .. } => format!("{p}{}", emit_expr(value)),
        Stmt::If {
            condition,
            consequence,
            alternative,
            ..
        } => match alternative {
            Some(alt) => format!(
                "{p}(<<if {}\n{}\n{}(else>)\n{}\n{p})",
                emit_expr(condition),
                emit_block(consequence, indent + 2),
                pad(indent + 1),
                emit_block(alt, indent + 2)
            ),
            None => format!(
                "{p}(<<if {}\n{}\n{p})",
                emit_expr(condition),
                emit_block(consequence, indent + 2)
            ),
        },
    }
}

fn emit_let_pattern(pattern: &LetPattern) -> String {
    match pattern {
        LetPattern::Name(n) => format!("*{}", n.node),
        LetPattern::Destructure(names) => {
            let inner: Vec<_> = names
                .iter()
                .map(|n| format!("*{} :{}", n.node, n.node))
                .collect();
            format!("{{{}}}", inner.join(" "))
        }
    }
}

fn emit_binding_target(target: &BindingTarget) -> String {
    match target {
        BindingTarget::Name(n) => format!("*{}", n.node),
        BindingTarget::Destructure(names) => {
            let inner: Vec<_> = names
                .iter()
                .map(|n| format!("*{} :{}", n.node, n.node))
                .collect();
            format!("{{{}}}", inner.join(" "))
        }
    }
}

fn emit_path(path: &[Expr]) -> String {
    match path {
        [one] => emit_expr(one),
        _ => format!(
            "[{}]",
            path.iter().map(emit_expr).collect::<Vec<_>>().join(" ")
        ),
    }
}

fn emit_bind(value: &Expr, target: &str) -> String {
    match value {
        Expr::Call(c) => {
            let mut parts = vec![c.callee.node.clone()];
            parts.extend(c.args.iter().map(emit_expr));
            parts.push(format!(":> {target}"));
            format!("({})", parts.join(" "))
        }
        Expr::Ident(i) if i.node == "event" || !i.node.starts_with('*') => {
            // destructure from event-like ident
            format!("(identity *{} :> {target})", i.node)
        }
        _ => format!("(identity {} :> {target})", emit_expr(value)),
    }
}

fn emit_expr(expr: &Expr) -> String {
    match expr {
        Expr::Call(c) => {
            let mut parts = vec![c.callee.node.clone()];
            parts.extend(c.args.iter().map(emit_expr));
            format!("({})", parts.join(" "))
        }
        Expr::List { elems, .. } => format!(
            "[{}]",
            elems.iter().map(emit_expr).collect::<Vec<_>>().join(" ")
        ),
        Expr::Map { entries, .. } => {
            let parts: Vec<_> = entries
                .iter()
                .flat_map(|e| {
                    let k = emit_expr(&e.key);
                    match &e.value {
                        Some(v) => vec![k, emit_expr(v)],
                        None => vec![k.clone(), k],
                    }
                })
                .collect();
            format!("{{{}}}", parts.join(" "))
        }
        Expr::String(s) => format!("{:?}", s.node),
        Expr::Keyword(k) => format!(":{}", k.node),
        Expr::Ident(i) => {
            // bare names in dataflow become *bindings when they look like locals
            if i.node
                .chars()
                .next()
                .is_some_and(|c| c.is_lowercase() || c == '_')
                && !matches!(
                    i.node.as_str(),
                    "nil" | "true" | "false" | "inc" | "long" | "set" | "disj" | "contains?"
                        | "even?" | "nil?" | "not" | "and" | "or" | "keypath" | "termval"
                        | "term" | "multi-path" | "nil->val" | "AFTER-ELEM"
                )
            {
                format!("*{}", i.node)
            } else {
                i.node.clone()
            }
        }
        Expr::Int(n) => n.node.to_string(),
        Expr::Bool(b) => b.node.to_string(),
        Expr::Binary {
            op, left, right, ..
        } => {
            let op = match op {
                BinaryOp::Eq => "=",
                BinaryOp::NotEq => "not=",
            };
            format!("({op} {} {})", emit_expr(left), emit_expr(right))
        }
        Expr::Ternary {
            cond,
            then_branch,
            else_branch,
            ..
        } => format!(
            "(if {} {} {})",
            emit_expr(cond),
            emit_expr(then_branch),
            emit_expr(else_branch)
        ),
    }
}

fn pad(n: usize) -> String {
    " ".repeat(n)
}
