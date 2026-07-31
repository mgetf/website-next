//! Emit Rama surface AST as post-reader EDN/list-layer data.

use crate::ast::*;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EdnForm {
    List(Vec<EdnForm>),
    Vector(Vec<EdnForm>),
    Map(Vec<(EdnForm, EdnForm)>),
    Symbol(String),
    Keyword(String),
    String(String),
    Int(i64),
    Bool(bool),
    Nil,
}

impl EdnForm {
    pub fn to_edn(&self) -> String {
        let mut out = String::new();
        self.write(&mut out);
        out
    }

    fn write(&self, out: &mut String) {
        match self {
            EdnForm::List(items) => write_delimited(out, "(", ")", items),
            EdnForm::Vector(items) => write_delimited(out, "[", "]", items),
            EdnForm::Map(entries) => {
                out.push('{');
                for (idx, (key, value)) in entries.iter().enumerate() {
                    if idx > 0 {
                        out.push(' ');
                    }
                    key.write(out);
                    out.push(' ');
                    value.write(out);
                }
                out.push('}');
            }
            EdnForm::Symbol(name) => out.push_str(name),
            EdnForm::Keyword(name) => {
                out.push(':');
                out.push_str(name);
            }
            EdnForm::String(value) => write_string(out, value),
            EdnForm::Int(value) => out.push_str(&value.to_string()),
            EdnForm::Bool(value) => out.push_str(if *value { "true" } else { "false" }),
            EdnForm::Nil => out.push_str("nil"),
        }
    }
}

pub fn emit_forms(file: &SourceFile) -> EdnForm {
    let mut forms = vec![symbol("do")];
    forms.extend(file.items.iter().map(item_to_form));
    EdnForm::List(forms)
}

pub fn emit_edn(file: &SourceFile) -> String {
    let mut edn = emit_forms(file).to_edn();
    edn.push('\n');
    edn
}

fn item_to_form(item: &Item) -> EdnForm {
    match item {
        Item::PState(decl) => list(vec![
            symbol("pstate-schema"),
            pstate_symbol(&decl.name.node),
            type_to_form(&decl.key.node),
            type_to_form(&decl.value.node),
        ]),
        Item::RamaOp(op) => {
            let mut items = vec![
                symbol("ramaop"),
                symbol(&op.name.node),
                EdnForm::Vector(op.params.iter().map(param_to_form).collect()),
            ];
            items.extend(op.body.stmts.iter().map(stmt_to_form));
            list(items)
        }
        Item::RamaFn(def) => ramafn_to_form(def),
    }
}

fn stmt_to_form(stmt: &Stmt) -> EdnForm {
    match stmt {
        Stmt::Anchor { anchor, .. } => list(vec![symbol("anchor>"), anchor_symbol(&anchor.node)]),
        Stmt::Effect { value, binding, .. } => effect_to_form(value, binding.as_ref()),
        Stmt::Transform { pstate, path, .. } => list(vec![
            symbol("local-transform>"),
            EdnForm::Vector(path.iter().map(expr_to_form).collect()),
            pstate_symbol(&pstate.node),
        ]),
        Stmt::Select {
            pstate,
            path,
            target,
            ..
        } => {
            let mut items = vec![
                symbol("local-select>"),
                path_to_select_form(path),
                pstate_symbol(&pstate.node),
            ];
            if let Some(target) = target {
                items.push(keyword(">"));
                items.push(binding_target_to_form(target));
            }
            list(items)
        }
        Stmt::HookNamed { name, arg, .. } => {
            let mut items = vec![symbol("hook>"), keyword(&name.node)];
            if let Some(arg) = arg {
                items.push(expr_to_form(arg));
            }
            list(items)
        }
        Stmt::HookAnchor { anchor, .. } => list(vec![symbol("hook>"), anchor_symbol(&anchor.node)]),
        Stmt::Unify { anchors, .. } => {
            let mut items = vec![symbol("unify>")];
            items.extend(anchors.iter().map(|anchor| anchor_symbol(&anchor.node)));
            list(items)
        }
        Stmt::If {
            condition,
            consequence,
            alternative,
            ..
        } => {
            let mut items = vec![symbol("<<if"), expr_to_form(condition)];
            items.extend(consequence.stmts.iter().map(stmt_to_form));
            if let Some(alternative) = alternative {
                items.push(list(vec![symbol("else>")]));
                items.extend(alternative.stmts.iter().map(stmt_to_form));
            }
            list(items)
        }
        Stmt::Atomic { body, .. } => {
            let mut items = vec![symbol("<<atomic")];
            items.extend(body.stmts.iter().map(stmt_to_form));
            list(items)
        }
        Stmt::Sink { target, .. } => list(vec![keyword(">"), binding_target_to_form(target)]),
        Stmt::RamaFn(def) => ramafn_to_form(def),
    }
}

