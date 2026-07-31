//! Clojure runtime contracts generated directly from value-type annotations.

use crate::ast::ValueTypeExpr;
use crate::clj::{self, Form};

pub fn checked_as(value: Form, ty: &ValueTypeExpr) -> Form {
    checked_at(value, ty, format!("explicit `as {}`", display(ty)))
}

fn checked_at(value: Form, ty: &ValueTypeExpr, path: String) -> Form {
    if let ValueTypeExpr::Function { params, ret } = ty {
        return checked_function(value, params, ret, path);
    }
    let variable = "__rama_cast_value";
    clj::call(
        "__rama_contract!",
        [
            clj::list([
                clj::sym("fn"),
                clj::vector([clj::sym(variable)]),
                predicate(ty, clj::sym(variable)),
            ]),
            clj::string(display(ty)),
            clj::string(path),
            value,
        ],
    )
}

fn checked_function(
    value: Form,
    params: &[ValueTypeExpr],
    ret: &ValueTypeExpr,
    path: String,
) -> Form {
    let function_name = "__rama_cast_function";
    let names = (0..params.len())
        .map(|index| format!("__rama_cast_arg{index}"))
        .collect::<Vec<_>>();
    let checked_function = clj::call(
        "__rama_contract!",
        [
            clj::list([
                clj::sym("fn"),
                clj::vector([clj::sym("__rama_cast_candidate")]),
                clj::call("ifn?", [clj::sym("__rama_cast_candidate")]),
            ]),
            clj::string(display(&ValueTypeExpr::Function {
                params: params.to_vec(),
                ret: Box::new(ret.clone()),
            })),
            clj::string(path.clone()),
            value,
        ],
    );
    let mut invocation = vec![clj::sym(function_name)];
    invocation.extend(
        params
            .iter()
            .zip(&names)
            .enumerate()
            .map(|(index, (ty, name))| {
                checked_at(clj::sym(name), ty, format!("{path} argument {index}"))
            }),
    );
    let result = checked_at(Form::List(invocation), ret, format!("{path} return"));
    clj::call(
        "let",
        [
            clj::vector([clj::sym(function_name), checked_function]),
            clj::list([
                clj::sym("fn"),
                clj::vector(names.iter().map(clj::sym)),
                result,
            ]),
        ],
    )
}

fn predicate(ty: &ValueTypeExpr, value: Form) -> Form {
    match ty {
        ValueTypeExpr::Nil => clj::call("nil?", [value]),
        ValueTypeExpr::Never => clj::bool(false),
        ValueTypeExpr::Any | ValueTypeExpr::Unknown | ValueTypeExpr::Dynamic => clj::bool(true),
        ValueTypeExpr::Union(members) => {
            let mut forms = vec![clj::sym("or")];
            forms.extend(
                members
                    .iter()
                    .map(|member| predicate(member, value.clone())),
            );
            Form::List(forms)
        }
        ValueTypeExpr::Function { .. } => clj::call("ifn?", [value]),
        ValueTypeExpr::Capability { name, args } => match (name.as_str(), args.as_slice()) {
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
        ValueTypeExpr::Named { path, args } => {
            let class = resolve_class(path);
            let base = clj::call("instance?", [clj::sym(&class), value.clone()]);
            match (class.as_str(), args.as_slice()) {
                (
                    "java.util.List"
                    | "java.util.Set"
                    | "java.util.Collection"
                    | "java.lang.Iterable",
                    [element],
                ) => {
                    let item = "__rama_cast_element";
                    clj::call(
                        "and",
                        [
                            base,
                            clj::call(
                                "every?",
                                [
                                    clj::list([
                                        clj::sym("fn"),
                                        clj::vector([clj::sym(item)]),
                                        predicate(element, clj::sym(item)),
                                    ]),
                                    value,
                                ],
                            ),
                        ],
                    )
                }
                ("java.util.Map", [key, val]) => {
                    let entry = "__rama_cast_entry";
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
                                                predicate(key, clj::call("key", [clj::sym(entry)])),
                                                predicate(val, clj::call("val", [clj::sym(entry)])),
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

pub fn display(ty: &ValueTypeExpr) -> String {
    match ty {
        ValueTypeExpr::Named { path, args } if args.is_empty() => resolve_class(path),
        ValueTypeExpr::Named { path, args } => format!(
            "{}<{}>",
            resolve_class(path),
            args.iter().map(display).collect::<Vec<_>>().join(", ")
        ),
        ValueTypeExpr::Union(members) => {
            members.iter().map(display).collect::<Vec<_>>().join(" | ")
        }
        ValueTypeExpr::Function { params, ret } => format!(
            "Fn<({}) -> {}>",
            params.iter().map(display).collect::<Vec<_>>().join(", "),
            display(ret)
        ),
        ValueTypeExpr::Capability { name, args } if args.is_empty() => name.clone(),
        ValueTypeExpr::Capability { name, args } => format!(
            "{}<{}>",
            name,
            args.iter().map(display).collect::<Vec<_>>().join(", ")
        ),
        ValueTypeExpr::Nil => "Nil".into(),
        ValueTypeExpr::Unknown => "Unknown".into(),
        ValueTypeExpr::Dynamic => "Dynamic".into(),
        ValueTypeExpr::Any => "Any".into(),
        ValueTypeExpr::Never => "Never".into(),
    }
}

fn resolve_class(path: &str) -> String {
    match path {
        "String" => "java.lang.String",
        "Long" => "java.lang.Long",
        "Int" | "Integer" => "java.lang.Integer",
        "Boolean" => "java.lang.Boolean",
        "Object" => "java.lang.Object",
        "Number" => "java.lang.Number",
        "List" => "java.util.List",
        "Set" => "java.util.Set",
        "Map" => "java.util.Map",
        other => other,
    }
    .to_string()
}
