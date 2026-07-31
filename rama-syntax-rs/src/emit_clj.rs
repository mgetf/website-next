//! .rama AST → [`clj::Document`] → source text.
//!
//! All structural work happens on the Clojure IR; [`emit_clojure`] only renders.

use std::collections::{BTreeSet, HashMap};

use crate::ast::*;
use crate::clj::{self, Document, Form};
use crate::clj_verify;
use crate::lower;
use crate::rama_ir::Program;
use crate::types::{self, Type, TypeId, TypeTable, TypedExtern, Typing};

/// Public entry: compile to IR, then serialize.
pub fn emit_clojure(file: &SourceFile) -> String {
    let doc = compile(file);
    let issues = clj_verify::verify(&doc);
    assert!(
        issues.is_empty(),
        "compiler produced invalid Clojure IR: {issues:#?}"
    );
    doc.render()
}

/// Core compile step: surface AST → Clojure IR document.
pub fn compile(file: &SourceFile) -> Document {
    compile_program(&Program::from_ast(file))
}

pub fn compile_program(program: &Program<'_>) -> Document {
    let file = program.source;
    let structs = program.structs.clone();
    let module_name = program.module_name;
    let typing = types::analyze(program);

    let mut doc = Document::new();
    doc.push(clj::comment(
        "Generated from .rama v2 — edit the .rama source.",
    ));
    doc.push(clj::call(
        "ns",
        [
            clj::sym(program.namespace),
            clj::list([
                clj::kw("use"),
                clj::vector([clj::sym("com.rpl.rama")]),
                clj::vector([clj::sym("com.rpl.rama.path")]),
            ]),
        ],
    ));

    if has_runtime_contracts(&typing) {
        for form in contract_helper_form() {
            doc.push(form);
        }
    }
    let extern_wrappers: HashMap<String, String> = typing
        .externs
        .iter()
        .map(|(name, _)| {
            (
                name.clone(),
                format!("__rama_extern_{}", sanitize_symbol(name)),
            )
        })
        .collect();
    for (name, overloads) in &typing.externs {
        doc.push(extern_dispatcher_form(
            name,
            &extern_wrappers[name],
            overloads,
            &typing.table,
        ));
    }

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
                params.extend(func.params.iter().map(|p| clj::sym(p.name.node.clone())));
                let mut body = lower::lower_fn_body(&func.body);
                if let Some(function_type) = typing.functions.get(&func.name.node) {
                    body = rewrite_calls(body, &extern_wrappers);
                    body = contract_call(
                        function_type.return_type,
                        format!("{} return", func.name.node),
                        body,
                        &typing.table,
                    );
                    for (name, ty) in function_type.params.iter().rev() {
                        body = clj::call(
                            "let",
                            [
                                clj::vector([
                                    clj::sym(name),
                                    contract_call(
                                        *ty,
                                        format!("{} argument `{name}`", func.name.node),
                                        clj::sym(name),
                                        &typing.table,
                                    ),
                                ]),
                                body,
                            ],
                        );
                    }
                }
                doc.push(clj::call(
                    "defn",
                    [clj::sym(func.name.node.clone()), clj::vector(params), body],
                ));
            }
            _ => {}
        }
    }

    // Rama's hash-by requires a stable top-level function symbol.
    for depot in program.depots.values() {
        doc.push(clj::call(
            "defn",
            [
                clj::sym(partitioner_name(depot)),
                clj::vector([clj::sym("event")]),
                clj::call(
                    "get",
                    [clj::sym("event"), clj::string(depot.keyed_by.node.clone())],
                ),
            ],
        ));
    }

    let any_long_event_fields = file.items.iter().any(|item| {
        matches!(item, Item::Op(op) if event_spec(op, &structs)
            .is_some_and(|event| event
                .fields
                .iter()
                .any(|(_, check)| *check == FieldCheck::Long)))
    });
    if any_long_event_fields {
        doc.push(coerce_longs_helper_form());
    }

    // Two emit strategies, chosen per op by a probed Rama rule (RULES.md):
    // a PState passed as a deframaop parameter loses writes silently when
    // accessed after a partitioner hop. Hop-free ops therefore stay compact
    // deframaops (keeping <<sources small enough for Rama's compiler stack),
    // while ops containing |hash inline into the topology so their `$$`
    // references resolve in hop-aware topology scope.
    let mut op_bodies: HashMap<&str, Vec<Form>> = HashMap::new();
    for item in &file.items {
        if let Item::Op(op) = item {
            let (helpers, body) = compile_op_body(op, &structs);
            for helper in helpers {
                doc.push(helper);
            }
            if op_has_partitioner(&op.body) {
                op_bodies.insert(op.name.node.as_str(), body);
            } else {
                let mut params = vec![clj::sym("*event")];
                params.extend(
                    op_pstates(&op.body)
                        .into_iter()
                        .map(|name| clj::sym(format!("$${name}"))),
                );
                let mut form = vec![
                    clj::sym("deframaop"),
                    clj::sym(format!("{}>", op.name.node)),
                    clj::vector(params),
                ];
                form.extend(body);
                doc.push(Form::List(form));
            }
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
            program.topology,
            &depots,
            &pstates,
            &ops,
            &op_bodies,
            &structs,
        ));
    }

    doc
}