fn effect_to_form(value: &Expr, binding: Option<&EffectBinding>) -> EdnForm {
    let Some(binding) = binding else {
        return expr_to_form(value);
    };
    let mut items = match value {
        Expr::Call(call) => call_to_items(call),
        _ => vec![symbol("bind>"), expr_to_form(value)],
    };
    items.push(keyword(">"));
    items.push(binding_target_to_form(&binding.target));
    if let Some(alias) = &binding.alias {
        items.push(keyword("as"));
        items.push(symbol(&alias.node));
    }
    list(items)
}

fn ramafn_to_form(def: &RamaFnDef) -> EdnForm {
    let mut items = vec![
        symbol("ramafn"),
        symbol(&def.name.node),
        EdnForm::Vector(def.params.iter().map(param_to_form).collect()),
    ];
    items.extend(def.body.iter().map(inline_binding_to_form));
    list(items)
}

fn inline_binding_to_form(binding: &InlineBinding) -> EdnForm {
    match (&binding.value, &binding.target) {
        (Some(value), InlineTarget::Binding(target)) => list(vec![
            symbol("bind>"),
            expr_to_form(value),
            keyword(">"),
            binding_target_to_form(target),
        ]),
        (None, InlineTarget::Binding(target)) => {
            list(vec![keyword(">"), binding_target_to_form(target)])
        }
        (Some(value), InlineTarget::Call(call)) => {
            let mut items = call_to_items(call);
            items.insert(1, expr_to_form(value));
            list(items)
        }
        (None, InlineTarget::Call(call)) => list(call_to_items(call)),
    }
}

fn expr_to_form(expr: &Expr) -> EdnForm {
    match expr {
        Expr::Call(call) => list(call_to_items(call)),
        Expr::List { elems, .. } => EdnForm::Vector(elems.iter().map(expr_to_form).collect()),
        Expr::Map { entries, .. } => entries_to_map(entries),
        Expr::String(value) => EdnForm::String(value.node.clone()),
        Expr::Anchor(anchor) => anchor_symbol(&anchor.node),
        Expr::Keyword(value) => keyword(&value.node),
        Expr::Binding(binding) => symbol(&binding.node),
        Expr::PState(pstate) => pstate_symbol(&pstate.node),
        Expr::Pipe(pipe) => symbol(&format!("|{}", pipe.node)),
        Expr::Ident(ident) => symbol(&ident.node),
        Expr::Int(value) => EdnForm::Int(value.node),
        Expr::Bool(value) => EdnForm::Bool(value.node),
    }
}

