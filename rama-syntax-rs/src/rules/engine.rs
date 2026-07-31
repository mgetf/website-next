//! Tiny rules engine over semantic Rama IR.

use crate::rama_ir::Program;
use crate::span::Span;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Violation {
    pub rule_id: &'static str,
    pub title: &'static str,
    pub message: String,
    pub because: &'static str,
    pub span: Span,
}

/// One static check over a semantic `.rama` program.
pub trait Rule: Send + Sync {
    fn id(&self) -> &'static str;
    fn title(&self) -> &'static str;
    fn because(&self) -> &'static str;
    fn check(&self, program: &Program<'_>) -> Vec<Violation>;
}

pub struct Engine {
    rules: Vec<Box<dyn Rule>>,
}

impl Engine {
    pub fn new(rules: Vec<Box<dyn Rule>>) -> Self {
        Self { rules }
    }

    pub fn check(&self, program: &Program<'_>) -> Vec<Violation> {
        let mut out = Vec::new();
        for rule in &self.rules {
            out.extend(rule.check(program));
        }
        out
    }
}

impl Violation {
    pub fn new(rule: &dyn Rule, span: Span, message: impl Into<String>) -> Self {
        Self {
            rule_id: rule.id(),
            title: rule.title(),
            message: message.into(),
            because: rule.because(),
            span,
        }
    }

    pub fn render(&self) -> String {
        format!(
            "[{}] {}: {}\n  because: {}",
            self.rule_id, self.title, self.message, self.because
        )
    }
}
