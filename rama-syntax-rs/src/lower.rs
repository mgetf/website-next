//! Statement → expression lowering for `fn` bodies.
//!
//! Clojure has no `return`. Surface `return` / `let` / `if` become nested
//! `(let …)` / `(if …)` / `(cond …)` so emitted `defn` is idiomatic Clojure.

use crate::ast::*;

#[derive(Clone, Copy)]
enum Mode {
    /// Dataflow / op: locals get `*` (reserved for shared lowering later).
    #[allow(dead_code)]
    Op,
    /// Plain Clojure fn: no `*`, `return` is erased into expression value.
    Fn,
}

/// Lower a `fn` body to a single Clojure expression string (no `return`).
pub fn lower_fn_body(block: &Block, indent: usize) -> String {
    lower_stmts(&block.stmts, Mode::Fn, indent)
}

fn lower_stmts(stmts: &[Stmt], mode: Mode, indent: usize) -> String {
    let p = pad(indent);
    if stmts.is_empty() {
        return format!("{p}nil");
    }

    match &stmts[0] {
        Stmt::Return { value, .. } => {
            format!("{p}{}", emit_expr(value, mode))
        }

        Stmt::Let { pattern, value, .. } => {
            let binding = let_binding(pattern, value, mode);
            let body = lower_stmts(&stmts[1..], mode, indent + 2);
            format!("{p}(let [{binding}]\n{body})")
        }

        Stmt::If {
            condition,
            consequence,
            alternative,
            ..
        } => {
            let rest = &stmts[1..];
            let then_stmts = append_if_falls_through(&consequence.stmts, rest);
            let else_stmts = match alternative {
                Some(alt) => append_if_falls_through(&alt.stmts, rest),
                None => rest.to_vec(),
            };

            // Chain of `if (c) { return x }` with no else → compact `cond` when possible.
            if alternative.is_none()
                && matches!(consequence.stmts.as_slice(), [Stmt::Return { .. }])
                && !rest.is_empty()
            {
                return emit_cond_chain(stmts, mode, indent);
            }

            let then_e = lower_stmts(&then_stmts, mode, indent + 2);
            let else_e = lower_stmts(&else_stmts, mode, indent + 2);
            format!(
                "{p}(if {}\n{then_e}\n{else_e})",
                emit_expr(condition, mode)
            )
        }

        Stmt::Effect { value, .. } => {
            if stmts.len() == 1 {
                format!("{p}{}", emit_expr(value, mode))
            } else {
                let rest = lower_stmts(&stmts[1..], mode, indent + 2);
                format!("{p}(do\n{}{}\n{rest})", pad(indent + 2), emit_expr(value, mode))
            }
        }

        // Illegal / meaningless in fn — still lower somehow so emit doesn't panic.
        other => {
            let note = match other {
                Stmt::Fail { .. } => "fail",
                Stmt::Select { .. } => "select",
                Stmt::Transform { .. } => "transform",
                Stmt::Hash { .. } => "|hash",
                _ => "stmt",
            };
            if stmts.len() == 1 {
                format!("{p}(throw (ex-info \"{note} not valid in fn\" {{}}))")
            } else {
                lower_stmts(&stmts[1..], mode, indent)
            }
        }
    }
}

/// `if (c) { return a }; if (c2) { return b }; return c` → `(cond …)`.
fn emit_cond_chain(stmts: &[Stmt], mode: Mode, indent: usize) -> String {
    let p = pad(indent);
    let sep = format!("\n{}", pad(indent + 2));
    let mut clauses: Vec<String> = Vec::new();
    let mut i = 0;
    while i < stmts.len() {
        match &stmts[i] {
            Stmt::If {
                condition,
                consequence,
                alternative: None,
                ..
            } if matches!(consequence.stmts.as_slice(), [Stmt::Return { .. }]) => {
                let Stmt::Return { value, .. } = &consequence.stmts[0] else {
                    unreachable!()
                };
                clauses.push(format!(
                    "{}\n{}{}",
                    emit_expr(condition, mode),
                    pad(indent + 2),
                    emit_expr(value, mode)
                ));
                i += 1;
            }
            Stmt::Return { value, .. } => {
                clauses.push(format!(
                    ":else\n{}{}",
                    pad(indent + 2),
                    emit_expr(value, mode)
                ));
                return format!("{p}(cond\n{}{})", pad(indent + 2), clauses.join(&sep));
            }
            _ => break,
        }
    }
    if clauses.is_empty() {
        // Entry guard should prevent this; nested `if` without cond recursion.
        return emit_plain_if(&stmts[0], &stmts[1..], mode, indent);
    }
    // Partial chain: keep collected arms, lower the remainder as `:else`.
    let else_body = lower_stmts(&stmts[i..], mode, indent + 2);
    clauses.push(format!(":else\n{else_body}"));
    format!("{p}(cond\n{}{})", pad(indent + 2), clauses.join(&sep))
}

/// Nested `(if …)` without re-entering the cond optimizer (avoids loops).
fn emit_plain_if(head: &Stmt, rest: &[Stmt], mode: Mode, indent: usize) -> String {
    let p = pad(indent);
    let Stmt::If {
        condition,
        consequence,
        alternative,
        ..
    } = head
    else {
        return lower_stmts(
            &std::iter::once(head.clone())
                .chain(rest.iter().cloned())
                .collect::<Vec<_>>(),
            mode,
            indent,
        );
    };
    let then_stmts = append_if_falls_through(&consequence.stmts, rest);
    let else_stmts = match alternative {
        Some(alt) => append_if_falls_through(&alt.stmts, rest),
        None => rest.to_vec(),
    };
    let then_e = lower_stmts(&then_stmts, mode, indent + 2);
    let else_e = lower_stmts(&else_stmts, mode, indent + 2);
    format!(
        "{p}(if {}\n{then_e}\n{else_e})",
        emit_expr(condition, mode)
    )
}