fn call_to_items(call: &CallExpr) -> Vec<EdnForm> {
    let mut items = vec![symbol(&call.callee.node)];
    items.extend(call.args.iter().map(expr_to_form));
    items
}
fn path_to_select_form(path: &[Expr]) -> EdnForm {
    match path {
        [single] => expr_to_form(single),
        _ => EdnForm::Vector(path.iter().map(expr_to_form).collect()),
    }
}
fn binding_target_to_form(target: &BindingTarget) -> EdnForm {
    match target {
        BindingTarget::Name(name) => symbol(&name.node),
        BindingTarget::Map(entries) => entries_to_map(entries),
        BindingTarget::List(elems) => EdnForm::Vector(elems.iter().map(expr_to_form).collect()),
    }
}
fn entries_to_map(entries: &[MapEntry]) -> EdnForm {
    EdnForm::Map(
        entries
            .iter()
            .map(|entry| {
                (
                    expr_to_form(&entry.key),
                    entry
                        .value
                        .as_ref()
                        .map(expr_to_form)
                        .unwrap_or(EdnForm::Nil),
                )
            })
            .collect(),
    )
}
fn param_to_form(param: &crate::span::Spanned<Param>) -> EdnForm {
    match &param.node {
        Param::Binding(name) | Param::Ident(name) => symbol(name),
    }
}
fn type_to_form(ty: &TypeExpr) -> EdnForm {
    match ty {
        TypeExpr::Named(name) => symbol(name),
        TypeExpr::Fixed { fields } => list(vec![
            symbol("fixed-keys-schema"),
            EdnForm::Map(
                fields
                    .iter()
                    .map(|(name, ty)| (EdnForm::String(name.clone()), type_to_form(ty)))
                    .collect(),
            ),
        ]),
        TypeExpr::Map { value } => list(vec![symbol("map-schema"), type_to_form(value)]),
        TypeExpr::Object => symbol("Object"),
    }
}
fn list(items: Vec<EdnForm>) -> EdnForm {
    EdnForm::List(items)
}
fn symbol(name: &str) -> EdnForm {
    EdnForm::Symbol(name.to_string())
}
fn keyword(name: &str) -> EdnForm {
    EdnForm::Keyword(name.trim_start_matches(':').to_string())
}
fn pstate_symbol(name: &str) -> EdnForm {
    symbol(&format!("$${name}"))
}
fn anchor_symbol(name: &str) -> EdnForm {
    symbol(&format!("<{name}>"))
}
fn write_delimited(out: &mut String, open: &str, close: &str, items: &[EdnForm]) {
    out.push_str(open);
    for (idx, item) in items.iter().enumerate() {
        if idx > 0 {
            out.push(' ');
        }
        item.write(out);
    }
    out.push_str(close);
}
fn write_string(out: &mut String, value: &str) {
    out.push('"');
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            other => out.push(other),
        }
    }
    out.push('"');
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse;

    #[test]
    fn emits_reader_forms_for_select_and_transform() {
        let src = r#"
            pstate $$matches { String -> fixed { "status": String } }
            ramaop update>(*id) {
              $$matches --> keypath(*id, "status") > *status;
              $$matches !<-- keypath(*id, "status"), termval("READY");
            }
        "#;
        let file = parse(src).expect("parse");
        let edn = emit_edn(&file);
        assert!(edn
            .contains("(pstate-schema $$matches String (fixed-keys-schema {\"status\" String}))"));
        assert!(edn.contains("(local-select> (keypath *id \"status\") $$matches :> *status)"));
        assert!(edn.contains(
            "(local-transform> [(keypath *id \"status\") (termval \"READY\")] $$matches)"
        ));
    }

    #[test]
    fn lowers_to_a_shape_before_serializing() {
        let src = r#"ramaop ack>(*id) { ack-return>({"ok" true, "matchId" *id}); }"#;
        let file = parse(src).expect("parse");
        let form = emit_forms(&file);
        let EdnForm::List(items) = &form else {
            panic!("source lowers to one list");
        };
        assert_eq!(items.first(), Some(&EdnForm::Symbol("do".to_string())));
        assert_eq!(
            form.to_edn(),
            "(do (ramaop ack> [*id] (ack-return> {\"ok\" true \"matchId\" *id})))"
        );
    }
}
