//! .rama AST → [`clj::Document`] → source text.
//!
//! All structural work happens on the Clojure IR; [`emit_clojure`] only renders.

use std::collections::HashMap;

use crate::ast::*;
use crate::clj::{self, Document, Form};
use crate::lower;

/// Public entry: compile to IR, then serialize.
pub fn emit_clojure(file: &SourceFile) -> String {
    compile(file).render()
}

/// Core compile step: surface AST → Clojure IR document.
pub fn compile(file: &SourceFile) -> Document {
    let structs: HashMap<&str, &StructDecl> = file
        .items
        .iter()
        .filter_map(|item| match item {
            Item::Struct(s) => Some((s.name.node.as_str(), s)),
            _ => None,
        })
        .collect();

    let module_name = file
        .items
        .iter()
        .find_map(|i| match i {
            Item::Module(m) => Some(m.name.node.as_str()),
            _ => None,
        })
        .unwrap_or("Generated");

    let mut doc = Document::new();
    doc.push(clj::comment("Generated from .rama v2 — edit the .rama source."));
    doc.push(clj::call(
        "ns",
        [
            clj::sym(module_name),
            clj::list([
                clj::kw("use"),
                clj::vector([clj::sym("com.rpl.rama"), clj::sym("com.rpl.rama.path")]),
            ]),
        ],
    ));

    for item in &file.items {
        match item {
            Item::Struct(s) => {
                let fields: Vec<String> = s
                    .fields
                    .iter()
                    .map(|f| {
                        format!(
                            ":{} {}",
                            f.name.node,
                            clj::render(&type_form(&f.ty.node, &structs))
                        )
                    })
                    .collect();
                doc.push(clj::comment(format!(
                    "struct {} {{{}}}",
                    s.name.node,
                    fields.join(" ")
                )));
            }
            Item::Fn(func) => {
                let mut params = Vec::new();
                params.extend(func.params.iter().map(|p| clj::sym(p.node.clone())));
                doc.push(clj::call(
                    "defn",
                    [
                        clj::sym(func.name.node.clone()),
                        clj::vector(params),
                        lower::lower_fn_body(&func.body),
                    ],
                ));
            }
            _ => {}
        }
    }

    for item in &file.items {
        if let Item::Op(op) = item {
            doc.push(ramaop_form(op));
        }
    }

    let depots: Vec<_> = file
        .items
        .iter()
        .filter_map(|i| match i {
            Item::Depot(d) => Some(d),
            _ => None,
        })
        .collect();
    let pstates: Vec<_> = file
        .items
        .iter()
        .filter_map(|i| match i {
            Item::PState(p) => Some(p),
            _ => None,
        })
        .collect();
    let ops: Vec<_> = file
        .items
        .iter()
        .filter_map(|i| match i {
            Item::Op(o) => Some(o),
            _ => None,
        })
        .collect();

    if !depots.is_empty() || !pstates.is_empty() {
        doc.push(defmodule_form(
            module_name,
            &depots,
            &pstates,
            &ops,
            &structs,
        ));
    }

    doc
}

fn ramaop_form(op: &OpDef) -> Form {
    let params: Vec<Form> = op
        .params
        .iter()
        .map(|p| clj::sym(format!("*{}", p.node)))
        .collect();
    let mut xs = vec![
        clj::sym(format!("{}>", op.name.node)),
        clj::vector(params),
    ];
    // Body fragments splice as sibling list elements (Rama dataflow body).
    xs.extend(op_stmts(&op.body.stmts, &mut 0));
    // Rebuild with head symbol deframaop
    let mut all = vec![clj::sym("deframaop")];
    all.extend(xs);
    Form::List(all)
}

fn module_type_name(module_name: &str) -> String {
    if module_name.ends_with("Module") {
        module_name.to_string()
    } else {
        format!("{module_name}Module")
    }
}

