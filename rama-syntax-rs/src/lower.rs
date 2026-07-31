//! Statement → expression lowering for `fn` bodies.
//!
//! Produces [`clj::Form`] (not source text). Clojure has no `return`; surface
//! `return` / `let` / `if` become nested `let` / `if` / `cond` forms.

use crate::ast::*;
use crate::clj::{self, Form};

#[derive(Clone, Copy)]
enum Mode {
    /// Dataflow / op: locals get `*` (reserved for shared lowering later).
    #[allow(dead_code)]
    Op,
    /// Plain Clojure fn: no `*`, `return` is erased into expression value.
    Fn,
}

/// Lower a `fn` body to one Clojure expression form (no `return`).
pub fn lower_fn_body(block: &Block) -> Form {
    lower_stmts(&block.stmts, Mode::Fn)
}

fn lower_stmts(stmts: &[Stmt], mode: Mode) -> Form {
    if stmts.is_empty() {
        return clj::nil();
    }

    match &stmts[0] {
        Stmt::Return { value, .. } => expr(value, mode),

        Stmt::Let { pattern, value, .. } => {
            let binding = let_binding(pattern, value, mode);
            let body = lower_stmts(&stmts[1..], mode);
            clj::call("let", [clj::vector(binding), body])
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

            if alternative.is_none()
                && matches!(consequence.stmts.as_slice(), [Stmt::Return { .. }])
                && !rest.is_empty()
            {
                return cond_chain(stmts, mode);
            }

            clj::call(
                "if",
                [
                    expr(condition, mode),
                    lower_stmts(&then_stmts, mode),
                    lower_stmts(&else_stmts, mode),
                ],
            )
        }

        Stmt::Effect { value, .. } => {
            if stmts.len() == 1 {
                expr(value, mode)
            } else {
                clj::call(
                    "do",
                    [expr(value, mode), lower_stmts(&stmts[1..], mode)],
                )
            }
        }

        other => {
            let note = match other {
                Stmt::Fail { .. } => "fail",
                Stmt::Select { .. } => "select",
                Stmt::Transform { .. } => "transform",
                Stmt::Hash { .. } => "|hash",
                _ => "stmt",
            };
            if stmts.len() == 1 {
                clj::call(
                    "throw",
                    [clj::call(
                        "ex-info",
                        [clj::string(format!("{note} not valid in fn")), clj::map([])],
                    )],
                )
            } else {
                lower_stmts(&stmts[1..], mode)
            }
        }
    }
}

fn cond_chain(stmts: &[Stmt], mode: Mode) -> Form {
    let mut arms: Vec<Form> = Vec::new();
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
                arms.push(expr(condition, mode));
                arms.push(expr(value, mode));
                i += 1;
            }
            Stmt::Return { value, .. } => {
                arms.push(clj::kw("else"));
                arms.push(expr(value, mode));
                return clj::call("cond", arms);
            }
            _ => break,
        }
    }
    if arms.is_empty() {
        return plain_if(&stmts[0], &stmts[1..], mode);
    }
    arms.push(clj::kw("else"));
    arms.push(lower_stmts(&stmts[i..], mode));
    clj::call("cond", arms)
}

fn plain_if(head: &Stmt, rest: &[Stmt], mode: Mode) -> Form {
    let Stmt::If {
        condition,
        consequence,
        alternative,
        ..
    } = head
    else {
        let mut all = vec![head.clone()];
        all.extend_from_slice(rest);
        return lower_stmts(&all, mode);
    };
    let then_stmts = append_if_falls_through(&consequence.stmts, rest);
    let else_stmts = match alternative {
        Some(alt) => append_if_falls_through(&alt.stmts, rest),
        None => rest.to_vec(),
    };
    clj::call(
        "if",
        [
            expr(condition, mode),
            lower_stmts(&then_stmts, mode),
            lower_stmts(&else_stmts, mode),
        ],
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

fn let_binding(pattern: &LetPattern, value: &Expr, mode: Mode) -> Vec<Form> {
    let rhs = expr(value, mode);
    match pattern {
        LetPattern::Name(n) => vec![local(n.node.as_str(), mode), rhs],
        LetPattern::Destructure(names) => {
            let keys: Vec<Form> = names.iter().map(|n| clj::sym(n.node.clone())).collect();
            vec![
                clj::map([(clj::kw("keys"), clj::vector(keys))]),
                rhs,
            ]
        }
    }
}

fn local(name: &str, mode: Mode) -> Form {
    match mode {
        Mode::Fn => clj::sym(name),
        Mode::Op => clj::sym(format!("*{name}")),
    }
}

fn expr(e: &Expr, mode: Mode) -> Form {
    match e {
        Expr::Call(c) => {
            let mut args = Vec::with_capacity(c.args.len());
            args.extend(c.args.iter().map(|a| expr(a, mode)));
            clj::call(c.callee.node.clone(), args)
        }
        Expr::List { elems, .. } => clj::vector(elems.iter().map(|a| expr(a, mode))),
        Expr::Map { entries, .. } => clj::map(entries.iter().map(|ent| {
            let k = expr(&ent.key, mode);
            let v = match &ent.value {
                Some(v) => expr(v, mode),
                None => k.clone(),
            };
            (k, v)
        })),
        Expr::String(s) => clj::string(s.node.clone()),
        Expr::Keyword(k) => clj::kw(k.node.clone()),
        Expr::Ident(i) => match mode {
            Mode::Fn => clj::sym(i.node.clone()),
            Mode::Op => clj::sym(op_ident(&i.node)),
        },
        Expr::Int(n) => clj::int(n.node),
        Expr::Bool(b) => clj::bool(b.node),
        Expr::Binary {
            op, left, right, ..
        } => {
            let op = match op {
                BinaryOp::Eq => "=",
                BinaryOp::NotEq => "not=",
            };
            clj::call(op, [expr(left, mode), expr(right, mode)])
        }
        Expr::Ternary {
            cond,
            then_branch,
            else_branch,
            ..
        } => clj::call(
            "if",
            [
                expr(cond, mode),
                expr(then_branch, mode),
                expr(else_branch, mode),
            ],
        ),
    }
}

fn op_ident(name: &str) -> String {
    if looks_like_local(name) {
        format!("*{name}")
    } else {
        name.to_string()
    }
}

fn looks_like_local(name: &str) -> bool {
    name.chars()
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
                | "some?"
                | "keypath"
                | "termval"
                | "term"
                | "multi-path"
                | "nil->val"
                | "AFTER-ELEM"
        )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clj::render;
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
        let out = render(&lower_fn_body(&func.body));
        assert!(out.contains("cond"), "got: {out}");
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
        let form = lower_fn_body(&func.body);
        assert!(
            matches!(&form, Form::List(xs) if xs.first() == Some(&clj::sym("let"))),
            "expected let form, got {form:?}"
        );
        let out = render(&form);
        assert!(out.contains("inc"), "got: {out}");
        assert!(out.contains('y'), "got: {out}");
        assert!(!out.contains("*y"), "got: {out}");
    }
}