fn has_runtime_contracts(typing: &Typing) -> bool {
    !typing.functions.is_empty() || !typing.externs.is_empty()
}

fn contract_helper_form() -> Vec<Form> {
    // Violations are both thrown and appended to a tab-separated tape so
    // `rama-check learn` can turn runtime evidence into source edits.
    let tape_atom = clj::call(
        "def",
        [
            clj::sym("__rama_tape"),
            clj::call(
                "atom",
                [clj::call(
                    "System/getenv",
                    [clj::string("RAMA_CONTRACT_TAPE")],
                )],
            ),
        ],
    );
    let record = clj::call(
        "defn",
        [
            clj::sym("__rama_record!"),
            clj::vector([clj::sym("path"), clj::sym("expected"), clj::sym("actual")]),
            clj::call(
                "when-let",
                [
                    clj::vector([
                        clj::sym("tape"),
                        clj::call("deref", [clj::sym("__rama_tape")]),
                    ]),
                    clj::call(
                        "locking",
                        [
                            clj::sym("__rama_tape"),
                            clj::call(
                                "spit",
                                [
                                    clj::sym("tape"),
                                    clj::call(
                                        "str",
                                        [
                                            clj::sym("path"),
                                            clj::string("\t"),
                                            clj::sym("expected"),
                                            clj::string("\t"),
                                            clj::sym("actual"),
                                            clj::string("\n"),
                                        ],
                                    ),
                                    clj::kw("append"),
                                    clj::bool(true),
                                ],
                            ),
                        ],
                    ),
                ],
            ),
        ],
    );
    let contract = clj::call(
        "defn",
        [
            clj::sym("__rama_contract!"),
            clj::vector([
                clj::sym("predicate"),
                clj::sym("expected"),
                clj::sym("path"),
                clj::sym("value"),
            ]),
            clj::call(
                "if",
                [
                    clj::call("predicate", [clj::sym("value")]),
                    clj::sym("value"),
                    clj::call(
                        "do",
                        [
                            clj::call(
                                "__rama_record!",
                                [
                                    clj::sym("path"),
                                    clj::sym("expected"),
                                    actual_class_form(clj::sym("value")),
                                ],
                            ),
                            clj::call(
                                "throw",
                                [clj::call(
                                    "ex-info",
                                    [
                                        clj::call(
                                            "str",
                                            [
                                                clj::string("Contract violation at "),
                                                clj::sym("path"),
                                                clj::string(": expected "),
                                                clj::sym("expected"),
                                                clj::string(", got "),
                                                actual_class_form(clj::sym("value")),
                                            ],
                                        ),
                                        clj::map([
                                            (clj::kw("kind"), clj::kw("contract-violation")),
                                            (clj::kw("path"), clj::sym("path")),
                                            (clj::kw("expected"), clj::sym("expected")),
                                            (
                                                clj::kw("actual"),
                                                actual_class_form(clj::sym("value")),
                                            ),
                                        ]),
                                    ],
                                )],
                            ),
                        ],
                    ),
                ],
            ),
        ],
    );
    vec![tape_atom, record, contract]
}

fn actual_class_form(value: Form) -> Form {
    clj::call(
        "if",
        [
            clj::call("nil?", [value.clone()]),
            clj::string("nil"),
            clj::call(".getName", [clj::call("class", [value])]),
        ],
    )
}

fn contract_call(ty: TypeId, path: impl Into<String>, value: Form, table: &TypeTable) -> Form {
    let path = path.into();
    if let Type::Function { params, ret } = table.get(ty) {
        return function_contract(ty, params, *ret, path, value, table);
    }
    let variable = "__rama_value";
    clj::call(
        "__rama_contract!",
        [
            clj::list([
                clj::sym("fn"),
                clj::vector([clj::sym(variable)]),
                predicate_form(ty, clj::sym(variable), table),
            ]),
            clj::string(table.display(ty)),
            clj::string(path),
            value,
        ],
    )
}