fn defmodule_form(
    module_name: &str,
    depots: &[&DepotDecl],
    pstates: &[&PStateDecl],
    ops: &[&OpDef],
    structs: &HashMap<&str, &StructDecl>,
) -> Form {
    let mut body: Vec<Form> = Vec::new();

    for d in depots {
        body.push(clj::call(
            "declare-depot",
            [
                clj::sym("setup"),
                clj::sym(format!("*{}", d.name.node)),
                clj::call(
                    "hash-by",
                    [clj::list([
                        clj::sym("fn"),
                        clj::vector([clj::sym("event")]),
                        clj::call(
                            "get",
                            [clj::sym("event"), clj::kw(d.keyed_by.node.clone())],
                        ),
                    ])],
                ),
            ],
        ));
    }

    let mut let_body: Vec<Form> = Vec::new();
    for p in pstates {
        let_body.push(clj::call(
            "declare-pstate",
            [
                clj::sym("s"),
                clj::sym(format!("$${}", p.name.node)),
                pstate_type_form(&p.ty.node, structs),
            ],
        ));
    }

    if let Some(d) = depots.first() {
        let mut sources: Vec<Form> = vec![
            clj::sym("<<sources"),
            clj::sym("s"),
            clj::call(
                "source>",
                [
                    clj::sym(format!("*{}", d.name.node)),
                    clj::sym(":>"),
                    clj::sym("*event"),
                ],
            ),
            clj::call(
                "get",
                [
                    clj::sym("*event"),
                    clj::kw("type"),
                    clj::sym(":>"),
                    clj::sym("*__type"),
                ],
            ),
        ];
        for op in ops {
            sources.push(clj::call(
                "<<if",
                [
                    clj::call(
                        "=",
                        [clj::sym("*__type"), clj::string(op.name.node.clone())],
                    ),
                    clj::call(format!("{}>", op.name.node), [clj::sym("*event")]),
                ],
            ));
        }
        let_body.push(Form::List(sources));
    }

    let mut let_elems = vec![
        clj::sym("let"),
        clj::vector([
            clj::sym("s"),
            clj::call(
                "stream-topology",
                [clj::sym("topologies"), clj::string("main")],
            ),
        ]),
    ];
    let_elems.extend(let_body);
    body.push(Form::List(let_elems));

    let mut mod_elems = vec![
        clj::sym("defmodule"),
        clj::sym(module_type_name(module_name)),
        clj::vector([clj::sym("setup"), clj::sym("topologies")]),
    ];
    mod_elems.extend(body);
    Form::List(mod_elems)
}

fn pstate_type_form(ty: &TypeExpr, structs: &HashMap<&str, &StructDecl>) -> Form {
    match ty {
        TypeExpr::Map {
            key,
            value,
            subindexed,
        } => match value.as_ref() {
            TypeExpr::Named(name) => clj::map([(
                type_form(key, structs),
                named_schema(name, structs),
            )]),
            TypeExpr::Map {
                key: k2,
                value: v2,
                subindexed: inner_sub,
            } => {
                let mut args = vec![type_form(k2, structs), type_form(v2, structs)];
                if *subindexed || *inner_sub {
                    args.push(clj::map([(clj::kw("subindex?"), clj::bool(true))]));
                }
                clj::map([(
                    type_form(key, structs),
                    clj::call("map-schema", args),
                )])
            }
            other => clj::map([(type_form(key, structs), type_form(other, structs))]),
        },
        other => type_form(other, structs),
    }
}

fn named_schema(name: &str, structs: &HashMap<&str, &StructDecl>) -> Form {
    if let Some(s) = structs.get(name) {
        let entries: Vec<(Form, Form)> = s
            .fields
            .iter()
            .map(|f| (clj::kw(f.name.node.clone()), type_form(&f.ty.node, structs)))
            .collect();
        clj::call("fixed-keys-schema", [clj::map(entries)])
    } else {
        clj::sym(name)
    }
}

fn type_form(ty: &TypeExpr, structs: &HashMap<&str, &StructDecl>) -> Form {
    match ty {
        TypeExpr::Named(n) => named_schema(n, structs),
        TypeExpr::Object => clj::sym("Object"),
        TypeExpr::Map {
            key,
            value,
            subindexed,
        } => {
            let mut args = vec![type_form(key, structs), type_form(value, structs)];
            if *subindexed {
                args.push(clj::map([(clj::kw("subindex?"), clj::bool(true))]));
            }
            clj::call("map-schema", args)
        }
    }
}

/// Op body → dataflow fragment forms. Consecutive `fail` → one cond + `<<if`.
fn op_stmts(stmts: &[Stmt], fail_gen: &mut usize) -> Vec<Form> {
    if stmts.is_empty() {
        return vec![clj::nil()];
    }

    let mut out = Vec::new();
    let mut i = 0;
    while i < stmts.len() {
        if matches!(&stmts[i], Stmt::Fail { .. }) {
            let start = i;
            while i < stmts.len() && matches!(&stmts[i], Stmt::Fail { .. }) {
                i += 1;
            }
            out.extend(fail_group(&stmts[start..i], &stmts[i..], fail_gen));
            break;
        }
        out.push(op_stmt(&stmts[i], fail_gen));
        i += 1;
    }
    out
}

