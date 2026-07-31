//! Every module `.rama` under rama/src must parse, type-check, and emit.
use rama_syntax::{analyze, emit_clojure, parse};
use std::fs;
use std::path::PathBuf;

fn module_sources() -> Vec<PathBuf> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("rama/src/mge/tf/rama");
    let mut paths = fs::read_dir(&dir)
        .unwrap_or_else(|err| panic!("rama module dir {}: {err}", dir.display()))
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext == "rama")
        })
        .collect::<Vec<_>>();
    paths.sort();
    paths
}

#[test]
fn all_rama_modules_check_and_emit() {
    let paths = module_sources();
    assert!(
        paths.len() >= 12,
        "expected the full god-path module set, got {}",
        paths.len()
    );

    for path in paths {
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        let source = fs::read_to_string(&path).unwrap_or_else(|err| panic!("{name}: {err}"));
        let file = parse(&source).unwrap_or_else(|err| {
            panic!(
                "{name} parse failed: {:?}",
                err.diagnostics
                    .iter()
                    .map(|d| &d.message)
                    .collect::<Vec<_>>()
            )
        });
        let (_file, typing) = analyze(&source).expect("analyze parse");
        assert!(
            typing.ok(),
            "{name} type-check failed: {:?}",
            typing
                .diagnostics
                .iter()
                .map(|d| &d.message)
                .collect::<Vec<_>>()
        );
        let clj = emit_clojure(&file);
        assert!(clj.contains("(defmodule "), "{name} emit missing defmodule");
        assert!(
            clj.contains("(<<switch "),
            "{name} emit should use flat <<switch dispatch"
        );
    }
}