fn function_contract(
    function_type: TypeId,
    params: &[TypeId],
    ret: TypeId,
    path: String,
    value: Form,
    table: &TypeTable,
) -> Form {
    let function_name = "__rama_function";
    let parameter_names = (0..params.len())
        .map(|index| format!("__rama_fn_arg{index}"))
        .collect::<Vec<_>>();
    let checked_function = clj::call(
        "__rama_contract!",
        [
            clj::list([
                clj::sym("fn"),
                clj::vector([clj::sym("__rama_candidate")]),
                clj::call("ifn?", [clj::sym("__rama_candidate")]),
            ]),
            clj::string(table.display(function_type)),
            clj::string(path.clone()),
            value,
        ],
    );
    let mut invocation = vec![clj::sym(function_name)];
    invocation.extend(params.iter().zip(&parameter_names).enumerate().map(
        |(index, (ty, name))| {
            contract_call(
                *ty,
                format!("{path} argument {index}"),
                clj::sym(name),
                table,
            )
        },
    ));
    let checked_return =
        contract_call(ret, format!("{path} return"), Form::List(invocation), table);
    clj::call(
        "let",
        [
            clj::vector([clj::sym(function_name), checked_function]),
            clj::list([
                clj::sym("fn"),
                clj::vector(parameter_names.iter().map(clj::sym)),
                checked_return,
            ]),
        ],
    )
}

fn predicate_form(ty: TypeId, value: Form, table: &TypeTable) -> Form {
    match table.get(ty) {
        Type::Nil => clj::call("nil?", [value]),
        Type::Never => clj::bool(false),
        Type::Any | Type::Unknown | Type::Dynamic | Type::Var(_) => clj::bool(true),
        Type::Union(members) => {
            let mut forms = vec![clj::sym("or")];
            forms.extend(
                members
                    .iter()
                    .map(|member| predicate_form(*member, value.clone(), table)),
            );
            Form::List(forms)
        }
        Type::Function { .. } => clj::call("ifn?", [value]),
        Type::Capability { name, args } => match (name.as_str(), args.as_slice()) {
            ("Seqable", [_]) => clj::call("seqable?", [value]),
            ("Reducible", [_]) => clj::call(
                "or",
                [
                    clj::call("seqable?", [value.clone()]),
                    clj::call("instance?", [clj::sym("clojure.lang.IReduceInit"), value]),
                ],
            ),
            ("Countable", []) => clj::call(
                "or",
                [
                    clj::call("nil?", [value.clone()]),
                    clj::call("string?", [value.clone()]),
                    clj::call("counted?", [value]),
                ],
            ),
            ("Transducer", [_, _]) => clj::call("ifn?", [value]),
            _ => clj::bool(false),
        },
        Type::Jvm { class, args } => {
            let base = clj::call("instance?", [clj::sym(class), value.clone()]);
            match (class.as_str(), args.as_slice()) {
                (
                    "java.util.List"
                    | "java.util.Set"
                    | "java.util.Collection"
                    | "java.lang.Iterable",
                    [element],
                ) => {
                    let element_name = "__rama_element";
                    clj::call(
                        "and",
                        [
                            base,
                            clj::call(
                                "every?",
                                [
                                    clj::list([
                                        clj::sym("fn"),
                                        clj::vector([clj::sym(element_name)]),
                                        predicate_form(*element, clj::sym(element_name), table),
                                    ]),
                                    value,
                                ],
                            ),
                        ],
                    )
                }
                ("java.util.Map", [key_type, value_type]) => {
                    let entry = "__rama_entry";
                    clj::call(
                        "and",
                        [
                            base,
                            clj::call(
                                "every?",
                                [
                                    clj::list([
                                        clj::sym("fn"),
                                        clj::vector([clj::sym(entry)]),
                                        clj::call(
                                            "and",
                                            [
                                                predicate_form(
                                                    *key_type,
                                                    clj::call("key", [clj::sym(entry)]),
                                                    table,
                                                ),
                                                predicate_form(
                                                    *value_type,
                                                    clj::call("val", [clj::sym(entry)]),
                                                    table,
                                                ),
                                            ],
                                        ),
                                    ]),
                                    value,
                                ],
                            ),
                        ],
                    )
                }
                _ => base,
            }
        }
    }
}

