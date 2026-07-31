//! Gradual JVM value typing for ordinary `.rama` `fn` forms.
//!
//! This deliberately does not type dataflow or PState paths yet. Externs are
//! compile-time method sets inspired by Julia: quantified signatures,
//! tuple-shaped applicability, specificity scoring, and ambiguity rejection.

use std::collections::{BTreeSet, HashMap};

use crate::ast::{
    BinaryOp, Block, Expr, ExternDecl, FnDef, Item, LetPattern, Param, Stmt, ValueTypeExpr,
};
use crate::error::Diagnostic;
use crate::rama_ir::Program;
use crate::span::Span;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TypeId(pub usize);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Type {
    Jvm { class: String, args: Vec<TypeId> },
    Var(String),
    Union(Vec<TypeId>),
    Function { params: Vec<TypeId>, ret: TypeId },
    Capability { name: String, args: Vec<TypeId> },
    Nil,
    Unknown,
    Dynamic,
    Any,
    Never,
}

#[derive(Debug, Clone, Default)]
pub struct TypeTable {
    types: Vec<Type>,
}

impl TypeTable {
    pub fn intern(&mut self, ty: Type) -> TypeId {
        let ty = self.normalize(ty);
        if let Some(index) = self.types.iter().position(|existing| existing == &ty) {
            TypeId(index)
        } else {
            let id = TypeId(self.types.len());
            self.types.push(ty);
            id
        }
    }

    pub fn get(&self, id: TypeId) -> &Type {
        &self.types[id.0]
    }

