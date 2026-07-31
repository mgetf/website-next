//! CLI: parse a `.rama` file and print type-checker diagnostics.

use rama_syntax::analyze;
use std::env;
use std::fs;
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut args = env::args().skip(1);
    let Some(path) = args.next() else {
        eprintln!("usage: rama-check <file.rama>");
        return ExitCode::from(2);
    };

    let src = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("failed to read {path}: {e}");
            return ExitCode::from(2);
        }
    };

    match analyze(&src) {
        Ok((file, result)) => {
            println!(
                "parsed {} item(s) from {path}",
                file.items.len()
            );
            if result.ok() {
                println!("type-check: ok");
                ExitCode::SUCCESS
            } else {
                for d in &result.diagnostics {
                    eprintln!("{}", d.render(&src));
                }
                eprintln!(
                    "type-check: {} diagnostic(s)",
                    result.diagnostics.len()
                );
                ExitCode::from(1)
            }
        }
        Err(err) => {
            for d in &err.diagnostics {
                eprintln!("{}", d.render(&src));
            }
            ExitCode::from(1)
        }
    }
}