fn extern_dispatcher_form(
    name: &str,
    wrapper_name: &str,
    overloads: &[TypedExtern],
    table: &TypeTable,
) -> Form {
    let args_name = "__rama_args";
    let mut ordered = overloads.iter().collect::<Vec<_>>();
    ordered.sort_by_key(|overload| {
        std::cmp::Reverse(
            overload
                .signature
                .params
                .iter()
                .map(|ty| runtime_specificity(*ty, table))
                .sum::<usize>(),
        )
    });

    let mut clauses = Vec::new();
    for overload in ordered {
        let mut checks = vec![clj::call(
            "=",
            [
                clj::call("count", [clj::sym(args_name)]),
                clj::int(overload.signature.params.len() as i64),
            ],
        )];
        for (index, ty) in overload.signature.params.iter().enumerate() {
            checks.push(predicate_form(
                *ty,
                clj::call("nth", [clj::sym(args_name), clj::int(index as i64)]),
                table,
            ));
        }
        let condition = if checks.len() == 1 {
            checks.remove(0)
        } else {
            clj::call("and", checks)
        };
        clauses.push(condition);
        let checked_arguments = clj::vector(overload.signature.params.iter().enumerate().map(
            |(index, ty)| {
                contract_call(
                    *ty,
                    format!("extern `{name}` argument {index}"),
                    clj::call("nth", [clj::sym(args_name), clj::int(index as i64)]),
                    table,
                )
            },
        ));
        clauses.push(contract_call(
            overload.signature.ret,
            format!("extern `{name}` return"),
            clj::call("apply", [clj::sym(&overload.target), checked_arguments]),
            table,
        ));
    }
    clauses.push(clj::kw("else"));
    clauses.push(clj::call(
        "throw",
        [clj::call(
            "ex-info",
            [
                clj::string(format!(
                    "No runtime contract for extern `{name}` accepted the arguments"
                )),
                clj::map([
                    (clj::kw("kind"), clj::kw("contract-violation")),
                    (
                        clj::kw("path"),
                        clj::string(format!("extern `{name}` arguments")),
                    ),
                ]),
            ],
        )],
    ));

    clj::call(
        "defn",
        [
            clj::sym(wrapper_name),
            clj::vector([clj::sym("&"), clj::sym(args_name)]),
            clj::call("cond", clauses),
        ],
    )
}

fn runtime_specificity(ty: TypeId, table: &TypeTable) -> usize {
    match table.get(ty) {
        Type::Jvm { args, .. } => {
            2 + args
                .iter()
                .map(|arg| runtime_specificity(*arg, table))
                .sum::<usize>()
        }
        Type::Union(members) => members
            .iter()
            .map(|member| runtime_specificity(*member, table))
            .min()
            .unwrap_or(0),
        Type::Nil => 2,
        Type::Never => 3,
        Type::Function { .. } => 2,
        Type::Capability { .. } => 1,
        Type::Any | Type::Unknown | Type::Dynamic | Type::Var(_) => 0,
    }
}

fn rewrite_calls(form: Form, extern_wrappers: &HashMap<String, String>) -> Form {
    match form {
        Form::List(mut forms) => {
            if let Some(Form::Symbol(head)) = forms.first_mut() {
                if let Some(wrapper) = extern_wrappers.get(head) {
                    *head = wrapper.clone();
                }
            }
            Form::List(
                forms
                    .into_iter()
                    .map(|form| rewrite_calls(form, extern_wrappers))
                    .collect(),
            )
        }
        Form::Vector(forms) => Form::Vector(
            forms
                .into_iter()
                .map(|form| rewrite_calls(form, extern_wrappers))
                .collect(),
        ),
        Form::Map(entries) => Form::Map(
            entries
                .into_iter()
                .map(|(key, value)| {
                    (
                        rewrite_calls(key, extern_wrappers),
                        rewrite_calls(value, extern_wrappers),
                    )
                })
                .collect(),
        ),
        other => other,
    }
}

fn sanitize_symbol(name: &str) -> String {
    name.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect()
}

fn partitioner_name(depot: &DepotDecl) -> String {
    format!("{}-partition-key", depot.name.node)
}

struct OpCompiler<'a> {
    op_name: &'a str,
    helpers: Vec<Form>,
    fail_gen: usize,
    expr_gen: usize,
}

/// Typed depot event: which param carries it and what field checks apply.
struct EventSpec {
    param: String,
    /// `(field name, check)` in declaration order.
    fields: Vec<(String, FieldCheck)>,
}

#[derive(Clone, Copy, PartialEq)]
enum FieldCheck {
    String,
    Long,
    Boolean,
    Map,
    Any,
}

fn event_spec(op: &OpDef, structs: &HashMap<&str, &StructDecl>) -> Option<EventSpec> {
    op.params.iter().find_map(|param| {
        let ty = param.ty.as_ref()?;
        let crate::ast::ValueTypeExpr::Named { path, args } = &ty.node else {
            return None;
        };
        if !args.is_empty() {
            return None;
        }
        let declaration = structs.get(path.as_str())?;
        Some(EventSpec {
            param: param.name.node.clone(),
            fields: declaration
                .fields
                .iter()
                .map(|field| {
                    let check = match &field.ty.node {
                        TypeExpr::Named(name) => match name.as_str() {
                            "String" => FieldCheck::String,
                            "Long" | "Int" | "Integer" => FieldCheck::Long,
                            "Boolean" => FieldCheck::Boolean,
                            _ => FieldCheck::Any,
                        },
                        TypeExpr::Map { .. } => FieldCheck::Map,
                        TypeExpr::Object => FieldCheck::Any,
                    };
                    (field.name.node.clone(), check)
                })
                .collect(),
        })
    })
}