    pub fn display(&self, id: TypeId) -> String {
        match self.get(id) {
            Type::Jvm { class, args } if args.is_empty() => class.clone(),
            Type::Jvm { class, args } => format!(
                "{}<{}>",
                class,
                args.iter()
                    .map(|arg| self.display(*arg))
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            Type::Var(name) => name.clone(),
            Type::Union(types) => types
                .iter()
                .map(|ty| self.display(*ty))
                .collect::<Vec<_>>()
                .join(" | "),
            Type::Function { params, ret } => format!(
                "Fn<({}) -> {}>",
                params
                    .iter()
                    .map(|param| self.display(*param))
                    .collect::<Vec<_>>()
                    .join(", "),
                self.display(*ret)
            ),
            Type::Capability { name, args } if args.is_empty() => name.clone(),
            Type::Capability { name, args } => format!(
                "{}<{}>",
                name,
                args.iter()
                    .map(|arg| self.display(*arg))
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            Type::Nil => "Nil".into(),
            Type::Unknown => "Unknown".into(),
            Type::Dynamic => "Dynamic".into(),
            Type::Any => "Any".into(),
            Type::Never => "Never".into(),
        }
    }

    pub fn jvm(&mut self, class: impl Into<String>, args: Vec<TypeId>) -> TypeId {
        self.intern(Type::Jvm {
            class: class.into(),
            args,
        })
    }

    pub fn union(&mut self, members: impl IntoIterator<Item = TypeId>) -> TypeId {
        let mut flat = Vec::new();
        for member in members {
            match self.get(member) {
                Type::Never => {}
                Type::Union(nested) => flat.extend(nested.iter().copied()),
                _ => flat.push(member),
            }
        }
        flat.sort_by_key(|id| id.0);
        flat.dedup();
        match flat.as_slice() {
            [] => self.intern(Type::Never),
            [one] => *one,
            _ => self.intern(Type::Union(flat)),
        }
    }

    fn normalize(&self, ty: Type) -> Type {
        ty
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignatureSource {
    Prelude,
    Extern,
    Function,
}

#[derive(Debug, Clone)]
pub struct Signature {
    pub name: String,
    pub quantified: Vec<String>,
    pub params: Vec<TypeId>,
    pub ret: TypeId,
    pub span: Span,
    pub source: SignatureSource,
}

#[derive(Debug, Clone)]
pub struct TypedFunction {
    pub params: Vec<(String, TypeId)>,
    pub return_type: TypeId,
    pub has_contract: bool,
}

#[derive(Debug, Clone)]
pub struct TypedExtern {
    pub name: String,
    pub target: String,
    pub wrapper_name: String,
    pub signature: Signature,
}

#[derive(Debug, Clone, Default)]
pub struct Typing {
    pub table: TypeTable,
    pub functions: HashMap<String, TypedFunction>,
    pub externs: HashMap<String, Vec<TypedExtern>>,
    pub diagnostics: Vec<Diagnostic>,
}

pub trait TypeOracle {
    fn is_assignable(&self, actual: &str, expected: &str) -> Option<bool>;
    fn extern_suggestions(&self, name: &str) -> Vec<String>;
}

pub fn analyze(program: &Program<'_>) -> Typing {
    Checker::new(program, None).run()
}

pub fn analyze_with_oracle(program: &Program<'_>, oracle: &dyn TypeOracle) -> Typing {
    Checker::new(program, Some(oracle)).run()
}

struct Checker<'a> {
    program: &'a Program<'a>,
    oracle: Option<&'a dyn TypeOracle>,
    typing: Typing,
    signatures: HashMap<String, Vec<Signature>>,
}

impl<'a> Checker<'a> {
    fn new(program: &'a Program<'a>, oracle: Option<&'a dyn TypeOracle>) -> Self {
        let mut checker = Self {
            program,
            oracle,
            typing: Typing::default(),
            signatures: HashMap::new(),
        };
        checker.install_prelude();
        checker.collect_externs();
        checker.collect_functions();
        checker
    }

    fn run(mut self) -> Typing {
        for item in &self.program.source.items {
            if let Item::Fn(function) = item {
                self.check_function(function);
            }
        }
        self.typing
    }

    fn install_prelude(&mut self) {
        self.generic_signature(
            "identity",
            &["T"],
            vec![var("T")],
            var("T"),
            SignatureSource::Prelude,
        );
        self.signature(
            "nil?",
            vec![simple("Any")],
            simple("Boolean"),
            SignatureSource::Prelude,
        );
        self.signature(
            "seq?",
            vec![simple("Any")],
            simple("Boolean"),
            SignatureSource::Prelude,
        );
        self.signature(
            "not",
            vec![simple("Any")],
            simple("Boolean"),
            SignatureSource::Prelude,
        );
        self.signature(
            "inc",
            vec![simple("Long")],
            simple("Long"),
            SignatureSource::Prelude,
        );
        self.signature(
            "even?",
            vec![simple("Long")],
            simple("Boolean"),
            SignatureSource::Prelude,
        );
        self.signature(
            "long",
            vec![simple("Any")],
            simple("Long"),
            SignatureSource::Prelude,
        );
        self.signature(
            "str",
            vec![simple("Any")],
            simple("String"),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "vec",
            &["T"],
            vec![generic("java.lang.Iterable", vec![var("T")])],
            generic("java.util.List", vec![var("T")]),
            SignatureSource::Prelude,
        );
        self.signature(
            "vec",
            vec![simple("Nil")],
            generic("java.util.List", vec![simple("Never")]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "seq",
            &["T"],
            vec![generic("java.lang.Iterable", vec![var("T")])],
            union(vec![
                generic("clojure.lang.ISeq", vec![var("T")]),
                simple("Nil"),
            ]),
            SignatureSource::Prelude,
        );
        self.signature(
            "seq",
            vec![simple("Nil")],
            simple("Nil"),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "count",
            &["T"],
            vec![generic("java.util.Collection", vec![var("T")])],
            simple("Long"),
            SignatureSource::Prelude,
        );
        self.signature(
            "count",
            vec![simple("String")],
            simple("Long"),
            SignatureSource::Prelude,
        );
        self.signature(
            "count",
            vec![simple("Nil")],
            simple("Long"),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "contains?",
            &["T"],
            vec![generic("java.util.Set", vec![var("T")]), var("T")],
            simple("Boolean"),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "contains?",
            &["K", "V"],
            vec![generic("java.util.Map", vec![var("K"), var("V")]), var("K")],
            simple("Boolean"),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "set",
            &["T"],
            vec![generic("java.lang.Iterable", vec![var("T")])],
            generic("java.util.Set", vec![var("T")]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "disj",
            &["T"],
            vec![generic("java.util.Set", vec![var("T")]), var("T")],
            generic("java.util.Set", vec![var("T")]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "get",
            &["K", "V"],
            vec![
                generic("java.util.Map", vec![var("K"), var("V")]),
                simple("Any"),
            ],
            union(vec![var("V"), simple("Nil")]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "first",
            &["T"],
            vec![generic("java.lang.Iterable", vec![var("T")])],
            union(vec![var("T"), simple("Nil")]),
            SignatureSource::Prelude,
        );
        self.signature(
            "first",
            vec![simple("Nil")],
            simple("Nil"),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "nth",
            &["T"],
            vec![generic("java.util.List", vec![var("T")]), simple("Long")],
            var("T"),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "conj",
            &["T", "U"],
            vec![generic("java.util.List", vec![var("T")]), var("U")],
            generic("java.util.List", vec![union(vec![var("T"), var("U")])]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "conj",
            &["T", "U"],
            vec![generic("java.util.Set", vec![var("T")]), var("U")],
            generic("java.util.Set", vec![union(vec![var("T"), var("U")])]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "assoc",
            &["K", "V", "K2", "V2"],
            vec![
                generic("java.util.Map", vec![var("K"), var("V")]),
                var("K2"),
                var("V2"),
            ],
            generic(
                "java.util.Map",
                vec![
                    union(vec![var("K"), var("K2")]),
                    union(vec![var("V"), var("V2")]),
                ],
            ),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "map",
            &["A", "B"],
            vec![
                function(vec![var("A")], var("B")),
                capability("Seqable", vec![var("A")]),
            ],
            generic("clojure.lang.LazySeq", vec![var("B")]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "map",
            &["A", "B"],
            vec![function(vec![var("A")], var("B"))],
            capability("Transducer", vec![var("A"), var("B")]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "map",
            &["A", "B", "R"],
            vec![
                function(vec![var("A"), var("B")], var("R")),
                capability("Seqable", vec![var("A")]),
                capability("Seqable", vec![var("B")]),
            ],
            generic("clojure.lang.LazySeq", vec![var("R")]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "map",
            &["A", "B", "C", "R"],
            vec![
                function(vec![var("A"), var("B"), var("C")], var("R")),
                capability("Seqable", vec![var("A")]),
                capability("Seqable", vec![var("B")]),
                capability("Seqable", vec![var("C")]),
            ],
            generic("clojure.lang.LazySeq", vec![var("R")]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "filter",
            &["A", "P"],
            vec![
                function(vec![var("A")], var("P")),
                capability("Seqable", vec![var("A")]),
            ],
            generic("clojure.lang.LazySeq", vec![var("A")]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "filter",
            &["A", "P"],
            vec![function(vec![var("A")], var("P"))],
            capability("Transducer", vec![var("A"), var("A")]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "every?",
            &["A", "P"],
            vec![
                function(vec![var("A")], var("P")),
                capability("Seqable", vec![var("A")]),
            ],
            simple("Boolean"),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "some",
            &["A", "B"],
            vec![
                function(vec![var("A")], var("B")),
                capability("Seqable", vec![var("A")]),
            ],
            union(vec![var("B"), simple("Nil")]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "reduce",
            &["A", "E"],
            vec![
                function(vec![var("A"), var("E")], var("A")),
                var("A"),
                capability("Reducible", vec![var("E")]),
            ],
            var("A"),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "into",
            &["A", "E"],
            vec![
                generic("java.util.List", vec![var("A")]),
                capability("Reducible", vec![var("E")]),
            ],
            generic("java.util.List", vec![union(vec![var("A"), var("E")])]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "into",
            &["A", "E", "R"],
            vec![
                generic("java.util.List", vec![var("A")]),
                capability("Transducer", vec![var("E"), var("R")]),
                capability("Reducible", vec![var("E")]),
            ],
            generic("java.util.List", vec![union(vec![var("A"), var("R")])]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "into",
            &["A", "E"],
            vec![
                generic("java.util.Set", vec![var("A")]),
                capability("Reducible", vec![var("E")]),
            ],
            generic("java.util.Set", vec![union(vec![var("A"), var("E")])]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "into",
            &["A", "E", "R"],
            vec![
                generic("java.util.Set", vec![var("A")]),
                capability("Transducer", vec![var("E"), var("R")]),
                capability("Reducible", vec![var("E")]),
            ],
            generic("java.util.Set", vec![union(vec![var("A"), var("R")])]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "first",
            &["A"],
            vec![capability("Seqable", vec![var("A")])],
            union(vec![var("A"), simple("Nil")]),
            SignatureSource::Prelude,
        );
        self.generic_signature(
            "seq",
            &["A"],
            vec![capability("Seqable", vec![var("A")])],
            union(vec![
                generic("clojure.lang.ISeq", vec![var("A")]),
                simple("Nil"),
            ]),
            SignatureSource::Prelude,
        );
        self.signature(
            "count",
            vec![capability("Countable", Vec::new())],
            simple("Long"),
            SignatureSource::Prelude,
        );
    }

    fn signature(
        &mut self,
        name: &str,
        params: Vec<ValueTypeExpr>,
        ret: ValueTypeExpr,
        source: SignatureSource,
    ) {
        self.generic_signature(name, &[], params, ret, source);
    }

    fn generic_signature(
        &mut self,
        name: &str,
        quantified: &[&str],
        params: Vec<ValueTypeExpr>,
        ret: ValueTypeExpr,
        source: SignatureSource,
    ) {
        let quantified_set: BTreeSet<String> =
            quantified.iter().map(|name| (*name).to_string()).collect();
        let params = params
            .iter()
            .map(|ty| self.resolve_type(ty, &quantified_set, Span::default()))
            .collect();
        let ret = self.resolve_type(&ret, &quantified_set, Span::default());
        self.signatures
            .entry(name.to_string())
            .or_default()
            .push(Signature {
                name: name.to_string(),
                quantified: quantified_set.into_iter().collect(),
                params,
                ret,
                span: Span::default(),
                source,
            });
    }

    fn collect_externs(&mut self) {
        for item in &self.program.source.items {
            let Item::Extern(extern_decl) = item else {
                continue;
            };
            let signature = self.resolve_extern(extern_decl);
            let overload_index = self
                .typing
                .externs
                .get(&extern_decl.name.node)
                .map_or(0, Vec::len);
            let typed = TypedExtern {
                name: extern_decl.name.node.clone(),
                target: extern_decl.target.as_ref().map_or_else(
                    || extern_decl.name.node.clone(),
                    |target| target.node.clone(),
                ),
                wrapper_name: format!(
                    "__rama_extern_{}_{}",
                    sanitize(&extern_decl.name.node),
                    overload_index
                ),
                signature: signature.clone(),
            };
            self.typing
                .externs
                .entry(extern_decl.name.node.clone())
                .or_default()
                .push(typed);
            self.signatures
                .entry(extern_decl.name.node.clone())
                .or_default()
                .push(signature);
        }
    }

    fn resolve_extern(&mut self, declaration: &ExternDecl) -> Signature {
        let quantified: BTreeSet<String> = declaration
            .type_params
            .iter()
            .map(|param| param.node.clone())
            .collect();
        let params = declaration
            .params
            .iter()
            .map(|param| match &param.ty {
                Some(ty) => self.resolve_type(&ty.node, &quantified, ty.span),
                None => {
                    self.typing.diagnostics.push(Diagnostic::type_error(
                        param.name.span,
                        "extern parameters require explicit types",
                    ));
                    self.typing.table.intern(Type::Unknown)
                }
            })
            .collect();
        let ret = self.resolve_type(
            &declaration.return_ty.node,
            &quantified,
            declaration.return_ty.span,
        );
        Signature {
            name: declaration.name.node.clone(),
            quantified: quantified.into_iter().collect(),
            params,
            ret,
            span: declaration.span,
            source: SignatureSource::Extern,
        }
    }

    fn collect_functions(&mut self) {
        for item in &self.program.source.items {
            let Item::Fn(function) = item else {
                continue;
            };
            let typed = is_typed_function(function);
            if !typed {
                continue;
            }
            let quantified = BTreeSet::new();
            let params: Vec<TypeId> = function
                .params
                .iter()
                .map(|param| self.resolve_param(param, &quantified, true))
                .collect();
            let ret = match &function.return_ty {
                Some(ty) => self.resolve_type(&ty.node, &quantified, ty.span),
                None => self.typing.table.intern(Type::Unknown),
            };
            self.signatures
                .entry(function.name.node.clone())
                .or_default()
                .push(Signature {
                    name: function.name.node.clone(),
                    quantified: Vec::new(),
                    params,
                    ret,
                    span: function.span,
                    source: SignatureSource::Function,
                });
        }
    }

    fn check_function(&mut self, function: &FnDef) {
        let has_contract = is_typed_function(function);
        if !has_contract {
            return;
        }
        let quantified = BTreeSet::new();
        let params: Vec<(String, TypeId)> = function
            .params
            .iter()
            .map(|param| {
                (
                    param.name.node.clone(),
                    self.resolve_param(param, &quantified, true),
                )
            })
            .collect();
        let mut locals: HashMap<String, TypeId> = params.iter().cloned().collect();
        let declared_return = function
            .return_ty
            .as_ref()
            .map(|ty| self.resolve_type(&ty.node, &quantified, ty.span));
        let mut returns = Vec::new();
        self.check_block(&function.body, &mut locals, declared_return, &mut returns);
        let inferred_return = returns
            .into_iter()
            .reduce(|left, right| self.join(left, right))
            .unwrap_or_else(|| self.typing.table.intern(Type::Nil));
        let return_type = declared_return.unwrap_or(inferred_return);
        self.typing.functions.insert(
            function.name.node.clone(),
            TypedFunction {
                params,
                return_type,
                has_contract,
            },
        );
    }

    fn resolve_param(
        &mut self,
        param: &Param,
        quantified: &BTreeSet<String>,
        require: bool,
    ) -> TypeId {
        match &param.ty {
            Some(ty) => self.resolve_type(&ty.node, quantified, ty.span),
            None if require => {
                self.typing.diagnostics.push(Diagnostic::type_error(
                    param.name.span,
                    format!(
                        "typed fn parameter `{}` needs a type annotation (use `Unknown` for a gradual boundary)",
                        param.name.node
                    ),
                ));
                self.typing.table.intern(Type::Unknown)
            }
            None => self.typing.table.intern(Type::Unknown),
        }
    }

    fn resolve_type(
        &mut self,
        expr: &ValueTypeExpr,
        quantified: &BTreeSet<String>,
        span: Span,
    ) -> TypeId {
        match expr {
            ValueTypeExpr::Named { path, args } if quantified.contains(path) => {
                if !args.is_empty() {
                    self.typing.diagnostics.push(Diagnostic::type_error(
                        span,
                        format!("type variable `{path}` cannot take type arguments"),
                    ));
                }
                self.typing.table.intern(Type::Var(path.clone()))
            }
            ValueTypeExpr::Named { path, args } => {
                if !path.contains('.') && !is_builtin_alias(path) {
                    self.typing.diagnostics.push(Diagnostic::type_error(
                        span,
                        format!(
                            "unknown JVM type `{path}`; use a built-in alias or fully qualified class name"
                        ),
                    ));
                }
                let class = resolve_class(path);
                let resolved_args = args
                    .iter()
                    .map(|arg| self.resolve_type(arg, quantified, span))
                    .collect::<Vec<_>>();
                if let Some(expected) = generic_arity(&class) {
                    if resolved_args.len() != expected {
                        self.typing.diagnostics.push(Diagnostic::type_error(
                            span,
                            format!(
                                "`{class}` expects {expected} type argument(s), got {}",
                                resolved_args.len()
                            ),
                        ));
                    }
                }
                self.typing.table.jvm(class, resolved_args)
            }
            ValueTypeExpr::Union(members) => {
                let members = members
                    .iter()
                    .map(|member| self.resolve_type(member, quantified, span))
                    .collect::<Vec<_>>();
                self.typing.table.union(members)
            }
            ValueTypeExpr::Function { params, ret } => {
                let params = params
                    .iter()
                    .map(|param| self.resolve_type(param, quantified, span))
                    .collect();
                let ret = self.resolve_type(ret, quantified, span);
                self.typing.table.intern(Type::Function { params, ret })
            }
            ValueTypeExpr::Capability { name, args } => {
                let expected_arity = match name.as_str() {
                    "Seqable" | "Reducible" => 1,
                    "Countable" => 0,
                    "Transducer" => 2,
                    _ => {
                        self.typing.diagnostics.push(Diagnostic::type_error(
                            span,
                            format!("unknown capability `{name}`"),
                        ));
                        args.len()
                    }
                };
                if args.len() != expected_arity {
                    self.typing.diagnostics.push(Diagnostic::type_error(
                        span,
                        format!(
                            "`{name}` expects {expected_arity} type argument(s), got {}",
                            args.len()
                        ),
                    ));
                }
                let args = args
                    .iter()
                    .map(|arg| self.resolve_type(arg, quantified, span))
                    .collect();
                self.typing.table.intern(Type::Capability {
                    name: name.clone(),
                    args,
                })
            }
            ValueTypeExpr::Nil => self.typing.table.intern(Type::Nil),
            ValueTypeExpr::Unknown => self.typing.table.intern(Type::Unknown),
            ValueTypeExpr::Dynamic => self.typing.table.intern(Type::Dynamic),
            ValueTypeExpr::Any => self.typing.table.intern(Type::Any),
            ValueTypeExpr::Never => self.typing.table.intern(Type::Never),
        }
    }

    fn check_block(
        &mut self,
        block: &Block,
        locals: &mut HashMap<String, TypeId>,
        expected_return: Option<TypeId>,
        returns: &mut Vec<TypeId>,
    ) {
        for statement in &block.stmts {
            match statement {
                Stmt::Let { pattern, value, .. } => {
                    let value_type = self.infer_expr(value, locals);
                    match pattern {
                        LetPattern::Name(name) => {
                            locals.insert(name.node.clone(), value_type);
                        }
                        LetPattern::Destructure(names) => {
                            let unknown = self.typing.table.intern(Type::Unknown);
                            for name in names {
                                locals.insert(name.node.clone(), unknown);
                            }
                        }
                    }
                }
                Stmt::Return { value, span } => {
                    let actual = self.infer_expr(value, locals);
                    if let Some(expected) = expected_return {
                        if !self.assignable(actual, expected) {
                            self.typing.diagnostics.push(Diagnostic::type_error(
                                *span,
                                format!(
                                    "return type `{}` is not assignable to `{}`",
                                    self.typing.table.display(actual),
                                    self.typing.table.display(expected)
                                ),
                            ));
                        }
                    }
                    returns.push(actual);
                }
                Stmt::Effect { value, .. } => {
                    self.infer_expr(value, locals);
                }
                Stmt::If {
                    condition,
                    consequence,
                    alternative,
                    ..
                } => {
                    self.infer_expr(condition, locals);
                    let mut consequence_locals = locals.clone();
                    self.check_block(
                        consequence,
                        &mut consequence_locals,
                        expected_return,
                        returns,
                    );
                    if let Some(alternative) = alternative {
                        let mut alternative_locals = locals.clone();
                        self.check_block(
                            alternative,
                            &mut alternative_locals,
                            expected_return,
                            returns,
                        );
                    }
                }
                _ => {}
            }
        }
    }

    fn infer_expr(&mut self, expr: &Expr, locals: &HashMap<String, TypeId>) -> TypeId {
        match expr {
            Expr::String(_) | Expr::Keyword(_) => self.jvm_alias("String"),
            Expr::Int(_) => self.jvm_alias("Long"),
            Expr::Bool(_) => self.jvm_alias("Boolean"),
            Expr::Ident(identifier) if identifier.node == "nil" => {
                self.typing.table.intern(Type::Nil)
            }
            Expr::Ident(identifier) => match locals.get(&identifier.node).copied() {
                Some(local) => local,
                None => self.infer_function_value(&identifier.node, identifier.span),
            },
            Expr::List { elems, .. } => {
                let mut elem_type = self.typing.table.intern(Type::Never);
                for elem in elems {
                    let inferred = self.infer_expr(elem, locals);
                    elem_type = self.join(elem_type, inferred);
                }
                self.typing.table.jvm("java.util.List", vec![elem_type])
            }
            Expr::Map { entries, .. } => {
                let never = self.typing.table.intern(Type::Never);
                let mut key_type = never;
                let mut value_type = never;
                for entry in entries {
                    let key = self.infer_expr(&entry.key, locals);
                    let value = entry
                        .value
                        .as_ref()
                        .map_or(key, |value| self.infer_expr(value, locals));
                    key_type = self.join(key_type, key);
                    value_type = self.join(value_type, value);
                }
                self.typing
                    .table
                    .jvm("java.util.Map", vec![key_type, value_type])
            }
            Expr::Binary {
                op: BinaryOp::Eq | BinaryOp::NotEq,
                left,
                right,
                ..
            } => {
                self.infer_expr(left, locals);
                self.infer_expr(right, locals);
                self.jvm_alias("Boolean")
            }
            Expr::Ternary {
                cond,
                then_branch,
                else_branch,
                ..
            } => {
                self.infer_expr(cond, locals);
                let then_type = self.infer_expr(then_branch, locals);
                let else_type = self.infer_expr(else_branch, locals);
                self.join(then_type, else_type)
            }
            Expr::Call(call) => {
                let args = call
                    .args
                    .iter()
                    .map(|arg| self.infer_expr(arg, locals))
                    .collect::<Vec<_>>();
                match locals.get(&call.callee.node).copied() {
                    Some(callable) => self.resolve_callable(callable, &args, call.span),
                    None => self.resolve_call(&call.callee.node, &args, call.span),
                }
            }
            Expr::As { value, ty, .. } => {
                self.infer_expr(value, locals);
                self.resolve_type(&ty.node, &BTreeSet::new(), ty.span)
            }
        }
    }

    fn resolve_call(&mut self, name: &str, args: &[TypeId], span: Span) -> TypeId {
        let Some(candidates) = self.signatures.get(name).cloned() else {
            let suggestions = self
                .oracle
                .map_or_else(Vec::new, |oracle| oracle.extern_suggestions(name));
            let suggestion_text = if suggestions.is_empty() {
                String::new()
            } else {
                format!(
                    "\nobserved live Var; pin one of:\n  {}",
                    suggestions.join("\n  ")
                )
            };
            self.typing.diagnostics.push(Diagnostic::type_error(
                span,
                format!(
                    "unknown function `{name}` in typed code; add an `extern` declaration{suggestion_text}"
                ),
            ));
            return self.typing.table.intern(Type::Unknown);
        };
        let mut applicable = Vec::new();
        for signature in candidates {
            if signature.params.len() != args.len() {
                continue;
            }
            let mut bindings = HashMap::new();
            let mut score = 0usize;
            let mut ok = true;
            for (expected, actual) in signature.params.iter().zip(args) {
                if !self.match_type(*expected, *actual, &mut bindings, &mut score) {
                    ok = false;
                    break;
                }
            }
            if ok {
                let result = self.substitute(signature.ret, &bindings);
                applicable.push((score, signature, result));
            }
        }
        if applicable.is_empty() {
            self.typing.diagnostics.push(Diagnostic::type_error(
                span,
                format!(
                    "no `{name}` signature accepts ({})",
                    args.iter()
                        .map(|arg| self.typing.table.display(*arg))
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            ));
            return self.typing.table.intern(Type::Unknown);
        }
        applicable.sort_by_key(|(score, _, _)| *score);
        let best_score = applicable.last().unwrap().0;
        let best = applicable
            .into_iter()
            .filter(|(score, _, _)| *score == best_score)
            .collect::<Vec<_>>();
        let equivalent_duplicates = best.windows(2).all(|pair| {
            pair[0].1.params == pair[1].1.params
                && pair[0].1.ret == pair[1].1.ret
                && pair[0].1.quantified == pair[1].1.quantified
        });
        if best.len() > 1 && !equivalent_duplicates {
            self.typing.diagnostics.push(Diagnostic::type_error(
                span,
                format!(
                    "ambiguous call to `{name}`: {} equally specific signatures apply",
                    best.len()
                ),
            ));
            return self
                .typing
                .table
                .union(best.iter().map(|(_, _, result)| *result));
        }
        best[0].2
    }

    fn infer_function_value(&mut self, name: &str, span: Span) -> TypeId {
        let Some(candidates) = self.signatures.get(name).cloned() else {
            self.typing.diagnostics.push(Diagnostic::type_error(
                span,
                format!("unknown value `{name}`"),
            ));
            return self.typing.table.intern(Type::Unknown);
        };
        let mut distinct = candidates
            .into_iter()
            .map(|signature| (signature.params, signature.ret))
            .collect::<Vec<_>>();
        distinct.dedup();
        if distinct.len() != 1 {
            self.typing.diagnostics.push(Diagnostic::type_error(
                span,
                format!(
                    "overloaded function `{name}` cannot be used as a value without an explicit `as Fn<...>`"
                ),
            ));
            return self.typing.table.intern(Type::Unknown);
        }
        let (params, ret) = distinct.pop().unwrap();
        self.typing.table.intern(Type::Function { params, ret })
    }

    fn resolve_callable(&mut self, callable: TypeId, args: &[TypeId], span: Span) -> TypeId {
        match self.typing.table.get(callable).clone() {
            Type::Function { params, ret } if params.len() == args.len() => {
                for (index, (actual, expected)) in args.iter().zip(params).enumerate() {
                    if !self.assignable(*actual, expected) {
                        self.typing.diagnostics.push(Diagnostic::type_error(
                            span,
                            format!(
                                "call argument {index} has type `{}`, expected `{}`",
                                self.typing.table.display(*actual),
                                self.typing.table.display(expected)
                            ),
                        ));
                    }
                }
                ret
            }
            Type::Function { params, .. } => {
                self.typing.diagnostics.push(Diagnostic::type_error(
                    span,
                    format!(
                        "function expects {} argument(s), got {}",
                        params.len(),
                        args.len()
                    ),
                ));
                self.typing.table.intern(Type::Unknown)
            }
            Type::Dynamic => self.typing.table.intern(Type::Dynamic),
            Type::Unknown => {
                self.typing.diagnostics.push(Diagnostic::type_error(
                    span,
                    "cannot call `Unknown`; narrow it to `Fn<(...) -> ...>` first",
                ));
                self.typing.table.intern(Type::Unknown)
            }
            other => {
                let other = self.typing.table.intern(other);
                let display = self.typing.table.display(other);
                self.typing.diagnostics.push(Diagnostic::type_error(
                    span,
                    format!("value of type `{display}` is not callable"),
                ));
                self.typing.table.intern(Type::Unknown)
            }
        }
    }

    fn match_type(
        &mut self,
        expected: TypeId,
        actual: TypeId,
        bindings: &mut HashMap<String, TypeId>,
        score: &mut usize,
    ) -> bool {
        match self.typing.table.get(expected).clone() {
            Type::Var(name) => {
                if let Some(bound) = bindings.get(&name).copied() {
                    self.assignable(actual, bound) && self.assignable(bound, actual)
                } else {
                    bindings.insert(name, actual);
                    *score += 2;
                    true
                }
            }
            Type::Any => true,
            Type::Dynamic | Type::Unknown => {
                *score += 1;
                true
            }
            Type::Union(members) => members
                .into_iter()
                .any(|member| self.match_type(member, actual, bindings, score)),
            Type::Function {
                params: expected_params,
                ret: expected_ret,
            } => match self.typing.table.get(actual).clone() {
                Type::Function {
                    params: actual_params,
                    ret: actual_ret,
                } if expected_params.len() == actual_params.len() => {
                    *score += 4;
                    expected_params
                        .into_iter()
                        .zip(actual_params)
                        .all(|(expected, actual)| {
                            self.match_type(expected, actual, bindings, score)
                        })
                        && self.match_type(expected_ret, actual_ret, bindings, score)
                }
                Type::Dynamic => true,
                _ => false,
            },
            Type::Capability { name, args } => {
                self.match_capability(&name, &args, actual, bindings, score)
            }
            Type::Jvm {
                class,
                args: expected_args,
            } => match self.typing.table.get(actual).clone() {
                Type::Jvm {
                    class: actual_class,
                    args: actual_args,
                } if self.class_assignable(&actual_class, &class)
                    && expected_args.len() == actual_args.len() =>
                {
                    *score += if actual_class == class { 5 } else { 3 };
                    expected_args
                        .into_iter()
                        .zip(actual_args)
                        .all(|(expected, actual)| {
                            self.match_type(expected, actual, bindings, score)
                        })
                }
                Type::Dynamic => true,
                Type::Unknown => false,
                _ => false,
            },
            _ => self.assignable(actual, expected),
        }
    }

    fn substitute(&mut self, ty: TypeId, bindings: &HashMap<String, TypeId>) -> TypeId {
        match self.typing.table.get(ty).clone() {
            Type::Var(name) => bindings
                .get(&name)
                .copied()
                .unwrap_or_else(|| self.typing.table.intern(Type::Unknown)),
            Type::Jvm { class, args } => {
                let args = args
                    .into_iter()
                    .map(|arg| self.substitute(arg, bindings))
                    .collect();
                self.typing.table.jvm(class, args)
            }
            Type::Union(members) => {
                let members = members
                    .into_iter()
                    .map(|member| self.substitute(member, bindings))
                    .collect::<Vec<_>>();
                self.typing.table.union(members)
            }
            Type::Function { params, ret } => {
                let params = params
                    .into_iter()
                    .map(|param| self.substitute(param, bindings))
                    .collect();
                let ret = self.substitute(ret, bindings);
                self.typing.table.intern(Type::Function { params, ret })
            }
            Type::Capability { name, args } => {
                let args = args
                    .into_iter()
                    .map(|arg| self.substitute(arg, bindings))
                    .collect();
                self.typing.table.intern(Type::Capability { name, args })
            }
            _ => ty,
        }
    }

    fn assignable(&self, actual: TypeId, expected: TypeId) -> bool {
        if actual == expected {
            return true;
        }
        match (
            self.typing.table.get(actual),
            self.typing.table.get(expected),
        ) {
            (_, Type::Any | Type::Dynamic | Type::Unknown) => true,
            (Type::Dynamic | Type::Never, _) => true,
            (Type::Union(members), _) => members
                .iter()
                .all(|member| self.assignable(*member, expected)),
            (_, Type::Union(members)) => members
                .iter()
                .any(|member| self.assignable(actual, *member)),
            (
                Type::Jvm {
                    class: actual_class,
                    args: actual_args,
                },
                Type::Jvm {
                    class: expected_class,
                    args: expected_args,
                },
            ) => {
                self.class_assignable(actual_class, expected_class)
                    && actual_args.len() == expected_args.len()
                    && actual_args
                        .iter()
                        .zip(expected_args)
                        .all(|(actual, expected)| {
                            self.assignable(*actual, *expected)
                                && self.assignable(*expected, *actual)
                        })
            }
            (
                Type::Function {
                    params: actual_params,
                    ret: actual_ret,
                },
                Type::Function {
                    params: expected_params,
                    ret: expected_ret,
                },
            ) => {
                actual_params.len() == expected_params.len()
                    && actual_params
                        .iter()
                        .zip(expected_params)
                        .all(|(actual, expected)| self.assignable(*expected, *actual))
                    && self.assignable(*actual_ret, *expected_ret)
            }
            (actual, Type::Capability { name, args }) => {
                self.capability_assignable(actual, name, args)
            }
            _ => false,
        }
    }

    fn join(&mut self, left: TypeId, right: TypeId) -> TypeId {
        if self.assignable(left, right) {
            right
        } else if self.assignable(right, left) {
            left
        } else {
            self.typing.table.union([left, right])
        }
    }

    fn match_capability(
        &mut self,
        name: &str,
        expected_args: &[TypeId],
        actual: TypeId,
        bindings: &mut HashMap<String, TypeId>,
        score: &mut usize,
    ) -> bool {
        match self.typing.table.get(actual).clone() {
            Type::Dynamic => true,
            Type::Unknown => false,
            Type::Nil => matches!(name, "Seqable" | "Reducible" | "Countable"),
            Type::Union(members) => members
                .into_iter()
                .all(|member| self.match_capability(name, expected_args, member, bindings, score)),
            Type::Capability {
                name: actual_name,
                args: actual_args,
            } if actual_name == name && actual_args.len() == expected_args.len() => expected_args
                .iter()
                .copied()
                .zip(actual_args)
                .all(|(expected, actual)| self.match_type(expected, actual, bindings, score)),
            Type::Jvm { class, args } if name == "Countable" => {
                class == "java.lang.String"
                    || self.class_assignable(&class, "java.util.Collection")
                    || self.class_assignable(&class, "java.util.Map")
                    || self.class_assignable(&class, "clojure.lang.Counted")
                    || !args.is_empty() && class == "java.util.Map"
            }
            Type::Jvm { class, args }
                if matches!(name, "Seqable" | "Reducible") && expected_args.len() == 1 =>
            {
                let element = if class == "java.lang.String" {
                    Some(self.typing.table.jvm("java.lang.Character", Vec::new()))
                } else if class == "java.util.Map" && args.len() == 2 {
                    Some(self.typing.table.jvm("java.util.Map.Entry", args.clone()))
                } else if matches!(
                    class.as_str(),
                    "java.util.List"
                        | "java.util.Set"
                        | "java.util.Collection"
                        | "java.lang.Iterable"
                        | "clojure.lang.ISeq"
                        | "clojure.lang.LazySeq"
                        | "clojure.lang.IReduce"
                        | "clojure.lang.IReduceInit"
                ) && args.len() == 1
                {
                    Some(args[0])
                } else {
                    None
                };
                element.is_some_and(|element| {
                    *score += 2;
                    self.match_type(expected_args[0], element, bindings, score)
                })
            }
            _ => false,
        }
    }

    fn capability_assignable(&self, actual: &Type, name: &str, args: &[TypeId]) -> bool {
        match actual {
            Type::Dynamic | Type::Never => true,
            Type::Nil => matches!(name, "Seqable" | "Reducible" | "Countable"),
            Type::Union(members) => members.iter().all(|member| {
                self.capability_assignable(self.typing.table.get(*member), name, args)
            }),
            Type::Capability {
                name: actual_name,
                args: actual_args,
            } => {
                actual_name == name
                    && actual_args.len() == args.len()
                    && actual_args
                        .iter()
                        .zip(args)
                        .all(|(actual, expected)| self.assignable(*actual, *expected))
            }
            Type::Jvm { class, args: _ } if name == "Countable" => {
                class == "java.lang.String"
                    || self.class_assignable(class, "java.util.Collection")
                    || self.class_assignable(class, "java.util.Map")
                    || self.class_assignable(class, "clojure.lang.Counted")
            }
            Type::Jvm {
                class,
                args: actual_args,
            } if matches!(name, "Seqable" | "Reducible") && args.len() == 1 => {
                if class == "java.lang.String" {
                    matches!(
                        self.typing.table.get(args[0]),
                        Type::Jvm { class, .. } if class == "java.lang.Character" || class == "java.lang.Object"
                    )
                } else if class == "java.util.Map" && actual_args.len() == 2 {
                    match self.typing.table.get(args[0]) {
                        Type::Jvm {
                            class,
                            args: expected_entry,
                        } if class == "java.util.Map.Entry" && expected_entry.len() == 2 => {
                            self.assignable(actual_args[0], expected_entry[0])
                                && self.assignable(actual_args[1], expected_entry[1])
                        }
                        Type::Any | Type::Dynamic | Type::Unknown => true,
                        _ => false,
                    }
                } else if actual_args.len() == 1
                    && (self.class_assignable(class, "java.lang.Iterable")
                        || matches!(
                            class.as_str(),
                            "clojure.lang.ISeq"
                                | "clojure.lang.LazySeq"
                                | "clojure.lang.IReduce"
                                | "clojure.lang.IReduceInit"
                        ))
                {
                    self.assignable(actual_args[0], args[0])
                } else {
                    false
                }
            }
            _ => false,
        }
    }

    fn jvm_alias(&mut self, alias: &str) -> TypeId {
        self.typing.table.jvm(resolve_class(alias), Vec::new())
    }

    fn class_assignable(&self, actual: &str, expected: &str) -> bool {
        self.oracle
            .and_then(|oracle| oracle.is_assignable(actual, expected))
            .unwrap_or_else(|| bootstrap_assignable(actual, expected))
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

fn is_builtin_alias(path: &str) -> bool {
    matches!(
        path,
        "String"
            | "Long"
            | "Int"
            | "Integer"
            | "Boolean"
            | "Object"
            | "Number"
            | "List"
            | "Set"
            | "Map"
    )
}

fn generic_arity(class: &str) -> Option<usize> {
    match class {
        "java.util.List"
        | "java.util.Set"
        | "java.util.Collection"
        | "java.lang.Iterable"
        | "clojure.lang.ISeq" => Some(1),
        "java.util.Map" => Some(2),
        _ => None,
    }
}

fn bootstrap_assignable(actual: &str, expected: &str) -> bool {
    if actual == expected || expected == "java.lang.Object" {
        return true;
    }
    matches!(
        (actual, expected),
        ("java.lang.Long", "java.lang.Number")
            | ("java.lang.Integer", "java.lang.Number")
            | ("java.util.List", "java.util.Collection")
            | ("java.util.Set", "java.util.Collection")
            | ("java.util.List", "java.lang.Iterable")
            | ("java.util.Set", "java.lang.Iterable")
            | ("java.util.Collection", "java.lang.Iterable")
            | ("clojure.lang.ISeq", "java.lang.Iterable")
    )
}

fn is_typed_function(function: &FnDef) -> bool {
    function.return_ty.is_some()
        || function.params.iter().any(|param| param.ty.is_some())
        || block_contains_cast(&function.body)
}

fn block_contains_cast(block: &Block) -> bool {
    block.stmts.iter().any(|statement| match statement {
        Stmt::Let { value, .. } | Stmt::Return { value, .. } | Stmt::Effect { value, .. } => {
            expr_contains_cast(value)
        }
        Stmt::Select { path, .. } | Stmt::Transform { path, .. } => {
            path.iter().any(expr_contains_cast)
        }
        Stmt::Fail {
            value, condition, ..
        } => expr_contains_cast(value) || expr_contains_cast(condition),
        Stmt::Hash { key, .. } => expr_contains_cast(key),
        Stmt::If {
            condition,
            consequence,
            alternative,
            ..
        } => {
            expr_contains_cast(condition)
                || block_contains_cast(consequence)
                || alternative.as_ref().is_some_and(block_contains_cast)
        }
    })
}

fn expr_contains_cast(expr: &Expr) -> bool {
    match expr {
        Expr::As { .. } => true,
        Expr::Call(call) => call.args.iter().any(expr_contains_cast),
        Expr::List { elems, .. } => elems.iter().any(expr_contains_cast),
        Expr::Map { entries, .. } => entries.iter().any(|entry| {
            expr_contains_cast(&entry.key) || entry.value.as_ref().is_some_and(expr_contains_cast)
        }),
        Expr::Binary { left, right, .. } => expr_contains_cast(left) || expr_contains_cast(right),
        Expr::Ternary {
            cond,
            then_branch,
            else_branch,
            ..
        } => {
            expr_contains_cast(cond)
                || expr_contains_cast(then_branch)
                || expr_contains_cast(else_branch)
        }
        Expr::String(_) | Expr::Keyword(_) | Expr::Ident(_) | Expr::Int(_) | Expr::Bool(_) => false,
    }
}

fn sanitize(name: &str) -> String {
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

fn simple(name: &str) -> ValueTypeExpr {
    match name {
        "Nil" => ValueTypeExpr::Nil,
        "Unknown" => ValueTypeExpr::Unknown,
        "Dynamic" => ValueTypeExpr::Dynamic,
        "Any" => ValueTypeExpr::Any,
        "Never" => ValueTypeExpr::Never,
        _ => ValueTypeExpr::Named {
            path: name.into(),
            args: Vec::new(),
        },
    }
}

fn var(name: &str) -> ValueTypeExpr {
    ValueTypeExpr::Named {
        path: name.into(),
        args: Vec::new(),
    }
}

fn generic(name: &str, args: Vec<ValueTypeExpr>) -> ValueTypeExpr {
    ValueTypeExpr::Named {
        path: name.into(),
        args,
    }
}

fn function(params: Vec<ValueTypeExpr>, ret: ValueTypeExpr) -> ValueTypeExpr {
    ValueTypeExpr::Function {
        params,
        ret: Box::new(ret),
    }
}

fn capability(name: &str, args: Vec<ValueTypeExpr>) -> ValueTypeExpr {
    ValueTypeExpr::Capability {
        name: name.into(),
        args,
    }
}

fn union(members: Vec<ValueTypeExpr>) -> ValueTypeExpr {
    ValueTypeExpr::Union(members)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parse::parse;

    fn typing(source: &str) -> Typing {
        let ast = parse(source).expect("parse");
        analyze(&Program::from_ast(&ast))
    }

    #[test]
    fn generic_vec_preserves_element_type() {
        let result = typing(
            r#"
module T
fn copy(xs: java.util.List<String>) -> java.util.List<String> {
  return vec(xs)
}
"#,
        );
        assert!(result.diagnostics.is_empty(), "{:#?}", result.diagnostics);
        let function = &result.functions["copy"];
        assert_eq!(
            result.table.display(function.return_type),
            "java.util.List<java.lang.String>"
        );
    }

    #[test]
    fn rejects_wrong_return_type() {
        let result = typing(
            r#"
module T
fn bad(x: Long) -> String { return x }
"#,
        );
        assert!(result
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("return type")));
    }

    #[test]
    fn requires_extern_for_unknown_clojure_var() {
        let result = typing(
            r#"
module T
fn bad(x: String) -> String { return mystery(x) }
"#,
        );
        assert!(result
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("add an `extern`")));
    }

    #[test]
    fn extern_type_variables_are_correlated() {
        let result = typing(
            r#"
module T
extern mine<T>(x: T) -> T
fn okay(x: String) -> String { return mine(x) }
"#,
        );
        assert!(result.diagnostics.is_empty(), "{:#?}", result.diagnostics);
    }

    #[test]
    fn nullable_return_accepts_nil() {
        let result = typing(
            r#"
module T
fn maybe(x: String) -> String? {
  if (x == "") { return nil }
  return x
}
"#,
        );
        assert!(result.diagnostics.is_empty(), "{:#?}", result.diagnostics);
    }

    #[test]
    fn seq_preserves_element_type_and_nilability() {
        let result = typing(
            r#"
module T
fn sequence(xs: java.util.List<String>) -> clojure.lang.ISeq<String>? {
  return seq(xs)
}
"#,
        );
        assert!(result.diagnostics.is_empty(), "{:#?}", result.diagnostics);
    }

    #[test]
    fn generic_collection_mismatch_is_rejected() {
        let result = typing(
            r#"
module T
fn wrong(xs: java.util.List<Long>) -> java.util.List<String> {
  return vec(xs)
}
"#,
        );
        assert!(result
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("return type")));
    }

    #[test]
    fn overlapping_externs_report_ambiguity() {
        let result = typing(
            r#"
module T
extern choose(a: Any, b: String) -> Long
extern choose(a: String, b: Any) -> Long
fn ambiguous(a: String, b: String) -> Long {
  return choose(a, b)
}
"#,
        );
        assert!(result
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("ambiguous call")));
    }

    #[test]
    fn polymorphic_count_accepts_strings_and_collections() {
        let result = typing(
            r#"
module T
fn string-size(value: String) -> Long { return count(value) }
fn list-size(value: java.util.List<String>) -> Long { return count(value) }
"#,
        );
        assert!(result.diagnostics.is_empty(), "{:#?}", result.diagnostics);
    }

    #[test]
    fn unannotated_parameter_is_rejected_in_typed_fn() {
        let result = typing(
            r#"
module T
fn mixed(typed: String, missing) -> String { return typed }
"#,
        );
        assert!(result
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("needs a type annotation")));
    }

    #[test]
    fn conj_return_widens_persistent_collection_elements() {
        let result = typing(
            r#"
module T
fn append-label(xs: java.util.List<Long>) -> java.util.List<Long | String> {
  return conj(xs, "label")
}
"#,
        );
        assert!(result.diagnostics.is_empty(), "{:#?}", result.diagnostics);
    }

    #[test]
    fn get_allows_disjoint_query_keys_and_returns_nullable_value() {
        let result = typing(
            r#"
module T
fn lookup(m: java.util.Map<String, Long>, key: Boolean) -> Long? {
  return get(m, key)
}
"#,
        );
        assert!(result.diagnostics.is_empty(), "{:#?}", result.diagnostics);
    }

    #[test]
    fn unknown_requires_explicit_checked_narrowing() {
        let unsafe_result = typing(
            r#"
module T
fn unsafe-use(value: Unknown) -> Long { return inc(value) }
"#,
        );
        assert!(unsafe_result
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("no `inc` signature")));

        let checked_result = typing(
            r#"
module T
fn checked-use(value: Unknown) -> String { return value as String }
"#,
        );
        assert!(
            checked_result.diagnostics.is_empty(),
            "{:#?}",
            checked_result.diagnostics
        );
    }

    #[test]
    fn dynamic_remains_explicit_unsound_escape_hatch() {
        let result = typing(
            r#"
module T
fn dynamic-use(value: Dynamic) -> Long { return inc(value) }
"#,
        );
        assert!(result.diagnostics.is_empty(), "{:#?}", result.diagnostics);
    }

    #[test]
    fn unknown_unqualified_jvm_type_is_diagnosed() {
        let result = typing(
            r#"
module T
fn typo(value: Strng) -> Strng { return value }
"#,
        );
        assert!(result
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("unknown JVM type `Strng`")));
    }

    #[test]
    fn map_infers_through_typed_callback_and_seqable_capability() {
        let result = typing(
            r#"
module Higher
fn double(value: Long) -> Long { return inc(inc(value)) }
fn double-all(values: java.util.List<Long>) -> clojure.lang.LazySeq<Long> {
  return map(double, values)
}
"#,
        );
        assert!(result.diagnostics.is_empty(), "{:#?}", result.diagnostics);
    }

    #[test]
    fn map_rejects_callback_with_wrong_element_type() {
        let result = typing(
            r#"
module Higher
fn string-size(value: String) -> Long { return count(value) }
fn invalid(values: java.util.List<Long>) -> clojure.lang.LazySeq<Long> {
  return map(string-size, values)
}
"#,
        );
        assert!(
            result
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.message.contains("no `map` signature")),
            "{:#?}",
            result.diagnostics
        );
    }

    #[test]
    fn reduce_with_init_correlates_accumulator_and_element_types() {
        let result = typing(
            r#"
module Higher
extern add = clojure.core/+(left: Long, right: Long) -> Long
fn add-values(left: Long, right: Long) -> Long { return add(left, right) }
fn total(values: java.util.List<Long>) -> Long {
  return reduce(add-values, 0, values)
}
"#,
        );
        assert!(result.diagnostics.is_empty(), "{:#?}", result.diagnostics);
    }

    #[test]
    fn fn_type_and_capability_annotations_round_trip() {
        let result = typing(
            r#"
module Higher
extern invoke<T, R>(f: Fn<(T) -> R>, value: T) -> R
fn use(f: Fn<(Long) -> String>, values: Seqable<Long>) -> String {
  return invoke(f, first(values) as Long)
}
"#,
        );
        assert!(result.diagnostics.is_empty(), "{:#?}", result.diagnostics);
        let function = &result.functions["use"];
        assert_eq!(
            result.table.display(function.params[0].1),
            "Fn<(java.lang.Long) -> java.lang.String>"
        );
        assert_eq!(
            result.table.display(function.params[1].1),
            "Seqable<java.lang.Long>"
        );
    }
}
