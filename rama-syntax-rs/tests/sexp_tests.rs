//! Sexp-mode `.rama` tests under rama/test must parse through the Form IR.
use rama_syntax::sexp;
use std::fs;
use std::path::PathBuf;

#[test]
fn all_rama_tests_parse_as_sexp() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("rama/test/mge/tf/rama");
    let mut paths = fs::read_dir(&dir)
        .unwrap_or_else(|err| panic!("rama test dir {}: {err}", dir.display()))
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|e| e.to_str()) == Some("rama"))
        .collect::<Vec<_>>();
    paths.sort();
    assert!(
        paths.len() >= 11,
        "expected module tests, got {}",
        paths.len()
    );

    for path in paths {
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        let source = fs::read_to_string(&path).expect(&name);
        assert!(sexp::looks_like_sexp(&source), "{name} should be sexp-mode");
        let doc = sexp::parse_document(&source).unwrap_or_else(|err| {
            panic!(
                "{name} sexp parse failed: {:?}",
                err.diagnostics
                    .iter()
                    .map(|d| &d.message)
                    .collect::<Vec<_>>()
            )
        });
        let rendered = doc.render();
        assert!(rendered.contains("(ns "), "{name} should emit an ns form");
        assert!(rendered.contains("(deftest "), "{name} should emit deftest");
    }
}