fn append_if_falls_through(branch: &[Stmt], rest: &[Stmt]) -> Vec<Stmt> {
    if always_returns(branch) || rest.is_empty() {
        branch.to_vec()
    } else {
        let mut v = branch.to_vec();
        v.extend_from_slice(rest);
        v
    }
}

fn always_returns(stmts: &[Stmt]) -> bool {
    match stmts.last() {
        Some(Stmt::Return { .. }) => true,
        Some(Stmt::If {
            consequence,
            alternative,
            ..
        }) => {
            always_returns(&consequence.stmts)
                && alternative
                    .as_ref()
                    .is_some_and(|a| always_returns(&a.stmts))
        }
        _ => false,
    }
}

fn let_binding(pattern: &LetPattern, value: &Expr, mode: Mode) -> String {
    let rhs = emit_expr(value, mode);
    match pattern {
        LetPattern::Name(n) => format!("{} {rhs}", local_name(&n.node, mode)),
        LetPattern::Destructure(names) => {
            let keys: Vec<_> = names.iter().map(|n| n.node.clone()).collect();
            format!("{{:keys [{}]}} {rhs}", keys.join(" "))
        }
    }
}

fn local_name(name: &str, mode: Mode) -> String {
    match mode {
        Mode::Fn => name.to_string(),
        Mode::Op => format!("*{name}"),
    }
}

fn emit_expr(expr: &Expr, mode: Mode) -> String {
    match expr {
        Expr::Call(c) => {
            let mut parts = vec![c.callee.node.clone()];
            parts.extend(c.args.iter().map(|a| emit_expr(a, mode)));
            format!("({})", parts.join(" "))
        }
        Expr::List { elems, .. } => format!(
            "[{}]",
            elems
                .iter()
                .map(|e| emit_expr(e, mode))
                .collect::<Vec<_>>()
                .join(" ")
        ),
        Expr::Map { entries, .. } => {
            let parts: Vec<_> = entries
                .iter()
                .flat_map(|e| {
                    let k = emit_expr(&e.key, mode);
                    match &e.value {
                        Some(v) => vec![k, emit_expr(v, mode)],
                        None => vec![k.clone(), k],
                    }
                })
                .collect();
            format!("{{{}}}", parts.join(" "))
        }
        Expr::String(s) => format!("{:?}", s.node),
        Expr::Keyword(k) => format!(":{}", k.node),
        Expr::Ident(i) => match mode {
            Mode::Fn => i.node.clone(),
            Mode::Op => op_ident(&i.node),
        },
        Expr::Int(n) => n.node.to_string(),
        Expr::Bool(b) => b.node.to_string(),
        Expr::Binary {
            op, left, right, ..
        } => {
            let op = match op {
                BinaryOp::Eq => "=",
                BinaryOp::NotEq => "not=",
            };
            format!(
                "({op} {} {})",
                emit_expr(left, mode),
                emit_expr(right, mode)
            )
        }
        Expr::Ternary {
            cond,
            then_branch,
            else_branch,
            ..
        } => format!(
            "(if {} {} {})",
            emit_expr(cond, mode),
            emit_expr(then_branch, mode),
            emit_expr(else_branch, mode)
        ),
    }
}

fn op_ident(name: &str) -> String {
    if name
        .chars()
        .next()
        .is_some_and(|c| c.is_lowercase() || c == '_')
        && !matches!(
            name,
            "nil" | "true"
                | "false"
                | "inc"
                | "long"
                | "set"
                | "disj"
                | "contains?"
                | "even?"
                | "nil?"
                | "not"
                | "and"
                | "or"
                | "keypath"
                | "termval"
                | "term"
                | "multi-path"
                | "nil->val"
                | "AFTER-ELEM"
        )
    {
        format!("*{name}")
    } else {
        name.to_string()
    }
}

fn pad(n: usize) -> String {
    " ".repeat(n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse;

    #[test]
    fn lowers_ban_error_style_to_cond() {
        let src = r#"
module M
fn ban-error(turn, home, away, teamId, remaining, arenaId) {
  if (turn == nil) { return "no-ban-state" }
  if (teamId != (even?(turn) ? away : home)) { return "not-your-turn" }
  if (not(contains?(remaining, arenaId))) { return "arena-not-in-pool" }
  return nil
}
"#;
        let file = parse(src).expect("parse");
        let Item::Fn(func) = &file.items[1] else {
            panic!("expected fn");
        };
        let out = lower_fn_body(&func.body, 2);
        assert!(out.contains("(cond"), "got: {out}");
        assert!(out.contains("no-ban-state"), "got: {out}");
        assert!(out.contains(":else"), "got: {out}");
        assert!(!out.contains("return"), "got: {out}");
        assert!(!out.contains("ack-return"), "got: {out}");
    }

    #[test]
    fn lowers_let_to_clojure_let() {
        let src = r#"
module M
fn add1(x) {
  let y = inc(x)
  return y
}
"#;
        let file = parse(src).expect("parse");
        let Item::Fn(func) = &file.items[1] else {
            panic!("expected fn");
        };
        let out = lower_fn_body(&func.body, 0);
        assert!(out.contains("(let [y (inc x)]"), "got: {out}");
        assert!(out.contains("y)"), "got: {out}");
        assert!(!out.contains("*y"), "got: {out}");
    }
}
