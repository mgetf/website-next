//! User-facing Rama rules over semantic `.rama` IR.

use super::engine::{Engine, Rule, Violation};
use crate::ast::{Block, Expr, Stmt};
use crate::rama_ir::{BodyKind, Program};
use crate::span::{Span, Spanned};

pub fn rama_engine() -> Engine {
    Engine::new(vec![
        Box::new(KnownPState),
        Box::new(NavigatorOutsideKeypath),
        Box::new(TransformHasWriteTerm),
        Box::new(FnContainsOnlyClojure),
        Box::new(CastOnlyInFn),
        Box::new(ShallowExplicitOpIf),
    ])
}

fn walk_expr(expr: &Expr, f: &mut impl FnMut(&Expr)) {
    f(expr);
    match expr {
        Expr::Call(call) => {
            for arg in &call.args {
                walk_expr(arg, f);
            }
        }
        Expr::List { elems, .. } => {
            for elem in elems {
                walk_expr(elem, f);
            }
        }
        Expr::Map { entries, .. } => {
            for entry in entries {
                walk_expr(&entry.key, f);
                if let Some(value) = &entry.value {
                    walk_expr(value, f);
                }
            }
        }
        Expr::Binary { left, right, .. } => {
            walk_expr(left, f);
            walk_expr(right, f);
        }
        Expr::Ternary {
            cond,
            then_branch,
            else_branch,
            ..
        } => {
            walk_expr(cond, f);
            walk_expr(then_branch, f);
            walk_expr(else_branch, f);
        }
        Expr::As { value, .. } => walk_expr(value, f),
        Expr::String(_) | Expr::Keyword(_) | Expr::Ident(_) | Expr::Int(_) | Expr::Bool(_) => {}
    }
}

fn walk_statement_exprs(statement: &Stmt, f: &mut impl FnMut(&Expr)) {
    match statement {
        Stmt::Let { value, .. } | Stmt::Return { value, .. } | Stmt::Effect { value, .. } => {
            walk_expr(value, f)
        }
        Stmt::Select { path, .. } | Stmt::Transform { path, .. } => {
            for expr in path {
                walk_expr(expr, f);
            }
        }
        Stmt::Fail {
            value, condition, ..
        } => {
            walk_expr(value, f);
            walk_expr(condition, f);
        }
        Stmt::Hash { key, .. } => walk_expr(key, f),
        Stmt::If { condition, .. } => walk_expr(condition, f),
    }
}

fn walk_block(block: &Block, f: &mut impl FnMut(&Stmt)) {
    for stmt in &block.stmts {
        f(stmt);
        if let Stmt::If {
            consequence,
            alternative,
            ..
        } = stmt
        {
            walk_block(consequence, f);
            if let Some(alt) = alternative {
                walk_block(alt, f);
            }
        }
    }
}

struct KnownPState;

impl Rule for KnownPState {
    fn id(&self) -> &'static str {
        "rama/known-pstate"
    }

    fn title(&self) -> &'static str {
        "PState references must resolve"
    }

    fn because(&self) -> &'static str {
        "An undeclared $$ name cannot be resolved by the generated Rama module"
    }

    fn check(&self, program: &Program<'_>) -> Vec<Violation> {
        let mut out = Vec::new();
        for body in &program.bodies {
            walk_block(body.block, &mut |stmt| {
                let pstate = match stmt {
                    Stmt::Select { pstate, .. } | Stmt::Transform { pstate, .. } => Some(pstate),
                    _ => None,
                };
                if let Some(pstate) = pstate {
                    if !program.pstates.contains_key(pstate.node.as_str()) {
                        out.push(Violation::new(
                            self,
                            pstate.span,
                            format!(
                                "unknown pstate $${}; declare it with `pstate $${}: …`",
                                pstate.node, pstate.node
                            ),
                        ));
                    }
                }
            });
        }
        out
    }
}