/// Compile an op to (top-level helper defns, dataflow body forms).
///
/// The body references the depot event as `*event` regardless of the surface
/// parameter name, ready to splice into a `<<sources` dispatch branch.
fn compile_op_body(op: &OpDef, structs: &HashMap<&str, &StructDecl>) -> (Vec<Form>, Vec<Form>) {
    let mut compiler = OpCompiler {
        op_name: &op.name.node,
        helpers: Vec::new(),
        fail_gen: 0,
        expr_gen: 0,
    };
    let mut body = compiler.stmts(&op.body.stmts);

    if let Some(event) = event_spec(op, structs) {
        let validator_name = format!("__{}-event-error", op.name.node);
        compiler
            .helpers
            .push(event_validator_form(&validator_name, &event));

        let long_fields: Vec<&str> = event
            .fields
            .iter()
            .filter(|(_, check)| *check == FieldCheck::Long)
            .map(|(name, _)| name.as_str())
            .collect();
        let raw_event = format!("*{}", event.param);
        let mut guarded = Vec::new();
        if long_fields.is_empty() {
            guarded.extend(body);
        } else {
            // JSON numbers arrive as Integers; normalize Long fields once,
            // then run the body against the coerced event.
            let coerced = "*__event";
            body = body
                .into_iter()
                .map(|form| rename_symbol(form, &raw_event, coerced))
                .collect();
            guarded.push(clj::call(
                "__rama_coerce_longs",
                [
                    clj::sym(&raw_event),
                    clj::vector(long_fields.iter().map(|name| clj::string(*name))),
                    clj::sym(":>"),
                    clj::sym(coerced),
                ],
            ));
            guarded.extend(body);
        }

        let mut if_form = vec![
            clj::sym("<<if"),
            clj::call("some?", [clj::sym("*__event-error")]),
            clj::call(
                "ack-return>",
                [clj::map([
                    (clj::string("ok"), clj::bool(false)),
                    (clj::string("error"), clj::string("invalid-event")),
                    (clj::string("detail"), clj::sym("*__event-error")),
                ])],
            ),
            clj::call("else>", []),
        ];
        if_form.extend(guarded);

        body = vec![
            clj::call(
                &validator_name,
                [
                    clj::sym(&raw_event),
                    clj::sym(":>"),
                    clj::sym("*__event-error"),
                ],
            ),
            Form::List(if_form),
        ];
    }

    // The <<sources dispatch binds the depot payload as *event.
    if let Some(param) = op.params.first() {
        if param.name.node != "event" {
            let surface = format!("*{}", param.name.node);
            body = body
                .into_iter()
                .map(|form| rename_symbol(form, &surface, "*event"))
                .collect();
        }
    }
    (compiler.helpers, body)
}

/// Plain-Clojure validator: nil for a well-formed event, else an error string.
fn event_validator_form(name: &str, event: &EventSpec) -> Form {
    let value = |field: &str| clj::call("get", [clj::sym("event"), clj::string(field)]);
    let mut arms = vec![
        clj::call("not", [clj::call("map?", [clj::sym("event")])]),
        clj::string("event must be a map"),
    ];
    for (field, check) in &event.fields {
        arms.push(clj::call("nil?", [value(field)]));
        arms.push(clj::string(format!("missing field `{field}`")));
        let (predicate, description): (Option<Form>, &str) = match check {
            FieldCheck::String => (Some(clj::call("string?", [value(field)])), "a String"),
            FieldCheck::Long => (
                Some(clj::call(
                    "or",
                    [
                        clj::call("instance?", [clj::sym("java.lang.Long"), value(field)]),
                        clj::call("instance?", [clj::sym("java.lang.Integer"), value(field)]),
                    ],
                )),
                "a Long",
            ),
            FieldCheck::Boolean => (Some(clj::call("boolean?", [value(field)])), "a Boolean"),
            FieldCheck::Map => (Some(clj::call("map?", [value(field)])), "a map"),
            FieldCheck::Any => (None, ""),
        };
        if let Some(predicate) = predicate {
            arms.push(clj::call("not", [predicate]));
            arms.push(clj::string(format!(
                "field `{field}` must be {description}"
            )));
        }
    }
    arms.push(clj::kw("else"));
    arms.push(clj::nil());
    clj::call(
        "defn",
        [
            clj::sym(name),
            clj::vector([clj::sym("event")]),
            clj::call("cond", arms),
        ],
    )
}

fn coerce_longs_helper_form() -> Form {
    clj::call(
        "defn",
        [
            clj::sym("__rama_coerce_longs"),
            clj::vector([clj::sym("event"), clj::sym("fields")]),
            clj::call(
                "reduce",
                [
                    clj::list([
                        clj::sym("fn"),
                        clj::vector([clj::sym("m"), clj::sym("field")]),
                        clj::call(
                            "if",
                            [
                                clj::call(
                                    "some?",
                                    [clj::call("get", [clj::sym("m"), clj::sym("field")])],
                                ),
                                clj::call(
                                    "assoc",
                                    [
                                        clj::sym("m"),
                                        clj::sym("field"),
                                        clj::call(
                                            "long",
                                            [clj::call("get", [clj::sym("m"), clj::sym("field")])],
                                        ),
                                    ],
                                ),
                                clj::sym("m"),
                            ],
                        ),
                    ]),
                    clj::sym("event"),
                    clj::sym("fields"),
                ],
            ),
        ],
    )
}

