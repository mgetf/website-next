//! Every god-path module port must parse, type-check, and emit.
use rama_syntax::{analyze, emit_clojure, parse};
use std::fs;
use std::path::PathBuf;

fn fixtures() -> Vec<PathBuf> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures");
    let mut paths = fs::read_dir(&dir)
        .expect("fixtures dir")
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.ends_with("_v2.rama"))
        })
        .collect::<Vec<_>>();
    paths.sort();
    paths
}

#[test]
fn all_godpath_v2_ports_check_and_emit() {
    let paths = fixtures();
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