struct NavigatorOutsideKeypath;

impl Rule for NavigatorOutsideKeypath {
    fn id(&self) -> &'static str {
        "rama/navigator-outside-keypath"
    }

    fn title(&self) -> &'static str {
        "Navigators are sibling path steps"
    }

    fn because(&self) -> &'static str {
        "A navigator inside keypath is treated as a key; AFTER-ELEM there causes `Key must be integer` and worker death"
    }

    fn check(&self, program: &Program<'_>) -> Vec<Violation> {
        let mut out = Vec::new();
        for body in &program.bodies {
            walk_block(body.block, &mut |stmt| {
                let path = match stmt {
                    Stmt::Select { path, .. } | Stmt::Transform { path, .. } => Some(path),
                    _ => None,
                };
                let Some(path) = path else {
                    return;
                };
                for segment in path {
                    if let Expr::Call(call) = segment {
                        if call.callee.node == "keypath" {
                            for arg in &call.args {
                                if let Some((name, span)) = navigator(arg) {
                                    out.push(Violation::new(
                                        self,
                                        span,
                                        format!(
                                            "`{name}` must follow keypath as a sibling path step"
                                        ),
                                    ));
                                }
                            }
                        }
                    }
                }
            });
        }
        out
    }
}

struct TransformHasWriteTerm;

impl Rule for TransformHasWriteTerm {
    fn id(&self) -> &'static str {
        "rama/transform-has-write-term"
    }

    fn title(&self) -> &'static str {
        "Transforms end in a write navigator"
    }

    fn because(&self) -> &'static str {
        "nil->val is only a view navigator; without term/termval/NONE> the transform does not write"
    }

    fn check(&self, program: &Program<'_>) -> Vec<Violation> {
        let mut out = Vec::new();
        for body in &program.bodies {
            walk_block(body.block, &mut |stmt| {
                let Stmt::Transform { path, span, .. } = stmt else {
                    return;
                };
                if !path_ends_in_write(path) {
                    out.push(Violation::new(
                        self,
                        *span,
                        "transform path must end in term, termval, multi-path, or NONE>",
                    ));
                }
            });
        }
        out
    }
}

struct FnContainsOnlyClojure;

impl Rule for FnContainsOnlyClojure {
    fn id(&self) -> &'static str {
        "rama/fn-no-dataflow"
    }

    fn title(&self) -> &'static str {
        "Plain fn bodies cannot contain dataflow statements"
    }

    fn because(&self) -> &'static str {
        "fn lowers to ordinary Clojure; PState select/transform, fail, and |hash require an op dataflow context"
    }

    fn check(&self, program: &Program<'_>) -> Vec<Violation> {
        let mut out = Vec::new();
        for body in &program.bodies {
            if body.kind != BodyKind::Fn {
                continue;
            }
            walk_block(body.block, &mut |stmt| {
                let (kind, span) = match stmt {
                    Stmt::Select { span, .. } => ("pstate select", *span),
                    Stmt::Transform { span, .. } => ("pstate transform", *span),
                    Stmt::Fail { span, .. } => ("fail", *span),
                    Stmt::Hash { span, .. } => ("|hash", *span),
                    _ => return,
                };
                out.push(Violation::new(
                    self,
                    span,
                    format!("`{kind}` is only valid inside `op`"),
                ));
            });
        }
        out
    }
}

struct ShallowExplicitOpIf;

struct CastOnlyInFn;

impl Rule for CastOnlyInFn {
    fn id(&self) -> &'static str {
        "rama/as-only-in-fn"
    }

    fn title(&self) -> &'static str {
        "Checked `as` belongs to ordinary typed functions"
    }

    fn because(&self) -> &'static str {
        "dataflow typing is not implemented yet; lowering a Clojure contract predicate inside Flow IR would be invalid"
    }

    fn check(&self, program: &Program<'_>) -> Vec<Violation> {
        let mut out = Vec::new();
        for body in &program.bodies {
            if body.kind != BodyKind::Op {
                continue;
            }
            walk_block(body.block, &mut |statement| {
                walk_statement_exprs(statement, &mut |expr| {
                    if let Expr::As { span, .. } = expr {
                        out.push(Violation::new(
                            self,
                            *span,
                            "`as` is not available in `op` until typed Flow IR lands",
                        ));
                    }
                });
            });
        }
        out
    }
}

