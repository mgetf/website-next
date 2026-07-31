//! CLI: check, transpile, or watch `.rama` files.

use rama_syntax::nrepl::{pin_observation, LiveOracle};
use rama_syntax::sexp;
use rama_syntax::{analyze, analyze_with_oracle, emit_clojure, transpile_source};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::thread;
use std::time::{Duration, SystemTime};

fn main() -> ExitCode {
    let args = env::args().skip(1).collect::<Vec<_>>();
    let Some(command) = args.first().map(String::as_str) else {
        eprintln!("{}", usage());
        return ExitCode::from(2);
    };

    match command {
        "check" => match parse_check_options(&args[1..]) {
            Ok((path, nrepl)) => check_file(&path, nrepl.as_deref()),
            Err(message) => {
                eprintln!("{message}\n{}", usage());
                ExitCode::from(2)
            }
        },
        "observe-call" => match parse_observe_options(&args[1..]) {
            Ok(options) => observe_call(options),
            Err(message) => {
                eprintln!("{message}\n{}", usage());
                ExitCode::from(2)
            }
        },
        "learn" => match parse_learn_options(&args[1..]) {
            Ok(options) => learn(options),
            Err(message) => {
                eprintln!("{message}\n{}", usage());
                ExitCode::from(2)
            }
        },
        "transpile" => match parse_path_and_output(&args[1..]) {
            Ok((path, output)) => transpile_file(&path, output.as_deref()),
            Err(message) => {
                eprintln!("{message}\n{}", usage());
                ExitCode::from(2)
            }
        },
        "watch" => match parse_path_and_output(&args[1..]) {
            Ok((path, output)) => watch_path(&path, output.as_deref()),
            Err(message) => {
                eprintln!("{message}\n{}", usage());
                ExitCode::from(2)
            }
        },
        "-h" | "--help" | "help" => {
            println!("{}", usage());
            ExitCode::SUCCESS
        }
        // Shorthand: `rama-check fixtures/foo.rama`
        path => check_file(Path::new(path), None),
    }
}

fn usage() -> &'static str {
    "usage:\n  rama-check <file.rama>\n  rama-check check <file.rama> [--nrepl HOST:PORT]\n  rama-check observe-call <file.rama> <var> --args '<edn-vector>' --nrepl HOST:PORT [--write]\n  rama-check learn <file.rama> --tape <violations-file> [--write]\n  rama-check learn <file.rama> --nrepl HOST:PORT --eval '<form>' [--write]\n  rama-check transpile <file.rama> [-o out.clj]\n  rama-check watch <dir-or-file> [-o out-dir]"
}

fn parse_check_options(args: &[String]) -> Result<(PathBuf, Option<String>), String> {
    let mut path = None;
    let mut nrepl = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--nrepl" => {
                nrepl = Some(
                    args.get(index + 1)
                        .ok_or_else(|| "missing value after --nrepl".to_string())?
                        .clone(),
                );
                index += 2;
            }
            value if value.starts_with('-') => return Err(format!("unknown option {value}")),
            value => {
                if path.replace(PathBuf::from(value)).is_some() {
                    return Err(format!("unexpected argument {value}"));
                }
                index += 1;
            }
        }
    }
    Ok((path.ok_or_else(|| "missing .rama path".to_string())?, nrepl))
}

struct ObserveOptions {
    path: PathBuf,
    var: String,
    args_edn: String,
    nrepl: String,
    write: bool,
}

fn parse_observe_options(args: &[String]) -> Result<ObserveOptions, String> {
    let path = args
        .first()
        .map(PathBuf::from)
        .ok_or_else(|| "observe-call requires a .rama file".to_string())?;
    let var = args
        .get(1)
        .cloned()
        .ok_or_else(|| "observe-call requires a Var name".to_string())?;
    let mut args_edn = None;
    let mut nrepl = None;
    let mut write = false;
    let mut index = 2;
    while index < args.len() {
        match args[index].as_str() {
            "--args" => {
                args_edn = Some(
                    args.get(index + 1)
                        .ok_or_else(|| "missing value after --args".to_string())?
                        .clone(),
                );
                index += 2;
            }
            "--nrepl" => {
                nrepl = Some(
                    args.get(index + 1)
                        .ok_or_else(|| "missing value after --nrepl".to_string())?
                        .clone(),
                );
                index += 2;
            }
            "--write" => {
                write = true;
                index += 1;
            }
            value => return Err(format!("unexpected observe-call option `{value}`")),
        }
    }
    Ok(ObserveOptions {
        path,
        var,
        args_edn: args_edn.ok_or_else(|| "observe-call requires --args".to_string())?,
        nrepl: nrepl.ok_or_else(|| "observe-call requires --nrepl".to_string())?,
        write,
    })
}

