//! Static, user-facing rules over semantic `.rama` IR.
//!
//! Target-emission invariants belong in `clj_verify`, not here.

mod engine;
mod rama;

pub use engine::{Engine, Violation};
pub use rama::rama_engine;

use crate::rama_ir::Program;

pub fn check_program(program: &Program<'_>) -> Vec<Violation> {
    rama_engine().check(program)
}