fn fail_group(fails: &[Stmt], rest: &[Stmt], fail_gen: &mut usize) -> Vec<Form> {
    *fail_gen += 1;
    let err = format!("*__err{}", *fail_gen);

    let mut cond_args = Vec::new();
    for fail in fails {
        let Stmt::Fail {
            value, condition, ..
        } = fail
        else {
            unreachable!()
        };
        // Plain Clojure inside identity — `and`/`or`, not `and>`/`or>`.
        cond_args.push(expr(condition, ExprCtx::Clj));
        cond_args.push(expr(value, ExprCtx::Clj));
    }
    cond_args.push(clj::kw("else"));
    cond_args.push(clj::nil());

    let identity = clj::call(
        "identity",
        [
            clj::call("cond", cond_args),
            clj::sym(":>"),
            clj::sym(err.clone()),
        ],
    );

    let mut if_args = vec![
        clj::call("some?", [clj::sym(err.clone())]),
        clj::call(
            "ack-return>",
            [clj::map([
                (clj::string("ok"), clj::bool(false)),
                (clj::string("error"), clj::sym(err)),
            ])],
        ),
    ];
    if !rest.is_empty() {
        if_args.push(clj::sym("else>"));
        if_args.extend(op_stmts(rest, fail_gen));
    }

    let mut if_form = vec![clj::sym("<<if")];
    if_form.extend(if_args);

    vec![identity, Form::List(if_form)]
}

fn op_stmt(stmt: &Stmt, fail_gen: &mut usize) -> Form {
    match stmt {
        Stmt::Let { pattern, value, .. } => bind_form(value, &let_pattern(pattern)),
        Stmt::Select {
            pstate,
            path,
            target,
            ..
        } => {
            let mut args = vec![path_form(path), clj::sym(format!("$${}", pstate.node))];
            args.push(clj::sym(":>"));
            args.push(binding_target(target));
            clj::call("local-select>", args)
        }
        Stmt::Transform { pstate, path, .. } => clj::call(
            "local-transform>",
            [
                clj::vector(path.iter().map(|e| expr(e, ExprCtx::Dataflow))),
                clj::sym(format!("$${}", pstate.node)),
            ],
        ),
        Stmt::Fail { .. } => {
            let forms = fail_group(std::slice::from_ref(stmt), &[], fail_gen);
            // Single-stmt fallback: wrap in do if multiple (shouldn't happen).
            if forms.len() == 1 {
                forms.into_iter().next().unwrap()
            } else {
                Form::List(
                    std::iter::once(clj::sym("do"))
                        .chain(forms)
                        .collect(),
                )
            }
        }
        Stmt::Return { value, .. } => {
            clj::call("ack-return>", [expr(value, ExprCtx::Dataflow)])
        }
        Stmt::Hash { key, .. } => clj::call("|hash", [expr(key, ExprCtx::Dataflow)]),
        Stmt::Effect { value, .. } => expr(value, ExprCtx::Dataflow),
        Stmt::If {
            condition,
            consequence,
            alternative,
            ..
        } => {
            let mut args = vec![expr(condition, ExprCtx::Dataflow)];
            args.extend(op_stmts(&consequence.stmts, fail_gen));
            if let Some(alt) = alternative {
                args.push(clj::sym("else>"));
                args.extend(op_stmts(&alt.stmts, fail_gen));
            }
            let mut xs = vec![clj::sym("<<if")];
            xs.extend(args);
            Form::List(xs)
        }
    }
}

fn let_pattern(pattern: &LetPattern) -> Form {
    match pattern {
        LetPattern::Name(n) => clj::sym(format!("*{}", n.node)),
        LetPattern::Destructure(names) => clj::map(
            names
                .iter()
                .map(|n| (clj::sym(format!("*{}", n.node)), clj::kw(n.node.clone()))),
        ),
    }
}

fn binding_target(target: &BindingTarget) -> Form {
    match target {
        BindingTarget::Name(n) => clj::sym(format!("*{}", n.node)),
        BindingTarget::Destructure(names) => clj::map(
            names
                .iter()
                .map(|n| (clj::sym(format!("*{}", n.node)), clj::kw(n.node.clone()))),
        ),
    }
}

