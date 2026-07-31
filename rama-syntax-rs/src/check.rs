//! Semantic checks and Rama rule execution.

use std::collections::HashMap;

use crate::ast::{SourceFile, TypeExpr};
use crate::error::Diagnostic;
use crate::rama_ir::Program;
use crate::rules::check_program;
use crate::types;

#[derive(Debug, Clone, PartialEq)]
pub struct CheckResult {
    pub diagnostics: Vec<Diagnostic>,
}

impl CheckResult {
    pub fn ok(&self) -> bool {
        self.diagnostics.is_empty()
    }
}

#[derive(Debug, Clone, Default)]
pub struct TypeEnv {
    pub pstates: HashMap<String, TypeExpr>,
    pub structs: HashMap<String, Vec<(String, TypeExpr)>>,
}

impl TypeEnv {
    pub fn from_program(program: &Program<'_>) -> Self {
        let pstates = program
            .pstates
            .iter()
            .map(|(name, decl)| ((*name).to_string(), decl.ty.node.clone()))
            .collect();
        let structs = program
            .structs
            .iter()
            .map(|(name, decl)| {
                (
                    (*name).to_string(),
                    decl.fields
                        .iter()
                        .map(|field| (field.name.node.clone(), field.ty.node.clone()))
                        .collect(),
                )
            })
            .collect();
        Self { pstates, structs }
    }
}

pub fn check(file: &SourceFile) -> CheckResult {
    check_program_ir(&Program::from_ast(file))
}

pub fn check_program_ir(program: &Program<'_>) -> CheckResult {
    let mut diagnostics: Vec<Diagnostic> = check_program(program)
        .into_iter()
        .map(|violation| {
            Diagnostic::rule(
                violation.span,
                format!(
                    "[{}] {} — {} (because: {})",
                    violation.rule_id, violation.title, violation.message, violation.because
                ),
            )
        })
        .collect();
    diagnostics.extend(types::analyze(program).diagnostics);
    CheckResult { diagnostics }
}