impl Rule for ShallowExplicitOpIf {
    fn id(&self) -> &'static str {
        "rama/shallow-op-if"
    }

    fn title(&self) -> &'static str {
        "Keep explicit op branching shallow"
    }

    fn because(&self) -> &'static str {
        "Deep <<if trees overflow clojure.algo.monads during Rama compilation; move predicates into fn or use fail guards"
    }

    fn check(&self, program: &Program<'_>) -> Vec<Violation> {
        let mut out = Vec::new();
        for body in &program.bodies {
            if body.kind == BodyKind::Op {
                check_if_depth(body.block, 0, self, &mut out);
            }
        }
        out
    }
}

fn check_if_depth(block: &Block, depth: usize, rule: &dyn Rule, out: &mut Vec<Violation>) {
    for stmt in &block.stmts {
        if let Stmt::If {
            consequence,
            alternative,
            span,
            ..
        } = stmt
        {
            let next = depth + 1;
            if next > 2 {
                out.push(Violation::new(
                    rule,
                    *span,
                    format!(
                        "explicit `if` nesting depth is {next}; Rama dataflow should stay at depth 2 or less"
                    ),
                ));
            }
            check_if_depth(consequence, next, rule, out);
            if let Some(alt) = alternative {
                check_if_depth(alt, next, rule, out);
            }
        }
    }
}

fn path_ends_in_write(path: &[Expr]) -> bool {
    match path.last() {
        Some(Expr::Call(call)) => {
            matches!(call.callee.node.as_str(), "term" | "termval" | "multi-path")
        }
        Some(Expr::Ident(Spanned { node, .. })) => node == "NONE>",
        _ => false,
    }
}

fn navigator(expr: &Expr) -> Option<(&str, Span)> {
    let (name, span) = match expr {
        Expr::String(Spanned { node, span })
        | Expr::Ident(Spanned { node, span })
        | Expr::Keyword(Spanned { node, span }) => (node.as_str(), *span),
        _ => return None,
    };
    if matches!(
        name,
        "AFTER-ELEM" | "NONE-ELEM" | "NONE>" | "ALL" | "MAP-VALS" | "MAP-KEYS" | "all"
    ) {
        Some((name, span))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse;

    fn violations(src: &str) -> Vec<Violation> {
        let ast = parse(src).expect("parse");
        rama_engine().check(&Program::from_ast(&ast))
    }

    #[test]
    fn catches_dataflow_in_fn() {
        let found = violations(
            r#"
module M
pstate $$p: Map<String, String>
fn nope(id) { $$p --> keypath(id) > value return value }
"#,
        );
        assert!(found.iter().any(|v| v.rule_id == "rama/fn-no-dataflow"));
    }

    #[test]
    fn catches_navigator_inside_keypath() {
        let found = violations(
            r#"
module M
pstate $$p: Map<String, Object>
op nope(id) {
  $$p !<-- keypath(id, AFTER-ELEM), termval("x")
  return {"ok" true}
}
"#,
        );
        assert!(found
            .iter()
            .any(|v| v.rule_id == "rama/navigator-outside-keypath"));
    }

    #[test]
    fn match_fixture_passes_rama_rules() {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/fixtures/match_v2.rama"
        ))
        .unwrap();
        let ast = parse(&src).expect("parse");
        let found = rama_engine().check(&Program::from_ast(&ast));
        assert!(found.is_empty(), "unexpected violations: {found:#?}");
    }
}