fn parse_path_and_output(args: &[String]) -> Result<(PathBuf, Option<PathBuf>), String> {
    let mut path = None;
    let mut output = None;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "-o" | "--output" => {
                let Some(value) = args.get(i + 1) else {
                    return Err("missing value after -o".to_string());
                };
                output = Some(PathBuf::from(value));
                i += 2;
            }
            value if value.starts_with('-') => {
                return Err(format!("unknown option {value}"));
            }
            value => {
                if path.is_some() {
                    return Err(format!("unexpected argument {value}"));
                }
                path = Some(PathBuf::from(value));
                i += 1;
            }
        }
    }

    path.map(|path| (path, output))
        .ok_or_else(|| "missing .rama path".to_string())
}

fn check_file(path: &Path, nrepl: Option<&str>) -> ExitCode {
    let src = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("failed to read {}: {e}", path.display());
            return ExitCode::from(2);
        }
    };

    if sexp::looks_like_sexp(&src) {
        return match sexp::parse_document(&src) {
            Ok(doc) => {
                println!(
                    "sexp-mode: parsed {} top-level form(s) from {}",
                    doc.forms.len(),
                    path.display()
                );
                ExitCode::SUCCESS
            }
            Err(err) => {
                for d in &err.diagnostics {
                    eprintln!("{}", d.render(&src));
                }
                ExitCode::from(1)
            }
        };
    }

    let oracle = match nrepl {
        Some(address) => match LiveOracle::connect(address) {
            Ok(oracle) => Some(oracle),
            Err(error) => {
                eprintln!("failed to connect to nREPL at {address}: {error}");
                return ExitCode::from(2);
            }
        },
        None => None,
    };
    let analysis = match &oracle {
        Some(oracle) => analyze_with_oracle(&src, oracle),
        None => analyze(&src),
    };

    match analysis {
        Ok((file, result)) => {
            println!(
                "parsed {} item(s) from {path}",
                file.items.len(),
                path = path.display()
            );
            if result.ok() {
                println!("type-check: ok");
                ExitCode::SUCCESS
            } else {
                for d in &result.diagnostics {
                    eprintln!("{}", d.render(&src));
                }
                eprintln!("type-check: {} diagnostic(s)", result.diagnostics.len());
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

struct LearnOptions {
    path: PathBuf,
    tape: Option<PathBuf>,
    nrepl: Option<String>,
    eval_forms: Vec<String>,
    write: bool,
}

fn parse_learn_options(args: &[String]) -> Result<LearnOptions, String> {
    let path = args
        .first()
        .map(PathBuf::from)
        .ok_or_else(|| "learn requires a .rama file".to_string())?;
    let mut tape = None;
    let mut nrepl = None;
    let mut eval_forms = Vec::new();
    let mut write = false;
    let mut index = 1;
    while index < args.len() {
        match args[index].as_str() {
            "--tape" => {
                tape = Some(PathBuf::from(
                    args.get(index + 1)
                        .ok_or_else(|| "missing value after --tape".to_string())?,
                ));
                index += 2;
            }
            "--nrepl" => {
                nrepl = Some(
                    args.get(index + 1)
                        .ok_or_else(|| "missing value after --nrepl".to_string())?
                        .clone(),
                );
                index += 2;
            }
            "--eval" => {
                eval_forms.push(
                    args.get(index + 1)
                        .ok_or_else(|| "missing value after --eval".to_string())?
                        .clone(),
                );
                index += 2;
            }
            "--write" => {
                write = true;
                index += 1;
            }
            value => return Err(format!("unexpected learn option `{value}`")),
        }
    }
    if tape.is_none() && (nrepl.is_none() || eval_forms.is_empty()) {
        return Err("learn requires either --tape, or --nrepl plus --eval".to_string());
    }
    Ok(LearnOptions {
        path,
        tape,
        nrepl,
        eval_forms,
        write,
    })
}

fn learn(options: LearnOptions) -> ExitCode {
    let source = match fs::read_to_string(&options.path) {
        Ok(source) => source,
        Err(error) => {
            eprintln!("failed to read {}: {error}", options.path.display());
            return ExitCode::from(2);
        }
    };
    let file = match rama_syntax::parse(&source) {
        Ok(file) => file,
        Err(error) => {
            for diagnostic in &error.diagnostics {
                eprintln!("{}", diagnostic.render(&source));
            }
            return ExitCode::from(1);
        }
    };

    let tape_contents = if let Some(tape) = &options.tape {
        match fs::read_to_string(tape) {
            Ok(contents) => contents,
            Err(error) => {
                eprintln!("failed to read tape {}: {error}", tape.display());
                return ExitCode::from(2);
            }
        }
    } else {
        match drive_reproduction(&options, &file, &source) {
            Ok(contents) => contents,
            Err(message) => {
                eprintln!("{message}");
                return ExitCode::from(1);
            }
        }
    };

    let violations = rama_syntax::learn::parse_tape(&tape_contents);
    if violations.is_empty() {
        println!("no contract violations recorded; nothing to learn");
        return ExitCode::SUCCESS;
    }
    let suggestions = rama_syntax::learn::analyze_tape(&source, &file, &violations);
    for suggestion in &suggestions {
        println!("{}", suggestion.message);
    }
    if options.write {
        let (updated, applied) = rama_syntax::learn::apply_fixes(&source, &suggestions);
        if applied > 0 {
            if let Err(error) = fs::write(&options.path, &updated) {
                eprintln!("failed to write {}: {error}", options.path.display());
                return ExitCode::from(2);
            }
            println!(
                "applied {applied} fix(es) to {}; re-run check to surface any newly visible static errors",
                options.path.display()
            );
        } else {
            println!("no mechanical fixes to apply");
        }
    }
    ExitCode::SUCCESS
}

/// Transpile, load into the connected runtime, point the contract tape at a
/// scratch file, run the reproduction forms, and return the recorded tape.
fn drive_reproduction(
    options: &LearnOptions,
    file: &rama_syntax::SourceFile,
    source: &str,
) -> Result<String, String> {
    let address = options.nrepl.as_deref().expect("nrepl checked by parser");
    let oracle =
        LiveOracle::connect(address).map_err(|error| format!("nREPL connect failed: {error}"))?;

    let module_name = file
        .items
        .iter()
        .find_map(|item| match item {
            rama_syntax::ast::Item::Module(module) => Some(module.name.node.clone()),
            _ => None,
        })
        .ok_or_else(|| "source has no module declaration".to_string())?;

    let (_, result) = analyze(source).map_err(|error| error.to_string())?;
    if !result.ok() {
        return Err("fix static diagnostics before learn's drive mode".to_string());
    }

    let scratch = env::temp_dir().join(format!("rama-learn-{}", std::process::id()));
    fs::create_dir_all(&scratch).map_err(|error| error.to_string())?;
    let clj_path = scratch.join(format!("{module_name}.clj"));
    let tape_path = scratch.join("contract-tape.tsv");
    let _ = fs::remove_file(&tape_path);
    fs::write(&clj_path, emit_clojure(file)).map_err(|error| error.to_string())?;

    let load = format!(
        "(load-file {})",
        clj_string(&clj_path.display().to_string())
    );
    oracle
        .eval(&load)
        .map_err(|error| format!("loading generated namespace failed: {error}"))?;
    let arm_tape = format!(
        "(reset! (deref (resolve (symbol {}))) {})",
        clj_string(&format!("{module_name}/__rama_tape")),
        clj_string(&tape_path.display().to_string())
    );
    oracle
        .eval(&arm_tape)
        .map_err(|error| format!("arming the contract tape failed: {error}"))?;

    for form in &options.eval_forms {
        let wrapped = format!(
            "(try {form} :__rama-ok (catch Exception __rama-error (.getMessage __rama-error)))"
        );
        oracle
            .eval(&wrapped)
            .map_err(|error| format!("reproduction form failed: {error}"))?;
    }

    Ok(fs::read_to_string(&tape_path).unwrap_or_default())
}

fn clj_string(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn observe_call(options: ObserveOptions) -> ExitCode {
    let oracle = match LiveOracle::connect(&options.nrepl) {
        Ok(oracle) => oracle,
        Err(error) => {
            eprintln!("failed to connect to nREPL at {}: {error}", options.nrepl);
            return ExitCode::from(2);
        }
    };
    let observation = match oracle.observe_call(&options.var, &options.args_edn) {
        Ok(observation) => observation,
        Err(error) => {
            eprintln!("observe-call failed: {error}");
            return ExitCode::from(1);
        }
    };
    let declaration = observation.extern_declaration();
    println!("{declaration}");
    if options.write {
        let mut source = match fs::read_to_string(&options.path) {
            Ok(source) => source,
            Err(error) => {
                eprintln!("failed to read {}: {error}", options.path.display());
                return ExitCode::from(2);
            }
        };
        let (updated, changed) = pin_observation(&source, &observation);
        if !changed {
            println!("already pinned in {}", options.path.display());
            return ExitCode::SUCCESS;
        }
        source = updated;
        if let Err(error) = fs::write(&options.path, source) {
            eprintln!("failed to write {}: {error}", options.path.display());
            return ExitCode::from(2);
        }
        println!("pinned observation in {}", options.path.display());
    }
    ExitCode::SUCCESS
}

fn transpile_file(path: &Path, output: Option<&Path>) -> ExitCode {
    match transpile_source_file(path) {
        Ok(clj) => {
            if let Some(output) = output {
                if let Err(err) = write_file(output, &clj) {
                    eprintln!("failed to write {}: {err}", output.display());
                    return ExitCode::from(2);
                }
            } else {
                print!("{clj}");
            }
            ExitCode::SUCCESS
        }
        Err(()) => ExitCode::from(1),
    }
}

fn transpile_source_file(path: &Path) -> Result<String, ()> {
    let src = fs::read_to_string(path).map_err(|err| {
        eprintln!("failed to read {}: {err}", path.display());
    })?;

    match transpile_source(&src) {
        Ok(clj) => Ok(clj),
        Err(err) => {
            for diagnostic in &err.diagnostics {
                eprintln!("{}", diagnostic.render(&src));
            }
            Err(())
        }
    }
}

fn watch_path(path: &Path, output_dir: Option<&Path>) -> ExitCode {
    let root = path.to_path_buf();
    let mut mtimes = HashMap::new();

    println!("watching {} for .rama changes", root.display());
    if let Err(err) = compile_changed_files(&root, output_dir, &mut mtimes, true) {
        eprintln!("{err}");
        return ExitCode::from(2);
    }

    loop {
        if let Err(err) = compile_changed_files(&root, output_dir, &mut mtimes, false) {
            eprintln!("{err}");
        }
        thread::sleep(Duration::from_millis(750));
    }
}

fn compile_changed_files(
    root: &Path,
    output_dir: Option<&Path>,
    mtimes: &mut HashMap<PathBuf, SystemTime>,
    force: bool,
) -> Result<(), String> {
    let files = collect_rama_files(root)?;
    let mut seen = HashMap::new();

    for file in files {
        let modified = file
            .metadata()
            .and_then(|metadata| metadata.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        seen.insert(file.clone(), modified);

        if !force && mtimes.get(&file).is_some_and(|old| *old == modified) {
            continue;
        }

        let output = watch_output_path(root, &file, output_dir);
        match transpile_source_file(&file) {
            Ok(clj) => match write_file(&output, &clj) {
                Ok(()) => println!("transpiled {} -> {}", file.display(), output.display()),
                Err(err) => eprintln!("failed to write {}: {err}", output.display()),
            },
            Err(()) => eprintln!("transpile failed for {}", file.display()),
        }
    }

    mtimes.retain(|path, _| seen.contains_key(path));
    for (path, modified) in seen {
        mtimes.insert(path, modified);
    }
    Ok(())
}

fn collect_rama_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    if root.is_file() {
        return Ok(if is_rama_file(root) {
            vec![root.to_path_buf()]
        } else {
            Vec::new()
        });
    }

    if !root.is_dir() {
        return Err(format!("{} is not a file or directory", root.display()));
    }

    let mut out = Vec::new();
    collect_rama_files_rec(root, &mut out)?;
    out.sort();
    Ok(out)
}

fn collect_rama_files_rec(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in
        fs::read_dir(dir).map_err(|err| format!("failed to read {}: {err}", dir.display()))?
    {
        let entry = entry.map_err(|err| format!("failed to read directory entry: {err}"))?;
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().and_then(|name| name.to_str());
            if matches!(name, Some("target" | "out" | ".git")) {
                continue;
            }
            collect_rama_files_rec(&path, out)?;
        } else if is_rama_file(&path) {
            out.push(path);
        }
    }
    Ok(())
}

fn is_rama_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext == "rama")
}

fn watch_output_path(root: &Path, source: &Path, output_dir: Option<&Path>) -> PathBuf {
    let mut relative = if root.is_dir() {
        source.strip_prefix(root).unwrap_or(source).to_path_buf()
    } else {
        source
            .file_name()
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("out.rama"))
    };
    relative.set_extension("clj");

    match output_dir {
        Some(output_dir) => output_dir.join(relative),
        None => source.with_extension("clj"),
    }
}

fn write_file(path: &Path, contents: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, contents)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }

    #[test]
    fn parses_check_nrepl_option() {
        let (path, nrepl) =
            parse_check_options(&strings(&["fixture.rama", "--nrepl", "127.0.0.1:7888"])).unwrap();
        assert_eq!(path, PathBuf::from("fixture.rama"));
        assert_eq!(nrepl.as_deref(), Some("127.0.0.1:7888"));
    }

    #[test]
    fn parses_observe_write_options() {
        let options = parse_observe_options(&strings(&[
            "fixture.rama",
            "clojure.core/vec",
            "--args",
            "[[1 2]]",
            "--nrepl",
            "localhost:7888",
            "--write",
        ]))
        .unwrap();
        assert_eq!(options.var, "clojure.core/vec");
        assert_eq!(options.args_edn, "[[1 2]]");
        assert!(options.write);
    }
}