fn op_has_partitioner(block: &Block) -> bool {
    block.stmts.iter().any(|stmt| match stmt {
        Stmt::Hash { .. } => true,
        Stmt::If {
            consequence,
            alternative,
            ..
        } => {
            op_has_partitioner(consequence) || alternative.as_ref().is_some_and(op_has_partitioner)
        }
        _ => false,
    })
}

fn op_pstates(block: &Block) -> BTreeSet<String> {
    fn visit(block: &Block, out: &mut BTreeSet<String>) {
        for stmt in &block.stmts {
            match stmt {
                Stmt::Select { pstate, .. } | Stmt::Transform { pstate, .. } => {
                    out.insert(pstate.node.clone());
                }
                Stmt::If {
                    consequence,
                    alternative,
                    ..
                } => {
                    visit(consequence, out);
                    if let Some(alt) = alternative {
                        visit(alt, out);
                    }
                }
                _ => {}
            }
        }
    }

    let mut out = BTreeSet::new();
    visit(block, &mut out);
    out
}

fn rename_symbol(form: Form, from: &str, to: &str) -> Form {
    match form {
        Form::Symbol(symbol) if symbol == from => clj::sym(to),
        Form::List(forms) => Form::List(
            forms
                .into_iter()
                .map(|form| rename_symbol(form, from, to))
                .collect(),
        ),
        Form::Vector(forms) => Form::Vector(
            forms
                .into_iter()
                .map(|form| rename_symbol(form, from, to))
                .collect(),
        ),
        Form::Map(entries) => Form::Map(
            entries
                .into_iter()
                .map(|(key, value)| (rename_symbol(key, from, to), rename_symbol(value, from, to)))
                .collect(),
        ),
        other => other,
    }
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
    topology: &str,
    depots: &[&DepotDecl],
    pstates: &[&PStateDecl],
    ops: &[&OpDef],
    op_bodies: &HashMap<&str, Vec<Form>>,
    structs: &HashMap<&str, &StructDecl>,
) -> Form {
    let mut body: Vec<Form> = Vec::new();

    for d in depots {
        body.push(clj::call(
            "declare-depot",
            [
                clj::sym("setup"),
                clj::sym(format!("*{}", d.name.node)),
                clj::call("hash-by", [clj::sym(partitioner_name(d))]),
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
                    clj::string("type"),
                    clj::sym(":>"),
                    clj::sym("*__type"),
                ],
            ),
        ];
        // One flat <<switch instead of sequential <<ifs: sequential branches
        // compile as nested continuations and overflow Rama's compiler stack
        // once several guarded op bodies inline (see RULES.md).
        //
        // Op bodies inline here so `$$` references resolve in topology scope.
        // Parameter-passed PStates accessed after a partitioner hop lose
        // writes silently (see RULES.md).
        let mut switch = vec![clj::sym("<<switch"), clj::sym("*__type")];
        for op in ops {
            switch.push(clj::call("case>", [clj::string(op.name.node.clone())]));
            match op_bodies.get(op.name.node.as_str()) {
                Some(body) => switch.extend(body.clone()),
                None => {
                    let mut call = vec![clj::sym(format!("{}>", op.name.node)), clj::sym("*event")];
                    call.extend(
                        op_pstates(&op.body)
                            .into_iter()
                            .map(|name| clj::sym(format!("$${name}"))),
                    );
                    switch.push(Form::List(call));
                }
            }
        }
        switch.push(clj::call("default>", []));
        switch.push(clj::call(
            "ack-return>",
            [clj::map([
                (clj::string("ok"), clj::bool(false)),
                (clj::string("error"), clj::string("unknown-type")),
                (clj::string("type"), clj::sym("*__type")),
            ])],
        ));
        sources.push(Form::List(switch));
        let_body.push(Form::List(sources));
    }

    let mut let_elems = vec![
        clj::sym("let"),
        clj::vector([
            clj::sym("s"),
            clj::call(
                "stream-topology",
                [clj::sym("topologies"), clj::string(topology)],
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
            TypeExpr::Named(name) => {
                clj::map([(type_form(key, structs), named_schema(name, structs))])
            }
            TypeExpr::Map {
                key: k2,
                value: v2,
                subindexed: inner_sub,
            } => {
                let mut args = vec![type_form(k2, structs), type_form(v2, structs)];
                if *subindexed || *inner_sub {
                    args.push(clj::map([(clj::kw("subindex?"), clj::bool(true))]));
                }
                clj::map([(type_form(key, structs), clj::call("map-schema", args))])
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
            .map(|f| {
                (
                    clj::string(f.name.node.clone()),
                    type_form(&f.ty.node, structs),
                )
            })
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

impl OpCompiler<'_> {
    /// Op body → dataflow fragment forms. Consecutive `fail` forms share one
    /// generated ordinary-Clojure predicate helper and one shallow `<<if`.
    fn stmts(&mut self, stmts: &[Stmt]) -> Vec<Form> {
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
                out.extend(self.fail_group(&stmts[start..i], &stmts[i..]));
                break;
            }
            out.push(self.stmt(&stmts[i]));
            i += 1;
        }
        out
    }

    fn fail_group(&mut self, fails: &[Stmt], rest: &[Stmt]) -> Vec<Form> {
        self.fail_gen += 1;
        let err = format!("*__err{}", self.fail_gen);
        let helper_name = format!("__{}-fail-{}", self.op_name, self.fail_gen);

        let mut variables = BTreeSet::new();
        let mut cond_args = Vec::new();
        for fail in fails {
            let Stmt::Fail {
                value, condition, ..
            } = fail
            else {
                unreachable!()
            };
            collect_locals(condition, &mut variables);
            collect_locals(value, &mut variables);
            cond_args.push(lower::lower_fn_expr(condition));
            cond_args.push(lower::lower_fn_expr(value));
        }
        cond_args.push(clj::kw("else"));
        cond_args.push(clj::nil());

        self.helpers.push(clj::call(
            "defn",
            [
                clj::sym(helper_name.clone()),
                clj::vector(variables.iter().map(clj::sym)),
                clj::call("cond", cond_args),
            ],
        ));

        let mut helper_args: Vec<Form> = variables
            .iter()
            .map(|name| clj::sym(format!("*{name}")))
            .collect();
        helper_args.push(clj::sym(":>"));
        helper_args.push(clj::sym(err.clone()));
        let bind_error = clj::call(helper_name, helper_args);

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
            if_args.push(clj::call("else>", []));
            if_args.extend(self.stmts(rest));
        }

        let mut if_form = vec![clj::sym("<<if")];
        if_form.extend(if_args);
        vec![bind_error, Form::List(if_form)]
    }

    fn stmt(&mut self, stmt: &Stmt) -> Form {
        match stmt {
            Stmt::Let { pattern, value, .. } => self.bind(value, &let_pattern(pattern)),
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
                let forms = self.fail_group(std::slice::from_ref(stmt), &[]);
                Form::List(std::iter::once(clj::sym("do")).chain(forms).collect())
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
                args.extend(self.stmts(&consequence.stmts));
                if let Some(alt) = alternative {
                    args.push(clj::call("else>", []));
                    args.extend(self.stmts(&alt.stmts));
                }
                let mut xs = vec![clj::sym("<<if")];
                xs.extend(args);
                Form::List(xs)
            }
        }
    }

    fn bind(&mut self, value: &Expr, target: &Form) -> Form {
        if contains_clojure_control(value) {
            return self.lift_expr(value, target);
        }
        match value {
            Expr::Call(_) => {
                let Form::List(mut call) = expr(value, ExprCtx::Dataflow) else {
                    unreachable!()
                };
                call.push(clj::sym(":>"));
                call.push(target.clone());
                Form::List(call)
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

    fn lift_expr(&mut self, value: &Expr, target: &Form) -> Form {
        self.expr_gen += 1;
        let helper_name = format!("__{}-expr-{}", self.op_name, self.expr_gen);
        let mut variables = BTreeSet::new();
        collect_locals(value, &mut variables);
        self.helpers.push(clj::call(
            "defn",
            [
                clj::sym(helper_name.clone()),
                clj::vector(variables.iter().map(clj::sym)),
                lower::lower_fn_expr(value),
            ],
        ));
        let mut args: Vec<Form> = variables
            .iter()
            .map(|name| clj::sym(format!("*{name}")))
            .collect();
        args.push(clj::sym(":>"));
        args.push(target.clone());
        clj::call(helper_name, args)
    }
}

fn let_pattern(pattern: &LetPattern) -> Form {
    match pattern {
        LetPattern::Name(n) => clj::sym(format!("*{}", n.node)),
        LetPattern::Destructure(names) => clj::map(names.iter().map(|n| {
            (
                clj::sym(format!("*{}", n.node)),
                clj::string(n.node.clone()),
            )
        })),
    }
}

fn binding_target(target: &BindingTarget) -> Form {
    match target {
        BindingTarget::Name(n) => clj::sym(format!("*{}", n.node)),
        BindingTarget::Destructure(names) => clj::map(names.iter().map(|n| {
            (
                clj::sym(format!("*{}", n.node)),
                clj::string(n.node.clone()),
            )
        })),
    }
}

fn path_form(path: &[Expr]) -> Form {
    match path {
        [one] => expr(one, ExprCtx::Dataflow),
        _ => clj::vector(path.iter().map(|e| expr(e, ExprCtx::Dataflow))),
    }
}

#[derive(Clone, Copy)]
enum ExprCtx {
    Dataflow,
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
        // Surface keyword fields are ergonomic; mge.tf's Rama boundary is
        // REST-first, so target state/event keys are strings end-to-end.
        Expr::Keyword(k) => clj::string(k.node.clone()),
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
        Expr::As { value, ty, .. } => crate::contracts::checked_as(expr(value, ctx), &ty.node),
    }
}

fn ident_name(name: &str) -> String {
    if name
        .chars()
        .next()
        .is_some_and(|c| c.is_lowercase() || c == '_')
        && !matches!(
            name,
            "nil"
                | "true"
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

fn contains_clojure_control(expr: &Expr) -> bool {
    match expr {
        Expr::Ternary { .. } => true,
        Expr::As { value, .. } => contains_clojure_control(value),
        Expr::Call(call) => {
            matches!(call.callee.node.as_str(), "if" | "cond" | "let")
                || call.args.iter().any(contains_clojure_control)
        }
        Expr::List { elems, .. } => elems.iter().any(contains_clojure_control),
        Expr::Map { entries, .. } => entries.iter().any(|entry| {
            contains_clojure_control(&entry.key)
                || entry.value.as_ref().is_some_and(contains_clojure_control)
        }),
        Expr::Binary { left, right, .. } => {
            contains_clojure_control(left) || contains_clojure_control(right)
        }
        _ => false,
    }
}

fn collect_locals(expr: &Expr, out: &mut BTreeSet<String>) {
    match expr {
        Expr::Ident(ident) => {
            if ident_name(&ident.node).starts_with('*') {
                out.insert(ident.node.clone());
            }
        }
        Expr::Call(call) => {
            for arg in &call.args {
                collect_locals(arg, out);
            }
        }
        Expr::List { elems, .. } => {
            for elem in elems {
                collect_locals(elem, out);
            }
        }
        Expr::Map { entries, .. } => {
            for entry in entries {
                collect_locals(&entry.key, out);
                if let Some(value) = &entry.value {
                    collect_locals(value, out);
                }
            }
        }
        Expr::Binary { left, right, .. } => {
            collect_locals(left, out);
            collect_locals(right, out);
        }
        Expr::Ternary {
            cond,
            then_branch,
            else_branch,
            ..
        } => {
            collect_locals(cond, out);
            collect_locals(then_branch, out);
            collect_locals(else_branch, out);
        }
        Expr::As { value, .. } => collect_locals(value, out),
        Expr::String(_) | Expr::Keyword(_) | Expr::Int(_) | Expr::Bool(_) => {}
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
        assert!(out.contains("fixed-keys-schema"), "got: {out}");
        assert!(out.contains("\"status\" String"), "got: {out}");
        assert!(out.contains("String"), "got: {out}");
    }

    #[test]
    fn collapses_fail_chain_to_single_if() {
        let src = r#"
module M
depot events keyed-by id
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
        assert!(out.contains("(defn __ban-fail-1"), "got: {out}");
        assert!(out.contains("cond"), "got: {out}");
        assert!(out.contains("some?"), "got: {out}");
        assert!(out.contains("*__err1"), "got: {out}");
        assert!(out.contains("(else>)"), "got: {out}");
        // Dispatch is a flat <<switch; a hop-free op keeps the compact
        // deframaop form; the collapsed fail guard is the only <<if.
        assert!(out.contains("<<switch"), "got: {out}");
        assert!(out.contains("(case> \"ban\")"), "got: {out}");
        assert!(out.contains("(deframaop ban>"), "got: {out}");
        let if_count = out.matches("<<if").count();
        assert_eq!(if_count, 1, "expected one <<if, got {if_count}: {out}");
    }

    #[test]
    fn lowers_surface_keyword_fields_to_rest_strings() {
        let src = r#"
module M
depot events keyed-by id
pstate $$p: Map<String, Object>
op put(event) {
  let { id } = event
  $$p !<-- keypath(id), termval({:status "ok"})
  return {"ok" true}
}
"#;
        let file = parse(src).expect("parse");
        let out = emit_clojure(&file);
        assert!(out.contains("{\"status\" \"ok\"}"), "got: {out}");
    }

    #[test]
    fn compile_yields_ir_not_just_string() {
        let src = "module M\nfn f(x) { return x }\n";
        let file = parse(src).expect("parse");
        let doc = compile(&file);
        assert!(
            doc.forms
                .iter()
                .any(|f| matches!(f, Form::List(xs) if xs.first() == Some(&clj::sym("defn")))),
            "expected defn form in IR: {:?}",
            doc.forms
        );
    }
}
