//! CLI: check, transpile, or watch `.rama` files.

use rama_syntax::{analyze, emit_clojure};
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
        "check" => {
            let Some(path) = args.get(1) else {
                eprintln!("{}", usage());
                return ExitCode::from(2);
            };
            check_file(path)
        }
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
        path => check_file(path),
    }
}

fn usage() -> &'static str {
    "usage:\n  rama-check <file.rama>\n  rama-check check <file.rama>\n  rama-check transpile <file.rama> [-o out.clj]\n  rama-check watch <dir-or-file> [-o out-dir]"
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

fn check_file(path: impl AsRef<Path>) -> ExitCode {
    let path = path.as_ref();
    let src = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("failed to read {}: {e}", path.display());
            return ExitCode::from(2);
        }
    };

    match analyze(&src) {
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

    match analyze(&src) {
        Ok((file, result)) if result.ok() => Ok(emit_clojure(&file)),
        Ok((_file, result)) => {
            for diagnostic in &result.diagnostics {
                eprintln!("{}", diagnostic.render(&src));
            }
            eprintln!("type-check: {} diagnostic(s)", result.diagnostics.len());
            Err(())
        }
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