fn path_form(path: &[Expr]) -> Form {
    match path {
        [one] => expr(one, ExprCtx::Dataflow),
        _ => clj::vector(path.iter().map(|e| expr(e, ExprCtx::Dataflow))),
    }
}

fn bind_form(value: &Expr, target: &Form) -> Form {
    match value {
        Expr::Call(c) => {
            let mut args: Vec<Form> = c.args.iter().map(|a| expr(a, ExprCtx::Dataflow)).collect();
            args.push(clj::sym(":>"));
            args.push(target.clone());
            clj::call(c.callee.node.clone(), args)
        }
        Expr::Ident(i) if i.node == "event" || !i.node.starts_with('*') => clj::call(
            "identity",
            [
                clj::sym(format!("*{}", i.node)),
                clj::sym(":>"),
                target.clone(),
            ],
        ),
        _ => clj::call(
            "identity",
            [
                expr(value, ExprCtx::Dataflow),
                clj::sym(":>"),
                target.clone(),
            ],
        ),
    }
}

#[derive(Clone, Copy)]
enum ExprCtx {
    Dataflow,
    Clj,
}

fn expr(e: &Expr, ctx: ExprCtx) -> Form {
    match e {
        Expr::Call(c) => {
            let callee = match (ctx, c.callee.node.as_str()) {
                (ExprCtx::Dataflow, "and") => "and>",
                (ExprCtx::Dataflow, "or") => "or>",
                _ => c.callee.node.as_str(),
            };
            clj::call(callee, c.args.iter().map(|a| expr(a, ctx)))
        }
        Expr::List { elems, .. } => clj::vector(elems.iter().map(|a| expr(a, ctx))),
        Expr::Map { entries, .. } => clj::map(entries.iter().map(|ent| {
            let k = expr(&ent.key, ctx);
            let v = match &ent.value {
                Some(v) => expr(v, ctx),
                None => k.clone(),
            };
            (k, v)
        })),
        Expr::String(s) => clj::string(s.node.clone()),
        Expr::Keyword(k) => clj::kw(k.node.clone()),
        Expr::Ident(i) => clj::sym(ident_name(&i.node)),
        Expr::Int(n) => clj::int(n.node),
        Expr::Bool(b) => clj::bool(b.node),
        Expr::Binary {
            op, left, right, ..
        } => {
            let op = match op {
                BinaryOp::Eq => "=",
                BinaryOp::NotEq => "not=",
            };
            clj::call(op, [expr(left, ctx), expr(right, ctx)])
        }
        Expr::Ternary {
            cond,
            then_branch,
            else_branch,
            ..
        } => clj::call(
            "if",
            [
                expr(cond, ctx),
                expr(then_branch, ctx),
                expr(else_branch, ctx),
            ],
        ),
    }
}

fn ident_name(name: &str) -> String {
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
                | "some?"
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse;

    #[test]
    fn emits_fixed_keys_schema_from_struct() {
        let src = r#"
module M
struct Match { :status String :boGames Long }
pstate $$matches: Map<String, Match>
"#;
        let file = parse(src).expect("parse");
        let out = emit_clojure(&file);
        assert!(
            out.contains("fixed-keys-schema"),
            "got: {out}"
        );
        assert!(out.contains(":status"), "got: {out}");
        assert!(out.contains("String"), "got: {out}");
    }

    #[test]
    fn collapses_fail_chain_to_single_if() {
        let src = r#"
module M
op ban(event) {
  let { turn, arenaId } = event
  fail "no-ban-state" if turn == nil
  fail "bad" if arenaId == nil
  return {"ok" true}
}
"#;
        let file = parse(src).expect("parse");
        let doc = compile(&file);
        let out = doc.render();
        assert!(out.contains("identity"), "got: {out}");
        assert!(out.contains("cond"), "got: {out}");
        assert!(out.contains("some?"), "got: {out}");
        assert!(out.contains("*__err1"), "got: {out}");
        assert!(out.contains("else>"), "got: {out}");
        let if_count = out.matches("<<if").count();
        assert_eq!(if_count, 1, "expected one <<if, got {if_count}: {out}");
    }

    #[test]
    fn compile_yields_ir_not_just_string() {
        let src = "module M\nfn f(x) { return x }\n";
        let file = parse(src).expect("parse");
        let doc = compile(&file);
        assert!(
            doc.forms.iter().any(|f| matches!(f, Form::List(xs) if xs.first() == Some(&clj::sym("defn")))),
            "expected defn form in IR: {:?}",
            doc.forms
        );
    }
}
